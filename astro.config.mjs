// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { optimizeUploads } from './src/integrations/optimize-uploads.mjs';
import { SITE } from './src/site.mjs';

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [
    sitemap(),
    // 관리자 화면으로 올린 사진을 배포 직전에 줄인다. 원본은 건드리지 않는다.
    optimizeUploads(),
  ],
  markdown: {
    shikiConfig: { theme: 'github-light', wrap: true },
  },
});
