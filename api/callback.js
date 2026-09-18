/**
 * 관리자 화면 로그인 — 2단계: GitHub 가 돌려준 코드를 토큰으로 바꾼다.
 *
 * Decap CMS 는 로그인을 팝업 창으로 띄우고, 결과를 postMessage 로 받는다.
 * 그래서 마지막에 작은 HTML 을 돌려주며 부모 창(관리자 화면)에 토큰을 전달한다.
 *
 * 주고받는 순서 (Decap 규약)
 *   1. 팝업  → 부모 : 'authorizing:github'                (인사)
 *   2. 부모  → 팝업 : 'authorizing:github'                (답인사)
 *   3. 팝업  → 부모 : 'authorization:github:success:{…}'  (토큰)
 *
 * 2번 답인사를 기다리는 이유는, 그래야 부모 창의 정확한 origin 을 알 수 있고
 * 부모가 들을 준비가 됐다는 것도 확인되기 때문이다. 부모가 준비되기 전에
 * 인사를 한 번만 보내면 그 인사는 허공에 사라지고 로그인이 조용히 실패한다.
 * 그래서 아래 스크립트는 답인사가 올 때까지 인사를 반복한다.
 */

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key, decodeURIComponent(rest.join('='))]),
  );
}

/** HTML 본문에 그대로 넣어도 안전하게 만든다. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 자바스크립트 문자열 리터럴로 만든다.
 * '<' 를 이스케이프하는 이유: 값 안에 '</script>' 가 들어 있으면
 * 브라우저가 거기서 스크립트를 끊어버리기 때문이다.
 */
function jsString(value) {
  return JSON.stringify(String(value)).replace(/</g, '\\u003c');
}

