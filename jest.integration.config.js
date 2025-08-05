/**
 * Jest configuration for comprehensive safety systems integration tests
 * 
 * This configuration is optimized for running the complete safety architecture
 * integration test suite for Ask Eve Assist healthcare chatbot.
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test discovery
  roots: ['<rootDir>/src/services/__tests__'],
  testMatch: [
    '**/SafetySystemsIntegration.test.ts',
    '**/DualNotificationStressTest.test.ts', 
    '**/FailoverCascadeStressTest.test.ts',
    '**/SLAPerformanceStressTest.test.ts',
    '**/GDPRIntegrationTest.test.ts',
    '**/SafetyArchitectureIntegrationRunner.test.ts'
  ],
  
  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Test execution
  maxWorkers: 4, // Limit workers for integration tests
  testTimeout: 120000, // 2 minutes for complex integration scenarios
  
  // Coverage reporting
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/services/**/*.d.ts',
    '!src/services/__tests__/**',
    '!src/services/**/mocks/**'
  ],
  
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  
  // Coverage thresholds for integration tests
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85, 
      lines: 85,
      statements: 85
    },
    // Specific thresholds for safety-critical components
    'src/services/EscalationService.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    'src/services/NotificationService.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    'src/services/FailoverService.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Performance and memory
  logHeapUsage: true,
  detectLeaks: true,
  forceExit: true,
  
  // Reporters
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicDir: './coverage/integration',
      filename: 'integration-test-report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'Ask Eve Assist Safety Systems Integration Tests'
    }],
    ['jest-junit', {
      outputDirectory: './coverage/integration',
      outputName: 'integration-junit.xml',
      suiteName: 'Safety Systems Integration Tests'
    }]
  ],
  
  // Global test configuration
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      isolatedModules: true
    }
  },
  
  // Mock configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Verbose output for integration tests
  verbose: true,
  
  // Custom test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    INTEGRATION_TEST_MODE: 'true',
    LOG_LEVEL: 'debug'
  }
};