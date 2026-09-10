import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, DoorOpen, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { Avatar, CoverArt, EmptyState, Modal, spring } from '../components/ui/Primitives.jsx';
import { fetchRooms } from '../lib/api.js';
import { pluralize } from '../lib/format.js';

/** Six single-character boxes, iOS verification-code style. */
function CodeInput({ value, onChange, onSubmit, error }) {
  const inputRef = useRef(null);
  const chars = value.padEnd(6, ' ').slice(0, 6).split('');

  return (
    <div>
      <div
        className="relative flex justify-center gap-2"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Room code"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        {chars.map((char, i) => (
          <motion.div
            key={i}
            animate={{
              scale: i === value.length ? 1.04 : 1,
              borderColor:
                i === value.length
                  ? 'rgb(var(--art-1))'
                  : error
                    ? 'rgba(250,36,60,0.7)'
                    : 'rgba(255,255,255,0.12)',
            }}
            transition={spring}
            className="grid h-[52px] w-[42px] place-items-center rounded-card border bg-black/30 text-[22px] font-semibold tnum"
          >
            {char.trim() || <span className="text-white/15">·</span>}
          </motion.div>
        ))}
      </div>
      {error && <p className="mt-3 text-center text-[12.5px] text-accent-soft">{error}</p>}
    </div>
  );
}

function RoomCard({ room, onJoin, index }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ ...spring, delay: Math.min(index * 0.04, 0.3) }}
      onClick={() => onJoin(room.code)}
      className="glass glass-sheen group relative overflow-hidden rounded-panel p-4 text-left transition-all duration-300 ease-apple hover:-translate-y-1 hover:bg-white/[0.1] hover:shadow-lift active:scale-[0.98]"
    >
      <div className="flex items-start gap-3.5">
        <div className="relative">
          <CoverArt src={room.nowPlaying?.cover} alt="" size={62} rounded="rounded-card" />
          {room.isPlaying && (
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#30d158] shadow-[0_0_0_2.5px_#0e0e11]">
              <span className="flex items-end gap-[1.5px]">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-[1.5px] rounded-full bg-black/80"
                    animate={{ height: [3, 8, 4, 9, 3] }}
                    transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </span>
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">{room.name}</h3>
            <span className="tnum shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-white/50">
              {room.code}
            </span>
          </div>
          <p className="mt-1 truncate text-[12.5px] text-white/55">
            {room.nowPlaying ? (
              <>
                <span className="text-[rgb(var(--art-1))]">♪</span> {room.nowPlaying.title}
                <span className="text-white/30"> · {room.nowPlaying.artist}</span>
              </>
            ) : (
              'Nothing playing yet'
            )}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex">
              {room.avatars.map((listener, i) => (
                <span key={i} style={{ marginLeft: i === 0 ? 0 : -7, zIndex: 5 - i }}>
                  <Avatar name={listener.name} hue={listener.hue} size={21} className="ring-2 ring-ink-800/80" />
                </span>
              ))}
            </div>
            <span className="text-[11.5px] text-white/40">{pluralize(room.listeners, 'listening', 'listening')}</span>
          </div>
        </div>

        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/8 text-white/40 transition-all duration-300 ease-apple group-hover:bg-[rgb(var(--art-1))] group-hover:text-white">
          <ArrowRight size={15} strokeWidth={2.5} />
        </div>
      </div>
    </motion.button>
  );
}

export function Lobby({ identity, onJoin, onCreate, joining }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState('');

  const load = async () => {
    try {
      setRooms(await fetchRooms());
    } catch {
      /* server may still be starting */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const submitCode = async () => {
    if (code.length < 6) {
      setJoinError('Room codes are 6 characters.');
      return;
    }
    setJoinError(null);
    const reply = await onJoin(code);
    if (!reply?.ok) setJoinError(reply?.error ?? 'Could not join that room.');
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setCreateOpen(false);
    await onCreate(roomName.trim() || `${identity.name}'s room`);
    setRoomName('');
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-28 pt-8 sm:px-8">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="mb-8"
      >
        <p className="label-caps">Listen together</p>
        <h1 className="mt-1.5 text-[34px] font-bold leading-tight tracking-tight sm:text-[40px]">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
          <span
            style={{
              background: 'linear-gradient(100deg, rgb(var(--art-1)), rgb(var(--art-2)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {identity.name.split(' ')[0]}
          </span>
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-white/45">
          Open a room and share the code, or drop into one that's already going.
        </p>
      </motion.header>

      <div className="mb-10 grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06, ease: [0.32, 0.72, 0, 1] }}
          className="glass glass-sheen flex flex-col justify-between gap-5 rounded-panel p-6"
        >
          <div>
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-[15px] bg-[rgb(var(--art-1))] shadow-[0_8px_24px_-8px_rgb(var(--art-1)/0.8)]">
              <Plus size={20} strokeWidth={2.4} />
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight">Start a room</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">
              You'll get a 6-character code and a link to send anyone.
            </p>
          </div>
          <button onClick={() => setCreateOpen(true)} disabled={joining} className="btn btn-primary !py-2.5">
            {joining ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.6} />}
            Create a room
          </button>
        </motion.div>

        <div className="hidden items-center lg:flex">
          <div className="flex h-full flex-col items-center gap-3">
            <span className="w-px flex-1 bg-gradient-to-b from-transparent via-white/12 to-transparent" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/25">or</span>
            <span className="w-px flex-1 bg-gradient-to-b from-transparent via-white/12 to-transparent" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.32, 0.72, 0, 1] }}
          className="glass glass-sheen flex flex-col justify-between gap-5 rounded-panel p-6"
        >
          <div>
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-[15px] bg-white/10">
              <DoorOpen size={20} strokeWidth={2} />
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight">Join with a code</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">
              Someone sent you six characters? Put them in here.
            </p>
          </div>
          <div>
            <CodeInput value={code} onChange={setCode} onSubmit={submitCode} error={joinError} />
            <button
              onClick={submitCode}
              disabled={code.length < 6 || joining}
              className="btn btn-glass mt-3 w-full !py-2.5"
            >
              {joining ? <Loader2 size={15} className="animate-spin" /> : null}
              Join room
            </button>
          </div>
        </motion.div>
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight">
          <Users size={17} className="text-white/40" />
          Live rooms
        </h2>
        <button onClick={load} className="btn btn-plain h-8 !px-2.5 text-[12.5px]" aria-label="Refresh rooms">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && !rooms.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="glass h-[110px] animate-pulse rounded-panel" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="glass rounded-panel">
          <EmptyState icon={Users} title="No rooms open right now">
            Be the first — create a room and send the code to whoever you want listening with you.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {rooms.map((room, i) => (
              <RoomCard key={room.code} room={room} index={i} onJoin={onJoin} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Name your room">
        <form onSubmit={submitCreate}>
          <input
            autoFocus
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder={`${identity.name}'s room`}
            maxLength={60}
            className="field"
          />
          <p className="mt-2 text-[12px] text-white/40">
            Anyone with the code can join and add tracks. You can lock playback controls once you're in.
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-glass flex-1">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              Create
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
