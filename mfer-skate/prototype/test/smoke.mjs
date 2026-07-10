// Headless smoke test: loads the standalone build, plays a few seconds,
// captures console errors + screenshots at key moments.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + resolve(here, '../dist/mfer-skate.html');
const shots = process.env.SHOT_DIR || resolve(here, '../dist');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(page_url);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}/shot-1-title.png` });

// start the run
await page.mouse.click(640, 500);
await page.waitForTimeout(1800);
await page.screenshot({ path: `${shots}/shot-2-rolling.png` });

// ollie + kickflip
await page.keyboard.press(' ');
await page.waitForTimeout(120);
await page.keyboard.press('z');
await page.waitForTimeout(200);
await page.screenshot({ path: `${shots}/shot-3-kickflip.png` });
await page.waitForTimeout(1500);

// steer toward the rail area then screenshot the park
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(700);
await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}/shot-4-park.png` });

const hud = await page.evaluate(() => ({
  score: document.getElementById('score')?.textContent,
  timer: document.getElementById('timer')?.textContent,
}));

console.log('HUD:', JSON.stringify(hud));
console.log(errors.length ? `ERRORS (${errors.length}):\n` + errors.join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
process.exit(errors.length ? 1 : 0);
