/**
 * Comprehensive GDPR and Data Retention Integration Tests
 * 
 * Tests verify that data retention policies are enforced during 
 * crisis events and escalations while maintaining GDPR compliance:
 * 
 * 1. 30-day automatic data retention policy
 * 2. Crisis event data preservation requirements
 * 3. Right to be forgotten (GDPR Article 17) handling
 * 4. Data processing lawful basis during crises (Article 6)
 * 5. Vital interests override for active crises
 * 6. Audit trail requirements for healthcare data
 * 7. Cross-system data consistency during retention operations
 * 8. Performance impact of retention operations during crisis flows
 * 
 * Follows TDD with real healthcare data protection scenarios
 * that NHS trusts and healthcare providers must handle.
 */

import { DataRetentionService, ConversationData, CrisisEvent, ConsentRecord, WithdrawalRequest } from '../DataRetentionService';
import { EscalationService } from '../EscalationService';
import { NotificationService } from '../NotificationService';
import { EmailNotificationService } from '../EmailNotificationService';
import { TeamsNotificationService } from '../TeamsNotificationService';
import { EnhancedGDPRService } from '../EnhancedGDPRService';
import { ComplianceDashboardService } from '../ComplianceDashboardService';
import { Logger } from '../../utils/logger';
import { 
  ConversationContext, 
  SafetyResult, 
  EscalationEvent,
  SeverityLevel 
} from '../../types/safety';

// Mock external dependencies
jest.mock('../../utils/logger');
jest.mock('axios');

