// What stands between the browser tests and the sandbox chain, on one local port:
//
//   POST /send              the test wallet's signer. Hands the transactions to
//                           the stage (contracts/integration-tests/examples/stage.rs),
//                           which signs and sends them as a sandbox account, and
//                           answers with each finished transaction.
//   POST /sent              the hashes of everything sent so far
//   POST /v0/account        a stand-in for the public indexer the Ledger reads
//   POST /v0/transactions   (FastNEAR's transactions API). A sandbox has no
//                           indexer, so this one serves the sandbox's own
//                           transactions in the indexer's shape: every receipt
//                           and log comes from the sandbox's RPC, unchanged.
//
// The Ledger code under test (src/lib/ledger.ts) is the real one; only where it
// finds the transactions is replaced.

import { createServer } from "node:http";
import { connect } from "node:net";

export async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "e2e", method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error.data ?? json.error.message)}`);
  return json.result;
}

/** One JSON line to the stage's control port, one JSON line back. */
function ask(port, request) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let got = "";
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      got += chunk;
      if (!got.includes("\n")) return;
      socket.end();
      try {
        resolve(JSON.parse(got));
      } catch (e) {
        reject(e);
      }
    });
    socket.on("error", reject);
  });
}

export async function startHarness({ rpcUrl, control }) {
  /** Every transaction sent through the wallet, oldest first. */
  const sent = [];
  const statuses = new Map();
  const blocks = new Map();

  const status = async ({ hash, signer }) => {
    if (!statuses.has(hash)) {
      statuses.set(hash, await rpc(rpcUrl, "EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: signer, wait_until: "FINAL" }));
    }
    return statuses.get(hash);
  };
  const timestamp = async (blockHash) => {
    if (!blocks.has(blockHash)) blocks.set(blockHash, (await rpc(rpcUrl, "block", { block_id: blockHash })).header.timestamp_nanosec);
    return blocks.get(blockHash);
  };
  const succeeded = (s) => typeof s.status === "object" && s.status !== null && "SuccessValue" in s.status;

  const routes = {
    "/send": async ({ signer, transactions }) => {
      const answer = await ask(control, { signer, transactions });
      if (answer.error) throw new Error(answer.error);
      const outcomes = [];
      for (const hash of answer.hashes) {
        sent.push({ hash, signer });
        // what a wallet hands back to the site: the finished transaction, as the RPC tells it
        outcomes.push(await status({ hash, signer }));
      }
      return { hashes: answer.hashes, outcomes };
    },

    // the hashes of everything sent so far, oldest first
    "/sent": async () => ({ hashes: sent.map((t) => t.hash) }),

    // the transactions of an account, newest first, as the indexer filters them
    "/v0/account": async ({ account_id, is_event_log, is_predecessor, is_signer }) => {
      const rows = [];
      for (const tx of [...sent].reverse()) {
        const s = await status(tx);
        const named = s.receipts_outcome.some((r) => r.outcome.logs.some((l) => l.startsWith("EVENT_JSON:") && l.includes(`"${account_id}"`)));
        const called = (s.receipts ?? []).some((r) => r.predecessor_id === account_id);
        const signed = tx.signer === account_id;
        if ((is_event_log && named) || (is_predecessor && called) || (is_signer && signed) || (!is_event_log && !is_predecessor && !is_signer)) {
          rows.push({ transaction_hash: tx.hash, is_success: succeeded(s) });
        }
      }
      return { account_txs: rows, resume_token: null };
    },

    "/v0/transactions": async ({ tx_hashes }) => {
      const transactions = [];
      for (const hash of tx_hashes) {
        const tx = sent.find((t) => t.hash === hash);
        if (!tx) continue;
        const s = await status(tx);
        const receipts = [];
        for (const r of s.receipts_outcome) {
          receipts.push({
            execution_outcome: {
              block_timestamp: await timestamp(r.block_hash),
              outcome: { executor_id: r.outcome.executor_id, logs: r.outcome.logs, status: r.outcome.status },
            },
          });
        }
        const { signer_id, receiver_id, actions } = s.transaction;
        transactions.push({
          transaction: { hash, signer_id, receiver_id, actions },
          execution_outcome: { block_timestamp: await timestamp(s.transaction_outcome.block_hash) },
          receipts,
        });
      }
      return { transactions };
    },
  };

  const server = createServer(async (req, res) => {
    const route = routes[new URL(req.url, "http://x").pathname];
    if (req.method !== "POST" || !route) return res.writeHead(404).end();
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const answer = await route(JSON.parse(body || "{}"));
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(answer));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
