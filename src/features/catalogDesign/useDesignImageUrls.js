import { useEffect, useState } from "react";
import { CATALOG_DESIGN_WORK_BUCKET, getCatalogDesignSignedUrl } from "../../services/supabase/catalogDesign";
import { createDesignImageUrlCache } from "./designImageUrls";

export default function useDesignImageUrls(connection, ready, paths) {
  const pathKey = JSON.stringify([...new Set(paths.filter(Boolean))].sort());
  const [result, setResult] = useState({ urls: {}, errors: {} });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let running = false;
    setResult({ urls: {}, errors: {} });
    if (!ready) return;
    const get = createDesignImageUrlCache((path, ttl) => getCatalogDesignSignedUrl(connection, CATALOG_DESIGN_WORK_BUCKET, path, ttl));
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const entries = await Promise.all(JSON.parse(pathKey).map(async (path) => [path, await get(path)]));
        if (!cancelled) setResult({
          urls: Object.fromEntries(entries.map(([path, entry]) => [path, entry.url])),
          errors: Object.fromEntries(entries.map(([path, entry]) => [path, entry.error])),
        });
      } finally { running = false; }
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [connection, ready, pathKey, retry]);
  return { ...result, retry: () => setRetry((value) => value + 1) };
}
