const KEY = 'sonora.identity.v1';

const ADJECTIVES = ['Midnight', 'Velvet', 'Neon', 'Golden', 'Silent', 'Electric', 'Cosmic', 'Amber'];
const NOUNS = ['Echo', 'Wave', 'Bloom', 'Static', 'Drift', 'Ember', 'Signal', 'Halo'];

const randomId = () =>
  `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const randomName = () =>
  `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${
    NOUNS[Math.floor(Math.random() * NOUNS.length)]
  }`;

export const randomHue = () => Math.floor(Math.random() * 360);

/** A stable guest identity kept in localStorage — no accounts, but you stay "you". */
export function loadIdentity() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (stored?.id && stored?.name) {
      return { id: stored.id, name: stored.name, hue: stored.hue ?? randomHue(), onboarded: true };
    }
  } catch {
    /* fall through to a fresh identity */
  }
  return { id: randomId(), name: '', hue: randomHue(), onboarded: false };
}

export function saveIdentity(identity) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ id: identity.id, name: identity.name, hue: identity.hue })
    );
  } catch {
    /* private browsing — identity just won't persist */
  }
  return identity;
}

/** Deterministic two-stop gradient per listener, so avatars are recognisable. */
export function avatarGradient(hue) {
  return `linear-gradient(145deg, hsl(${hue} 85% 62%), hsl(${(hue + 45) % 360} 80% 46%))`;
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
