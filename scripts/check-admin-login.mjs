/**
 * 관리자 로그인(팝업 통신) 검사.
 *
 *   node scripts/check-admin-login.mjs
 *
 * 실제 GitHub 로그인은 여기서 끝까지 돌려볼 수 없다(외부 접속 차단). 대신
 * 토큰을 주고받는 마지막 단계 — 팝업 창과 관리자 화면 사이의 대화 — 를
 * 진짜와 같은 조건으로 재현한다. 이 부분이 바로 로그인이 고장 났던 곳이다.
 *
 * 핵심은 '가짜 관리자 화면'이 **늦게** 귀를 여는 상황이다. 예전 코드는 인사를
 * 한 번만 보내고 1.5초 뒤 창을 닫아서, 이 경우 토큰이 영영 전달되지 않았다.
 * 아래 검사는 그 상황을 만들어 두고 예전 코드와 지금 코드를 나란히 돌린다.
 * 예전 코드가 실패해야 이 검사가 의미 있다는 것도 함께 확인한다.
 *
 * 이 검사는 자기 서버를 직접 띄우므로 npm run preview 없이도 돌아간다.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const TOKEN = 'test-token-0123456789';
const STATE = 'test-state-abcdef';

// 검사용 가짜 값. GitHub 호출 자체를 아래에서 가로채므로 실제로 쓰이지 않는다.
// 다만 이 값이 없으면 서버가 '환경변수 없음' 화면만 돌려줘 검사가 무의미해진다.
process.env.OAUTH_CLIENT_ID ||= 'test-client-id';
process.env.OAUTH_CLIENT_SECRET ||= 'test-client-secret';

/** GitHub 토큰 교환만 가로챈다. 나머지 요청은 원래대로 둔다. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  if (url.startsWith('https://github.com/login/oauth/access_token')) {
    return new Response(JSON.stringify({ access_token: TOKEN }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return realFetch(input, init);
};

const { default: callback } = await import('../api/callback.js');
const { default: auth } = await import('../api/auth.js');

/**
 * Vercel 함수는 response.status(…).setHeader(…).send(…) 모양을 쓴다.
 * Node 기본 응답 객체에는 status·send 가 없어서 얹어 준다.
 */
function adapt(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.end(body); return res; };
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (k, v) => { setHeader(k, v); return res; };
  return res;
}

/**
 * 고치기 전의 팝업 코드. 비교 대조군으로만 쓴다.
 * (인사 1회 · 1.5초 뒤 무조건 닫기 — 지금은 쓰지 않는다)
 */
const LEGACY_POPUP = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
<body><p>로그인 창을 닫는 중입니다…</p><script>
(function () {
  var message = 'authorization:github:success:' + JSON.stringify({ token: ${JSON.stringify(TOKEN)}, provider: 'github' });
  function send(event) {
    if (!window.opener) return;
    window.opener.postMessage(message, event && event.origin ? event.origin : '*');
  }
  window.addEventListener('message', send, false);
  if (window.opener) window.opener.postMessage('authorizing:github', '*');
  setTimeout(function () { window.close(); }, 1500);
})();
</script></body></html>`;

/**
 * 가짜 관리자 화면. Decap 이 하는 일을 그대로 흉내 낸다.
 *   ?delay=N — N밀리초 뒤에야 귀를 연다(늦게 준비되는 상황).
 */
const PARENT_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
<body><h1>가짜 관리자 화면</h1><script>
(function () {
  var delay = Number(new URLSearchParams(location.search).get('delay') || 0);
  window.__received = null;
  window.__helloCount = 0;
  window.__popup = null;

  function onMessage(e) {
    if (typeof e.data !== 'string') return;
    if (e.data.indexOf('authorization:github:') === 0) { window.__received = e.data; return; }
    if (e.data.indexOf('authorizing:github') === 0) {
      window.__helloCount += 1;
      // Decap 처럼 받은 인사를 그대로 되돌려 준다.
      if (window.__popup && !window.__popup.closed) window.__popup.postMessage(e.data, e.origin);
    }
  }

  // 여기가 핵심 — delay 동안은 아무것도 듣지 않는다.
  setTimeout(function () {
    window.addEventListener('message', onMessage, false);
    window.__listening = true;
  }, delay);

  window.openPopup = function (url) {
    window.__popup = window.open(url, 'auth', 'width=600,height=640');
  };
})();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/callback') return callback(req, adapt(res));

  if (url.pathname === '/api/auth') {
    const r = adapt(res);
    r.redirect = (code, to) => { res.writeHead(code, { Location: to }); res.end(); };
    return auth(req, r);
  }

  if (url.pathname === '/parent') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PARENT_PAGE);
  }

  if (url.pathname === '/legacy') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(LEGACY_POPUP);
  }

  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(await readFile('public/admin/index.html', 'utf-8'));
  }

  if (url.pathname === '/admin/config.yml') {
    const yml = await readFile('public/admin/config.yml', 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/yaml; charset=utf-8' });
    // 빌드가 하는 치환을 흉내 낸다.
    return res.end(yml.replaceAll('__SITE_URL__', `http://${req.headers.host}`));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('없는 주소');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

