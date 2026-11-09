// Hammered medieval coins for the ten memes CONSUME eats. Each is our own
// heraldic device (not the coin's real logo or mascot): a beaded rim, the
// legend around the edge, and a woodcut figure in the field, black with
// engraved lines cut back to the paper.

import type { ReactElement } from "react";

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const RUBRIC = "var(--rubric)";

/** Engraved lines: paper-coloured strokes cut into a black figure. */
function Cuts({ d, w = 1.1 }: { d: string; w?: number }) {
  return <path d={d} stroke={PAPER} strokeWidth={w} fill="none" strokeLinecap="round" />;
}

// Devices are drawn in a 100x100 box, inside r=27 around (50,50).
const DEVICES: Record<string, () => ReactElement> = {
  // a hound's head in profile, ears pricked, collared
  // a hound's head in profile: tall pricked ears, long muzzle, collar with a bell
  DOGE: () => (
    <g>
      <path
        d="M66,76 C68,66 69,58 67,50 C66,45 64,41 61,38 L64,22 L55,32 L50,21 L46,35 C41,36 36,39 33,43 L23,48 C20,50 20,54 23,55 L33,57 C36,61 41,63 46,63 C48,68 48,72 47,76 Z"
        fill={INK}
      />
      <path d="M57,27 l-2,6 M50,27 l0,6" stroke={PAPER} strokeWidth={1.2} />
      <path d="M41,43 q3.5,-2.6 7,0 q-3.5,2.4 -7,0 Z" fill={PAPER} />
      <circle cx={43.6} cy={43} r={1} fill={INK} />
      <ellipse cx={22.5} cy={50.6} rx={2} ry={1.6} fill={PAPER} />
      <Cuts d="M23,55 C27,56.5 31,56.5 34,55.5" w={1.3} />
      <Cuts d="M38,40 q3,-3 7,-3" w={1} />
      <Cuts d="M53,46 q5,3 10,2 M51,52 q6,4 13,3 M50,58 q6,4 14,3" />
      <path d="M45,67 C52,70 59,70 67,67 L66,72 C59,74 52,74 46,72 Z" fill={PAPER} stroke={INK} strokeWidth={1.4} />
      <circle cx={56} cy={74.6} r={2.2} fill={RUBRIC} stroke={INK} strokeWidth={0.8} />
    </g>
  ),
  // a dog seated, tail curled over its back, wearing a small crown
  SHIB: () => (
    <g>
      <path
        d="M57,77 L57,59 C57,53 60,49 64,46 L71,43 C74,42 76,40 75,38 L69,36 L67,25 L62,31 L57,24 L55,34 C50,37 46,41 43,46 C37,49 33,55 33,63 L33,73 L29,77 Z"
        fill={INK}
      />
      <path d="M38,52 C30,52 26,45 30,40 C34,36 41,39 39,45 C38,48 34,48 34,45" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M63,38 q2,-1.6 4,0 q-2,1.6 -4,0 Z" fill={PAPER} />
      <circle cx={74.2} cy={38.3} r={1.2} fill={PAPER} />
      <Cuts d="M50,63 L50,75 M44,60 q-3,6 -2,14 M60,50 q-4,4 -4,10" />
      <path d="M56,24 l2,-6 2.4,3.6 2.4,-4.6 2.4,4.6 2.4,-3.6 2,6 Z" fill={RUBRIC} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
    </g>
  ),
  // a frog seated, seen from the front
  PEPE: () => (
    <g>
      <ellipse cx={50} cy={61} rx={17} ry={12} fill={INK} />
      <ellipse cx={50} cy={47} rx={19} ry={10} fill={INK} />
      <circle cx={40} cy={37} r={7.5} fill={INK} />
      <circle cx={60} cy={37} r={7.5} fill={INK} />
      <circle cx={40} cy={37} r={3.6} fill={PAPER} />
      <circle cx={60} cy={37} r={3.6} fill={PAPER} />
      <circle cx={41} cy={37.6} r={1.6} fill={INK} />
      <circle cx={59} cy={37.6} r={1.6} fill={INK} />
      <Cuts d="M37,50 q13,7 26,0" w={1.6} />
      <Cuts d="M41,60 q9,4 18,0 M43,65 q7,3 14,0 M38,55 l-3,3 M62,55 l3,3" />
      <path d="M34,70 l-7,3 M66,70 l7,3 M37,72 l-4,6 M63,72 l4,6 M44,73 l-1,5 M56,73 l1,5" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
    </g>
  ),
  // a penguin standing, flippers out
  PENGU: () => (
    <g>
      <ellipse cx={50} cy={54} rx={14.5} ry={21} fill={INK} />
      <ellipse cx={50} cy={59} rx={8.5} ry={14} fill={PAPER} />
      <circle cx={45} cy={40} r={2} fill={PAPER} />
      <circle cx={55} cy={40} r={2} fill={PAPER} />
      <path d="M46.5,44 L53.5,44 L50,50 Z" fill={RUBRIC} stroke={INK} strokeWidth={0.9} />
      <path d="M36,50 q-8,9 -4,19 M64,50 q8,9 4,19" stroke={INK} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <path d="M46,51 q4,2 8,0 M45,57 q5,2 10,0 M45,63 q5,2 10,0 M46,69 q4,2 8,0" stroke={INK} strokeWidth={0.8} fill="none" />
      <Cuts d="M40,46 q-2,8 0,16 M60,46 q2,8 0,16" w={0.9} />
      <path d="M42,75 h7 M51,75 h7" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
    </g>
  ),
  // a bull's head affronté: the market that only goes up
  SPX: () => (
    <g>
      <path d="M38,40 C30,38 24,31 24,22 C30,29 35,31 41,32 Z M62,40 C70,38 76,31 76,22 C70,29 65,31 59,32 Z" fill={INK} />
      <path d="M33,42 C29,40 26,41 25,44 C28,46 31,46 35,45 Z M67,42 C71,40 74,41 75,44 C72,46 69,46 65,45 Z" fill={INK} />
      <path d="M38,36 C40,32 45,31 50,31 C55,31 60,32 62,36 L61,55 C60,63 56,70 50,70 C44,70 40,63 39,55 Z" fill={INK} />
      <path d="M43,45 q2.5,-2 5,0 M52,45 q2.5,-2 5,0" stroke={PAPER} strokeWidth={1.8} fill="none" />
      <ellipse cx={50} cy={63} rx={7} ry={5} fill={PAPER} />
      <circle cx={47} cy={63} r={1.3} fill={INK} />
      <circle cx={53} cy={63} r={1.3} fill={INK} />
      <path d="M45,67 a5,5 0 1,0 10,0" stroke={RUBRIC} strokeWidth={2} fill="none" />
      <Cuts d="M44,36 l2,4 M50,34 l0,5 M56,36 l-2,4" w={1} />
    </g>
  ),
  // a toad seated in profile, warty
  TURBO: () => (
    <g>
      <path
        d="M27,67 C25,57 29,47 39,42 C45,37 55,36 62,39 L69,41 C74,43 77,47 75,51 L70,54 C68,60 64,64 58,66 L63,73 L54,73 L50,67 L41,68 L45,73 L33,73 Z"
        fill={INK}
      />
      <circle cx={63} cy={39} r={4.6} fill={INK} />
      <circle cx={63.6} cy={38.6} r={2.2} fill={PAPER} />
      <circle cx={64} cy={38.8} r={1} fill={INK} />
      <Cuts d="M75,51 C70,52 66,52 62,51" w={1.4} />
      {[
        [38, 50], [46, 46], [53, 47], [43, 56], [51, 54], [36, 60], [47, 62],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} fill={PAPER} />
      ))}
      <Cuts d="M58,58 q-3,5 -6,8 M31,62 q4,4 9,5" />
    </g>
  ),
  // an open book
  BOME: () => (
    <g>
      <path d="M50,40 Q40,33 25,36 L25,67 Q40,63 50,71 Q60,63 75,67 L75,36 Q60,33 50,40 Z" fill={INK} />
      <path d="M50,40 L50,71" stroke={PAPER} strokeWidth={1.6} />
      <Cuts d="M29,44 q9,-2 17,2 M29,50 q9,-2 17,2 M29,56 q9,-2 17,2 M29,62 q9,-2 17,2 M54,46 q8,-4 17,-2 M54,52 q8,-4 17,-2 M54,58 q8,-4 17,-2" />
      <path d="M58,62 l0,13 l2.5,-2.5 l2.5,2.5 l0,-13" fill={RUBRIC} stroke={INK} strokeWidth={0.9} />
    </g>
  ),
  // a dragon's head, crested, breathing a curl of flame
  BLACKDRAGON: () => (
    <g transform="translate(50 50) scale(0.8) translate(-50 -52)">
      <path
        d="M70,76 C66,66 66,56 70,48 L78,36 L69,39 L67,27 L61,36 C55,34 47,35 41,39 L29,40 L23,45 L31,47 L25,52 L38,52 C42,58 50,61 57,59 C57,65 60,71 64,77 Z"
        fill={INK}
      />
      <path d="M70,48 l5,1 -3,4 5,2 -4,3 5,3 -5,2" fill={INK} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <path d="M46,42 l5,-1.4 -2,3 Z" fill={RUBRIC} />
      <path d="M27,46 l2,2.6 2,-2.4 2,2.6 2,-2.4" stroke={PAPER} strokeWidth={1} fill="none" />
      <Cuts d="M60,52 q4,3 5,8 M58,45 q5,2 8,6 M62,62 q2,4 3,8" />
      <path d="M22,48 C16,46 14,40 18,37 C20,41 22,42 24,44" fill={RUBRIC} stroke={INK} strokeWidth={0.9} />
    </g>
  ),
  // a long-haired lapdog, facing out, ears draping, a bow in its topknot
  SHITZU: () => (
    <g>
      <path d="M50,33 C60,33 67,40 68,49 C69,58 64,66 56,69 L44,69 C36,66 31,58 32,49 C33,40 40,33 50,33 Z" fill={INK} />
      <path d="M34,42 C26,46 24,58 27,70 C30,74 35,74 37,70 C38,62 37,52 38,46 Z M66,42 C74,46 76,58 73,70 C70,74 65,74 63,70 C62,62 63,52 62,46 Z" fill={INK} />
      <Cuts d="M29,52 q2,8 1,16 M33,50 q1,9 0,18 M71,52 q-2,8 -1,16 M67,50 q-1,9 0,18" w={0.9} />
      <circle cx={44} cy={49} r={2.6} fill={PAPER} />
      <circle cx={56} cy={49} r={2.6} fill={PAPER} />
      <circle cx={44.4} cy={49.4} r={1.1} fill={INK} />
      <circle cx={55.6} cy={49.4} r={1.1} fill={INK} />
      <ellipse cx={50} cy={60} rx={8} ry={6} fill={PAPER} />
      <ellipse cx={50} cy={57.5} rx={3} ry={2.2} fill={INK} />
      <path d="M46,62 q4,3 8,0 M50,59.5 L50,62" stroke={INK} strokeWidth={1} fill="none" />
      <path d="M50,33 C47,27 48,22 50,20 C52,22 53,27 50,33 Z" fill={INK} />
      <path d="M44,26 L50,29 L44,32 Z M56,26 L50,29 L56,32 Z" fill={RUBRIC} stroke={INK} strokeWidth={0.8} />
    </g>
  ),
  // a cat's face, striped brow
  NearKat: () => (
    <g>
      <path d="M30,40 L32,23 L42,33 Q50,30 58,33 L68,23 L70,40 Q74,52 66,64 Q58,72 50,72 Q42,72 34,64 Q26,52 30,40 Z" fill={INK} />
      <path d="M34,28 L37,34 M66,28 L63,34" stroke={PAPER} strokeWidth={1.2} />
      <Cuts d="M46,36 l1,5 M50,35 l0,6 M54,36 l-1,5" />
      <path d="M38,47 q4,-4 8,0 q-4,3 -8,0 Z M54,47 q4,-4 8,0 q-4,3 -8,0 Z" fill={PAPER} />
      <path d="M42,44.6 l0,4.6 M58,44.6 l0,4.6" stroke={INK} strokeWidth={1.4} />
      <path d="M47,55 L53,55 L50,59 Z" fill={RUBRIC} stroke={INK} strokeWidth={0.8} />
      <Cuts d="M50,59 q-3,4 -6,2 M50,59 q3,4 6,2 M43,58 L27,55 M43,61 L28,64 M57,58 L73,55 M57,61 L72,64" w={1} />
    </g>
  ),
};

