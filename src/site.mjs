/**
 * 사이트 전역 상수 — 주소의 유일한 출처.
 *
 * 도메인을 바꿀 때는 아래 url 한 줄만 고치면 된다.
 * 빌드할 때 이 값이 관리자 화면 설정(dist/admin/config.yml)까지 자동으로 들어간다.
 * astro.config.mjs 와 페이지 양쪽에서 쓰이므로 의존성 없는 .mjs 로 둔다.
 */
export const SITE = {
  url: 'https://sjbthair.com',
  repo: 'hongkila2-commits/sj-beauty-hair',
};
