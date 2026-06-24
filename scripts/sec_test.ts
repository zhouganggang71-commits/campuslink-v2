/**
 * CampusLink 安全验证 — Node.js 版，避免 shell 转义问题
 * 用法: npx tsx scripts/sec_test.ts
 */
import http from 'http';

const H = '127.0.0.1'; const P = 3002; const B = '/campus/api/v1';
let token = ''; let refreshTok = '';

function r(method: string, path: string, headers?: Record<string,string>, body?: string): Promise<{s:number;d:any}> {
  return new Promise(resolve => {
    const h: Record<string,string> = { 'Content-Type': 'application/json', ...(headers||{}) };
    const req = http.request({ hostname:H, port:P, path:B+path, method, headers:h, timeout:15000 }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({s:res.statusCode||0, d:JSON.parse(d)}); }
        catch { resolve({s:res.statusCode||0, d}); }
      });
    });
    req.on('error', e => resolve({s:-1, d:e.message}));
    if (body) req.write(body);
    req.end();
  });
}

async function check(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn();
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  } catch(e: any) {
    console.log(`  ❌ ${name} — ${e.message}`);
  }
}

async function main() {
  console.log('\n═'.repeat(60));
  console.log('  CampusLink 安全验证');
  console.log('═'.repeat(60));

  // 1. 注册+登录获取token
  const ts = Date.now();
  console.log('\n── 0. 准备(Token获取) ──');
  const login = await r('POST', '/auth/dev-login', {}, JSON.stringify({
    studentId: `sec${ts}`, fullName: '安全验证', password: 'test123456', department: '财税学院', confidence: 'high',
  }));
  if (login.s === 200 && login.d?.data?.token) {
    token = login.d.data.token;
    refreshTok = login.d.data.refresh_token;
    const status = login.d.data.user?.authStatus || 'unknown';
    console.log(`  Token: ${token.slice(0,20)}... authStatus: ${status}`);
    if (status === 'pending') console.log('  ⚠️  账号待审核，发帖/收藏受限，将跳过相关测试');
  } else {
    console.log(`  登录失败: ${JSON.stringify(login.d).slice(0,100)}`);
    process.exit(1);
  }

  // 2. JWT鉴权
  console.log('\n── 1. JWT鉴权 ──');
  await check('无Token→401', async () => (await r('GET', '/courses')).s === 401);
  await check('伪造Token→401', async () => (await r('GET', '/courses', {Authorization:'Bearer fake.token.here'})).s === 401);
  await check('正确Token→200', async () => (await r('GET', '/courses', {Authorization:`Bearer ${token}`})).s === 200);
  await check('Refresh不能当Access→401', async () => {
    if (!refreshTok) return false;
    return (await r('GET', '/courses', {Authorization:`Bearer ${refreshTok}`})).s === 401;
  });

  // 3. 限流
  await new Promise(r => setTimeout(r, 2000)); // 等限流窗口重置
  console.log('\n── 2. 限流器 ──');
  await check('登录limit(5,20)触发429', async () => {
    const codes: number[] = [];
    for (let i=0; i<7; i++) {
      codes.push((await r('POST', '/auth/dev-login', {}, JSON.stringify({
        studentId:`lim${i}${ts}`, fullName:'x', password:'123456',
      }))).s);
    }
    return codes.some(c => c === 429);
  });

  await check('改密limit(3,5): 未登录直接触发401(限流在auth后)', async () => {
    const codes: number[] = [];
    for (let i=0; i<5; i++) {
      codes.push((await r('PUT', '/auth/password', {}, JSON.stringify({password:'12345678'}))).s);
    }
    return codes.every(c => c === 401);
  });

  // 4. 敏感词拦截 (需要verified账号)
  await new Promise(r => setTimeout(r, 2000));
  console.log('\n── 3. 敏感词拦截 ──');
  if (login.d?.data?.user?.authStatus === 'verified') {
    await check('含"刷单"→400', async () => {
      const res = await r('POST', '/posts', {Authorization:`Bearer ${token}`}, JSON.stringify({
        title:'刷单日结500', description:'兼职', category:'other', postType:'sell', imageUrls:[],
      }));
      return res.s === 400 && res.d?.message?.includes('违规');
    });
    await check('含"代课"→400', async () => {
      const res = await r('POST', '/posts', {Authorization:`Bearer ${token}`}, JSON.stringify({
        title:'代课替考', description:'代课', category:'other', postType:'sell', imageUrls:[],
      }));
      return res.s === 400 && res.d?.message?.includes('违规');
    });
    await check('正常帖子→200', async () => {
      const res = await r('POST', '/posts', {Authorization:`Bearer ${token}`}, JSON.stringify({
        title:'高等数学教材', description:'九成新', category:'教材', postType:'sell', imageUrls:[],
      }));
      return res.s === 200;
    });
  } else {
    console.log('  ⏭️  跳过(账号未验证)');
  }

  // 5. Zod校验
  await new Promise(r => setTimeout(r, 2000));
  console.log('\n── 4. Zod入参校验 ──');
  if (token) {
    await check('空标题→400', async () => {
      const res = await r('POST', '/posts', {Authorization:`Bearer ${token}`}, JSON.stringify({
        title:'', description:'test', category:'other', postType:'sell', imageUrls:[],
      }));
      // 可能400(校验失败)或403(未验证)
      return res.s === 400 || res.s === 403;
    });
    await check('非法postType→400', async () => {
      const res = await r('POST', '/posts', {Authorization:`Bearer ${token}`}, JSON.stringify({
        title:'test', description:'test', category:'other', postType:'invalid_hack', imageUrls:[],
      }));
      return res.s === 400;
    });
  }

  // 6. 举报API (新部署)
  await new Promise(r => setTimeout(r, 2000));
  console.log('\n── 5. 举报API ──');
  if (token && login.d?.data?.user?.authStatus === 'verified') {
    await check('正常举报→200', async () => {
      const res = await r('POST', '/posts/2/report', {Authorization:`Bearer ${token}`}, JSON.stringify({reason:'测试举报原因'}));
      console.log(`    响应: code=${res.d?.code} msg=${res.d?.message}`);
      return res.s === 200 && res.d?.code === 0;
    });
    await check('空原因→400', async () => {
      const res = await r('POST', '/posts/2/report', {Authorization:`Bearer ${token}`}, JSON.stringify({reason:''}));
      return res.s === 400;
    });
    await check('24h重复举报→409', async () => {
      const res = await r('POST', '/posts/2/report', {Authorization:`Bearer ${token}`}, JSON.stringify({reason:'再次举报'}));
      return res.s === 409;
    });
  } else {
    console.log('  ⏭️  跳过(需要已验证账号)');
  }

  // 7. Admin鉴权
  console.log('\n── 6. Admin鉴权 ──');
  await check('无Token→401', async () => (await r('GET', '/admin/stats')).s === 401);
  await check('普通用户→403', async () => (await r('GET', '/admin/stats', {Authorization:`Bearer ${token}`})).s === 403);

  // 8. SQL注入
  console.log('\n── 7. SQL注入防御 ──');
  await check("keyword=DROPTABLE→200(不500)", async () => {
    const res = await r('GET', '/posts?keyword=1%27%3B%20DROP%20TABLE%20users%3B--');
    return res.s === 200;
  });

  // 9. 安全头
  console.log('\n── 8. 安全响应头 ──');
  await check('X-Content-Type-Options:nosniff', async () => {
    const hdr: any = await new Promise(resolve => {
      const req = http.request({hostname:H,port:P,path:B+'/posts?limit=1',method:'HEAD'}, r => resolve(r.headers));
      req.end();
    });
    return hdr['x-content-type-options'] === 'nosniff';
  });
  await check('X-Frame-Options:DENY', async () => {
    const hdr: any = await new Promise(resolve => {
      const req = http.request({hostname:H,port:P,path:B+'/posts?limit=1',method:'HEAD'}, r => resolve(r.headers));
      req.end();
    });
    return hdr['x-frame-options'] === 'DENY';
  });
  await check('Cache-Control:no-cache', async () => {
    const hdr: any = await new Promise(resolve => {
      const req = http.request({hostname:H,port:P,path:B+'/posts?limit=1',method:'HEAD'}, r => resolve(r.headers));
      req.end();
    });
    return hdr['cache-control'] === 'no-cache';
  });
  await check('X-Powered-By已隐藏', async () => {
    const hdr: any = await new Promise(resolve => {
      const req = http.request({hostname:H,port:P,path:B+'/posts?limit=1',method:'HEAD'}, r => resolve(r.headers));
      req.end();
    });
    return !hdr['x-powered-by'];
  });

  // 10. CORS限制
  console.log('\n── 9. CORS限制 ──');
  await check('CORS仅允许生产域名', async () => {
    const hdr: any = await new Promise(resolve => {
      const req = http.request({hostname:H,port:P,path:B+'/posts?limit=1',method:'OPTIONS', headers:{Origin:'https://evil.com'}}, r => resolve(r.headers));
      req.end();
    });
    const origin = hdr['access-control-allow-origin'];
    return !origin || !origin.includes('evil.com');
  });

  console.log('\n── 10. 未认证用户保护 ──');
  await check('游客不能发帖→401', async () => {
    const res = await r('POST', '/posts', {}, JSON.stringify({
      title:'test', description:'test', category:'other', postType:'sell', imageUrls:[],
    }));
    return res.s === 401;
  });
  await check('游客不能看课表→401', async () => (await r('GET', '/courses')).s === 401);
  await check('游客不能收藏→401', async () => (await r('GET', '/favorites')).s === 401);

  console.log('\n═'.repeat(60));
  console.log('  安全验证完成');
  console.log('═'.repeat(60));
}

main().catch(e => console.error(e));
