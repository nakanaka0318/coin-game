// Scripted browser session for checking the game flow end to end.
//   node tools/play.mjs <url> <outDir> [width] [height]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const [url, out, w = '1280', h = '800'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, hasTouch: process.env.TOUCH === '1' });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const click = async (text) => { await page.getByRole('button', { name: text }).first().click(); await page.waitForTimeout(400); };
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); };

await click('ランをはじめる');
await page.waitForTimeout(800);
await shot('1-intro');
await click('夜をはじめる');
// Drop medals at the centre for a while (sim time advances slowly under software GL).
for (let i = 0; i < 14; i++) {
  await page.mouse.click(Number(w) / 2 + (i % 3 - 1) * 20, Number(h) * 0.45);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1500);
await shot('2-play');
// Fast-forward: step the game directly to reach dawn quickly.
const state = await page.evaluate(() => {
  const g = window.__game;
  g.night.paid = g.night.quota; g.night.cleared = true;
  return { phase: g.phase, bank: g.bank, paid: g.night.paid, steps: window.__stats.steps, stepMs: window.__stats.stepMs };
});
console.log('state', JSON.stringify(state));
await page.waitForTimeout(500);
await shot('3-quota');
await click('夜明けにする');
await page.waitForTimeout(600);
await shot('4-dawn');
await click('夜店へ');
await page.waitForTimeout(600);
await shot('5-shop');
await click('次の夜へ');
await page.waitForTimeout(800);
await shot('6-intro2');
console.log(logs.join('\n'));
await browser.close();
