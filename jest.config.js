/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Keep tests colocated under __tests__ folders next to the code they cover.
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
};
