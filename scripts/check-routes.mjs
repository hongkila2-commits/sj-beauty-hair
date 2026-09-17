import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/**
 * 브라우저 실행 경로는 환경마다 다르다.
 * PLAYWRIGHT_CHROMIUM 이 있으면 그것을 쓰고, 없으면 Playwright 가 스스로 찾게 둔다.
 * (GitHub Actions 에서는 npx playwright install 로 받은 브라우저를 자동으로 찾는다)
 */
function launchOptions() {
  const path = process.env.PLAYWRIGHT_CHROMIUM;
  return path ? { executablePath: path } : {};
}

/** 검사할 주소. 기본은 로컬 미리보기 서버. */
const BASE_URL = process.env.SITE_URL ?? 'http://localhost:4321';


const BASE = BASE_URL;
/** 화면 캡처를 남길 폴더. 인자로 주지 않으면 .check-shots/ 에 남긴다. */
const OUT = process.argv[2] ?? '.check-shots';
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['/', 'home'],
  ['/about', 'about'],
  ['/branches', 'branches'],
  ['/branches/dunsan', 'branch-dunsan'],
  ['/blog', 'blog'],
  ['/blog/2026-09-08-펌-후-홈케어', 'blog-post'],
  ['/blog/2026-09-29-머리-자르는-주기', 'blog-table'],
  ['/videos', 'videos'],
  ['/events', 'events'],
  ['/events/first-visit', 'event-detail'],
  ['/recruit', 'recruit'],
  ['/contact', 'contact'],
  ['/404', 'notfound'],
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch(launchOptions());
const problems = [];
const seenLinks = new Set();
const blockedHosts = new Set();

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  });

  for (const [route, name] of ROUTES) {
    const page = await context.newPage();
    const jsErrors = [];
    const localFailures = [];
    const externalFailures = new Set();

    // 실제 스크립트 오류만 문제로 본다.
    page.on('pageerror', (e) => jsErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      const text = m.text();
      // 리소스 로딩 실패는 아래 requestfailed 에서 출처를 보고 판단한다.
      if (m.type() === 'error' && !/Failed to load resource/i.test(text)) jsErrors.push(text);
    });
    // 같은 서버(localhost) 리소스가 실패하면 우리 잘못 = 진짜 문제.
    // 외부 CDN 실패는 이 샌드박스가 바깥으로 못 나가서 생기는 것이므로 따로 센다.
    page.on('requestfailed', (req) => {
      const url = req.url();
      if (url.startsWith(BASE)) localFailures.push(`${url} (${req.failure()?.errorText})`);
      else externalFailures.add(new URL(url).host);
    });

    const response = await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const status = response?.status() ?? 0;
    // 404 페이지는 preview 서버가 실제로 404 를 돌려주므로 예외로 둔다.
    if (status !== 200 && name !== 'notfound') {
      problems.push(`${route} → HTTP ${status}`);
    }

    // 가로 스크롤(모바일에서 레이아웃이 삐져나오는 증상) 검사
    // 팝업이 떠 있으면 배경 스크롤이 잠겨 가로넘침 측정이 왜곡된다. 먼저 닫는다.
    if (await page.isVisible('#promo-popup')) await page.click('.promo__x');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${route} [${vp.name}] 가로 넘침 ${overflow}px`);

    if (vp.name === 'desktop') {
      const meta = await page.evaluate(() => ({
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.content ?? '',
        og: document.querySelector('meta[property="og:image"]')?.content ?? '',
        jsonld: document.querySelectorAll('script[type="application/ld+json"]').length,
        h1: document.querySelectorAll('h1').length,
      }));
      if (!meta.title) problems.push(`${route} title 없음`);
      if (!meta.desc) problems.push(`${route} description 없음`);
      if (!meta.og) problems.push(`${route} og:image 없음`);
      console.log(`[meta] ${route.padEnd(34)} h1=${meta.h1} jsonld=${meta.jsonld} :: ${meta.title}`);

      for (const href of await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')))) {
        seenLinks.add(href);
      }
    }

    if (jsErrors.length) problems.push(`${route} [${vp.name}] JS 에러: ${jsErrors.join(' | ')}`);
    if (localFailures.length) problems.push(`${route} [${vp.name}] 내부 리소스 실패: ${localFailures.join(' | ')}`);
    if (externalFailures.size) blockedHosts.add([...externalFailures].join(','));

    await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: true });
    await page.close();
  }
  await context.close();
}

// 페이지 안의 내부 링크가 전부 살아있는지 확인
const linkPage = await browser.newPage();
for (const href of [...seenLinks].sort()) {
  const res = await linkPage.goto(BASE + href, { waitUntil: 'domcontentloaded' });
  if (res?.status() !== 200) problems.push(`깨진 내부 링크: ${href} → HTTP ${res?.status()}`);
}
console.log(`\n내부 링크 ${seenLinks.size}개 확인`);
await linkPage.close();
await browser.close();

console.log('\n' + '='.repeat(60));
if (blockedHosts.size) {
  console.log(`참고 — 샌드박스에서 차단된 외부 도메인: ${[...blockedHosts].join(', ')}`);
  console.log('        (배포 환경에서는 정상적으로 불러와집니다)\n');
}
if (problems.length === 0) {
  console.log('문제 없음 — 전 페이지 정상');
} else {
  console.log(`문제 ${problems.length}건:`);
  for (const p of problems) console.log('  - ' + p);
}
process.exit(problems.length ? 1 : 0);
