// A wax seal pressed with the ouroboros, for Indulgence documents.

import { Ouroboros } from "./Ouroboros";

export function Seal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M50 4 C58 6 62 2 69 7 C76 11 81 9 85 16 C90 23 95 26 94 35 C93 43 98 48 95 56 C92 64 95 70 89 76 C83 83 81 89 72 92 C64 95 59 99 50 96 C41 99 36 95 28 92 C19 89 17 83 11 76 C5 70 8 64 5 56 C2 48 7 43 6 35 C5 26 10 23 15 16 C19 9 24 11 31 7 C38 2 42 6 50 4 Z"
        fill="currentColor"
      />
      <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      <foreignObject x="20" y="20" width="60" height="60">
        <div style={{ color: "rgba(0,0,0,0.45)", width: 60, height: 60 }}>
          <Ouroboros size={60} detailed={false} title="" />
        </div>
      </foreignObject>
    </svg>
  );
}
