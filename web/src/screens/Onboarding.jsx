import { motion } from 'framer-motion';
import { useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Avatar } from '../components/ui/Primitives.jsx';
import { randomHue, randomName } from '../lib/identity.js';

const HUES = [0, 24, 45, 90, 145, 190, 210, 250, 285, 320];

/** First-run screen: pick a name and a colour, and you're a person in the room. */
export function Onboarding({ identity, onComplete }) {
  const [name, setName] = useState(identity.name || '');
  const [hue, setHue] = useState(identity.hue ?? randomHue());

  const submit = (event) => {
    event.preventDefault();
    const finalName = name.trim() || randomName();
    onComplete({ ...identity, name: finalName, hue, onboarded: true });
  };

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        className="glass glass-sheen w-full max-w-[420px] rounded-panel p-8 shadow-lift"
      >
        <div className="mb-7 text-center">
          <div className="mb-5 inline-grid h-14 w-14 place-items-center rounded-[18px] bg-[rgb(var(--art-1))] shadow-[0_10px_30px_-8px_rgb(var(--art-1)/0.8)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none">
              <path
                d="M9 18.5a2.75 2.75 0 1 0 2.75-2.75V6.2l7.25-1.45v3L13.5 8.9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-[27px] font-bold tracking-tight">Welcome to Sonora</h1>
          <p className="mx-auto mt-2 max-w-[30ch] text-[14px] leading-relaxed text-white/50">
            Upload your music, open a room, and press play together — everyone hears the same
            moment at the same time.
          </p>
        </div>

        <div className="mb-6 flex flex-col items-center">
          <motion.div key={hue} initial={{ scale: 0.86 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
            <Avatar name={name || 'You'} hue={hue} size={76} ring />
          </motion.div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {HUES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setHue(option)}
                aria-label={`Colour ${option}`}
                aria-pressed={hue === option}
                className="h-7 w-7 rounded-full transition-transform duration-200 ease-spring hover:scale-110 active:scale-95"
                style={{
                  background: `linear-gradient(145deg, hsl(${option} 85% 62%), hsl(${(option + 45) % 360} 80% 46%))`,
                  boxShadow: hue === option ? '0 0 0 2px #08080a, 0 0 0 4px rgba(255,255,255,0.85)' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <label className="label-caps mb-2 block">Your name in rooms</label>
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Midnight Echo"
            maxLength={24}
            className="field"
          />
          <button
            type="button"
            onClick={() => setName(randomName())}
            aria-label="Suggest a name"
            className="btn btn-glass !px-3"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        <button type="submit" className="btn btn-primary mt-6 w-full !py-3 text-[15px]">
          Start listening
          <ArrowRight size={16} strokeWidth={2.5} />
        </button>
        <p className="mt-3 text-center text-[11.5px] text-white/30">
          No account needed — this stays on your device.
        </p>
      </motion.form>
    </div>
  );
}
