import { 
  FailoverManager, 
  ProviderHealth, 
  FailoverResult, 
  FailoverConfig 
} from './FailoverManager';
import { 
  OpenAIProvider, 
  AzureOpenAIProvider, 
  AnthropicProvider, 
  EmergencyProvider,
  AIProvider,
  ProviderConfig
} from './AIProvider';
import { EnhancedMonitoringService, AlertConfig } from './EnhancedMonitoringService';
import { SLAMonitoringService } from './SLAMonitoringService';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface FailoverServiceConfig {
  configPath?: string;
  enableMonitoring?: boolean;
  enableAlerts?: boolean;
  testMode?: boolean;
}

export interface CrisisResponse {
  success: boolean;
  content: string;
  provider: string;
  tier: number;
  responseTime: number;
  slaCompliant: boolean;
  emergencyResponse?: boolean;
  humanEscalationRequired?: boolean;
}

/**
 * Comprehensive failover service that integrates all failover and monitoring components
 * for the Ask Eve Assist healthcare chatbot.
 */
export class FailoverService {
  private failoverManager: FailoverManager;
  private monitoringService?: EnhancedMonitoringService;
  private slaService: SLAMonitoringService;
  private notificationService?: NotificationService;
  
  private readonly config: FailoverServiceConfig;
  private readonly failoverConfig: FailoverConfig;
  private readonly providers: AIProvider[] = [];

  constructor(config: FailoverServiceConfig = {}) {
    this.config = {
      configPath: config.configPath || 'config/failover-config.json',
      enableMonitoring: config.enableMonitoring ?? true,
      enableAlerts: config.enableAlerts ?? true,
      testMode: config.testMode ?? false,
      ...config
    };

    // Load configuration
    const configData = this.loadConfiguration();
    
    // Initialize failover configuration
    this.failoverConfig = {
      timeoutMs: configData.failover.slaLimitMs,
      maxRetries: configData.failover.maxRetries,
      circuitBreakerThreshold: configData.failover.circuitBreakerThreshold,
      circuitBreakerResetTimeout: configData.failover.circuitBreakerResetTimeout,
      emergencyResponsesEnabled: configData.failover.emergencyResponsesEnabled,
      slaMonitoringEnabled: configData.failover.slaMonitoringEnabled
    };

    // Initialize providers
    this.initializeProviders(configData);
    
    // Initialize SLA monitoring
    this.slaService = new SLAMonitoringService(
      logger,
      this.loadSafetyConfig()
    );

    // Initialize failover manager
    this.failoverManager = new FailoverManager(this.providers, this.failoverConfig);

    // Initialize monitoring if enabled
    if (this.config.enableMonitoring) {
      this.initializeMonitoring(configData);
    }

    // Initialize notifications if enabled
    if (this.config.enableAlerts) {
      this.initializeNotifications(configData);
    }

    logger.info('FailoverService initialized successfully', {
      providers: this.providers.length,
      monitoring: !!this.monitoringService,
      alerts: !!this.notificationService,
      testMode: this.config.testMode
    });
  }

