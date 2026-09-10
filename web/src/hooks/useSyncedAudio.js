import { useCallback, useEffect, useRef, useState } from 'react';
import { expectedPosition, serverClock, socket } from '../lib/socket.js';

// Anything under this and we leave it alone — chasing it would be audible.
const IN_SYNC = 0.045;
// Past this, nudging can't catch up in reasonable time, so we cut straight there.
const HARD_SEEK = 0.9;
// Ceiling on the rate change used to glide back. ±6% is inaudible on music;
// much more starts to sound like a tape warble.
const MAX_RATE_TRIM = 0.06;
const CORRECTION_INTERVAL = 1000;
// A transient network/decode hiccup shouldn't permanently kill playback —
// retry with backoff before giving up on the file.
const MAX_LOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 600;
// Decoded PCM is heavy (tens of MB per track) — only ever keep what's actually
// needed: the current track plus one prefetched track.
const MAX_CACHED_BUFFERS = 2;

/**
 * Web Audio based playback: tracks are fetched and fully decoded into an
 * AudioBuffer, then started with `AudioBufferSourceNode.start(when)`, where
 * `when` is expressed on the audio hardware's own clock rather than a
 * `setTimeout` + `<audio>.play()` pair. That removes JS-timer jitter from the
 * scheduled start entirely — once scheduled, the browser's audio engine fires
 * it exactly on time regardless of main-thread load.
 *
 * Two-tier drift correction still applies on top of that: small drift is
 * absorbed by nudging the source's playbackRate, and only large drift (a
 * suspended tab, a long stall) tears down and restarts the source at a fresh
 * offset. Everything is derived from server time, never a local timer, so
 * every listener converges on the same position independently.
 */
