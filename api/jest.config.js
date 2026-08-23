/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Resolve local file: dep to TypeScript sources (agent/dist is built separately in CI).
    '^umpire-agent$': '<rootDir>/../agent/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/../plugins/**/*.test.ts',
  ],
  clearMocks: true,
}
