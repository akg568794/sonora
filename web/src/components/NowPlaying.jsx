import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CoverArt, Slider, Tooltip } from './ui/Primitives.jsx';
import { ReactionBar, ReactionLayer } from './ReactionLayer.jsx';
import { Visualizer } from './Visualizer.jsx';
import { formatRemaining, formatTime } from '../lib/format.js';

/** Green when we're inside a few tens of ms, amber while it's pulling back in. */
function SyncBadge({ drift, latency, isPlaying }) {
  const magnitude = Math.abs(drift ?? 0);
  const locked = magnitude < 0.12;
  const label = !isPlaying
    ? 'Paused for everyone'
    : locked
      ? `In sync · ${Math.round(latency)}ms`
      : `Re-syncing · ${magnitude < 1 ? `${Math.round(magnitude * 1000)}ms` : `${magnitude.toFixed(1)}s`} off`;

  return (
    <Tooltip label="Sonora keeps every listener locked to the same position using server time.">
      <span className="glass flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium text-white/65">
        <span
          className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
          style={{
            background: !isPlaying ? '#8e8e93' : locked ? '#30d158' : '#ff9f0a',
            boxShadow: `0 0 8px ${!isPlaying ? 'transparent' : locked ? '#30d158' : '#ff9f0a'}`,
          }}
        />
        {label}
      </span>
    </Tooltip>
  );
}

function VolumeControl({ volume, muted, onVolume, onToggleMute }) {
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggleMute} className="btn-icon h-8 w-8" aria-label={muted ? 'Unmute' : 'Mute'}>
        <Icon size={16} />
      </button>
      <div className="w-[90px]">
        <Slider
          value={muted ? 0 : volume}
          max={1}
          height={4}
          ariaLabel="Volume"
          onDragChange={onVolume}
          onCommit={onVolume}
        />
      </div>
    </div>
  );
}

