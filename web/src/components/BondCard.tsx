// The Bond NFT image, drawn as a woodcut tarot card: a numeral in a box
// at the top, one tall picture, and the card's title in a box at the foot.
// Rendered to a standalone SVG by app/bond/[id]/route.ts and used as the
// NFT's media. Everything is drawn here; the route embeds the fonts and swaps
// CSS variables for colours. BondSquare is the same card on a square mount, for
// wallets and marketplaces that crop images to a square.

import { Coin } from "./Coin";
import { Ouroboros } from "./Ouroboros";
import { Glory } from "./Woodblock";

export type CardData = {
  id: string;
  symbol: string;
  chain: string;
  eaten: string; // formatted amount, e.g. "81,871,345"
  mealUsd: string; // "$420.00"
  consume: string; // "420,000"
  from: string; // "9 Nov 2026"
  to: string; // "9 Dec 2026"
  released: number; // 0..1
  days: number; // length of the vest in days
  exited: boolean;
  bonus: boolean;
};

/** Tarot proportions, 7:12. */
export const CARD_W = 600;
export const CARD_H = 1030;
/** The square mount is as wide as the card is tall. */
export const SQUARE = CARD_H;

const W = CARD_W;
const H = CARD_H;
const CX = W / 2;
/** The picture between the two boxes. */
const PIC = { x: 64, y: 138, w: 472, h: 668 };
const SUN = { x: CX, y: 418 }; // centre of the serpent and the rays
const SERPENT = 396;
const GROUND_Y = 718;

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const RED = "var(--rubric)";

/** The arcana each memecoin's device stands for. */
const TITLES: Record<string, string> = {
  DOGE: "The Hound",
  SHIB: "The Crowned Dog",
  PEPE: "The Frog",
  PENGU: "The Penguin",
  SPX: "The Bull",
  TURBO: "The Toad",
  BOME: "The Book",
  BLACKDRAGON: "The Dragon",
  SHITZU: "The Lapdog",
  NearKat: "The Cat",
};

/** Roman numerals up to 3999; larger numbers stay Arabic. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

function Star({ x, y, s = 1, fill = RED }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0,-12 L2.6,-2.6 L12,0 L2.6,2.6 L0,12 L-2.6,2.6 L-12,0 L-2.6,-2.6 Z"
      fill={fill}
    />
  );
}

/** A framed box with a fine inner rule, as on old printed cards. */
function Box({ y, h }: { y: number; h: number }) {
  return (
    <g>
      <rect x={PIC.x} y={y} width={PIC.w} height={h} fill={PAPER} stroke={INK} strokeWidth={3.5} />
      <rect x={PIC.x + 7} y={y + 7} width={PIC.w - 14} height={h - 14} fill="none" stroke={INK} strokeWidth={1} />
    </g>
  );
}

const WAX_EDGE =
  "M0,-48 C9,-46 13,-51 21,-45 C30,-40 35,-42 40,-34 C46,-26 52,-22 51,-12 C50,-3 55,3 52,12 C49,21 52,28 45,35 C38,43 35,49 25,52 C15,55 10,59 0,56 C-10,59 -15,55 -25,52 C-35,49 -38,43 -45,35 C-52,28 -49,21 -52,12 C-55,3 -50,-3 -51,-12 C-52,-22 -46,-26 -40,-34 C-35,-42 -30,-40 -21,-45 C-13,-51 -9,-46 0,-48 Z";

/** The wax seal, pressed on the corner of the picture: a paper roundel under it
 *  so it stands off the red, the die's C stamped in ink. Cracked once broken. */
function Seal({ x, y, broken }: { x: number; y: number; broken: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* a paper roundel under the wax */}
      <circle cx={5} cy={6} r={64} fill={INK} />
      <circle r={64} fill={PAPER} stroke={INK} strokeWidth={3} />
      <circle r={57.5} fill="none" stroke={INK} strokeWidth={1} />
      <g transform="translate(0 -3)">
        <path d={WAX_EDGE} fill={INK} transform="translate(3 4)" />
        <path d={WAX_EDGE} fill="var(--wax, #9b1d18)" stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
        {/* the die: a raised ring and the C */}
        <circle cy={3} r={35} fill={RED} stroke={INK} strokeWidth={2.6} />
        <circle cy={3} r={29.5} fill="none" stroke={INK} strokeWidth={1} />
        <text x={-1} y={22} textAnchor="middle" className="bl" fontSize={54} fill={INK}>
          C
        </text>
        <path d="M-38,-22 Q-30,-38 -12,-43" fill="none" stroke={PAPER} strokeWidth={2.6} strokeLinecap="round" opacity={0.55} />
        {broken && (
          <path
            d="M-8,-50 L-2,-26 L-12,-10 L4,6 L-6,22 L6,40 L0,58"
            fill="none"
            stroke={PAPER}
            strokeWidth={5}
            strokeLinejoin="bevel"
          />
        )}
      </g>
    </g>
  );
}

