/**
 * CampusLink 压力测试 — 模拟 1w 用户并发访问
 *
 * 用法: npx tsx scripts/stress_test.ts [URL] [并发数]
 * 示例: npx tsx scripts/stress_test.ts http://127.0.0.1:3002/campus 100
 *       npx tsx scripts/stress_test.ts https://jhcaishui.cn/campus 500
 *
 * 默认: http://127.0.0.1:3002/campus  并发: 200
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';

// ── 配置 ──
const TARGET = process.argv[2] || 'http://127.0.0.1:3002/campus';
const CONCURRENCY = parseInt(process.argv[3] || '200', 10);
const TOTAL_USERS = 10000;
const TIMEOUT_MS = 15_000;

const targetUrl = new URL(TARGET);
const isHttps = targetUrl.protocol === 'https:';
const basePath = targetUrl.pathname.replace(/\/$/, ''); // /campus

// ── 指标收集 ──
interface Metrics {
  total: number;
  success: number;
  failed: number;
  timeouts: number;
  statusCodes: Record<number, number>;
  latencies: number[];
  endpointLatencies: Record<string, number[]>;
  startTime: number;
  endTime: number;
}

function createMetrics(): Metrics {
  return {
    total: 0, success: 0, failed: 0, timeouts: 0,
    statusCodes: {}, latencies: [], endpointLatencies: {},
    startTime: 0, endTime: 0,
  };
}

const metrics = createMetrics();
let completedRequests = 0;
let lastReport = 0;

// ── HTTP Agent（连接复用 + 连接池限制） ──
const agent = new (isHttps ? https : http).Agent({
  keepAlive: true,
  maxSockets: CONCURRENCY,
  maxFreeSockets: 50,
  timeout: TIMEOUT_MS,
});

// ── 请求函数 ──
function makeRequest(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: string,
): Promise<{ status: number; latency: number }> {
  const start = Date.now();
  const endpoint = `${method} ${path}`;

  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: `${basePath}${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-trace-id': `stress-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        ...headers,
      },
      agent,
      timeout: TIMEOUT_MS,
      rejectUnauthorized: false, // 允许自签证书
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      // 消费响应体确保连接可复用
      res.resume();
      res.on('end', () => {
        const latency = Date.now() - start;
        resolve({ status: res.statusCode || 0, latency });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, latency: Date.now() - start }); // 0 = timeout
    });

    req.on('error', () => {
      resolve({ status: -1, latency: Date.now() - start }); // -1 = error
    });

    if (body) req.write(body);
    req.end();
  });
}

// ── 记录指标 ──
function record(endpoint: string, status: number, latency: number) {
  completedRequests++;
  metrics.total++;

  if (status >= 200 && status < 400) {
    metrics.success++;
  } else if (status === 0) {
    metrics.timeouts++;
    metrics.failed++;
  } else {
    metrics.failed++;
    metrics.statusCodes[status] = (metrics.statusCodes[status] || 0) + 1;
  }

  metrics.latencies.push(latency);
  if (!metrics.endpointLatencies[endpoint]) metrics.endpointLatencies[endpoint] = [];
  metrics.endpointLatencies[endpoint].push(latency);
}

// ── 进度报告 ──
function reportProgress() {
  const now = Date.now();
  if (now - lastReport < 2000) return;
  lastReport = now;

  const elapsed = (now - metrics.startTime) / 1000;
  const rate = completedRequests / elapsed;
  const pct = Math.round((completedRequests / TOTAL_USERS) * 100);
  console.log(`[${pct}%] ${completedRequests}/${TOTAL_USERS} | ${rate.toFixed(0)} req/s | 成功:${metrics.success} 失败:${metrics.failed} 超时:${metrics.timeouts}`);
}

// ── 百分位计算 ──
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── 打印报告 ──
function printReport() {
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const throughput = metrics.total / duration;

  console.log('\n' + '═'.repeat(70));
  console.log('  CampusLink 压力测试报告');
  console.log('═'.repeat(70));
  console.log(`  目标:      ${TARGET}`);
  console.log(`  并发数:    ${CONCURRENCY}`);
  console.log(`  总请求数:  ${metrics.total}`);
  console.log(`  耗时:      ${duration.toFixed(1)}s`);
  console.log(`  吞吐量:    ${throughput.toFixed(0)} req/s`);
  console.log(`  成功率:    ${((metrics.success / metrics.total) * 100).toFixed(2)}%`);
  console.log('─'.repeat(70));
  console.log('  延迟分布:');
  console.log(`    P50:     ${percentile(metrics.latencies, 50)}ms`);
  console.log(`    P90:     ${percentile(metrics.latencies, 90)}ms`);
  console.log(`    P95:     ${percentile(metrics.latencies, 95)}ms`);
  console.log(`    P99:     ${percentile(metrics.latencies, 99)}ms`);
  console.log(`    Max:     ${metrics.latencies.length > 0 ? Math.max(...metrics.latencies) : 0}ms`);
  console.log(`    Avg:     ${metrics.latencies.length > 0 ? Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length) : 0}ms`);
  console.log('─'.repeat(70));
  console.log('  状态分布:');
  console.log(`    成功:    ${metrics.success}`);
  console.log(`    失败:    ${metrics.failed}`);
  console.log(`    超时:    ${metrics.timeouts}`);
  for (const [code, count] of Object.entries(metrics.statusCodes).sort()) {
    console.log(`    HTTP ${code}: ${count}`);
  }
  console.log('─'.repeat(70));
  console.log('  端点延迟 (P50/P90/P99):');
  for (const [endpoint, lats] of Object.entries(metrics.endpointLatencies)) {
    console.log(`    ${endpoint.padEnd(45)} ${String(percentile(lats, 50)).padStart(4)} / ${String(percentile(lats, 90)).padStart(4)} / ${String(percentile(lats, 99)).padStart(4)} ms`);
  }
  console.log('═'.repeat(70));
}

// ── 并发池 ──
async function runConcurrencyPool(tasks: (() => Promise<void>)[]): Promise<void> {
  let idx = 0;
  const run = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
      reportProgress();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => run()));
}

// ── 主流程 ──
async function main() {
  console.log(`\nCampusLink 压力测试 — ${TOTAL_USERS} 用户, ${CONCURRENCY} 并发`);
  console.log(`目标: ${TARGET}\n`);

  // Phase 1: 热身 — 探测服务可用性
  console.log('>>> Phase 1: 连通性检查...');
  const warmup = await makeRequest('GET', '/api/health');
  if (warmup.status !== 200) {
    console.error(`❌ 服务不可达: HTTP ${warmup.status}`);
    console.log('   请确保服务已启动（npm run dev 或 pm2 start）');
    process.exit(1);
  }
  console.log('✅ 服务可达\n');

  // 预登录获取 token 池
  console.log('>>> Phase 2: 批量登录获取 Token...');
  const tokenPool: string[] = [];
  const loginLatencies: number[] = [];

  // 用少量并发分批登录，获取 100 个 token 用于后续测试
  for (let i = 0; i < 100 && i < CONCURRENCY; i++) {
    const { status, latency } = await makeRequest(
      'POST',
      '/api/v1/auth/dev-login',
      {},
      JSON.stringify({
        studentId: `20233014${String(i + 100).padStart(4, '0')}`,
        fullName: `测试用户${i + 1}`,
        password: '123456',
        department: '财税学院',
      }),
    );
    loginLatencies.push(latency);
    if (status === 200) record('POST /auth/dev-login', status, latency);
  }

  console.log(`  登录 P50: ${percentile(loginLatencies, 50)}ms | P95: ${percentile(loginLatencies, 95)}ms\n`);

  // Phase 3: 混合场景压测
  console.log(`>>> Phase 3: 1w 用户混合场景 (${CONCURRENCY} 并发)...`);

  metrics.startTime = Date.now();

  // 场景权重分布（模拟真实流量）:
  //   40% 浏览首页帖子列表
  //   15% 搜索帖子
  //   10% 查看圈子热度
  //   10% 查看课程
  //   10% 获取分类
  //   5%  查看帖子详情
  //   5%  获取收藏
  //   3%  刷新 token
  //   2%  获取通知

  const scenarios: { weight: number; fn: () => Promise<{ status: number; latency: number }> }[] = [
    { weight: 40, fn: () => makeRequest('GET', '/api/v1/posts?page=1&limit=20&type=all') },
    { weight: 15, fn: () => makeRequest('GET', `/api/v1/posts?keyword=${['二手', '教材', '笔记', '讲座', '活动'][Math.floor(Math.random() * 5)]}&page=1`) },
    { weight: 10, fn: () => makeRequest('GET', '/api/v1/circles/trending?page=1&size=20') },
    { weight: 10, fn: () => makeRequest('GET', '/api/v1/courses') },
    { weight: 10, fn: () => makeRequest('GET', '/api/v1/categories') },
    { weight: 5, fn: () => makeRequest('GET', `/api/v1/posts/${Math.floor(Math.random() * 50) + 1}`) },
    { weight: 5, fn: () => makeRequest('GET', '/api/v1/favorites') },
    { weight: 3, fn: () => makeRequest('POST', '/api/v1/auth/refresh', {}, JSON.stringify({ refresh_token: 'stress-test' })) },
    { weight: 2, fn: () => makeRequest('GET', '/api/v1/notices') },
  ];

  const totalWeight = scenarios.reduce((s, sc) => s + sc.weight, 0);

  // 构建加权随机任务列表
  const tasks: (() => Promise<void>)[] = [];
  for (let i = 0; i < TOTAL_USERS; i++) {
    let r = Math.random() * totalWeight;
    for (const sc of scenarios) {
      r -= sc.weight;
      if (r <= 0) {
        const endpoint = sc.fn.toString().match(/makeRequest\('(\w+)',\s*'([^']+)'/) || [];
        const label = `${endpoint[1]} ${endpoint[2]?.split('?')[0] || 'unknown'}`;
        tasks.push(async () => {
          const { status, latency } = await sc.fn();
          record(label, status, latency);
        });
        break;
      }
    }
  }

  await runConcurrencyPool(tasks);
  metrics.endTime = Date.now();

  // Phase 4: 限流压测 — 快速连续请求同一接口
  console.log(`\n>>> Phase 4: 限流压测...`);
  const limiterTargets = [
    { name: '登录接口 (limit 5/20)', path: '/api/v1/auth/dev-login', method: 'POST', body: JSON.stringify({ studentId: 'stress', fullName: '极限', password: '123456' }), count: 30 },
    { name: '改密接口 (limit 3/5)', path: '/api/v1/auth/password', method: 'PUT', body: JSON.stringify({ password: 'stress123' }), count: 10 },
    { name: '发布接口 (limit 3)', path: '/api/v1/posts', method: 'POST', body: JSON.stringify({ title: 'stress', description: 'test', category: 'other', postType: 'sell', imageUrls: [] }), count: 10 },
    { name: '上传接口 (limit 10)', path: '/api/v1/upload', method: 'POST', body: '', count: 20 },
  ];

  for (const lt of limiterTargets) {
    const results: number[] = [];
    for (let i = 0; i < lt.count; i++) {
      const { status } = await makeRequest(lt.method, lt.path, {}, lt.body);
      results.push(status);
    }
    const limited = results.filter(s => s === 429).length;
    const allowed = results.filter(s => s < 400).length;
    console.log(`  ${lt.name.padEnd(24)} 通过:${allowed}  限流:${limited}  ` + (limited > 0 ? '✅ 限流生效' : '⚠️ 未触发限流'));
  }

  printReport();

  // Phase 5: 内存快照
  const { status } = await makeRequest('GET', '/api/health');
  if (status === 200) {
    console.log('✅ 压测后服务健康检查通过');
  } else {
    console.log('⚠️ 压测后服务健康检查异常');
  }

  // 清理
  agent.destroy();
}

main().catch((err) => {
  console.error('压测异常:', err.message);
  process.exit(1);
});
