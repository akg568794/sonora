import { useEffect, useRef, useState } from 'react';

const SOURCE_KEY = Symbol.for('sonora.mediaSource');

/**
 * Taps the playing <audio> element for frequency data.
 *
 * Two constraints shape this: a MediaElementAudioSourceNode can only ever be
 * created once per element (so it's cached on the element itself), and once the
 * element is routed into a graph it stops going to the speakers unless we
 * explicitly connect through to the destination.
 */
export function useAudioAnalyser(audioRef, { fftSize = 128, smoothing = 0.82, active = true } = {}) {
  const analyserRef = useRef(null);
  const dataRef = useRef(new Uint8Array(fftSize / 2));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;

    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;

    let cancelled = false;
    let context;

    try {
      const cached = audio[SOURCE_KEY];
      context = cached?.context ?? new Ctx();
      const source = cached?.source ?? context.createMediaElementSource(audio);

      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothing;

      source.connect(analyser);
      analyser.connect(context.destination);

      audio[SOURCE_KEY] = { context, source };
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setReady(true);

      // Browsers start the context suspended until a gesture happens.
      const resume = () => {
        if (!cancelled && context.state === 'suspended') context.resume().catch(() => {});
      };
      resume();
      document.addEventListener('pointerdown', resume);
      document.addEventListener('keydown', resume);

      return () => {
        cancelled = true;
        document.removeEventListener('pointerdown', resume);
        document.removeEventListener('keydown', resume);
        try {
          analyser.disconnect();
          // Keep audio audible: re-attach the cached source straight to output.
          source.connect(context.destination);
        } catch {
          /* already torn down */
        }
        analyserRef.current = null;
        setReady(false);
      };
    } catch {
      // WebAudio unavailable or the element is cross-origin without CORS —
      // the visualiser simply falls back to its idle animation.
      setReady(false);
      return undefined;
    }
  }, [audioRef, fftSize, smoothing, active]);

  /** Fills and returns the shared byte array — call once per frame. */
  const read = () => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    analyser.getByteFrequencyData(dataRef.current);
    return dataRef.current;
  };

  return { read, ready };
}
