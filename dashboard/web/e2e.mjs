import { chromium } from "playwright";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

await page.goto("http://localhost:7890", { waitUntil: "networkidle" });

// start a mock run into a throwaway workspace
await page.getByPlaceholder("Describe a task for the pipeline…").fill("e2e: build a two-button page");
await page.locator('input[placeholder="../site"]').fill("/tmp/pipe-e2e");
await page.click("text=mock agents");
await page.getByRole("button", { name: "Run", exact: true }).click();
console.log("submitted run");

// wait for the deploy gate, then approve
await page.waitForSelector("text=Approval required", { timeout: 30000 });
console.log("gate reached — approving");
await page.screenshot({ path: "/tmp/e2e-gate.png" });
await page.getByRole("button", { name: "Approve" }).click();

// wait for completion
await page.waitForSelector("text=completed", { timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/e2e-done.png" });
console.log("run completed");
console.log("errors:", errors.length ? errors.join("\n  ") : "none");
await browser.close();