// A slightly irregular disc: hammered coins are never quite round.
const EDGE = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 47 + Math.sin(i * 2.3) * 0.9 + Math.cos(i * 1.7) * 0.6;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
})();

const BEADS = Array.from({ length: 40 }, (_, i) => {
  const a = (i / 40) * Math.PI * 2;
  return [50 + 43.5 * Math.cos(a), 50 + 43.5 * Math.sin(a)] as const;
});

type Props = { symbol: string; chain?: string; size?: number; className?: string };

export function Coin({ symbol, chain, size = 40, className }: Props) {
  const Device = DEVICES[symbol];
  const id = `legend-${symbol}`;
  const legend = `${symbol.toUpperCase()} ✦ ${(chain ?? "").toUpperCase()} ✦`;
  return (
    <svg className={className ? `coin ${className}` : "coin"} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${symbol} coin`}>
      <defs>
        <path id={id} d="M50,50 m-35,0 a35,35 0 1,1 70,0 a35,35 0 1,1 -70,0" />
      </defs>
      <path d={EDGE} fill={PAPER} stroke={INK} strokeWidth={2.4} />
      {BEADS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.3} fill={INK} />
      ))}
      <circle cx={50} cy={50} r={29} fill="none" stroke={INK} strokeWidth={1.6} />
      {size >= 56 && (
        <text className="coin-legend" fontSize={9}>
          <textPath href={`#${id}`} textLength={216} lengthAdjust="spacing">
            {legend}
          </textPath>
        </text>
      )}
      {Device ? (
        <Device />
      ) : (
        <text x={50} y={58} textAnchor="middle" fontSize={24}>
          {symbol[0]}
        </text>
      )}
    </svg>
  );
}
