import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Copy,
  Link2,
  ListMusic,
  ListPlus,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  Search,
  Settings2,
  Trash2,
  Unlock,
  WifiOff,
} from 'lucide-react';
import { CoverArt, EmptyState, Modal, Switch, Tooltip, spring } from '../components/ui/Primitives.jsx';
import { ListenerRail } from '../components/ListenerRail.jsx';
import { NowPlaying } from '../components/NowPlaying.jsx';
import { QueuePanel } from '../components/QueuePanel.jsx';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { UploadZone } from '../components/UploadZone.jsx';
import { formatTime, pluralize } from '../lib/format.js';

/* ------------------------------------------------------------- track picker */

function AddMusicModal({ open, onClose, tracks, queue, identity, onQueue, onTracksChanged }) {
  const [query, setQuery] = useState('');
  const [justAdded, setJustAdded] = useState(new Set());

  const queuedIds = useMemo(() => new Set(queue.map((item) => item.trackId)), [queue]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks;
    return tracks.filter((t) =>
      [t.title, t.artist, t.album].filter(Boolean).some((f) => f.toLowerCase().includes(needle))
    );
  }, [tracks, query]);

  const add = (id) => {
    onQueue(id);
    setJustAdded((prev) => new Set(prev).add(id));
    setTimeout(() => setJustAdded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    }), 1600);
  };

  return (
    <Modal open={open} onClose={onClose} title="Add music to the queue" maxWidth={560}>
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library"
          aria-label="Search your library"
          className="field !rounded-pill !py-2 !pl-9 text-[14px]"
        />
      </div>

      <div className="-mx-1 max-h-[46vh] min-h-[140px] overflow-y-auto px-1">
        {tracks.length === 0 ? (
          <div className="py-2">
            <p className="mb-3 text-center text-[13px] text-white/45">
              Your library is empty — add some music first.
            </p>
            <UploadZone identity={identity} onUploaded={onTracksChanged} compact />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="No matches" />
        ) : (
          filtered.map((track) => {
            const added = justAdded.has(track.id);
            return (
              <div
                key={track.id}
                className="group flex items-center gap-3 rounded-card px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
              >
                <CoverArt src={track.cover} alt="" size={38} rounded="rounded-[9px]" />
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
          })
        )}
      </div>

      <div className="hairline-t mt-3 flex justify-end pt-3">
        <button onClick={onClose} className="btn btn-glass">
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ room settings */

function SettingsModal({ open, onClose, room, isHost }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Never leave the sheet sitting on the armed confirm step when it reopens.
  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setError(null);
    }
  }, [open]);

  const deleteRoom = async () => {
    setDeleting(true);
    const reply = await room.close();
    setDeleting(false);
    // On success the room screen is already unmounting, so there's nothing to tidy.
    if (!reply?.ok) {
      setError(reply?.error ?? 'Could not delete the room.');
      setConfirming(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Room settings">
      <div className="space-y-5">
        <Switch
          label="Anyone can control playback"
          hint="When off, only you can play, pause, skip and reorder. Everyone can still add tracks and vote."
          checked={room.allowGuestControl}
          disabled={!isHost}
          onChange={(value) => room.updateSettings({ allowGuestControl: value })}
        />
        {!isHost && (
          <p className="rounded-card bg-white/6 px-3 py-2.5 text-[12.5px] text-white/50">
            Only the host can change these.
          </p>
        )}
        <div className="hairline-t pt-4">
          <p className="label-caps mb-2">In this room</p>
          <div className="space-y-1.5">
            {room.listeners.map((listener) => (
              <div key={listener.id} className="flex items-center justify-between text-[13px]">
                <span className="text-white/80">
                  {listener.name}
                  {listener.id === room.hostId && (
                    <span className="ml-2 rounded bg-[#ffd60a]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#ffd60a]">
                      HOST
                    </span>
                  )}
                </span>
                <span className="text-[11.5px] text-white/30">
                  joined {formatTime((Date.now() - listener.joinedAt) / 1000)} ago
                </span>
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <div className="hairline-t pt-4">
            <p className="label-caps mb-2 !text-accent-soft">Danger zone</p>
            <p className="mb-3 text-[12.5px] leading-relaxed text-white/45">
              Deleting closes the room for everyone in it and clears the queue and chat. The music
              itself stays in your library.
            </p>

            <AnimatePresence mode="wait" initial={false}>
              {confirming ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="flex gap-2"
                >
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                    className="btn btn-glass flex-1"
                  >
                    Keep it
                  </button>
                  <button onClick={deleteRoom} disabled={deleting} className="btn btn-danger flex-1">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {deleting ? 'Deleting…' : 'Delete for everyone'}
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="arm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => setConfirming(true)}
                  className="btn btn-danger w-full"
                >
                  <Trash2 size={14} />
                  Delete this room
                </motion.button>
              )}
            </AnimatePresence>

            {error && <p className="mt-2 text-[12.5px] text-accent-soft">{error}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ header */

function RoomHeader({ room, identity, onLeave, onOpenSettings }) {
  const [copied, setCopied] = useState(null);

  const copy = async (kind) => {
    const text =
      kind === 'link' ? `${window.location.origin}/#/room/${room.code}` : room.code;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked — the code is visible on screen anyway */
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <header className="glass-strong sticky top-0 z-40 border-x-0 border-t-0 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onLeave} className="btn-icon h-9 w-9 shrink-0" aria-label="Leave room">
          <ChevronLeft size={20} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-[16px] font-semibold tracking-tight">{room.name}</h1>
          {!room.connected && (
            <span className="flex shrink-0 items-center gap-1 rounded-pill bg-[#ff9f0a]/18 px-2 py-0.5 text-[10.5px] font-semibold text-[#ff9f0a]">
              <WifiOff size={10} /> Reconnecting
            </span>
          )}
        </div>

        <div className="hidden md:block">
          <ListenerRail
            listeners={room.listeners}
            hostId={room.hostId}
            youId={identity.id}
            isPlaying={room.playback.isPlaying}
            max={6}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip label="Room settings">
            <button onClick={onOpenSettings} className="btn-icon h-9 w-9" aria-label="Room settings">
              <Settings2 size={17} />
            </button>
          </Tooltip>
          <Tooltip label="Leave room">
            <button onClick={onLeave} className="btn-icon h-9 w-9 hover:!text-accent-soft" aria-label="Leave room">
              <LogOut size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 pl-[calc(2.25rem+0.75rem)]">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-white/40">
          {room.allowGuestControl ? <Unlock size={11} className="shrink-0" /> : <Lock size={11} className="shrink-0" />}
          <span className="truncate">
            {room.allowGuestControl ? 'Everyone can control' : 'Host controls playback'}
          </span>
          <span className="hidden shrink-0 text-white/20 sm:inline">·</span>
          <span className="hidden shrink-0 sm:inline">{pluralize(room.queue.length, 'track')}</span>
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <Tooltip label="Copy room code">
            <button onClick={() => copy('code')} className="btn btn-glass h-8 !gap-1.5 !px-2.5">
              <span className="tnum text-[13px] font-semibold tracking-[0.1em]">{room.code}</span>
              {copied === 'code' ? (
                <Check size={12} className="text-[#30d158]" strokeWidth={3} />
              ) : (
                <Copy size={12} className="text-white/45" />
              )}
            </button>
          </Tooltip>
          <Tooltip label="Copy invite link">
            <button onClick={() => copy('link')} className="btn-icon h-8 w-8" aria-label="Copy invite link">
              {copied === 'link' ? <Check size={14} className="text-[#30d158]" /> : <Link2 size={14} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------- screen */

export function RoomScreen({ room, identity, tracks, onTracksChanged, audio, read }) {
  const [tab, setTab] = useState('queue');
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const duration = room.currentItem?.duration ?? 0;
  const controlLockedReason = room.canControl
    ? ''
    : 'The host has playback locked for this room. You can still queue tracks and vote.';

  const actions = {
    play: room.play,
    pause: room.pause,
    seek: room.seek,
    next: room.next,
    previous: room.previous,
    react: room.react,
    updateSettings: room.updateSettings,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <RoomHeader
        room={room}
        identity={identity}
        onLeave={room.leave}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Explicit `minmax(0,1fr)` column even on mobile — without it the implicit
          grid track sizes to its content's max-width instead of the viewport,
          letting the now-playing column render wider than the screen. */}
      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-8 lg:py-10">
        {/* ------------------------------------------------------ now playing */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="flex items-start justify-center lg:items-center"
        >
          <NowPlaying
            item={room.currentItem}
            playback={room.playback}
            position={audio.position}
            duration={duration}
            isBuffering={audio.isBuffering}
            needsGesture={audio.needsGesture}
            drift={audio.drift}
            latency={audio.latency}
            onUnlock={audio.unlock}
            canControl={room.canControl}
            controlLockedReason={controlLockedReason}
            volume={audio.volume}
            muted={audio.muted}
            onVolume={audio.setVolume}
            onToggleMute={audio.toggleMute}
            reactions={room.reactions}
            read={read}
            actions={actions}
            isHost={room.isHost}
          />
        </motion.section>

        {/* ------------------------------------------------------- side panel */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
          className="glass glass-sheen flex h-[min(56svh,460px)] min-h-[320px] flex-col overflow-hidden rounded-panel lg:h-[min(680px,calc(100svh-140px))] lg:min-h-[420px] lg:sticky lg:top-[96px]"
        >
          <div className="p-3 pb-0">
            <div className="flex gap-0.5 rounded-pill bg-black/25 p-0.5">
              {[
                { key: 'queue', label: 'Queue', icon: ListMusic, badge: room.queue.length },
                { key: 'chat', label: 'Chat', icon: MessageCircle, badge: null },
              ].map((entry) => (
                <button
                  key={entry.key}
                  onClick={() => setTab(entry.key)}
                  className="relative flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-medium transition-colors duration-200"
                  aria-pressed={tab === entry.key}
                >
                  {tab === entry.key && (
                    <motion.span
                      layoutId="room-tab"
                      transition={spring}
                      className="absolute inset-0 rounded-pill bg-white/12"
                    />
                  )}
                  <span className={`relative flex items-center gap-1.5 ${tab === entry.key ? 'text-white' : 'text-white/45'}`}>
                    <entry.icon size={14} />
                    {entry.label}
                    {entry.badge ? (
                      <span className="tnum rounded-pill bg-white/12 px-1.5 text-[10.5px]">{entry.badge}</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {tab === 'queue' ? (
                  <QueuePanel
                    queue={room.queue}
                    currentQid={room.playback.currentQid}
                    currentIndex={room.currentIndex}
                    isPlaying={room.playback.isPlaying}
                    userId={identity.id}
                    canControl={room.canControl}
                    onJump={room.jumpTo}
                    onRemove={room.removeFromQueue}
                    onVote={room.vote}
                    onMove={room.moveInQueue}
                    onBrowse={() => setAddOpen(true)}
                  />
                ) : (
                  <ChatPanel
                    messages={room.chat}
                    onSend={room.sendChat}
                    identity={identity}
                    connected={room.connected}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      </div>

      <AddMusicModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        tracks={tracks}
        queue={room.queue}
        identity={identity}
        onQueue={room.addToQueue}
        onTracksChanged={onTracksChanged}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        room={room}
        isHost={room.isHost}
      />
    </div>
  );
}
