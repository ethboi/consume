// The stomach's contents drawn as an apothecary shelf: ten jars, each heaped
// with coins in proportion to the USD it holds (relative to the fullest jar),
// in the manner of a woodcut. A tag hangs from the shelf under each jar with
// the memecoin's name and what the jar is worth, so the heaps stay in view.
// The serpent itself is the frame: its body runs round the shelves and it
// bites its tail at the top, so everything on them is inside it.

import { SerpentHead } from "./Ouroboros";

export type Jar = { symbol: string; usd: number; open: boolean };

type Shape = { body: (cx: number, by: number) => string; extra: (cx: number, by: number) => string; fill: number; label: number };

const SHAPES: Record<string, Shape> = {
  // waisted apothecary jar with a lid
  albarello: {
    body: (c, b) =>
      `M${c - 32},${b} L${c - 32},${b - 20} Q${c - 25},${b - 75} ${c - 32},${b - 128} L${c - 29},${b - 136} L${c + 29},${b - 136} L${c + 32},${b - 128} Q${c + 25},${b - 75} ${c + 32},${b - 20} L${c + 32},${b} Z`,
    extra: (c, b) => `M${c - 35},${b - 136} h70 v-10 h-70 Z M${c - 8},${b - 146} q8,-12 16,0`,
    fill: 128,
    label: 74,
  },
  // long-necked round flask
  flask: {
    body: (c, b) => `M${c - 8},${b - 150} L${c - 8},${b - 95} A47 47 0 1 0 ${c + 8},${b - 95} L${c + 8},${b - 150} Z`,
    extra: (c, b) => `M${c - 10},${b - 150} h20 v-12 h-20 Z`,
    fill: 97,
    label: 46,
  },
  // squared bottle with a cork
  bottle: {
    body: (c, b) =>
      `M${c - 30},${b} L${c - 30},${b - 108} Q${c - 30},${b - 120} ${c - 12},${b - 124} L${c - 10},${b - 140} L${c + 10},${b - 140} L${c + 12},${b - 124} Q${c + 30},${b - 120} ${c + 30},${b - 108} L${c + 30},${b} Z`,
    extra: (c, b) => `M${c - 8},${b - 140} h16 v-13 h-16 Z`,
    fill: 110,
    label: 58,
  },
  // squat crock with a domed lid
  crock: {
    body: (c, b) =>
      `M${c - 36},${b} L${c - 38},${b - 58} Q${c - 40},${b - 86} ${c - 26},${b - 90} L${c + 26},${b - 90} Q${c + 40},${b - 86} ${c + 38},${b - 58} L${c + 36},${b} Z`,
    extra: (c, b) => `M${c - 29},${b - 90} Q${c},${b - 116} ${c + 29},${b - 90} Z M${c - 5},${b - 109} a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0`,
    fill: 88,
    label: 46,
  },
  // pear-shaped ewer
  pear: {
    body: (c, b) =>
      `M${c - 10},${b - 148} L${c - 10},${b - 120} C${c - 10},${b - 104} ${c - 38},${b - 82} ${c - 38},${b - 42} C${c - 38},${b - 10} ${c - 24},${b} ${c},${b} C${c + 24},${b} ${c + 38},${b - 10} ${c + 38},${b - 42} C${c + 38},${b - 82} ${c + 10},${b - 104} ${c + 10},${b - 120} L${c + 10},${b - 148} Z`,
    extra: (c, b) => `M${c - 14},${b - 148} h28 v-6 h-28 Z`,
    fill: 118,
    label: 44,
  },
};

const ROWS: [string[], number][] = [
  [["albarello", "flask", "bottle", "crock", "pear"], 186],
  [["pear", "crock", "albarello", "flask", "bottle"], 438],
];
const SLOT = 104;
const LEFT = 72;

const COIN_R = 9.5;
const ROW_H = 14; // rows overlap a little, like coins lying on one another