/** 성공·실패 화면이 공유하는 껍데기. */
function page(title, body) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, 'Malgun Gothic', sans-serif;
         margin: 0; padding: 48px 24px; text-align: center; color: #3f4a52;
         line-height: 1.7; }
  h1 { font-size: 1.125rem; margin: 0 0 12px; }
  p { margin: 0 0 8px; font-size: 0.9375rem; }
  .why { color: #b3261e; font-weight: 600; word-break: break-word; }
  .hint { color: #7a858d; font-size: 0.875rem; margin-top: 20px; }
  a { color: #55799a; }
</style></head>
<body>
${body}
</body></html>`;
}

/**
 * 성공 화면 — 토큰을 부모 창에 전달한다.
 *
 * 창을 닫는 시점이 중요하다. 예전 코드는 1.5초 뒤 무조건 닫았는데,
 * 전달이 끝나기 전에 닫히면 로그인이 조용히 실패한다.
 * 지금은 '전달한 뒤에만' 닫는다.
 */
function successPage(payload) {
  const message = `authorization:github:success:${JSON.stringify(payload)}`;

  return page(
    '로그인 처리 중',
    `<h1 id="head">로그인 확인 중입니다…</h1>
<p id="note">관리자 화면과 연결하고 있습니다.</p>
<script>
(function () {
  var MESSAGE = ${jsString(message)};
  var HELLO = 'authorizing:github';
  var head = document.getElementById('head');
  var note = document.getElementById('note');

  function show(title, text, isError) {
    head.textContent = title;
    note.textContent = text;
    note.className = isError ? 'why' : '';
  }

  var opener = window.opener;

  // 주소창에 직접 입력해서 열린 경우. 부모 창이 없으니 전달할 곳이 없다.
  if (!opener || opener.closed) {
    show('이 주소는 직접 여는 곳이 아닙니다', '관리자 화면에서 로그인 버튼을 눌러 주세요.', false);
    note.insertAdjacentHTML('afterend', '<p class="hint"><a href="/admin/">관리자 화면으로 가기</a></p>');
    return;
  }

  var delivered = false;
  var tries = 0;
  var timer;

  function hello() {
    try { opener.postMessage(HELLO, '*'); } catch (e) { /* 창이 닫혔으면 무시 */ }
  }

  function deliver(origin) {
    if (delivered) return;
    delivered = true;
    clearInterval(timer);
    window.removeEventListener('message', onReply, false);

    try {
      opener.postMessage(MESSAGE, origin);
    } catch (e) {
      show('전달에 실패했습니다', String(e && e.message ? e.message : e), true);
      return;
    }

    show('로그인되었습니다.', '창을 닫습니다…', false);
    // 전달한 뒤에만 닫는다. 브라우저가 닫기를 막을 수도 있으니 안내를 남긴다.
    setTimeout(function () {
      window.close();
      show('로그인되었습니다.', '이 창은 닫으셔도 됩니다.', false);
    }, 300);
  }

  function onReply(event) {
    if (typeof event.data !== 'string') return;
    if (event.data.indexOf(HELLO) !== 0) return;
    deliver(event.origin && event.origin !== 'null' ? event.origin : '*');
  }

  window.addEventListener('message', onReply, false);

  // 부모 창이 들을 준비가 될 때까지 인사를 반복한다.
  hello();
  timer = setInterval(function () {
    tries += 1;
    if (tries > 100) {          // 100회 × 100ms = 10초
      clearInterval(timer);
      if (delivered) return;

      // 마지막 시도. 답인사는 없었지만 같은 주소라면 듣고만 있을 수도 있다.
      // 이게 통하면 관리자 화면이 스스로 이 창을 닫으므로 아래 문구는 보이지 않는다.
      try { opener.postMessage(MESSAGE, window.location.origin); } catch (e) { /* 무시 */ }

      show('관리자 화면이 응답하지 않습니다', '이 창을 닫고 /admin 에서 다시 시도해 주세요.', true);
      return;
    }
    hello();
  }, 100);
})();
</script>`,
  );
}

/**
 * 실패 화면 — 사유를 보여주고 창을 닫지 않는다.
 *
 * 부모 창에 실패를 알리지 않는 이유: Decap 은 실패 알림을 받으면
 * 이 창을 즉시 닫아버린다. 그러면 사용자가 사유를 읽을 수 없다.
 * 원인을 눈으로 볼 수 있게 하는 편이 낫다.
 */
function errorPage(reason) {
  return page(
    '로그인 실패',
    `<h1>로그인하지 못했습니다</h1>
<p class="why">${escapeHtml(reason)}</p>
<p class="hint">
  위 문구를 그대로 알려 주시면 원인을 찾을 수 있습니다.<br />
  <a href="/admin/">관리자 화면으로 돌아가기</a>
</p>`,
  );
}

function sendHtml(response, status, html, extraHeaders = {}) {
  response.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  for (const [key, value] of Object.entries(extraHeaders)) response.setHeader(key, value);
  response.send(html);
}

export default async function handler(request, response) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    sendHtml(response, 500, errorPage('서버에 OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET 환경변수가 없습니다.'));
    return;
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = parseCookies(request.headers.cookie).oauth_state;

  // GitHub 이 거절한 경우(권한 거부 등)는 사유를 그대로 알려준다.
  const githubError = url.searchParams.get('error');
  if (githubError) {
    sendHtml(response, 400, errorPage(url.searchParams.get('error_description') || githubError));
    return;
  }

  // 로그인을 시작한 그 브라우저가 맞는지 확인한다.
  if (!code || !state || !expectedState || state !== expectedState) {
    const reason = !expectedState
      ? '로그인 확인용 쿠키가 없습니다. 브라우저가 쿠키를 막고 있거나, 로그인을 시작한 주소와 다른 주소로 돌아왔습니다.'
      : '로그인 요청이 올바르지 않습니다. 관리자 화면에서 다시 시도해 주세요.';
    sendHtml(response, 400, errorPage(reason));
    return;
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const data = await tokenResponse.json();

    if (!data.access_token) {
      throw new Error(data.error_description || 'GitHub 이 토큰을 돌려주지 않았습니다.');
    }

    sendHtml(response, 200, successPage({ token: data.access_token, provider: 'github' }), {
      'Set-Cookie': 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    });
  } catch (error) {
    sendHtml(response, 500, errorPage(String(error.message || error)));
  }
}
