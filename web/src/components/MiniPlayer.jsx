import { motion } from 'framer-motion';
import { Pause, Play, SkipForward, Users } from 'lucide-react';
import { CoverArt } from './ui/Primitives.jsx';
import { formatTime } from '../lib/format.js';

/**
 * Persistent transport shown while you're browsing away from the room screen,
 * so playback never feels like it belongs to one page.
 */
export function MiniPlayer({ room, audio, onOpenRoom }) {
  const item = room.currentItem;
  const duration = item?.duration ?? 0;
  const pct = duration ? Math.min(100, (audio.position / duration) * 100) : 0;

  return (
    <motion.div
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 90, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="glass-strong fixed bottom-[58px] left-0 right-0 z-40 border-x-0 border-b-0 lg:bottom-0 lg:left-[232px]"
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-white/8">
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, rgb(var(--art-1)), rgb(var(--art-2)))',
            transition: 'width 0.2s linear',
          }}
        />
      </div>

      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <button
          onClick={onOpenRoom}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="Open the room"
        >
          <CoverArt src={item?.cover} alt="" size={42} rounded="rounded-[10px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">
              {item?.title ?? 'Nothing playing'}
            </span>
            <span className="block truncate text-[11.5px] text-white/45">
              {item ? item.artist : room.name}
            </span>
          </span>
          <span className="tnum hidden shrink-0 text-[11.5px] text-white/35 sm:block">
            {formatTime(audio.position)} / {formatTime(duration)}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 hidden items-center gap-1 text-[11.5px] text-white/40 sm:flex">
            <Users size={12} />
            {room.listeners.length}
          </span>
          <button
            onClick={() => (room.playback.isPlaying ? room.pause() : room.play())}
            disabled={!item || !room.canControl}
            aria-label={room.playback.isPlaying ? 'Pause' : 'Play'}
            className="btn btn-primary grid h-9 w-9 place-items-center !rounded-full !px-0"
          >
            {room.playback.isPlaying ? (
              <Pause size={16} className="fill-white" />
            ) : (
              <Play size={16} className="ml-0.5 fill-white" />
            )}
          </button>
          <button
            onClick={room.next}
            disabled={!item || !room.canControl}
            aria-label="Next track"
            className="btn-icon h-9 w-9"
          >
            <SkipForward size={16} className="fill-current" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
