"use client";

// Sixty days, simulated: what `node sim/sim.mjs` found, drawn from the file that
// run writes (src/lib/simulation.json). Nothing here is read from the chain.

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import SIM from "@/lib/simulation.json";

type Mark = { x: number; label: string; before?: boolean };
type Scenario = { key: string; title: string; what: string; marks: Mark[]; liquid: number[]; locked: number[]; backing: number[] };
type Line = { name: string; values: number[]; red?: boolean };

const DAYS = SIM.days;
const SCENARIOS = SIM.scenarios as Scenario[];
const FIGURES = SIM.figures;
const cell = (key: string, i: number) => FIGURES.find((f) => f.key === key)?.cells[i] ?? "";

// the rows of the table, in the order they are read
const ROWS: [string, string][] = [
  ["fed", "Fed into the Stomach"],
  ["feedings", "Feedings"],
  ["paidOut", "Memecoins paid out to redeemers"],
  ["burned", "$CONSUME burned by redeeming"],
  ["forfeited", "$CONSUME forfeited, never minted"],
  ["liquid", "Liquid $CONSUME"],
  ["locked", "Still locked in Bonds"],
  ["stomach", "In the Stomach"],
  ["backing", "Backing of 1,000 $CONSUME (starts at $1.00)"],
  ["checks", "Backing checks passed"],
];

// the same rounding the simulation's own table uses
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const millions = (n: number) => (n === 0 ? "0" : `${fmt(n / 1e6, n >= 1e7 ? 0 : 1)}M`);
const dollars = (n: number) => `$${n.toFixed(3)}`;

/** Round steps from zero to past `hi`: 1, 2, 2.5 or 5 times a power of ten. */
function ticks(hi: number, want = 4): number[] {
  const raw = hi / want;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v < hi + step * 0.999; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// every scenario is drawn on the same scales, so the four can be told apart by eye
const SUPPLY_TICKS = ticks(Math.max(...SCENARIOS.flatMap((s) => [...s.liquid, ...s.locked])));
const BACKING_TICKS = ticks(Math.max(...SCENARIOS.flatMap((s) => s.backing)));

const W = 460;
const H = 270;
const M = { top: 30, right: 12, bottom: 28, left: 48 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const sx = (day: number) => M.left + (day / DAYS) * PLOT_W;
const r1 = (n: number) => Math.round(n * 10) / 10;

function Chart({
  title,
  about,
  lines,
  yTicks,
  axis,
  value,
  marks,
  day,
  onDay,
  note,
}: {
  title: string;
  about: string;
  lines: Line[];
  yTicks: number[];
  axis: (v: number) => string;
  value: (v: number) => string;
  marks: Mark[];
  day: number;
  onDay: (day: number | null) => void;
  note?: string;
}) {
  const top = yTicks[yTicks.length - 1];
  const sy = (v: number) => M.top + PLOT_H - (v / top) * PLOT_H;
  const read = `Day ${day}: ${lines.map((l) => `${l.name} ${value(l.values[day])}`).join(", ")}`;

  const point = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    onDay(Math.min(DAYS, Math.max(0, Math.round(((x - M.left) / PLOT_W) * DAYS))));
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const to = { ArrowLeft: day - 1, ArrowDown: day - 1, ArrowRight: day + 1, ArrowUp: day + 1, PageDown: day - 7, PageUp: day + 7, Home: 0, End: DAYS }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onDay(Math.min(DAYS, Math.max(0, to)));
  };

  return (
    <figure className="sim-chart">
      <figcaption>
        <b>{title}</b>
        <span>{about}</span>
      </figcaption>
      <p className="sim-key">
        {lines.map((l) => (
          <span key={l.name}>
            <i className={l.red ? "red" : undefined} />
            {l.name} <b>{value(l.values[day])}</b>
          </span>
        ))}
        <em>day {day}</em>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label={`${title}, day by day`}
        aria-valuemin={0}
        aria-valuemax={DAYS}
        aria-valuenow={day}
        aria-valuetext={read}
        onPointerDown={point}
        onPointerMove={point}
        onPointerLeave={(e) => e.pointerType === "mouse" && onDay(null)}
        onKeyDown={key}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "sim-base" : "sim-rule"} x1={M.left} x2={M.left + PLOT_W} y1={r1(sy(t))} y2={r1(sy(t))} />
            <text className="sim-tick" x={M.left - 8} y={r1(sy(t)) + 4.5} textAnchor="end">
              {axis(t)}
            </text>
          </g>
        ))}
        {[0, 15, 30, 45, 60].map((d) => (
          <text key={d} className="sim-tick" x={r1(sx(d))} y={M.top + PLOT_H + 19} textAnchor="middle">
            {d === 0 ? "day 0" : d}
          </text>
        ))}
        {marks.map((m) => (
          <g key={m.x}>
            <line className="sim-mark" x1={r1(sx(m.x))} x2={r1(sx(m.x))} y1={M.top - 4} y2={M.top + PLOT_H} />
            <text className="sim-mark-name" x={r1(sx(m.x)) + (m.before ? -5 : 5)} y={M.top - 9} textAnchor={m.before ? "end" : "start"}>
              {m.label}
            </text>
          </g>
        ))}
        {lines.map((l) => (
          <path key={l.name} className={l.red ? "sim-line red" : "sim-line"} d={l.values.map((v, d) => `${d ? "L" : "M"}${r1(sx(d))},${r1(sy(v))}`).join("")} />
        ))}
        <line className="sim-cross" x1={r1(sx(day))} x2={r1(sx(day))} y1={M.top} y2={M.top + PLOT_H} />
        {lines.map((l) => (
          <circle key={l.name} className={l.red ? "sim-dot red" : "sim-dot"} cx={r1(sx(day))} cy={r1(sy(l.values[day]))} r={5} />
        ))}
      </svg>
      {note && <p className="sim-chart-note">{note}</p>}
    </figure>
  );
}

