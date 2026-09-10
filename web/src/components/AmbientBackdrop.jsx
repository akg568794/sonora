import { AnimatePresence, motion } from 'framer-motion';

/**
 * The room's atmosphere: a hugely blurred, slowly drifting copy of the album art
 * behind three colour blobs sampled from that same art. It's the trick Apple
 * Music's full-screen player uses — the background is the artwork, just
 * defocused past recognition.
 */
export function AmbientBackdrop({ cover, isPlaying = true, intensity = 1 }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-900">
      {/* Wider chrome only kicks in at laptop-and-up widths — tablet and phone keep their own images below. */}
      <div
        className="absolute inset-0 hidden bg-cover bg-center opacity-40 lg:block"
        style={{ backgroundImage: 'url(/media/covers/laptop.png)' }}
      />
      <div
        className="absolute inset-0 hidden bg-cover bg-center opacity-40 md:block lg:hidden"
        style={{ backgroundImage: 'url(/media/covers/tablet.png)' }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 md:hidden"
        style={{ backgroundImage: 'url(/media/covers/mobile.png)' }}
      />

      <AnimatePresence mode="popLayout">
        {cover && (
          <motion.div
            key={cover}
            initial={{ opacity: 0, scale: 1.25 }}
            animate={{ opacity: 0.5 * intensity, scale: 1.35 }}
            exit={{ opacity: 0, scale: 1.45 }}
            transition={{ duration: 1.6, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${cover})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(90px) saturate(190%) brightness(0.72)',
            }}
          />
        )}
      </AnimatePresence>

      <div
        className={`absolute -left-[15%] -top-[20%] h-[70vmax] w-[70vmax] rounded-full ${
          isPlaying ? 'animate-drift' : ''
        }`}
        style={{
          background: `radial-gradient(circle at 50% 50%, rgb(var(--art-1) / ${0.42 * intensity}), transparent 68%)`,
          filter: 'blur(30px)',
        }}
      />
      <div
        className={`absolute -right-[20%] top-[5%] h-[62vmax] w-[62vmax] rounded-full ${
          isPlaying ? 'animate-drift' : ''
        }`}
        style={{
          background: `radial-gradient(circle at 50% 50%, rgb(var(--art-2) / ${0.4 * intensity}), transparent 68%)`,
          filter: 'blur(30px)',
          animationDelay: '-8s',
          animationDuration: '31s',
        }}
      />
      <div
        className={`absolute -bottom-[25%] left-[15%] h-[68vmax] w-[68vmax] rounded-full ${
          isPlaying ? 'animate-drift' : ''
        }`}
        style={{
          background: `radial-gradient(circle at 50% 50%, rgb(var(--art-3) / ${0.55 * intensity}), transparent 70%)`,
          filter: 'blur(30px)',
          animationDelay: '-16s',
          animationDuration: '27s',
        }}
      />

      {/* Vignette + a faint grain so the huge gradients don't band on cheap panels. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.72)_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
