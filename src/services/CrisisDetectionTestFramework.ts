import { EscalationService } from './EscalationService';
import { Logger } from '../utils/logger';
import { ConversationContext, SafetyResult, SeverityLevel, TriggerCategory } from '../types/safety';

export interface TestEntity {
  id: string;
  message: string;
  expectedSeverity: SeverityLevel;
  expectedTriggers: string[];
  expectedConfidence: number;
  category: TriggerCategory | 'general_conversation' | 'general_crisis' | 'contextual_escalation';
  description: string;
  contextModifiers?: {
    userProfileFlags?: string[];
    messageHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>;
  };
}

export interface TestResult {
  entityId: string;
  message: string;
  expectedSeverity: SeverityLevel;
  actualSeverity: SeverityLevel;
  expectedConfidence: number;
  actualConfidence: number;
  expectedTriggers: string[];
  actualTriggers: string[];
  passed: boolean;
  failureReason?: string;
  detectionTime: number;
  slaViolation: boolean;
  contextualFactors?: string[];
  failureAnalysis?: {
    severityMismatch: boolean;
    confidenceTooLow: boolean;
    missingTriggers: string[];
    unexpectedTriggers: string[];
    suggestions: string[];
  };
}

export interface TestSuite {
  name: string;
  description: string;
  entities: TestEntity[];
}

export interface TestSuiteResult {
  name: string;
  description: string;
  totalTests: number;
  passed: number;
  failed: number;
  accuracy: number;
  testResults: TestResult[];
  averageDetectionTime: number;
  slaViolations: number;
}

export interface EntityTestResults {
  totalTests: number;
  passed: number;
  failed: number;
  overallAccuracy: number;
  testResults: TestResult[];
  slaViolations: number;
  performanceMetrics: {
    averageDetectionTime: number;
    minDetectionTime: number;
    maxDetectionTime: number;
    slaCompliance: number;
    slaViolations: number;
  };
}

export interface TestSuitesResults {
  totalSuites: number;
  totalTests: number;
  overallAccuracy: number;
  suiteResults: TestSuiteResult[];
  performanceMetrics: {
    averageDetectionTime: number;
    minDetectionTime: number;
    maxDetectionTime: number;
    slaCompliance: number;
    slaViolations: number;
  };
  timestamp: number;
}

export type ExportFormat = 'json' | 'csv' | 'html';

export class CrisisDetectionTestFramework {
  private escalationService: EscalationService;
  private logger: Logger;
  private readonly SLA_DETECTION_LIMIT = 500; // 500ms SLA for crisis detection
  private readonly CONFIDENCE_TOLERANCE = 0.1; // ±0.1 tolerance for confidence matching

  constructor(escalationService: EscalationService, logger: Logger) {
    this.escalationService = escalationService;
    this.logger = logger;
  }

  async runEntityTests(entities: TestEntity[], baseContext: ConversationContext): Promise<EntityTestResults> {
    const testResults: TestResult[] = [];
    let slaViolations = 0;
    const detectionTimes: number[] = [];

    this.logger.info('Starting crisis detection entity tests', {
      totalEntities: entities.length
    });

    for (const entity of entities) {
      try {
        const startTime = Date.now();
        
        // Create context with modifiers if specified
        const testContext = this.createTestContext(baseContext, entity.contextModifiers);
        
        // Run crisis detection
        const result = await this.escalationService.analyzeMessage(entity.message, testContext);
        // Use the analysisTime from the result if available, otherwise use actual time
        const detectionTime = result.analysisTime || (Date.now() - startTime);
        
        detectionTimes.push(detectionTime);
        
        // Check SLA violation
        const slaViolation = detectionTime > this.SLA_DETECTION_LIMIT;
        if (slaViolation) {
          slaViolations++;
          this.logger.warn('Crisis detection SLA violation during testing', {
            entityId: entity.id,
            detectionTime,
            slaLimit: this.SLA_DETECTION_LIMIT
          });
        }

        // Evaluate test result
        const testResult = this.evaluateTestResult(entity, result, detectionTime, slaViolation);
        testResults.push(testResult);

        this.logger.debug('Entity test completed', {
          entityId: entity.id,
          passed: testResult.passed,
          detectionTime,
          actualSeverity: testResult.actualSeverity
        });

      } catch (error) {
        const failedResult: TestResult = {
          entityId: entity.id,
          message: entity.message,
          expectedSeverity: entity.expectedSeverity,
          actualSeverity: 'general',
          expectedConfidence: entity.expectedConfidence,
          actualConfidence: 0,
          expectedTriggers: entity.expectedTriggers,
          actualTriggers: [],
          passed: false,
          failureReason: `Test execution failed: ${(error as Error).message}`,
          detectionTime: 0,
          slaViolation: false
        };
        testResults.push(failedResult);

        this.logger.error('Entity test failed', {
          entityId: entity.id,
          error: (error as Error).message
        });
      }
    }

    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.length - passed;
    const overallAccuracy = testResults.length > 0 ? Math.round((passed / testResults.length) * 100) : 0;

    const performanceMetrics = this.calculatePerformanceMetrics(detectionTimes, slaViolations);

    const results: EntityTestResults = {
      totalTests: testResults.length,
      passed,
      failed,
      overallAccuracy,
      testResults,
      slaViolations,
      performanceMetrics
    };

    this.logger.info('Entity tests completed', {
      totalTests: results.totalTests,
      passed: results.passed,
      failed: results.failed,
      accuracy: results.overallAccuracy,
      slaViolations: results.slaViolations
    });

    return results;
  }