export function useSyncedAudio({ playback, track, nextTrack, volume = 1, muted = false }) {
  const ctxRef = useRef(null);
  const gainRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const sourceMetaRef = useRef({ qid: null, ctxStartTime: 0, offset: 0 });
  const bufferCacheRef = useRef(new Map()); // qid -> AudioBuffer
  const fetchingRef = useRef(new Map()); // qid -> Promise<AudioBuffer>

  const [position, setPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [drift, setDrift] = useState(0);
  // Position math is meaningless before the first clock probe resolves — wait
  // for it rather than scheduling playback against an assumed zero offset.
  const [clockReady, setClockReady] = useState(serverClock.ready);
  useEffect(() => serverClock.onChange(() => setClockReady(serverClock.ready)), []);
  // Bumped after a successful `unlock()` so the scheduling effect re-runs with
  // a context that's actually running (its clock is frozen while suspended).
  const [resumeSignal, setResumeSignal] = useState(0);

  // Latest values, readable from callbacks without re-subscribing listeners.
  const stateRef = useRef({ playback, track });
  stateRef.current = { playback, track };

  const getContext = () => {
    if (ctxRef.current) return ctxRef.current;
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    ctxRef.current = ctx;
    gainRef.current = gain;
    analyserRef.current = analyser;
    return ctx;
  };
  // Created during the first render rather than in an effect, so consumers
  // such as the visualiser's analyser find a real node on their first pass.
  getContext();

  useEffect(() => {
    const gain = gainRef.current;
    if (gain) gain.gain.value = muted ? 0 : Math.max(0, Math.min(1, volume));
  }, [volume, muted]);

  /** Called from a click/tap: browsers require a gesture to resume a suspended context. */
  const unlock = useCallback(async () => {
    const ctx = getContext();
    if (ctx?.state === 'suspended') {
      try {
        await ctx.resume();
        setResumeSignal((n) => n + 1);
      } catch {
        return;
      }
    }
    setNeedsGesture(false);
  }, []);

  // ------------------------------------------------------------- buffer cache

  const loadBuffer = useCallback((qid, url) => {
    if (!qid || !url) return Promise.resolve(null);
    const cached = bufferCacheRef.current.get(qid);
    if (cached) return Promise.resolve(cached);
    const inFlight = fetchingRef.current.get(qid);
    if (inFlight) return inFlight;

    const ctx = getContext();
    const attempt = (n) =>
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((buf) => ctx.decodeAudioData(buf))
        .catch((err) => {
          if (n >= MAX_LOAD_RETRIES) throw err;
          return new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** n)).then(() =>
            attempt(n + 1)
          );
        });

    const promise = attempt(0)
      .then((decoded) => {
        const cache = bufferCacheRef.current;
        cache.set(qid, decoded);
        while (cache.size > MAX_CACHED_BUFFERS) cache.delete(cache.keys().next().value);
        return decoded;
      })
      .finally(() => fetchingRef.current.delete(qid));

    fetchingRef.current.set(qid, promise);
    return promise;
  }, []);

  // Decode the current track, and report back once it's ready — the server
  // waits on this (the load handshake) before committing to a start time.
  useEffect(() => {
    const qid = playback?.currentQid;
    if (!qid || !track?.url) return;
    let cancelled = false;
    setIsBuffering(true);
    loadBuffer(qid, track.url)
      .then(() => {
        if (cancelled) return;
        setIsBuffering(false);
        socket.emit('playback:loaded', { qid });
      })
      .catch(() => {
        if (!cancelled) setIsBuffering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playback?.currentQid, track?.url, loadBuffer]);

  // Prefetch the next queued track while the current one plays, so the
  // transition to it never depends on a fresh request landing on cue.
  useEffect(() => {
    if (!nextTrack?.qid || !nextTrack?.url) return;
    loadBuffer(nextTrack.qid, nextTrack.url).catch(() => {});
  }, [nextTrack?.qid, nextTrack?.url, loadBuffer]);

  // --------------------------------------------------------- playback engine

  const stopSource = useCallback(() => {
    const src = sourceRef.current;
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
  }, []);

  /** BufferSourceNodes are one-shot — a fresh one is created every time we (re)start. */
  const startSource = useCallback(
    (buffer, qid, { when, offset }) => {
      const ctx = getContext();
      stopSource();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainRef.current);
      source.onended = () => {
        // A stop from a hard-correction or track change also fires this, but
        // those null the handler out first (see stopSource) — so reaching
        // here means the buffer genuinely played to its end.
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        const currentQid = stateRef.current.playback?.currentQid;
        if (currentQid) socket.emit('playback:ended', { qid: currentQid });
      };
      source.start(when, offset);
      sourceRef.current = source;
      sourceMetaRef.current = { qid, ctxStartTime: when, offset };
      return source;
    },
    [stopSource]
  );

  // Schedule (or reschedule) playback whenever the server's timeline changes.
  useEffect(() => {
    const qid = playback?.currentQid;
    if (!qid || !track?.url) {
      stopSource();
      setPosition(0);
      return;
    }
    // Position math needs a real clock offset, and the AudioContext clock is
    // frozen while suspended — both make "now" unreliable to schedule against.
    if (!serverClock.ready) return;
    const ctx = getContext();
    if (ctx.state === 'suspended') {
      setNeedsGesture(true);
      return;
    }

    const buffer = bufferCacheRef.current.get(qid);
    if (!buffer) return; // still decoding — the load effect above re-triggers this once cached

    if (!playback.isPlaying) {
      stopSource();
      setPosition(playback.positionAtStart);
      return;
    }

    // Already the live, scheduled instance for this qid — the correction loop
    // owns fine-tuning from here.
    if (sourceMetaRef.current.qid === qid && sourceRef.current) return;

    const leadMs = playback.startedAt - serverClock.now();
    const when = ctx.currentTime + Math.max(0, leadMs) / 1000;
    // Joining after the moment already passed: start already caught up to
    // where the room actually is, instead of at the beginning.
    const offset = Math.max(0, playback.positionAtStart + Math.max(0, -leadMs) / 1000);
    startSource(buffer, qid, { when, offset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playback?.isPlaying,
    playback?.startedAt,
    playback?.positionAtStart,
    playback?.currentQid,
    track?.url,
    clockReady,
    isBuffering,
    resumeSignal,
  ]);

  // ---------------------------------------------------------- drift correction

  useEffect(() => {
    if (!playback?.isPlaying || !track?.url) return;
    const qid = playback.currentQid;
    // A raw delta sample is noisy on a laggy connection — chasing every
    // reading directly makes playbackRate flap, which is audible as the track
    // speeding up and slowing down. Smoothing damps that.
    let smoothedDelta = 0;

    const correct = () => {
      const src = sourceRef.current;
      const ctx = ctxRef.current;
      const meta = sourceMetaRef.current;
      if (!src || !ctx || !serverClock.ready || meta.qid !== qid) return;
      const elapsed = ctx.currentTime - meta.ctxStartTime;
      if (elapsed < 0) return; // scheduled start hasn't actually happened yet

      const actualPosition = meta.offset + elapsed * src.playbackRate.value;
      const target = expectedPosition(stateRef.current.playback);
      const rawDelta = target - actualPosition;
      smoothedDelta += 0.5 * (rawDelta - smoothedDelta);
      setDrift(smoothedDelta);

      if (Math.abs(rawDelta) > HARD_SEEK) {
        const buffer = bufferCacheRef.current.get(qid);
        if (buffer) startSource(buffer, qid, { when: ctx.currentTime, offset: Math.max(0, target) });
        smoothedDelta = 0;
        return;
      }
      if (Math.abs(smoothedDelta) < IN_SYNC) {
        if (src.playbackRate.value !== 1) src.playbackRate.value = 1;
        return;
      }
      // Aim to erase the gap over roughly the next two seconds.
      const trim = Math.max(-MAX_RATE_TRIM, Math.min(MAX_RATE_TRIM, smoothedDelta / 2));
      const nextRate = 1 + trim;
      // Skip rewrites too small to be audible so sub-tick jitter can't keep
      // nudging playbackRate back and forth.
      if (Math.abs(nextRate - src.playbackRate.value) > 0.004) src.playbackRate.value = nextRate;
    };

    const timer = setInterval(correct, CORRECTION_INTERVAL);
    correct();

    // A backgrounded tab is throttled and will be badly behind on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        smoothedDelta = 0;
        correct();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if (sourceRef.current) sourceRef.current.playbackRate.value = 1;
    };
  }, [playback?.isPlaying, playback?.startedAt, playback?.currentQid, track?.url, startSource]);

  // ----------------------------------------------------------- UI position tick

  useEffect(() => {
    if (!playback?.isPlaying) return;
    let frame;
    let last = 0;
    const tick = (now) => {
      // ~15fps is plenty for a progress bar and much kinder than every frame.
      if (now - last > 66) {
        last = now;
        const ctx = ctxRef.current;
        const src = sourceRef.current;
        const meta = sourceMetaRef.current;
        const pos =
          src && ctx && meta.qid === playback.currentQid
            ? Math.max(0, meta.offset + (ctx.currentTime - meta.ctxStartTime) * src.playbackRate.value)
            : expectedPosition(stateRef.current.playback);
        setPosition(pos);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback?.isPlaying, playback?.currentQid]);

  // --------------------------------------------------------------- OS niceties

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: track.title ?? 'Unknown',
      artist: track.artist ?? '',
      album: track.album ?? 'Sonora',
      artwork: track.cover
        ? [{ src: new URL(track.cover, window.location.origin).href, sizes: '512x512' }]
        : [],
    });
    navigator.mediaSession.playbackState = playback?.isPlaying ? 'playing' : 'paused';
  }, [track, playback?.isPlaying]);

  // Release everything only when the hook itself goes away.
  useEffect(
    () => () => {
      stopSource();
      ctxRef.current?.close().catch(() => {});
    },
    [stopSource]
  );

  return { analyserRef, position, isBuffering, needsGesture, drift, unlock };
}
