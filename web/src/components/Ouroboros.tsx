// The serpent that eats its own tail, drawn like a woodcut: an inked body with
// hatched shadow on the inner edge, chevron scales along the spine, and a head
// whose open jaws close on the tapering tail. Everything is computed here so the
// mark scales cleanly from a 24px favicon to the hero.

type Props = { size?: number; className?: string; detailed?: boolean; animate?: boolean; title?: string };

const CX = 200;
const CY = 200;
const R = 140; // spine radius
const W = 36; // body width at the neck
const NECK = -82; // degrees, where the body leaves the head
const TIP = 258; // degrees, where the tail ends inside the mouth
const TAPER = 80; // degrees over which the tail narrows

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (deg: number, r: number) => [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))] as const;
const f = (n: number) => n.toFixed(1);

function width(deg: number) {
  const fromTip = TIP - deg;
  if (fromTip >= TAPER) return W;
  return 5 + (W - 5) * (fromTip / TAPER) ** 0.8;
}

function bodyPath() {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let d = NECK; d <= TIP; d += 2) {
    const w = width(d) / 2;
    const [ox, oy] = pt(d, R + w);
    const [ix, iy] = pt(d, R - w);
    outer.push(`${f(ox)},${f(oy)}`);
    inner.unshift(`${f(ix)},${f(iy)}`);
  }
  const [tx, ty] = pt(TIP + 3, R);
  return `M${outer.join(" L")} Q${f(tx)},${f(ty)} ${inner.join(" L")} Z`;
}

/** Hatching on the inner (shadowed) half of the body, like gouged woodcut lines. */
function hatch() {
  const lines: string[] = [];
  for (let d = NECK + 3; d < TIP - 6; d += 3.2) {
    const w = width(d) / 2;
    const len = w * (0.55 + 0.25 * Math.sin(d * 0.37));
    const [ax, ay] = pt(d, R - w + 1.5);
    const [bx, by] = pt(d + 1.2, R - w + len);
    lines.push(`M${f(ax)},${f(ay)} L${f(bx)},${f(by)}`);
  }
  return lines.join(" ");
}

/** Chevron scales along the spine, pointing toward the tail. */
function scales() {
  const out: string[] = [];
  for (let d = NECK + 8; d < TIP - 14; d += 7.5) {
    const w = width(d) / 2;
    const [ax, ay] = pt(d - 2.6, R + w * 0.62);
    const [bx, by] = pt(d + 1.8, R);
    const [cx, cy] = pt(d - 2.6, R - w * 0.62);
    out.push(`M${f(ax)},${f(ay)} Q${f(bx)},${f(by)} ${f(cx)},${f(cy)}`);
  }
  return out.join(" ");
}

/** Outer-edge ticks: the lit side catches a few short cuts. */
function ticks() {
  const out: string[] = [];
  for (let d = NECK + 5; d < TIP - 20; d += 9) {
    const w = width(d) / 2;
    const [ax, ay] = pt(d, R + w - 1);
    const [bx, by] = pt(d, R + w - 6);
    out.push(`M${f(ax)},${f(ay)} L${f(bx)},${f(by)}`);
  }
  return out.join(" ");
}

const BODY = bodyPath();
const HATCH = hatch();
const SCALES = scales();
const TICKS = ticks();

// Head at the top, facing left, jaws open around the tail tip (~171,63).
const UPPER =
  "M224,41 C210,33 183,32 166,39 C157,43 150,48 146,55 L160,57 L163,64 L168,57 L175,57 L178,63 L182,57 C194,57 205,58 222,61 Z";
const LOWER =
  "M222,67 C206,69 190,72 178,74 L175,69 L171,75 L154,73 C161,82 180,88 199,86 C210,85 218,80 224,74 Z";

const HINGE = [223, 64] as const;

/** The head alone, in the ouroboros' own frame: spine at y=60, neck at x≈220,
 *  jaws open to the left around the tail tip. Place it with a transform; `cut`
 *  thickens the fine lines when it is drawn small, and `open` swings each jaw
 *  that many degrees wider about the hinge, showing the dark of the mouth. */
export function SerpentHead({ fill, stroke, detailed = true, cut = 1, open = 0 }: { fill: string; stroke: number; detailed?: boolean; cut?: number; open?: number }) {
  const swing = (deg: number) => (open ? `rotate(${deg} ${HINGE[0]} ${HINGE[1]})` : undefined);
  const turn = (x: number, y: number, deg: number) => {
    const [dx, dy] = [x - HINGE[0], y - HINGE[1]];
    return `${f(HINGE[0] + dx * Math.cos(rad(deg)) - dy * Math.sin(rad(deg)))},${f(HINGE[1] + dx * Math.sin(rad(deg)) + dy * Math.cos(rad(deg)))}`;
  };
  return (
    <>
      {open > 0 && (
        <path
          d={`M${HINGE[0] + 6},${HINGE[1]} L${turn(222, 58, open)} L${turn(176, 55, open)} Q${HINGE[0] - 30},${HINGE[1] + 1} ${turn(178, 74, -open)} L${turn(222, 70, -open)} Z`}
          fill="currentColor"
          stroke="none"
        />
      )}
      <g transform={swing(-open)}>
        <path d={LOWER} fill={fill} strokeWidth={stroke} />
        {detailed && <path d="M188,79 C200,80 211,78 219,73" strokeWidth={1 * cut} opacity={0.8} />}
      </g>
      <g transform={swing(open)}>
        <path d={UPPER} fill={fill} strokeWidth={stroke} />
        {detailed && (
          <>
            {/* brow, eye with slit pupil, nostril, neck folds */}
            <path d="M178,41 C188,36 200,36 210,40" strokeWidth={1.4 * cut} />
            <circle cx={196} cy={46} r={5} fill="var(--rubric)" stroke="currentColor" strokeWidth={1.2 * cut} />
            <path d="M196,42 L196,50" stroke="currentColor" strokeWidth={1.6 * cut} />
            <path d="M156,49 l3,-1" strokeWidth={1.8 * cut} />
            <path d="M201,52 C208,52 214,53 219,55 M203,48 C209,48 214,49 219,51" strokeWidth={0.9 * cut} opacity={0.75} />
          </>
        )}
      </g>
    </>
  );
}

export function Ouroboros({ size = 400, className, detailed = true, animate = false, title = "Ouroboros, the serpent that eats its tail" }: Props) {
  // woodcut: the uncut wood prints as paper, the lines as ink
  const fill = detailed ? "var(--paper)" : "none";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 400 400"
      role="img"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>
      <g className={animate ? "ouro-body ouro-animate" : "ouro-body"}>
        <path d={BODY} fill={fill} strokeWidth={detailed ? 3.4 : 9} pathLength={1} className="ouro-outline" />
        {detailed && (
          <g className="ouro-cuts">
            <path d={HATCH} strokeWidth={2.2} />
            <path d={SCALES} strokeWidth={2.3} />
            <path d={TICKS} strokeWidth={1.3} />
          </g>
        )}
      </g>
      <g className={animate ? "ouro-head ouro-animate" : "ouro-head"}>
        <SerpentHead fill={fill} stroke={detailed ? 3.2 : 8} detailed={detailed} />
      </g>
    </svg>
  );
}
