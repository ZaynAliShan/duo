"use client";
/** The invite code rides along in a cookie from /join/[code] through login to onboarding. */
export function readCookie(name) {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1];
}
export const readInvite = () => { const v = readCookie("duo_invite"); return v ? decodeURIComponent(v) : ""; };
export const clearInviteCookie = () => { document.cookie = "duo_invite=; path=/; max-age=0"; };
