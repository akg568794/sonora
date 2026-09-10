import { customAlphabet, nanoid } from 'nanoid';

// No 0/O/1/I/L — room codes get read aloud and typed by hand.
const roomCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);

const CHAT_HISTORY = 200;
const ADVANCE_GRACE_MS = 250;
// Every play/seek/skip is scheduled this far in the future rather than applied
// immediately. Clients that receive the broadcast in time hold their position
// and start exactly on the dot instead of racing to catch up after the fact —
// which is what was making playback audibly speed up and slow down. A slower
// listener whose broadcast arrives after the moment has passed just falls back
// to the old catch-up correction, so this only ever helps.
const PLAY_LEAD_MS = 500;
// A guard against an implausible, near-instant 'ended' report (a stray event
// or a bad actor) — anything past this is trusted, since a real 'ended' event
// is stronger evidence than our stored (file-metadata-derived) duration
// estimate, which is sometimes a few seconds off from the real playable length.
const MIN_PLAYED_BEFORE_END_MS = 3000;

export const now = () => Date.now();

/**
 * A listening room. The server owns the authoritative playback clock: it stores
 * *when* the current track started rather than a ticking position, so any client
 * can derive an exact position from (startedAt, positionAtStart) once it knows
 * the server/client clock offset. That is what keeps everyone in sync.
 */
class Room {
  constructor({ code, name, host, onChange }) {
    this.code = code;
    this.name = name;
    this.hostId = host.id;
    this.createdAt = now();
    this.onChange = onChange;

    /** @type {Map<string, object>} keyed by persistent userId, not socket id */
    this.listeners = new Map();
    this.sockets = new Map(); // socketId -> userId

    this.queue = [];
    this.currentQid = null;
    this.isPlaying = false;
    this.positionAtStart = 0;
    this.startedAt = now();

    this.chat = [];
    this.repeat = 'off'; // 'off' | 'all' | 'one'
    this.shuffle = false;
    this.allowGuestControl = true;
    this.advanceTimer = null;
  }

  // ---------------------------------------------------------------- listeners

  addListener(socketId, user) {
    this.sockets.set(socketId, user.id);
    const existing = this.listeners.get(user.id);
    if (existing) {
      existing.connections += 1;
      existing.name = user.name;
      existing.hue = user.hue;
      return existing;
    }
    const listener = {
      id: user.id,
      name: user.name,
      hue: user.hue,
      joinedAt: now(),
      connections: 1,
    };
    this.listeners.set(user.id, listener);
    return listener;
  }

  removeSocket(socketId) {
    const userId = this.sockets.get(socketId);
    if (!userId) return null;
    this.sockets.delete(socketId);
    const listener = this.listeners.get(userId);
    if (!listener) return null;
    listener.connections -= 1;
    if (listener.connections > 0) return null; // still open in another tab
    this.listeners.delete(userId);
    if (this.hostId === userId) this.#promoteNewHost();
    return listener;
  }

  #promoteNewHost() {
    // Longest-present listener inherits the room so it never becomes leaderless.
    const next = [...this.listeners.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    this.hostId = next ? next.id : null;
  }

  get isEmpty() {
    return this.listeners.size === 0;
  }

  canControl(userId) {
    return this.allowGuestControl || this.hostId === userId;
  }

  // -------------------------------------------------------------------- queue

  get currentIndex() {
    if (!this.currentQid) return -1;
    return this.queue.findIndex((item) => item.qid === this.currentQid);
  }

  get current() {
    const idx = this.currentIndex;
    return idx === -1 ? null : this.queue[idx];
  }

  addToQueue(track, user, { playNow = false } = {}) {
    const item = {
      qid: nanoid(10),
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      cover: track.cover,
      // Carried on the queue item so clients never need to re-resolve the track
      // against their own copy of the library.
      url: track.url,
      addedBy: { id: user.id, name: user.name, hue: user.hue },
      addedAt: now(),
      votes: [],
    };
    this.queue.push(item);
    if (!this.currentQid || playNow) {
      this.playItem(item.qid, { autoplay: this.isPlaying || !this.currentQid });
    }
    return item;
  }

