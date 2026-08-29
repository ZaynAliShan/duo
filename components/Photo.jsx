"use client";
import { useEffect, useState } from "react";
import { useDuo } from "./DuoProvider";
import { signedUrl } from "@/lib/photos";

const TTL = 3600;
function useRefreshingUrl(supabase, bucket, path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true, timer;
    if (!path) { setUrl(null); return; }
    const go = (force) => signedUrl(supabase, bucket, path, TTL, force).then((u) => {
      if (!alive) return;
      setUrl(u);
      timer = setTimeout(() => go(true), (TTL - 120) * 1000); // re-sign before the link dies on a long-open tab
    });
    go(false);
    return () => { alive = false; clearTimeout(timer); };
  }, [bucket, path]);
  return url;
}

/** <img> for a private-bucket path (signed URL, cached). Renders nothing until ready. */
export default function Photo({ bucket, path, alt = "", className, style, onClick }) {
  const { supabase } = useDuo();
  const url = useRefreshingUrl(supabase, bucket, path);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} style={style} onClick={onClick} />;
}
export function useSignedUrl(bucket, path) {
  const { supabase } = useDuo();
  return useRefreshingUrl(supabase, bucket, path);
}
