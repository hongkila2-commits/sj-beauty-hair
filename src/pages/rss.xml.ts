import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { publishedPosts } from '../lib/content';
import { BRAND } from '../config';

/** 네이버·구글이 새 글을 빨리 알아채도록 RSS 를 제공한다. */
export async function GET(context: APIContext) {
  const posts = await publishedPosts();
  return rss({
    title: `${BRAND.nameKo} 헤어칼럼`,
    description: BRAND.description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary ?? '',
      link: `/blog/${post.id}`,
      categories: [post.data.category],
    })),
    customData: '<language>ko-kr</language>',
  });
}
