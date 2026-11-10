#!/usr/bin/env node
// CONSUME as a Model Context Protocol server over stdio, for agents that run
// tools as a local process (Claude Code, Claude Desktop, Codex, Cursor).
//
//   node agents/mcp.mjs
//
// It reads the public testnet deployment unless told otherwise:
//
//   CONSUME_CONTRACT   the CONSUME contract account
//   CONSUME_INTENTS    the NEAR Intents contract (the stand-in on testnet)
//   CONSUME_NETWORK    testnet or mainnet
//   CONSUME_RPC        a NEAR JSON-RPC address
//
// The tools are the same ones the site serves at /api/mcp: both run
// web/src/lib/mcp.ts. This process holds no key and signs nothing. The
// prepare_* tools hand back unsigned calls for the agent's own wallet.
//
// One JSON-RPC message per line on stdin, one answer per line on stdout.
// Nothing else is ever written to stdout.

import { createInterface } from "node:readline";
import { handleMcp, netFrom } from "../web/src/lib/mcp.ts";

const env = process.env;
let net;
try {
  net = netFrom({ network: env.CONSUME_NETWORK, consume: env.CONSUME_CONTRACT, intents: env.CONSUME_INTENTS, rpcUrl: env.CONSUME_RPC });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const say = (answer) => process.stdout.write(JSON.stringify(answer) + "\n");

let waiting = 0;
let closed = false;
const done = () => {
  if (closed && waiting === 0) process.exit(0);
};

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    say({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  waiting += 1;
  handleMcp(net, message)
    .then((answer) => answer && say(answer))
    .catch((e) => say({ jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32603, message: e.message } }))
    .finally(() => {
      waiting -= 1;
      done();
    });
});
// the client closing stdin is how a stdio server is told to stop
lines.on("close", () => {
  closed = true;
  done();
});
