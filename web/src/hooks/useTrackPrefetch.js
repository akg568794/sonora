import { useEffect, useRef, useState } from 'react';

// Only ever need the currently-playing track's blob plus one lookahead.
const MAX_CACHED = 2;

/**
 * Fetches the next queued track into memory while the current one is still
 * playing, so the transition to it is an instant swap to a local blob URL
 * instead of a fresh network request landing exactly on cue — which is where
 * a stalled connection used to show up as the track breaking at the seam.
 *
 * Pass `null` (e.g. during shuffle, where the next track isn't knowable ahead
 * of time) to skip prefetching entirely.
 */
export function useTrackPrefetch(nextItem) {
  const [cache, setCache] = useState(() => new Map()); // qid -> blob URL
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const inFlightRef = useRef(new Set());

  useEffect(() => {
    if (!nextItem?.url || !nextItem.qid) return;
    if (cacheRef.current.has(nextItem.qid) || inFlightRef.current.has(nextItem.qid)) return;

    const { qid, url } = nextItem;
    inFlightRef.current.add(qid);
    let cancelled = false;

    fetch(url)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        setCache((prev) => {
          const next = new Map(prev);
          next.set(qid, URL.createObjectURL(blob));
          while (next.size > MAX_CACHED) {
            const oldestKey = next.keys().next().value;
            URL.revokeObjectURL(next.get(oldestKey));
            next.delete(oldestKey);
          }
          return next;
        });
      })
      .catch(() => {
        // No head start for this track — the normal streaming path still
        // handles it fine whenever it actually comes up.
      })
      .finally(() => inFlightRef.current.delete(qid));

    return () => {
      cancelled = true;
    };
  }, [nextItem?.qid, nextItem?.url]);

  // Release every cached blob when the room/session goes away.
  useEffect(
    () => () => {
      cacheRef.current.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
    },
    []
  );

  return cache;
}
