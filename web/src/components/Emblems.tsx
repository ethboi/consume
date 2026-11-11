// Small woodcut emblems for each chapter heading. Ink lines with a little
// hatching, drawn at 64x64.

import { SerpentHead } from "./Ouroboros";

const common = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "var(--ink)",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "emblem",
  "aria-hidden": true,
};

/** A stomach, as in an old anatomy woodcut, with a coin inside it. */
export function StomachEmblem() {
  return (
    <svg {...common}>
      {/* gullet coming down into the bag */}
      <path d="M22,4 L22,16 C22,20 25,23 30,22 M29,4 L29,15" />
      {/* the J-shaped bag, ending in the gut on the left */}
      <path
        d="M29,15 C31,18 36,17 42,16 C53,15 60,24 59,36 C58,50 46,60 32,58 C23,57 18,52 18,47 L8,47 L8,53 L18,53 C18,53 18,47 18,47 C18,42 22,40 27,42 C31,43 34,40 33,36 C32,31 25,29 22,24 C21,21 22,18 22,16"
        fill="var(--paper)"
      />
      {/* hatching on the shadowed underside */}
      <path d="M30,52 q10,1 18,-6 M28,48 q12,1 20,-7 M50,46 q4,-5 5,-12 M46,49 q6,-6 7,-14" strokeWidth={1} />
      {/* folds of the lining */}
      <path d="M37,22 q5,3 10,1 M48,24 q4,4 5,9" strokeWidth={1} />
      {/* a coin it has eaten */}
      <circle cx={42} cy={36} r={6.5} fill="var(--rubric)" strokeWidth={1.6} />
      <circle cx={42} cy={36} r={3.8} strokeWidth={0.9} />
    </svg>
  );
}

/** A goblet, filled. */
export function GobletEmblem() {
  return (
    <svg {...common}>
      {/* the bowl */}
      <path d="M16,11 C16,27 22,37 32,37 C42,37 48,27 48,11 Z" fill="var(--paper)" />
      {/* the wine, seen through the open rim */}
      <ellipse cx={32} cy={11} rx={16} ry={4.2} fill="var(--paper)" />
      <ellipse cx={32} cy={11.6} rx={12} ry={2.6} fill="var(--rubric)" strokeWidth={1.2} />
      {/* stem, knop and foot */}
      <path d="M32,37 L32,50" strokeWidth={3} />
      <ellipse cx={32} cy={43} rx={4.4} ry={2.6} fill="var(--rubric)" strokeWidth={1.6} />
      <path d="M17,57 C19,52 26,50 32,50 C38,50 45,52 47,57 Z" fill="var(--paper)" />
      {/* hatching on the shadowed side of the bowl and the foot */}
      <path d="M44,17 q-1,9 -6,15 M41,18 q-1,8 -5,13 M38,19 q-1,6 -3,10" strokeWidth={1} />
      <path d="M38,53 q4,1 6,3 M34,53 q3,1 5,3" strokeWidth={1} />
      {/* a band cut round the bowl */}
      <path d="M18,22 q14,5 28,0" strokeWidth={1} />
    </svg>
  );
}

/** A stack of coins, one falling. */
export function CoinsEmblem() {
  return (
    <svg {...common}>
      {[50, 43, 36].map((y) => (
        <g key={y}>
          <ellipse cx={30} cy={y} rx={16} ry={5} fill="var(--paper)" />
          <path d={`M14,${y} v4 q16,9 32,0 v-4`} fill="var(--paper)" />
          <path d={`M18,${y + 3} l0,3 M24,${y + 4.5} l0,3 M30,${y + 5} l0,3 M36,${y + 4.5} l0,3 M42,${y + 3} l0,3`} strokeWidth={0.9} />
        </g>
      ))}
      <ellipse cx={46} cy={16} rx={7} ry={7} fill="var(--paper)" />
      <path d="M43,13 l6,6 M49,13 l-6,6" strokeWidth={1.2} />
      <path d="M46,26 l0,4 M42,25 l-1,4 M50,25 l1,4" strokeWidth={1} />
    </svg>
  );
}

// The feeding serpent: its body is a spine of curves given a width, the same
// way the big serpents are cut, and the head is theirs with the jaws thrown open.
type Pt = readonly [number, number];
const FEED_K = 0.5; // head scale from the ouroboros frame
const FEED_TILT = 50; // degrees the head is thrown back
const FEED_SPINE: readonly (readonly [Pt, Pt, Pt, Pt])[] = [
  [[43.6, 31.2], [49.5, 38.3], [63, 39], [63.5, 50]],
  [[63.5, 50], [64, 62], [47, 63.5], [35, 59.5]],
  [[35, 59.5], [23, 55.5], [11, 56], [3, 65]],
];
const FEED_BW = 7.6; // half the body width at the neck

