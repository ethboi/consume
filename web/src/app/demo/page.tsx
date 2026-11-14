import type { Metadata } from "next";
import Link from "next/link";
import { Colophon, PageHead } from "@/components/Page";

export const metadata: Metadata = { title: "Try the demo", description: "A short walkthrough of feeding, transferable Bond NFTs and redeeming on NEAR testnet." };
const repo = process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/ethboi/consume";

/** One step: what to press on screen, with the costs and caveats folded under it. */
function Step({ title, children, fine }: { title: string; children: React.ReactNode; fine: React.ReactNode }) {
  return <li>
    <h2>{title}</h2>
    <p>{children}</p>
    <details className="fine"><summary>Costs and caveats</summary><p>{fine}</p></details>
  </li>;
}

export default function DemoPage() {
  return <div className="folio">
    <PageHead here="/demo" />
    <main className="demo-guide">
    <header>
      <p className="label">NEAR testnet · a guided demo</p>
      <h1>Feed. Pass the Bond. Redeem.</h1>
      <p>About two minutes once your wallet is funded. Test memecoins have no value, and arrivals from other chains use a stand-in for NEAR Intents.</p>
    </header>
    <ol className="demo-steps">
      <Step title="Get ready" fine={<>This is the live testnet product. Use <a href="https://near-faucet.io/">the faucet</a> if you need test NEAR, and keep at least 0.2 NEAR available for a first feeding’s storage and gas. “Get free test PEPE” credits free test PEPE; it does not bridge real funds.</>}>
        Open <Link href="/#feed">the feeding panel</Link> and connect a NEAR testnet wallet, or press “No wallet? Try as a guest.” Choose PEPE, then press “Get free test PEPE.”
      </Step>
      <Step title="Feed $10 of test PEPE" fine={<>The quote shows the tithe and the $CONSUME locked in your Bond before you sign. The Bond’s number and transaction link are your evidence. Dollar amounts here value test tokens at quoted prices, not money deposited.</>}>
        Choose $10, read the quote, press “Feed the Serpent” and approve in your wallet. A Bond card appears.
      </Step>
      <Step title="Pass the payout to another wallet" fine={<>Enter a second existing testnet account you control and review the address. The transfer spends 0.01024 NEAR of storage credit plus gas; if needed it adds 0.1 NEAR of refundable credit first. No payment is collected. A sale through an approved account is tested on a local sandbox, and no marketplace has listed a Bond.</>}>
        In <Link href="/#bonds">Bonds</Link>, choose “Send this Bond” and confirm. Switch to the recipient: the same Bond appears with the same schedule.
      </Step>
      <Step title="Collect, or finish immediately" fine={<>A Bond releases continuously over 30 days, so after a short wait there is a small amount to collect. The recipient’s Collect registers them for $CONSUME if needed and pays them, not the sender. Before you break the seal, the preview shows the payout and the half of the still-locked amount you give up. Confirm only after reading it.</>}>
        Collect what has been released so far, or choose “Break the seal early” to see the entire exit now.
      </Step>
      <Step title="Burn and redeem" fine={<>“Burn and redeem” burns those tokens and credits your share of the test memecoins to your test Intents balance. The first redemption may add 0.1 NEAR of credit for payout records.</>}>
        In <Link href="/#transmute">Redeem</Link>, choose an amount of your collected $CONSUME, inspect the basket and press “Burn and redeem.” Open its transaction and the <Link href="/#ledger">Ledger</Link> to check the result.
      </Step>
    </ol>
    <section aria-labelledby="why-play"><h2 id="why-play">Why take part?</h2>
      <ul>
        <li><b>A contest between memecoin communities.</b> The most fed memecoin of a week pays no tithe the next.</li>
        <li><b>Your claim vests over 30 days.</b> Pass the Bond on, wait and collect, or leave early and forfeit half of what is still locked.</li>
        <li><b>No promised profit.</b> Falling memecoin prices can lower the basket’s value, and most activity so far is the builder’s own.</li>
      </ul>
      <details className="fine"><summary>The whole case</summary>
        <p>The Feast makes the basket a contest between memecoin communities. Suppose DOGE wins this week: next week a $10 DOGE feeding at unchanged prices puts the full $10 toward its Bond, while a rival paying a 1% tithe puts $9.90 toward its Bond. No memecoin feasts two weeks running, so the week after that the Feast passes to the most fed of the others, and DOGE’s supporters must sit one out before they can win it back.</p>
        <p>The trade-off is explicit: your claim vests over 30 days. You can pass the Bond to someone else, wait and collect, or leave early and forfeit half of what is still locked. Keeping your original coins avoids these fees and constraints. The reason to participate is the shared basket and community contest, not guaranteed profit; falling memecoin prices can lower the basket’s value.</p>
        <p>That appeal is a hypothesis. Current automated activity is run by the builder; independent user adoption has not been established.</p>
      </details>
    </section>
    <section aria-labelledby="demo-proof"><h2 id="demo-proof">Check the evidence</h2>
      <ul>
        <li><b>On chain.</b> <a href={`${repo}#seen-on-testnet`}>Public testnet transactions</a> of feeding, collection, early exit and redemption, and Bond 26’s <a href="https://testnet.nearblocks.io/txns/96Uyw8uJV6F2V49bTwDiBih5gSBkXPo2k7ctekSjREjY">transfer</a> and <a href="https://testnet.nearblocks.io/txns/4hN5JL3JGMNWh6cLbuWDFFtTaqFcCE7WpwmGn4ny2VYt">collection by its recipient</a>.</li>
        <li><b>Tested.</b> <a href={`${repo}/actions`}>Automated checks</a> on a local NEAR sandbox, and a two-minute <a href="https://x.com/EthBoi_/status/2120534208674447732">demo film on X</a>.</li>
        <li><b>Who holds the keys.</b> The builder posts prices and is the guardian DAO’s only vote; the contract’s own key was <a href="https://explorer.testnet.near.org/transactions/8LQwF4z3mxMiYo5uCcKwz5Q9vsfyiVGxFGhhi8WbsKN">deleted</a>. Read <a href={`${repo}#what-to-know-before-you-trust-it`}>the trust assumptions</a>.</li>
      </ul>
      <details className="fine"><summary>The details</summary>
        <p>Bond 26’s transfer and collection were sent through the NEAR CLI between builder-owned accounts. <a href={`${repo}/blob/main/docs/DEMO.md`}>The demo notes</a> distinguish live evidence from sandbox tests and include the recording script.</p>
        <p>The automated checks exercise the site and deployed contracts on a local NEAR sandbox with a test wallet. They are not a recording of a third-party wallet session.</p>
        <p>The builder holds the key that posts prices and the only vote in the DAO that is the guardian. Since 2026-11-11 prices are posted from a separate account, <code>assayer.consumecash.testnet</code>, whose <a href="https://explorer.testnet.near.org/transactions/G1LAQEv9jzRMWFqL7BQzLHwv1bkm9JYF4uLBu9qEuZ31">only key can post prices</a> and do nothing else. The guardian, which can replace that account, has been <a href="https://explorer.testnet.near.org/transactions/3PdUM8nJXgu2L4eb8fDMLyXSGjkuNtJ3LHSUroZqhpnC">a DAO since 2026-11-11</a>, with the builder&apos;s account as its only council member. The contract account&apos;s key was deleted on 2026-11-11, so its code can no longer be replaced. Read the trust assumptions before evaluating the design.</p>
      </details>
    </section>
    <Link className="press" href="/#feed">Try the live testnet demo</Link>
    </main>
    <Colophon />
  </div>;
}
