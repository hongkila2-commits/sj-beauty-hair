import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 글은 Astro 기본 위치(src/content)가 아니라 저장소 루트의 content/ 에 둔다.
 * 이 폴더를 Obsidian 보관함으로 열면 코드 파일이 섞이지 않는다.
 */

export const CATEGORIES = ['헤어칼럼', '스타일', '공지'] as const;

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(CATEGORIES).default('헤어칼럼'),
    summary: z.string().optional(),
    thumbnail: z.string().optional(),
    author: z.string().default('SJ뷰티헤어'),
    /** true 로 두면 사이트에 나타나지 않는다. 작성 중인 글에 쓴다. */
    draft: z.boolean().default(false),
  }),
});

const videos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/videos' }),
  schema: z.object({
    title: z.string(),
    /** 유튜브 주소 끝의 11자리 코드. 예) https://youtu.be/AbCdEfGhIjK → AbCdEfGhIjK */
    youtubeId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{11}$/, '유튜브 코드는 영문·숫자·-·_ 로 된 11자리여야 합니다.'),
    date: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts, videos };
