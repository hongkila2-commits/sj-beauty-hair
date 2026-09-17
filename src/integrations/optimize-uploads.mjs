/**
 * 관리자 화면(/admin)으로 올린 사진을 배포 직전에 자동으로 줄인다.
 *
 * ▸ 왜 필요한가
 *   Astro 는 public/ 폴더를 손대지 않고 그대로 복사한다. 그래서 원장님이
 *   휴대폰 사진(3~5MB)을 그대로 올리시면 그 크기 그대로 방문자에게 전송된다.
 *   모바일에서 눈에 띄게 느려지고, 저장소 용량도 빠르게 찬다.
 *
 * ▸ 원본은 건드리지 않는다
 *   public/uploads/ 의 원본은 그대로 두고, 배포본인 dist/uploads/ 만 줄인다.
 *   - 빌드를 반복해도 같은 파일을 거듭 압축해 화질이 나빠지는 일이 없다.
 *   - 인쇄물 등에 원본이 필요할 때 저장소에서 그대로 꺼낼 수 있다.
 *
 * ▸ 파일명과 확장자는 그대로 둔다
 *   글 본문에 '/uploads/사진.jpg' 처럼 적혀 있어서, 이름이나 형식을 바꾸면
 *   링크가 깨진다. 그래서 형식 변환 없이 '크기 줄이기 + 다시 저장'만 한다.
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 본문 최대 폭이 760px 이라 고해상도 화면(2배)까지 이 정도면 덮는다. */
const MAX_WIDTH = 1600;

/** 이미 충분히 작은 사진은 다시 건드리지 않는다. */
const SKIP_UNDER_BYTES = 200 * 1024;

/** sharp 로 다룰 수 있고, 줄여서 이득이 있는 형식만. */
const HANDLED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff']);

/** SVG 는 벡터라 래스터화하면 망가지고, GIF 는 움직임이 사라진다. */
const ALWAYS_SKIP = new Set(['.svg', '.gif', '.ico']);

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** 폴더 안의 모든 파일 경로를 재귀로 모은다. */
async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found; // uploads 폴더가 아직 없을 수 있다
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

/**
 * 한 장을 줄인다.
 * @returns {Promise<{before:number, after:number} | null>} 건너뛰었으면 null
 */
async function shrink(sharp, filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ALWAYS_SKIP.has(ext) || !HANDLED.has(ext)) return null;

  const { size: before } = await stat(filePath);
  const input = await readFile(filePath);

  const image = sharp(input, { failOn: 'error' });
  const meta = await image.metadata();

  // 이미 작고 좁으면 그대로 두는 편이 화질에 낫다.
  if (before < SKIP_UNDER_BYTES && (meta.width ?? 0) <= MAX_WIDTH) return null;

  // 여러 장짜리(움직이는 webp/avif)는 건드리면 움직임이 사라진다.
  if ((meta.pages ?? 1) > 1) return null;

  let pipeline = image.rotate(); // 휴대폰 사진의 회전 정보를 실제 픽셀에 반영
  if ((meta.width ?? 0) > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  // 형식은 바꾸지 않는다. 링크가 깨지기 때문이다.
  if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9, palette: true });
  else if (ext === '.webp') pipeline = pipeline.webp({ quality: 80 });
  else if (ext === '.avif') pipeline = pipeline.avif({ quality: 60 });
  else if (ext === '.tiff') pipeline = pipeline.tiff({ quality: 80 });
  else pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });

  const output = await pipeline.toBuffer();

  // 줄어들지 않았다면(이미 잘 압축된 사진) 원본을 그대로 둔다.
  if (output.length >= before) return null;

  await writeFile(filePath, output);
  return { before, after: output.length };
}

/** @returns {import('astro').AstroIntegration} */
export function optimizeUploads({ folder = 'uploads' } = {}) {
  return {
    name: 'sj:optimize-uploads',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = join(fileURLToPath(dir), folder);
        const files = await walk(root);
        if (files.length === 0) return;

        let done = 0, skipped = 0, failed = 0, before = 0, after = 0;

        // sharp 는 Astro 의 이미지 처리에도 쓰이지만, 여기서는 직접 의존성으로 쓴다.
        let sharp;
        try {
          sharp = (await import('sharp')).default;
        } catch (error) {
          logger.warn(`사진 압축을 건너뜁니다 — sharp 를 불러오지 못했습니다: ${error.message}`);
          return;
        }

        for (const file of files) {
          try {
            const result = await shrink(sharp, file);
            if (!result) { skipped++; continue; }
            done++;
            before += result.before;
            after += result.after;
          } catch (error) {
            // 사진 한 장 때문에 배포 전체가 막히면 안 된다.
            failed++;
            logger.warn(`${relative(root, file)} 압축 실패 — 원본 그대로 둡니다: ${error.message}`);
          }
        }

        if (done === 0) {
          logger.info(`사진 압축: 줄일 사진 없음 (건너뜀 ${skipped}장)`);
          return;
        }

        const saved = Math.round((1 - after / before) * 100);
        logger.info(
          `사진 ${done}장 압축 · ${formatSize(before)} → ${formatSize(after)} (${saved}% 절약)` +
            ` · 건너뜀 ${skipped}장` + (failed ? ` · 실패 ${failed}장` : ''),
        );
      },
    },
  };
}
