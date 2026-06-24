/**
 * CampusLink 安全专项测试 — 打在运行的服务器上验证所有安全措施
 * 用法: npx tsx scripts/security_test.ts
 */
import http from 'http';

const H = '127.0.0.1';
const P = 3002;
const B = '/campus/api/v1';

function req(method: string, path: string, headers?: Record<string, string>, body?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve) => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
    const r = http.request({ hostname: H, port: P, path: `${B}${path}`, method, headers: h, timeout: 10_000 }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode || 0, data: d.slice(0, 200) }); }
      });
    });
    r.on('error', (e) => resolve({ status: -1, data: e.message }));
    if (body) r.write(body);
    r.end();
  });
}

async function check(name: string, fn: () => Promise<boolean>, expected = true) {
  try {
    const ok = await fn();
    const icon = ok === expected ? '✅' : '❌';
    console.log(`  ${icon} ${name}`);
    if (ok !== expected) console.log(`     预期:${expected} 实际:${ok}`);
  } catch(e: any) {
    console.log(`  ❌ ${name} — 异常: ${e.message}`);
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CampusLink 安全专项测试');
  console.log('═══════════════════════════════════════════════════════\n');

  // ═══ 1. 限流测试 ═══
  console.log('── 1. 限流器 ──');

  await check('登录限流(5/20): 6次内触发429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      const { status } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
        studentId: `sec${i}`, fullName: 'test', password: '123456',
      }));
      results.push(status);
    }
    return results.some(s => s === 429);
  });

  await check('改密限流(3/5): 4次内触发429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { status } = await req('PUT', '/auth/password', {
        Authorization: 'Bearer invalid_token',
      }, JSON.stringify({ password: '12345678' }));
      results.push(status);
    }
    return results.some(s => s === 429);
  });

  // ═══ 2. JWT 安全 ═══
  console.log('\n── 2. JWT 鉴权 ──');

  await check('无Token访问受保护接口→401', async () => {
    const { status } = await req('GET', '/courses');
    return status === 401;
  });

  await check('伪造Token→401', async () => {
    const { status } = await req('GET', '/courses', {
      Authorization: 'Bearer fake.token.here',
    });
    return status === 401;
  });

  await check('过期Token→401', async () => {
    // 一个已过期的token
    const { status } = await req('GET', '/courses', {
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEsImFkbWluIjpmYWxzZSwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDAxfQ.invalid',
    });
    return status === 401;
  });

  await check('Refresh Token不能当Access Token用→401', async () => {
    // 先获取一个refresh token (通过登录)
    const { data } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const refreshTok = data?.data?.refresh_token;
    if (!refreshTok) return false;
    const { status } = await req('GET', '/courses', {
      Authorization: `Bearer ${refreshTok}`,
    });
    return status === 401;
  });

  // ═══ 3. Admin 鉴权 ═══
  console.log('\n── 3. Admin 鉴权 ──');

  await check('无Token访问Admin→401', async () => {
    const { status } = await req('GET', '/admin/stats');
    return status === 401;
  });

  await check('普通用户访问Admin→403', async () => {
    const { data } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: 'test_sec_user', fullName: 'test', password: '123456',
    }));
    const token = data?.data?.token;
    if (!token) return false;
    const { status } = await req('GET', '/admin/stats', { Authorization: `Bearer ${token}` });
    return status === 403;
  });

  // ═══ 4. 敏感词拦截 ═══
  console.log('\n── 4. 敏感词拦截 ──');

  await check('帖子含"刷单"被拦截→400', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    if (!token) return false;
    const { status, data } = await req('POST', '/posts', { Authorization: `Bearer ${token}` }, JSON.stringify({
      title: '刷单日结500元', description: '刷单兼职日结', category: 'other', postType: 'sell', imageUrls: [],
    }));
    return status === 400 && data?.message?.includes('违规');
  });

  await check('帖子含"代课"被拦截→400', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    if (!token) return false;
    const { status, data } = await req('POST', '/posts', { Authorization: `Bearer ${token}` }, JSON.stringify({
      title: '代课', description: '代课服务', category: 'other', postType: 'sell', imageUrls: [],
    }));
    return status === 400 && data?.message?.includes('违规');
  });

  await check('正常帖子通过→200', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    if (!token) return false;
    const { status } = await req('POST', '/posts', { Authorization: `Bearer ${token}` }, JSON.stringify({
      title: '高等数学第七版', description: '二手教材出售九成新', category: '教材', postType: 'sell', imageUrls: [],
    }));
    return status === 200;
  });

  // ═══ 5. Zod 入参校验 ═══
  console.log('\n── 5. Zod 入参校验 ──');

  await check('帖子无标题→400', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    const { status, data } = await req('POST', '/posts', { Authorization: `Bearer ${token}` }, JSON.stringify({
      title: '', description: 'test', category: 'other', postType: 'sell', imageUrls: [],
    }));
    return status === 400;
  });

  await check('帖子非法postType→400', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    const { status } = await req('POST', '/posts', { Authorization: `Bearer ${token}` }, JSON.stringify({
      title: 'test', description: 'test', category: 'other', postType: 'invalid_hack', imageUrls: [],
    }));
    return status === 400;
  });

  // ═══ 6. 举报 API ═══
  console.log('\n── 6. 举报 API ──');

  await check('举报正常帖子→200', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    const { status, data } = await req('POST', '/posts/1/report', { Authorization: `Bearer ${token}` }, JSON.stringify({
      reason: '测试举报',
    }));
    return status === 200 || data?.message?.includes('已');
  });

  await check('空举报原因→400', async () => {
    const { data: loginData } = await req('POST', '/auth/dev-login', {}, JSON.stringify({
      studentId: '202330140113', fullName: '周鉦罡', password: 'campuslink',
    }));
    const token = loginData?.data?.token;
    const { status } = await req('POST', '/posts/1/report', { Authorization: `Bearer ${token}` }, JSON.stringify({
      reason: '',
    }));
    return status === 400;
  });

  // ═══ 7. SQL注入尝试 ═══
  console.log('\n── 7. SQL注入防御 ──');

  await check('搜索参数化(防止注入)→200(非500)', async () => {
    const { status } = await req('GET', '/posts?keyword=1%27%3B%20DROP%20TABLE%20users%3B--');
    return status === 200; // 参数化查询，应该正常返回空结果
  });

  await check('帖子ID非数字→400', async () => {
    const { status } = await req('GET', '/posts/1%27%3B%20DROP');
    return status >= 400; // Express params会parse，非数字可能变NaN
  });

  // ═══ 8. 路径遍历 ═══
  console.log('\n── 8. 路径遍历防御 ──');

  await check('API路径穿越被404', async () => {
    const { status } = await req('GET', '/../../../etc/passwd');
    return status === 404;
  });

  // ═══ 9. 安全响应头 ═══
  console.log('\n── 9. 安全响应头 ──');

  await check('X-Content-Type-Options', async () => {
    const h: Record<string, string> = {};
    const r: any = await new Promise((resolve) => {
      const req = http.request({ hostname: H, port: P, path: `${B}/posts?page=1&limit=1`, method: 'GET' }, (res) => {
        resolve(res);
      });
      req.end();
    });
    return r.headers['x-content-type-options'] === 'nosniff';
  });

  await check('X-Frame-Options: DENY', async () => {
    const h: Record<string, string> = {};
    const r: any = await new Promise((resolve) => {
      const req = http.request({ hostname: H, port: P, path: `${B}/posts?page=1&limit=1`, method: 'GET' }, (res) => {
        resolve(res);
      });
      req.end();
    });
    return r.headers['x-frame-options'] === 'DENY';
  });

  // ═══ 10. 缓存控制 ═══
  console.log('\n── 10. API缓存控制 ──');

  await check('API响应Cache-Control: no-cache', async () => {
    const r: any = await new Promise((resolve) => {
      const req = http.request({ hostname: H, port: P, path: `${B}/posts?page=1&limit=1`, method: 'GET' }, (res) => {
        resolve(res);
      });
      req.end();
    });
    return r.headers['cache-control'] === 'no-cache';
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  安全测试完成');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(e => console.error(e));
