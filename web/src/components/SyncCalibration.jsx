import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { serverClock, socket } from '../lib/socket.js';

const SEGMENTS = 7;
// Matches App.jsx's MIN_CALIBRATION_MS — real NTP samples trickle in far slower
// than this (the burst gives ~5 in under a second, the next one only 10s
// later), so the segments fill on this fixed timeline rather than real data.
const DURATION_MS = 3000;

// Reveals the stat rows one at a time instead of all at once, so the card
// reads as "loading in" rather than popping in fully formed.
const statsList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.5, delayChildren: 0.4 } },
};

const statsRow = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] } },
};

function StatRow({ label, value }) {
  return (
    <motion.div variants={statsRow} className="flex items-center justify-between text-[12px]">
      <span className="text-white/35">{label}</span>
      <span className="tnum font-medium text-white/70">{value}</span>
    </motion.div>
  );
}

/**
 * Shown while a room is being joined — the socket has connected but we're
 * still building up enough NTP-style clock samples to trust synchronized
 * playback. Doubles as a little window into how that sync actually works.
 */
export function SyncCalibration({ label }) {
  const [clock, setClock] = useState(() => ({
    ready: serverClock.ready,
    sent: serverClock.sent,
    pure: serverClock.pure,
    impure: serverClock.impure,
    samples: serverClock.samples.length,
    window: serverClock.window,
    rtt: serverClock.rtt,
  }));
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const sync = () =>
      setClock({
        ready: serverClock.ready,
        sent: serverClock.sent,
        pure: serverClock.pure,
        impure: serverClock.impure,
        samples: serverClock.samples.length,
        window: serverClock.window,
        rtt: serverClock.rtt,
      });
    const unsubscribe = serverClock.onChange(sync);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return unsubscribe;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="glass-strong w-full max-w-[340px] rounded-panel p-6"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#30d158] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#30d158]" />
        </span>
        <h2 className="text-[15px] font-semibold">Beatsync calibrating</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-white/40">{label ?? 'Synchronizing time…'}</p>

      <div className="mt-5 flex gap-1">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-pill bg-white/10">
            <motion.div
              className="h-full rounded-pill"
              style={{ background: 'linear-gradient(90deg, rgb(var(--art-1)), rgb(var(--art-2)))' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: (i / SEGMENTS) * (DURATION_MS / 1000) }}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-1.5 border-t border-white/10 pt-4">
        <motion.div variants={statsList} initial="hidden" animate="show" className="contents">
          <StatRow label="Probes sent" value={clock.sent} />
          <StatRow label="Pure / noisy" value={`${clock.pure} / ${clock.impure}`} />
          <StatRow label="Samples" value={`${clock.samples} / ${clock.window}`} />
          <StatRow label="Round trip" value={clock.rtt ? `${clock.rtt}ms` : '—'} />
          <StatRow label="Connection" value={connected ? 'open' : 'connecting'} />
        </motion.div>
      </div>
    </motion.div>
  );
}
