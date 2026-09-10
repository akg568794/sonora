import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { ListPlus, Music4, Play, Search, Trash2, X } from 'lucide-react';
import { CoverArt, EmptyState, Tooltip, spring } from '../components/ui/Primitives.jsx';
import { UploadZone } from '../components/UploadZone.jsx';
import { deleteTrack } from '../lib/api.js';
import { formatBytes, formatTime, pluralize } from '../lib/format.js';

function TrackRow({ track, index, inRoom, onQueue, onPlayNow, onDelete, busy }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ ...spring, delay: Math.min(index * 0.015, 0.25) }}
      className="group flex items-center gap-3 rounded-card px-2.5 py-2 transition-colors duration-200 hover:bg-white/[0.06]"
    >
      <span className="tnum hidden w-6 shrink-0 text-right text-[12px] text-white/25 sm:block group-hover:hidden">
        {index + 1}
      </span>
      <button
        onClick={() => inRoom && onPlayNow(track.id)}
        disabled={!inRoom}
        aria-label={inRoom ? `Play ${track.title} now` : track.title}
        className="relative hidden shrink-0 overflow-hidden rounded-[9px] sm:group-hover:grid"
        style={{ width: 24, height: 24 }}
      >
        <span className="grid h-6 w-6 place-items-center text-white/80">
          <Play size={13} className="fill-current" />
        </span>
      </button>

      <CoverArt src={track.cover} alt="" size={44} rounded="rounded-[10px]" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium leading-tight text-white/92">{track.title}</p>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-white/45">
          {track.artist}
          {track.album ? <span className="text-white/25"> · {track.album}</span> : null}
        </p>
      </div>

      <span className="hidden shrink-0 text-[11.5px] text-white/30 lg:block">
        {track.bitrate ? `${track.bitrate} kbps` : formatBytes(track.size)}
      </span>
      <span className="tnum w-10 shrink-0 text-right text-[12px] text-white/35">
        {formatTime(track.duration)}
      </span>

      <div className="flex w-[86px] shrink-0 items-center justify-end gap-1">
        {inRoom && (
          <>
            <Tooltip label="Add to queue">
              <button onClick={() => onQueue(track.id)} className="btn-icon h-8 w-8" aria-label={`Add ${track.title} to queue`}>
                <ListPlus size={16} />
              </button>
            </Tooltip>
          </>
        )}
        <Tooltip label="Delete from library">
          <button
            onClick={() => onDelete(track)}
            disabled={busy}
            className="btn-icon h-8 w-8 opacity-0 hover:!text-accent-soft focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Delete ${track.title}`}
          >
            <Trash2 size={15} />
          </button>
        </Tooltip>
      </div>
    </motion.div>
  );
}

const SORTS = {
  recent: { label: 'Recently added', compare: (a, b) => b.uploadedAt - a.uploadedAt },
  title: { label: 'Title', compare: (a, b) => a.title.localeCompare(b.title) },
  artist: { label: 'Artist', compare: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title) },
  duration: { label: 'Length', compare: (a, b) => b.duration - a.duration },
};

export function Library({ identity, tracks, onTracksChanged, inRoom, onQueue, onPlayNow, onQueueAll }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [busyId, setBusyId] = useState(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? tracks.filter((t) =>
          [t.title, t.artist, t.album].filter(Boolean).some((field) => field.toLowerCase().includes(needle))
        )
      : tracks;
    return [...matched].sort(SORTS[sort].compare);
  }, [tracks, query, sort]);

  const totalDuration = useMemo(() => tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0), [tracks]);

  const remove = async (track) => {
    setBusyId(track.id);
    try {
      await deleteTrack(track.id);
      onTracksChanged();
    } catch {
      /* the row stays; the server refused */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-28 pt-8 sm:px-8">
      <header className="mb-6">
        <p className="label-caps">Your music</p>
        <h1 className="mt-1.5 text-[32px] font-bold tracking-tight sm:text-[36px]">Library</h1>
        <p className="mt-2 text-[14px] text-white/45">
          {tracks.length === 0
            ? 'Nothing here yet — upload a few songs to get started.'
            : `${pluralize(tracks.length, 'track')} · ${formatTime(totalDuration)} total`}
        </p>
      </header>

      <div className="mb-6">
        <UploadZone identity={identity} onUploaded={onTracksChanged} compact={tracks.length > 0} />
      </div>

      {tracks.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, artist, album"
              aria-label="Search your library"
              className="field !rounded-pill !py-2 !pl-9 !pr-9 text-[14px]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="btn-icon absolute right-1.5 top-1/2 h-6 w-6 -translate-y-1/2"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="glass flex items-center gap-0.5 rounded-pill p-0.5">
            {Object.entries(SORTS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`rounded-pill px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ease-apple ${
                  sort === key ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>

          {inRoom && filtered.length > 0 && (
            <button
              onClick={() => onQueueAll(filtered.map((t) => t.id))}
              className="btn btn-glass h-9 text-[12.5px]"
            >
              <ListPlus size={14} />
              Queue {query ? 'results' : 'all'}
            </button>
          )}
        </div>
      )}

      {tracks.length === 0 ? null : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches">
          Nothing in your library matches “{query}”.
        </EmptyState>
      ) : (
        <div className="glass overflow-hidden rounded-panel p-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                inRoom={inRoom}
                onQueue={onQueue}
                onPlayNow={onPlayNow}
                onDelete={remove}
                busy={busyId === track.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!inRoom && tracks.length > 0 && (
        <p className="mt-5 flex items-center justify-center gap-2 text-center text-[12.5px] text-white/35">
          <Music4 size={14} />
          Join or create a room to play these with other people.
        </p>
      )}
    </div>
  );
}
