import type { Config } from 'jest';
import path from 'path';

const config: Config = {
  // Use node environment for pure TS unit tests (no DOM needed for seqBuffer, jsonDiff, stateMachine)
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          // Use CommonJS for Jest compatibility
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          jsx: 'react-jsx',
          paths: {
            '@/*': ['./*'],
          },
        },
      },
    ],
  },
  testMatch: ['**/src/tests/**/*.test.ts', '**/src/tests/**/*.test.tsx'],
  moduleNameMapper: {
    // Map @/ imports to project root — matches tsconfig paths
    '^@/(.*)$': path.join(__dirname, '$1'),
  },
  // Don't transform node_modules except for ESM packages
  transformIgnorePatterns: [
    '/node_modules/(?!(zustand|immer)/)',
  ],
};

export default config;
