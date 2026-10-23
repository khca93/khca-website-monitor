const { chromium } = require('playwright');

const START_URL = 'https://exampaper.khca.info/exam_papers.html?category=10th%20SSC';
const HOST = new URL(START_URL).host;
const MIN_SEC = 150, MAX_SEC = 180; // 2.5 ते 3 मिनिटे

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

async function scroll(page, label) {
  const steps = Math.floor(rand(4, 8));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, rand(300, 700));
    await sleep(rand(1200, 2500));
  }
  await page.mouse.wheel(0, -3000);
  log(`scrolled (${label})`);
}

(async () => {
  const t0 = Date.now();
  const targetMs = rand(MIN_SEC, MAX_SEC) * 1000;
  const visited = new Set([START_URL]);
  let pages = 1;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const page = await context.newPage();

  const res = await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status = res ? res.status() : 0;
  log(`opened start page, HTTP ${status}, title="${await page.title()}"`);
  if (status === 0 || status >= 400) {
    await browser.close();
    process.exit(1); // site down -> workflow fail -> GitHub email alert
  }

  while (Date.now() - t0 < targetMs) {
    await scroll(page, page.url());

    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
    const candidates = [...new Set(links)].filter((l) => {
      try {
        const u = new URL(l);
        return u.host === HOST && !visited.has(l) &&
          !/\.(pdf|zip|docx?|jpg|png)$/i.test(u.pathname) && !l.includes('#');
      } catch { return false; }
    });
    log(`found ${links.length} links, ${candidates.length} new internal`);

    if (candidates.length) {
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      visited.add(next);
      try {
        const r = await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 45000 });
        pages++;
        log(`visited ${next} HTTP ${r ? r.status() : '?'}`);
        await scroll(page, 'internal');
        await sleep(rand(3000, 6000));
      } catch (e) {
        log(`failed ${next}: ${e.message}`);
      }
    }
    // पुन्हा मुख्य page वर
    try { await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
    await sleep(rand(2000, 4000));
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  const summary = `Surfed ${secs}s, ${pages} pages opened`;
  log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