export function NowPlaying({
  item,
  playback,
  position,
  duration,
  isBuffering,
  needsGesture,
  drift,
  latency,
  onUnlock,
  canControl,
  controlLockedReason,
  volume,
  muted,
  onVolume,
  onToggleMute,
  reactions,
  read,
  actions,
  isHost,
}) {
  const isPlaying = playback.isPlaying;
  const hasTrack = Boolean(item);
  const canSwipe = hasTrack && canControl;

  // Rubber-bands back to centre on release; onDragEnd decides whether the
  // swipe went far/fast enough to actually skip.
  const dragX = useMotionValue(0);
  const prevOpacity = useTransform(dragX, [0, 90], [0, 1]);
  const nextOpacity = useTransform(dragX, [-90, 0], [1, 0]);

  const handleDragEnd = (_event, info) => {
    if (!canSwipe) return;
    if (info.offset.x < -80 || info.velocity.x < -500) actions.next();
    else if (info.offset.x > 80 || info.velocity.x > 500) actions.previous();
  };

  const cycleRepeat = () => {
    const order = ['off', 'all', 'one'];
    const next = order[(order.indexOf(playback.repeat ?? 'off') + 1) % order.length];
    actions.updateSettings({ repeat: next });
  };

  const RepeatIcon = playback.repeat === 'one' ? Repeat1 : Repeat;

  return (
    <div className="flex flex-col items-center">
      {/* ------------------------------------------------------------- artwork */}
      <div className="relative w-full max-w-[340px]">
        <ReactionLayer reactions={reactions} />

        <motion.div
          animate={{
            scale: isPlaying ? 1 : 0.9,
            filter: isPlaying ? 'brightness(1)' : 'brightness(0.82)',
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 26 }}
          className="relative aspect-square w-full"
          style={{ x: dragX }}
          drag={canSwipe ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.6}
          onDragEnd={handleDragEnd}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={item?.qid ?? 'idle'}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-0"
            >
              <CoverArt
                src={item?.cover}
                alt={item ? `${item.title} cover art` : 'No track playing'}
                rounded="rounded-[22px]"
                className="h-full w-full shadow-art"
              />
              {/* Glassy highlight across the top of the sleeve. */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[22px]"
                style={{
                  background:
                    'linear-gradient(160deg, rgba(255,255,255,0.18), transparent 42%, rgba(0,0,0,0.12))',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
                }}
              />
            </motion.div>
          </AnimatePresence>

          {/* Colour bleed pooling under the sleeve, like light off a screen. */}
          <div
            aria-hidden
            className="absolute -inset-x-6 -bottom-8 top-8 -z-10 rounded-full opacity-70 blur-3xl transition-opacity duration-700"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgb(var(--art-1) / 0.55), rgb(var(--art-2) / 0.35) 55%, transparent 75%)',
              opacity: isPlaying ? 0.8 : 0.35,
            }}
          />

          {/* Swipe feedback — fades in as the drag crosses toward either edge. */}
          {canSwipe && (
            <>
              <motion.div
                aria-hidden
                style={{ opacity: prevOpacity }}
                className="pointer-events-none absolute inset-y-0 left-2 z-10 flex items-center"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                  <ChevronLeft size={20} />
                </span>
              </motion.div>
              <motion.div
                aria-hidden
                style={{ opacity: nextOpacity }}
                className="pointer-events-none absolute inset-y-0 right-2 z-10 flex items-center"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                  <ChevronRight size={20} />
                </span>
              </motion.div>
            </>
          )}

          <AnimatePresence>
            {(isBuffering || needsGesture) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 grid place-items-center rounded-[22px] bg-black/45 backdrop-blur-sm"
              >
                {needsGesture ? (
                  <button onClick={onUnlock} className="btn btn-primary flex-col gap-1 !rounded-[18px] px-5 py-4">
                    <Headphones size={22} />
                    <span className="text-[13px]">Tap to join the audio</span>
                    <span className="text-[10.5px] font-normal opacity-80">
                      Your browser needs one tap first
                    </span>
                  </button>
                ) : (
                  <Loader2 size={26} className="animate-spin text-white/80" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* --------------------------------------------------------------- meta */}
      {/* `relative` gives the exiting title (below) a containing block to size
          against, instead of blowing out to the viewport width. */}
      <div className="relative mt-7 w-full max-w-[420px] text-center">
        <div className="mb-3 flex justify-center">
          <SyncBadge drift={drift} latency={latency} isPlaying={isPlaying} />
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={item?.qid ?? 'empty'}
            className="w-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, position: 'absolute' }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          >
            <h1 className="truncate text-[22px] font-bold leading-tight">
              {item?.title ?? 'Nothing playing'}
            </h1>
            <p className="mt-1 truncate text-[15.5px] text-[rgb(var(--art-1))]">
              {item?.artist ?? 'Add a track to get the room started'}
            </p>
            {item?.album && <p className="mt-0.5 truncate text-[12.5px] text-white/35">{item.album}</p>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ----------------------------------------------------------- scrubber */}
      {/* `overflow-hidden` pins this to a fixed box regardless of how wide the
          hh:mm:ss labels get on a long track. */}
      <div className="mt-6 w-full max-w-[420px] overflow-hidden">
        <Slider
          value={Math.min(position, duration || 0)}
          max={duration || 1}
          disabled={!hasTrack || !canControl}
          ariaLabel="Seek"
          onCommit={(next) => actions.seek(next)}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-white/40">
          <span className="tnum shrink-0">{formatTime(position)}</span>
          <span className="tnum shrink-0">{formatRemaining(position, duration)}</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- transport */}
      <div className="mt-4 flex items-center gap-2">
        <Tooltip label={playback.shuffle ? 'Shuffle on' : 'Shuffle'}>
          <button
            onClick={() => actions.updateSettings({ shuffle: !playback.shuffle })}
            disabled={!isHost}
            className={`btn-icon h-9 w-9 ${playback.shuffle ? '!text-[rgb(var(--art-1))]' : ''}`}
            aria-label="Toggle shuffle"
            aria-pressed={playback.shuffle}
          >
            <Shuffle size={16} />
          </button>
        </Tooltip>

        <button
          onClick={actions.previous}
          disabled={!hasTrack || !canControl}
          className="btn-icon h-12 w-12 !text-white"
          aria-label="Previous track"
        >
          <SkipBack size={22} className="fill-current" />
        </button>

        <Tooltip label={canControl ? '' : controlLockedReason}>
          <button
            onClick={() => (isPlaying ? actions.pause() : actions.play())}
            disabled={!hasTrack || !canControl}
            aria-label={isPlaying ? 'Pause for everyone' : 'Play for everyone'}
            className="btn btn-primary grid h-[62px] w-[62px] place-items-center !rounded-full !px-0"
          >
            {isPlaying ? (
              <Pause size={26} className="fill-white" />
            ) : (
              <Play size={26} className="ml-0.5 fill-white" />
            )}
          </button>
        </Tooltip>

        <button
          onClick={actions.next}
          disabled={!hasTrack || !canControl}
          className="btn-icon h-12 w-12 !text-white"
          aria-label="Next track"
        >
          <SkipForward size={22} className="fill-current" />
        </button>

        <Tooltip
          label={
            playback.repeat === 'one' ? 'Repeat one' : playback.repeat === 'all' ? 'Repeat queue' : 'Repeat off'
          }
        >
          <button
            onClick={cycleRepeat}
            disabled={!isHost}
            className={`btn-icon h-9 w-9 ${playback.repeat !== 'off' ? '!text-[rgb(var(--art-1))]' : ''}`}
            aria-label="Cycle repeat mode"
          >
            <RepeatIcon size={16} />
          </button>
        </Tooltip>
      </div>

      {/* ------------------------------------------------- visualiser + extras */}
      <div className="mt-7 w-full max-w-[420px]">
        <Visualizer read={read} isPlaying={isPlaying} bars={52} height={52} />
      </div>

      <div className="mt-4 flex w-full max-w-[420px] items-center justify-between gap-4">
        <VolumeControl
          volume={volume}
          muted={muted}
          onVolume={onVolume}
          onToggleMute={onToggleMute}
        />
        <ReactionBar onReact={actions.react} />
      </div>

      {!canControl && (
        <p className="mt-4 text-center text-[12px] text-white/35">{controlLockedReason}</p>
      )}
    </div>
  );
}
