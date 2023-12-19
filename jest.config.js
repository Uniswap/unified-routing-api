const ts_preset = require('ts-jest/jest-preset');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...ts_preset,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['bin', 'dist'],
  collectCoverageFrom: ['**/*.ts', '!**/build/**', '!**/node_modules/**', '!**/dist/**', '!**/bin/**'],
  transform: {
    // Use swc to speed up ts-jest's sluggish compilation times.
    // Using this cuts the initial time to compile from 6-12 seconds to
    // ~1 second consistently.
    // Inspiration from: https://github.com/kulshekhar/ts-jest/issues/259#issuecomment-1332269911
    //
    // https://swc.rs/docs/usage/jest#usage
    '^.+\\.(t|j)s?$': '@swc/jest',
  },
};
