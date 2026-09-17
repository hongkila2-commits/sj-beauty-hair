/**
 * 정기 점검 안내 화면 검사.
 *
 * 일요일 새벽까지 기다릴 수 없으므로 브라우저의 시계를 조작해 시험한다.
 * 기본 설정은 일요일 01:00~02:00 (한국시간)이다.
 */
import { chromium } from 'playwright';

function launchOptions() {
  const path = process.env.PLAYWRIGHT_CHROMIUM;
  return path ? { executablePath: path } : {};
}
const BASE_URL = process.env.SITE_URL ?? 'http://localhost:4321';

const pass = [], fail = [];
const ok = (name, cond, detail = '') => (cond ? pass : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

const browser = await chromium.launch(launchOptions());

/** 지정한 시각·시간대·UA 로 홈을 열고 점검 화면 상태를 돌려준다. */
async function visit({ utc, timezone = 'Asia/Seoul', userAgent, query = '' } = {}) {
  const ctx = await browser.newContext({ timezoneId: timezone, ...(userAgent ? { userAgent } : {}) });
  if (utc) await ctx.clock.install({ time: new Date(utc) });
  const page = await ctx.newPage();
  await page.goto(BASE_URL + '/' + query, { waitUntil: 'domcontentloaded' });

  // getComputedStyle 은 부모가 숨겨져도 자기 값을 그대로 돌려준다.
  // 실제로 화면에 보이는지는 checkVisibility() 로 판단해야 한다.
  const state = await page.evaluate(() => {
    const visible = (sel) => document.querySelector(sel)?.checkVisibility() === true;
    return {
      flag: document.documentElement.getAttribute('data-maintenance'),
      gateVisible: visible('.maint'),
      heroVisible: visible('.hero'),
      remaining: document.getElementById('maint-remaining')?.textContent?.trim() ?? '',
    };
  });
  return { ctx, page, state };
}

// ── 점검 시간 안: 일요일 01:30 KST = 토요일 16:30 UTC ──────────────
{
  const { ctx, state } = await visit({ utc: '2026-09-19T16:30:00Z' });
  ok('점검 시간: 안내 화면 표시', state.flag === 'on' && state.gateVisible);
  ok('점검 시간: 본문 감춰짐', !state.heroVisible);
  await ctx.close();
}

// ── 점검 시간 밖: 일요일 02:30 KST ────────────────────────────────
{
  const { ctx, state } = await visit({ utc: '2026-09-19T17:30:00Z' });
  ok('점검 종료 후: 평소 화면', state.flag === null && state.heroVisible);
  await ctx.close();
}

// ── 다른 요일: 토요일 01:30 KST = 금요일 16:30 UTC ────────────────
{
  const { ctx, state } = await visit({ utc: '2026-09-18T16:30:00Z' });
  ok('다른 요일: 평소 화면', state.flag === null && state.heroVisible);
  await ctx.close();
}

// ── 방문자가 다른 시간대에 있어도 한국시간 기준 ───────────────────
{
  const { ctx, state } = await visit({ utc: '2026-09-19T16:30:00Z', timezone: 'America/New_York' });
  ok('시간대 무관: 뉴욕 기기도 점검 화면', state.flag === 'on' && !state.heroVisible);
  await ctx.close();
}

// ── 원장님 통과 ───────────────────────────────────────────────────
{
  const { ctx, state } = await visit({ utc: '2026-09-19T16:30:00Z', query: '?preview=1' });
  ok('?preview=1: 점검 시간에도 평소 화면', state.flag === null && state.heroVisible);
  await ctx.close();
}

// ── 검색 봇 통과 ──────────────────────────────────────────────────
{
  const { ctx, state } = await visit({
    utc: '2026-09-19T16:30:00Z',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  });
  ok('검색 봇: 점검 화면 안 보임', state.flag === null && state.heroVisible);
}

// ── 남은 시간 표시 ────────────────────────────────────────────────
{
  const { ctx, page, state } = await visit({ utc: '2026-09-19T16:30:00Z' });
  ok('남은 시간 표시', /\d+분/.test(state.remaining), state.remaining);
  await ctx.close();
}

// ── 본문이 한 번도 보이지 않는지(깜빡임) ──────────────────────────
{
  const ctx = await browser.newContext({ timezoneId: 'Asia/Seoul' });
  await ctx.clock.install({ time: new Date('2026-09-19T16:30:00Z') });
  const page = await ctx.newPage();
  // 본문이 그려지는 매 순간을 감시한다
  await page.addInitScript(() => {
    window.__heroEverVisible = false;
    const check = () => {
      if (document.querySelector('.hero')?.checkVisibility() === true) window.__heroEverVisible = true;
    };
    const id = setInterval(check, 5);
    document.addEventListener('DOMContentLoaded', () => { check(); clearInterval(id); });
  });
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  const flashed = await page.evaluate(() => window.__heroEverVisible);
  ok('깜빡임 없음: 본문이 한 번도 안 보임', flashed === false);
  await ctx.close();
}

await browser.close();

console.log('\n' + '='.repeat(58));
for (const x of pass) console.log('  통과   ' + x);
for (const x of fail) console.log('  실패   ' + x);
console.log('='.repeat(58));
console.log(`통과 ${pass.length} / 실패 ${fail.length}`);
process.exit(fail.length ? 1 : 0);
