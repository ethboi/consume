// The bots that run against the public testnet deployment, exactly as pm2
// runs them:
//
//   pm2 start agents/testnet-bots.config.cjs
//
// Every one signs as a subaccount of consumecash.testnet, the deployer's
// account, so the name in the Ledger says whose it is. They are the project's
// own activity with free test memecoins, not usage by anyone else. Each
// account's key sits in the local near CLI keychain; none is in this
// repository.
//
// Each feeder waits a random time (--jitter) before every round, so they do
// not all act in the same minute.

const ROOT = "consumecash.testnet";
const HOUR = 3600;

/** [name, what it feeds, dollars a feeding, hours between rounds, hours of random wait] */
const FEEDERS = [
  // eats anything
  ["glutton", "--wander", 5, 2, 0.5],
  // a little of anything, now and then
  ["pilgrim", "--wander", 1.5, 6, 1],
  // feeds rarely, and collects as soon as there is anything to collect (see below)
  ["miser", "--wander", 2, 12, 1],
  // feeds what is feasting, so it pays no tithe; with no Feast it feeds what it has left over, or waits
  ["courtier", "", 3, 6, 1],
  // the chain maxis: each feeds only the memecoins of its own chain
  ["doge-maxi", "--chain Dogecoin", 4, 4, 1],
  ["eth-maxi", "--chain Ethereum", 4, 3, 1],
  ["sol-maxi", "--chain Solana", 3, 4, 1],
  ["near-maxi", "--chain NEAR", 2, 3, 1],
];

const bot = (name, args) => ({
  name: `consume-${name}`,
  script: "agents/bots.mjs",
  cwd: `${__dirname}/..`,
  args,
  autorestart: true,
});

const patient = [ROOT, ...FEEDERS.map(([name]) => name).filter((n) => n !== "miser").map((n) => `${n}.${ROOT}`)];

module.exports = {
  apps: [
    ...FEEDERS.map(([name, what, usd, hours, wait]) =>
      bot(name, `feeder --as ${name}.${ROOT} ${what} --usd ${usd} --bring --max-tithe 5 --send --every ${hours * HOUR} --jitter ${wait * HOUR}`.replace(/\s+/g, " ")),
    ),
    // everyone but the miser collects a Bond once 500 $CONSUME is ready
    bot("collector", `collector --as ${patient.join(",")} --min 500 --send --every ${4 * HOUR} --jitter ${0.5 * HOUR}`),
    // the miser collects at 50
    bot("miser-collects", `collector --as miser.${ROOT} --min 50 --send --every ${6 * HOUR} --jitter ${0.5 * HOUR}`),
  ],
};
