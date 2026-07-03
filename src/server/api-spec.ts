/**
 * OpenAPI 3.1 规范 — CampusLink API
 * 由 /api/v1/openapi.json 端点提供，/api-docs 页面渲染
 */
export const apiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CampusLink API — 四川财经职业学院校园信息平台',
    version: '2.0.0',
    description: '课表查看、二手交易、活动报名、失物招领等校园生活 API',
  },
  servers: [
    { url: '/api/v1', description: '当前服务' },
  ],
  paths: {
    '/auth/dev-login': {
      post: {
        tags: ['认证'],
        summary: '登录/注册',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: { '200': { description: '登录成功，返回 JWT' } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['认证'],
        summary: '刷新 Token',
        responses: { '200': { description: '新 Token' } },
      },
    },
    '/posts': {
      get: {
        tags: ['帖子'],
        summary: '获取帖子列表',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string' }, description: '帖子类型' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['default', 'time', 'hot'] } },
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '关键词搜索' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': {
            description: '帖子列表',
            content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'integer' }, data: { type: 'object', properties: { list: { type: 'array' }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } } } } } },
          },
        },
      },
      post: {
        tags: ['帖子'],
        summary: '发布帖子（需认证）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '发布成功' } },
      },
    },
    '/posts/{id}': {
      get: {
        tags: ['帖子'],
        summary: '帖子详情',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '帖子详情' } },
      },
      delete: {
        tags: ['帖子'],
        summary: '删除帖子（需认证）',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '已删除' } },
      },
    },
    '/favorites/{postId}': {
      post: {
        tags: ['收藏'],
        summary: '切换收藏状态',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '操作结果' } },
      },
    },
    '/courses': {
      get: {
        tags: ['课表'],
        summary: '获取课表（需认证，可选 school_year/school_term 按学期筛选）',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'school_year', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'school_term', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { '200': { description: '课程列表' } },
      },
      post: {
        tags: ['课表'],
        summary: '添加课程（需认证）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '添加成功' } },
      },
    },
    '/courses/terms': {
      get: {
        tags: ['课表'],
        summary: '获取该用户已同步的学年学期列表（需认证）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '学年学期组合列表' } },
      },
    },
    '/courses/batch': {
      put: {
        tags: ['课表'],
        summary: '批量替换课表（事务）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '导入成功' } },
      },
    },
    '/registrations': {
      post: {
        tags: ['报名'],
        summary: '活动报名（需认证+审核通过）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '报名成功' } },
      },
    },
    '/ocr-schedule': {
      post: {
        tags: ['OCR'],
        summary: '课表图片识别（异步，返回 taskId）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'taskId' } },
      },
    },
    '/ocr-schedule/{taskId}': {
      get: {
        tags: ['OCR'],
        summary: '轮询 OCR 识别结果',
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: '识别结果' } },
      },
    },
    '/upload': {
      post: {
        tags: ['文件'],
        summary: '上传文件（需认证）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '文件 URL' } },
      },
    },
    '/admin/stats': {
      get: {
        tags: ['管理'],
        summary: '管理后台统计（管理员）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '统计数据' } },
      },
    },
    '/health': {
      get: {
        tags: ['系统'],
        summary: '健康检查',
        responses: { '200': { description: '服务状态' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      LoginInput: {
        type: 'object',
        required: ['studentId', 'fullName', 'password'],
        properties: {
          studentId: { type: 'string', description: '学号' },
          fullName: { type: 'string', description: '姓名' },
          password: { type: 'string', minLength: 6, maxLength: 100 },
        },
      },
    },
  },
};
