import { jest } from '@jest/globals';

// Mock fetch for NotificationService tests
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test timeout
jest.setTimeout(10000);