function launchOptions() {
  const path = process.env.PLAYWRIGHT_CHROMIUM;
  return path ? { executablePath: path } : {};
}
const browser = await chromium.launch(launchOptions());

const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

/** 로그인 성공 주소. 서버가 state 쿠키와 대조하므로 쿠키도 같이 심는다. */
const SUCCESS_URL = `${BASE}/api/callback?code=abc&state=${STATE}`;

async function newContext() {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'oauth_state', value: STATE, url: BASE }]);
  return ctx;
}

/**
 * 가짜 관리자 화면에서 팝업을 열고, 토큰이 전달되는지 지켜본다.
 * @returns 받은 메시지(없으면 null)
 */
async function runHandshake(popupUrl, delay) {
  const ctx = await newContext();
  const parent = await ctx.newPage();
  await parent.goto(`${BASE}/parent?delay=${delay}`);

  const popupPromise = ctx.waitForEvent('page');
  await parent.evaluate((u) => window.openPopup(u), popupUrl);
  const popup = await popupPromise;

  // 늦게 여는 시간 + 인사 주기 + 여유
  const received = await parent
    .waitForFunction(() => window.__received, null, { timeout: delay + 6000 })
    .then((h) => h.jsonValue())
    .catch(() => null);

  const stillOpen = !popup.isClosed();
  await ctx.close();
  return { received, stillOpen };
}

// ── 1. 관리자 화면이 늦게 준비돼도 토큰이 전달된다 ──────────────
{
  const { received } = await runHandshake(SUCCESS_URL, 1500);
  ok('늦게 준비된 관리자 화면에도 토큰 전달', Boolean(received));
  ok('전달된 토큰이 정확함', typeof received === 'string' && received.includes(TOKEN),
    received ? received.slice(0, 40) + '…' : '(못 받음)');
}

// ── 2. 대조군: 예전 코드는 같은 상황에서 실패한다 ───────────────
{
  const { received } = await runHandshake(`${BASE}/legacy`, 1500);
  ok('대조군 — 예전 코드는 같은 상황에서 실패함', received === null,
    received ? '예전 코드가 성공해버림(검사가 무의미)' : '예상대로 실패');
}

// ── 3. 관리자 화면이 바로 준비된 평범한 경우도 된다 ─────────────
{
  const { received } = await runHandshake(SUCCESS_URL, 0);
  ok('바로 준비된 경우에도 토큰 전달', typeof received === 'string' && received.includes(TOKEN));
}

// ── 4. 전달한 뒤에만 창을 닫는다 ────────────────────────────────
{
  const ctx = await newContext();
  const parent = await ctx.newPage();
  // 영영 듣지 않는 관리자 화면(아주 늦게 준비됨)
  await parent.goto(`${BASE}/parent?delay=600000`);
  const popupPromise = ctx.waitForEvent('page');
  await parent.evaluate((u) => window.openPopup(u), SUCCESS_URL);
  const popup = await popupPromise;

  await popup.waitForTimeout(3000);
  ok('전달 전에는 창이 닫히지 않음', !popup.isClosed());

  const text = await popup.innerText('body').catch(() => '');
  ok('전달 전에는 성공했다고 말하지 않음', !text.includes('로그인되었습니다'), text.trim().slice(0, 40));
  await ctx.close();
}

