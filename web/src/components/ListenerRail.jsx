import { AnimatePresence, motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { Avatar, Tooltip, spring } from './ui/Primitives.jsx';
import { pluralize } from '../lib/format.js';

/**
 * Who's in the room. Each avatar gets a soft pulsing ring while music plays —
 * a small, constant reminder that other people are hearing the same thing.
 */
export function ListenerRail({ listeners, hostId, youId, isPlaying, max = 9 }) {
  const shown = listeners.slice(0, max);
  const overflow = listeners.length - shown.length;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center">
        <AnimatePresence initial={false}>
          {shown.map((listener, index) => {
            const isHost = listener.id === hostId;
            const isYou = listener.id === youId;
            return (
              <motion.div
                key={listener.id}
                layout
                initial={{ opacity: 0, scale: 0.5, x: -8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.5, width: 0 }}
                transition={spring}
                className="relative"
                style={{ marginLeft: index === 0 ? 0 : -8, zIndex: shown.length - index }}
              >
                <Tooltip
                  label={`${isYou ? 'You' : listener.name}${isHost ? ' · host' : ''}`}
                >
                  <span className="relative block">
                    {isPlaying && (
                      <span
                        className="animate-pulse-ring absolute inset-0 rounded-full"
                        style={{
                          border: `1.5px solid hsl(${listener.hue} 85% 62%)`,
                          animationDelay: `${index * 0.22}s`,
                        }}
                        aria-hidden
                      />
                    )}
                    <Avatar
                      name={listener.name}
                      hue={listener.hue}
                      size={32}
                      className="ring-2 ring-ink-900/70"
                    />
                    {isHost && (
                      <span
                        className="absolute -right-0.5 -top-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-[#ffd60a] text-black shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
                        aria-hidden
                      >
                        <Crown size={9} strokeWidth={3} className="fill-black" />
                      </span>
                    )}
                  </span>
                </Tooltip>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {overflow > 0 && (
          <div
            className="glass-strong relative grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white/70"
            style={{ marginLeft: -8 }}
            title={listeners.slice(max).map((l) => l.name).join(', ')}
          >
            +{overflow}
          </div>
        )}
      </div>

      <span className="hidden text-[12.5px] text-white/45 sm:block">
        {pluralize(listeners.length, 'listener')}
      </span>
    </div>
  );
}
