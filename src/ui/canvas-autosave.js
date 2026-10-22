// Store serializable edits, so recovery can reapply only the user's changes to a
// newer canvas without overwriting unrelated edits from another page.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function canvasDelta(before, after) {
  return Object.fromEntries(['items', 'zones'].map(field => {
    const key = field === 'items' ? 'id' : 'name', previous = new Map(before[field].map(v => [v[key], v]));
    const next = new Map(after[field].map(v => [v[key], v]));
    return [field, { removed: [...previous.keys()].filter(id => !next.has(id)), changes: [...next].flatMap(([id, value]) => {
      const old = previous.get(id);
      if (!old) return [{ id, add: value }];
      const set = Object.fromEntries(Object.entries(value).filter(([k, v]) => !same(old[k], v)));
      const unset = Object.keys(old).filter(k => !(k in value));
      return Object.keys(set).length || unset.length ? [{ id, set, unset, fallback: value }] : [];
    }) }];
  }));
}
export function applyCanvasDelta(value, delta) {
  return Object.fromEntries(['items', 'zones'].map(field => {
    const key = field === 'items' ? 'id' : 'name', { removed, changes } = delta[field];
    const rows = value[field].filter(v => !removed.includes(v[key])).map(v => ({ ...v }));
    for (const change of changes) {
      const index = rows.findIndex(v => v[key] === change.id);
      if (change.add) { if (index < 0) rows.push(structuredClone(change.add)); }
      else if (index >= 0) { Object.assign(rows[index], change.set); for (const k of change.unset) delete rows[index][k]; }
      else if (change.fallback) rows.push(structuredClone(change.fallback)); // Keep a conflicting local draft visible.
    }
    return [field, rows];
  }));
}

export function createCanvasAutosave({ initial, send, read, operation, receipt, journal, makeId = () => crypto.randomUUID() }) {
  let base = initial, queue = [], running = null, loading = true, error = '', canRetry = false, storageError = false, blocked = false, journalLoaded = false, canDiscard = false;
  let persistence = Promise.resolve();
  const listeners = new Set();
  const value = () => queue.reduce((v, job) => applyCanvasDelta(v, job.delta), base.value);
  const state = () => ({ value: value(), busy: loading || !!running, error, canRetry, canDiscard, warning: base.warning || '', locked: loading || !!error, pending: queue.length });
  const emit = message => { for (const fn of listeners) fn(state(), message); };
  function persist() {
    const saved = queue.length ? structuredClone({ base, queue }) : null;
    persistence = persistence.then(() => journal.write(saved)).then(() => { storageError = false; }, () => { storageError = true; });
    return persistence;
  }
  const retained = () => storageError ? '草稿暂时仅保留在当前窗口，请完成保存后再刷新或关闭。' : '草稿已保留，切换页面后可继续；请重新读取核对。';
  const missingChanges = job => job && ['items','zones'].flatMap(field => {
    const key=field==='items'?'id':'name';
    return job.delta[field].changes.filter(c=>!c.add && !base.value[field].some(v=>v[key]===c.id));
  });
  async function loadJournal() {
    const stored = await journal.read(); journalLoaded = true; storageError = false;
    if (stored?.base?.value && Array.isArray(stored.queue) && stored.queue.length) { base = stored.base; queue = stored.queue; }
  }
  async function reconcile() {
    const job = queue[0];
    if (job?.body) {
      const result = await operation(job.id);
      if (result.status === 'pending') throw Error('上次保存仍在处理中，请稍后再次核对');
      if (result.status === 'saved') queue.shift();
    }
    base = await read();
    for (const pending of queue) { pending.body = null; pending.id = makeId(); }
    await persist();
    const missing = missingChanges(queue[0]);
    canDiscard = queue.length > 0; canRetry = canDiscard && !missing?.length; blocked = canDiscard;
    error = missing?.length ? '另一页面已删除正在修改的图片或分组，本地草稿仍保留。请核对后移除这一项草稿；不会重新创建或覆盖已保存内容。'
      : canRetry ? `已恢复 ${queue.length} 项草稿，点击继续保存即可完成。${storageError ? retained() : ''}` : '';
  }
  const ready = Promise.resolve().then(async () => {
    try {
      await loadJournal();
      if (queue.length) await reconcile();
    } catch (e) {
      blocked = true;
      error = journalLoaded ? `${e.message}。${retained()}` : '本机草稿尚未读回，已暂停编辑以免覆盖旧草稿。请重新读取核对。';
    }
  }).finally(() => { loading = false; emit(); });
  async function drain() {
    await ready;
    while (queue.length && !blocked) {
      const job = queue[0];
      if (missingChanges(job)?.length) { blocked = true; error = '图片或分组已被其他页面删除，草稿仍保留，请重新读取核对。'; emit(); break; }
      job.body ||= { value: applyCanvasDelta(base.value, job.delta), baseRevision: base.revision, requestId: job.id };
      await persist();
      try {
        let saved;
        try { saved = await send(job.body); }
        catch (e) { if (e.status && e.status < 500) throw e; saved = await receipt(job.id); if (!saved) throw e; }
        const back = await read();
        if (back.revision !== saved.revision) throw Error('内容已在其他页面变化，请重新读取后继续');
        base = back; queue.shift(); await persist(); emit(job.message);
      } catch (e) { blocked = true; error = `${e.message}。${retained()}`; emit(); }
    }
  }
  const flush = () => {
    if (!running) { running = drain().finally(() => { running = null; emit(); }); emit(); }
    return running;
  };
  return {
    state, ready,
    subscribe(fn) { listeners.add(fn); fn(state()); return () => listeners.delete(fn); },
    change(apply, message = '') {
      if (loading || blocked) return;
      const before = value(), after = apply(structuredClone(before));
      if (same(before, after)) return;
      queue.push({ id: makeId(), delta: canvasDelta(before, after), body: null, message });
      void persist(); emit(); void flush();
    },
    async reread() {
      if (running || loading) return;
      loading = true; canRetry = false; canDiscard = false; emit();
      try { if (!journalLoaded) await loadJournal(); await reconcile(); } catch (e) { blocked = true; error = `${e.message}。${retained()}`; }
      finally { loading = false; emit(); }
    },
    retry() { if (!canRetry) return; blocked = false; canRetry = false; canDiscard = false; error = ''; return flush(); },
    async discard() {
      // Only a reconciled, unsubmitted job can be discarded. Unknown writes stay locked.
      if (!canDiscard || running || loading) return;
      queue.shift(); canDiscard = false; canRetry = false; loading = true; emit();
      try { await persist(); await reconcile(); }
      catch (e) { blocked = true; error = `${e.message}。${retained()}`; }
      finally { loading = false; emit(); }
    },
    flush,
    dismissWarning() { base = { ...base, warning: '' }; emit(); },
  };
}

// The editors outlive individual routes, including when browser storage fails.
export function protectCanvasDrafts(editors, target) {
  const leave = event => {
    if ([...editors.values()].some(editor => editor.state().pending)) { event.preventDefault(); event.returnValue = ''; }
  };
  target.addEventListener('beforeunload', leave);
  return () => target.removeEventListener('beforeunload', leave);
}
