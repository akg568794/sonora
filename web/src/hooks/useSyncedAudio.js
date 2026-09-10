import { useCallback, useEffect, useRef, useState } from 'react';
import { expectedPosition, serverClock } from '../lib/socket.js';

// Anything under this and we leave it alone — chasing it would be audible.
const IN_SYNC = 0.045;
// Past this, nudging can't catch up in reasonable time, so we cut straight there.
const HARD_SEEK = 0.9;
// Ceiling on the rate change used to glide back. ±6% is inaudible on music;
// much more starts to sound like a tape warble.
const MAX_RATE_TRIM = 0.06;
const CORRECTION_INTERVAL = 1000;

/**
 * Keeps a local <audio> element locked to the room's authoritative playhead.
 *
 * Two-tier correction: small drift is absorbed by very slightly changing
 * playbackRate so the music glides back into place with no audible seam, and
 * only large drift (a tab that was suspended, a long buffer stall) gets a hard
 * seek. Everything is derived from server time, never from a local timer, so
 * every listener converges on the same position independently.
 */
export function useSyncedAudio({ playback, track, volume = 1, muted = false }) {
  const audioRef = useRef(null);
  // Created during the first render rather than in an effect, so consumers such
  // as the visualiser's analyser find a real element on their first pass.
  if (!audioRef.current && typeof window !== 'undefined') {
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    audioRef.current = el;
  }

  const [position, setPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [drift, setDrift] = useState(0);

  // Latest values, readable from callbacks without re-subscribing listeners.
  const stateRef = useRef({ playback, track });
  stateRef.current = { playback, track };
  const pendingSeekRef = useRef(null);
  const loadedTrackRef = useRef(null);

  const getAudio = () => audioRef.current;

  /** Attempt playback, surfacing the browser's autoplay block as a UI prompt. */
  const attemptPlay = useCallback(async () => {
    const audio = getAudio();
    try {
      await audio.play();
      setNeedsGesture(false);
      return true;
    } catch (err) {
      // NotAllowedError => no user gesture yet. Anything else is a real failure.
      if (err?.name === 'NotAllowedError') setNeedsGesture(true);
      return false;
    }
  }, []);

  /** Called from a click/tap: satisfies autoplay policy and re-syncs. */
  const unlock = useCallback(async () => {
    const audio = getAudio();
    const { playback: pb } = stateRef.current;
    audio.muted = false;
    if (pb?.isPlaying) {
      audio.currentTime = Math.max(0, expectedPosition(pb));
      await attemptPlay();
    } else {
      setNeedsGesture(false);
    }
  }, [attemptPlay]);

  // ------------------------------------------------------------ element wiring

  useEffect(() => {
    const audio = getAudio();
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onLoaded = () => {
      setIsBuffering(false);
      // Apply a seek that arrived before the file had metadata to seek within.
      if (pendingSeekRef.current != null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }
    };
    const onError = () => setIsBuffering(false);

    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('stalled', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onPlaying);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('stalled', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('canplay', onPlaying);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    const audio = getAudio();
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.muted = muted;
  }, [volume, muted]);

  // Release the element only when the hook itself goes away.
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    },
    []
  );

  // ------------------------------------------------------------- track loading

  useEffect(() => {
    const audio = getAudio();

    if (!track?.url) {
      audio.pause();
      loadedTrackRef.current = null;
      setPosition(0);
      return;
    }

    // Reload only when the source actually changes; re-seeking the same file on
    // every state broadcast would stutter constantly.
    const trackKey = `${playback?.currentQid ?? ''}:${track.url}`;
    if (loadedTrackRef.current !== trackKey) {
      loadedTrackRef.current = trackKey;
      audio.src = track.url;
      const target = Math.max(0, expectedPosition(playback));
      pendingSeekRef.current = target;
      audio.load();
      setIsBuffering(true);
    }

    if (playback?.isPlaying) attemptPlay();
    else audio.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.url, playback?.currentQid]);

  // --------------------------------------------------- play/pause + seek intent

  useEffect(() => {
    const audio = getAudio();
    if (!track?.url || !playback?.currentQid) return;

    if (playback.isPlaying) {
      const leadMs = playback.startedAt - serverClock.now();
      // The server schedules this start a little in the future. Hold here and
      // fire `play()` right on the scheduled moment instead of starting now and
      // scrambling to catch up — that scramble is what reads as the track
      // audibly speeding up right after every seek, resume, or skip.
      if (serverClock.ready && leadMs > 20) {
        audio.pause();
        const hold = Math.max(0, playback.positionAtStart);
        if (audio.readyState > 0) audio.currentTime = hold;
        else pendingSeekRef.current = hold;
        audio.playbackRate = 1;
        setPosition(hold);
        const timer = setTimeout(() => {
          audio.currentTime = Math.max(0, expectedPosition(stateRef.current.playback));
          attemptPlay();
        }, leadMs);
        return () => clearTimeout(timer);
      }

      const target = Math.max(0, expectedPosition(playback));
      // A remote seek (or a resume after a long pause) shows up as a big gap.
      if (Math.abs(audio.currentTime - target) > HARD_SEEK) {
        if (audio.readyState > 0) audio.currentTime = target;
        else pendingSeekRef.current = target;
      }
      if (audio.paused) attemptPlay();
    } else {
      if (!audio.paused) audio.pause();
      const target = Math.max(0, playback.positionAtStart);
      if (Math.abs(audio.currentTime - target) > 0.25) {
        if (audio.readyState > 0) audio.currentTime = target;
        else pendingSeekRef.current = target;
      }
      audio.playbackRate = 1;
      setPosition(target);
    }
    // startedAt changes on every server-side seek, which is exactly when we want
    // to re-evaluate our position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.isPlaying, playback?.startedAt, playback?.positionAtStart, track?.url]);


  // ---------------------------------------------------------- drift correction

  useEffect(() => {
    if (!playback?.isPlaying || !track?.url) return;
    const audio = getAudio();
    // A raw delta sample is noisy on a laggy connection (offset jitter, a GC
    // pause) — chasing every reading directly makes playbackRate flap between
    // values, which is audible as the track speeding up and slowing down.
    // Smoothing it damps that without slowing down genuine drift correction.
    let smoothedDelta = 0;

    const correct = () => {
      if (audio.paused || audio.readyState < 2 || !serverClock.ready) return;
      const target = expectedPosition(stateRef.current.playback);
      const rawDelta = target - audio.currentTime;
      smoothedDelta += 0.5 * (rawDelta - smoothedDelta);
      setDrift(smoothedDelta);

      if (Math.abs(rawDelta) > HARD_SEEK) {
        audio.currentTime = Math.max(0, target);
        audio.playbackRate = 1;
        smoothedDelta = 0;
        return;
      }
      if (Math.abs(smoothedDelta) < IN_SYNC) {
        if (audio.playbackRate !== 1) audio.playbackRate = 1;
        return;
      }
      // Aim to erase the gap over roughly the next two seconds.
      const trim = Math.max(-MAX_RATE_TRIM, Math.min(MAX_RATE_TRIM, smoothedDelta / 2));
      const nextRate = 1 + trim;
      // Skip rewrites too small to be audible so sub-tick jitter can't keep
      // nudging playbackRate back and forth.
      if (Math.abs(nextRate - audio.playbackRate) > 0.004) audio.playbackRate = nextRate;
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
      audio.playbackRate = 1;
    };
  }, [playback?.isPlaying, playback?.startedAt, track?.url]);


  // ----------------------------------------------------------- UI position tick

  useEffect(() => {
    if (!playback?.isPlaying) return;
    let frame;
    let last = 0;
    const tick = (now) => {
      // ~15fps is plenty for a progress bar and much kinder than every frame.
      if (now - last > 66) {
        last = now;
        const audio = audioRef.current;
        const pos =
          audio && !audio.paused && audio.readyState > 0
            ? audio.currentTime
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

  return { audioRef, position, isBuffering, needsGesture, drift, unlock };
}
