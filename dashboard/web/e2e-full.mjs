import { chromium } from "playwright";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const counts = async () => ({
  n: await page.locator(".react-flow__node").count(),
  e: await page.locator(".react-flow__edge").count(),
});
const assertGraph = async (tag) => {
  const c = await counts();
  const ok = c.n === 6 && c.e === 9;
  console.log(`${ok ? "PASS" : "FAIL"} ${tag}: nodes=${c.n} edges=${c.e}`);
  return ok;
};
let fails = 0;

await page.goto("http://localhost:7890", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
if (!(await assertGraph("initial load"))) fails++;
await page.screenshot({ path: "/tmp/v-1-initial.png" });

// --- run 1: full mock pipeline, approve at gate ---
await page.getByPlaceholder("Describe a task for the pipeline…").fill("v: single button page");
await page.locator('input[placeholder="../site"]').fill("/tmp/pipe-verify");
await page.click("text=mock agents");
await page.getByRole("button", { name: "Run", exact: true }).click();

// poll during the run — graph must never lose edges/nodes
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(400);
  if (!(await assertGraph(`run1 t+${i * 400}ms`))) fails++;
  const waiting = await page.locator("text=Approval required at").count();
  if (waiting) break;
}
await page.screenshot({ path: "/tmp/v-2-gate.png" });

// header should show Stop while waiting
const stopVisible = await page.getByRole("button", { name: "Stop", exact: true }).count();
console.log(stopVisible ? "PASS stop button visible at gate" : "FAIL no stop button");
if (!stopVisible) fails++;

await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.waitForSelector(".uppercase:has-text('completed'), header >> text=COMPLETED", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
if (!(await assertGraph("run1 after completion"))) fails++;
const status1 = await page.locator("header").innerText();
console.log(status1.includes("COMPLETED") ? "PASS run1 completed" : `FAIL run1 status: ${status1}`);
if (!status1.includes("COMPLETED")) fails++;
await page.screenshot({ path: "/tmp/v-3-completed.png" });

// --- run 2: stop mid-flight / at gate, then resume ---
await page.getByPlaceholder("Describe a task for the pipeline…").fill("v2: stop+resume test");
await page.getByRole("button", { name: "Run", exact: true }).click();
await page.waitForTimeout(1200);
if (!(await assertGraph("run2 started"))) fails++;
await page.screenshot({ path: "/tmp/v-4-running.png" });

await page.getByRole("button", { name: "Stop", exact: true }).click();
await page.waitForTimeout(1200);
const status2 = await page.locator("header").innerText();
const interrupted = status2.includes("INTERRUPTED");
console.log(interrupted ? "PASS run2 interrupted" : `FAIL run2 status after stop: ${status2}`);
if (!interrupted) fails++;
await page.screenshot({ path: "/tmp/v-5-stopped.png" });

// resume it
const resumeBtn = await page.getByRole("button", { name: "Resume", exact: true }).count();
console.log(resumeBtn ? "PASS resume button shown" : "FAIL no resume button");
if (!resumeBtn) fails++;
if (resumeBtn) {
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  // it should reach the gate again → approve → completed
  await page.waitForSelector("text=Approval required at", { timeout: 20000 });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.waitForTimeout(2000);
  const status3 = await page.locator("header").innerText();
  console.log(status3.includes("COMPLETED") ? "PASS run2 resumed→completed" : `FAIL run2 final: ${status3}`);
  if (!status3.includes("COMPLETED")) fails++;
  if (!(await assertGraph("run2 final"))) fails++;
}
await page.screenshot({ path: "/tmp/v-6-final.png" });

console.log("----");
console.log("console/page errors:", errors.length ? errors.join("\n") : "none");
console.log(fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED`);
await browser.close();
