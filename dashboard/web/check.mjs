import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:7890";
const shot = process.argv[3] || "/tmp/dash.png";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    errors.push(`console.${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ""}`));
page.on("requestfailed", (r) =>
  errors.push(`reqfail: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
await page.waitForTimeout(2500);
const rootHtml = await page.evaluate(
  () => document.getElementById("root")?.innerHTML?.length ?? -1
);
const nodeCount = await page.locator(".react-flow__node").count();
const edgeCount = await page.locator(".react-flow__edge").count();
await page.screenshot({ path: shot, fullPage: false });
console.log("root html length:", rootHtml);
console.log("nodes:", nodeCount, "edges:", edgeCount);
console.log("errors:", errors.length ? errors.join("\n  ") : "none");
await browser.close();
