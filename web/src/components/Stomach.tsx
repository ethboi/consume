// The stomach's contents drawn as an apothecary shelf: ten jars, each labelled
// with its meme and hatched full in proportion to the USD it holds (relative to
// the fullest jar), in the manner of a woodcut.

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
  [["albarello", "flask", "bottle", "crock", "pear"], 236],
  [["pear", "crock", "albarello", "flask", "bottle"], 486],
];
const SLOT = 104;
const LEFT = 72;

export function Stomach({ jars }: { jars: Jar[] }) {
  const max = Math.max(1, ...jars.map((j) => j.usd));
  return (
    <svg viewBox="0 0 560 520" className="crucible" role="img" aria-labelledby="cr-title cr-desc">
      <title id="cr-title">What is in its stomach</title>
      <desc id="cr-desc">
        {jars.map((j) => `${j.symbol} jar ${Math.round((j.usd / max) * 100)} percent as full as the fullest${j.open ? "" : ", sealed"}`).join(". ")}
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
          <rect x={14} y={base - 176} width={532} height={176} fill="url(#hatch)" opacity={0.12} />
          {shapes.map((name, i) => {
            const jar = jars[ri * 5 + i];
            if (!jar) return null;
            const s = SHAPES[name];
            const cx = LEFT + i * SLOT;
            const share = jar.usd / max;
            const level = base - share * s.fill;
            const clipId = `jar-${ri}-${i}`;
            const long = jar.symbol.length > 8;
            return (
              <g key={jar.symbol} className={jar.open ? "jar" : "jar jar-sealed"}>
                <clipPath id={clipId}>
                  <path d={s.body(cx, base)} />
                </clipPath>
                <path d={s.body(cx, base)} fill="var(--paper)" />
                <g clipPath={`url(#${clipId})`}>
                  <rect x={cx - 50} y={level} width={100} height={base - level} fill="url(#hatch)" />
                  {share > 0 && <line x1={cx - 50} y1={level} x2={cx + 50} y2={level} stroke="var(--ink)" strokeWidth={2} />}
                  {/* highlight cut down the left flank */}
                  <path d={`M${cx - 20},${base - 12} Q${cx - 26},${base - s.fill / 2} ${cx - 18},${base - s.fill + 12}`} stroke="var(--paper)" strokeWidth={4} fill="none" />
                </g>
                <path d={s.body(cx, base)} fill="none" stroke="var(--ink)" strokeWidth={2.6} strokeLinejoin="round" />
                <path d={s.extra(cx, base)} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
                {/* apothecary label */}
                <rect x={cx - 37} y={base - s.label - 11} width={74} height={22} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.4} />
                <text x={cx} y={base - s.label + 4.5} className="jar-label" fontSize={long ? 9.5 : 13}>
                  {jar.symbol}
                </text>
                {!jar.open && <path d={`M${cx - 37},${base - s.label - 11} l74,22 M${cx + 37},${base - s.label - 11} l-74,22`} stroke="var(--rubric)" strokeWidth={1.6} />}
              </g>
            );
          })}
          {/* the shelf board and its brackets */}
          <rect x={10} y={base} width={540} height={13} fill="var(--ink)" />
          <rect x={10} y={base} width={540} height={13} fill="url(#grain)" />
          <path d={`M40,${base + 13} l0,22 l24,-22 Z M496,${base + 13} l24,22 l0,-22 Z`} fill="var(--ink)" />
        </g>
      ))}
    </svg>
  );
}
