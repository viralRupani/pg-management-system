/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src"],
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  moduleNameMapper: {
    "^@pg/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ],
  },
  testTimeout: 30000,
};
