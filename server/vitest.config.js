import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', env: { LOG_LEVEL: 'silent' }, setupFiles: './src/tests/setup.js', fileParallelism: false, hookTimeout: 30000, testTimeout: 20000 } });
