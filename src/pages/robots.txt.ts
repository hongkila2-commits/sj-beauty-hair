import type { APIContext } from 'astro';

/** 관리자 화면은 검색에서 제외하고, 나머지는 모두 수집을 허용한다. */
export function GET(context: APIContext) {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    '',
    `Sitemap: ${new URL('sitemap-index.xml', context.site).href}`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
