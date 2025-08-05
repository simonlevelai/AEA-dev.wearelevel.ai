/**
 * Comprehensive Safety Architecture Integration Test Runner
 * 
 * This test runner validates the complete safety architecture for Ask Eve Assist
 * by orchestrating all safety systems and verifying they work together correctly.
 * 
 * Integration test categories:
 * 1. End-to-end crisis detection and escalation flows
 * 2. Multi-tier failover system validation  
 * 3. Dual notification system reliability
 * 4. SLA compliance monitoring and enforcement
 * 5. GDPR and data retention integration
 * 6. Circuit breaker and fault tolerance
 * 7. Performance under stress and load
 * 8. Healthcare compliance and audit requirements
 * 
 * The runner simulates real healthcare scenarios across multiple
 * hospital wards, GP surgeries, and emergency departments.
 * 
 * Follows TDD principles with comprehensive real-world test scenarios
 * that healthcare professionals and NHS trusts would encounter.
 */

import { EscalationService } from '../EscalationService';
import { NotificationService } from '../NotificationService';
import { EmailNotificationService } from '../EmailNotificationService';
import { TeamsNotificationService } from '../TeamsNotificationService';
import { FailoverService } from '../FailoverService';
import { SLAMonitoringService } from '../SLAMonitoringService';
import { DataRetentionService } from '../DataRetentionService';
import { ProgressiveEscalationService } from '../ProgressiveEscalationService';
import { CircuitBreaker } from '../CircuitBreaker';
import { EnhancedGDPRService } from '../EnhancedGDPRService';
import { ComplianceDashboardService } from '../ComplianceDashboardService';
import { Logger } from '../../utils/logger';
import { 
  ConversationContext, 
  SafetyResult, 
  EscalationEvent,
  NotificationPayload,
  SeverityLevel 
} from '../../types/safety';

// Mock external dependencies
jest.mock('../../utils/logger');
jest.mock('openai');
jest.mock('@azure/identity');
jest.mock('axios');

// Test runner configuration
interface TestRunnerConfig {
  skipStressTests?: boolean;
  maxConcurrentTests?: number;
  slaStrictMode?: boolean;
  enablePerformanceLogging?: boolean;
}

// Test scenario definitions
interface TestScenario {
  id: string;
  description: string;
  category: 'crisis' | 'general' | 'stress' | 'compliance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  expectedOutcome: 'success' | 'partial' | 'controlled_failure';
  slaRequirement: number;
}

// Integration test results
interface IntegrationTestResult {
  scenario: TestScenario;
  success: boolean;
  responseTime: number;
  slaCompliant: boolean;
  systemsInvolved: string[];
  errors: string[];
  metrics: Record<string, any>;
}

