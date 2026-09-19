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
        firstH1: document.querySelector('h1')?.textContent?.trim().slice(0, 30) ?? '',
      }));
      if (!meta.title) problems.push(`${route} title 없음`);
      if (!meta.desc) problems.push(`${route} description 없음`);
      if (!meta.og) problems.push(`${route} og:image 없음`);
      /*
        h1 은 페이지마다 정확히 하나여야 한다. 검색엔진이 '이 페이지가 무엇인지'를
        여기서 읽는다. 예전에 점검 안내 문구가 h1 으로 전 페이지 맨 앞에 들어가
        모든 페이지의 첫 h1 이 '시스템 점검 중입니다' 였던 적이 있다.
        그때 이 숫자를 출력만 하고 검사하지 않아 몇 주를 모르고 지나쳤다.
      */
      if (meta.h1 !== 1) {
        problems.push(`${route} h1 이 ${meta.h1}개 (1개여야 함) — 첫 h1: "${meta.firstH1}"`);
      }
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

// ── 네이버 연결 · 검색엔진 인증 ────────────────────────────────
/*
  예약 버튼은 이 홈페이지의 존재 이유다. 한 지점이라도 빠지면 그 지점은
  예약을 못 받는다. 그래서 다섯 곳을 모두 확인한다.

  일부러 src/config.ts 를 불러오지 않는다. 검사 대상과 같은 코드로 기대값을
  만들면 그 코드가 틀려도 양쪽이 똑같이 틀려서 검사를 통과해버린다.
  설정 파일(JSON)을 직접 읽어 화면과 대조한다.
*/
{
  const { readFile } = await import('node:fs/promises');
  const branches = JSON.parse(await readFile('content/settings/branches.json', 'utf-8')).branches;
  const site = JSON.parse(await readFile('content/settings/site.json', 'utf-8'));
  const p = await browser.newPage();

  let addressSearches = 0;

  for (const branch of branches) {
    await p.goto(`${BASE}/branches/${branch.slug}`, { waitUntil: 'domcontentloaded' });
    const name = branch.label;

    // 예약 버튼 — 설정 파일의 플레이스 주소로 가야 한다.
    if (!branch.naverPlace) {
      problems.push(`${name}: 예약 주소가 비어 있음 — content/settings/branches.json`);
    } else if ((await p.locator(`a[href="${branch.naverPlace}"]`).count()) === 0) {
      problems.push(`${name}: 예약 버튼이 화면에 없음 (${branch.naverPlace})`);
    }

    // 지도 버튼 — 주소가 아니라 네이버 등록 상호로 검색해야 한다.
    const mapHrefs = await p.locator('a[href^="https://map.naver.com/p/search/"]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('href')),
    );
    if (mapHrefs.length === 0) {
      problems.push(`${name}: 지도 버튼이 화면에 없음`);
    } else {
      const query = decodeURIComponent(mapHrefs[0].split('/search/')[1] ?? '');
      // 주소로 검색하고 있다면 등록 상호를 못 넣은 지점이다. 아래에서 개수를 센다.
      if (query.startsWith('대전 ')) addressSearches += 1;
    }

    // 블로그 버튼 — 주소가 있는 지점에만 나타나야 한다.
    const blogShown = await p.locator('a[href^="https://blog.naver.com/"]').count();
    if (branch.naverBlog && blogShown === 0) problems.push(`${name}: 블로그 버튼이 안 보임`);
    if (!branch.naverBlog && blogShown > 0) problems.push(`${name}: 블로그 주소가 없는데 버튼이 보임`);
  }

  /*
    지도 검색어가 주소인 지점은 송촌점 하나뿐이어야 한다(등록 상호를 확인 못 했다).
    mapUrl() 이 주소 검색으로 되돌아가면 이 숫자가 늘어나 바로 잡힌다.
  */
  if (addressSearches !== 1) {
    problems.push(`지도 링크: 주소로 검색하는 지점이 ${addressSearches}곳 — 1곳(송촌점)이어야 함`);
  }

  // 메인 히어로의 예약 버튼도 살아있어야 한다.
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if ((await p.locator('.hero__actions a[href^="https://m.place.naver.com/"]').count()) === 0) {
    problems.push('메인 히어로에 네이버 예약 버튼이 없음');
  }

  // 인증코드 — 비어 있으면 빈 태그를 흘리지 말아야 한다.
  for (const [key, tag] of [
    ['naverVerification', 'naver-site-verification'],
    ['googleVerification', 'google-site-verification'],
  ]) {
    const count = await p.locator(`meta[name="${tag}"]`).count();
    if (site[key] && count === 0) problems.push(`${tag}: 코드를 넣었는데 태그가 안 나옴`);
    if (!site[key] && count > 0) problems.push(`${tag}: 코드가 비었는데 빈 태그가 출력됨`);
  }

  const withBlog = branches.filter((b) => b.naverBlog).length;
  console.log(`\n네이버 연결 — 예약 ${branches.length}곳 · 블로그 ${withBlog}곳 · 상호검색 ${branches.length - addressSearches}곳`);
  console.log(`검색엔진 인증 — 네이버 ${site.naverVerification ? '있음' : '(비어 있음)'} · 구글 ${site.googleVerification ? '있음' : '(비어 있음)'}`);
  await p.close();
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
