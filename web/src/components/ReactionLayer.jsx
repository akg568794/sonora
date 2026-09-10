import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Smile } from 'lucide-react';

export const REACTION_SET = ['❤️', '🔥', '🕺', '😭', '🤯', '🎧', '✨', '💯'];

/** Deterministic jitter per reaction id, so a re-render doesn't teleport it. */
function driftFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const rand = (n) => ((Math.abs(hash >> n) % 1000) / 1000 - 0.5) * 2;
  return {
    startX: rand(2) * 34,
    swayX: rand(5) * 70,
    rotate: rand(7) * 32,
    scale: 0.92 + Math.abs(rand(11)) * 0.5,
    duration: 3.1 + Math.abs(rand(13)) * 1.1,
  };
}

/**
 * Emoji that float up over the artwork whenever anyone in the room reacts.
 * Absolutely positioned inside its parent, so drop it in a `relative` container.
 */
export function ReactionLayer({ reactions }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <AnimatePresence>
        {reactions.map((reaction) => {
          const drift = driftFor(reaction.id);
          return (
            <motion.div
              key={reaction.id}
              initial={{ opacity: 0, y: 20, x: drift.startX, scale: 0.4 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [20, -70, -170, -260],
                x: [drift.startX, drift.startX + drift.swayX * 0.6, drift.startX + drift.swayX * 0.2, drift.startX + drift.swayX],
                scale: [0.4, drift.scale, drift.scale, drift.scale * 0.85],
                rotate: [0, drift.rotate * 0.5, drift.rotate],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: drift.duration, ease: 'easeOut', times: [0, 0.18, 0.6, 1] }}
              className="absolute bottom-6 left-1/2 flex flex-col items-center gap-1"
              style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))' }}
            >
              <span className="text-[34px] leading-none">{reaction.emoji}</span>
              <span className="whitespace-nowrap rounded-pill bg-black/45 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white/75 backdrop-blur-sm">
                {reaction.from.name}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** The reaction picker: one tap sends, and it stays open for a quick burst. */
export function ReactionBar({ onReact, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  const emojis = useMemo(() => REACTION_SET, []);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <AnimatePresence initial={false}>
        {expanded &&
          emojis.map((emoji, i) => (
            <motion.button
              key={emoji}
              initial={{ opacity: 0, scale: 0.3, x: 12 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.3, x: 12 }}
              transition={{ delay: i * 0.022, type: 'spring', stiffness: 500, damping: 26 }}
              onClick={() => onReact(emoji)}
              aria-label={`React ${emoji}`}
              className="grid h-9 w-9 place-items-center rounded-full text-[19px] transition-transform duration-150 ease-spring hover:scale-[1.28] hover:bg-white/10 active:scale-95"
            >
              {emoji}
            </motion.button>
          ))}
      </AnimatePresence>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Hide reactions' : 'Show reactions'}
        aria-expanded={expanded}
        className={`btn-icon h-9 w-9 ${expanded ? 'bg-white/15 text-white' : ''}`}
      >
        <Smile size={18} />
      </button>
    </div>
  );
}