  removeFromQueue(qid) {
    const idx = this.queue.findIndex((item) => item.qid === qid);
    if (idx === -1) return false;
    const wasCurrent = this.currentQid === qid;
    this.queue.splice(idx, 1);
    if (wasCurrent) {
      // Fall through to whatever slid into this slot, else stop.
      const next = this.queue[idx] ?? this.queue[idx - 1] ?? null;
      if (next) this.playItem(next.qid, { autoplay: this.isPlaying });
      else this.stop();
    }
    return true;
  }

  moveInQueue(qid, toIndex) {
    const from = this.queue.findIndex((item) => item.qid === qid);
    if (from === -1) return false;
    const clamped = Math.max(0, Math.min(this.queue.length - 1, toIndex));
    const [item] = this.queue.splice(from, 1);
    this.queue.splice(clamped, 0, item);
    return true;
  }

  toggleVote(qid, userId) {
    const item = this.queue.find((i) => i.qid === qid);
    if (!item) return false;
    const at = item.votes.indexOf(userId);
    if (at === -1) item.votes.push(userId);
    else item.votes.splice(at, 1);
    this.#sortUpcomingByVotes();
    return true;
  }

  /**
   * Only the *upcoming* slice is re-ordered, and the sort is stable on add time,
   * so voting nudges a song forward without ever shuffling history or the
   * currently playing track out from under anyone.
   */
  #sortUpcomingByVotes() {
    const idx = this.currentIndex;
    const head = this.queue.slice(0, idx + 1);
    const tail = this.queue.slice(idx + 1);
    tail.sort((a, b) => b.votes.length - a.votes.length || a.addedAt - b.addedAt);
    this.queue = [...head, ...tail];
  }

  // ----------------------------------------------------------------- playback

  playItem(qid, { autoplay = true, position = 0 } = {}) {
    const item = this.queue.find((i) => i.qid === qid);
    if (!item) return false;
    this.currentQid = qid;
    this.positionAtStart = position;
    this.startedAt = now() + (autoplay ? PLAY_LEAD_MS : 0);
    this.isPlaying = autoplay;
    this.#scheduleAdvance();
    return true;
  }

  position() {
    if (!this.currentQid) return 0;
    if (!this.isPlaying) return this.positionAtStart;
    // Clamp: while startedAt is still in the future (the scheduled-start lead),
    // report the not-yet-moved position rather than going negative.
    return this.positionAtStart + Math.max(0, now() - this.startedAt) / 1000;
  }

  play() {
    if (!this.currentQid || this.isPlaying) return false;
    // Restart from the top if the last track had run to the end.
    const duration = this.current?.duration ?? 0;
    if (duration && this.positionAtStart >= duration - 0.25) this.positionAtStart = 0;
    this.startedAt = now() + PLAY_LEAD_MS;
    this.isPlaying = true;
    this.#scheduleAdvance();
    return true;
  }

  pause() {
    if (!this.isPlaying) return false;
    this.positionAtStart = this.position();
    this.isPlaying = false;
    this.#clearAdvance();
    return true;
  }

  seek(position) {
    if (!this.currentQid) return false;
    const duration = this.current?.duration ?? Infinity;
    this.positionAtStart = Math.max(0, Math.min(duration, position));
    this.startedAt = now() + (this.isPlaying ? PLAY_LEAD_MS : 0);
    this.#scheduleAdvance();
    return true;
  }

  /**
   * A client reporting that its <audio> element actually reached the end —
   * a safety net alongside `#scheduleAdvance`'s timer, since stored track
   * duration (parsed from file metadata) is sometimes a little off from the
   * real playable length. Whichever fires first wins; the qid check makes
   * the other one a no-op once the track has already moved on.
   */
  reportEnded(qid) {
    if (!qid || qid !== this.currentQid || !this.isPlaying) return false;
    if (now() - this.startedAt < MIN_PLAYED_BEFORE_END_MS) return false;
    this.next({ auto: true });
    return true;
  }

  next({ auto = false } = {}) {
    if (!this.queue.length) return false;
    if (auto && this.repeat === 'one') {
      return this.playItem(this.currentQid, { autoplay: true, position: 0 });
    }
    const idx = this.currentIndex;
    let nextIdx = idx + 1;
    if (this.shuffle && this.queue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * this.queue.length);
      } while (nextIdx === idx);
    }
    if (nextIdx >= this.queue.length) {
      if (this.repeat === 'all') nextIdx = 0;
      else {
        // Park on the last track, paused at its end.
        this.isPlaying = false;
        this.positionAtStart = this.current?.duration ?? 0;
        this.#clearAdvance();
        return true;
      }
    }
    return this.playItem(this.queue[nextIdx].qid, { autoplay: true });
  }

  previous() {
    if (!this.queue.length) return false;
    // Mirror every music player ever: restart the track unless you're near its start.
    if (this.position() > 3) return this.seek(0);
    const idx = this.currentIndex;
    const prevIdx = idx <= 0 ? (this.repeat === 'all' ? this.queue.length - 1 : 0) : idx - 1;
    return this.playItem(this.queue[prevIdx].qid, { autoplay: true });
  }

  stop() {
    this.currentQid = null;
    this.isPlaying = false;
    this.positionAtStart = 0;
    this.#clearAdvance();
  }

  /**
   * The server, not the clients, decides when a track is over. A client that is
   * backgrounded (and therefore throttled) can't stall the room, and no race
   * between listeners can double-skip.
   */
  #scheduleAdvance() {
    this.#clearAdvance();
    if (!this.isPlaying) return;
    const duration = this.current?.duration;
    if (!duration || !Number.isFinite(duration)) return;
    // Computed from startedAt directly (not position()) so the still-pending
    // scheduled-start lead is correctly included in the remaining time.
    const remainingMs = this.startedAt - now() + (duration - this.positionAtStart) * 1000 + ADVANCE_GRACE_MS;
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.next({ auto: true });
      this.onChange?.(this);
    }, Math.max(50, remainingMs));
  }

  #clearAdvance() {
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  dispose() {
    this.#clearAdvance();
  }

  // ---------------------------------------------------------------- chat/state

  addChat(user, text) {
    const message = {
      id: nanoid(8),
      userId: user.id,
      name: user.name,
      hue: user.hue,
      text: text.slice(0, 500),
      at: now(),
    };
    this.chat.push(message);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    return message;
  }

  playbackState() {
    return {
      currentQid: this.currentQid,
      isPlaying: this.isPlaying,
      positionAtStart: this.positionAtStart,
      startedAt: this.startedAt,
      position: this.position(),
      serverTime: now(),
      repeat: this.repeat,
      shuffle: this.shuffle,
    };
  }

  toJSON() {
    return {
      code: this.code,
      name: this.name,
      hostId: this.hostId,
      createdAt: this.createdAt,
      allowGuestControl: this.allowGuestControl,
      listeners: [...this.listeners.values()],
      queue: this.queue,
      chat: this.chat,
      playback: this.playbackState(),
    };
  }
}

export class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    this.onChange = null;
  }

  create({ name, host }) {
    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();
    const room = new Room({
      code,
      name: name?.trim()?.slice(0, 60) || `${host.name}'s room`,
      host,
      onChange: (r) => this.onChange?.(r),
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code ?? '').toUpperCase()) ?? null;
  }

  destroy(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
  }

  /** Public directory of rooms people can discover and drop into. */
  list() {
    return [...this.rooms.values()]
      .filter((room) => room.listeners.size > 0)
      .sort((a, b) => b.listeners.size - a.listeners.size || a.createdAt - b.createdAt)
      .map((room) => ({
        code: room.code,
        name: room.name,
        listeners: room.listeners.size,
        avatars: [...room.listeners.values()].slice(0, 5).map((l) => ({ name: l.name, hue: l.hue })),
        nowPlaying: room.current
          ? { title: room.current.title, artist: room.current.artist, cover: room.current.cover }
          : null,
        isPlaying: room.isPlaying,
      }));
  }
}
