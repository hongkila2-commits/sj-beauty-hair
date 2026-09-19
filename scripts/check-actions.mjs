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

// ── 3. 영상: 그 자리에서 재생 ───────────────────────────────────
/*
  영상은 유튜브로 나가지 않고 이 페이지에서 재생돼야 한다.
  동시에, 재생을 누르기 전에는 유튜브에서 아무것도 내려받지 않아야 한다 —
  플레이어를 미리 심어두면 영상 편수만큼 수 MB 를 아무 이유 없이 쓰게 된다.
  이 샌드박스는 유튜브 접속이 막혀 있으므로 '요청이 나가는지'만 가로채 본다.
*/
{
  const watch = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
  const asked = [];
  for (const pattern of ['**://*.youtube-nocookie.com/**', '**://*.youtube.com/**']) {
    await watch.route(pattern, (route) => { asked.push(route.request().url()); return route.abort(); });
  }
  await watch.route('**://i.ytimg.com/**', (route) => route.abort());
  await watch.route('**://www.google.com/**', (route) => route.abort());

  const page = await watch.newPage();
  await page.goto(BASE + '/videos', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await dismissPopup(page);

  const cards = await page.locator('.video-card__frame').count();
  if (cards > 0) {
    ok('영상: 누르기 전에는 유튜브를 불러오지 않음', asked.length === 0, `요청 ${asked.length}건`);
    ok('영상: 누르기 전에는 플레이어가 없음',
       (await page.locator('.video-card__frame iframe').count()) === 0);

    await page.locator('[data-yt-play]').first().click();
    await page.waitForTimeout(500);

    const frame = page.locator('.video-card__frame iframe').first();
    const src = await frame.getAttribute('src');
    ok('영상: 누르면 그 자리에서 재생', (await page.locator('.video-card__frame iframe').count()) === 1);
    ok('영상: 자동재생으로 열림', !!src && src.includes('autoplay=1'), src ?? '없음');
    ok('영상: 휴대폰에서 전체화면으로 튀지 않음', !!src && src.includes('playsinline=1'));
    ok('영상: 전체화면 버튼 사용 가능', (await frame.getAttribute('allowfullscreen')) !== null);
    ok('영상: 화면낭독기용 제목 있음', !!(await frame.getAttribute('title')));

    // 제목 링크는 그대로 유튜브로 간다 — 거기서 보고 싶은 사람도 있다.
    const titleHref = await page.locator('.video-card__title a').first().getAttribute('href');
    ok('영상: 제목은 유튜브로 연결',
       !!titleHref && titleHref.startsWith('https://www.youtube.com/watch?v='), titleHref ?? '없음');

    // 키보드만 쓰는 사람도 재생할 수 있어야 한다.
    const kb = await watch.newPage();
    await kb.goto(BASE + '/videos', { waitUntil: 'domcontentloaded' });
    await kb.waitForTimeout(400);
    await dismissPopup(kb);
    await kb.locator('[data-yt-play]').first().focus();
    await kb.keyboard.press('Enter');
    await kb.waitForTimeout(400);
    ok('영상: 키보드로도 재생', (await kb.locator('.video-card__frame iframe').count()) === 1);
    await kb.close();
  } else {
    // 등록된 영상이 없으면 검사 자체가 불가능하다. 실패가 아니라 건너뜀이다.
    skip.push('영상 — 등록된 영상이 없어 검사하지 못함');
  }
  await watch.close();
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
