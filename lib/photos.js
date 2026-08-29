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

/** ≤1600px, ~200 KB JPEG before upload (free-tier guardrail). Returns the stored path. */
export async function uploadPhoto(supabase, bucket, path, file) {
  let blob = file, contentType = "image/jpeg";
  try {
    blob = await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.22, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.82 });
  } catch (e) {
    console.warn("compression skipped", e);
    contentType = file.type || "image/jpeg"; // never label foreign bytes as jpeg
  }
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType, cacheControl: "3600" });
  if (error) throw error;
  cache.delete(bucket + "/" + path);
  return path;
}

