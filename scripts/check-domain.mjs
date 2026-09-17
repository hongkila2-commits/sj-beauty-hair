/**
 * 도메인 연결 상태 점검.
 *
 *   npm run domain
 *
 * 지금 어느 단계까지 됐는지, 다음에 뭘 해야 하는지 알려준다.
 * 도메인 주소는 src/site.mjs 에서 읽으므로 도메인이 바뀌어도 그대로 동작한다.
 *
 * DNS 반영은 몇 시간에서 하루까지 걸린다. 그동안 "됐나?"를 확인하는 용도다.
 */

import { Resolver } from 'node:dns/promises';
import { SITE } from '../src/site.mjs';

/** 이전에 쓰던 주소. 도메인이 열릴 때까지 이쪽이 살아 있어야 한다. */
const FALLBACK_HOST = 'sj-beauty-hair.vercel.app';

const host = new URL(SITE.url).hostname;

/**
 * 공개 리졸버에 직접 묻는다.
 * 컴퓨터에 남은 캐시 때문에 옛 값이 보이는 일을 막기 위함이다.
 */
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(['8.8.8.8', '1.1.1.1']);

/**
 * 조회 결과를 세 가지로 구분한다.
 *   ok     : 값이 있다
 *   none   : 도메인은 있는데 그 레코드만 없다
 *   absent : 도메인 자체가 없다 (NXDOMAIN)
 *   error  : 조회를 못 했다 (네트워크 문제 등)
 */
async function lookup(method, name) {
  try {
    const values = await resolver[method](name);
    return { state: values?.length ? 'ok' : 'none', values: values ?? [] };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return { state: error.code === 'ENOTFOUND' ? 'absent' : 'none', values: [] };
    }
    return { state: 'error', values: [], message: error.code ?? error.message };
  }
}

/** 네임서버 호스트명으로 업체를 추정한다. 모르는 곳이면 단정하지 않는다. */
function providerOf(nameservers) {
  const joined = nameservers.join(' ').toLowerCase();
  if (joined.includes('gabia')) return '가비아';
  if (joined.includes('cloudflare')) return 'Cloudflare';
  if (joined.includes('vercel')) return 'Vercel';
  if (joined.includes('awsdns')) return 'AWS Route53';
  return null; // 모르면 호스트명을 그대로 보여준다
}

const ns = await lookup('resolveNs', host);
const a = await lookup('resolve4', host);
const www = await lookup('resolveCname', `www.${host}`);
const wwwA = www.state === 'ok' ? www : await lookup('resolve4', `www.${host}`);
const fallback = await lookup('resolve4', FALLBACK_HOST);

const provider = ns.state === 'ok' ? providerOf(ns.values) : null;
const label = (r, fmt = (v) => v.join(', ')) =>
  r.state === 'ok' ? fmt(r.values)
  : r.state === 'absent' ? '도메인 없음'
  : r.state === 'error' ? `조회 불가 (${r.message})`
  : '없음';

console.log(`\n도메인 점검 — ${host}\n`);
console.log(`  등록        ${ns.state === 'ok' ? '정상' : label(ns)}`);
console.log(
  `  네임서버    ${
    ns.state !== 'ok'
      ? '-'
      : provider
        ? `${provider} (${ns.values[0]}${ns.values.length > 1 ? ` 외 ${ns.values.length - 1}개` : ''})`
        : ns.values.join(', ')
  }`,
);
console.log(`  A 레코드    ${label(a)}`);
console.log(`  www         ${label(wwwA)}`);
console.log(`  이전 주소   ${fallback.state === 'ok' ? '살아 있음' : label(fallback)}`);

// ── 지금 단계에 맞는 다음 할 일 ──────────────────────────────────
console.log('');
if (ns.state === 'absent') {
  console.log('→ 도메인이 조회되지 않습니다. 등록이 끝났는지, 만료되지 않았는지 확인하세요.');
} else if (ns.state === 'error') {
  console.log('→ DNS 조회 자체가 실패했습니다. 네트워크 상태를 확인하고 잠시 뒤 다시 실행하세요.');
} else if (a.state === 'ok' && wwwA.state === 'ok') {
  // 레코드가 다 있으면 네임서버가 어디든 상관없다. 연결은 끝난 것이다.
  console.log('→ DNS 설정은 모두 끝났습니다. 이제 확인하실 것:');
  console.log(`   1. https://${host} 이 열리는지`);
  console.log(`   2. https://www.${host} 이 대표 주소로 넘어가는지`);
  console.log(`   3. https://${host}/admin 에서 GitHub 로그인이 되는지`);
  console.log('      → 안 되면 GitHub OAuth App 의 Callback URL 을');
  console.log(`         https://${host}/api/callback 로 바꾸세요.`);
} else if (provider !== '가비아') {
  console.log(`→ 다음 할 일: 네임서버가 아직 ${provider ?? ns.values[0]} 입니다.`);
  console.log('   설정하신 레코드가 반영되지 않는 원인입니다.');
  console.log('   My가비아 → 서비스관리 → 도메인 → [관리] → 네임서버 설정 에서');
  console.log("   '가비아 네임서버 사용' 을 고르고 저장하세요. 반영에 몇 시간 걸립니다.");
} else if (a.state !== 'ok') {
  console.log('→ 다음 할 일: 네임서버는 가비아로 바뀌었습니다. 이제 레코드를 넣으세요.');
  console.log('   My가비아 → DNS 관리 → [설정] → 레코드 수정');
  console.log('   호스트 @ / 타입 A / 값 = Vercel 이 알려준 IP');
  console.log('   저장 후 "확인·적용" 버튼까지 눌러야 반영됩니다.');
} else {
  console.log('→ 다음 할 일: 대표 주소는 연결됐습니다. www 만 남았습니다.');
  console.log('   호스트 www / 타입 CNAME / 값 = Vercel 이 알려준 주소');
}
console.log('');
