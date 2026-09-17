/**
 * 배포본의 __SITE_URL__ 표시자를 실제 사이트 주소로 바꾼다.
 *
 * ▸ 왜 필요한가
 *   관리자 화면 설정(public/admin/config.yml)은 Astro 가 손대지 않고 그대로
 *   복사하는 파일이라 코드의 값을 읽을 수 없다. 그래서 주소를 직접 적어야 했고,
 *   도메인이 바뀔 때마다 여러 곳을 고쳐야 했다. 한 곳이라도 빠뜨리면
 *   base_url 이 틀려 /admin 로그인이 조용히 막힌다.
 *
 *   이제 주소의 출처는 src/site.mjs 하나뿐이다.
 *
 * ▸ 표시자가 남으면 빌드를 멈춘다
 *   치환에 실패한 채 배포되면 관리자 로그인이 망가지는데,
 *   그건 빌드가 실패하는 것보다 훨씬 나쁘다. 조용히 넘어가지 않는다.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '__SITE_URL__';

/** 표시자가 들어갈 수 있는 형식만 살펴본다. 이미지까지 훑을 이유가 없다. */
const TEXT_LIKE = new Set(['.yml', '.yaml', '.json', '.html', '.txt', '.xml', '.js', '.css']);

async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.isFile() && TEXT_LIKE.has(extname(entry.name).toLowerCase())) found.push(full);
  }
  return found;
}

/** @returns {import('astro').AstroIntegration} */
export function injectSiteUrl({ siteUrl }) {
  return {
    name: 'sj:inject-site-url',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (!siteUrl) throw new Error('injectSiteUrl: 사이트 주소가 비어 있습니다.');

        // 뒤에 슬래시가 붙으면 'https://주소//logo.png' 처럼 두 번 겹친다.
        const url = siteUrl.replace(/\/+$/, '');
        const root = fileURLToPath(dir);
        const files = await walk(root);

        const changed = [];
        for (const file of files) {
          const text = await readFile(file, 'utf8');
          if (!text.includes(PLACEHOLDER)) continue;
          await writeFile(file, text.replaceAll(PLACEHOLDER, url));
          changed.push(relative(root, file));
        }

        // 치환 뒤에도 표시자가 남아 있으면 무언가 잘못된 것이다.
        const leftover = [];
        for (const file of files) {
          if ((await readFile(file, 'utf8')).includes(PLACEHOLDER)) {
            leftover.push(relative(root, file));
          }
        }
        if (leftover.length > 0) {
          throw new Error(
            `주소 치환에 실패했습니다. ${PLACEHOLDER} 가 남아 있습니다: ${leftover.join(', ')}`,
          );
        }

        if (changed.length > 0) {
          logger.info(`사이트 주소 적용: ${url} → ${changed.join(', ')}`);
        }
      },
    },
  };
}