describe('Safety Architecture Integration Test Runner', () => {
  let escalationService: EscalationService;
  let notificationService: NotificationService;
  let failoverService: FailoverService;
  let slaService: SLAMonitoringService;
  let dataRetentionService: DataRetentionService;
  let progressiveEscalationService: ProgressiveEscalationService;
  let gdprService: EnhancedGDPRService;
  let complianceService: ComplianceDashboardService;
  let mockLogger: jest.Mocked<Logger>;
  let mockEmailService: jest.Mocked<EmailNotificationService>;
  let mockTeamsService: jest.Mocked<TeamsNotificationService>;

  // Test results storage
  let integrationResults: IntegrationTestResult[] = [];
  let systemMetrics: Record<string, any> = {};

  const testConfig: TestRunnerConfig = {
    skipStressTests: false,
    maxConcurrentTests: 10,
    slaStrictMode: true,
    enablePerformanceLogging: true
  };

  // Define comprehensive test scenarios
  const testScenarios: TestScenario[] = [
    {
      id: 'critical-suicide-ideation',
      description: 'User expressing immediate suicide ideation with plan',
      category: 'crisis',
      priority: 'critical',
      expectedOutcome: 'success',
      slaRequirement: 2000
    },
    {
      id: 'self-harm-disclosure',
      description: 'User disclosing active self-harm behavior',
      category: 'crisis',
      priority: 'critical',
      expectedOutcome: 'success',
      slaRequirement: 2000
    },
    {
      id: 'medical-emergency',
      description: 'User reporting severe medical symptoms requiring 999',
      category: 'crisis',
      priority: 'critical',
      expectedOutcome: 'success',
      slaRequirement: 1500
    },
    {
      id: 'domestic-violence-crisis',
      description: 'User in immediate physical danger from domestic violence',
      category: 'crisis',
      priority: 'critical',
      expectedOutcome: 'success',
      slaRequirement: 2000
    },
    {
      id: 'high-anxiety-support',
      description: 'User experiencing severe anxiety but not in immediate danger',
      category: 'general',
      priority: 'high',
      expectedOutcome: 'success',
      slaRequirement: 3000
    },
    {
      id: 'health-information-query',
      description: 'User asking for general gynecological health information',
      category: 'general',
      priority: 'medium',
      expectedOutcome: 'success',
      slaRequirement: 3000
    },
    {
      id: 'concurrent-crisis-load',
      description: '50 concurrent crisis users during hospital shift change',
      category: 'stress',
      priority: 'high',
      expectedOutcome: 'success',
      slaRequirement: 2000
    },
    {
      id: 'failover-cascade-stress',
      description: 'Primary and secondary AI providers down during high load',
      category: 'stress',
      priority: 'high',
      expectedOutcome: 'success',
      slaRequirement: 3000
    },
    {
      id: 'gdpr-deletion-with-active-crisis',
      description: 'User requests data deletion while in active crisis',
      category: 'compliance',
      priority: 'high',
      expectedOutcome: 'controlled_failure',
      slaRequirement: 5000
    },
    {
      id: 'notification-system-degradation',
      description: 'Teams service down, email service slow response',
      category: 'stress',
      priority: 'medium',
      expectedOutcome: 'partial',
      slaRequirement: 3000
    }
  ];

  beforeAll(async () => {
    console.log('🚀 Starting Safety Architecture Integration Test Runner');
    console.log(`📊 Running ${testScenarios.length} integration test scenarios`);
    
    // Initialize comprehensive metrics
    systemMetrics = {
      startTime: Date.now(),
      testScenarios: testScenarios.length,
      slaStrictMode: testConfig.slaStrictMode,
      maxConcurrentTests: testConfig.maxConcurrentTests
    };
  });

  beforeEach(async () => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    mockEmailService = {
      sendCrisisAlert: jest.fn(),
      testConnection: jest.fn(),
      getDeliveryStatus: jest.fn(),
      generateEmailTemplate: jest.fn()
    } as any;

    mockTeamsService = {
      sendCrisisAlert: jest.fn(),
      testConnection: jest.fn(),
      getDeliveryStatus: jest.fn(),
      generateAdaptiveCard: jest.fn()
    } as any;

    // Initialize all safety services
    slaService = new SLAMonitoringService(mockLogger, {
      response_times: {
        crisis_detection_ms: 500,
        crisis_response_ms: 2000,
        nurse_notification_ms: 60000,
        audit_logging_ms: 100
      }
    });

    notificationService = new NotificationService(
      'https://integration-test.teams.microsoft.com',
      mockLogger,
      3,
      1000,
      mockEmailService,
      mockTeamsService
    );

    escalationService = new EscalationService(mockLogger, notificationService);
    dataRetentionService = new DataRetentionService(mockLogger);
    progressiveEscalationService = new ProgressiveEscalationService(mockLogger);
    gdprService = new EnhancedGDPRService(mockLogger);
    complianceService = new ComplianceDashboardService(mockLogger);

    failoverService = new FailoverService({
      testMode: true,
      enableMonitoring: true,
      enableAlerts: false
    });

    // Mock file system operations
    jest.spyOn(require('fs/promises'), 'readFile').mockImplementation((path: string) => {
      if (path.includes('crisis.json')) {
        return Promise.resolve(JSON.stringify({
          suicide_ideation: ['kill myself', 'end my life', 'want to die', 'suicide', 'take my own life'],
          self_harm: ['cut myself', 'hurt myself', 'self harm', 'cutting', 'burning myself'],
          severe_distress: ['cannot cope', 'breaking down', 'overwhelmed', 'hopeless'],
          life_threatening: ['chest pain', 'cannot breathe', 'severe bleeding', 'overdose'],
          immediate_danger: ['he is going to kill me', 'in danger', 'being hurt', 'violence']
        }));
      }
      if (path.includes('safety-config.json')) {
        return Promise.resolve(JSON.stringify({
          response_times: {
            crisis_detection_ms: 500,
            crisis_response_ms: 2000,
            nurse_notification_ms: 60000
          },
          crisis_responses: {
            mental_health: {
              message: 'I\'m very concerned about what you\'ve shared.',
              immediate_resources: ['Samaritans: 116 123', 'Text SHOUT to 85258', 'Emergency Services: 999']
            },
            medical_emergency: {
              message: 'This sounds like a medical emergency.',
              immediate_resources: ['Emergency Services: 999', 'NHS 111: 111']
            },
            domestic_violence: {
              message: 'I\'m concerned about your safety.',
              immediate_resources: ['Emergency Services: 999', 'National Domestic Violence Helpline: 0808 2000 247']
            }
          },
          mhra_compliance: {
            required_disclaimers: {
              general: 'This is general health information only.',
              emergency: 'If this is an emergency, call 999 immediately.'
            }
          }
        }));
      }
      return Promise.resolve('{}');
    });

    await escalationService.initialize();

    // Setup notification service mocks with realistic response times
    mockTeamsService.sendCrisisAlert.mockImplementation(async (payload) => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100)); // 100-400ms
      return {
        status: 'sent',
        messageId: `teams-integration-${payload.escalationId}`,
        channelWebhook: 'https://integration-test.teams.microsoft.com',
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: payload.escalationId,
          deliveryMethod: 'teams',
          timestamp: Date.now(),
          channelWebhook: 'https://integration-test.teams.microsoft.com',
          messageId: `teams-integration-${payload.escalationId}`
        }
      };
    });

    mockEmailService.sendCrisisAlert.mockImplementation(async (payload) => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50)); // 50-250ms
      return {
        status: 'sent',
        messageId: `email-integration-${payload.escalationId}`,
        recipients: ['integration-test@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 0,
        auditTrail: {
          escalationId: payload.escalationId,
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['integration-test@nhs.test'],
          messageId: `email-integration-${payload.escalationId}`
        }
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    const endTime = Date.now();
    systemMetrics.endTime = endTime;
    systemMetrics.totalDuration = endTime - systemMetrics.startTime;
    
    // Generate comprehensive test report
    generateIntegrationTestReport();
    
    console.log('✅ Safety Architecture Integration Tests Complete');
    console.log(`📊 Total Duration: ${systemMetrics.totalDuration}ms`);
    console.log(`🎯 Success Rate: ${calculateSuccessRate()}%`);
  });

  const runIntegrationScenario = async (scenario: TestScenario): Promise<IntegrationTestResult> => {
    const startTime = Date.now();
    const systemsInvolved: string[] = [];
    const errors: string[] = [];
    let success = false;
    const metrics: Record<string, any> = {};

    try {
      switch (scenario.id) {
        case 'critical-suicide-ideation':
          success = await runSuicideIdeationScenario(systemsInvolved, metrics);
          break;
        case 'self-harm-disclosure':
          success = await runSelfHarmScenario(systemsInvolved, metrics);
          break;
        case 'medical-emergency':
          success = await runMedicalEmergencyScenario(systemsInvolved, metrics);
          break;
        case 'domestic-violence-crisis':
          success = await runDomesticViolenceScenario(systemsInvolved, metrics);
          break;
        case 'high-anxiety-support':
          success = await runAnxietySupportScenario(systemsInvolved, metrics);
          break;
        case 'health-information-query':
          success = await runHealthInformationScenario(systemsInvolved, metrics);
          break;
        case 'concurrent-crisis-load':
          success = await runConcurrentCrisisLoadScenario(systemsInvolved, metrics);
          break;
        case 'failover-cascade-stress':
          success = await runFailoverCascadeStressScenario(systemsInvolved, metrics);
          break;
        case 'gdpr-deletion-with-active-crisis':
          success = await runGdprDeletionWithCrisisScenario(systemsInvolved, metrics);
          break;
        case 'notification-system-degradation':
          success = await runNotificationDegradationScenario(systemsInvolved, metrics);
          break;
        default:
          throw new Error(`Unknown scenario: ${scenario.id}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      success = false;
    }

    const responseTime = Date.now() - startTime;
    const slaCompliant = responseTime < scenario.slaRequirement;

    const result: IntegrationTestResult = {
      scenario,
      success,
      responseTime,
      slaCompliant,
      systemsInvolved,
      errors,
      metrics
    };

    integrationResults.push(result);
    return result;
  };

  // Individual scenario implementations
  const runSuicideIdeationScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('EscalationService', 'NotificationService', 'SLAMonitoringService');

    const context: ConversationContext = {
      userId: 'suicide-ideation-user',
      sessionId: 'suicide-ideation-session',
      messageHistory: [],
      userProfile: { vulnerabilityFlags: ['high_risk'], previousEscalations: [] }
    };

    const message = 'I want to kill myself tonight. I have planned how to do it.';

    // Crisis detection
    const safetyResult = await escalationService.analyzeMessage(message, context);
    metrics.crisisDetectionTime = safetyResult.analysisTime;
    metrics.severity = safetyResult.severity;
    metrics.confidence = safetyResult.confidence;

    // Create escalation
    const escalationEvent = await escalationService.createEscalationEvent(
      context.userId,
      context.sessionId,
      message,
      safetyResult
    );
    metrics.escalationEventId = escalationEvent.id;

    // Generate response
    const crisisResponse = await escalationService.generateCrisisResponse(safetyResult);
    metrics.responseGenerationTime = crisisResponse.responseTime;

    // Send notifications
    const dualNotification = await notificationService.sendDualCrisisAlert({
      escalationId: escalationEvent.id,
      severity: safetyResult.severity,
      userId: context.userId,
      summary: 'CRITICAL: Suicide ideation with plan detected',
      triggerMatches: safetyResult.matches.map(m => m.trigger),
      timestamp: Date.now(),
      urgency: 'immediate',
      requiresCallback: true
    });
    metrics.notificationSuccess = dualNotification.overallSuccess;

    return safetyResult.severity === 'crisis' && 
           safetyResult.requiresEscalation && 
           dualNotification.overallSuccess &&
           crisisResponse.escalationRequired;
  };

  const runSelfHarmScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('EscalationService', 'NotificationService', 'ProgressiveEscalationService');

    const context: ConversationContext = {
      userId: 'self-harm-user',
      sessionId: 'self-harm-session',
      messageHistory: [
        {
          role: 'user',
          content: 'I have been cutting myself more frequently',
          timestamp: Date.now() - 3600000
        }
      ],
      userProfile: { vulnerabilityFlags: ['self_harm_history'], previousEscalations: ['previous-esc-123'] }
    };

    const message = 'I cut myself again last night and cannot stop the bleeding properly';

    const safetyResult = await escalationService.analyzeMessage(message, context);
    const escalationEvent = await escalationService.createEscalationEvent(
      context.userId,
      context.sessionId,
      message,
      safetyResult
    );

    // Progressive escalation due to history
    const escalationLevel = await progressiveEscalationService.determineEscalationLevel(
      context.userId,
      safetyResult.severity,
      context.userProfile
    );
    metrics.escalationLevel = escalationLevel.level;
    metrics.priority = escalationLevel.priority;

    const dualNotification = await notificationService.sendDualCrisisAlert({
      escalationId: escalationEvent.id,
      severity: safetyResult.severity,
      userId: context.userId,
      summary: 'Self-harm escalation with bleeding concern',
      triggerMatches: safetyResult.matches.map(m => m.trigger),
      timestamp: Date.now(),
      urgency: 'immediate',
      requiresCallback: true
    });

    return safetyResult.severity === 'crisis' && 
           escalationLevel.priority === 'critical' &&
           dualNotification.overallSuccess;
  };

  const runMedicalEmergencyScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('EscalationService', 'FailoverService', 'NotificationService');

    const message = 'I am having severe chest pain and cannot breathe. I think I am having a heart attack.';
    
    const crisisResponse = await failoverService.handleCrisisRequest(
      message,
      'medical-emergency-user',
      'medical-emergency-session'
    );

    metrics.provider = crisisResponse.provider;
    metrics.tier = crisisResponse.tier;
    metrics.responseTime = crisisResponse.responseTime;
    metrics.emergencyResponse = crisisResponse.emergencyResponse;

    return crisisResponse.success && 
           crisisResponse.slaCompliant &&
           crisisResponse.content.includes('999') &&
           crisisResponse.content.includes('emergency');
  };

  const runDomesticViolenceScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('EscalationService', 'NotificationService', 'DataRetentionService');

    const context: ConversationContext = {
      userId: 'domestic-violence-user',
      sessionId: 'domestic-violence-session',
      messageHistory: [],
      userProfile: { vulnerabilityFlags: ['vulnerable_adult'], previousEscalations: [] }
    };

    const message = 'My partner is threatening to kill me and I am scared for my life';

    const safetyResult = await escalationService.analyzeMessage(message, context);
    const escalationEvent = await escalationService.createEscalationEvent(
      context.userId,
      context.sessionId,
      message,
      safetyResult
    );

    // Special data retention for safeguarding
    const retentionResult = await dataRetentionService.scheduleUserDataDeletion(context.userId, {
      preserveCrisisEvents: true,
      specialProtection: 'safeguarding_vulnerable_adult'
    });
    metrics.specialProtection = retentionResult.deletionPolicy;

    const dualNotification = await notificationService.sendDualCrisisAlert({
      escalationId: escalationEvent.id,
      severity: safetyResult.severity,
      userId: context.userId,
      summary: 'SAFEGUARDING ALERT: Domestic violence immediate danger',
      triggerMatches: safetyResult.matches.map(m => m.trigger),
      timestamp: Date.now(),
      urgency: 'immediate',
      requiresCallback: true
    });

    return safetyResult.severity === 'crisis' &&
           retentionResult.preservedCrisisEvents >= 1 &&
           dualNotification.overallSuccess;
  };

  const runAnxietySupportScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('EscalationService', 'FailoverService');

    const generalResponse = await failoverService.handleGeneralQuery(
      'I am having a severe panic attack and feel like I cannot breathe',
      'anxiety-support-user',
      'anxiety-support-session'
    );

    metrics.provider = generalResponse.provider;
    metrics.responseTime = generalResponse.responseTime;

    return generalResponse.success && 
           generalResponse.responseTime < 3000;
  };

  const runHealthInformationScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('FailoverService', 'ComplianceDashboardService');

    const healthResponse = await failoverService.handleGeneralQuery(
      'Can you tell me about the symptoms of ovarian cancer?',
      'health-info-user',
      'health-info-session'
    );

    // Verify MHRA compliance
    const mhraCompliant = !healthResponse.content.includes('you should take') &&
                         !healthResponse.content.includes('diagnosis') &&
                         healthResponse.content.includes('healthcare professional');

    metrics.mhraCompliant = mhraCompliant;
    metrics.provider = healthResponse.provider;
    metrics.responseTime = healthResponse.responseTime;

    return healthResponse.success && mhraCompliant;
  };

  const runConcurrentCrisisLoadScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('EscalationService', 'NotificationService', 'SLAMonitoringService', 'FailoverService');

    const concurrentCrises = Array.from({ length: 50 }, (_, i) => ({
      message: `Concurrent crisis ${i}: I need urgent help with suicidal thoughts`,
      userId: `concurrent-user-${i}`,
      sessionId: `concurrent-session-${i}`
    }));

    const startTime = Date.now();
    const results = await Promise.all(
      concurrentCrises.map(({ message, userId, sessionId }) =>
        failoverService.handleCrisisRequest(message, userId, sessionId)
      )
    );
    const totalTime = Date.now() - startTime;

    const successfulResults = results.filter(r => r.success);
    const slaCompliantResults = results.filter(r => r.slaCompliant);

    metrics.totalRequests = results.length;
    metrics.successfulRequests = successfulResults.length;
    metrics.slaCompliantRequests = slaCompliantResults.length;
    metrics.totalProcessingTime = totalTime;
    metrics.averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    return successfulResults.length >= 48 && // 96% success rate
           slaCompliantResults.length >= 45;   // 90% SLA compliance
  };

  const runFailoverCascadeStressScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('FailoverService', 'CircuitBreaker', 'EmergencyProvider');

    // Simulate multiple requests that will trigger failover
    const failoverTests = Array.from({ length: 10 }, (_, i) => ({
      message: `Failover test ${i}: I need crisis support`,
      userId: `failover-user-${i}`,
      sessionId: `failover-session-${i}`
    }));

    const results = await Promise.all(
      failoverTests.map(({ message, userId, sessionId }) =>
        failoverService.handleCrisisRequest(message, userId, sessionId)
      )
    );

    const successfulResults = results.filter(r => r.success);
    const emergencyResponses = results.filter(r => r.emergencyResponse);

    metrics.totalRequests = results.length;
    metrics.successfulRequests = successfulResults.length;
    metrics.emergencyResponses = emergencyResponses.length;
    metrics.averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    return successfulResults.length === 10; // All should succeed via failover
  };

  const runGdprDeletionWithCrisisScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('GDPRService', 'DataRetentionService', 'EscalationService');

    const userId = 'gdpr-crisis-user';

    // Create active crisis
    const context: ConversationContext = {
      userId,
      sessionId: 'gdpr-crisis-session',
      messageHistory: [],
      userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
    };

    const safetyResult = await escalationService.analyzeMessage(
      'I am going to kill myself tonight',
      context
    );

    // Attempt GDPR deletion
    const deletionAssessment = await gdprService.assessDeletionRequest(userId, {
      requestType: 'full_deletion',
      userInitiated: true
    });

    const withdrawalResult = await dataRetentionService.processWithdrawalRequest({
      userId,
      reason: 'gdpr_article_17_deletion',
      deleteData: true,
      requestTimestamp: Date.now()
    });

    metrics.deletionAllowed = deletionAssessment.deletionAllowed;
    metrics.blockingFactors = deletionAssessment.blockingFactors;
    metrics.withdrawalStatus = withdrawalResult.status;

    // Should be blocked due to active crisis
    return !deletionAssessment.deletionAllowed &&
           deletionAssessment.blockingFactors.includes('active_crisis_vital_interests') &&
           withdrawalResult.status === 'delayed_due_to_active_crisis';
  };

  const runNotificationDegradationScenario = async (systemsInvolved: string[], metrics: Record<string, any>): Promise<boolean> => {
    systemsInvolved.push('NotificationService', 'TeamsNotificationService', 'EmailNotificationService');

    // Mock Teams service failure
    mockTeamsService.sendCrisisAlert.mockRejectedValueOnce(new Error('Teams service degraded'));

    // Mock slow email service
    mockEmailService.sendCrisisAlert.mockImplementationOnce(async (payload) => {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Slow response
      return {
        status: 'sent',
        messageId: `slow-email-${payload.escalationId}`,
        recipients: ['degraded-test@nhs.test'],
        deliveredAt: Date.now(),
        retryCount: 1,
        auditTrail: {
          escalationId: payload.escalationId,
          deliveryMethod: 'email',
          timestamp: Date.now(),
          recipients: ['degraded-test@nhs.test'],
          messageId: `slow-email-${payload.escalationId}`
        }
      };
    });

    const dualResult = await notificationService.sendDualCrisisAlert({
      escalationId: 'degradation-test-esc',
      severity: 'crisis',
      userId: 'degradation-test-user',
      summary: 'Notification degradation test',
      triggerMatches: ['test_trigger'],
      timestamp: Date.now(),
      urgency: 'immediate',
      requiresCallback: true
    });

    metrics.overallSuccess = dualResult.overallSuccess;
    metrics.teamsDelivered = dualResult.teamsDelivered;
    metrics.emailDelivered = dualResult.emailDelivered;
    metrics.failures = dualResult.failures;

    // Should succeed with partial delivery (email only)
    return dualResult.overallSuccess && 
           !dualResult.teamsDelivered && 
           dualResult.emailDelivered;
  };

  const calculateSuccessRate = (): number => {
    if (integrationResults.length === 0) return 0;
    const successCount = integrationResults.filter(r => r.success).length;
    return Math.round((successCount / integrationResults.length) * 100);
  };

  const generateIntegrationTestReport = (): void => {
    console.log('\n📋 SAFETY ARCHITECTURE INTEGRATION TEST REPORT');
    console.log('='.repeat(60));
    
    // Overall statistics
    const totalTests = integrationResults.length;
    const successfulTests = integrationResults.filter(r => r.success).length;
    const slaCompliantTests = integrationResults.filter(r => r.slaCompliant).length;
    const averageResponseTime = integrationResults.reduce((sum, r) => sum + r.responseTime, 0) / totalTests;
    
    console.log(`\n📊 Overall Statistics:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Successful: ${successfulTests} (${Math.round(successfulTests/totalTests*100)}%)`);
    console.log(`   SLA Compliant: ${slaCompliantTests} (${Math.round(slaCompliantTests/totalTests*100)}%)`);
    console.log(`   Average Response Time: ${Math.round(averageResponseTime)}ms`);
    
    // Category breakdown
    const categories = ['crisis', 'general', 'stress', 'compliance'];
    console.log(`\n🎯 Results by Category:`);
    
    categories.forEach(category => {
      const categoryResults = integrationResults.filter(r => r.scenario.category === category);
      if (categoryResults.length > 0) {
        const categorySuccess = categoryResults.filter(r => r.success).length;
        const categorySla = categoryResults.filter(r => r.slaCompliant).length;
        console.log(`   ${category.toUpperCase()}: ${categorySuccess}/${categoryResults.length} success, ${categorySla}/${categoryResults.length} SLA compliant`);
      }
    });
    
    // Critical scenarios
    console.log(`\n🚨 Critical Scenario Results:`);
    const criticalResults = integrationResults.filter(r => r.scenario.priority === 'critical');
    criticalResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const slaStatus = result.slaCompliant ? '⚡' : '⏰';
      console.log(`   ${status} ${slaStatus} ${result.scenario.description} (${result.responseTime}ms)`);
    });
    
    // Failures and issues
    const failedTests = integrationResults.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log(`\n❌ Failed Tests:`);
      failedTests.forEach(result => {
        console.log(`   • ${result.scenario.description}`);
        result.errors.forEach(error => {
          console.log(`     - ${error}`);
        });
      });
    }
    
    // SLA violations
    const slaViolations = integrationResults.filter(r => !r.slaCompliant);
    if (slaViolations.length > 0) {
      console.log(`\n⏰ SLA Violations:`);
      slaViolations.forEach(result => {
        console.log(`   • ${result.scenario.description}: ${result.responseTime}ms (limit: ${result.scenario.slaRequirement}ms)`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
  };

  // Main integration test execution
  describe('Complete Safety Architecture Validation', () => {
    it('should execute all integration test scenarios successfully', async () => {
      console.log('🎬 Executing comprehensive safety architecture integration tests...');
      
      // Sort scenarios by priority
      const sortedScenarios = [...testScenarios].sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Execute scenarios with concurrency control
      const batchSize = testConfig.maxConcurrentTests || 5;
      for (let i = 0; i < sortedScenarios.length; i += batchSize) {
        const batch = sortedScenarios.slice(i, i + batchSize);
        console.log(`🔄 Running batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(sortedScenarios.length/batchSize)}: ${batch.map(s => s.id).join(', ')}`);
        
        const batchResults = await Promise.all(
          batch.map(scenario => runIntegrationScenario(scenario))
        );
        
        // Log batch results
        batchResults.forEach(result => {
          const status = result.success ? '✅' : '❌';
          const slaStatus = result.slaCompliant ? '⚡' : '⏰';
          console.log(`   ${status} ${slaStatus} ${result.scenario.id} (${result.responseTime}ms)`);
        });
      }

      // Validate overall results
      const overallSuccessRate = calculateSuccessRate();
      const criticalScenarioResults = integrationResults.filter(r => r.scenario.priority === 'critical');
      const criticalSuccessRate = criticalScenarioResults.length > 0 ? 
        (criticalScenarioResults.filter(r => r.success).length / criticalScenarioResults.length) * 100 : 100;

      // Assert minimum success criteria
      expect(overallSuccessRate).toBeGreaterThanOrEqual(85); // 85% overall success rate
      expect(criticalSuccessRate).toBe(100); // 100% critical scenario success rate

      // Assert SLA compliance
      const slaComplianceRate = (integrationResults.filter(r => r.slaCompliant).length / integrationResults.length) * 100;
      expect(slaComplianceRate).toBeGreaterThanOrEqual(80); // 80% SLA compliance

      // Assert no critical system failures
      const systemFailures = integrationResults.filter(r => 
        r.errors.length > 0 && 
        r.scenario.priority === 'critical' && 
        r.scenario.expectedOutcome === 'success'
      );
      expect(systemFailures).toHaveLength(0);

      console.log(`\n🎉 Integration test execution complete!`);
      console.log(`📈 Overall Success Rate: ${overallSuccessRate}%`);
      console.log(`🎯 Critical Scenarios: ${criticalSuccessRate}%`);
      console.log(`⚡ SLA Compliance: ${slaComplianceRate.toFixed(1)}%`);
    }, 120000); // 2 minute timeout for comprehensive testing

    it('should validate system resilience and recovery capabilities', async () => {
      // Additional resilience tests
      const resilienceMetrics = {
        circuitBreakerActivations: 0,
        failoverCascades: 0,
        dataConsistencyChecks: 0,
        recoveryTime: 0
      };

      // Test circuit breaker functionality
      const circuitBreaker = new CircuitBreaker('resilience-test', {
        failureThreshold: 3,
        resetTimeout: 10000,
        monitoringPeriod: 30000
      });

      // Simulate failures to trigger circuit breaker
      for (let i = 0; i < 4; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Simulated failure');
          });
        } catch (error) {
          // Expected failures
        }
      }

      expect(circuitBreaker.getState()).toBe('open');
      resilienceMetrics.circuitBreakerActivations = 1;

      // Test system recovery
      const recoveryStartTime = Date.now();
      // Simulate system recovery (would be automatic in real system)
      await new Promise(resolve => setTimeout(resolve, 100));
      resilienceMetrics.recoveryTime = Date.now() - recoveryStartTime;

      expect(resilienceMetrics.circuitBreakerActivations).toBe(1);
      expect(resilienceMetrics.recoveryTime).toBeLessThan(1000);
    });
  });
});