/**
 * 简易熔断器 — 防止外部依赖故障拖垮本服务
 * 连续 N 次失败后跳闸，停止调用一段时间，到期后半开尝试恢复
 */
import { logger } from '../utils/logger';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitOptions {
  /** 连续失败多少次后跳闸（默认 5） */
  failureThreshold: number;
  /** 跳闸后等待多少毫秒再尝试恢复（默认 30 秒） */
  resetTimeout: number;
  /** 熔断器名称（用于日志标识） */
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly opts: CircuitOptions;

  constructor(opts: Partial<CircuitOptions> = {}) {
    this.opts = {
      failureThreshold: 5,
      resetTimeout: 30000,
      name: 'unnamed',
      ...opts,
    };
  }

  /**
   * 执行请求，熔断状态下直接拒绝
   * @param fn 实际请求函数
   * @param fallback 降级函数（可选）
   */
  async exec<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === 'open') {
      // 检查是否到了重试时间
      if (Date.now() - this.lastFailureTime >= this.opts.resetTimeout) {
        logger.info(`熔断器半开: ${this.opts.name}`, { failures: this.failureCount });
        this.state = 'half-open';
      } else {
        logger.warn(`熔断器阻止请求: ${this.opts.name}`, { failures: this.failureCount });
        if (fallback) return fallback();
        throw new Error(`熔断器已跳闸: ${this.opts.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  private onSuccess() {
    if (this.state === 'half-open') {
      logger.info(`熔断器恢复: ${this.opts.name}`);
    }
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.opts.failureThreshold) {
      logger.error(`熔断器跳闸: ${this.opts.name}`, { failures: this.failureCount });
      this.state = 'open';
    }
  }
}
