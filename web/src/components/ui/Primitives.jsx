import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { avatarGradient, initials } from '../../lib/identity.js';

export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
export const softSpring = { type: 'spring', stiffness: 260, damping: 28 };

/* ------------------------------------------------------------------- Avatar */

export function Avatar({ name, hue = 210, size = 32, ring = false, className = '' }) {
  return (
    <div
      className={`drag-none relative grid shrink-0 place-items-center rounded-full font-semibold text-white/95 ${className}`}
      style={{
        width: size,
        height: size,
        background: avatarGradient(hue),
        fontSize: Math.max(9, size * 0.36),
        boxShadow: ring
          ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px hsl(${hue} 85% 55% / 0.5)`
          : '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
      }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}

/* ------------------------------------------------------------------ Tooltip */

export function Tooltip({ label, children, side = 'top' }) {
  const [open, setOpen] = useState(false);
  const offset = side === 'top' ? { bottom: '135%' } : { top: '135%' };
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onPointerDown={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && label && (
          <motion.span
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={offset}
            className="glass-strong pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[11.5px] font-medium text-white/90"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* -------------------------------------------------------------------- Switch */

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label
      className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-45' : 'cursor-pointer'}`}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-white/90">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-white/45">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        data-on={checked}
        className="switch"
        onClick={() => !disabled && onChange(!checked)}
      />
    </label>
  );
}

/* --------------------------------------------------------------------- Modal */

export function Modal({ open, onClose, title, children, maxWidth = 460 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ scale: 0.94, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={spring}
            style={{ maxWidth }}
            className="glass-strong glass-sheen relative w-full rounded-panel p-6 shadow-lift"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
              <button className="btn-icon h-7 w-7" onClick={onClose} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------- Slider */

/**
 * Pointer-driven scrubber that behaves like Apple's: it grows on hover, tracks
 * the drag past the element's bounds, and only commits on release so the value
 * doesn't fight incoming remote updates mid-drag.
 */
export function Slider({
  value,
  max = 1,
  onCommit,
  onDragChange,
  disabled,
  ariaLabel,
  height = 6,
  showThumb = true,
}) {
  const trackRef = useRef(null);
  const [dragValue, setDragValue] = useState(null);
  const [hovered, setHovered] = useState(false);
  const dragging = dragValue !== null;
  const shown = dragging ? dragValue : value;
  const pct = max > 0 ? Math.max(0, Math.min(1, shown / max)) * 100 : 0;

  const valueFromEvent = (event) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return ratio * max;
  };

  const onPointerDown = (event) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = valueFromEvent(event);
    setDragValue(next);
    onDragChange?.(next);
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    const next = valueFromEvent(event);
    setDragValue(next);
    onDragChange?.(next);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    onCommit?.(dragValue);
    setDragValue(null);
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    const step = max / 40;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      onCommit?.(Math.min(max, value + step));
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      onCommit?.(Math.max(0, value - step));
      event.preventDefault();
    }
  };

  const active = hovered || dragging;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(shown)}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={onKeyDown}
      className={`group relative flex touch-none items-center ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
      style={{ height: height + 14, marginBlock: -7 }}
    >
      <div
        className="relative w-full overflow-hidden rounded-pill bg-white/15 transition-all duration-200 ease-apple"
        style={{ height: active ? height + 2 : height }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-pill"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, rgb(var(--art-1)), rgb(var(--art-2)))',
            transition: dragging ? 'none' : 'width 0.12s linear',
          }}
        />
      </div>
      {showThumb && (
        <div
          className="pointer-events-none absolute top-1/2 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.55)] transition-all duration-200 ease-apple"
          style={{
            left: `${pct}%`,
            width: active ? 14 : 0,
            height: active ? 14 : 0,
            transform: 'translate(-50%, -50%)',
            opacity: active ? 1 : 0,
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- EmptyState */

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <div className="glass mb-5 grid h-16 w-16 place-items-center rounded-[22px] text-white/45">
          <Icon size={26} strokeWidth={1.6} />
        </div>
      )}
      <h3 className="text-[17px] font-semibold tracking-tight text-white/90">{title}</h3>
      {children && <p className="mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-white/45">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Album art */

export function CoverArt({ src, alt, size, rounded = 'rounded-card', className = '', animate = false }) {
  const [failed, setFailed] = useState(false);
  const style = size ? { width: size, height: size } : undefined;

  if (!src || failed) {
    return (
      <div
        style={style}
        className={`drag-none relative grid shrink-0 place-items-center overflow-hidden ${rounded} ${className}`}
        aria-label={alt}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(150deg, rgb(var(--art-1) / 0.55), rgb(var(--art-2) / 0.45) 60%, rgb(var(--art-3) / 0.9))',
          }}
        />
        <svg viewBox="0 0 24 24" className="relative h-[38%] w-[38%] text-white/70" fill="none">
          <path
            d="M9 18.5a2.75 2.75 0 1 0 2.75-2.75V6.2l7.25-1.45v3L13.5 8.9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      draggable={false}
      onError={() => setFailed(true)}
      className={`drag-none shrink-0 bg-white/5 object-cover ${rounded} ${className} ${
        animate ? 'transition-transform duration-700 ease-apple' : ''
      }`}
    />
  );
}
