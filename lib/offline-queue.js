"use client";
/** IndexedDB queue for adds made without signal — replayed on reconnect (plan P1.7).
 *  Rows carry a client-generated id, so replays are idempotent (upsert), and flush()
 *  is single-flight so a flapping connection can't double-send.
 *  A queued item may carry a photo: { photo: { bucket, path, file } } — Files are structured-cloneable,
 *  so the picture waits in IndexedDB with the row and is uploaded first on replay. */
import { uploadPhoto } from "./photos";

const DB = "duo-offline", STORE = "queue";

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx(db, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error);
  });
}
export async function enqueue(item) {
  try {
    if (item.row && !item.row.id) item.row.id = crypto.randomUUID();
    const db = await openDb();
    await tx(db, "readwrite", (s) => s.add({ ...item, queued_at: Date.now() }));
    window.dispatchEvent(new Event("duo-queue-change"));
    return true;
  } catch (e) { console.warn("offline queue unavailable", e); return false; }
}
export async function queued() {
  try {
    const db = await openDb();
    return (await new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })) || [];
  } catch { return []; }
}
/** Drop everything (sign-out on a shared device — the next person must not replay someone else's rows). */
export async function clearQueue() {
  try { const db = await openDb(); await tx(db, "readwrite", (s) => s.clear()); window.dispatchEvent(new Event("duo-queue-change")); } catch {}
}

const isDuplicate = (e) => e?.code === "23505";
/** definitely rejected by the server (constraint / RLS / bad shape) — retrying will never help */
const isPermanent = (e) => !!e?.code && /^(22|23|42|PGRST1)/.test(String(e.code));

let inFlight = null;
export async function flush(supabase) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let sent = 0, dropped = 0;
    try {
      const items = await queued();
      if (!items.length) return { sent, dropped };
      const db = await openDb();
      for (const it of items) {
        // a photo that waited with the row goes up first; only a network failure keeps the item queued
        if (it.photo?.file && !it.row.photo_path) {
          try { it.row.photo_path = await uploadPhoto(supabase, it.photo.bucket, it.photo.path, it.photo.file); }
          catch (e) {
            if (isNetworkError(e)) break;
            console.warn("queued photo rejected — sending the moment without it", e); // bad file / policy: keep the words, lose the picture
          }
          await tx(db, "readwrite", (s) => s.put({ ...it, photo: null }));
        }
        // upsert on the client-generated id: a replay of a row that actually reached the server is a no-op
        const { error } = await supabase.from(it.table).upsert(it.row, { onConflict: "id", ignoreDuplicates: true });
        if (!error || isDuplicate(error)) { await tx(db, "readwrite", (s) => s.delete(it.id)); sent++; continue; }
        if (isPermanent(error)) { console.warn("queued row rejected", error); await tx(db, "readwrite", (s) => s.delete(it.id)); dropped++; continue; }
        break; // network / unknown / transient — keep everything and try again later
      }
    } catch (e) { console.warn("flush failed", e); }
    finally { inFlight = null; window.dispatchEvent(new Event("duo-queue-change")); }
    return { sent, dropped };
  })();
  return inFlight;
}
/** Transport-level failures only. A Postgres/PostgREST error carries a `code`; a message that merely
 *  contains "failed" is not evidence of a network problem. */
export const isNetworkError = (e) => !e?.code && /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|abort/i.test(String(e?.message || e));
