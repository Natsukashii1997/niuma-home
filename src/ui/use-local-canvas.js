import { useEffect, useRef, useState } from "react";
import { apiSend } from "../api.js";
import { createCanvasAutosave, protectCanvasDrafts } from './canvas-autosave.js';
import { canvasJournal, canvasJournalOwner } from './canvas-journal.js';

// Retain failed drafts even if storage is unavailable and a page is unmounted.
const editors = new Map();
const releaseDraftGuard = protectCanvasDrafts(editors, window);
if (import.meta.hot) import.meta.hot.dispose(releaseDraftGuard);
export function useLocalCanvas(initial, endpoint, onNotice) {
  const notify = useRef(onNotice); notify.current = onNotice;
  const controller = useRef(null);
  const [state, setState] = useState({ value: initial.value, busy: true, error: '', canRetry: false, warning: initial.warning || '', locked: true });
  useEffect(() => {
    let alive = true, unsub = () => {};
    canvasJournalOwner().then(id => {
      if (!alive) return;
      const key = `${id}:${endpoint}`;
      let editor = editors.get(key);
      if (!editor || !editor.state().pending && !editor.state().busy) {
        editor = createCanvasAutosave({ initial, journal: canvasJournal(key),
          send: body => apiSend('PUT', endpoint, body), read: () => apiSend('GET', `${endpoint}/state`),
          operation: id => apiSend('GET', `${endpoint}/operations/${id}`), receipt: id => apiSend('GET', `${endpoint}/saves/${id}`) });
        editors.set(key, editor);
      }
      controller.current = editor;
      unsub = editor.subscribe((next, message) => { setState(next); if (message) notify.current?.(message); });
    });
    return () => { alive = false; unsub(); };
  }, [endpoint]);
  return { ...state, change: (...args) => controller.current?.change(...args), reread: () => controller.current?.reread(), retry: () => controller.current?.retry(), discard: () => controller.current?.discard(), dismissWarning: () => controller.current?.dismissWarning() };
}