  async runTestSuites(testSuites: TestSuite[], baseContext: ConversationContext): Promise<TestSuitesResults> {
    const suiteResults: TestSuiteResult[] = [];
    let totalTests = 0;
    let totalPassed = 0;
    let totalSlaViolations = 0;
    const allDetectionTimes: number[] = [];

    this.logger.info('Starting test suites execution', {
      totalSuites: testSuites.length
    });

    for (const suite of testSuites) {
      this.logger.info(`Running test suite: ${suite.name}`, {
        totalEntities: suite.entities.length
      });

      const suiteStart = Date.now();
      const entityResults = await this.runEntityTests(suite.entities, baseContext);
      const suiteDuration = Date.now() - suiteStart;

      const suiteResult: TestSuiteResult = {
        name: suite.name,
        description: suite.description,
        totalTests: entityResults.totalTests,
        passed: entityResults.passed,
        failed: entityResults.failed,
        accuracy: entityResults.overallAccuracy,
        testResults: entityResults.testResults,
        averageDetectionTime: entityResults.performanceMetrics.averageDetectionTime,
        slaViolations: entityResults.slaViolations
      };

      suiteResults.push(suiteResult);
      totalTests += entityResults.totalTests;
      totalPassed += entityResults.passed;
      totalSlaViolations += entityResults.slaViolations;
      allDetectionTimes.push(...entityResults.testResults.map(r => r.detectionTime));

      this.logger.info(`Test suite completed: ${suite.name}`, {
        passed: suiteResult.passed,
        failed: suiteResult.failed,
        accuracy: suiteResult.accuracy,
        duration: suiteDuration
      });
    }

    const overallAccuracy = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    const performanceMetrics = this.calculatePerformanceMetrics(allDetectionTimes, totalSlaViolations);

    const results: TestSuitesResults = {
      totalSuites: testSuites.length,
      totalTests,
      overallAccuracy,
      suiteResults,
      performanceMetrics,
      timestamp: Date.now()
    };

    this.logger.info('All test suites completed', {
      totalSuites: results.totalSuites,
      totalTests: results.totalTests,
      overallAccuracy: results.overallAccuracy,
      slaViolations: totalSlaViolations
    });

    return results;
  }

