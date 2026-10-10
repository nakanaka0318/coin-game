// Screenshot helper for local visual checks.
//   node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [js-to-eval]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const [url, out, w = '1280', h = '800', wait = '4000', script = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => logs.push('timeout waiting for __ready'));
if (script) await page.evaluate(script);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
const stats = await page.evaluate(() => JSON.stringify(window.__stats || {})).catch(() => '');
console.log(logs.slice(-30).join('\n'));
console.log('stats', stats);
await browser.close();