/** A small repeatable scatter, so the heap looks tipped in rather than ruled. */
function jitter(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Coins heaped from the jar's floor up to `height`, lowest row first. At least one row if the jar holds anything. */
function heap(cx: number, base: number, height: number, seed: number): { x: number; y: number; red: boolean }[] {
  const rows = Math.max(1, Math.round(height / ROW_H));
  const out: { x: number; y: number; red: boolean }[] = [];
  for (let r = 0; r < rows; r++) {
    const y = base - COIN_R - 1 - r * ROW_H;
    const shift = r % 2 ? COIN_R + 0.5 : 0;
    for (let c = -3; c <= 3; c++) {
      const n = seed * 97 + r * 13 + c;
      out.push({
        x: Math.round((cx + c * (COIN_R * 2 + 1) + shift - COIN_R / 2 + (jitter(n) - 0.5) * 4) * 10) / 10,
        y: Math.round((y + (jitter(n + 0.5) - 0.5) * 3) * 10) / 10,
        red: jitter(n + 0.25) > 0.86,
      });
    }
  }
  return out;
}

function worth(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

// ---- the serpent round the shelves ----
// Its spine is a rounded rectangle walked clockwise from the neck (top, just
// right of centre) all the way round to the tail tip inside the open jaws.

const FX0 = 0; // spine: left, right, top, bottom, corner radius
const FX1 = 560;
const FY0 = -14;
const FY1 = 536;
const FR = 44;
const BW = 34; // body width
const K = BW / 36; // the head is drawn for a 36-wide body
const HEAD_X = 280; // where the head's own x=200 lands
const NECK_X = HEAD_X + 19.5 * K;
const TIP_X = HEAD_X - 29 * K;
const TAPER = 200; // length over which the tail narrows

type P = { x: number; y: number; tx: number; ty: number };
type Seg = { len: number; at: (u: number) => P };

function line(x0: number, y0: number, x1: number, y1: number): Seg {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const tx = (x1 - x0) / len;
  const ty = (y1 - y0) / len;
  return { len, at: (u) => ({ x: x0 + tx * u, y: y0 + ty * u, tx, ty }) };
}
function corner(cx: number, cy: number, a0: number): Seg {
  return {
    len: (FR * Math.PI) / 2,
    at: (u) => {
      const a = a0 + u / FR;
      return { x: cx + FR * Math.cos(a), y: cy + FR * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a) };
    },
  };
}

const SPINE: Seg[] = [
  line(NECK_X, FY0, FX1 - FR, FY0),
  corner(FX1 - FR, FY0 + FR, -Math.PI / 2),
  line(FX1, FY0 + FR, FX1, FY1 - FR),
  corner(FX1 - FR, FY1 - FR, 0),
  line(FX1 - FR, FY1, FX0 + FR, FY1),
  corner(FX0 + FR, FY1 - FR, Math.PI / 2),
  line(FX0, FY1 - FR, FX0, FY0 + FR),
  corner(FX0 + FR, FY0 + FR, Math.PI),
  line(FX0 + FR, FY0, TIP_X, FY0),
];
const LEN = SPINE.reduce((n, s) => n + s.len, 0);

function at(s: number): P {
  let u = Math.max(0, Math.min(LEN, s));
  for (const seg of SPINE) {
    if (u <= seg.len) return seg.at(u);
    u -= seg.len;
  }
  const last = SPINE[SPINE.length - 1];
  return last.at(last.len);
}

/** Half the body's width at `s`; the tail narrows over its last stretch. */
function half(s: number): number {
  const left = LEN - s;
  if (left >= TAPER) return BW / 2;
  return (4 + (BW - 4) * (Math.max(0, left) / TAPER) ** 0.8) / 2;
}

/** A point `off` out from the spine at `s` (negative is toward the shelves). The tail dips a little into the mouth. */
function edge(s: number, off: number): string {
  const p = at(s);
  const left = LEN - s;
  const o = off - (left < TAPER ? 1.5 * (1 - Math.max(0, left) / TAPER) : 0);
  return `${(p.x + p.ty * o).toFixed(1)},${(p.y - p.tx * o).toFixed(1)}`;
}

function serpentBody(): string {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let s = 0; s < LEN + 3; s += 3) {
    const c = Math.min(s, LEN);
    outer.push(edge(c, half(c)));
    inner.unshift(edge(c, -half(c)));
  }
  const tip = at(LEN);
  return `M${outer.join(" L")} Q${(tip.x + 3).toFixed(1)},${(tip.y + 1.5).toFixed(1)} ${inner.join(" L")} Z`;
}

/** Gouged lines on the inner, shadowed side of the body. */
function serpentHatch(): string {
  const out: string[] = [];
  for (let s = 3, i = 0; s < LEN - 8; s += 7.4, i++) {
    const h = half(s);
    const len = h * (0.55 + 0.25 * Math.sin(i * 1.18));
    out.push(`M${edge(s, -h + 1.2)} L${edge(s + 2, -h + len)}`);
  }
  return out.join(" ");
}

/** Chevron scales along the spine, pointing toward the tail. */
function serpentScales(): string {
  const out: string[] = [];
  for (let s = 12; s < LEN - 24; s += 17) {
    const h = half(s);
    out.push(`M${edge(s - 4, h * 0.62)} Q${edge(s + 3.6, 0)} ${edge(s - 4, -h * 0.62)}`);
  }
  return out.join(" ");
}

/** Short cuts on the outer, lit edge. */
function serpentTicks(): string {
  const out: string[] = [];
  for (let s = 8; s < LEN - 50; s += 21) {
    const h = half(s);
    out.push(`M${edge(s, h - 1)} L${edge(s, h - 5.6)}`);
  }
  return out.join(" ");
}

const S_BODY = serpentBody();
const S_HATCH = serpentHatch();
const S_SCALES = serpentScales();
const S_TICKS = serpentTicks();
const S_HEAD = `translate(${(HEAD_X - 200 * K).toFixed(2)} ${(FY0 - 60 * K).toFixed(2)}) scale(${K.toFixed(4)})`;

