// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { optimizeUploads } from './src/integrations/optimize-uploads.mjs';
import { injectSiteUrl } from './src/integrations/inject-site-url.mjs';
import { SITE } from './src/site.mjs';

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [
    sitemap(),
    // 관리자 화면으로 올린 사진을 배포 직전에 줄인다. 원본은 건드리지 않는다.
    optimizeUploads(),
    // 배포본의 __SITE_URL__ 표시자를 위 site 값으로 바꾼다. 주소의 출처는 site.mjs 하나다.
    injectSiteUrl({ siteUrl: SITE.url }),
  ],
  markdown: {
    shikiConfig: { theme: 'github-light', wrap: true },
  },
});
