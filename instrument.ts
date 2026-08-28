/**
 * Sentry 初始化 — 必须在所有其他 import 之前加载
 * server.ts 第一行: import "./instrument.ts"
 */
import * as Sentry from "@sentry/node";
import { env } from "./src/server/envSchema";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
  });
}
