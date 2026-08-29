"use client";
import imageCompression from "browser-image-compression";

const cache = new Map(); // `${bucket}/${path}` → { url, exp }

export async function signedUrl(supabase, bucket, path, ttl = 3600, force = false) {
  if (!path) return null;
  const k = bucket + "/" + path, hit = cache.get(k);
  if (!force && hit && hit.exp > Date.now() + 60000) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data) return null;
  cache.set(k, { url: data.signedUrl, exp: Date.now() + ttl * 1000 });
  return data.signedUrl;
}

const RENDERABLE = /^image\/(jpeg|png|webp|gif)$/i;

/** ≤1600px, ~200 KB JPEG before upload (free-tier guardrail). Returns the stored path.
 *  If compression fails we only fall back to the raw file when a browser can actually show it —
 *  a raw HEIC would upload fine and then render as a broken image on the partner's phone. */
export async function uploadPhoto(supabase, bucket, path, file) {
  let blob = file, contentType = "image/jpeg";
  try {
    blob = await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.22, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.82 });
  } catch (e) {
    console.warn("compression skipped", e);
    if (!RENDERABLE.test(file.type || "")) throw new Error("that photo format can't be shown in Duo — try a JPEG or PNG 💛");
    contentType = file.type; // never label foreign bytes as jpeg
  }
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType, cacheControl: "3600" });
  if (error) throw error;
  cache.delete(bucket + "/" + path);
  return path;
}

/** A fresh, unique object name each time so a replaced photo is never served stale from the CDN or a
 *  partner's URL cache. `prefix` is the folder the storage policy expects; `stem` keeps any policy-relevant
 *  part of the filename (check-ins need the day before the first "."). */
export function freshPath(prefix, stem = "") {
  const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}/${stem ? stem + "." : ""}${v}.jpg`;
}

/** Best-effort delete of an old object after a replacement has landed. */
export async function removeQuietly(supabase, bucket, path) {
  if (!path) return;
  try { await supabase.storage.from(bucket).remove([path]); } catch {}
  cache.delete(bucket + "/" + path);
}
