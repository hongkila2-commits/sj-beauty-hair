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

const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

// ── 팝업: 하루 한 번 ────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok('팝업: 첫 방문에 뜸', await p.isVisible('#promo-popup'));

  const locked = await p.evaluate(() => document.body.style.overflow);
  ok('팝업: 열린 동안 배경 스크롤 잠김', locked === 'hidden', `overflow=${locked || '(없음)'}`);

  await p.click('[data-promo-dismiss]');
  ok('팝업: 오늘 하루 보지 않기로 닫힘', !(await p.isVisible('#promo-popup')));
  ok('팝업: 닫힌 뒤 스크롤 복구', (await p.evaluate(() => document.body.style.overflow)) === '');

  await p.reload({ waitUntil: 'networkidle' });
  ok('팝업: 새로고침해도 안 뜸', !(await p.isVisible('#promo-popup')));

  const stored = await p.evaluate(() => localStorage.getItem('sj-promo-hidden-until'));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  ok('팝업: 오늘 날짜로 저장됨', stored === today, `${stored}`);

  // 날짜가 지난 것처럼 만들면 다시 떠야 한다
  await p.evaluate(() => localStorage.setItem('sj-promo-hidden-until', '2020-01-01'));
  await p.reload({ waitUntil: 'networkidle' });
  ok('팝업: 날이 바뀌면 다시 뜸', await p.isVisible('#promo-popup'));
  await ctx.close();
}

// ── 팝업 닫기 3경로 ─────────────────────────────────────────────
for (const [name, act] of [
  ['닫기 버튼', async (p) => p.click('.promo__x')],
  ['하단 닫기', async (p) => p.click('.promo__close')],
  ['Esc 키', async (p) => p.keyboard.press('Escape')],
  ['바깥 클릭', async (p) => p.click('.promo__backdrop', { position: { x: 20, y: 20 } })],
]) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await act(p);
  await p.waitForTimeout(150);
  ok(`팝업 닫기: ${name}`, !(await p.isVisible('#promo-popup')));
  await ctx.close();
}

// ── 저장이 막힌 브라우저 ────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    // localStorage 접근 자체가 예외를 던지는 상황을 흉내낸다
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('접근 차단'); },
    });
  });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok('저장 차단 환경: JS 에러 없음', errors.length === 0, errors.join(' | '));
  ok('저장 차단 환경: 팝업은 정상 표시', await p.isVisible('#promo-popup'));
  await ctx.close();
}

// ── 띠배너 ──────────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  // 팝업이 떠 있으면 띠배너를 가린다(모달의 정상 동작). 먼저 닫고 검사한다.
  if (await p.isVisible('#promo-popup')) await p.click('.promo__x');
  const href = await p.getAttribute('.top-banner__link', 'href');
  await p.click('.top-banner__link');
  await p.waitForLoadState('domcontentloaded');
  ok('띠배너: 눌러 이벤트 화면으로 이동', new URL(p.url()).pathname === href, `${href} → ${new URL(p.url()).pathname}`);
  await ctx.close();
}

// ── 카드뉴스 ────────────────────────────────────────────────────
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const expected = { 'first-visit': 4, 'vip-pass': 5, 'monthly-art': 4 };
  for (const [slug, count] of Object.entries(expected)) {
    const res = await p.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded' });
    const cards = await p.locator('.cardnews__item').count();
    ok(`카드뉴스 ${slug}`, res?.status() === 200 && cards === count, `${cards}장 (기대 ${count}장)`);
  }
  await ctx.close();
}

// ── 영상 카드가 유튜브 링크인지 ─────────────────────────────────
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + '/videos', { waitUntil: 'domcontentloaded' });
  const n = await p.locator('.video-card__frame').count();
  if (n > 0) {
    const href = await p.getAttribute('.video-card__frame', 'href');
    const target = await p.getAttribute('.video-card__frame', 'target');
    ok('영상: 유튜브 링크로 이동', href?.startsWith('https://www.youtube.com/watch?v=') && target === '_blank', href ?? '');
  } else {
    ok('영상 검사 건너뜀', true, '등록된 영상 없음');
  }
  await ctx.close();
}

await browser.close();
console.log('\n' + '='.repeat(58));
for (const x of pass) console.log('  통과   ' + x);
for (const x of fail) console.log('  실패   ' + x);
console.log('='.repeat(58));
console.log(`통과 ${pass.length} / 실패 ${fail.length}`);
process.exit(fail.length ? 1 : 0);
