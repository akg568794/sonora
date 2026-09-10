import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ListPlus, Search } from 'lucide-react';
import { CoverArt } from './ui/Primitives.jsx';
import { formatTime } from '../lib/format.js';

/**
 * Desktop-only quick-add: type to filter the library and queue a track
 * without leaving the room screen. Replaces the old "browse library" modal
 * on wide layouts, where there's room for it to live inline instead.
 */
export function TrackSearch({ tracks, queue, onQueue }) {
  const [query, setQuery] = useState('');
  const [justAdded, setJustAdded] = useState(new Set());
  const rootRef = useRef(null);

  const queuedIds = useMemo(() => new Set(queue.map((item) => item.trackId)), [queue]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return tracks
      .filter((t) => [t.title, t.artist, t.album].filter(Boolean).some((f) => f.toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [tracks, query]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setQuery('');
    };
    const onKey = (e) => e.key === 'Escape' && setQuery('');
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const add = (id) => {
    onQueue(id);
    setJustAdded((prev) => new Set(prev).add(id));
    setTimeout(
      () =>
        setJustAdded((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
      1600
    );
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to play?"
          aria-label="Search your library"
          className="field !rounded-pill !py-2.5 !pl-10 text-[14px]"
        />
      </div>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong glass-sheen absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[46vh] overflow-y-auto rounded-panel p-1.5 shadow-lift"
          >
            {results.map((track) => {
              const added = justAdded.has(track.id);
              return (
                <div
                  key={track.id}
                  className="group flex items-center gap-3 rounded-card px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
                >
                  <CoverArt src={track.cover} alt="" size={36} rounded="rounded-[9px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{track.title}</p>
                    <p className="truncate text-[11.5px] text-white/45">{track.artist}</p>
                  </div>
                  {queuedIds.has(track.id) && !added && (
                    <span className="shrink-0 text-[10.5px] font-medium text-white/30">queued</span>
                  )}
                  <span className="tnum shrink-0 text-[11.5px] text-white/30">{formatTime(track.duration)}</span>
                  <button
                    onClick={() => add(track.id)}
                    aria-label={`Add ${track.title} to the queue`}
                    className={`btn h-7 shrink-0 !px-2.5 text-[12px] ${added ? 'btn-primary' : 'btn-glass'}`}
                  >
                    {added ? <Check size={13} strokeWidth={3} /> : <ListPlus size={13} />}
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
