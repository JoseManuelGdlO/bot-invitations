export default {
  testEnvironment: "node",
  transform: {},
  setupFiles: ["<rootDir>/tests/helpers/setupEnv.js"],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  collectCoverageFrom: ["src/controllers/**/*.js", "src/services/**/*.js"],
  coverageDirectory: "coverage",
  clearMocks: true,
};