  /**
   * Handle a crisis request with full failover and monitoring
   */
  async handleCrisisRequest(
    query: string, 
    userId: string,
    conversationId: string
  ): Promise<CrisisResponse> {
    const startTime = Date.now();
    
    logger.info('Handling crisis request', {
      userId,
      conversationId,
      queryLength: query.length
    });

    try {
      // Track crisis detection timing
      const detectionStartTime = Date.now();
      this.slaService.trackCrisisDetection(
        userId, 
        detectionStartTime, 
        Date.now() - detectionStartTime
      );

      // Make request through failover manager
      const result = await this.failoverManager.makeRequest(query, { type: 'crisis' });
      const responseTime = Date.now() - startTime;

      // Track crisis response timing
      this.slaService.trackCrisisResponse(
        conversationId,
        { 
          shouldEscalate: true, 
          severity: 'crisis' as const,
          escalationType: 'self_harm'
        },
        responseTime
      );

      // Log crisis response handling
      logger.info('Crisis request handled', {
        userId,
        conversationId,
        success: result.success,
        provider: result.provider,
        tier: result.tier,
        responseTime,
        slaCompliant: !result.slaViolation,
        failoverUsed: result.tier > 1
      });

      // Check if human escalation is required
      const humanEscalationRequired = !result.success || result.humanEscalation;
      if (humanEscalationRequired) {
        await this.escalateToHuman(userId, conversationId, query, result);
      }

      return {
        success: result.success,
        content: result.response?.content || 'Unable to provide response. Please contact emergency services immediately.',
        provider: result.provider,
        tier: result.tier,
        responseTime,
        slaCompliant: !result.slaViolation,
        emergencyResponse: result.emergencyResponse,
        humanEscalationRequired
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Crisis request failed completely', {
        userId,
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });

      // Always escalate failed crisis requests
      await this.escalateToHuman(userId, conversationId, query, {
        success: false,
        error: 'Complete system failure',
        provider: 'none',
        tier: 0,
        responseTime,
        humanEscalation: true
      });

      return {
        success: false,
        content: 'I\'m experiencing technical difficulties. Please call 999 for emergency services or contact Samaritans at 116 123 immediately.',
        provider: 'none',
        tier: 0,
        responseTime,
        slaCompliant: false,
        humanEscalationRequired: true
      };
    }
  }

  /**
   * Handle a general health query with failover
   */
  async handleGeneralQuery(
    query: string,
    userId: string,
    conversationId: string
  ): Promise<{
    success: boolean;
    content: string;
    provider: string;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      const result = await this.failoverManager.makeRequest(query, { type: 'general' });
      const responseTime = Date.now() - startTime;

      logger.info('General query handled', {
        userId,
        conversationId,
        success: result.success,
        provider: result.provider,
        tier: result.tier,
        responseTime,
        failoverUsed: result.tier > 1
      });

      return {
        success: result.success,
        content: result.response?.content || 'I\'m unable to provide a response right now. Please try again or contact a healthcare professional.',
        provider: result.provider,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('General query failed', {
        userId,
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      });

      return {
        success: false,
        content: 'I\'m experiencing technical difficulties. Please contact your GP or visit eveappeal.org.uk for health information.',
        provider: 'none',
        responseTime
      };
    }
  }

  /**
   * Get real-time system health status
   */
  async getSystemHealth(): Promise<{
    overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    providers: ProviderHealth[];
    slaCompliance: number;
    activeAlerts: number;
  }> {
    const providerHealth = await this.failoverManager.getHealthStatus();
    const slaStatus = this.slaService.getRealTimeSLAStatus();
    
    const healthyProviders = providerHealth.filter(p => p.healthy).length;
    const totalProviders = providerHealth.length;
    
    let overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    if (healthyProviders === totalProviders && slaStatus.overallCompliance >= 99.0) {
      overall = 'HEALTHY';
    } else if (healthyProviders >= totalProviders - 1 && slaStatus.overallCompliance >= 95.0) {
      overall = 'DEGRADED';
    } else {
      overall = 'CRITICAL';
    }

    return {
      overall,
      providers: providerHealth,
      slaCompliance: slaStatus.overallCompliance,
      activeAlerts: slaStatus.activeAlertsCount
    };
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics() {
    const failoverMetrics = this.failoverManager.getFailoverMetrics();
    const slaReport = this.slaService.generateSLAComplianceReport(3600000); // Last hour

    return {
      failover: failoverMetrics,
      sla: slaReport,
      timestamp: Date.now()
    };
  }

  /**
   * Test all failover tiers
   */
  async testFailoverTiers(): Promise<{
    tier: number;
    provider: string;
    healthy: boolean;
    responseTime: number;
  }[]> {
    logger.info('Testing all failover tiers');

    const results = [];
    const providers = await this.failoverManager.getHealthStatus();

    for (const provider of providers) {
      const startTime = Date.now();
      try {
        const health = await this.providers.find(p => p.name === provider.provider)?.checkHealth();
        const responseTime = Date.now() - startTime;

        results.push({
          tier: provider.tier,
          provider: provider.provider,
          healthy: health?.healthy ?? false,
          responseTime
        });

      } catch (error) {
        const responseTime = Date.now() - startTime;
        results.push({
          tier: provider.tier,
          provider: provider.provider,
          healthy: false,
          responseTime
        });
      }
    }

    logger.info('Failover tier testing completed', {
      totalTiers: results.length,
      healthyTiers: results.filter(r => r.healthy).length
    });

    return results;
  }

  private loadConfiguration() {
    try {
      const configPath = path.resolve(this.config.configPath!);
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return configData;
    } catch (error) {
      logger.error('Failed to load failover configuration', {
        configPath: this.config.configPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to load failover configuration');
    }
  }

  private loadSafetyConfig() {
    try {
      const safetyConfigPath = path.resolve('config/safety-config.json');
      return JSON.parse(fs.readFileSync(safetyConfigPath, 'utf8'));
    } catch (error) {
      logger.warn('Failed to load safety config, using defaults', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        response_times: {
          crisis_detection_ms: 500,
          crisis_response_ms: 2000,
          nurse_notification_ms: 60000
        }
      };
    }
  }

  private initializeProviders(configData: any): void {
    const providerConfigs = configData.providers;
    
    // Primary: OpenAI GPT-4o-mini
    if (providerConfigs.primary && !this.config.testMode) {
      const config: ProviderConfig = {
        name: providerConfigs.primary.name,
        priority: providerConfigs.primary.priority,
        apiKey: process.env.OPENAI_API_KEY,
        model: providerConfigs.primary.model,
        timeout: providerConfigs.primary.timeout,
        retries: providerConfigs.primary.retries
      };
      
      if (config.apiKey) {
        this.providers.push(new OpenAIProvider(config));
      } else {
        logger.warn('OpenAI API key not provided, skipping primary provider');
      }
    }

    // Secondary: Azure OpenAI UK West
    if (providerConfigs.secondary && !this.config.testMode) {
      const config: ProviderConfig = {
        name: providerConfigs.secondary.name,
        priority: providerConfigs.secondary.priority,
        endpoint: providerConfigs.secondary.endpoint || process.env.AZURE_OPENAI_ENDPOINT,
        model: providerConfigs.secondary.model,
        deployment: providerConfigs.secondary.deployment,
        timeout: providerConfigs.secondary.timeout,
        retries: providerConfigs.secondary.retries
      };
      
      if (config.endpoint) {
        this.providers.push(new AzureOpenAIProvider(config));
      } else {
        logger.warn('Azure OpenAI endpoint not provided, skipping secondary provider');
      }
    }

    // Tertiary: Anthropic Claude
    if (providerConfigs.tertiary && !this.config.testMode) {
      const config: ProviderConfig = {
        name: providerConfigs.tertiary.name,
        priority: providerConfigs.tertiary.priority,
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: providerConfigs.tertiary.model,
        timeout: providerConfigs.tertiary.timeout,
        retries: providerConfigs.tertiary.retries
      };
      
      if (config.apiKey) {
        this.providers.push(new AnthropicProvider(config));
      } else {
        logger.warn('Anthropic API key not provided, skipping tertiary provider');
      }
    }

    // Emergency: Always available
    const emergencyConfig: ProviderConfig = {
      name: providerConfigs.emergency.name,
      priority: providerConfigs.emergency.priority,
      timeout: providerConfigs.emergency.timeout,
      retries: providerConfigs.emergency.retries
    };
    
    this.providers.push(new EmergencyProvider(emergencyConfig));

    logger.info('Providers initialized', {
      total: this.providers.length,
      providers: this.providers.map(p => p.name)
    });
  }

  private initializeMonitoring(configData: any): void {
    const alertConfig: AlertConfig = {
      slaViolationThreshold: configData.monitoring.alertThresholds.slaViolationThreshold,
      providerFailureThreshold: configData.monitoring.alertThresholds.providerFailureThreshold,
      responseTimeThreshold: configData.monitoring.alertThresholds.responseTimeThreshold,
      alertCooldownMs: configData.monitoring.alertThresholds.alertCooldownMs,
      enableEmailAlerts: configData.monitoring.escalation.enableEmailAlerts,
      enableTeamsAlerts: configData.monitoring.escalation.enableTeamsAlerts,
      criticalAlertEscalation: configData.monitoring.escalation.criticalAlertEscalation
    };

    this.monitoringService = new EnhancedMonitoringService(
      this.slaService,
      this.failoverManager,
      alertConfig
    );

    logger.info('Monitoring service initialized');
  }

  private initializeNotifications(configData: any): void {
    if (!this.config.testMode) {
      this.notificationService = new NotificationService({
        teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || configData.monitoring.escalation.teamsWebhookUrl,
        emailRecipients: configData.monitoring.escalation.emailRecipients,
        smtpConfig: {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        }
      });

      if (this.monitoringService) {
        this.monitoringService.setNotificationService({
          sendTeamsAlert: (alert) => this.notificationService!.sendTeamsAlert(alert),
          sendEmailAlert: (alert) => this.notificationService!.sendEmailAlert(alert)
        });
      }

      logger.info('Notification service initialized');
    }
  }

  private async escalateToHuman(
    userId: string,
    conversationId: string,
    query: string,
    failoverResult: Partial<FailoverResult>
  ): Promise<void> {
    logger.error('CRITICAL: Escalating crisis request to human', {
      userId,
      conversationId,
      queryLength: query.length,
      failoverResult
    });

    // Send immediate notification
    if (this.notificationService) {
      await this.notificationService.sendCrisisEscalation({
        userId,
        conversationId,
        query: query.substring(0, 200), // First 200 chars for context
        timestamp: new Date().toISOString(),
        failoverAttempted: failoverResult.provider !== 'none',
        systemStatus: failoverResult.success ? 'DEGRADED' : 'CRITICAL'
      });
    }

    // Track escalation in SLA monitoring
    this.slaService.trackNurseNotification(
      conversationId,
      'crisis',
      Date.now()
    );
  }
}