# 🎯 强智教务系统解析 — 接入方案

> **系统确认**：`jw.scpcfe.cn/jwglxt/` — **强智教务管理系统**（Qiangzhi）
> **访问方式**：直接 HTTP 可访问，**不经过 aTrust 网关**
> **认证方式**：传统 Session + 密码登录

---

## 一、强智教务系统的关键结构

### 已知端点（强智系统通用模式）

| 功能 | URL 模式 | 说明 |
|------|---------|------|
| 登录 | `/jwglxt/xtgl/login_slogin.html` | Session 登录页 |
| 课表查询 | `/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151` | 学生课表（JSON 数据） |
| 课表展示 | `/jwglxt/kbcx/xskbcx_cxXsKbIndex.html` | 课表页面 |
| 成绩查询 | `/jwglxt/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005` | 学期成绩 |
| 考试安排 | `/jwglxt/kscx/cxXsks.html?gnmkdm=N346515` | 考试时间表 |
| 个人信息 | `/jwglxt/xsxxxggl/xsgrxxwh_cxXsgrxx.html` | 学生基本信息 |
| 培养方案 | `/jwglxt/pyfa/cxPyfaDg.html` | 培养计划 |

### 核心特征（对对接有帮助）

1. **登录流程**：POST 表单（账号+密码）→ 服务器返回 Session Cookie
2. **数据格式**：课表、成绩等查询结果返回 **JSON**（不是 HTML 页面！）
3. **参数特征**：带了 `gnmkdm` 参数（功能模块代码），部分请求需要 `_t` 时间戳防缓存
4. **Session 管理**：基于 Cookie（`JSESSIONID`），保持连接即可

---

## 二、对接方案

### 🔑 第一步：登录（最核心）

强智系统的登录流程非常标准：

```typescript
// 1. GET 登录页获取 Cookie（初始化 Session）
const initRes = await axios.get('http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html', {
  maxRedirects: 0
});
const cookies = initRes.headers['set-cookie'];

// 2. POST 登录（学号 + 密码）
const loginRes = await axios.post('http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html', 
  new URLSearchParams({
    'yhm': studentId,      // 用户名（学号）
    'mm': password,        // 密码
    'dlfs': '1',           // 登录方式（1=学生）
  }),
  {
    headers: { 
      Cookie: cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0...',
      'Referer': 'http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html',
    },
    maxRedirects: 0,
    validateStatus: s => s < 400
  }
);

// 3. 登录成功 → 拿到已认证的 Cookie
const authCookie = loginRes.headers['set-cookie'] || cookies;
```

**注意**：
- 强智系统可能有验证码，需要先获取验证码图片并识别
- 如果学校关了验证码（很多学校在校园网环境下关闭），则直接密码登录

### 📚 第二步：获取课表数据

强智的课表接口返回 **JSON**，这是最大的好消息——不需要解析 HTML：

```typescript
async function fetchSchedule(authCookie: string[], semesterId?: string) {
  // 获取学期信息
  const xnRes = await axios.post(
    'http://jw.scpcfe.cn/jwglxt/xqxqxg/xqxxx_cxXqxxx.html',
    null,
    { headers: { Cookie: authCookie } }
  );
  const semesters = xnRes.data; // [{xn: "2025-2026", xq: "1", ...}]
  
  // 查询课表
  const scheduleRes = await axios.post(
    'http://jw.scpcfe.cn/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151',
    new URLSearchParams({
      'xnm': '2025',           // 学年（如 2025）
      'xqm': '1',              // 学期（如 1=第一学期）
      'kblx': '0',             // 0=学生个人课表
    }),
    { headers: { Cookie: authCookie } }
  );
  
  // 强智返回的 JSON 结构（示例）：
  // { 
  //   xskbList: [
  //     { kcmc: "大学英语", xm: "李老师", jxdd: "A201", 
  //       xqjmc: "星期一", ksxz: "1", jsz: "1-2节",
  //       ksz: "1", jsz: "18", qsz: "1", zz: "18",
  //       sjkjbz: "0", ... 
  //     },
  //   ]
  // }
  
  return parseScheduleJson(scheduleRes.data.xskbList);
}
```

### 📊 第三步：获取成绩数据

```typescript
async function fetchGrades(authCookie: string[]) {
  // 所有学期的成绩
  const res = await axios.post(
    'http://jw.scpcfe.cn/jwglxt/cjcx/cjcx_cxDgXscj.html?doType=query&gnmkdm=N305005',
    new URLSearchParams({
      'xnm': '',         // 留空 = 所有学年
      'xqm': '',         // 留空 = 所有学期
      'queryModel.showAll': '1',
    }),
    { headers: { Cookie: authCookie } }
  );
  
  return res.data; // JSON 数组
}
```

---

## 三、现有的 CampusLink 代码可以怎么用

### 后端（Node.js）

已有的 `schedule.ts` 中的 HTML 解析器是针对**从教务系统导出 PDF/网页**的场景。但现在有了 JSON 接口，应该**新建一个单独的模块**：

```
src/server/
├── routes/
│   ├── courses.ts          # 现有：课程 CRUD + 批量导入
│   ├── schedule.ts         # 现有：PDF/HTML/OCR 导入
│   └── academic-sync.ts    # 新建：教务系统对接
```

**新模块结构**：

