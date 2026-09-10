import { AnimatePresence, motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { Avatar, spring } from './ui/Primitives.jsx';
import { UploadZone } from './UploadZone.jsx';

/**
 * Desktop-only left rail — a vertical roster of who's in the room, echoing
 * the header's `ListenerRail` but with room to show everyone at once instead
 * of an overlapping stack. Anchors an upload shortcut at the bottom so the
 * column earns its width instead of sitting mostly empty.
 */
export function RoomListeners({ listeners, hostId, youId, identity, onTracksChanged }) {
  return (
    // No fill, no blur — a bare outline so the backdrop shows through untouched.
    <div className="flex h-full flex-col overflow-hidden rounded-panel border border-white/10 bg-transparent">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-3">
        <AnimatePresence initial={false}>
          {listeners.map((listener) => {
            const isHost = listener.id === hostId;
            const isYou = listener.id === youId;
            return (
              <motion.div
                key={listener.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="flex items-center gap-2.5 rounded-card px-2 py-2 transition-colors duration-150 hover:bg-white/[0.05]"
              >
                <span className="relative block shrink-0">
                  <Avatar name={listener.name} hue={listener.hue} size={34} />
                  {isHost && (
                    <span
                      className="absolute -left-1 -top-1 grid h-[16px] w-[16px] place-items-center rounded-full bg-ink-900 ring-1 ring-black/40"
                      aria-hidden
                    >
                      <Crown size={10} strokeWidth={2.5} className="fill-[#ffd60a] text-[#ffd60a]" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white/90">
                  {listener.name}
                </span>
                {isYou && (
                  <span className="shrink-0 rounded-pill bg-[#30d158]/18 px-2 py-0.5 text-[10.5px] font-semibold text-[#30d158]">
                    You
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {identity && (
        <div className="hairline-t shrink-0 p-3">
          <UploadZone identity={identity} onUploaded={onTracksChanged} compact />
        </div>
      )}
    </div>
  );
}
