// The Indulgence NFT image: a printed charter. Rendered to a standalone SVG by
// app/indulgence/[id]/route.ts and used as the NFT's media. Everything is
// drawn here; the route embeds the fonts and swaps CSS variables for colours.

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
  from: string; // "9 November 2026"
  to: string; // "9 December 2026"
  released: number; // 0..1
  days: number; // length of the vest in days
  exited: boolean;
  bonus: boolean;
};

const W = 600;
const H = 900;
const PANEL = { x: 58, y: 168, w: 484, h: 330 };
const CX = W / 2;
const CY = PANEL.y + PANEL.h / 2;
const SERPENT = 372; // drawn larger than the panel so it breaks the frame

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const RED = "var(--rubric)";

/** A red boss in each corner of the frame. */
function Boss({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-15} y={-15} width={30} height={30} fill={RED} stroke={INK} strokeWidth={2.5} />
      <path d="M0,-10 L3,-3 L10,0 L3,3 L0,10 L-3,3 L-10,0 L-3,-3 Z" fill={PAPER} />
    </g>
  );
}

/** The title carried on a ribbon with folded tails. */
function Ribbon() {
  return (
    <g>
      <path d="M92,74 L40,74 L62,104 L40,134 L110,134 Z" fill={PAPER} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M508,74 L560,74 L538,104 L560,134 L490,134 Z" fill={PAPER} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M92,74 L110,60 L110,120 Z M508,74 L490,60 L490,120 Z" fill={INK} />
      <path
        d="M110,60 Q205,44 300,56 T490,60 L490,120 Q395,136 300,124 T110,120 Z"
        fill={PAPER}
        stroke={INK}
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      <path d="M118,68 Q205,53 300,64 T482,68 M118,112 Q205,127 300,116 T482,112" fill="none" stroke={INK} strokeWidth={0.9} />
      <text x={CX} y={110} textAnchor="middle" className="bl" fontSize={58} fill={RED}>
        Indulgence
      </text>
    </g>
  );
}

/** A wax seal hanging from two ribbon tails. */
function HangingSeal({ x, y }: { x: number; y: number }) {
  const rim = "✦ CONSUME ✦ THE STOMACH ";
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* ribbon tails hanging out below the wax */}
      <path d="M-16,20 L-40,74 L-27,68 L-19,80 L-2,30 Z" fill={RED} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M16,20 L40,74 L27,68 L19,80 L2,30 Z" fill={RED} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {/* and the cord it hangs from */}
      <path d="M-6,-70 L-6,-44 M6,-70 L6,-44" stroke={RED} strokeWidth={5} />
      <path
        d="M0,-48 C9,-46 13,-51 21,-45 C30,-40 35,-42 40,-34 C46,-26 52,-22 51,-12 C50,-3 55,3 52,12 C49,21 52,28 45,35 C38,43 35,49 25,52 C15,55 10,59 0,56 C-10,59 -15,55 -25,52 C-35,49 -38,43 -45,35 C-52,28 -49,21 -52,12 C-55,3 -50,-3 -51,-12 C-52,-22 -46,-26 -40,-34 C-35,-42 -30,-40 -21,-45 C-13,-51 -9,-46 0,-48 Z"
        fill="var(--wax, #9b1d18)"
        stroke={INK}
        strokeWidth={2}
      />
      <circle r={39} fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth={2} />
      <circle r={27} fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth={1.5} />
      <defs>
        <path id="seal-rim" d="M0,0 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0" />
      </defs>
      <text className="sc" fontSize={8.5} fill="rgba(0,0,0,0.55)" letterSpacing={0.6}>
        <textPath href="#seal-rim" textLength={203} lengthAdjust="spacing">
          {rim}
        </textPath>
      </text>
      <g transform="translate(-24 -24)" color="rgba(0,0,0,0.5)">
        <Ouroboros size={48} detailed={false} title="" />
      </g>
      <path d="M-30,-30 Q0,-44 30,-30" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

