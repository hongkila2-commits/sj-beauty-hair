/**
 * 관리자 화면 로그인 — 1단계: GitHub 로그인 페이지로 보낸다.
 *
 * Vercel 이 이 파일을 서버 함수로 자동 인식한다(주소: /api/auth).
 * 필요한 환경변수:
 *   OAUTH_CLIENT_ID     GitHub OAuth App 의 Client ID
 *   OAUTH_CLIENT_SECRET GitHub OAuth App 의 Client Secret  (callback 에서 사용)
 */

import { randomBytes } from 'node:crypto';

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
  authorizeUrl.searchParams.set('scope', 'repo,user');
  authorizeUrl.searchParams.set('state', state);

  response.setHeader('Set-Cookie', [
    `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  ]);
  response.redirect(302, authorizeUrl.toString());
}
