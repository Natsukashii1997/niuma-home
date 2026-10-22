// IndexedDB can retain pasted images larger than the browser's localStorage
// quota. Each live tab owns its journal; browser locks distinguish cloned tabs.
let owner, database;
export function canvasJournalOwner() {
  return owner ||= new Promise(resolve => {
    let previous;
    try { previous = sessionStorage.getItem('workdesk:canvas-tab'); } catch { /* Private-mode fallback. */ }
    const claim = id => {
      const accept = () => { try { sessionStorage.setItem('workdesk:canvas-tab', id); } catch { /* The in-memory editor still survives internal navigation. */ } resolve(id); };
      if (!navigator.locks) { accept(); return; }
      navigator.locks.request(`workdesk:canvas-journal:${id}`, { ifAvailable: true }, lock => {
        if (!lock) { claim(crypto.randomUUID()); return; }
        accept(); return new Promise(() => {}); // released by the browser on tab close/reload
      }).catch(() => accept());
    };
    claim(previous || crypto.randomUUID());
  });
}
const db = () => database ||= new Promise((resolve, reject) => {
  const request = indexedDB.open('workdesk-canvas-drafts', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => { database = null; reject(request.error); };
  request.onblocked = () => { database = null; reject(Error('草稿存储被其他窗口占用')); };
});
export function canvasJournal(key) {
  const access = async (write, value) => {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('drafts', write ? 'readwrite' : 'readonly'), store = tx.objectStore('drafts');
      const request = write ? value === null ? store.delete(key) : store.put(value, key) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('草稿存储不可用'));
    });
  };
  return { read: () => access(false), write: value => access(true, value) };
}
