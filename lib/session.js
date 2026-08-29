"use client";
import { clearQueue } from "./offline-queue";

/** Sign out and leave nothing of this person behind on the device: the offline queue (would replay under
 *  the next account), the remembered login email, the tour state, and any pages the service worker cached. */
export async function signOutClean(supabase) {
  try { await supabase.auth.signOut(); } catch {}
  await clearQueue();
  try { localStorage.removeItem("duo-login-email"); localStorage.removeItem("duo-nux-v2"); } catch {}
  try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } } catch {}
}