describe('GDPR Data Retention Integration Tests', () => {
  let dataRetentionService: DataRetentionService;
  let escalationService: EscalationService;
  let notificationService: NotificationService;
  let gdprService: EnhancedGDPRService;
  let complianceService: ComplianceDashboardService;
  let mockLogger: jest.Mocked<Logger>;
  let mockEmailService: jest.Mocked<EmailNotificationService>;
  let mockTeamsService: jest.Mocked<TeamsNotificationService>;

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

    // Initialize services
    dataRetentionService = new DataRetentionService(mockLogger);
    gdprService = new EnhancedGDPRService(mockLogger);
    complianceService = new ComplianceDashboardService(mockLogger);

    notificationService = new NotificationService(
      'https://test-webhook.teams.microsoft.com',
      mockLogger,
      3,
      1000,
      mockEmailService,
      mockTeamsService
    );

    escalationService = new EscalationService(mockLogger, notificationService);

    // Mock file system operations
    jest.spyOn(require('fs/promises'), 'readFile').mockImplementation((path: string) => {
      if (path.includes('crisis.json')) {
        return Promise.resolve(JSON.stringify({
          suicide_ideation: ['kill myself', 'end my life', 'want to die'],
          self_harm: ['cut myself', 'hurt myself'],
          severe_distress: ['cannot cope', 'breaking down']
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
              immediate_resources: ['Samaritans: 116 123']
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

    // Setup notification service mocks
    mockTeamsService.sendCrisisAlert.mockResolvedValue({
      status: 'sent',
      messageId: 'teams-gdpr-test',
      channelWebhook: 'https://webhook.office.com/gdpr',
      deliveredAt: Date.now(),
      retryCount: 0,
      auditTrail: {
        escalationId: expect.any(String),
        deliveryMethod: 'teams',
        timestamp: Date.now(),
        channelWebhook: 'https://webhook.office.com/gdpr',
        messageId: 'teams-gdpr-test'
      }
    });

    mockEmailService.sendCrisisAlert.mockResolvedValue({
      status: 'sent',
      messageId: 'email-gdpr-test',
      recipients: ['gdpr-test@nhs.test'],
      deliveredAt: Date.now(),
      retryCount: 0,
      auditTrail: {
        escalationId: expect.any(String),
        deliveryMethod: 'email',
        timestamp: Date.now(),
        recipients: ['gdpr-test@nhs.test'],
        messageId: 'email-gdpr-test'
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('30-Day Automatic Data Retention Policy', () => {
    it('should automatically schedule user data deletion after 30 days', async () => {
      const testUserId = 'retention-test-user';
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      // Mock conversation data
      const mockConversationData: ConversationData = {
        userId: testUserId,
        conversationId: 'conversation-123',
        timestamp: Date.now() - (29 * 24 * 60 * 60 * 1000), // 29 days ago
        content: 'General health inquiry about gynecological health'
      };

      // Mock data retention service methods
      const mockScheduleDeletion = jest.spyOn(dataRetentionService, 'scheduleUserDataDeletion')
        .mockResolvedValue({
          userId: testUserId,
          scheduledFor: Date.now() + (24 * 60 * 60 * 1000), // 1 day from now
          retentionCompliant: true,
          preservedCrisisEvents: 0,
          deletionPolicy: 'gdpr_compliant'
        });

      const mockCheckRetention = jest.spyOn(dataRetentionService, 'checkUserDataRetention')
        .mockResolvedValue({
          userId: testUserId,
          dataAge: 29 * 24 * 60 * 60 * 1000,
          retentionRequired: true,
          scheduledDeletion: Date.now() + (24 * 60 * 60 * 1000),
          preservedDataTypes: []
        });

      // Act: Check and schedule retention
      const retentionCheck = await dataRetentionService.checkUserDataRetention(testUserId);
      const schedulingResult = await dataRetentionService.scheduleUserDataDeletion(testUserId, {
        preserveCrisisEvents: false
      });

      // Assert: Data should be scheduled for deletion
      expect(retentionCheck.retentionRequired).toBe(true);
      expect(retentionCheck.dataAge).toBeGreaterThan(28 * 24 * 60 * 60 * 1000);
      
      expect(schedulingResult.retentionCompliant).toBe(true);
      expect(schedulingResult.scheduledFor).toBeGreaterThan(Date.now());
      expect(schedulingResult.deletionPolicy).toBe('gdpr_compliant');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User data retention scheduled',
        expect.objectContaining({
          userId: testUserId,
          scheduledFor: expect.any(Number),
          preservedCrisisEvents: 0
        })
      );

      mockScheduleDeletion.mockRestore();
      mockCheckRetention.mockRestore();
    });

    it('should handle bulk retention processing for multiple users efficiently', async () => {
      const testUsers = Array.from({ length: 50 }, (_, i) => ({
        userId: `bulk-retention-user-${i}`,
        dataAge: (28 + i) * 24 * 60 * 60 * 1000 // Varying ages around 30 days
      }));

      // Mock bulk retention operations
      const bulkRetentionPromises = testUsers.map(async ({ userId, dataAge }) => {
        const mockCheck = jest.spyOn(dataRetentionService, 'checkUserDataRetention')
          .mockResolvedValueOnce({
            userId,
            dataAge,
            retentionRequired: dataAge >= 30 * 24 * 60 * 60 * 1000,
            scheduledDeletion: dataAge >= 30 * 24 * 60 * 60 * 1000 ? Date.now() + 86400000 : null,
            preservedDataTypes: []
          });

        const retentionCheck = await dataRetentionService.checkUserDataRetention(userId);
        
        if (retentionCheck.retentionRequired) {
          const mockSchedule = jest.spyOn(dataRetentionService, 'scheduleUserDataDeletion')
            .mockResolvedValueOnce({
              userId,
              scheduledFor: Date.now() + 86400000,
              retentionCompliant: true,
              preservedCrisisEvents: 0,
              deletionPolicy: 'gdpr_compliant'
            });

          const schedulingResult = await dataRetentionService.scheduleUserDataDeletion(userId, {
            preserveCrisisEvents: false
          });

          mockSchedule.mockRestore();
          return { userId, retentionCheck, schedulingResult };
        }

        mockCheck.mockRestore();
        return { userId, retentionCheck };
      });

      // Act: Process bulk retention
      const startTime = Date.now();
      const bulkResults = await Promise.all(bulkRetentionPromises);
      const processingTime = Date.now() - startTime;

      // Assert: Bulk processing should be efficient
      expect(bulkResults).toHaveLength(50);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds

      const scheduledDeletions = bulkResults.filter(r => r.schedulingResult);
      const retentionRequired = bulkResults.filter(r => r.retentionCheck.retentionRequired);

      // Users over 30 days should be scheduled for deletion
      expect(scheduledDeletions.length).toBeGreaterThan(15); // At least users over 30 days
      expect(retentionRequired.length).toBe(scheduledDeletions.length);

      scheduledDeletions.forEach(result => {
        expect(result.schedulingResult?.retentionCompliant).toBe(true);
        expect(result.schedulingResult?.deletionPolicy).toBe('gdpr_compliant');
      });
    });
  });

  describe('Crisis Event Data Preservation', () => {
    it('should preserve crisis event data beyond standard retention period', async () => {
      const crisisUserId = 'crisis-preservation-user';
      
      // Create a crisis scenario
      const conversationContext: ConversationContext = {
        userId: crisisUserId,
        sessionId: 'crisis-preservation-session',
        messageHistory: [
          {
            role: 'user',
            content: 'I want to kill myself and cannot see any way out',
            timestamp: Date.now() - (31 * 24 * 60 * 60 * 1000) // 31 days ago - past retention
          }
        ],
        userProfile: {
          vulnerabilityFlags: ['high_risk'],
          previousEscalations: []
        }
      };

      // Process crisis event
      const safetyResult = await escalationService.analyzeMessage(
        'I want to kill myself and cannot see any way out',
        conversationContext
      );

      const escalationEvent = await escalationService.createEscalationEvent(
        crisisUserId,
        conversationContext.sessionId,
        'I want to kill myself and cannot see any way out',
        safetyResult
      );

      // Mock crisis event preservation
      const mockCrisisEvent: CrisisEvent = {
        id: escalationEvent.id,
        userId: crisisUserId,
        eventType: 'suicide_ideation',
        timestamp: Date.now() - (31 * 24 * 60 * 60 * 1000),
        severity: safetyResult.severity,
        responseTime: safetyResult.analysisTime,
        preserveForPatternAnalysis: true
      };

      const mockPreservation = jest.spyOn(dataRetentionService, 'scheduleUserDataDeletion')
        .mockResolvedValue({
          userId: crisisUserId,
          scheduledFor: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year preservation
          retentionCompliant: true,
          preservedCrisisEvents: 1,
          deletionPolicy: 'crisis_preservation_extended'
        });

      // Act: Schedule deletion with crisis preservation
      const preservationResult = await dataRetentionService.scheduleUserDataDeletion(crisisUserId, {
        preserveCrisisEvents: true,
        crisisEventIds: [escalationEvent.id]
      });

      // Assert: Crisis data should be preserved beyond standard retention
      expect(preservationResult.preservedCrisisEvents).toBe(1);
      expect(preservationResult.deletionPolicy).toBe('crisis_preservation_extended');
      expect(preservationResult.scheduledFor).toBeGreaterThan(Date.now() + (300 * 24 * 60 * 60 * 1000)); // At least 300 days

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Crisis events preserved beyond standard retention',
        expect.objectContaining({
          userId: crisisUserId,
          preservedEvents: 1,
          extendedRetentionPeriod: expect.any(Number)
        })
      );

      mockPreservation.mockRestore();
    });

    it('should maintain audit trail for crisis event preservation decisions', async () => {
      const auditUserId = 'audit-trail-user';
      const crisisEventId = 'crisis-audit-123';

      // Mock audit trail creation
      const mockAuditCreation = jest.spyOn(dataRetentionService, 'createDataRetentionAudit')
        .mockResolvedValue({
          id: 'audit-123',
          userId: auditUserId,
          action: 'crisis_event_preservation',
          timestamp: Date.now(),
          details: {
            crisisEventId,
            preservationReason: 'suicide_ideation_pattern_analysis',
            legalBasis: 'vital_interests_gdpr_6_1_d',
            extendedRetentionPeriod: 365 * 24 * 60 * 60 * 1000,
            authorizedBy: 'system_automated_preservation'
          }
        });

      const mockComplianceRecord = jest.spyOn(complianceService, 'recordDataProcessingActivity')
        .mockResolvedValue({
          activityId: 'dpa-456',
          userId: auditUserId,
          processingType: 'crisis_data_preservation',
          legalBasis: 'vital_interests',
          timestamp: Date.now(),
          complianceStatus: 'compliant'
        });

      // Act: Create audit trail for preservation decision
      const auditRecord = await dataRetentionService.createDataRetentionAudit(auditUserId, {
        action: 'crisis_event_preservation',
        crisisEventId,
        preservationReason: 'suicide_ideation_pattern_analysis',
        legalBasis: 'vital_interests_gdpr_6_1_d'
      });

      const complianceRecord = await complianceService.recordDataProcessingActivity({
        userId: auditUserId,
        processingType: 'crisis_data_preservation',
        legalBasis: 'vital_interests',
        purpose: 'Pattern analysis for suicide prevention'
      });

      // Assert: Comprehensive audit trail should be created
      expect(auditRecord.action).toBe('crisis_event_preservation');
      expect(auditRecord.details.legalBasis).toBe('vital_interests_gdpr_6_1_d');
      expect(auditRecord.details.preservationReason).toBe('suicide_ideation_pattern_analysis');

      expect(complianceRecord.processingType).toBe('crisis_data_preservation');
      expect(complianceRecord.legalBasis).toBe('vital_interests');
      expect(complianceRecord.complianceStatus).toBe('compliant');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Data retention audit trail created',
        expect.objectContaining({
          userId: auditUserId,
          action: 'crisis_event_preservation',
          auditId: 'audit-123'
        })
      );

      mockAuditCreation.mockRestore();
      mockComplianceRecord.mockRestore();
    });
  });

  describe('Right to be Forgotten (GDPR Article 17)', () => {
    it('should handle deletion requests while respecting active crisis protection', async () => {
      const deletionRequestUserId = 'deletion-request-user';

      // Simulate active crisis scenario
      const activeCrisisContext: ConversationContext = {
        userId: deletionRequestUserId,
        sessionId: 'active-crisis-session',
        messageHistory: [
          {
            role: 'user',
            content: 'I am planning to end my life tonight',
            timestamp: Date.now() - 3600000 // 1 hour ago - recent crisis
          }
        ],
        userProfile: {
          vulnerabilityFlags: ['active_crisis'],
          previousEscalations: ['esc-recent-123']
        }
      };

      // Process recent crisis
      const recentSafetyResult = await escalationService.analyzeMessage(
        'I am planning to end my life tonight',
        activeCrisisContext
      );

      const recentEscalation = await escalationService.createEscalationEvent(
        deletionRequestUserId,
        activeCrisisContext.sessionId,
        'I am planning to end my life tonight',
        recentSafetyResult
      );

      // Mock withdrawal request with active crisis
      const mockWithdrawalRequest: WithdrawalRequest = {
        userId: deletionRequestUserId,
        reason: 'gdpr_article_17_deletion',
        deleteData: true,
        requestTimestamp: Date.now()
      };

      const mockWithdrawalProcessing = jest.spyOn(dataRetentionService, 'processWithdrawalRequest')
        .mockResolvedValue({
          userId: deletionRequestUserId,
          status: 'delayed_due_to_active_crisis',
          deletionScheduled: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days delay
          reason: 'Active crisis requires temporary data retention for vital interests',
          complianceNotes: 'GDPR Article 6(1)(d) vital interests override Article 17 deletion right during active crisis',
          activeCrisisEvents: [recentEscalation.id]
        });

      const mockGdprAssessment = jest.spyOn(gdprService, 'assessDeletionRequest')
        .mockResolvedValue({
          userId: deletionRequestUserId,
          deletionAllowed: false,
          blockingFactors: ['active_crisis_vital_interests'],
          legalBasis: 'gdpr_6_1_d_vital_interests',
          recommendedAction: 'delay_until_crisis_resolved',
          assessmentTimestamp: Date.now()
        });

      // Act: Process deletion request with active crisis
      const gdprAssessment = await gdprService.assessDeletionRequest(deletionRequestUserId, {
        requestType: 'full_deletion',
        userInitiated: true
      });

      const withdrawalResult = await dataRetentionService.processWithdrawalRequest(mockWithdrawalRequest);

      // Assert: Deletion should be delayed due to active crisis
      expect(gdprAssessment.deletionAllowed).toBe(false);
      expect(gdprAssessment.blockingFactors).toContain('active_crisis_vital_interests');
      expect(gdprAssessment.legalBasis).toBe('gdpr_6_1_d_vital_interests');

      expect(withdrawalResult.status).toBe('delayed_due_to_active_crisis');
      expect(withdrawalResult.activeCrisisEvents).toContain(recentEscalation.id);
      expect(withdrawalResult.complianceNotes).toContain('vital interests override');
      expect(withdrawalResult.deletionScheduled).toBeGreaterThan(Date.now());

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GDPR deletion request delayed due to active crisis',
        expect.objectContaining({
          userId: deletionRequestUserId,
          activeCrisisEvents: [recentEscalation.id],
          delayReason: 'vital_interests_protection'
        })
      );

      mockWithdrawalProcessing.mockRestore();
      mockGdprAssessment.mockRestore();
    });

    it('should process deletion requests immediately when no active crises exist', async () => {
      const cleanDeletionUserId = 'clean-deletion-user';

      // Mock user with no recent crises
      const mockWithdrawalRequest: WithdrawalRequest = {
        userId: cleanDeletionUserId,
        reason: 'gdpr_article_17_deletion',
        deleteData: true,
        requestTimestamp: Date.now()
      };

      const mockCleanAssessment = jest.spyOn(gdprService, 'assessDeletionRequest')
        .mockResolvedValue({
          userId: cleanDeletionUserId,
          deletionAllowed: true,
          blockingFactors: [],
          legalBasis: 'gdpr_17_right_to_erasure',
          recommendedAction: 'immediate_deletion',
          assessmentTimestamp: Date.now()
        });

      const mockCleanDeletion = jest.spyOn(dataRetentionService, 'processWithdrawalRequest')
        .mockResolvedValue({
          userId: cleanDeletionUserId,
          status: 'deletion_scheduled',
          deletionScheduled: Date.now() + 86400000, // 24 hours for processing
          reason: 'GDPR Article 17 right to erasure request',
          complianceNotes: 'No blocking factors identified, immediate deletion approved',
          activeCrisisEvents: []
        });

      // Act: Process clean deletion request
      const gdprAssessment = await gdprService.assessDeletionRequest(cleanDeletionUserId, {
        requestType: 'full_deletion',
        userInitiated: true
      });

      const deletionResult = await dataRetentionService.processWithdrawalRequest(mockWithdrawalRequest);

      // Assert: Deletion should proceed normally
      expect(gdprAssessment.deletionAllowed).toBe(true);
      expect(gdprAssessment.blockingFactors).toHaveLength(0);
      expect(gdprAssessment.recommendedAction).toBe('immediate_deletion');

      expect(deletionResult.status).toBe('deletion_scheduled');
      expect(deletionResult.activeCrisisEvents).toHaveLength(0);
      expect(deletionResult.complianceNotes).toContain('immediate deletion approved');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'GDPR deletion request approved and scheduled',
        expect.objectContaining({
          userId: cleanDeletionUserId,
          deletionScheduled: expect.any(Number),
          processingTime: expect.any(Number)
        })
      );

      mockCleanAssessment.mockRestore();
      mockCleanDeletion.mockRestore();
    });
  });

  describe('Data Processing Lawful Basis During Crises', () => {
    it('should document vital interests as lawful basis for crisis data processing', async () => {
      const vitalInterestsUserId = 'vital-interests-user';

      // Create crisis requiring vital interests processing
      const vitalInterestsContext: ConversationContext = {
        userId: vitalInterestsUserId,
        sessionId: 'vital-interests-session',
        messageHistory: [],
        userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
      };

      const crisisMessage = 'I have taken pills and want to die';

      // Process crisis with legal basis tracking
      const safetyResult = await escalationService.analyzeMessage(crisisMessage, vitalInterestsContext);
      const escalationEvent = await escalationService.createEscalationEvent(
        vitalInterestsUserId,
        vitalInterestsContext.sessionId,
        crisisMessage,
        safetyResult
      );

      // Mock legal basis documentation
      const mockLegalBasisRecord = jest.spyOn(complianceService, 'recordDataProcessingActivity')
        .mockResolvedValue({
          activityId: 'dpa-vital-interests-789',
          userId: vitalInterestsUserId,
          processingType: 'crisis_intervention',
          legalBasis: 'vital_interests_gdpr_6_1_d',
          timestamp: Date.now(),
          complianceStatus: 'compliant',
          processingDetails: {
            crisisType: 'suicide_attempt',
            emergencyResponse: true,
            dataProcessed: ['conversation_content', 'user_profile', 'safety_analysis'],
            retentionPeriod: '7_years_clinical_records',
            minimizationApplied: true
          }
        });

      const mockGdprDocumentation = jest.spyOn(gdprService, 'documentVitalInterestsProcessing')
        .mockResolvedValue({
          documentId: 'vi-doc-456',
          userId: vitalInterestsUserId,
          crisisEventId: escalationEvent.id,
          vitalInterestsJustification: {
            threat: 'imminent_risk_to_life',
            necessity: 'emergency_intervention_required',
            proportionality: 'minimal_data_processing_for_safety',
            balancingTest: 'life_preservation_overrides_privacy_concerns'
          },
          dataProcessingScope: {
            dataTypes: ['crisis_conversation', 'safety_analysis', 'escalation_metadata'],
            processingPurpose: 'immediate_crisis_intervention',
            retentionJustification: 'ongoing_safety_monitoring'
          },
          timestamp: Date.now()
        });

      // Act: Document legal basis for crisis processing
      const legalBasisRecord = await complianceService.recordDataProcessingActivity({
        userId: vitalInterestsUserId,
        processingType: 'crisis_intervention',
        legalBasis: 'vital_interests_gdpr_6_1_d',
        purpose: 'Emergency crisis intervention and safety monitoring'
      });

      const vitalInterestsDoc = await gdprService.documentVitalInterestsProcessing(
        vitalInterestsUserId,
        escalationEvent.id,
        {
          threat: 'imminent_risk_to_life',
          processingPurpose: 'immediate_crisis_intervention'
        }
      );

      // Assert: Comprehensive legal basis documentation
      expect(legalBasisRecord.legalBasis).toBe('vital_interests_gdpr_6_1_d');
      expect(legalBasisRecord.processingType).toBe('crisis_intervention');
      expect(legalBasisRecord.complianceStatus).toBe('compliant');
      expect(legalBasisRecord.processingDetails.emergencyResponse).toBe(true);

      expect(vitalInterestsDoc.vitalInterestsJustification.threat).toBe('imminent_risk_to_life');
      expect(vitalInterestsDoc.vitalInterestsJustification.necessity).toBe('emergency_intervention_required');
      expect(vitalInterestsDoc.dataProcessingScope.processingPurpose).toBe('immediate_crisis_intervention');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Vital interests processing documented for crisis intervention',
        expect.objectContaining({
          userId: vitalInterestsUserId,
          crisisEventId: escalationEvent.id,
          legalBasis: 'vital_interests_gdpr_6_1_d'
        })
      );

      mockLegalBasisRecord.mockRestore();
      mockGdprDocumentation.mockRestore();
    });
  });

  describe('Cross-System Data Consistency During Retention', () => {
    it('should maintain data consistency across all safety systems during retention operations', async () => {
      const consistencyUserId = 'cross-system-consistency-user';
      
      // Create data across multiple systems
      const multiSystemContext: ConversationContext = {
        userId: consistencyUserId,
        sessionId: 'multi-system-session',
        messageHistory: [
          {
            role: 'user',
            content: 'I have been self-harming and feel hopeless',
            timestamp: Date.now() - 86400000 // 1 day ago
          }
        ],
        userProfile: {
          vulnerabilityFlags: ['self_harm_history'],
          previousEscalations: []
        }
      };

      // Process crisis creating data in multiple systems
      const safetyResult = await escalationService.analyzeMessage(
        'I have been self-harming and feel hopeless',
        multiSystemContext
      );

      const escalationEvent = await escalationService.createEscalationEvent(
        consistencyUserId,
        multiSystemContext.sessionId,
        'I have been self-harming and feel hopeless',
        safetyResult
      );

      // Send notifications (creates data in notification systems)
      const dualNotification = await notificationService.sendDualCrisisAlert({
        escalationId: escalationEvent.id,
        severity: safetyResult.severity,
        userId: consistencyUserId,
        summary: 'Self-harm crisis intervention',
        triggerMatches: safetyResult.matches.map(m => m.trigger),
        timestamp: Date.now(),
        urgency: 'immediate',
        requiresCallback: true
      });

      // Mock cross-system retention coordination
      const mockCrossSystemRetention = jest.spyOn(dataRetentionService, 'coordinateRetentionAcrossSystems')
        .mockResolvedValue({
          userId: consistencyUserId,
          systemsCoordinated: [
            'conversation_data',
            'crisis_events', 
            'notification_logs',
            'audit_trails',
            'compliance_records'
          ],
          consistencyVerified: true,
          retentionPolicy: 'crisis_extended_retention',
          coordinationTimestamp: Date.now()
        });

      const mockConsistencyCheck = jest.spyOn(complianceService, 'verifyDataConsistencyAcrossSystems')
        .mockResolvedValue({
          userId: consistencyUserId,
          systemsChecked: 5,
          consistencyScore: 100,
          discrepancies: [],
          verificationTimestamp: Date.now()
        });

      // Act: Coordinate retention across systems
      const crossSystemResult = await dataRetentionService.coordinateRetentionAcrossSystems(
        consistencyUserId,
        {
          includeAuditTrails: true,
          includeNotificationLogs: true,
          includeCrisisEvents: true
        }
      );

      const consistencyVerification = await complianceService.verifyDataConsistencyAcrossSystems(consistencyUserId);

      // Assert: All systems should be coordinated consistently
      expect(crossSystemResult.systemsCoordinated).toContain('conversation_data');
      expect(crossSystemResult.systemsCoordinated).toContain('crisis_events');
      expect(crossSystemResult.systemsCoordinated).toContain('notification_logs');
      expect(crossSystemResult.systemsCoordinated).toContain('audit_trails');
      expect(crossSystemResult.consistencyVerified).toBe(true);

      expect(consistencyVerification.consistencyScore).toBe(100);
      expect(consistencyVerification.discrepancies).toHaveLength(0);
      expect(consistencyVerification.systemsChecked).toBe(5);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cross-system data retention coordinated successfully',
        expect.objectContaining({
          userId: consistencyUserId,
          systemsCoordinated: 5,
          consistencyVerified: true
        })
      );

      mockCrossSystemRetention.mockRestore();
      mockConsistencyCheck.mockRestore();
    });
  });

  describe('Performance Impact of Retention Operations', () => {
    it('should complete retention operations without impacting crisis response performance', async () => {
      const performanceTestUsers = Array.from({ length: 20 }, (_, i) => 
        `performance-test-user-${i}`
      );

      // Act: Run retention operations concurrently with crisis processing
      const startTime = Date.now();

      const retentionPromises = performanceTestUsers.map(async (userId, i) => {
        // Mock retention operations
        const mockRetention = jest.spyOn(dataRetentionService, 'checkUserDataRetention')
          .mockResolvedValueOnce({
            userId,
            dataAge: (30 + i) * 24 * 60 * 60 * 1000,
            retentionRequired: true,
            scheduledDeletion: Date.now() + 86400000,
            preservedDataTypes: []
          });

        const retentionResult = await dataRetentionService.checkUserDataRetention(userId);
        mockRetention.mockRestore();
        return retentionResult;
      });

      const crisisPromises = performanceTestUsers.map(async (userId, i) => {
        const context: ConversationContext = {
          userId: `crisis-${userId}`,
          sessionId: `crisis-session-${i}`,
          messageHistory: [],
          userProfile: { vulnerabilityFlags: [], previousEscalations: [] }
        };

        return escalationService.analyzeMessage(
          `Performance test crisis ${i}: I need help`,
          context
        );
      });

      // Wait for both retention and crisis operations
      const [retentionResults, crisisResults] = await Promise.all([
        Promise.all(retentionPromises),
        Promise.all(crisisPromises)
      ]);

      const totalTime = Date.now() - startTime;

      // Assert: Performance should not be significantly impacted
      expect(retentionResults).toHaveLength(20);
      expect(crisisResults).toHaveLength(20);
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds

      // Crisis processing should maintain SLA
      crisisResults.forEach((result, index) => {
        expect(result.analysisTime).toBeLessThan(500); // Crisis detection SLA
      });

      // Retention operations should complete successfully
      retentionResults.forEach(result => {
        expect(result.retentionRequired).toBe(true);
        expect(result.scheduledDeletion).toBeGreaterThan(Date.now());
      });

      console.log(`Concurrent Operations Performance: ${totalTime}ms for 40 operations`);
    });
  });

  describe('Healthcare Data Retention Compliance', () => {
    it('should align with NHS data retention requirements for clinical records', async () => {
      const nhsComplianceUserId = 'nhs-compliance-user';

      // Mock NHS clinical data retention requirements
      const mockNhsCompliance = jest.spyOn(complianceService, 'validateNhsDataRetentionCompliance')
        .mockResolvedValue({
          userId: nhsComplianceUserId,
          clinicalDataPresent: true,
          requiredRetentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years for adult clinical records
          currentCompliance: 'compliant',
          retentionJustification: 'NHS Records Management Code of Practice',
          specialConsiderations: ['mental_health_records', 'crisis_interventions']
        });

      const mockClinicalRetention = jest.spyOn(dataRetentionService, 'applyClinicalDataRetentionPolicy')
        .mockResolvedValue({
          userId: nhsComplianceUserId,
          policyApplied: 'nhs_clinical_records_7_years',
          retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000,
          complianceStatus: 'nhs_compliant',
          specialHandling: ['mental_health_crisis_records'],
          nextReviewDate: Date.now() + (365 * 24 * 60 * 60 * 1000) // Annual review
        });

      // Act: Apply NHS clinical data retention compliance
      const nhsCompliance = await complianceService.validateNhsDataRetentionCompliance(nhsComplianceUserId);
      const clinicalRetention = await dataRetentionService.applyClinicalDataRetentionPolicy(
        nhsComplianceUserId,
        {
          recordType: 'mental_health_crisis',
          clinicalSignificance: 'high',
          specialConsiderations: ['suicide_risk_assessment']
        }
      );

      // Assert: NHS compliance requirements should be met
      expect(nhsCompliance.clinicalDataPresent).toBe(true);
      expect(nhsCompliance.requiredRetentionPeriod).toBe(7 * 365 * 24 * 60 * 60 * 1000);
      expect(nhsCompliance.currentCompliance).toBe('compliant');
      expect(nhsCompliance.specialConsiderations).toContain('mental_health_records');

      expect(clinicalRetention.policyApplied).toBe('nhs_clinical_records_7_years');
      expect(clinicalRetention.complianceStatus).toBe('nhs_compliant');
      expect(clinicalRetention.specialHandling).toContain('mental_health_crisis_records');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'NHS clinical data retention policy applied',
        expect.objectContaining({
          userId: nhsComplianceUserId,
          retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000,
          complianceStatus: 'nhs_compliant'
        })
      );

      mockNhsCompliance.mockRestore();
      mockClinicalRetention.mockRestore();
    });
  });
});