// ── 5. 응답이 없으면 10초 뒤 이유를 알려준다 ────────────────────
{
  const ctx = await newContext();
  const parent = await ctx.newPage();
  await parent.goto(`${BASE}/parent?delay=600000`);
  const popupPromise = ctx.waitForEvent('page');
  await parent.evaluate((u) => window.openPopup(u), SUCCESS_URL);
  const popup = await popupPromise;

  const shown = await popup
    .waitForFunction(() => document.body.innerText.includes('응답하지 않습니다'), null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok('응답 없을 때 이유를 화면에 보여줌', shown);
  ok('그래도 창은 닫지 않음', !popup.isClosed());
  await ctx.close();
}

// ── 6. 실패는 성공과 다른 화면을 보여주고, 닫지 않는다 ──────────
{
  const ctx = await browser.newContext(); // 일부러 쿠키 없이 → state 불일치
  const page = await ctx.newPage();
  const res = await page.goto(SUCCESS_URL);
  const text = await page.innerText('body');

  ok('실패 응답 상태코드 400', res.status() === 400, String(res.status()));
  ok('실패 화면에 사유가 보임', text.includes('로그인하지 못했습니다'), text.trim().slice(0, 50));
  ok('실패 화면은 성공 문구를 쓰지 않음', !text.includes('로그인되었습니다'));
  ok('실패 화면에 쿠키 문제임을 밝힘', text.includes('쿠키'));
  ok('실패 화면에 관리자 화면 링크 있음', await page.isVisible('a[href="/admin/"]'));

  const html = await page.content();
  ok('실패 화면에는 창을 닫는 코드가 없음', !html.includes('window.close'));
  await ctx.close();
}

// ── 7. 실패는 부모 창을 닫히게 만들지 않는다 ────────────────────
{
  const ctx = await browser.newContext(); // 쿠키 없음
  const parent = await ctx.newPage();
  await parent.goto(`${BASE}/parent?delay=0`);
  const popupPromise = ctx.waitForEvent('page');
  await parent.evaluate((u) => window.openPopup(u), SUCCESS_URL);
  const popup = await popupPromise;

  await popup.waitForTimeout(1500);
  ok('실패 시 창이 살아 있어 사유를 읽을 수 있음', !popup.isClosed());
  const received = await parent.evaluate(() => window.__received);
  ok('실패를 부모 창에 알리지 않음(알리면 창이 닫힘)', received === null, String(received));
  await ctx.close();
}

// ── 8. 주소창에 직접 입력한 경우 안내한다 ───────────────────────
{
  const ctx = await newContext();
  const page = await ctx.newPage();
  await page.goto(SUCCESS_URL);
  await page.waitForTimeout(400);
  const text = await page.innerText('body');
  ok('직접 열면 안내 문구가 나옴', text.includes('직접 여는 곳이 아닙니다'), text.trim().slice(0, 40));
  ok('직접 열면 관리자 화면 링크가 나옴', await page.isVisible('a[href="/admin/"]'));
  ok('직접 열어도 토큰이 화면에 보이지 않음', !text.includes(TOKEN));
  await ctx.close();
}

// ── 9. 관리자 화면이 설정을 config.yml 에서만 가져온다 ──────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 편집기 본체는 내려받지 않고 가짜로 대신한다(이 환경은 외부 접속이 막혀 있다).
  await page.route('**/decap-cms.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.CMS = { init: function (o) { window.__cmsInit = o || null; window.__cmsInitCalled = true; } };',
    }),
  );

  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });

  ok('관리자 화면이 편집기를 시작시킴', await page.evaluate(() => window.__cmsInitCalled === true));

  /*
    로그인 주소(base_url)를 덮어쓰면 안 된다. GitHub OAuth App 의 Callback URL 은
    하나뿐이라, 접속한 주소마다 /api/auth 를 따로 태우면 쿠키를 심은 도메인과
    돌아오는 도메인이 어긋나 로그인이 실패한다.
  */
  const init = await page.evaluate(() => window.__cmsInit ?? null);
  const overrides = Object.keys(init?.config ?? {});
  ok('로그인 주소를 덮어쓰지 않음(config.yml 값을 그대로 씀)',
    overrides.length === 0, overrides.join(', ') || '(덮어쓰는 항목 없음)');

  // 설정 파일을 찾아가는 길(link 태그)이 그대로인지, 그 파일이 실제로 열리는지.
  const hasLink = await page.locator('link[rel="cms-config-url"][href="/admin/config.yml"]').count();
  ok('설정 파일 위치를 알려주는 link 태그가 그대로 있음', hasLink === 1);

  const cfg = await page.request.get(`${BASE}/admin/config.yml`);
  const cfgText = await cfg.text();
  ok('설정 파일이 실제로 열림', cfg.status() === 200, String(cfg.status()));
  ok('설정 파일에 치환 안 된 자리표시자가 남아 있지 않음', !cfgText.includes('__SITE_URL__'));
  await ctx.close();
}

