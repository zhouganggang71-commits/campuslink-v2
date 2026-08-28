import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10_000,
    env: {
      JWT_SECRET: 'test-jwt-unit-test-secret-key-2026',
      ENCRYPTION_KEY: 'test-encryption-key-32chars!!',
      CAMPUSLINK_DB_PW: 'test-db-pw-12chars',
      ADMIN_KEY: 'test-admin-key-16chars!!',
    },
  },
});
