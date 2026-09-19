import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';

/** dist 안의 모든 HTML 파일 경로. 관리자 화면은 부르는 쪽에서 걸러낸다. */
async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

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

  /*
    브랜드 소개의 회사 개요표. 관리자 화면에서 줄을 지울 수 있게 되었으므로,
    설정 파일에 적은 줄이 실제로 화면에 나오는지 대조한다.
    영업시간 줄은 연락처 설정에서 자동으로 붙으므로 한 줄 더 많아야 한다.
  */
  {
    const pages = JSON.parse(await readFile('content/settings/pages.json', 'utf-8'));
    await p.goto(`${BASE}/about`, { waitUntil: 'domcontentloaded' });

    const rows = await p.locator('.about__fact').evaluateAll((els) =>
      els.map((el) => ({
        label: el.querySelector('dt')?.textContent?.trim() ?? '',
        value: el.querySelector('dd')?.textContent?.trim() ?? '',
      })),
    );

    if (!Array.isArray(pages.aboutFacts) || pages.aboutFacts.length === 0) {
      problems.push('회사 개요표가 비어 있음 — content/settings/pages.json 의 aboutFacts');
    }
    for (const fact of pages.aboutFacts ?? []) {
      const found = rows.find((r) => r.label === fact.label);
      if (!found) problems.push(`회사 개요표: '${fact.label}' 줄이 화면에 없음`);
      else if (found.value !== fact.value) {
        problems.push(`회사 개요표: '${fact.label}' 이 '${found.value}' — '${fact.value}' 이어야 함`);
      }
    }
    if (!rows.some((r) => r.label === '영업시간')) {
      problems.push('회사 개요표: 영업시간 줄이 자동으로 붙지 않음');
    }
    console.log(`회사 개요표 — ${pages.aboutFacts?.length ?? 0}줄 + 영업시간 자동`);
  }

  /*
    관리자 화면의 입력칸이 '죽어 있지' 않은지 확인한다.

    실제로 있었던 일: 채용·문의 페이지의 문구 4개가 관리자 화면에는 있는데
    페이지는 그 값을 쓰지 않고 같은 내용을 코드에 그대로 적어두고 있었다.
    사장님이 고치고 저장해도 홈페이지는 그대로였다 — 아무 오류도 안 나면서.

    그래서 설정 파일에 적은 문구가 실제로 어느 페이지엔가 나오는지 전부 대조한다.
    안 나오면 그 입력칸은 아무 데도 연결되지 않은 것이다.
  */
  {
    // Astro 가 내보낸 HTML 의 이스케이프를 되돌려 원문과 비교할 수 있게 한다.
    const unescape = (t) => t
      .replace(/&#38;|&amp;/g, '&').replace(/&#60;|&lt;/g, '<').replace(/&#62;|&gt;/g, '>')
      .replace(/&#34;|&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

    const files = (await htmlFiles('dist')).filter((f) => !f.includes('/admin/'));
    const haystack = unescape(
      (await Promise.all(files.map((f) => readFile(f, 'utf-8')))).join('\n'),
    );

    /** 문자열 값을 전부 끌어모은다. 사진 경로처럼 화면 글자가 아닌 것은 뺀다. */
    function texts(value, key = '') {
      if (typeof value === 'string') {
        if (!value.trim()) return [];                 // 비워둔 칸은 검사 대상이 아니다
        if (/image|photo|link|url/i.test(key)) return [];
        // 문단이 나뉘어 출력되는 값이 있으므로 문단 단위로 쪼갠다.
        return value.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
      }
      if (Array.isArray(value)) return value.flatMap((v) => texts(v, key));
      if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([k, v]) => texts(v, k));
      }
      return [];
    }

    const pagesJson = JSON.parse(await readFile('content/settings/pages.json', 'utf-8'));
    let checked = 0;
    for (const [key, value] of Object.entries(pagesJson)) {
      for (const text of texts(value, key)) {
        checked += 1;
        if (!haystack.includes(text)) {
          problems.push(`관리자 입력칸 '${key}' 의 값이 어느 페이지에도 안 나옴: "${text.slice(0, 40)}"`);
        }
      }
    }
    console.log(`관리자 입력칸 — 페이지 문구 ${checked}개 값이 화면에 나오는지 확인`);
  }

  /*
    검색엔진에 제출할 것들. 사이트맵 주소가 틀리면 등록 자체가 실패하고,
    canonical 이 틀리면 검색엔진이 엉뚱한 주소를 대표 주소로 잡는다.
    도메인을 바꿀 때 여기가 같이 안 바뀌면 조용히 망가지는 자리다.
  */
  {
    const siteUrl = (await import('../src/site.mjs')).SITE.url;

    const indexXml = await readFile('dist/sitemap-index.xml', 'utf-8');
    if (!indexXml.includes(`${siteUrl}/sitemap-0.xml`)) {
      problems.push(`사이트맵 목록이 ${siteUrl} 를 가리키지 않음`);
    }

    const sitemap = await readFile('dist/sitemap-0.xml', 'utf-8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (locs.length === 0) problems.push('사이트맵이 비어 있음');
    for (const loc of locs) {
      if (!loc.startsWith(siteUrl)) problems.push(`사이트맵에 다른 주소가 섞임: ${loc}`);
    }
    if (locs.some((l) => l.includes('/admin'))) problems.push('사이트맵에 관리자 화면이 들어감');

    const robots = await readFile('dist/robots.txt', 'utf-8');
    if (!robots.includes(`Sitemap: ${siteUrl}/sitemap-index.xml`)) {
      problems.push('robots.txt 의 사이트맵 주소가 틀림');
    }
    if (!/Disallow:\s*\/admin/.test(robots)) problems.push('robots.txt 가 관리자 화면을 막지 않음');

    // canonical 은 모든 페이지에 있어야 하고, 전부 대표 도메인이어야 한다.
    let missing = 0, wrong = 0;
    for (const file of (await htmlFiles('dist')).filter((f) => !f.includes('/admin/'))) {
      const html = await readFile(file, 'utf-8');
      const m = html.match(/<link rel="canonical" href="([^"]+)"/);
      if (!m) missing += 1;
      else if (!m[1].startsWith(siteUrl)) wrong += 1;
    }
    if (missing) problems.push(`canonical 이 없는 페이지 ${missing}개`);
    if (wrong) problems.push(`canonical 이 ${siteUrl} 가 아닌 페이지 ${wrong}개`);

    console.log(`검색엔진 제출 — 사이트맵 ${locs.length}개 주소 · canonical 전 페이지 · robots.txt 정상`);
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
