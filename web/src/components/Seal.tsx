// A wax seal pressed with the ouroboros. Pure SVG (no foreignObject), so it
// also renders inside NFT images where HTML is not allowed.

import { Ouroboros } from "./Ouroboros";

type Props = { className?: string; size?: number; x?: number; y?: number };

const WAX =
  "M50 4 C58 6 62 2 69 7 C76 11 81 9 85 16 C90 23 95 26 94 35 C93 43 98 48 95 56 C92 64 95 70 89 76 C83 83 81 89 72 92 C64 95 59 99 50 96 C41 99 36 95 28 92 C19 89 17 83 11 76 C5 70 8 64 5 56 C2 48 7 43 6 35 C5 26 10 23 15 16 C19 9 24 11 31 7 C38 2 42 6 50 4 Z";

export function Seal({ className, size, x, y }: Props) {
  return (
    <svg className={className} viewBox="0 0 100 100" width={size} height={size} x={x} y={y} aria-hidden="true">
      <path
        d={WAX}
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

export type Party = "assayer" | "guardian" | "intents";

// What each party's seal is pressed with: scales for the Assayer who weighs
// prices, a key for the guardian, the gatehouse for NEAR Intents.
const PRESSED: Record<Party, React.ReactNode> = {
  assayer: (
    <>
      <path d="M50,30 V70 M40,71 H60 M29,36 H71" />
      <path d="M31,36 L24,53 M31,36 L38,53 M69,36 L62,53 M69,36 L76,53" strokeWidth={1.8} />
      <path d="M21,53 Q31,63 41,53 Z M59,53 Q69,63 79,53 Z" />
    </>
  ),
  guardian: (
    <>
      <circle cx={50} cy={34} r={9.5} />
      <circle cx={50} cy={34} r={3} strokeWidth={2} />
      <path d="M50,44 V75 M50,63 H60 M50,71 H57" />
    </>
  ),
  intents: (
    <>
      <path d="M32,72 V43 H38 V36 H44 V43 H47 V36 H53 V43 H56 V36 H62 V43 H68 V72 Z" />
      <path d="M44,72 V61 A6,6 0 0 1 56,61 V72 Z" fill="currentColor" />
    </>
  ),
};

/** The seal of one of the parties the Rule asks you to trust. The device is
 *  pressed into the wax: a dark cut with a lit edge beside it. */
export function PartySeal({ party, className }: { party: Party; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={WAX} fill="var(--rubric)" />
      <path d={WAX} stroke="rgba(0,0,0,0.3)" strokeWidth={2.5} transform="translate(50 50) scale(0.94) translate(-50 -50)" />
      <circle cx={50} cy={50} r={36} stroke="rgba(0,0,0,0.38)" strokeWidth={1.8} />
      <g transform="translate(0.9 1)" stroke="rgba(255,255,255,0.2)" color="rgba(255,255,255,0.2)" strokeWidth={3.4}>
        {PRESSED[party]}
      </g>
      <g stroke="rgba(0,0,0,0.6)" color="rgba(0,0,0,0.6)" strokeWidth={3.4}>
        {PRESSED[party]}
      </g>
      <path d="M27 21 Q50 11 73 21" stroke="rgba(255,255,255,0.22)" strokeWidth={3} />
    </svg>
  );
}
