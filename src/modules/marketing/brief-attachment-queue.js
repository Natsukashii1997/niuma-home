// A single queue belongs to the whole Brief, not the visible attachment section.
// Export/copy waits for file reads, local writes and the read-back check.
export function createBriefAttachmentQueue({ read, preview, removePreview, confirm, onChanged }) {
  let items = [], jobs = [], running = null, loading = true, error = '', notice = '', locked = false;
  let changed = onChanged;
  const listeners = new Set();
  const state = () => ({ items, pending: jobs.map(j => ({ name: j.name, kind: j.kind })), busy: loading || !!running, error, notice, locked });
  const emit = () => { for (const fn of listeners) fn(state()); };
  const ready = Promise.resolve().then(read).then(back => { items = back.items; }, e => { error = e.message; }).finally(() => { loading = false; emit(); });
  const matches = job => job.kind === 'remove' ? !items.some(a => a.id === job.id) : items.some(a => a.id === job.pv?.value.id && a.sha256 === job.pv.value.sha256);
  async function drain() {
    await ready;
    if (error) throw Error(error);
    while (jobs.length) {
      const job = jobs[0];
      if (!job.pv) job.pv = job.kind === 'remove' ? await removePreview(job.id) : await preview({ name: job.name, dataUrl: await job.data() });
      job.submitted = true;
      try { await confirm({ previewId: job.pv.previewId, confirm: true }); }
      catch (e) {
        // Never create another upload after an uncertain response. Reconcile
        // using the original ID, then retain this same preview for recovery.
        let checked = false;
        try { items = (await read()).items; checked = true; } catch { /* Keep the pending job. */ }
        if (!checked || !matches(job)) {
          if (checked && e.status && e.status < 500) { job.submitted = false; job.pv = null; }
          throw e;
        }
      }
      items = (await read()).items;
      if (!matches(job)) throw Error('附件保存结果尚未核对');
      jobs.shift(); notice = job.kind === 'remove' ? `已删除附件「${job.name}」` : `已保存附件「${job.name}」`;
      emit(); Promise.resolve(changed?.()).catch(() => {});
    }
    return items;
  }
  const flush = () => {
    if (!running) {
      running = Promise.resolve().then(drain).catch(e => { error = e.message; throw e; }).finally(() => { running = null; emit(); });
      emit();
    }
    return running;
  };
  const enqueue = job => { if (error || locked) return; jobs.push(job); notice = ''; emit(); void flush().catch(() => {}); };
  return {
    state, ready, flush,
    setLocked(value) { locked = !!value; emit(); },
    setOnChanged(fn) { changed = fn; },
    subscribe(fn) { listeners.add(fn); fn(state()); return () => listeners.delete(fn); },
    upload(name, data) { enqueue({ kind: 'upload', name, data }); },
    remove(item) { enqueue({ kind: 'remove', id: item.id, name: item.name }); },
    async recover() {
      if (running) return;
      try {
        items = (await read()).items;
        const job = jobs[0];
        if (job?.submitted && matches(job)) { jobs.shift(); Promise.resolve(changed?.()).catch(() => {}); }
        error = ''; emit(); return await flush();
      } catch (e) { error = e.message; emit(); throw e; }
    },
    discard() {
      // An uncertain write must be reconciled, not discarded and re-uploaded.
      if (running || jobs[0]?.submitted) return;
      jobs.shift(); error = ''; emit(); void flush().catch(() => {});
    },
    canDiscard: () => !!jobs.length && !jobs[0].submitted,
    clearNotice() { notice = ''; emit(); },
  };
}

// Remains active when the Brief page is unmounted but its pending queue is kept.
export function protectBriefAttachmentQueues(queues, target) {
  const leave = event => {
    if ([...queues.values()].some(queue => queue.state().pending.length)) { event.preventDefault(); event.returnValue = ''; }
  };
  target.addEventListener('beforeunload', leave);
  return () => target.removeEventListener('beforeunload', leave);
}