function feedSpine() {
  const out: { x: number; y: number; nx: number; ny: number; w: number }[] = [];
  const N = 14;
  const total = FEED_SPINE.length * N;
  FEED_SPINE.forEach(([a, b, c, d], i) => {
    for (let j = i ? 1 : 0; j <= N; j++) {
      const t = j / N;
      const u = 1 - t;
      const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
      const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
      const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
      const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
      const len = Math.hypot(dx, dy) || 1;
      const s = (i * N + j) / total;
      const w = s < 0.3 ? FEED_BW : 0.8 + (FEED_BW - 0.8) * ((1 - s) / 0.7) ** 0.9;
      out.push({ x, y, nx: -dy / len, ny: dx / len, w });
    }
  });
  return out;
}

const n1 = (n: number) => n.toFixed(1);
const FEED_PTS = feedSpine();
const FEED_BODY = (() => {
  const left = FEED_PTS.map((p) => `${n1(p.x + p.nx * p.w)},${n1(p.y + p.ny * p.w)}`);
  const right = FEED_PTS.map((p) => `${n1(p.x - p.nx * p.w)},${n1(p.y - p.ny * p.w)}`).reverse();
  return `M${left.join(" L")} L${right.join(" L")} Z`;
})();
// chevron scales down the spine, pointing at the tail
const FEED_SCALES = FEED_PTS.filter((p, i) => i > 3 && i % 4 === 0 && p.w > 2.6)
  .map((p) => {
    const [tx, ty] = [p.ny, -p.nx];
    const k = p.w * 0.5;
    return `M${n1(p.x + p.nx * k - tx * 1.4)},${n1(p.y + p.ny * k - ty * 1.4)} L${n1(p.x + tx * 1.2)},${n1(p.y + ty * 1.2)} L${n1(p.x - p.nx * k - tx * 1.4)},${n1(p.y - p.ny * k - ty * 1.4)}`;
  })
  .join(" ");
// short cuts along the belly edge, the shadowed side
const FEED_HATCH = FEED_PTS.filter((p, i) => i > 1 && i % 2 === 1 && p.w > 2)
  .map((p) => `M${n1(p.x - p.nx * (p.w - 0.6))},${n1(p.y - p.ny * (p.w - 0.6))} L${n1(p.x - p.nx * p.w * 0.55)},${n1(p.y - p.ny * p.w * 0.55)}`)
  .join(" ");

/** The serpent with its head thrown back, taking a coin. Cut in ink on paper
 *  whatever it sits on, so it reads on the red band. */
export function FeedEmblem() {
  return (
    <svg {...common} viewBox="-4 -10 80 80" className="emblem emblem-feed" stroke="var(--ink)" color="var(--ink)">
      <g stroke="var(--ink)">
        <path d={FEED_BODY} fill="var(--paper)" strokeWidth={1.8} />
        <path d={FEED_HATCH} strokeWidth={0.9} />
        <path d={FEED_SCALES} strokeWidth={1.1} />
        <g transform={`translate(41 33) rotate(${FEED_TILT}) scale(${FEED_K}) translate(-223 -64)`}>
          <SerpentHead fill="var(--paper)" stroke={1.8 / FEED_K} cut={2} open={15} />
        </g>
        {/* the coin going in */}
        <circle cx={15.5} cy={3.5} r={8} fill="var(--paper)" strokeWidth={1.8} />
        <circle cx={15.5} cy={3.5} r={4.8} strokeWidth={1} />
        <path d="M13.2,3.5 h4.6 M15.5,1.2 v4.6" strokeWidth={1} />
        <path d="M1.6,-3.6 l3.6,2.2 M-0.6,3.2 l4.4,0.2 M7.6,-8 l1.8,2.8" strokeWidth={1.3} />
      </g>
    </svg>
  );
}

/** An hourglass, for what is released over time. */
export function HourglassEmblem() {
  return (
    <svg {...common}>
      <path d="M16,8 L48,8 M16,56 L48,56" strokeWidth={3} />
      <path d="M20,8 L20,12 Q20,26 31,32 Q20,38 20,52 L20,56 M44,8 L44,12 Q44,26 33,32 Q44,38 44,52 L44,56" fill="var(--paper)" />
      <path d="M24,18 Q32,24 40,18 Z" fill="var(--ink)" strokeWidth={1} />
      <path d="M32,30 L32,46" strokeWidth={1} />
      <path d="M22,54 Q32,40 42,54 Z" fill="var(--ink)" strokeWidth={1} />
      <path d="M12,8 L12,56 M52,8 L52,56" strokeWidth={2.4} />
    </svg>
  );
}