export function Stomach({ jars }: { jars: Jar[] }) {
  const max = Math.max(1, ...jars.map((j) => j.usd));
  return (
    <svg viewBox="-22 -44 604 602" className="crucible" role="img" aria-labelledby="cr-title cr-desc">
      <title id="cr-title">What is in its stomach</title>
      <desc id="cr-desc">
        Two shelves of jars inside the serpent, which runs round them and bites its tail.{" "}
        {jars.map((j) => `${j.symbol} jar holds ${worth(j.usd)}${j.open ? "" : ", sealed"}`).join(". ")}
      </desc>
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink)" strokeWidth="2.1" />
        </pattern>
        <pattern id="grain" width="40" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,2 q10,-1.5 20,0 t20,0" fill="none" stroke="var(--paper)" strokeWidth="0.9" opacity="0.55" />
        </pattern>
      </defs>

      {ROWS.map(([shapes, base], ri) => (
        <g key={ri}>
          {/* back wall shadow: woodcut hatching */}
          <rect x={14} y={base - 176} width={532} height={176} fill="url(#hatch)" opacity={0.2} />
          {shapes.map((name, i) => {
            const jar = jars[ri * 5 + i];
            if (!jar) return null;
            const s = SHAPES[name];
            const cx = LEFT + i * SLOT;
            const share = jar.usd / max;
            const level = base - share * s.fill;
            const clipId = `jar-${ri}-${i}`;
            const long = jar.symbol.length > 8;
            const lw = long ? 98 : 78; // a long name gets a wider tag
            const pile = share > 0 ? heap(cx, base, base - level, ri * 5 + i) : [];
            return (
              <g key={jar.symbol} className={jar.open ? "jar" : "jar jar-sealed"}>
                <clipPath id={clipId}>
                  <path d={s.body(cx, base)} />
                </clipPath>
                <path d={s.body(cx, base)} fill="var(--paper)" />
                <g clipPath={`url(#${clipId})`}>
                  {/* the heap: black between the coins, so the pile reads as solid */}
                  {pile.length > 0 && <rect x={cx - 50} y={pile[pile.length - 1].y} width={100} height={base - pile[pile.length - 1].y} fill="var(--ink)" />}
                  {pile.map((c, k) => (
                    <g key={k}>
                      <circle cx={c.x} cy={c.y} r={COIN_R} fill={c.red ? "var(--rubric)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={1.7} />
                      <circle cx={c.x} cy={c.y} r={COIN_R - 3.4} fill="none" stroke={c.red ? "var(--paper)" : "var(--ink)"} strokeWidth={0.9} />
                      <path d={`M${c.x - 2.2},${c.y} h4.4 M${c.x},${c.y - 2.2} v4.4`} stroke={c.red ? "var(--paper)" : "var(--ink)"} strokeWidth={1} />
                    </g>
                  ))}
                </g>
                <path d={s.body(cx, base)} fill="none" stroke="var(--ink)" strokeWidth={3.2} strokeLinejoin="round" />
                <path d={s.extra(cx, base)} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2.6} strokeLinejoin="round" />
                {/* a sealed memecoin gets a red slip across its jar */}
                {!jar.open && (
                  <>
                    <rect x={cx - 27} y={base - s.label - 10} width={54} height={19} fill="var(--paper)" stroke="var(--rubric)" strokeWidth={1.4} />
                    <text x={cx} y={base - s.label + 4} className="jar-sealed-tag" fontSize={12.5}>
                      sealed
                    </text>
                  </>
                )}
                {/* the tag hanging from the shelf: name, then what the jar is worth */}
                <path d={`M${cx - 14},${base + 13} v7 M${cx + 14},${base + 13} v7`} stroke="var(--ink)" strokeWidth={1.2} />
                <rect x={cx - lw / 2} y={base + 19} width={lw} height={23} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
                <text x={cx} y={base + 35.5} className={long ? "jar-label long" : "jar-label"} fontSize={long ? 11.5 : 14}>
                  {jar.symbol}
                </text>
                <text x={cx} y={base + 61} className="jar-worth" fontSize={15.5}>
                  {worth(jar.usd)}
                </text>
              </g>
            );
          })}
          {/* the shelf board; its ends run in behind the serpent */}
          <rect x={10} y={base} width={540} height={13} fill="var(--ink)" />
          <rect x={10} y={base} width={540} height={13} fill="url(#grain)" />
        </g>
      ))}

      {/* the serpent round it all, drawn like the one in the hero */}
      <g fill="none" stroke="var(--ink)" color="var(--ink)" strokeLinecap="round" strokeLinejoin="round">
        <path d={S_BODY} fill="var(--paper)" strokeWidth={3.2} />
        <path d={S_HATCH} strokeWidth={2} />
        <path d={S_SCALES} strokeWidth={2.1} />
        <path d={S_TICKS} strokeWidth={1.2} />
        <g transform={S_HEAD}>
          <SerpentHead fill="var(--paper)" stroke={3.2 / K} />
        </g>
      </g>
    </svg>
  );
}