// ── 9-2. 로그인 시작 주소와 돌아올 주소가 같은 도메인이다 ───────
{
  /*
    이게 어긋나면 확인용 쿠키를 심은 도메인과 돌아오는 도메인이 달라져
    로그인이 원인 모르게 실패한다. 실제로 그렇게 고장 났었다.
    브라우저를 띄우지 않고 응답 헤더만 본다 — GitHub 으로 실제로 나가지 않는다.
  */
  const res = await realFetch(`${BASE}/api/auth`, { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';

  ok('로그인 시작이 GitHub 으로 넘김', location.startsWith('https://github.com/login/oauth/authorize'),
    location.slice(0, 60));

  const sent = new URL(location || 'https://example.invalid');
  const redirect = sent.searchParams.get('redirect_uri');
  ok('돌아올 주소를 명시함(어긋나면 GitHub 이 알려준다)', Boolean(redirect), String(redirect));
  ok('돌아올 주소가 로그인을 시작한 도메인과 같음',
    redirect === `https://${new URL(BASE).host}/api/callback`, String(redirect));
  ok('요청 범위는 공개 저장소 쓰기까지만', sent.searchParams.get('scope') === 'public_repo',
    String(sent.searchParams.get('scope')));

  const cookie = res.headers.get('set-cookie') ?? '';
  ok('확인용 state 쿠키를 심음', cookie.includes('oauth_state='), cookie.slice(0, 40));
  ok('그 쿠키는 스크립트가 못 읽음(HttpOnly)', cookie.includes('HttpOnly'));
  ok('넘긴 state 와 심은 쿠키가 같은 값',
    cookie.includes(`oauth_state=${sent.searchParams.get('state')}`));
}

// ── 10. 편집기를 못 받으면 조용히 빈 화면을 두지 않는다 ─────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/decap-cms.js', (route) => route.abort());
  await page.goto(`${BASE}/admin/`);
  await page.waitForTimeout(300);
  const text = await page.innerText('body');
  ok('편집기 파일을 못 받으면 이유를 보여줌',
    text.includes('불러오지 못했습니다'), text.trim().slice(0, 40));
  await ctx.close();
}

// ── 11. 설정 파일에 자동 시작 끄기가 스크립트보다 먼저 있다 ─────
{
  const html = await readFile('public/admin/index.html', 'utf-8');
  const flag = html.indexOf('CMS_MANUAL_INIT');
  const script = html.indexOf('decap-cms.js');
  ok('자동 시작 끄기가 편집기 스크립트보다 먼저 선언됨',
    flag !== -1 && script !== -1 && flag < script, `flag=${flag}, script=${script}`);
}

await browser.close();
server.close();

const line = '─'.repeat(58);
console.log(`\n${line}\n관리자 로그인 검사\n${line}`);
for (const p of pass) console.log(`  ✔ ${p}`);
for (const f of fail) console.log(`  ✘ ${f}`);
console.log(`${line}\n통과 ${pass.length} / 실패 ${fail.length}\n`);

process.exit(fail.length === 0 ? 0 : 1);
