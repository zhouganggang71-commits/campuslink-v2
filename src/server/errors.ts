/**
 * 结构化错误码枚举
 * 格式：HTTP 状态码 + 2 位序号，便于客户端按 code 精准判断而非 parse message
 */
export const ErrorCode = {
  // 400 Bad Request
  INVALID_INPUT: 4001,
  VALIDATION_ERROR: 4002,
  DUPLICATE_SUBMISSION: 4003,

  // 404 Not Found
  NOT_FOUND: 4041,
  CIRCLE_POST_NOT_FOUND: 4042,

  // 401 Unauthorized
  UNAUTHORIZED: 4011,
  TOKEN_EXPIRED: 4012,

  // 403 Forbidden
  FORBIDDEN_NOT_VERIFIED: 4031,
  FORBIDDEN_NOT_ADMIN: 4032,

  // 429 Rate Limited
  RATE_LIMITED: 4291,
  DAILY_LIMIT_EXCEEDED: 4292,

  // 500 Internal Server Error
  INTERNAL_ERROR: 5001,
  EXTERNAL_SERVICE_ERROR: 5002,

  // 503 Service Unavailable
  SERVICE_UNAVAILABLE: 5031,
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