/** The payout on a ribbon across the picture. */
function Banderole({ text }: { text: string }) {
  const y = 646;
  return (
    <g>
      <path d={`M104,${y - 18} L72,${y - 18} L88,${y + 4} L72,${y + 26} L118,${y + 26} Z`} fill={PAPER} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d={`M496,${y - 18} L528,${y - 18} L512,${y + 4} L528,${y + 26} L482,${y + 26} Z`} fill={PAPER} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path
        d={`M104,${y - 30} Q200,${y - 42} 300,${y - 32} T496,${y - 30} L496,${y + 18} Q400,${y + 30} 300,${y + 20} T104,${y + 18} Z`}
        fill={PAPER}
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <text x={CX} y={y + 6} textAnchor="middle" className="bl" fontSize={text.length > 16 ? 34 : 40} fill={RED}>
        {text}
      </text>
    </g>
  );
}

/** Everything on the card, in the card's own 600 by 1030 frame. */
function CardFace({ d }: { d: CardData }) {
  const done = !d.exited && d.released >= 1;
  const days = Math.max(1, Math.round(d.days));
  const filled = Math.floor(Math.min(1, Math.max(0, d.released)) * days + 1e-9);
  const step = 450 / days;
  const title = TITLES[d.symbol] ?? d.symbol;
  const heading = `Bond ${roman(Number(d.id))}`;
  const headSize = Math.min(44, 350 / (heading.length * 0.8));

  return (
    <>
      <defs>
        <pattern id="band" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill={PAPER} />
          <rect width="2.6" height="7" fill={INK} />
        </pattern>
        <clipPath id="pic">
          <rect x={PIC.x} y={PIC.y} width={PIC.w} height={PIC.h} />
        </clipPath>
      </defs>

      {/* the card: black edge with rounded corners, a hatched border, a paper face */}
      <rect width={W} height={H} rx={34} fill={INK} />
      <rect x={10} y={10} width={W - 20} height={H - 20} rx={26} fill="url(#band)" />
      <rect x={22} y={22} width={W - 44} height={H - 44} rx={16} fill={PAPER} stroke={INK} strokeWidth={3} />
      <rect x={34} y={34} width={W - 68} height={H - 68} rx={8} fill="none" stroke={RED} strokeWidth={1.8} />

      {/* what it is and its number */}
      <Box y={50} h={74} />
      <Star x={104} y={87} s={0.8} />
      <Star x={W - 104} y={87} s={0.8} />
      <text x={CX} y={87 + headSize * 0.36} textAnchor="middle" className="sc" fontSize={headSize} letterSpacing={headSize * 0.11} fill={INK}>
        {heading}
      </text>

      {/* the picture: red ground, black rays, the serpent around the memecoin */}
      <g clipPath="url(#pic)">
        <rect x={PIC.x} y={PIC.y} width={PIC.w} height={PIC.h} fill={RED} />
        <Glory x={SUN.x - 700} y={SUN.y - 700} size={1400} />
        <circle cx={SUN.x} cy={SUN.y} r={(SERPENT * 140) / 400} fill={PAPER} />
        <circle cx={SUN.x} cy={SUN.y} r={(SERPENT * 168) / 400} fill="none" stroke={INK} strokeWidth={8} />
        <g transform={`translate(${SUN.x - SERPENT / 2} ${SUN.y - SERPENT / 2})`} color={INK}>
          <Ouroboros size={SERPENT} title="" />
        </g>
        <g transform={`translate(${SUN.x - 94} ${SUN.y - 92})`}>
          <Coin symbol={d.symbol} chain={d.chain} size={188} />
        </g>
        {/* stars in the sky */}
        <Star x={PIC.x + 38} y={PIC.y + 40} s={0.9} fill={PAPER} />
        <Star x={PIC.x + 82} y={PIC.y + 92} s={0.45} fill={PAPER} />
        <Star x={PIC.x + PIC.w - 120} y={PIC.y + 30} s={0.4} fill={PAPER} />

        {/* the ground, with one cell for each day of the payout */}
        <path
          d={`M${PIC.x},${GROUND_Y + 14} Q${PIC.x + 120},${GROUND_Y - 10} ${CX},${GROUND_Y + 4} T${PIC.x + PIC.w},${GROUND_Y + 2} L${PIC.x + PIC.w},${PIC.y + PIC.h} L${PIC.x},${PIC.y + PIC.h} Z`}
          fill={INK}
          stroke={PAPER}
          strokeWidth={3}
        />
        <g transform={`translate(${CX - 225} ${GROUND_Y + 30})`}>
          {Array.from({ length: days }, (_, i) => (
            <rect
              key={i}
              x={i * step + 1.5}
              y={0}
              width={step - 4}
              height={18}
              fill={i < filled ? RED : INK}
              stroke={PAPER}
              strokeWidth={1.6}
            />
          ))}
        </g>
        <text x={CX} y={GROUND_Y + 74} textAnchor="middle" className="fell" fontSize={16} fontStyle="italic" fill={PAPER}>
          {d.exited ? `Seal broken: ${filled} of ${days} days released, the rest forfeit` : `${filled} of ${days} days released`}
        </text>
      </g>
      <rect x={PIC.x} y={PIC.y} width={PIC.w} height={PIC.h} fill="none" stroke={INK} strokeWidth={5} />

      <Banderole text={`${d.consume} Consume`} />

      {d.bonus && (
        <g transform={`translate(${PIC.x + 14} ${PIC.y + 132})`}>
          <path d="M0,0 H104 L92,17 L104,34 H0 Z" fill={PAPER} stroke={INK} strokeWidth={2.5} />
          <text x={46} y={25} textAnchor="middle" className="bl" fontSize={23} fill={RED}>
            Feast
          </text>
        </g>
      )}

      <Seal x={PIC.x + PIC.w - 58} y={PIC.y + 62} broken={d.exited} />

      {/* the title */}
      <Box y={822} h={166} />
      <text x={CX} y={876} textAnchor="middle" className="sc" fontSize={title.length > 12 ? 36 : 42} letterSpacing={4} fill={INK}>
        {title.toUpperCase()}
      </text>
      <path d={`M${CX - 120},894 H${CX + 120}`} stroke={RED} strokeWidth={2} />
      <Star x={CX} y={894} s={0.5} />
      <g className="fell" fill={INK} textAnchor="middle">
        <text x={CX} y={924} fontSize={19}>
          {`Bond for ${d.eaten} ${d.symbol}, worth ${d.mealUsd},`}
        </text>
        <text x={CX} y={950} fontSize={19}>
          {`released to its bearer from ${d.from} to ${d.to}.`}
        </text>
        <text x={CX} y={973} fontSize={14.5} fontStyle="italic">
          Break the seal early and half of what is still locked is forfeit.
        </text>
      </g>

      {/* stamps across the picture */}
      {d.exited && (
        <g transform={`translate(${CX} ${SUN.y + 40}) rotate(-14)`} opacity={0.94}>
          <rect x={-190} y={-42} width={380} height={84} fill={PAPER} stroke={RED} strokeWidth={7} />
          <text x={0} y={22} textAnchor="middle" className="bl" fontSize={60} fill={RED}>
            Seal broken
          </text>
        </g>
      )}
      {done && (
        <g transform={`translate(${CX} ${SUN.y + 40}) rotate(-10)`} opacity={0.94}>
          <rect x={-196} y={-40} width={392} height={80} fill={PAPER} stroke={INK} strokeWidth={6} />
          <text x={0} y={21} textAnchor="middle" className="bl" fontSize={54} fill={INK}>
            Fully released
          </text>
        </g>
      )}
    </>
  );
}

export function BondCard({ d }: { d: CardData }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <CardFace d={d} />
    </svg>
  );
}

const MOUNT_K = 0.93; // the card's size on the mount

/** The same card laid on a square mount, so a square crop keeps all of it. */
export function BondSquare({ d }: { d: CardData }) {
  const Q = SQUARE;
  const x = (Q - W * MOUNT_K) / 2;
  const y = (Q - H * MOUNT_K) / 2;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${Q} ${Q}`} width={Q} height={Q}>
      <rect width={Q} height={Q} fill={RED} />
      <Glory x={Q / 2 - 900} y={y + SUN.y * MOUNT_K - 900} size={1800} />
      <rect x={9} y={9} width={Q - 18} height={Q - 18} fill="none" stroke={INK} strokeWidth={18} />
      <rect x={27} y={27} width={Q - 54} height={Q - 54} fill="none" stroke={PAPER} strokeWidth={3} />
      {/* the card's hard shadow, then the card */}
      <rect x={x + 12} y={y + 14} width={W * MOUNT_K} height={H * MOUNT_K} rx={34 * MOUNT_K} fill={INK} />
      <g transform={`translate(${x} ${y}) scale(${MOUNT_K})`}>
        <CardFace d={d} />
      </g>
    </svg>
  );
}
