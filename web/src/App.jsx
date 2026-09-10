import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AmbientBackdrop } from './components/AmbientBackdrop.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { MiniPlayer } from './components/MiniPlayer.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Modal } from './components/ui/Primitives.jsx';
import { Lobby } from './screens/Lobby.jsx';
import { Library } from './screens/Library.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { RoomScreen } from './screens/RoomScreen.jsx';
import { useAudioAnalyser } from './hooks/useAudioAnalyser.js';
import { useRoom } from './hooks/useRoom.js';
import { useSyncedAudio } from './hooks/useSyncedAudio.js';
import { applyPalette, extractPalette } from './lib/color.js';
import { fetchTracks } from './lib/api.js';
import { loadIdentity, randomName, saveIdentity } from './lib/identity.js';
import { serverClock } from './lib/socket.js';

const VOLUME_KEY = 'sonora.volume.v1';

/* --------------------------------------------------------------- hash routing */

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [head, param] = raw.split('/');
  if (head === 'room' && param) return { name: 'room', code: param.toUpperCase() };
  if (head === 'library') return { name: 'library' };
  return { name: 'lobby' };
}

function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

const navigate = (path) => {
  window.location.hash = path;
};

/* ------------------------------------------------------------------- profile */

function ProfileModal({ open, onClose, identity, onSave }) {
  const [name, setName] = useState(identity.name);
  const [hue, setHue] = useState(identity.hue);

  useEffect(() => {
    if (open) {
      setName(identity.name);
      setHue(identity.hue);
    }
  }, [open, identity]);

  const hues = [0, 24, 45, 90, 145, 190, 210, 250, 285, 320];

  return (
    <Modal open={open} onClose={onClose} title="Your profile">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...identity, name: name.trim() || randomName(), hue });
          onClose();
        }}
      >
        <label className="label-caps mb-2 block">Display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="field" />

        <label className="label-caps mb-2 mt-5 block">Avatar colour</label>
        <div className="flex flex-wrap gap-2">
          {hues.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setHue(option)}
              aria-label={`Colour ${option}`}
              className="h-8 w-8 rounded-full transition-transform duration-200 ease-spring hover:scale-110 active:scale-95"
              style={{
                background: `linear-gradient(145deg, hsl(${option} 85% 62%), hsl(${(option + 45) % 360} 80% 46%))`,
                boxShadow: hue === option ? '0 0 0 2px #0e0e11, 0 0 0 4px rgba(255,255,255,0.85)' : 'none',
              }}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-glass flex-1">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary flex-1">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------------- app */

