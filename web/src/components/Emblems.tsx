// Small woodcut emblems for each chapter heading. Ink lines with a little
// hatching, drawn at 64x64.

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
