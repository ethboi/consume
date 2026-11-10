// Small-multiple line charts as plain SVG, one panel per scenario on a shared
// scale, so the README can show them without any build step.

const PAPER = "#efe9dc";
const INK = "#141110";
const RUBRIC = "#b3261e";
const FADED = "#675d52";
const FONT = "Georgia, 'Times New Roman', serif";

export const COLORS = { ink: INK, rubric: RUBRIC };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n) => Math.round(n * 10) / 10;

/** Round tick steps: 1, 2, 2.5 or 5 times a power of ten. */
function ticks(lo, hi, want = 4) {
  const raw = (hi - lo) / want;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const first = Math.floor(lo / step) * step;
  const out = [];
  for (let v = first; v < hi + step * 0.999; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/**
 * panels: [{ title, series: [{ name, color, dashed?, points: [[x, y]] }], marks?: [{ x, label, before? }] }]
 * A mark's label sits after its line, or before it when `before` is set.
 * All panels share both axes. `fromZero` starts the value axis at zero.
 */
export function smallMultiples({ title, subtitle, note, panels, yFormat, xMax = 60, fromZero = true }) {
  const W = 920;
  const COLS = 2;
  const PAD = 34;
  const GAP_X = 28;
  const GAP_Y = 22;
  const multi = panels[0].series.length > 1;
  const HEAD = multi ? 104 : 84;
  const FOOT = note ? 46 : 26;
  const PW = (W - PAD * 2 - GAP_X * (COLS - 1)) / COLS;
  const PH = 236;
  const M = { top: 46, right: 92, bottom: 30, left: 50 };
  const rows = Math.ceil(panels.length / COLS);
  const H = HEAD + rows * PH + (rows - 1) * GAP_Y + FOOT;

  const all = panels.flatMap((p) => p.series.flatMap((s) => s.points.map((pt) => pt[1])));
  const yTicks = ticks(fromZero ? 0 : Math.min(...all), Math.max(...all));
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  const plotW = PW - M.left - M.right;
  const plotH = PH - M.top - M.bottom;
  const sx = (x) => M.left + (x / xMax) * plotW;
  const sy = (y) => M.top + plotH - ((y - y0) / (y1 - y0)) * plotH;

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="${esc(title)}. ${esc(subtitle)}">`,
    `<rect width="${W}" height="${H}" fill="${PAPER}"/>`,
    `<rect x="5" y="5" width="${W - 10}" height="${H - 10}" fill="none" stroke="${INK}" stroke-width="2.5"/>`,
    `<rect x="11" y="11" width="${W - 22}" height="${H - 22}" fill="none" stroke="${INK}" stroke-width="1"/>`,
    `<text x="${PAD}" y="48" font-size="25" fill="${INK}">${esc(title)}</text>`,
    `<text x="${PAD}" y="72" font-size="14.5" font-style="italic" fill="${FADED}">${esc(subtitle)}</text>`,
  );
  if (multi) {
    let lx = PAD;
    for (const s of panels[0].series) {
      out.push(
        `<line x1="${lx}" y1="91" x2="${lx + 26}" y2="91" stroke="${s.color}" stroke-width="2.5"${s.dashed ? ' stroke-dasharray="6 4"' : ""}/>`,
        `<text x="${lx + 33}" y="95.5" font-size="13.5" fill="${INK}">${esc(s.name)}</text>`,
      );
      lx += 33 + s.name.length * 7.1 + 26;
    }
  }

  panels.forEach((p, i) => {
    const ox = PAD + (i % COLS) * (PW + GAP_X);
    const oy = HEAD + Math.floor(i / COLS) * (PH + GAP_Y);
    out.push(`<g transform="translate(${r1(ox)},${r1(oy)})">`);
    out.push(`<text x="0" y="16" font-size="17" fill="${INK}">${esc(p.title)}</text>`);
    // value axis: light rules, labels on the left
    for (const t of yTicks) {
      const y = r1(sy(t));
      out.push(
        `<line x1="${M.left}" y1="${y}" x2="${r1(M.left + plotW)}" y2="${y}" stroke="${INK}" stroke-opacity="${t === y0 ? 0.55 : 0.13}" stroke-width="1"/>`,
        `<text x="${M.left - 7}" y="${y + 4}" font-size="11.5" text-anchor="end" fill="${FADED}">${esc(yFormat(t))}</text>`,
      );
    }
    for (const d of [0, 15, 30, 45, 60]) {
      out.push(
        `<text x="${r1(sx(d))}" y="${M.top + plotH + 17}" font-size="11.5" text-anchor="middle" fill="${FADED}">${d === 0 ? "day 0" : d}</text>`,
      );
    }
    // what happened when
    (p.marks ?? []).forEach((m) => {
      const x = r1(sx(m.x));
      const flip = m.before ?? m.x > xMax * 0.7;
      out.push(
        `<line x1="${x}" y1="${M.top - 4}" x2="${x}" y2="${M.top + plotH}" stroke="${FADED}" stroke-width="1" stroke-dasharray="2 3"/>`,
        `<text x="${flip ? x - 4 : x + 4}" y="${M.top - 8}" font-size="11.5" font-style="italic" text-anchor="${flip ? "end" : "start"}" fill="${FADED}">${esc(m.label)}</text>`,
      );
    });
    // the lines, then a label at each line's end
    const ends = [];
    for (const s of p.series) {
      const d = s.points.map(([x, y], j) => `${j ? "L" : "M"}${r1(sx(x))},${r1(sy(y))}`).join("");
      out.push(
        `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="6 4"' : ""}/>`,
      );
      const [lx, ly] = s.points[s.points.length - 1];
      ends.push({ x: sx(lx), y: sy(ly), color: s.color, text: `${yFormat(ly)}${multi ? ` ${s.short ?? s.name}` : ""}` });
    }
    // keep two end labels from sitting on each other
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].ly = (ends[k - 1].ly ?? ends[k - 1].y) + 15;
    for (const e of ends) {
      out.push(
        `<circle cx="${r1(e.x)}" cy="${r1(e.y)}" r="3.5" fill="${e.color}" stroke="${PAPER}" stroke-width="1.5"/>`,
        `<text x="${r1(e.x + 8)}" y="${r1((e.ly ?? e.y) + 4)}" font-size="12.5" fill="${INK}">${esc(e.text)}</text>`,
      );
    }
    out.push(`</g>`);
  });

  if (note) out.push(`<text x="${PAD}" y="${H - 24}" font-size="12.5" font-style="italic" fill="${FADED}">${esc(note)}</text>`);
  out.push(`</svg>`);
  return out.join("\n") + "\n";
}
