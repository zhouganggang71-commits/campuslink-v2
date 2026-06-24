/**
 * CampusLink HTTP 压测 — 打生产服务器真实 API
 * 用法: npx tsx scripts/stress_http.ts [并发数] [总请求数]
 */
import http from 'http';

const BASE = '/campus/api/v1';
const CONCURRENCY = parseInt(process.argv[2] || '200');
const TOTAL = parseInt(process.argv[3] || '10000');
const TIMEOUT = 10_000;

const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY, maxFreeSockets: 50 });

// ── 场景权重 ──
const scenarios: { weight: number; method: string; path: string; name: string }[] = [
  { weight: 30, method: 'GET', path: '/posts?page=1&limit=20', name: '首页帖子' },
  { weight: 15, method: 'GET', path: `/posts?keyword=${Math.random() > 0.5 ? '二手' : '教材'}&page=1`, name: '搜索帖子' },
  { weight: 10, method: 'GET', path: '/circles/trending?page=1&size=20', name: '圈子热度' },
  { weight: 5, method: 'GET', path: '/posts/1', name: '帖子详情' },
  { weight: 5, method: 'GET', path: '/categories', name: '分类列表' },
  { weight: 5, method: 'GET', path: '/ads', name: '广告列表' },
  { weight: 20, method: 'GET', path: '/circles', name: '圈子列表' },
];

const totalW = scenarios.reduce((s, c) => s + c.weight, 0);

// ── 发送请求 ──
function send(method: string, path: string): Promise<{ status: number; ms: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const encoded = `${BASE}${path}`.replace(/[\u4e00-\u9fff]/g, (c) => encodeURIComponent(c));
    const req = http.request({
      hostname: '127.0.0.1', port: 3002, path: encoded, method, agent, timeout: TIMEOUT,
      headers: { 'x-trace-id': `bench-${Math.random().toString(36).slice(2,8)}` },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode || 0, ms: Date.now() - start }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, ms: Date.now() - start }); });
    req.on('error', () => resolve({ status: -1, ms: Date.now() - start }));
    req.end();
  });
}

function pct(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1] || 0;
}

// ── 主流程 ──
async function main() {
  console.log(`\nCampusLink HTTP 压测 — ${TOTAL}请求 ${CONCURRENCY}并发`);
  console.log(`目标: 127.0.0.1:3002\n`);

  // 连通性
  const probe = await send('GET', '/posts?page=1&limit=1');
  if (probe.status <= 0) {
    console.error('服务不可达!');
    process.exit(1);
  }
  console.log('✅ 服务在线\n');

  // 构建任务
  const tasks: (() => Promise<void>)[] = [];
  const allLats: number[] = [];
  const allCodes: Record<number, number> = {};
  const epLats: Record<string, number[]> = {};

  for (let i = 0; i < TOTAL; i++) {
    let r = Math.random() * totalW;
    let sc = scenarios[0];
    for (const s of scenarios) {
      r -= s.weight;
      if (r <= 0) { sc = s; break; }
    }
    tasks.push(async () => {
      const { status, ms } = await send(sc.method, sc.path);
      allLats.push(ms);
      allCodes[status] = (allCodes[status] || 0) + 1;
      if (!epLats[sc.name]) epLats[sc.name] = [];
      epLats[sc.name].push(ms);
    });
  }

  // 执行
  const start = Date.now();
  let idx = 0;
  let lastRpt = 0;
  const run = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
      const now = Date.now();
      if (now - lastRpt > 1000) {
        lastRpt = now;
        const done = allLats.length;
        const rate = done / ((now - start) / 1000);
        const ok = Object.entries(allCodes).filter(([c]) => parseInt(c) < 400).reduce((a, [, n]) => a + n, 0);
        console.log(`  [${Math.round(done / TOTAL * 100)}%] ${done}/${TOTAL} | ${rate.toFixed(0)} req/s | 成功:${ok} 失败:${done - ok}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
  const elapsed = (Date.now() - start) / 1000;

  // ── 报告 ──
  console.log('\n' + '═'.repeat(65));
  console.log('  CampusLink HTTP 压测报告');
  console.log('═'.repeat(65));
  console.log(`  总请求:  ${TOTAL}  |  并发: ${CONCURRENCY}  |  耗时: ${elapsed.toFixed(1)}s`);
  console.log(`  吞吐量:  ${Math.round(TOTAL / elapsed)} req/s`);
  console.log('─'.repeat(65));
  console.log('  延迟分布:');
  console.log(`    P50:    ${pct(allLats, 50)}ms`);
  console.log(`    P90:    ${pct(allLats, 90)}ms`);
  console.log(`    P95:    ${pct(allLats, 95)}ms`);
  console.log(`    P99:    ${pct(allLats, 99)}ms`);
  console.log(`    Max:    ${allLats.length ? Math.max(...allLats) : 0}ms`);
  if (allLats.length) console.log(`    Avg:    ${Math.round(allLats.reduce((a, b) => a + b, 0) / allLats.length)}ms`);
  console.log('─'.repeat(65));
  console.log('  状态码:');
  for (const [code, count] of Object.entries(allCodes).sort()) {
    const label = code === '200' ? '200 OK' : code === '429' ? '429 限流' : code === '0' ? '超时' : code === '-1' ? '连接错误' : `HTTP ${code}`;
    console.log(`    ${label.padEnd(14)} ${count} (${((count / TOTAL) * 100).toFixed(1)}%)`);
  }
  console.log('─'.repeat(65));
  console.log('  端点延迟 (P50 / P90 / P99):');
  for (const [ep, lats] of Object.entries(epLats).sort()) {
    console.log(`    ${ep.padEnd(18)} ${String(pct(lats, 50)).padStart(4)} / ${String(pct(lats, 90)).padStart(4)} / ${String(pct(lats, 99)).padStart(4)} ms  (${lats.length}次)`);
  }
  console.log('═'.repeat(65));

  agent.destroy();

  const errors = Object.entries(allCodes).filter(([c]) => c !== '200').reduce((a, [, n]) => a + n, 0);
  if (errors / TOTAL > 0.05) {
    console.log(`\n⚠️  错误率 ${((errors / TOTAL) * 100).toFixed(1)}% 超过 5% 阈值!`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