export function Simulation({ repoUrl }: { repoUrl?: string }) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const scn = SCENARIOS[at];
  const day = picked ?? DAYS;
  const pricesFall = scn.key === "crash";
  const checks = FIGURES.find((f) => f.key === "checks")?.cells.map((c) => Number(c.replace(/,/g, ""))) ?? [];
  const run = SCENARIOS.findIndex((s) => s.key === "run");
  const crash = SCENARIOS.findIndex((s) => s.key === "crash");

  return (
    <div className="sim">
      <div className="roll-shows sim-pick" role="group" aria-label="Scenario">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={i === at}
            onClick={() => {
              setAt(i);
              setPicked(null);
            }}
          >
            {s.title}
          </button>
        ))}
      </div>
      <p className="sim-what">{scn.what}</p>

      <div className="sim-charts">
        <Chart
          title="Supply of $CONSUME"
          about="What holders have collected, and what is still locked in Bonds."
          lines={[
            { name: "Liquid", values: [0, ...scn.liquid] },
            { name: "Locked in Bonds", values: [0, ...scn.locked], red: true },
          ]}
          yTicks={SUPPLY_TICKS}
          axis={millions}
          value={millions}
          marks={scn.marks}
          day={day}
          onDay={setPicked}
        />
        <Chart
          title="Backing of 1,000 $CONSUME"
          about="Dollars of memecoins in the Stomach behind each 1,000 $CONSUME, minted or still locked."
          lines={[{ name: "Backing", values: [1, ...scn.backing] }]}
          yTicks={BACKING_TICKS}
          axis={(v) => `$${v.toFixed(2)}`}
          value={dollars}
          marks={scn.marks}
          day={day}
          onDay={setPicked}
          note={
            pricesFall
              ? "Prices fall in this run, and the backing falls with them: it is a share of ten memecoins, not a price in dollars."
              : "Prices are held still in this run, so the line moves only by the tithe and by broken seals."
          }
        />
      </div>

      <table className="sim-table">
        <caption>Where each run stood on day 60</caption>
        <thead>
          <tr>
            <td />
            {SCENARIOS.map((s, i) => (
              <th key={s.key} scope="col" className={i === at ? "on" : undefined}>
                {s.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              {SCENARIOS.map((s, i) => (
                <td key={s.key} className={i === at ? "on" : undefined}>
                  {cell(key, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="sim-found">
        <li>
          <b>The backing never fell from an action</b>
          <span>
            After every feeding, broken seal and redemption the run checks that the backing of each $CONSUME did not fall, and stops if it did. It passed every
            time, {fmt(Math.min(...checks))} to {fmt(Math.max(...checks))} checks a scenario.
          </span>
        </li>
        <li>
          <b>A run for the exit does not break it</b>
          <span>
            With a quarter of holders redeeming everything each day for ten days, everyone was paid their share in memecoins, {cell("paidOut", run)} over the
            sixty days. Those who stayed ended with the highest backing of the four, {cell("backing", run)}.
          </span>
        </li>
        <li>
          <b>Falling prices do lower it</b>
          <span>
            When every memecoin fell about 70%, the backing of 1,000 $CONSUME went from $1.00 to {cell("backing", crash)}. No rule can stop that: $CONSUME is a
            share of what the Serpent has eaten.
          </span>
        </li>
        <li>
          <b>The Feast tends to stick</b>
          <span>
            With 30% of feeders choosing the memecoin that pays no tithe, the reigning Feast kept its crown in every later week in three scenarios out of four.
            The crown is easier to keep than to take.
          </span>
        </li>
      </ul>

      <p className="sim-note">
        The behaviour is assumed, not measured. The rates are our guesses at a small community, nobody in the model trades $CONSUME or Bonds, and the Assayer
        is honest and on time. Each scenario is one run with a fixed seed, so <code>node sim/sim.mjs</code> prints these same figures every time.
        {repoUrl && (
          <>
            {" "}
            <a href={`${repoUrl}/tree/main/sim`}>Read the method and every number</a>
          </>
        )}
      </p>
    </div>
  );
}
