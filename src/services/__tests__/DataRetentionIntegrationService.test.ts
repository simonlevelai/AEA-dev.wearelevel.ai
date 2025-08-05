import { DataRetentionIntegrationService } from '../DataRetentionIntegrationService';
import { DataRetentionService } from '../DataRetentionService';
import { UserConsentService } from '../UserConsentService';
import { EnhancedGDPRService } from '../EnhancedGDPRService';
import { ComplianceDashboardService } from '../ComplianceDashboardService';
import { SLAMonitoringService } from '../SLAMonitoringService';
import { Logger } from '../../utils/logger';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as unknown as Logger;

describe('DataRetentionIntegrationService - Complete System Integration', () => {
  let integrationService: DataRetentionIntegrationService;
  let mockDataRetentionService: jest.Mocked<DataRetentionService>;
  let mockUserConsentService: jest.Mocked<UserConsentService>;
  let mockGdprService: jest.Mocked<EnhancedGDPRService>;
  let mockDashboardService: jest.Mocked<ComplianceDashboardService>;
  let mockSlaService: jest.Mocked<SLAMonitoringService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mocked dependencies
    mockDataRetentionService = {
      runDailyCleanup: jest.fn(),
      runImmediateCleanup: jest.fn(),
      generateComplianceReport: jest.fn(),
      getStorageMetrics: jest.fn()
    } as any;

    mockUserConsentService = {
      withdrawConsent: jest.fn(),
      getUsersRequiringRenewal: jest.fn(),
      collectConsent: jest.fn(),
      getConsentStatus: jest.fn()
    } as any;

    mockGdprService = {
      processDataErasureRequest: jest.fn(),
      processDataAccessRequest: jest.fn(),
      processDataRectificationRequest: jest.fn()
    } as any;

    mockDashboardService = {
      calculateComplianceScore: jest.fn(),
      generateComplianceAlerts: jest.fn(),
      getRealTimeStorageMetrics: jest.fn()
    } as any;

    mockSlaService = {
      generateSLAComplianceReport: jest.fn(),
      trackCrisisDetection: jest.fn(),
      getActiveAlerts: jest.fn()
    } as any;

    integrationService = new DataRetentionIntegrationService(
      mockLogger,
      mockDataRetentionService,
      mockUserConsentService,
      mockGdprService,
      mockDashboardService,
      mockSlaService
    );
  });

  describe('End-to-End Data Lifecycle Management', () => {
    test('should handle complete user data lifecycle from consent to deletion', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      const userId = 'user-lifecycle-test';
      
      // Mock initial consent collection
      mockUserConsentService.collectConsent.mockResolvedValue({
        success: true,
        consentId: 'consent-123',
        timestamp: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
        requiresParentalConsent: false
      });

      // Mock consent withdrawal and data deletion
      mockUserConsentService.withdrawConsent.mockResolvedValue({
        success: true,
        timestamp: Date.now(),
        dataDeleted: true,
        auditEntry: 'withdrawal-audit-123'
      });

      mockDataRetentionService.runImmediateCleanup.mockResolvedValue({
        success: true,
        deletedUserData: true,
        preservedAuditTrail: true,
        immediateExecution: true
      });

      const result = await integrationService.handleCompleteUserLifecycle({
        userId,
        action: 'complete_deletion',
        reason: 'user_request',
        preserveAuditTrail: true
      });

      expect(result.success).toBe(true);
      expect(result.lifecycleStage).toBe('completed_deletion');
      expect(result.dataDeleted).toBe(true);
      expect(result.auditTrailPreserved).toBe(true);
      expect(result.complianceVerified).toBe(true);
      expect(result.gdprCompliant).toBe(true);
      
      expect(mockUserConsentService.withdrawConsent).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          reason: 'user_request',
          deleteData: true
        })
      );
      
      expect(mockDataRetentionService.runImmediateCleanup).toHaveBeenCalled();
    });

    test('should orchestrate automated cleanup with safety preservation', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      mockDataRetentionService.runDailyCleanup.mockResolvedValue({
        success: true,
        jobType: 'daily_cleanup',
        deletedRecords: 150,
        executedCleanupTasks: ['conversation_logs', 'audit_logs', 'crisis_events'],
        timestamp: Date.now()
      });

      mockSlaService.getActiveAlerts.mockResolvedValue([]);

      const result = await integrationService.orchestrateAutomatedCleanup({
        cleanupType: 'daily',
        preserveSafetyData: true,
        generateReport: true
      });

      expect(result.success).toBe(true);
      expect(result.cleanupCompleted).toBe(true);
      expect(result.safetyDataPreserved).toBe(true);
      expect(result.deletedRecords).toBe(150);
      expect(result.complianceReport).toBeDefined();
      expect(result.alertsGenerated).toBeDefined();
    });
  });

  describe('GDPR Integration with Data Retention', () => {
    test('should coordinate GDPR erasure requests with automated cleanup', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      mockGdprService.processDataErasureRequest.mockResolvedValue({
        success: true,
        requestId: 'gdpr-erasure-123',
        dataDeleted: true,
        auditTrailPreserved: true,
        deletionConfirmation: 'Data deletion completed',
        irreversibleDeletion: true,
        deletedCategories: ['conversation_logs', 'processing_activities'],
        preservedCategories: ['consent_records', 'audit_logs']
      });

      const result = await integrationService.coordinateGDPRErasureWithRetention({
        userId: 'user-gdpr-erasure',
        gdprRequestId: 'gdpr-request-456',
        erasureReason: 'withdrawal_of_consent',
        immediateExecution: true
      });

      expect(result.success).toBe(true);
      expect(result.gdprRequestProcessed).toBe(true);
      expect(result.dataRetentionUpdated).toBe(true);
      expect(result.complianceVerified).toBe(true);
      expect(result.auditTrailComplete).toBe(true);
      expect(result.deletionTimestamp).toBeDefined();
    });

    test('should handle GDPR data access requests with retention context', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      mockGdprService.processDataAccessRequest.mockResolvedValue({
        success: true,
        requestId: 'gdpr-access-123',
        completedWithin72Hours: true,
        exportData: {
          userId: 'user-gdpr-access',
          machineReadable: true,
          structuredFormat: 'json',
          dataCategories: ['conversation_logs', 'consent_records'],
          legalBasisForProcessing: 'consent',
          retentionPeriods: {
            conversation_logs: '30 days',
            consent_records: '7 years'
          }
        },
        processingTime: 12 * 60 * 60 * 1000 // 12 hours
      });

      mockDataRetentionService.getStorageMetrics.mockResolvedValue({
        totalStorageUsed: 1024000,
        dataCategories: {
          conversation_logs: { count: 50, size: 25600 },
          audit_logs: { count: 100, size: 51200 },
          crisis_events: { count: 10, size: 12800 },
          consent_records: { count: 5, size: 6400 }
        },
        oldestRecord: Date.now() - (20 * 24 * 60 * 60 * 1000),
        averageDataAge: 10 * 24 * 60 * 60 * 1000
      });

      const result = await integrationService.handleGDPRAccessWithRetentionContext({
        userId: 'user-gdpr-access',
        gdprRequestId: 'gdpr-access-456',
        includeRetentionMetrics: true,
        includeProjectedDeletion: true
      });

      expect(result.success).toBe(true);
      expect(result.gdprDataExported).toBe(true);
      expect(result.retentionContextIncluded).toBe(true);
      expect(result.projectedDeletionDates).toBeDefined();
      expect(result.dataLifecycleInfo).toBeDefined();
      expect(result.complianceWithRetention).toBe(true);
    });
  });

  describe('Compliance Monitoring Integration', () => {
    test('should provide unified compliance dashboard with all systems', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      mockDashboardService.calculateComplianceScore.mockResolvedValue({
        success: true,
        overallScore: 95,
        categoryScores: {
          dataRetention: 92,
          consentManagement: 96,
          gdprCompliance: 98,
          safetyCompliance: 94
        },
        complianceLevel: 'excellent',
        recommendations: ['Optimize weekly cleanup job scheduling'],
        lastCalculated: Date.now()
      });

      mockDashboardService.getRealTimeStorageMetrics.mockResolvedValue({
        success: true,
        totalStorageUsed: 1024000,
        dataAgeDistribution: { averageAge: 12, oldestRecord: 25 },
        complianceStatus: { withinRetentionPolicy: true, violationCount: 0 },
        categoryBreakdown: [],
        lastUpdated: Date.now()
      });

      const result = await integrationService.getUnifiedComplianceDashboard({
        includeRealTimeMetrics: true,
        includeProjections: true,
        includeSafetyMetrics: true
      });

      expect(result.success).toBe(true);
      expect(result.overallCompliance).toBeDefined();
      expect(result.overallCompliance.score).toBe(95);
      expect(result.dataRetentionStatus).toBeDefined();
      expect(result.gdprComplianceStatus).toBeDefined();
      expect(result.safetyIntegrationStatus).toBeDefined();
      expect(result.realTimeMetrics).toBeDefined();
      expect(result.systemHealthScore).toBeGreaterThanOrEqual(0);
      expect(result.systemHealthScore).toBeLessThanOrEqual(100);
    });

    test('should generate integrated compliance alerts across all systems', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      mockDashboardService.generateComplianceAlerts.mockResolvedValue({
        success: true,
        alerts: [{
          id: 'alert-retention-123',
          category: 'data_retention',
          severity: 'warning',
          message: 'Weekly cleanup job overdue',
          timestamp: Date.now(),
          resolved: false,
          actionRequired: 'Run weekly cleanup manually'
        }],
        criticalAlerts: [],
        warningAlerts: [],
        infoAlerts: [],
        totalCount: 1
      });

      mockSlaService.getActiveAlerts.mockResolvedValue([{
        id: 'sla-alert-456',
        type: 'multiple_sla_violations',
        severity: 'critical',
        timestamp: Date.now(),
        violationCount: 3,
        description: '3 SLA violations in 10 minutes'
      }]);

      const result = await integrationService.generateIntegratedComplianceAlerts({
        includeSafetyAlerts: true,
        includeDataRetentionAlerts: true,
        includeGDPRAlerts: true,
        prioritizeByRisk: true
      });

      expect(result.success).toBe(true);
      expect(result.integratedAlerts).toBeDefined();
      expect(result.integratedAlerts.length).toBeGreaterThan(0);
      expect(result.riskPrioritizedAlerts).toBeDefined();
      expect(result.systemHealthImpact).toBeDefined();
      expect(result.recommendedActions).toBeDefined();
      expect(result.escalationRequired).toBeDefined();
    });
  });

  describe('Content Safety Validation Integration', () => {
    test('should validate content safety during data lifecycle operations', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      const result = await integrationService.validateContentSafetyDuringLifecycle({
        operationType: 'cleanup',
        dataCategories: ['conversation_logs', 'crisis_events'],
        preserveMedicalAccuracy: true,
        validateSourceUrls: true
      });

      expect(result.success).toBe(true);
      expect(result.contentValidationPassed).toBe(true);
      expect(result.medicalAccuracyPreserved).toBe(true);
      expect(result.sourceUrlsValidated).toBe(true);
      expect(result.safetyViolationsDetected).toBe(0);
      expect(result.clinicalContextPreserved).toBe(true);
      expect(result.validationTimestamp).toBeDefined();
    });

    test('should manage content lifecycle with medical disclaimer updates', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      const result = await integrationService.manageContentLifecycleWithSafety({
        contentUpdateType: 'medical_disclaimer',
        affectedCategories: ['conversation_logs', 'audit_logs'],
        propagateUpdates: true,
        validateMedicalAccuracy: true
      });

      expect(result.success).toBe(true);
      expect(result.contentLifecycleManaged).toBe(true);
      expect(result.medicalDisclaimersUpdated).toBe(true);
      expect(result.updatesProagated).toBe(true);
      expect(result.medicalAccuracyValidated).toBe(true);
      expect(result.affectedRecords).toBeGreaterThanOrEqual(0);
      expect(result.managementTimestamp).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle service failures gracefully with rollback capability', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      // Mock a failure scenario
      mockDataRetentionService.runDailyCleanup.mockRejectedValue(new Error('Database connection failed'));

      const result = await integrationService.handleServiceFailureWithRecovery({
        failedService: 'data_retention',
        operationType: 'daily_cleanup',
        enableRollback: true,
        notifyAdministrators: true
      });

      expect(result.success).toBe(false);
      expect(result.failureHandled).toBe(true);
      expect(result.rollbackExecuted).toBe(true);
      expect(result.administratorsNotified).toBe(true);
      expect(result.systemStabilized).toBe(true);
      expect(result.recoveryActions).toBeDefined();
      expect(result.failureTimestamp).toBeDefined();
    });

    test('should maintain data integrity during partial system failures', async () => {
      // RED: This test will fail because DataRetentionIntegrationService doesn't exist yet
      const result = await integrationService.ensureDataIntegrityDuringFailure({
        failureScope: 'partial_cleanup',
        affectedDataCategories: ['conversation_logs'],
        preserveAuditTrail: true,
        validateIntegrity: true
      });

      expect(result.success).toBe(true);
      expect(result.dataIntegrityMaintained).toBe(true);
      expect(result.auditTrailPreserved).toBe(true);
      expect(result.integrityValidationPassed).toBe(true);
      expect(result.corruptionDetected).toBe(false);
      expect(result.recoveryPlanActivated).toBeDefined();
      expect(result.validationTimestamp).toBeDefined();
    });
  });
});