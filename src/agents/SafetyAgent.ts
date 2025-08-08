import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';
import {
  IAgent,
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentPayload,
  ConversationContext,
  AgentCapabilities,
  SafetyAgentConfig
} from '../types/agents';
import { v4 as uuidv4 } from 'uuid';

/**
 * SafetyAgent - Highest priority agent for crisis detection and emergency response
 * Implements <500ms crisis detection with immediate emergency contact provision
 * Safety-first approach: ALL messages MUST be validated before proceeding to other agents
 */
export class SafetyAgent implements IAgent {
  public readonly id: AgentId = 'safety_agent';
  public readonly capabilities: AgentCapabilities;
  
  private readonly logger: Logger;
  private readonly config: SafetyAgentConfig;
  private readonly CRISIS_RESPONSE_TIMEOUT_MS = 500; // <500ms requirement
  
  // Crisis detection patterns (loaded from JSON files)
  private crisisPatterns: Map<string, RegExp[]> = new Map();
  private emergencyResponses: Map<string, any> = new Map();
  
  // Performance tracking
  private readonly metrics = {
    totalChecks: 0,
    crisisDetections: 0,
    averageResponseTime: 0,
    falsePositives: 0,
    lastCrisisDetected: 0
  };

  constructor(logger: Logger, config: SafetyAgentConfig) {
    this.logger = logger;
    this.config = config;
    
    this.capabilities = {
      agentId: 'safety_agent',
      name: 'Safety Agent',
      description: 'Specialized crisis detection agent with <500ms response time for suicide ideation, self-harm, and medical emergencies. Provides immediate emergency contact resources.',
      capabilities: ['crisis_detection'],
      responseTimeTarget: this.CRISIS_RESPONSE_TIMEOUT_MS,
      priority: 1, // Highest priority - always processes first
      isActive: false,
      healthEndpoint: '/health/safety-agent'
    };
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('🛡️ Initializing SafetyAgent with crisis detection patterns');
      
      // Load crisis detection patterns
      await this.loadCrisisPatterns();
      
      // Load emergency response templates
      await this.loadEmergencyResponses();
      
      // Validate patterns are working
      await this.validateCrisisDetection();
      
      this.capabilities.isActive = true;
      
      const initTime = Date.now() - startTime;
      this.logger.info('✅ SafetyAgent initialized successfully', {
        initializationTime: initTime,
        crisisCategories: this.crisisPatterns.size,
        responseTimeTarget: this.CRISIS_RESPONSE_TIMEOUT_MS
      });
      
    } catch (error) {
      this.logger.error('❌ SafetyAgent initialization failed', { error });
      throw new Error('Critical failure: SafetyAgent cannot start - system unsafe');
    }
  }

  async processMessage(
    message: AgentMessage, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      // Extract user message from payload
      const userMessage = message.payload.data.userMessage as string;
      if (!userMessage) {
        throw new Error('No user message found in payload');
      }

      this.logger.info('🔍 Safety analysis started', {
        conversationId: context.conversationId.substring(0, 8) + '***',
        messageLength: userMessage.length,
        priority: message.priority
      });

      // Perform multi-layer crisis detection
      const crisisResult = await this.performCrisisDetection(userMessage, context);
      
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(responseTime, crisisResult.isCrisis);
      
      // Ensure we meet the <500ms requirement
      if (responseTime > this.CRISIS_RESPONSE_TIMEOUT_MS) {
        this.logger.warn('⚠️ Safety check exceeded 500ms target', { responseTime });
      }

      const response: AgentResponse = {
        messageId: message.id,
        agentId: this.id,
        success: true,
        responseTime,
        result: {
          isCrisis: crisisResult.isCrisis,
          severity: crisisResult.severity,
          crisisType: crisisResult.crisisType,
          immediateResponse: crisisResult.immediateResponse,
          emergencyContacts: crisisResult.emergencyContacts,
          safetyCleared: !crisisResult.isCrisis,
          confidenceScore: crisisResult.confidenceScore,
          triggeredPatterns: crisisResult.triggeredPatterns
        },
        nextActions: crisisResult.isCrisis 
          ? ['provide_emergency_contacts', 'alert_crisis_team'] 
          : ['proceed_to_content_agent'],
        handoffRequired: !crisisResult.isCrisis,
        handoffTarget: !crisisResult.isCrisis ? 'content_agent' : undefined
      };

      // Log crisis detection
      if (crisisResult.isCrisis) {
        this.logger.warn('🚨 CRISIS DETECTED', {
          conversationId: context.conversationId.substring(0, 8) + '***',
          severity: crisisResult.severity,
          crisisType: crisisResult.crisisType,
          responseTime,
          patterns: crisisResult.triggeredPatterns
        });
        
        this.metrics.lastCrisisDetected = Date.now();
      } else {
        this.logger.info('✅ Safety check passed', {
          conversationId: context.conversationId.substring(0, 8) + '***',
          responseTime
        });
      }

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, false, true);
      
      this.logger.error('❌ Safety processing failed', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: context.conversationId,
        responseTime
      });

      // CRITICAL: If safety fails, default to crisis response for user protection
      return {
        messageId: message.id,
        agentId: this.id,
        success: false,
        responseTime,
        error: 'Safety validation failed',
        result: {
          isCrisis: true, // Default to crisis for safety
          severity: 'critical',
          crisisType: 'system_failure',
          immediateResponse: 'I\'m experiencing technical difficulties but want to ensure your safety. Please reach out for support if needed.',
          emergencyContacts: this.config.emergencyContacts,
          safetyCleared: false,
          systemFailure: true
        }
      };
    }
  }

  async handleHandoff(fromAgent: AgentId, payload: AgentPayload): Promise<AgentResponse> {
    this.logger.info('🔄 SafetyAgent handling handoff', { fromAgent });
    
    // Re-validate safety when handed off from other agents
    const mockMessage: AgentMessage = {
      id: uuidv4(),
      fromAgent,
      toAgent: 'safety_agent',
      messageType: 'safety_check_request',
      payload,
      priority: 'immediate',
      timestamp: Date.now()
    };

    const mockContext: ConversationContext = {
      conversationId: payload.conversationId,
      userId: payload.userId,
      sessionId: `handoff-${Date.now()}`,
      messageHistory: [],
      safetyStatus: 'unknown',
      escalationStatus: 'none',
      metadata: { handoffFrom: fromAgent }
    };

    return await this.processMessage(mockMessage, mockContext);
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, unknown> }> {
    const healthDetails = {
      agentId: this.id,
      isActive: this.capabilities.isActive,
      metrics: this.metrics,
      crisisPatterns: this.crisisPatterns.size,
      lastHealthCheck: Date.now(),
      averageResponseTime: this.metrics.averageResponseTime,
      crisisDetectionRate: this.metrics.crisisDetections / Math.max(this.metrics.totalChecks, 1)
    };

    // Health status based on performance
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!this.capabilities.isActive) {
      status = 'unhealthy';
    } else if (this.metrics.averageResponseTime > this.CRISIS_RESPONSE_TIMEOUT_MS * 1.5) {
      status = 'degraded';
    }

    return { status, details: healthDetails };
  }

  // Lifecycle methods
  async start(): Promise<void> {
    await this.initialize();
    this.logger.info('🟢 SafetyAgent started');
  }

  async stop(): Promise<void> {
    this.capabilities.isActive = false;
    this.logger.info('🔴 SafetyAgent stopped');
  }

  async pause(): Promise<void> {
    this.capabilities.isActive = false;
    this.logger.info('⏸️ SafetyAgent paused');
  }

  async resume(): Promise<void> {
    this.capabilities.isActive = true;
    this.logger.info('▶️ SafetyAgent resumed');
  }

  /**
   * Core crisis detection logic - Multi-layer pattern matching
   */
  private async performCrisisDetection(
    userMessage: string, 
    context: ConversationContext
  ): Promise<{
    isCrisis: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    crisisType?: string;
    immediateResponse?: string;
    emergencyContacts?: Record<string, string>;
    confidenceScore: number;
    triggeredPatterns: string[];
  }> {
    const normalizedMessage = userMessage.toLowerCase().trim();
    const triggeredPatterns: string[] = [];
    let highestSeverity = 0;
    let crisisType = '';
    let confidenceScore = 0;

    // Layer 1: Exact phrase matching (highest confidence)
    for (const [category, patterns] of this.crisisPatterns.entries()) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedMessage)) {
          triggeredPatterns.push(`${category}:${pattern.source}`);
          
          // Assign severity scores
          const severityScore = this.getSeverityScore(category);
          if (severityScore > highestSeverity) {
            highestSeverity = severityScore;
            crisisType = category;
          }
          
          confidenceScore += severityScore * 0.25;
        }
      }
    }

    // Layer 2: Contextual analysis (medium confidence)
    const contextualScore = await this.analyzeContextualIndicators(normalizedMessage, context);
    confidenceScore += contextualScore;

    // Layer 3: Compound indicator detection (high confidence)
    const compoundScore = this.detectCompoundIndicators(normalizedMessage);
    confidenceScore += compoundScore;

    // Normalize confidence score
    confidenceScore = Math.min(confidenceScore, 1.0);

    // Determine if this is a crisis (threshold: 0.6 for high sensitivity)
    const isCrisis = confidenceScore >= 0.6 || highestSeverity >= 4;

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (confidenceScore >= 0.9) severity = 'critical';
    else if (confidenceScore >= 0.75) severity = 'high';
    else if (confidenceScore >= 0.6) severity = 'medium';

    // Get appropriate response for crisis type
    const response = isCrisis ? this.emergencyResponses.get(crisisType) : null;

    return {
      isCrisis,
      severity,
      crisisType: isCrisis ? crisisType : undefined,
      immediateResponse: response?.message,
      emergencyContacts: isCrisis ? this.config.emergencyContacts : undefined,
      confidenceScore,
      triggeredPatterns
    };
  }

  private async loadCrisisPatterns(): Promise<void> {
    try {
      // Load crisis triggers from JSON files
      const crisisPath = path.join(process.cwd(), this.config.triggerFiles.crisisTriggersPath);
      const crisisData = await fs.readFile(crisisPath, 'utf-8');
      const crisisPatterns = JSON.parse(crisisData);

      // Convert patterns to RegExp objects
      for (const [category, patterns] of Object.entries(crisisPatterns)) {
        const regexPatterns: RegExp[] = [];
        for (const patternGroup of Object.values(patterns as any)) {
          if (Array.isArray(patternGroup)) {
            for (const pattern of patternGroup) {
              // Create case-insensitive regex with word boundaries
              regexPatterns.push(new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
            }
          }
        }
        this.crisisPatterns.set(category, regexPatterns);
      }

      this.logger.info('✅ Crisis patterns loaded', {
        categories: this.crisisPatterns.size,
        totalPatterns: Array.from(this.crisisPatterns.values()).reduce((sum, patterns) => sum + patterns.length, 0)
      });

    } catch (error) {
      this.logger.error('Failed to load crisis patterns', { error });
      throw new Error('Cannot initialize safety system without crisis patterns');
    }
  }

  private async loadEmergencyResponses(): Promise<void> {
    try {
      const configPath = path.join(process.cwd(), 'config/safety-config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const safetyConfig = JSON.parse(configData);

      // Store emergency response templates
      if (safetyConfig.crisis_responses) {
        for (const [type, response] of Object.entries(safetyConfig.crisis_responses)) {
          this.emergencyResponses.set(type, response);
        }
      }

      this.logger.info('✅ Emergency responses loaded', { 
        responseTypes: this.emergencyResponses.size 
      });

    } catch (error) {
      this.logger.error('Failed to load emergency responses', { error });
      throw new Error('Cannot initialize safety system without emergency responses');
    }
  }

  private async validateCrisisDetection(): Promise<void> {
    // Test patterns with known crisis phrases
    const testPhrases = [
      'I want to kill myself',
      'I want to die', 
      'suicide',
      'hurt myself'
    ];

    let detectedCount = 0;
    for (const phrase of testPhrases) {
      const result = await this.performCrisisDetection(phrase, {
        conversationId: 'test',
        userId: 'test',
        sessionId: 'test',
        messageHistory: [],
        safetyStatus: 'unknown',
        escalationStatus: 'none',
        metadata: {}
      });

      if (result.isCrisis) detectedCount++;
    }

    if (detectedCount < testPhrases.length * 0.8) { // 80% detection rate minimum
      throw new Error(`Crisis detection validation failed: ${detectedCount}/${testPhrases.length} detected`);
    }

    this.logger.info('✅ Crisis detection validation passed', {
      testPhrases: testPhrases.length,
      detected: detectedCount,
      accuracy: detectedCount / testPhrases.length
    });
  }

  private getSeverityScore(category: string): number {
    const severityMap: Record<string, number> = {
      'suicide_ideation': 5,
      'self_harm': 4,
      'medical_emergency': 4,
      'severe_distress': 3,
      'domestic_violence': 4,
      'substance_abuse': 2
    };

    return severityMap[category] || 1;
  }

  private async analyzeContextualIndicators(
    message: string,
    context: ConversationContext
  ): Promise<number> {
    let contextScore = 0;

    // Check conversation history for escalating distress
    if (context.messageHistory.length > 2) {
      const recentMessages = context.messageHistory.slice(-3);
      const distressKeywords = ['worried', 'scared', 'anxious', 'hopeless', 'desperate'];
      
      let distressCount = 0;
      for (const historyMessage of recentMessages) {
        if (historyMessage.isUser) {
          for (const keyword of distressKeywords) {
            if (historyMessage.text.toLowerCase().includes(keyword)) {
              distressCount++;
              break;
            }
          }
        }
      }

      if (distressCount >= 2) contextScore += 0.2;
    }

    // Check for time-based indicators
    const timeIndicators = ['tonight', 'today', 'now', 'right now', 'immediately'];
    for (const indicator of timeIndicators) {
      if (message.includes(indicator)) {
        contextScore += 0.1;
        break;
      }
    }

    return Math.min(contextScore, 0.3); // Cap contextual score
  }

  private detectCompoundIndicators(message: string): number {
    let compoundScore = 0;

    // Multiple crisis indicators in same message
    const crisisKeywords = ['die', 'kill', 'hurt', 'end', 'pain', 'hopeless', 'worthless'];
    let keywordCount = 0;
    
    for (const keyword of crisisKeywords) {
      if (message.includes(keyword)) keywordCount++;
    }

    if (keywordCount >= 3) compoundScore += 0.3;
    else if (keywordCount >= 2) compoundScore += 0.2;

    return compoundScore;
  }

  private updateMetrics(responseTime: number, isCrisis: boolean, isError: boolean = false): void {
    this.metrics.totalChecks++;
    
    if (isCrisis && !isError) {
      this.metrics.crisisDetections++;
    }
    
    // Update average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalChecks - 1) + responseTime) / this.metrics.totalChecks;
  }
}