/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
  },
  testMatch: ['**/src/**/*.test.ts'],
};