/** Balance scales, for transmuting $CONSUME back into memes. */
export function ScalesEmblem() {
  return (
    <svg {...common}>
      <path d="M32,8 L32,54 M22,56 L42,56 M26,54 L38,54" strokeWidth={2.4} />
      <circle cx={32} cy={8} r={2.4} fill="var(--ink)" />
      <path d="M10,16 L54,16" strokeWidth={2.4} />
      <path d="M12,16 L5,34 M12,16 L19,34 M52,16 L45,34 M52,16 L59,34" strokeWidth={1.2} />
      <path d="M3,34 Q12,42 21,34 Z" fill="var(--paper)" />
      <path d="M43,34 Q52,42 61,34 Z" fill="var(--paper)" />
      <circle cx={52} cy={31} r={3} fill="var(--rubric)" strokeWidth={1.2} />
      <path d="M8,31 l3,-3 3,3 3,-3" strokeWidth={1.2} />
    </svg>
  );
}

/** A quill in an inkpot, for the ledger. */
export function QuillEmblem() {
  return (
    <svg {...common}>
      <path d="M18,44 L46,44 L44,58 L20,58 Z" fill="var(--paper)" />
      <path d="M22,48 L42,48 M22,52 L42,52" strokeWidth={0.9} />
      <path d="M16,44 L48,44" strokeWidth={2.6} />
      <path d="M30,44 C34,30 44,16 56,6 C50,18 44,26 34,38 Z" fill="var(--paper)" />
      <path d="M33,40 L54,8 M38,33 l-4,-1 M41,28 l-4,-1 M45,23 l-4,-1 M48,18 l-4,-1" strokeWidth={1} />
    </svg>
  );
}

/** A compass rose, for the four chains the memecoins come from. */
export function CompassEmblem() {
  return (
    <svg {...common}>
      <circle cx={32} cy={32} r={25} fill="var(--paper)" />
      <circle cx={32} cy={32} r={20.5} strokeWidth={0.9} />
      {/* the short diagonal points */}
      <path d="M32,32 L20,20 M32,32 L44,20 M32,32 L44,44 M32,32 L20,44" strokeWidth={1.2} />
      {/* the four long points, north in red */}
      <path d="M32,4 L37,27 L60,32 L37,37 L32,60 L27,37 L4,32 L27,27 Z" fill="var(--paper)" />
      <path d="M32,4 L37,27 L32,32 L27,27 Z" fill="var(--rubric)" />
      <path d="M32,32 L60,32 M32,32 L32,60 M32,32 L4,32" strokeWidth={1} />
      <circle cx={32} cy={32} r={2.2} fill="var(--ink)" />
    </svg>
  );
}

/** An open book, for the rule. */
export function BookEmblem() {
  return (
    <svg {...common}>
      <path d="M32,16 Q20,8 6,12 L6,50 Q20,46 32,54 Q44,46 58,50 L58,12 Q44,8 32,16 Z" fill="var(--paper)" />
      <path d="M32,16 L32,54" />
      <path d="M11,20 Q20,17 28,22 M11,27 Q20,24 28,29 M11,34 Q20,31 28,36 M11,41 Q20,38 28,43" strokeWidth={1} />
      <path d="M36,22 Q44,17 53,20 M36,29 Q44,24 53,27 M36,36 Q44,31 53,34" strokeWidth={1} />
      <path d="M40,40 l0,16 l3,-3 l3,3 l0,-16" fill="var(--rubric)" strokeWidth={1.2} />
    </svg>
  );
}

/** A counting frame, for the sixty days reckoned before launch. */
export function AbacusEmblem() {
  const bead = (x: number, y: number, fill: string) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={3.4} ry={4.6} fill={fill} strokeWidth={1.4} />;
  return (
    <svg {...common}>
      <path d="M7,8 L57,8 L57,56 L7,56 Z" fill="var(--paper)" strokeWidth={3} />
      <path d="M11,12 L53,12 L53,52 L11,52 Z" strokeWidth={0.9} />
      <path d="M11,21 L53,21 M11,32 L53,32 M11,43 L53,43" strokeWidth={1.2} />
      {[16, 23, 30].map((x) => bead(x, 21, "var(--ink)"))}
      {[41, 48].map((x) => bead(x, 21, "var(--paper)"))}
      {[16, 23].map((x) => bead(x, 32, "var(--ink)"))}
      {bead(34, 32, "var(--rubric)")}
      {[41, 48].map((x) => bead(x, 32, "var(--paper)"))}
      {bead(16, 43, "var(--ink)")}
      {[27, 34, 41, 48].map((x) => bead(x, 43, "var(--paper)"))}
    </svg>
  );
}
