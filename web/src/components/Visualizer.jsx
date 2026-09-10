import { useEffect, useRef } from 'react';

/**
 * Frequency bars drawn on a canvas, tuned so it looks musical rather than
 * technical: bins are grouped logarithmically (so bass doesn't dominate the
 * left third), each bar eases toward its target instead of snapping, and when
 * there's no analyser data it breathes gently on its own.
 */
export function Visualizer({ read, isPlaying, bars = 48, className = '', height = 64, mirror = true }) {
  const canvasRef = useRef(null);
  const levelsRef = useRef(new Float32Array(bars));
  const phaseRef = useRef(0);

  useEffect(() => {
    levelsRef.current = new Float32Array(bars);
  }, [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const readVar = (name, fallback) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return raw || fallback;
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const data = read?.();
      const levels = levelsRef.current;
      phaseRef.current += isPlaying ? 0.05 : 0.018;

      for (let i = 0; i < bars; i += 1) {
        let target;
        if (data && data.length && isPlaying) {
          // Logarithmic bin mapping: low bars cover few bins, high bars cover many.
          const t = i / bars;
          const start = Math.floor((data.length - 1) * t ** 1.85);
          const end = Math.max(start + 1, Math.floor((data.length - 1) * ((i + 1) / bars) ** 1.85));
          let sum = 0;
          for (let b = start; b < end; b += 1) sum += data[b];
          const avg = sum / (end - start) / 255;
          // Lift the treble end, which is always quieter in raw FFT output.
          target = Math.min(1, avg * (1 + t * 1.5));
        } else {
          // Idle: a slow travelling wave so the panel never looks dead.
          const wave = Math.sin(phaseRef.current + i * 0.35) * 0.5 + 0.5;
          target = 0.06 + wave * (isPlaying ? 0.22 : 0.1);
        }
        // Fast attack, slow release — how a real level meter behaves.
        const smoothing = target > levels[i] ? 0.45 : 0.14;
        levels[i] += (target - levels[i]) * smoothing;
      }

      const gap = Math.max(1.5, w / bars * 0.28);
      const barWidth = Math.max(1.5, (w - gap * (bars - 1)) / bars);
      const baseline = mirror ? h / 2 : h;
      const maxHeight = mirror ? h / 2 - 1 : h - 1;

      const c1 = readVar('--art-1', '250 36 60');
      const c2 = readVar('--art-2', '88 86 214');
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, `rgb(${c1} / 0.95)`);
      gradient.addColorStop(0.55, `rgb(${c2} / 0.9)`);
      gradient.addColorStop(1, `rgb(${c1} / 0.8)`);
      ctx.fillStyle = gradient;

      for (let i = 0; i < bars; i += 1) {
        const barHeight = Math.max(2, levels[i] * maxHeight);
        const x = i * (barWidth + gap);
        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        if (mirror) {
          ctx.roundRect(x, baseline - barHeight, barWidth, barHeight * 2, radius);
        } else {
          ctx.roundRect(x, baseline - barHeight, barWidth, barHeight, radius);
        }
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [read, isPlaying, bars, mirror]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`w-full ${className}`}
      style={{ height, display: 'block' }}
    />
  );
}
