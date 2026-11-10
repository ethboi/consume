// POST /api/mcp : CONSUME as a Model Context Protocol server over Streamable
// HTTP, so an agent can connect to the site's address and read the contract,
// quote a feeding or a redemption and get the calls to sign.
//
// It is stateless and holds no key: every tool reads the chain, and the
// prepare_* tools return unsigned calls for the agent's own wallet. One
// JSON-RPC message in, one JSON answer out, no sessions and no stream.

import { handleMcp, netFrom, SERVER, TOOLS, type Net } from "@/lib/mcp";

const MAX_BODY = 64 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Max-Age": "86400",
};

const set = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** The deployment the site itself reads, or the live testnet one when none is configured. */
function net(): Net {
  return netFrom({
    network: set(process.env.NEXT_PUBLIC_NETWORK),
    consume: set(process.env.NEXT_PUBLIC_CONSUME_CONTRACT),
    intents: set(process.env.NEXT_PUBLIC_INTENTS_CONTRACT),
    rpcUrl: set(process.env.NEXT_PUBLIC_RPC_URL),
  });
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...CORS, ...extra } });

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the body must be one JSON-RPC message" } }, 400);
  }
  let where: Net;
  try {
    where = net();
  } catch (e) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: e instanceof Error ? e.message : "Not configured" } }, 500);
  }
  // older clients may send several messages at once
  if (Array.isArray(body)) {
    const answers = (await Promise.all(body.slice(0, 20).map((m) => handleMcp(where, m)))).filter((a) => a !== null);
    return answers.length ? json(answers) : new Response(null, { status: 202, headers: CORS });
  }
  const answer = await handleMcp(where, body);
  // a notification gets no answer
  return answer === null ? new Response(null, { status: 202, headers: CORS }) : json(answer);
}

/** This server opens no stream: a GET is told how to connect instead. */
export function GET() {
  return json(
    {
      server: SERVER,
      about: "CONSUME's Model Context Protocol server. POST JSON-RPC 2.0 messages here (Streamable HTTP). It reads the contract and prepares unsigned calls. It holds no key and signs nothing.",
      tools: TOOLS.map((t) => t.name),
    },
    405,
    { Allow: "POST, OPTIONS" },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
