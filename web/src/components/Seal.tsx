// A wax seal pressed with the ouroboros. Pure SVG (no foreignObject), so it
// also renders inside NFT images where HTML is not allowed.

import { Ouroboros } from "./Ouroboros";

type Props = { className?: string; size?: number; x?: number; y?: number };

export function Seal({ className, size, x, y }: Props) {
  return (
    <svg className={className} viewBox="0 0 100 100" width={size} height={size} x={x} y={y} aria-hidden="true">
      <path
        d="M50 4 C58 6 62 2 69 7 C76 11 81 9 85 16 C90 23 95 26 94 35 C93 43 98 48 95 56 C92 64 95 70 89 76 C83 83 81 89 72 92 C64 95 59 99 50 96 C41 99 36 95 28 92 C19 89 17 83 11 76 C5 70 8 64 5 56 C2 48 7 43 6 35 C5 26 10 23 15 16 C19 9 24 11 31 7 C38 2 42 6 50 4 Z"
        fill="var(--wax, #9b1d18)"
      />
      <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      <g transform="translate(20 20)" style={{ color: "rgba(0,0,0,0.42)" }}>
        <Ouroboros size={60} detailed={false} title="" />
      </g>
      <path d="M30 22 Q50 14 70 22" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
