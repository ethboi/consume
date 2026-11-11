import { test } from "node:test";
import assert from "node:assert/strict";
import { feastOf, nextFeast, sittingOut, type Fed } from "./feast.ts";

const fed = (by: Record<string, number>): Fed =>
  ["pepe.testnet", "doge.testnet", "shib.testnet"].map((id) => [id, String((by[id] ?? 0) * 1e6)]);

test("the feast is the contract's own answer, not last week's most fed", () => {
  // PEPE was fed the most last week but had just feasted, so DOGE feasts
  const stats = { feast: "doge.testnet", heaviest_last_epoch: "pepe.testnet" };
  assert.equal(feastOf(stats), "doge.testnet");
  assert.equal(sittingOut(stats), "doge.testnet");
});

test("a week with no feast is not filled in from last week's most fed", () => {
  // only PEPE was fed last week, and it had just feasted
  const stats = { feast: null, heaviest_last_epoch: "pepe.testnet" };
  assert.equal(feastOf(stats), null);
  assert.equal(sittingOut(stats), null);
});

test("the memecoin feasting now cannot win this week's race", () => {
  const stats = { feast: "pepe.testnet", heaviest_last_epoch: "pepe.testnet" };
  const week = fed({ "pepe.testnet": 340, "doge.testnet": 300, "shib.testnet": 250 });
  assert.equal(nextFeast(week, stats), "doge.testnet");
});

test("if only the feasting memecoin is fed, none would feast next week", () => {
  const stats = { feast: "pepe.testnet", heaviest_last_epoch: "pepe.testnet" };
  assert.equal(nextFeast(fed({ "pepe.testnet": 340 }), stats), null);
  assert.equal(nextFeast(fed({}), stats), null);
});

test("with no feast this week, the most fed would feast next week", () => {
  const stats = { feast: null, heaviest_last_epoch: null };
  assert.equal(nextFeast(fed({ "pepe.testnet": 340, "doge.testnet": 300 }), stats), "pepe.testnet");
});

test("a tie goes to the first listed that is not feasting", () => {
  const week = fed({ "pepe.testnet": 100, "doge.testnet": 100, "shib.testnet": 100 });
  assert.equal(nextFeast(week, { feast: null, heaviest_last_epoch: null }), "pepe.testnet");
  assert.equal(nextFeast(week, { feast: "pepe.testnet", heaviest_last_epoch: "pepe.testnet" }), "doge.testnet");
});

test("a contract from before the rule: last week's most fed feasts, and can win again", () => {
  const stats = { heaviest_last_epoch: "pepe.testnet" };
  assert.equal(feastOf(stats), "pepe.testnet");
  assert.equal(sittingOut(stats), null);
  assert.equal(nextFeast(fed({ "pepe.testnet": 340, "doge.testnet": 300 }), stats), "pepe.testnet");
});
