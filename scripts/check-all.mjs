/**
 * 사이트 전체 점검을 한 번에 돌린다.
 *
 *   npm run check
 *
 * 빌드 → 미리보기 서버 기동 → 검사 3종 → 서버 정리 순서로 진행한다.
 * 하나라도 실패하면 0 이 아닌 값으로 끝나므로, 자동 점검(GitHub Actions)이
 * 실패를 알아챌 수 있다.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const SUITES = [
  ['경로 · 링크', 'scripts/check-routes.mjs'],
  ['화면 조작', 'scripts/check-actions.mjs'],
  ['이벤트 · 팝업', 'scripts/check-promo.mjs'],
  ['점검 안내 화면', 'scripts/check-maintenance.mjs'],
];

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

/** 미리보기 서버가 응답할 때까지 기다린다. 무한정 기다리지 않는다. */
async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // 아직 안 떴다
    }
    await sleep(400);
  }
  return false;
}

console.log('\n■ 빌드');
if ((await run('npm', ['run', 'build'])) !== 0) {
  console.error('\n빌드 실패 — 검사를 진행하지 않습니다.');
  process.exit(1);
}

console.log('\n■ 미리보기 서버 기동');
const server = spawn('npm', ['run', 'preview'], { stdio: 'ignore', detached: true });
const stop = () => {
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* 이미 종료됨 */ }
};
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

if (!(await waitForServer())) {
  console.error('미리보기 서버가 응답하지 않습니다.');
  stop();
  process.exit(1);
}

const failed = [];
for (const [label, script] of SUITES) {
  console.log(`\n■ ${label}`);
  if ((await run('node', [script])) !== 0) failed.push(label);
}

stop();

console.log('\n' + '='.repeat(58));
if (failed.length === 0) {
  console.log('점검 통과 — 이상 없음');
  process.exit(0);
}
console.log(`점검 실패: ${failed.join(', ')}`);
process.exit(1);
