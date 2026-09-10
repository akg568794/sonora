import { useRef } from 'react';

/**
 * Reads frequency data from an AnalyserNode that's already wired into the
 * playback graph (owned by `useSyncedAudio`) — there's no graph to build here
 * anymore, since a Web Audio buffer source is connected once, up front.
 */
export function useAudioAnalyser(analyserRef) {
  const dataRef = useRef(new Uint8Array(0));

  /** Fills and returns the shared byte array — call once per frame. */
  const read = () => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    if (dataRef.current.length !== analyser.frequencyBinCount) {
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(dataRef.current);
    return dataRef.current;
  };

  return { read };
}
