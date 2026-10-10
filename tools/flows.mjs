// Exercises the less common paths: talismans, jackpot, shop buy/sell,
// menu and quality switch, save + reload + continue, game over, free play.
//   node tools/flows.mjs <url> <outDir>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const click = async (name) => { await page.getByRole('button', { name }).first().click(); await page.waitForTimeout(300); };
const ff = (n, dropEvery = 0) => page.evaluate(({ n, dropEvery }) => {
  const g = window.__game;
  for (let i = 0; i < n; i++) { if (dropEvery && i % dropEvery === 0 && g.canDrop()) g.drop(0.6); g.world.step(); g.update(1 / 60); }
}, { n, dropEvery });
const step = async (label, fn) => { try { await fn(); console.log('ok  ', label); } catch (e) { console.log('FAIL', label, e.message.split('\n')[0]); } };

await page.goto(url);
await ready();
await step('start run', async () => { await click('ランをはじめる'); await click('夜をはじめる'); });
await step('use quake talisman from rail', async () => {
  await page.getByRole('button', { name: '地震札を使う' }).click();
  const n = await page.evaluate(() => window.__game.talismans.length);
  if (n !== 0) throw new Error('talisman not consumed');
});
await step('forced jackpot', async () => {
  await page.evaluate(() => { const g = window.__game; g._drawOutcome = () => 'seven'; g.slot.stock = 1; });
  await ff(320);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/f-jackpot.png` });
  await page.evaluate(() => { delete window.__game._drawOutcome; });
});
await step('menu + quality low/high', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /画質/ }).click();
  await page.getByRole('button', { name: /画質/ }).click();
  await page.getByRole('button', { name: /画質/ }).click();
  await click('つづける');
});
await step('save + reload + continue', async () => {
  await ff(120, 20);
  const before = await page.evaluate(() => ({ bank: window.__game.bank, left: window.__game.night.dropsLeft }));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await ready();
  await click('続きから');
  const after = await page.evaluate(() => ({ bank: window.__game.bank, left: window.__game.night.dropsLeft, phase: window.__game.phase, bodies: window.__game.world.count }));
  if (after.phase !== 'night' || after.left !== before.left) throw new Error(JSON.stringify({ before, after }));
});
await step('dawn + shop buy + sell', async () => {
  await page.evaluate(() => { const g = window.__game; g.night.paid += 200; g._checkQuota(); });
  await click('夜明けにする');
  await click('夜店へ');
  await page.evaluate(() => { window.__game.bank += 50; window.__game.emit('shop', window.__game.shop); });
  await page.waitForTimeout(200);
  const buttons = page.getByRole('button', { name: /枚で買う/ });
  await buttons.first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/f-shop.png` });
  const charms = await page.evaluate(() => window.__game.charms.length + window.__game.talismans.length);
  if (charms < 1) throw new Error('nothing bought');
  const sell = page.getByRole('button', { name: /売る/ });
  if (await sell.count()) await sell.first().click();
  await click('次の夜へ');
  await click('夜をはじめる');
});
await step('game over', async () => {
  await page.evaluate(() => { const g = window.__game; g.night.dropsLeft = 0; g.bank = 0; g.night.grace = 0.01; g.rain = []; g.slot.stock = 0; g.slot.spinning = false; });
  await ff(30);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/f-over.png` });
  if (!(await page.getByRole('button', { name: 'もう一度' }).count())) throw new Error('no game over screen');
  await click('タイトルへ');
});
await step('free play + borrow', async () => {
  await click('フリープレイ');
  await page.evaluate(() => { window.__game.bank = 0; });
  await page.waitForTimeout(400);
  await click('メダルを50枚借りる');
  const bank = await page.evaluate(() => window.__game.bank);
  if (bank !== 50) throw new Error('bank ' + bank);
  await page.mouse.click(640, 300);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/f-free.png` });
});
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
