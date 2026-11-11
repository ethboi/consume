// Run through `node e2e/run.mjs`, which builds and starts what each project
// needs and passes the addresses in. See e2e/README.md.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: ".run/results",
  // the chain tests tell one story in order on one chain, so nothing runs side by side
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // E2E_CHANNEL=chrome uses the Chrome already on the machine instead of Playwright's own Chromium
    channel: process.env.E2E_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "sample", testMatch: "sample.spec.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "chain", testMatch: ["chain.spec.ts", "guest.spec.ts", "transfer.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    { name: "live", testMatch: "live.spec.ts", use: { ...devices["Desktop Chrome"] } },
  ],
});
