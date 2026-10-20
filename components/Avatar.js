'use client';

/* Circular avatar with an initial, coloured deterministically from the name. */

export function hueOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function avatarStyle(name) {
  const h = hueOf(name || '?');
  return {
    backgroundImage: `linear-gradient(135deg, hsl(${h} 72% 58%), hsl(${(h + 40) % 360} 74% 52%))`,
  };
}

export default function Avatar({ name, size = 44, online = false, showStatus = false }) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className="avatar"
      style={{ ...avatarStyle(name), width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initial}
      {showStatus && <span className={'status' + (online ? ' on' : '')} />}
    </span>
  );
}
