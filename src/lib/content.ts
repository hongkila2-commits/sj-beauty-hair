import { getCollection } from 'astro:content';

/** 발행된 글만 최신순으로 돌려준다. draft: true 인 글은 제외한다. */
export async function publishedPosts() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** 발행된 영상만 최신순으로 돌려준다. */
export async function publishedVideos() {
  const videos = await getCollection('videos', ({ data }) => !data.draft);
  return videos.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

const formatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
});

export function formatDate(date: Date): string {
  return formatter.format(date);
}

/** <time datetime="..."> 에 넣을 YYYY-MM-DD (한국 시간 기준) */
export function isoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}
