// The hero as a printed woodblock: a glory of engraved rays behind the
// serpent, stars in the corners, and a banderole carrying the line.

import type { ReactNode } from "react";

const rad = (d: number) => (d * Math.PI) / 180;

// The glory is drawn in the serpent's own frame: centre (0,0), the serpent's
// spine at r=140 and its outer edge at r=158 (same units as Ouroboros).
const at = (deg: number, r: number) => `${(r * Math.cos(rad(deg))).toFixed(1)},${(r * Math.sin(rad(deg))).toFixed(1)}`;

/** Solid black wedges radiating from the serpent: a two-colour sunburst. */
function wedges() {
  const out: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i * 9;
    out.push(`M${at(a - 0.6, 150)} L${at(a - 3.2, 800)} L${at(a + 3.2, 800)} L${at(a + 0.6, 150)} Z`);
  }
  return out.join(" ");
}

/** Fine engraved lines between the wedges. */
function lines() {
  const out: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i * 9 + 4.5;
    out.push(`M${at(a, 170)} L${at(a, i % 2 ? 420 : 800)}`);
  }
  return out.join(" ");
}

const WEDGES = wedges();
const LINES = lines();

function Star({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x},${y}) scale(${s})`}
      d="M0,-12 L2.6,-2.6 L12,0 L2.6,2.6 L0,12 L-2.6,2.6 L-12,0 L-2.6,-2.6 Z"
      fill="var(--ink)"
    />
  );
}

export function Woodblock({ children }: { children: ReactNode }) {
  return (
    <div className="woodblock">
      <svg className="woodblock-art" viewBox="0 0 600 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <Star x={52} y={52} />
        <Star x={548} y={52} />
        <Star x={52} y={428} s={0.8} />
        <Star x={548} y={428} s={0.8} />
        <Star x={110} y={92} s={0.45} />
        <Star x={490} y={92} s={0.45} />
        <Star x={86} y={380} s={0.4} />
        <Star x={514} y={380} s={0.4} />
      </svg>
      <div className="woodblock-content">{children}</div>
    </div>
  );
}

/** Black wedges and fine rays behind the serpent, centred exactly on it. Place it
 *  inside .hero-sigil before the serpent; the woodblock clips it at the edges. */
export function Glory() {
  return (
    <svg className="glory" viewBox="-800 -800 1600 1600" aria-hidden="true">
      <path d={WEDGES} fill="var(--ink)" />
      <path d={LINES} stroke="var(--ink)" strokeWidth={1.6} />
      {/* black ring just outside the serpent, the cut edge of the roundel */}
      <circle r={166} fill="none" stroke="var(--ink)" strokeWidth={9} />
    </svg>
  );
}

/** A ribbon scroll carrying one line of text. */
export function Banderole({ children }: { children: ReactNode }) {
  return (
    <div className="banderole">
      <svg viewBox="0 0 640 90" preserveAspectRatio="none" aria-hidden="true">
        {/* tails folded behind */}
        <path d="M60,30 L6,30 L28,52 L6,74 L74,74 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
        <path d="M580,30 L634,30 L612,52 L634,74 L566,74 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
        <path d="M60,30 l14,-12 L74,62 Z M580,30 l-14,-12 L566,62 Z" fill="var(--ink)" />
        {/* the face of the ribbon, gently waved */}
        <path
          d="M74,18 Q200,6 320,16 T566,18 L566,62 Q440,74 320,64 T74,62 Z"
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <path d="M80,24 Q200,12 320,22 T560,24 M80,56 Q200,68 320,58 T560,56" fill="none" stroke="var(--ink)" strokeWidth={0.8} />
      </svg>
      <p>{children}</p>
    </div>
  );
}