  exportResults(results: EntityTestResults | TestSuitesResults, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      
      case 'csv':
        return this.exportToCsv(results);
      
      case 'html':
        return this.exportToHtml(results);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private createTestContext(baseContext: ConversationContext, modifiers?: TestEntity['contextModifiers']): ConversationContext {
    if (!modifiers) {
      return baseContext;
    }

    const testContext: ConversationContext = { ...baseContext };

    if (modifiers.userProfileFlags && testContext.userProfile) {
      testContext.userProfile.vulnerabilityFlags = modifiers.userProfileFlags;
    }

    if (modifiers.messageHistory) {
      testContext.messageHistory = modifiers.messageHistory;
    }

    return testContext;
  }

  private evaluateTestResult(
    entity: TestEntity,
    result: SafetyResult,
    detectionTime: number,
    slaViolation: boolean
  ): TestResult {
    const actualTriggers = result.matches.map(m => m.trigger);
    
    // Check severity match
    const severityMatch = result.severity === entity.expectedSeverity;
    
    // Check confidence within tolerance (more lenient for low expected confidence)
    const confidenceMatch = entity.expectedConfidence <= 0.2 || 
      Math.abs(result.confidence - entity.expectedConfidence) <= this.CONFIDENCE_TOLERANCE;
    
    // Check if expected triggers are found (or if no triggers are expected)
    const expectedTriggersFound = entity.expectedTriggers.length === 0 || 
      entity.expectedTriggers.every(expectedTrigger =>
        actualTriggers.some(actualTrigger => 
          actualTrigger.toLowerCase().includes(expectedTrigger.toLowerCase()) ||
          expectedTrigger.toLowerCase().includes(actualTrigger.toLowerCase())
        )
      );

    // Overall pass/fail determination
    let passed = severityMatch && confidenceMatch && expectedTriggersFound;
    let failureReason: string | undefined;

    // Generate failure reason
    if (!passed) {
      const reasons: string[] = [];
      
      if (!severityMatch) {
        if (entity.expectedSeverity === 'general' && result.severity === 'crisis') {
          reasons.push('False positive: Expected general, got crisis');
        } else if (entity.expectedSeverity === 'crisis' && result.severity === 'general') {
          reasons.push('False negative: Expected crisis, got general');
        } else {
          reasons.push(`Severity mismatch: expected ${entity.expectedSeverity}, got ${result.severity}`);
        }
      }
      
      if (!confidenceMatch && entity.expectedConfidence > 0.2) {
        reasons.push(`Confidence mismatch: expected ${entity.expectedConfidence}, got ${result.confidence}`);
      }
      
      if (!expectedTriggersFound) {
        const missingTriggers = entity.expectedTriggers.filter(expected =>
          !actualTriggers.some(actual => 
            actual.toLowerCase().includes(expected.toLowerCase()) ||
            expected.toLowerCase().includes(actual.toLowerCase())
          )
        );
        reasons.push(`Missing triggers: ${missingTriggers.join(', ')}`);
      }
      
      failureReason = reasons.join('; ');
    }

    // Generate failure analysis for debugging
    let failureAnalysis: TestResult['failureAnalysis'] | undefined;
    if (!passed) {
      const missingTriggers = entity.expectedTriggers.filter(expected =>
        !actualTriggers.some(actual => actual.toLowerCase().includes(expected.toLowerCase()))
      );
      
      const unexpectedTriggers = actualTriggers.filter(actual =>
        !entity.expectedTriggers.some(expected => expected.toLowerCase().includes(actual.toLowerCase()))
      );

      const suggestions: string[] = [];
      if (missingTriggers.length > 0) {
        suggestions.push(...missingTriggers.map(trigger => `Review trigger patterns for "${trigger}"`));
      }
      if (!severityMatch) {
        suggestions.push(`Review severity classification logic for ${entity.category} category`);
      }
      if (!confidenceMatch) {
        suggestions.push('Review confidence calculation algorithm');
      }

      failureAnalysis = {
        severityMismatch: !severityMatch,
        confidenceTooLow: result.confidence < entity.expectedConfidence - this.CONFIDENCE_TOLERANCE,
        missingTriggers,
        unexpectedTriggers,
        suggestions
      };
    }

    return {
      entityId: entity.id,
      message: entity.message,
      expectedSeverity: entity.expectedSeverity,
      actualSeverity: result.severity,
      expectedConfidence: entity.expectedConfidence,
      actualConfidence: result.confidence,
      expectedTriggers: entity.expectedTriggers,
      actualTriggers,
      passed,
      failureReason,
      detectionTime,
      slaViolation,
      contextualFactors: result.riskFactors,
      failureAnalysis
    };
  }

  private calculatePerformanceMetrics(detectionTimes: number[], slaViolations: number) {
    if (detectionTimes.length === 0) {
      return {
        averageDetectionTime: 0,
        minDetectionTime: 0,
        maxDetectionTime: 0,
        slaCompliance: 100,
        slaViolations: 0
      };
    }

    const averageDetectionTime = Math.round(
      detectionTimes.reduce((sum, time) => sum + time, 0) / detectionTimes.length
    );
    const minDetectionTime = Math.min(...detectionTimes);
    const maxDetectionTime = Math.max(...detectionTimes);
    const slaCompliance = detectionTimes.length > 0 
      ? Math.round(((detectionTimes.length - slaViolations) / detectionTimes.length) * 100)
      : 100;

    return {
      averageDetectionTime,
      minDetectionTime,
      maxDetectionTime,
      slaCompliance,
      slaViolations
    };
  }

  private exportToCsv(results: EntityTestResults | TestSuitesResults): string {
    const headers = [
      'Entity ID',
      'Message',
      'Expected Severity',
      'Actual Severity',
      'Expected Confidence',
      'Actual Confidence',
      'Expected Triggers',
      'Actual Triggers',
      'Passed',
      'Failure Reason',
      'Detection Time (ms)',
      'SLA Violation'
    ];

    const rows: string[][] = [headers];

    const testResults = 'testResults' in results 
      ? results.testResults 
      : results.suiteResults.flatMap(suite => suite.testResults);

    for (const result of testResults) {
      rows.push([
        result.entityId,
        `"${result.message.replace(/"/g, '""')}"`,
        result.expectedSeverity,
        result.actualSeverity,
        result.expectedConfidence.toString(),
        result.actualConfidence.toString(),
        `"${result.expectedTriggers.join(', ')}"`,
        `"${result.actualTriggers.join(', ')}"`,
        result.passed.toString(),
        `"${result.failureReason?.replace(/"/g, '""') || ''}"`,
        result.detectionTime.toString(),
        result.slaViolation.toString()
      ]);
    }

    return rows.map(row => row.join(',')).join('\n');
  }

  private exportToHtml(results: EntityTestResults | TestSuitesResults): string {
    const isTestSuites = 'suiteResults' in results;
    const timestamp = new Date(isTestSuites ? results.timestamp : Date.now()).toISOString();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crisis Detection Test Results</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        h1, h2 {
            color: #333;
        }
        .summary {
            background-color: #f8f9fa;
            padding: 15px;
            border-left: 4px solid #007bff;
            margin-bottom: 20px;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .metric {
            background-color: #fff;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            text-align: center;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
        }
        .metric-label {
            color: #666;
            margin-top: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        .passed {
            background-color: #d4edda;
            color: #155724;
        }
        .failed {
            background-color: #f8d7da;
            color: #721c24;
        }
        .sla-violation {
            background-color: #fff3cd;
            color: #856404;
        }
        .suite-section {
            margin-bottom: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Crisis Detection Test Results</h1>
        <div class="summary">
            <h2>Test Summary</h2>
            <p><strong>Generated:</strong> ${timestamp}</p>
            <p><strong>Total Tests:</strong> ${isTestSuites ? results.totalTests : results.totalTests}</p>
            <p><strong>Overall Accuracy:</strong> ${results.overallAccuracy}%</p>
        </div>

        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${results.overallAccuracy}%</div>
                <div class="metric-label">Overall Accuracy</div>
            </div>
            <div class="metric">
                <div class="metric-value">${results.performanceMetrics.averageDetectionTime}ms</div>
                <div class="metric-label">Average Detection Time</div>
            </div>
            <div class="metric">
                <div class="metric-value">${results.performanceMetrics.slaCompliance}%</div>
                <div class="metric-label">SLA Compliance</div>
            </div>
            <div class="metric">
                <div class="metric-value">${results.performanceMetrics.slaViolations}</div>
                <div class="metric-label">SLA Violations</div>
            </div>
        </div>

        ${isTestSuites ? this.generateSuitesHtml(results) : this.generateEntityResultsHtml(results)}
    </div>
</body>
</html>`;

    return html;
  }

  private generateSuitesHtml(results: TestSuitesResults): string {
    return results.suiteResults.map(suite => `
        <div class="suite-section">
            <h2>${suite.name}</h2>
            <p>${suite.description}</p>
            <p><strong>Tests:</strong> ${suite.totalTests} | <strong>Passed:</strong> ${suite.passed} | <strong>Failed:</strong> ${suite.failed} | <strong>Accuracy:</strong> ${suite.accuracy}%</p>
            ${this.generateTestResultsTable(suite.testResults)}
        </div>
    `).join('');
  }

  private generateEntityResultsHtml(results: EntityTestResults): string {
    return `
        <h2>Test Results</h2>
        ${this.generateTestResultsTable(results.testResults)}
    `;
  }

  private generateTestResultsTable(testResults: TestResult[]): string {
    const rows = testResults.map(result => `
        <tr class="${result.passed ? 'passed' : 'failed'} ${result.slaViolation ? 'sla-violation' : ''}">
            <td>${result.entityId}</td>
            <td>${result.message}</td>
            <td>${result.expectedSeverity}</td>
            <td>${result.actualSeverity}</td>
            <td>${result.expectedConfidence}</td>
            <td>${result.actualConfidence}</td>
            <td>${result.expectedTriggers.join(', ')}</td>
            <td>${result.actualTriggers.join(', ')}</td>
            <td>${result.passed ? '✓' : '✗'}</td>
            <td>${result.failureReason || ''}</td>
            <td>${result.detectionTime}ms</td>
            <td>${result.slaViolation ? '⚠️' : ''}</td>
        </tr>
    `).join('');

    return `
        <table>
            <thead>
                <tr>
                    <th>Entity ID</th>
                    <th>Message</th>
                    <th>Expected Severity</th>
                    <th>Actual Severity</th>
                    <th>Expected Confidence</th>
                    <th>Actual Confidence</th>
                    <th>Expected Triggers</th>
                    <th>Actual Triggers</th>
                    <th>Passed</th>
                    <th>Failure Reason</th>
                    <th>Detection Time</th>
                    <th>SLA Violation</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
  }
}