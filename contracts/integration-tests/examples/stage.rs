//! A stage for the browser tests in web/e2e: a local NEAR sandbox with the
//! real CONSUME contract launched on it next to the NEAR Intents stand-in,
//! kept running so the site can be pointed at it.
//!
//!   cargo run --example stage -- plan.json
//!
//! The plan (written by web/e2e/run.mjs) holds the arguments of the one `new`
//! call, built by scripts/launch-args.mjs from the same memecoin list the
//! site reads, plus the test deposits and the prices to post.
//!
//! Once everything is launched it prints one line, `READY {...}`, with the
//! sandbox's RPC address and a control port. The control port takes one JSON
//! request per line and answers with one JSON line:
//!
//!   {"signer":"alice.test.near","transactions":[{"receiverId":..,"actions":[..]}]}
//!
//! and signs and sends those transactions as that sandbox account, the way a
//! wallet would. The keys exist only inside the sandbox. It stops when its
//! standard input closes.
//!
//! Build the wasm first:
//!   (cd consume && cargo near build non-reproducible-wasm)
//!   (cd mock-intents && cargo near build non-reproducible-wasm)

use std::collections::HashMap;

use anyhow::{anyhow, ensure, Context};
use near_workspaces::operations::Function;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const CONSUME_WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/near/consume/consume.wasm");
const INTENTS_WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/near/mock_intents/mock_intents.wasm");

async fn sub(root: &Account, name: &str, near: u128) -> anyhow::Result<Account> {
    Ok(root.create_subaccount(name).initial_balance(NearToken::from_near(near)).transact().await?.into_result()?)
}

fn text<'a>(v: &'a Value, what: &str) -> anyhow::Result<&'a str> {
    v.as_str().ok_or_else(|| anyhow!("{what} must be a string"))
}

/// Sign and send what a wallet was asked to: each transaction is a list of
/// function calls to one contract. Answers with the transaction hashes; what
/// happened in them is read from the sandbox's RPC, as a wallet would.
async fn send(accounts: &HashMap<String, Account>, req: &Value) -> anyhow::Result<Value> {
    let signer = text(&req["signer"], "signer")?;
    let signer = accounts.get(signer).ok_or_else(|| anyhow!("{signer} is not an account on this stage"))?;
    let mut hashes = Vec::new();
    for tx in req["transactions"].as_array().ok_or_else(|| anyhow!("transactions must be a list"))? {
        let receiver: AccountId = text(&tx["receiverId"], "receiverId")?.parse()?;
        let mut batch = signer.batch(&receiver);
        for action in tx["actions"].as_array().ok_or_else(|| anyhow!("actions must be a list"))? {
            ensure!(action["type"] == "FunctionCall", "only function calls are signed here");
            let p = &action["params"];
            batch = batch.call(
                Function::new(text(&p["methodName"], "methodName")?)
                    .args_json(&p["args"])
                    .gas(Gas::from_gas(text(&p["gas"], "gas")?.parse()?))
                    .deposit(NearToken::from_yoctonear(text(&p["deposit"], "deposit")?.parse()?)),
            );
        }
        hashes.push(batch.transact().await?.outcome().transaction_hash.to_string());
    }
    Ok(json!({ "hashes": hashes }))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let path = std::env::args().nth(1).ok_or_else(|| anyhow!("usage: stage <plan.json>"))?;
    let plan: Value = serde_json::from_str(&std::fs::read_to_string(&path).with_context(|| format!("reading {path}"))?)?;

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let owner = sub(&root, "owner", 20).await?;

    // the NEAR Intents stand-in, with a test deposit set for each memecoin
    let intents = sub(&root, "intents", 20).await?.deploy(&std::fs::read(INTENTS_WASM).context("mock_intents.wasm is not built")?).await?.into_result()?;
    intents.call("new").args_json(json!({ "owner_id": owner.id() })).transact().await?.into_result()?;
    for drip in plan["drips"].as_array().ok_or_else(|| anyhow!("drips must be a list"))? {
        owner
            .call(intents.id(), "set_drip")
            .args_json(json!({ "token_id": drip[0], "amount": drip[1] }))
            .transact()
            .await?
            .into_result()?;
    }

    // CONSUME, launched once with the plan's arguments
    let consume = sub(&root, "consume", 50).await?.deploy(&std::fs::read(CONSUME_WASM).context("consume.wasm is not built")?).await?.into_result()?;
    consume.call("new").args_json(&plan["launch"]).max_gas().transact().await?.into_result()?;
    owner
        .call(consume.id(), "set_prices")
        .args_json(json!({ "prices": plan["prices"] }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let mut accounts = HashMap::new();
    for name in ["alice", "bob", "charlie", "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab"] {
        let account = sub(&root, name, 50).await?;
        accounts.insert(account.id().to_string(), account);
    }
    accounts.insert(owner.id().to_string(), owner.clone());

    let control = TcpListener::bind("127.0.0.1:0").await?;
    println!(
        "READY {}",
        json!({
            "rpc": worker.rpc_addr(),
            "control": control.local_addr()?.port(),
            "consume": consume.id(),
            "intents": intents.id(),
            "owner": owner.id(),
            "accounts": accounts.keys().collect::<Vec<_>>(),
        })
    );

    // run until the parent goes away, then return so the sandbox is shut down
    let serve = async {
        loop {
            let (socket, _) = control.accept().await?;
            let (read, mut write) = socket.into_split();
            let mut lines = BufReader::new(read).lines();
            while let Some(line) = lines.next_line().await? {
                let reply = match serde_json::from_str::<Value>(&line) {
                    Ok(req) => send(&accounts, &req).await.unwrap_or_else(|e| json!({ "error": format!("{e:#}") })),
                    Err(e) => json!({ "error": format!("not JSON: {e}") }),
                };
                write.write_all(format!("{reply}\n").as_bytes()).await?;
            }
        }
        #[allow(unreachable_code)]
        anyhow::Ok(())
    };
    let parent_gone = async {
        let mut sink = Vec::new();
        let _ = tokio::io::stdin().read_to_end(&mut sink).await;
    };
    tokio::select! {
        r = serve => r?,
        _ = parent_gone => {}
    }
    Ok(())
}