export default function App() {
  const [identity, setIdentity] = useState(loadIdentity);
  const [tracks, setTracks] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.min(1, stored) : 0.85;
  });
  const [muted, setMuted] = useState(false);
  const [latency, setLatency] = useState(0);

  const route = useHashRoute();
  const room = useRoom(identity);
  // The room code we last tried to enter, successfully or not.
  const attemptedCodeRef = useRef(null);

  /* ------------------------------------------------------------------ library */

  const reloadTracks = useCallback(async () => {
    try {
      setTracks(await fetchTracks());
    } catch {
      /* server not up yet — the upload zone will surface errors when used */
    }
  }, []);

  useEffect(() => {
    reloadTracks();
  }, [reloadTracks]);

  /* -------------------------------------------------------------------- audio */

  // Queue items already carry their media URL from the server; fall back to the
  // local library copy in case an older item predates that.
  const currentTrack = useMemo(() => {
    if (!room.currentItem) return null;
    const libraryTrack = tracks.find((t) => t.id === room.currentItem.trackId);
    const url = room.currentItem.url ?? libraryTrack?.url ?? null;
    if (!url) return null;
    return { ...room.currentItem, url, cover: room.currentItem.cover ?? libraryTrack?.cover ?? null };
  }, [room.currentItem, tracks]);

  const audioState = useSyncedAudio({
    playback: room.playback,
    track: currentTrack,
    volume,
    muted,
  });

  // Routing the element through WebAudio silences it while the AudioContext is
  // suspended, so wait until the browser has actually let us start playing.
  const { read } = useAudioAnalyser(audioState.audioRef, {
    active: room.status === 'joined' && !audioState.needsGesture,
  });

  const setVolume = useCallback((next) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolumeState(clamped);
    setMuted(clamped === 0);
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const audio = useMemo(
    () => ({
      ...audioState,
      volume,
      muted,
      setVolume,
      toggleMute: () => setMuted((m) => !m),
      latency,
    }),
    [audioState, volume, muted, setVolume, latency]
  );

  useEffect(() => serverClock.onChange((clock) => setLatency(clock.rtt)), []);

  /* ------------------------------------------------------------------ palette */

  useEffect(() => {
    let cancelled = false;
    extractPalette(currentTrack?.cover).then((palette) => {
      if (!cancelled) applyPalette(palette);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.cover]);

  /* ----------------------------------------------------------------- identity */

  const saveProfile = useCallback((next) => {
    setIdentity(saveIdentity({ ...next, onboarded: true }));
  }, []);

  /* -------------------------------------------------------------- room joining */

  const joinRoom = useCallback(
    async (code) => {
      const normalized = String(code ?? '').trim().toUpperCase();
      // Record the attempt here too, not just in the deep-link effect, so an
      // explicit join from the lobby also stops that effect re-joining later.
      attemptedCodeRef.current = normalized;
      setJoining(true);
      const reply = await room.join(normalized);
      setJoining(false);
      if (reply?.ok) navigate(`/room/${reply.room.code}`);
      return reply;
    },
    [room]
  );

  const createRoom = useCallback(
    async (name) => {
      setJoining(true);
      const reply = await room.create(name);
      setJoining(false);
      if (reply?.ok) {
        attemptedCodeRef.current = reply.room.code;
        navigate(`/room/${reply.room.code}`);
      }
      return reply;
    },
    [room]
  );

  const leaveRoom = useCallback(() => {
    room.leave();
    navigate('/');
  }, [room]);

  // Only navigate away if the server actually accepted the deletion, so a refusal
  // leaves the host sitting in the room with the error rather than out in the lobby.
  const closeRoom = useCallback(async () => {
    const reply = await room.close();
    if (reply?.ok) navigate('/');
    return reply;
  }, [room]);

  // Forget the attempt as soon as we're off the room screen, so the same code can
  // be opened again later. Runs before the join effect below in the same commit.
  useEffect(() => {
    if (route.name !== 'room') attemptedCodeRef.current = null;
  }, [route.name]);

  // Screens have very different heights, so carrying the old scroll offset across
  // a route change can drop you into blank space below the new screen's content.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [route.name, route.code]);

  // Auto-join when someone opens a shared #/room/CODE link.
  //
  // This deliberately keys off "have we already tried this code" rather than off
  // room status. Leaving a room updates React state immediately but `hashchange`
  // fires a tick later, so for one render we're on a /room/CODE route with no
  // room — and inferring intent from that state would re-join the room the user
  // just left, forever.
  useEffect(() => {
    if (!identity.onboarded) return;
    if (route.name !== 'room') return;
    if (room.status === 'joined' && room.code === route.code) return;
    if (attemptedCodeRef.current === route.code) return;
    if (joining) return;
    attemptedCodeRef.current = route.code;
    joinRoom(route.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.name, route.code, identity.onboarded, room.status, room.code]);

  /* ----------------------------------------------------------- global hotkeys */

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || room.status !== 'joined' || !room.canControl) return;

      if (event.code === 'Space') {
        event.preventDefault();
        room.playback.isPlaying ? room.pause() : room.play();
      } else if (event.key === 'ArrowRight' && event.shiftKey) {
        room.next();
      } else if (event.key === 'ArrowLeft' && event.shiftKey) {
        room.previous();
      } else if (event.key === 'm' || event.key === 'M') {
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room]);

  /* ------------------------------------------------------------------- render */

  if (!identity.onboarded) {
    return (
      <>
        <AmbientBackdrop cover={null} isPlaying intensity={0.85} />
        <Onboarding identity={identity} onComplete={saveProfile} />
      </>
    );
  }

  const inRoom = room.status === 'joined';
  const onRoomScreen = route.name === 'room';
  const showMiniPlayer = inRoom && !onRoomScreen;

  return (
    <>
      <AmbientBackdrop
        cover={currentTrack?.cover}
        isPlaying={room.playback.isPlaying}
        intensity={onRoomScreen ? 1 : 0.55}
      />

      <div className="flex min-h-screen">
        {!onRoomScreen && (
          <Sidebar route={route} identity={identity} room={room} onEditProfile={() => setProfileOpen(true)} />
        )}

        <main className="min-w-0 flex-1">
          {/* Deliberately not an AnimatePresence: `mode="wait"` keeps rendering the
              outgoing screen until its exit animation reports back, so one stalled
              transition leaves the viewport empty with no way out but a reload.
              Changing the key remounts and replays `initial → animate` instead. */}
          <ErrorBoundary key={route.name === 'room' ? `room-${route.code}` : route.name}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            >
              {route.name === 'library' && (
                <Library
                  identity={identity}
                  tracks={tracks}
                  onTracksChanged={reloadTracks}
                  inRoom={inRoom}
                  onQueue={(id) => room.addToQueue(id)}
                  onPlayNow={(id) => room.addToQueue(id, { playNow: true })}
                  onQueueAll={(ids) => room.addManyToQueue(ids)}
                />
              )}

              {route.name === 'lobby' && (
                <Lobby identity={identity} onJoin={joinRoom} onCreate={createRoom} joining={joining} />
              )}

              {onRoomScreen &&
                (inRoom && room.code === route.code ? (
                  <RoomScreen
                    room={{ ...room, leave: leaveRoom, close: closeRoom }}
                    identity={identity}
                    tracks={tracks}
                    onTracksChanged={reloadTracks}
                    audio={audio}
                    read={read}
                  />
                ) : (
                  <div className="grid min-h-screen place-items-center">
                    <div className="flex flex-col items-center gap-3 text-white/50">
                      <Loader2 size={26} className="animate-spin" />
                      <p className="text-[14px]">
                        {room.status === 'error' ? room.error : `Joining ${route.code}…`}
                      </p>
                      {room.status === 'error' && (
                        <button onClick={() => navigate('/')} className="btn btn-glass mt-2">
                          Back to rooms
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>

      <AnimatePresence>
        {showMiniPlayer && (
          <MiniPlayer room={room} audio={audio} onOpenRoom={() => navigate(`/room/${room.code}`)} />
        )}
      </AnimatePresence>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        identity={identity}
        onSave={saveProfile}
      />
    </>
  );
}
