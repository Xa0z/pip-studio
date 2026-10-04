import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      MASTER_ENCRYPTION_KEY: 'a'.repeat(64),
      TIKTOK_CLIENT_KEY: 'fake-client-key',
      TIKTOK_CLIENT_SECRET: 'fake-client-secret',
      PUBLIC_BASE_URL: 'https://pip-studio.example.com',
      TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN-not-real',
      TTS_PROVIDER: 'fake',
      TIKTOK_POLL_MS: '1',
    },
    testTimeout: 30000,
    pool: 'forks',
  },
});
