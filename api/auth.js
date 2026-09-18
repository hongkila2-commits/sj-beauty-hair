/**
 * 관리자 화면 로그인 — 1단계: GitHub 로그인 페이지로 보낸다.
 *
 * Vercel 이 이 파일을 서버 함수로 자동 인식한다(주소: /api/auth).
 * 필요한 환경변수:
 *   OAUTH_CLIENT_ID     GitHub OAuth App 의 Client ID
 *   OAUTH_CLIENT_SECRET GitHub OAuth App 의 Client Secret  (callback 에서 사용)
 */

import { randomBytes } from 'node:crypto';

/** 프록시 뒤에서도 브라우저가 실제로 접속한 주소를 알아낸다. */
function publicHost(request) {
  return request.headers['x-forwarded-host'] || request.headers.host;
}

export default function handler(request, response) {
  const clientId = process.env.OAUTH_CLIENT_ID;

  if (!clientId) {
    response.status(500).send('OAUTH_CLIENT_ID 환경변수가 설정되지 않았습니다.');
    return;
  }

  // CSRF 방지용 일회성 값. 쿠키에 담아두고 callback 에서 대조한다.
  const state = randomBytes(16).toString('hex');

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  // public_repo 는 '공개 저장소 쓰기' 만 허용한다.
  // repo 로 두면 이 계정의 모든 비공개 저장소까지 열리므로, 글 쓰는 용도에는 과하다.
  // ※ 이 저장소를 비공개로 바꾸면 여기를 'repo' 로 되돌려야 로그인이 동작한다.
  authorizeUrl.searchParams.set('scope', 'public_repo');
  authorizeUrl.searchParams.set('state', state);

  /*
    돌아올 주소를 명시한다. 생략하면 GitHub 이 OAuth App 에 등록된 주소로
    '조용히' 보내는데, 그 주소가 여기와 다르면 확인용 쿠키가 없는 도메인에
    떨어져 로그인이 원인 모르게 실패한다. (실제로 그렇게 고장 났었다)

    명시하면 다르다. 등록된 주소와 어긋나는 순간 GitHub 이 자기 화면에
    'redirect_uri_mismatch' 라고 크게 알려준다. 조용한 실패가 시끄러운
    실패로 바뀌는 것이고, 그게 훨씬 낫다.

    ※ GitHub OAuth App 은 Callback URL 을 하나만 가진다. 이 값의 도메인이
      등록된 Callback URL 의 도메인과 같아야 한다.
  */
  authorizeUrl.searchParams.set('redirect_uri', `https://${publicHost(request)}/api/callback`);

  response.setHeader('Set-Cookie', [
    `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  ]);
  response.redirect(302, authorizeUrl.toString());
}
