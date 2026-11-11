import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Try the demo", description: "A short walkthrough of feeding, transferable Bond NFTs and redeeming on NEAR testnet." };
const repo = process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/ethboi/consume";

export default function DemoPage() {
  return <main className="folio demo-guide">
    <nav aria-label="Demo navigation"><Link href="/">← CONSUME</Link><a href={repo}>Source on GitHub</a></nav>
    <header>
      <p className="label">NEAR testnet · a guided demo</p>
      <h1>Feed. Pass the Bond. Redeem.</h1>
      <p>Allow about two minutes once your wallet is funded. This is the live testnet product: test memecoins have no value, and arrivals from other chains use a stand-in for NEAR Intents.</p>
    </header>
    <ol className="demo-steps">
      <li><h2>Get ready</h2><p>Open <Link href="/#feed">the feeding panel</Link>, connect a NEAR testnet wallet, and use <a href="https://near-faucet.io/">the faucet</a> if you need test NEAR. Keep at least 0.2 NEAR available for a first feeding’s storage and gas. Choose PEPE, then press “Bring test PEPE from Ethereum.” This credits free test PEPE; it does not bridge real funds.</p></li>
      <li><h2>Feed $10 of test PEPE</h2><p>Choose $10 and read the quote: the tithe and the $CONSUME locked in your Bond are shown before signing. Press “Feed the Serpent” and approve in your wallet. A Bond card appears; its number and transaction link are your evidence. Dollar amounts here value test tokens at quoted prices, not money deposited.</p></li>
      <li><h2>Pass the payout to another wallet</h2><p>In <Link href="/#bonds">Bonds</Link>, choose “Send this Bond,” enter a second existing testnet account you control, and review the address. The transfer spends 0.01024 NEAR of storage credit plus gas; if needed it adds 0.1 NEAR of refundable credit first. Confirm in your wallet. Switch to the recipient: the same Bond appears with the same schedule. No payment is collected. A sale through an approved account is tested on a local sandbox, and no marketplace has listed a Bond.</p></li>
      <li><h2>Collect, or finish immediately</h2><p>A Bond releases continuously over 30 days; you can collect a small amount after waiting briefly. The recipient’s Collect registers them for $CONSUME if needed and pays them, not the sender. To demonstrate the entire exit now, choose “Break the seal early”: the preview shows the payout and the half of the still-locked amount you give up. Confirm only after reading it.</p></li>
      <li><h2>Burn and redeem</h2><p>In <Link href="/#transmute">Redeem</Link>, choose an amount of your collected $CONSUME and inspect the basket. “Burn and redeem” burns those tokens and credits your share of the test memecoins to your test Intents balance. The first redemption may add 0.1 NEAR of credit for payout records. Open its transaction and the <Link href="/#ledger">Ledger</Link> to check the result.</p></li>
    </ol>
    <section aria-labelledby="why-play"><h2 id="why-play">Why take part?</h2>
      <p>The Feast makes the basket a contest between memecoin communities. Suppose DOGE wins this week: next week a $10 DOGE feeding at unchanged prices puts the full $10 toward its Bond, while a rival paying a 1% tithe puts $9.90 toward its Bond. No memecoin feasts two weeks running, so the week after that the Feast passes to the most fed of the others, and DOGE’s supporters must sit one out before they can win it back.</p>
      <p>The trade-off is explicit: your claim vests over 30 days. You can pass the Bond to someone else, wait and collect, or leave early and forfeit half of what is still locked. Keeping your original coins avoids these fees and constraints. The reason to participate is the shared basket and community contest, not guaranteed profit; falling memecoin prices can lower the basket’s value.</p>
      <p>That appeal is a hypothesis. Current automated activity is run by the builder; independent user adoption has not been established.</p>
    </section>
    <section aria-labelledby="demo-proof"><h2 id="demo-proof">Check the evidence</h2>
      <p><a href={`${repo}#seen-on-testnet`}>Public testnet transactions</a> show feeding, collection, early exit and redemption. Bond 26 also has a verified <a href="https://testnet.nearblocks.io/txns/96Uyw8uJV6F2V49bTwDiBih5gSBkXPo2k7ctekSjREjY">transfer</a> and <a href="https://testnet.nearblocks.io/txns/4hN5JL3JGMNWh6cLbuWDFFtTaqFcCE7WpwmGn4ny2VYt">collection by its recipient</a>, sent through the NEAR CLI between builder-owned accounts. <a href={`${repo}/blob/main/docs/DEMO.md`}>The demo notes</a> distinguish live evidence from sandbox tests and include the recording script.</p>
      <p>The <a href={`${repo}/actions`}>automated checks</a> exercise the site and deployed contracts on a local NEAR sandbox with a test wallet. They are not a recording of a third-party wallet session. A two-minute demo film is in the <a href="https://x.com/EthBoi_/status/2120534208674447732">demo post on X</a>.</p>
      <p>Prices and the guardian role are currently controlled by the builder. The contract account&apos;s key was <a href="https://explorer.testnet.near.org/transactions/8LQwF4z3mxMiYo5uCcKwz5Q9vsfyiVGxFGhhi8WbsKN">deleted on 2026-11-11</a>, so its code can no longer be replaced. Read <a href={`${repo}#what-to-know-before-you-trust-it`}>the trust assumptions</a> before evaluating the design.</p>
    </section>
    <Link className="press" href="/#feed">Try the live testnet demo</Link>
  </main>;
}
