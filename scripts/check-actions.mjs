import { chromium } from 'playwright';

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
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });

const pass = [];
const fail = [];
const skip = [];
/** 팝업이 떠 있으면 모든 클릭을 가로막는다(모달의 정상 동작). 검사 전에 닫는다. */
async function dismissPopup(page) {
  if (await page.isVisible('#promo-popup').catch(() => false)) {
    await page.click('.promo__x');
    await page.waitForTimeout(100);
  }
}

const ok = (name, cond, detail = '') =>
  (cond ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

// ── 1. 섹션 번호 ────────────────────────────────────────────────
const expected = {
  '/about': [['01', '회사소개']],
  '/branches': [['02', '지점안내']],
  '/blog': [['03', '헤어칼럼']],
  '/videos': [['04', '영상']],
  '/contact': [['05', '문의']],
  '/recruit': [['06', '디자이너 교육과정'], ['07', '근무환경']],
};
for (const [route, want] of Object.entries(expected)) {
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  const got = await page.evaluate(() =>
    [...document.querySelectorAll('.section-head')].map((h) => [
      h.querySelector('.section-head__num')?.textContent?.trim(),
      h.querySelector('.section-head__title')?.textContent?.trim(),
    ]));
  ok(`섹션번호 ${route}`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  await page.close();
}

// /about 에 디자이너 교육이 없어야 한다
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/about', { waitUntil: 'domcontentloaded' });
  const body = await page.textContent('body');
  ok('/about 에서 디자이너 교육 삭제됨', !body.includes('디자이너 교육'));
  await page.close();
}
// /recruit 의 교육과정은 살아 있어야 한다
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/recruit', { waitUntil: 'domcontentloaded' });
  const steps = await page.locator('.steps__item').count();
  ok('/recruit 교육과정 5단계 유지', steps === 5, `${steps}단계`);
  await page.close();
}

// ── 2. 헤어칼럼 분류 필터 ───────────────────────────────────────
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/blog', { waitUntil: 'networkidle' });
  await dismissPopup(page);
  const total = await page.locator('.post-item').count();

  await page.getByRole('button', { name: /^공지/ }).click();
  const shown = await page.locator('.post-item:not([hidden])').count();
  const notice = await page.locator('.post-item[data-category="공지"]').count();
  ok('분류 필터: 공지만 남음', shown === notice && shown > 0 && shown < total,
     `전체 ${total} → ${shown}`);

  await page.getByRole('button', { name: /^전체/ }).click();
  const back = await page.locator('.post-item:not([hidden])').count();
  ok('분류 필터: 전체로 복귀', back === total, `${back}/${total}`);
  await page.close();
}

// ── 3. 영상 재생 버튼 ───────────────────────────────────────────
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/videos', { waitUntil: 'networkidle' });
  await dismissPopup(page);
  const cards = await page.locator('.video-card__frame').count();
  if (cards > 0) {
    const href = await page.locator('.video-card__frame').first().getAttribute('href');
    const target = await page.locator('.video-card__frame').first().getAttribute('target');
    ok('영상: 유튜브로 나가는 링크',
       !!href && href.startsWith('https://www.youtube.com/watch?v=') && target === '_blank',
       href ?? '없음');
  } else {
    // 등록된 영상이 없으면 검사 자체가 불가능하다. 실패가 아니라 건너뜀이다.
    skip.push('영상 — 등록된 영상이 없어 검사하지 못함');
  }
  await page.close();
}

// ── 4. 문의 폼 ──────────────────────────────────────────────────
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' });
  await dismissPopup(page);
  // mailto 이동은 브라우저 밖으로 나가므로, 요청 이벤트로 주소만 가로챈다
  let mailto = null;
  page.on('request', (r) => { if (r.url().startsWith('mailto:')) mailto = r.url(); });

  await page.fill('input[name="name"]', '홍길동');
  await page.fill('input[name="phone"]', '010-1234-5678');
  await page.selectOption('select[name="branch"]', { index: 1 });
  await page.fill('textarea[name="message"]', '펌 상담 원합니다');
  await page.click('form#inquiry-form button[type="submit"]');
  await page.waitForTimeout(800);
  const decoded = mailto ? decodeURIComponent(mailto) : '';
  ok('문의 폼: mailto 조립',
     decoded.startsWith('mailto:') && decoded.includes('홍길동') &&
     decoded.includes('010-1234-5678') && decoded.includes('펌 상담 원합니다'),
     decoded.slice(0, 70));
  await page.close();
}

// ── 5. 상단 메뉴 ────────────────────────────────────────────────
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await dismissPopup(page);
  const links = await page.locator('.site-nav__link').evaluateAll((els) =>
    els.map((e) => ({ href: e.getAttribute('href'), text: e.textContent.trim() })));
  ok('상단 메뉴 7개', links.length === 7, links.map((l) => l.text).join(' '));

  let allOk = true;
  for (const l of links) {
    const r = await page.goto(BASE + l.href, { waitUntil: 'domcontentloaded' });
    if (r?.status() !== 200) { allOk = false; break; }
    const active = await page.locator('.site-nav__link.is-active').first().getAttribute('href');
    if (active !== l.href) allOk = false;
  }
  ok('메뉴 이동 + 현재 위치 표시', allOk);
  await page.close();
}

await browser.close();

console.log('\n' + '='.repeat(58));
for (const p of pass) console.log('  통과   ' + p);
for (const s of skip) console.log('  건너뜀 ' + s);
for (const f of fail) console.log('  실패   ' + f);
console.log('='.repeat(58));
console.log(`통과 ${pass.length} / 건너뜀 ${skip.length} / 실패 ${fail.length}`);
process.exit(fail.length ? 1 : 0);
