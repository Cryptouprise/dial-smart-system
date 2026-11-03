import { chromium } from "playwright";
import { pathToFileURL } from "url";
import path from "path";

const root = process.cwd();
const file = path.join(root, "docs", "dial-smart-capability-rings.html");
const url = pathToFileURL(file).href;

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1180 }, deviceScaleFactor: 2 });
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("pageerror: " + e.message));

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(3500);

const stats = await page.evaluate(() => {
  const segs = [...document.querySelectorAll("path.seg")];
  const drawn = segs.filter(s => {
    const cs = getComputedStyle(s);
    return cs.animationName.includes("draw");
  });
  const animNames = new Set(segs.map(s => getComputedStyle(s).animationName));
  return {
    segCount: segs.length,
    drawCount: drawn.length,
    animNames: [...animNames],
    ringNames: [...document.querySelectorAll("text.ringname")].map(t => t.textContent),
    ringCounts: [...document.querySelectorAll("text.ringcount")].map(t => t.textContent),
    legendRows: document.querySelectorAll("#legend .row").length,
    legendCaps: document.querySelectorAll("#legend .cap").length,
    trackSteps: document.querySelectorAll("#track .step").length,
    kpis: ["k1", "k2", "k3", "k4", "k5"].map(id => document.getElementById(id).textContent),
    hub: document.querySelector("text.hub")?.textContent,
    spins: [...document.querySelectorAll(".spin, .spinrev")].length,
    pulses: [...document.querySelectorAll(".pulse")].length,
    svgBox: (() => { const b = document.querySelector("svg#rings").getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
    scrollH: document.body.scrollHeight,
  };
});

await page.screenshot({ path: path.join(root, "docs", "dial-smart-capability-rings.png"), fullPage: true });
await browser.close();

const expect = {
  segCount: 40,
  legendRows: 7,
  trackSteps: 7,
  spins: 2,
  pulses: 1,
};
const fails = [];
for (const [k, v] of Object.entries(expect)) {
  if (stats[k] !== v) fails.push(`${k}: expected ${v}, got ${stats[k]}`);
}
if (stats.drawCount !== 36) fails.push(`drawCount: expected 36, got ${stats.drawCount}`);
if (errors.length) fails.push(`console errors: ${errors.join(" | ")}`);
if (stats.kpis.some(k => k === "0")) fails.push(`kpis not animated: ${stats.kpis.join(",")}`);
if (stats.svgBox.w < 300) fails.push(`svg too small: ${JSON.stringify(stats.svgBox)}`);

console.log(JSON.stringify(stats, null, 2));
console.log(fails.length ? "RESULT: FAIL\n" + fails.join("\n") : "RESULT: PASS");
process.exit(fails.length ? 1 : 0);