```typescript
// src/server/routes/academic-sync.ts

import axios from 'axios';

// 常量 - 强智教务系统
const JW_BASE = 'http://jw.scpcfe.cn/jwglxt';
const USER_AGENT = 'Mozilla/5.0 CampusLink/1.0';

// 类型定义
interface JwSession {
  cookies: string[];
  studentId: string;
}

interface CourseRecord {
  kcmc: string;      // 课程名称
  xm: string;        // 教师姓名
  jxdd: string;      // 教室
  xqjmc: string;     // 星期几（"星期一"）
  ksxz: string;      // 开始节次（"1"）
  jsz: string;       // 结束节次（"2"）
  qsz: string;       // 开始周（"1"）
  zz: string;        // 结束周（"18"）
  sjkjbz: string;    // 时间标记（"0"=正常, "1"=单周, "2"=双周）
}

// 1. 登录
async function jwLogin(studentId: string, password: string): Promise<JwSession> {
  // ... 实现
}

// 2. 获取课表
async function jwFetchCourses(session: JwSession): Promise<CourseRecord[]> {
  // ... 实现
}

// 3. 转换 + 写入 CampusLink courses 表
async function syncToCampusLink(userId: number, courses: CourseRecord[]) {
  // 将强智格式转换为 CampusLink courses 表格式
  const mapped = courses.map(c => ({
    user_id: userId,
    name: c.kcmc,
    teacher: c.xm,
    classroom: c.jxdd,
    weekday: parseWeekday(c.xqjmc),    // "星期一" → 1
    start_period: parseInt(c.ksxz),
    period_span: parseInt(c.jsz) - parseInt(c.ksxz) + 1,
    week_start: parseInt(c.qsz),
    week_end: parseInt(c.zz),
    week_type: parseWeekType(c.sjkjbz), // "0"→all, "1"→odd, "2"→even
    course_type: 'theory',
  }));
  
  // 调用现有的批量导入（事务）
  await batchImportCourses(userId, mapped);
}
```

### 前端

在 `ScheduleTab.tsx` 中加一个按钮：

```tsx
// 在 ScheduleTab.tsx 的工具栏区域加上
<button onClick={handleSyncFromJw} className="...">
  <RefreshIcon /> 一键同步课表
</button>
```

前端流程：
```
点击"一键同步" 
  → 弹出输入框：学号 + 教务系统密码 
  → POST /api/v1/academic-sync/import 
  → 后端同步完成 
  → 返回{ success: true, count: 12 } 
  → 前端自动刷新课表
```

---

## 四、验证码问题

强智系统可能有验证码。三种情况：

| 情况 | 表现 | 对策 |
|------|------|------|
| ✅ 学校关闭了验证码 | 直接登录，无需验证码 | 最简单，直接实现 |
| ⚠️ 图形验证码 | 登录时需要输入图片中的 4 位数字/字母 | 对接打码平台或本地 OCR |
| ❌ 行为验证码 | 滑块/点选等 | 复杂，需选择替代方案 |

**如果学校有图形验证码**，最简单的方案是：
1. 后端请求验证码图片：`GET /jwglxt/xtgl/login_slogin.html?time=xxx`（页面中通常有一个验证码图片元素）
2. 用 OCR 识别（`@nerdwallet/express-ocr` 或 **PaddleOCR** 本地部署）
3. 或者对接打码平台（打码快，约 1 分钱/次）

**更好的方案**：前端让用户自己填验证码
```tsx
// 前端显示验证码图片，用户手动输入
const captchaUrl = `http://jw.scpcfe.cn/jwglxt/xtgl/login_slogin.html?time=${Date.now()}`;
// 用户输入验证码 + 学号 + 密码 → 一起提交
```

---

## 五、密码安全问题

**原则**：不存密码，用完即弃。

```typescript
// 后端收到请求后
POST /api/v1/academic-sync/import
Body: { studentId, password }

// 处理流程
1. 用 studentId + password 登录教务系统
2. 爬取课表
3. 转存到 CampusLink courses 表
4. 立即销毁 password（不写入任何日志、不存数据库）
5. 返回结果

// 安全措施
- 仅 HTTPS 传输
- 密码只留存在内存中，函数执行完即垃圾回收
- 日志中记录 studentId 但不记录 password
- 每次同步都需要用户重新输入密码（不存 session）
```

---

## 六、实施计划

```
Day 1     ─── 确认验证码情况
             ├── 让学生用浏览器打开 jw.scpcfe.cn/jwglxt/
             └── 截图登录页是否显示验证码

Day 2-4   ─── 实现后端对接模块
             ├── src/server/routes/academic-sync.ts
             ├── 登录 + 课表爬取 + 转换 + 写入
             └── 验证码处理（如有）

Day 5     ─── 前端按钮 + 流程
             ├── ScheduleTab 加"一键同步"按钮
             ├── 学号+密码输入弹窗
             └── 同步进度反馈

Day 6-7   ─── 测试 & 部署
             ├── 用真实账号测试完整流程
             ├── 错误处理（密码错误/网络超时/教务维护）
             └── 部署到生产环境
```

---

## 七、总结

| 之前猜的 | 现在确认的 |
|---------|-----------|
| ❓ 不知道什么教务系统 | ✅ **强智（Qiangzhi）** |
| ❓ 不知道是否经过 aTrust | ✅ **不经 aTrust，直接 HTTP 访问** |
| ❓ 不知道课表是 HTML 还是 JSON | ✅ **返回 JSON，不需要解析 HTML！** |
| ❓ 需要 OCR 处理图片 | ✅ OCR 变次要了，JSON 接口更稳定 |

**最大利好**：强智课表接口返回 JSON 而不是 HTML 页面，这意味着：
- 不需要 `cheerio` 解析 HTML
- 不需要关注页面结构是否变化
- CampusLink 现有 `parseHtmlTable()` 在直连 JSON 时**用不上了**，但可以直接映射 JSON 字段到 courses 表

**下一步**：让学生截图登录页，确认是否有验证码。没验证码的话直接开写代码。
