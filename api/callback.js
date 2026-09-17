/**
 * 관리자 화면 로그인 — 2단계: GitHub 가 돌려준 코드를 토큰으로 바꾼다.
 *
 * Decap CMS 는 팝업 창으로 로그인을 띄우고, 결과를 postMessage 로 받는다.
 * 그래서 마지막에 작은 HTML 을 돌려주며 부모 창에 토큰을 전달한다.
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

/** 팝업 창에서 부모 창으로 결과를 전달하는 HTML */
function popupResponse(status, payload) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>로그인 처리 중</title></head>
<body style="font-family:system-ui;padding:40px;text-align:center;color:#555">
<p>로그인 창을 닫는 중입니다…</p>
<script>
(function () {
  var message = ${JSON.stringify(message)};
  function send(event) {
    if (!window.opener) return;
    window.opener.postMessage(message, event && event.origin ? event.origin : '*');
  }
  window.addEventListener('message', send, false);
  // Decap CMS 가 먼저 인사를 건네면 그 origin 으로 답한다.
  if (window.opener) window.opener.postMessage('authorizing:github', '*');
  setTimeout(function () { window.close(); }, 1500);
})();
</script>
</body></html>`;
}

export default async function handler(request, response) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    response.status(500).send('OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET 환경변수가 필요합니다.');
    return;
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = parseCookies(request.headers.cookie).oauth_state;

  // 로그인을 시작한 그 브라우저가 맞는지 확인한다.
  if (!code || !state || !expectedState || state !== expectedState) {
    response
      .status(400)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(popupResponse('error', { message: '로그인 요청이 올바르지 않습니다. 다시 시도해 주세요.' }));
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

    response
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .setHeader('Set-Cookie', 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
      .send(popupResponse('success', { token: data.access_token, provider: 'github' }));
  } catch (error) {
    response
      .status(500)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(popupResponse('error', { message: String(error.message || error) }));
  }
}