export function IndulgenceCard({ d }: { d: CardData }) {
  const done = !d.exited && d.released >= 1;
  const days = Math.max(1, Math.round(d.days));
  const filled = Math.floor(Math.min(1, Math.max(0, d.released)) * days + 1e-9);
  const tick = 360 / days;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <defs>
        <pattern id="band" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill={PAPER} />
          <rect width="2.6" height="7" fill={INK} />
        </pattern>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="5" height="5" fill={PAPER} />
          <rect width="1.8" height="5" fill={INK} />
        </pattern>
        <clipPath id="panel">
          <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} />
        </clipPath>
      </defs>

      {/* the block: black edge, hatched band, paper face with a red inner rule */}
      <rect width={W} height={H} fill={INK} />
      <rect x={12} y={12} width={W - 24} height={H - 24} fill="url(#band)" />
      <rect x={26} y={26} width={W - 52} height={H - 52} fill={PAPER} stroke={INK} strokeWidth={4} />
      <rect x={36} y={36} width={W - 72} height={H - 72} fill="none" stroke={RED} strokeWidth={2} />
      <Boss x={26} y={26} />
      <Boss x={W - 26} y={26} />
      <Boss x={26} y={H - 26} />
      <Boss x={W - 26} y={H - 26} />

      <Ribbon />
      {/* the number in a red lozenge */}
      <g transform={`translate(${CX} 150)`}>
        <path d="M-58,0 L-44,-14 L44,-14 L58,0 L44,14 L-44,14 Z" fill={RED} stroke={INK} strokeWidth={2} />
        <text y={6} textAnchor="middle" className="sc" fontSize={17} fill={PAPER} letterSpacing={1.5}>
          {`№ ${d.id}`}
        </text>
      </g>

      {/* the woodblock: red, black glory, the serpent breaking the frame, the coin inside */}
      <g clipPath="url(#panel)">
        <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} fill={RED} />
        <Glory x={CX - 700} y={CY - 700} size={1400} />
      </g>
      <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} fill="none" stroke={INK} strokeWidth={5} />
      <circle cx={CX} cy={CY} r={(SERPENT * 140) / 400} fill={PAPER} />
      <circle cx={CX} cy={CY} r={(SERPENT * 168) / 400} fill="none" stroke={INK} strokeWidth={8} />
      <g transform={`translate(${CX - SERPENT / 2} ${CY - SERPENT / 2})`} color={INK}>
        <Ouroboros size={SERPENT} title="" />
      </g>
      <g transform={`translate(${CX - 88} ${CY - 86})`}>
        <Coin symbol={d.symbol} chain={d.chain} size={176} />
      </g>
      {d.bonus && (
        <g transform={`translate(${PANEL.x + PANEL.w - 116} ${PANEL.y + 16})`}>
          <path d="M0,0 H100 V34 H0 L12,17 Z" fill={PAPER} stroke={INK} strokeWidth={2.5} />
          <text x={56} y={25} textAnchor="middle" className="bl" fontSize={23} fill={RED}>
            Feast
          </text>
        </g>
      )}

      {/* the inscription, with a rubricated initial */}
      <g transform="translate(70 528)">
        <rect width={50} height={56} fill="url(#hatch)" stroke={INK} strokeWidth={2.4} />
        <rect x={5} y={5} width={40} height={46} fill={PAPER} stroke={INK} strokeWidth={1} />
        <text x={25} y={45} textAnchor="middle" className="bl" fontSize={46} fill={RED}>
          F
        </text>
      </g>
      <g className="fell" fill={INK}>
        <text x={132} y={548} fontSize={21}>
          {`or ${d.eaten} ${d.symbol} fed to the Stomach,`}
        </text>
        <text x={132} y={576} fontSize={21}>
          {`worth ${d.mealUsd}, this Indulgence grants`}
        </text>
      </g>
      <text x={CX} y={632} textAnchor="middle" className="bl" fontSize={46} fill={RED}>
        {`${d.consume} Consume`}
      </text>
      <g className="fell" fill={INK} textAnchor="middle" fontStyle="italic">
        <text x={CX} y={664} fontSize={18}>
          to its bearer, released a little each day
        </text>
        <text x={CX} y={688} fontSize={18}>
          {`from ${d.from} to ${d.to}.`}
        </text>
      </g>

      {/* one mark for each day of the vest, inked as it is released */}
      <g transform={`translate(${CX - 180} 708)`}>
        {Array.from({ length: days }, (_, i) => (
          <rect
            key={i}
            x={i * tick + 1}
            y={0}
            width={tick - 3}
            height={16}
            fill={i < filled ? (d.exited ? RED : INK) : PAPER}
            stroke={INK}
            strokeWidth={1.4}
          />
        ))}
      </g>
      <text x={CX - 180} y={744} className="fell" fontSize={14} fontStyle="italic" fill={INK}>
        {d.exited ? "Released early, the rest forfeit" : `${filled} of ${days} days released`}
      </text>
      <text x={CX + 180} y={744} textAnchor="end" className="fell" fontSize={14} fontStyle="italic" fill={INK}>
        Breaking the seal early forfeits half.
      </text>

      <HangingSeal x={CX} y={806} />

      {/* stamps across the picture */}
      {d.exited && (
        <g transform={`translate(${CX} ${CY + 70}) rotate(-14)`} opacity={0.94}>
          <rect x={-190} y={-42} width={380} height={84} fill={PAPER} stroke={RED} strokeWidth={7} />
          <text x={0} y={22} textAnchor="middle" className="bl" fontSize={60} fill={RED}>
            Seal broken
          </text>
        </g>
      )}
      {done && (
        <g transform={`translate(${CX} ${CY + 70}) rotate(-10)`} opacity={0.94}>
          <rect x={-196} y={-40} width={392} height={80} fill={PAPER} stroke={INK} strokeWidth={6} />
          <text x={0} y={21} textAnchor="middle" className="bl" fontSize={54} fill={INK}>
            Fully released
          </text>
        </g>
      )}
    </svg>
  );
}
