import { Request, Response, NextFunction } from 'express';
import { EscalationService } from '../services/EscalationService';
import { NotificationService } from '../services/NotificationService';
import { Logger } from '../utils/logger';
import { 
  ConversationContext, 
  SafetyResult, 
  CrisisResponse,
  EscalationEvent,
  ConversationContextSchema 
} from '../types/safety';

export interface SafetyMiddlewareRequest extends Request {
  userId: string;
  sessionId: string;
  safetyResult?: SafetyResult;
  crisisResponse?: CrisisResponse;
  escalationEvent?: EscalationEvent;
}

export interface SafetyMiddlewareOptions {
  skipPaths?: string[];
  enableAuditLogging?: boolean;
  blockUnsafeResponses?: boolean;
}

export class SafetyMiddleware {
  private escalationService: EscalationService;
  private logger: Logger;
  private options: SafetyMiddlewareOptions;

  constructor(
    escalationService: EscalationService,
    _notificationService: NotificationService,
    logger: Logger,
    options: SafetyMiddlewareOptions = {}
  ) {
    this.escalationService = escalationService;
    this.logger = logger;
    this.options = {
      skipPaths: [],
      enableAuditLogging: true,
      blockUnsafeResponses: true,
      ...options
    };
  }

  /**
   * Express middleware for intercepting and analyzing user messages
   */
  analyzeUserMessage() {
    return async (req: SafetyMiddlewareRequest, _res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();

      try {
        // Skip analysis for certain paths
        if (this.shouldSkipPath(req.path)) {
          return next();
        }

        // Extract message and context from request
        const { message, context } = this.extractMessageAndContext(req);
        
        if (!message) {
          return next();
        }

        // Validate required fields
        if (!req.userId || !req.sessionId) {
          this.logger.warn('Safety middleware missing required fields', {
            userId: req.userId,
            sessionId: req.sessionId,
            path: req.path
          });
          return next();
        }

        // Perform safety analysis
        const safetyResult = await this.escalationService.analyzeMessage(message, context);
        req.safetyResult = safetyResult;

        // Log safety analysis
        if (this.options.enableAuditLogging) {
          this.logSafetyAnalysis(req.userId, req.sessionId, message, safetyResult);
        }

        // Handle escalation if required
        if (safetyResult.requiresEscalation) {
          await this.handleEscalation(req, message, safetyResult);
        }

        // Generate crisis response if needed
        if (safetyResult.severity === 'crisis' || safetyResult.severity === 'high_concern') {
          const crisisResponse = await this.escalationService.generateCrisisResponse(safetyResult);
          req.crisisResponse = crisisResponse;
        }

        const processingTime = Date.now() - startTime;
        this.logger.debug('Safety middleware processing completed', {
          userId: req.userId,
          processingTime,
          severity: safetyResult.severity,
          requiresEscalation: safetyResult.requiresEscalation
        });

        next();
      } catch (error) {
        this.logger.error('Safety middleware error', {
          error,
          userId: req.userId,
          sessionId: req.sessionId,
          path: req.path
        });

        // In case of safety system failure, err on the side of caution
        req.safetyResult = {
          severity: 'crisis',
          confidence: 1.0,
          requiresEscalation: true,
          matches: [],
          riskFactors: ['safety_system_failure'],
          contextualConcerns: ['analysis_error'],
          analysisTime: Date.now() - startTime,
          recommendedActions: ['immediate_human_review']
        };

        next();
      }
    };
  }

  /**
   * Express middleware for validating outgoing responses for MHRA compliance
   */
  validateResponse() {
    return (req: SafetyMiddlewareRequest, res: Response, next: NextFunction): void => {
      if (!this.options.blockUnsafeResponses) {
        return next();
      }

      // Intercept response to check for MHRA violations
      const originalSend = res.send;
      
      const middleware = this;
      res.send = function(this: Response, body: unknown) {
        try {
          const responseText = typeof body === 'string' ? body : JSON.stringify(body);
          const violations = middleware.checkMHRACompliance(responseText);
          
          if (violations.length > 0) {
            middleware.logger.error('MHRA compliance violations detected in response', {
              violations,
              userId: req.userId,
              sessionId: req.sessionId
            });

            // Replace with safe response
            const safeResponse = middleware.generateSafeResponse(req.safetyResult);
            return originalSend.call(this, safeResponse);
          }

          return originalSend.call(this, body);
        } catch (error) {
          middleware.logger.error('Response validation error', { error });
          return originalSend.call(this, body);
        }
      };

      next();
    };
  }

  /**
   * Express middleware for adding safety headers and CORS
   */
  addSafetyHeaders() {
    return (req: SafetyMiddlewareRequest, res: Response, next: NextFunction): void => {
      // Add safety-related headers
      res.setHeader('X-Safety-Analyzed', 'true');
      res.setHeader('X-MHRA-Compliant', 'true');
      res.setHeader('X-Crisis-Support', 'available');
      
      if (req.safetyResult) {
        res.setHeader('X-Safety-Level', req.safetyResult.severity);
        if (req.safetyResult.requiresEscalation) {
          res.setHeader('X-Escalation-Required', 'true');
        }
      }

      // Add CORS headers for safety dashboard
      res.setHeader('Access-Control-Allow-Origin', 'https://dashboard.askeve.ai');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

      next();
    };
  }

  private shouldSkipPath(path: string): boolean {
    const defaultSkipPaths = ['/health', '/metrics', '/favicon.ico'];
    const allSkipPaths = [...defaultSkipPaths, ...(this.options.skipPaths ?? [])];
    
    return allSkipPaths.some(skipPath => path.startsWith(skipPath));
  }

  private extractMessageAndContext(req: SafetyMiddlewareRequest): { 
    message: string | null; 
    context: ConversationContext 
  } {
    let message: string | null = null;
    
    // Extract message from different possible locations
    if (req.body?.message) {
      message = req.body.message;
    } else if (req.body?.content) {
      message = req.body.content;
    } else if (req.body?.text) {
      message = req.body.text;
    } else if (req.query?.message) {
      message = req.query.message as string;
    }

    // Build conversation context
    const context: ConversationContext = {
      userId: req.userId,
      sessionId: req.sessionId,
      messageHistory: req.body?.messageHistory ?? [],
      userProfile: req.body?.userProfile
    };

    // Validate context
    try {
      const validatedContext = ConversationContextSchema.parse(context);
      return { message, context: validatedContext };
    } catch (error) {
      this.logger.warn('Invalid conversation context', { error, context });
      // Return minimal valid context
      return {
        message,
        context: {
          userId: req.userId,
          sessionId: req.sessionId,
          messageHistory: []
        }
      };
    }
  }

  private async handleEscalation(
    req: SafetyMiddlewareRequest,
    message: string,
    safetyResult: SafetyResult
  ): Promise<void> {
    try {
      // Create escalation event
      const escalationEvent = await this.escalationService.createEscalationEvent(
        req.userId,
        req.sessionId,
        message,
        safetyResult
      );

      req.escalationEvent = escalationEvent;

      // Notify nurse team for crisis and high concern cases
      if (safetyResult.severity === 'crisis' || 
          (safetyResult.severity === 'high_concern' && safetyResult.confidence > 0.8)) {
        
        await this.escalationService.notifyNurseTeam(escalationEvent);
        
        escalationEvent.notificationSent = true;
        escalationEvent.nurseTeamAlerted = true;
      }

      this.logger.info('Escalation handled successfully', {
        escalationId: escalationEvent.id,
        userId: req.userId,
        severity: safetyResult.severity,
        notificationSent: escalationEvent.notificationSent
      });
    } catch (error) {
      this.logger.error('Failed to handle escalation', {
        error,
        userId: req.userId,
        severity: safetyResult.severity
      });
      
      // Continue processing - don't fail the request due to notification issues
    }
  }

  private logSafetyAnalysis(
    userId: string,
    sessionId: string,
    message: string,
    safetyResult: SafetyResult
  ): void {
    // Log without PII - hash the message for audit trail
    const messageHash = this.hashMessage(message);
    
    this.logger.info('Safety analysis completed', {
      userId: this.sanitizeUserId(userId),
      sessionId,
      messageHash,
      severity: safetyResult.severity,
      confidence: safetyResult.confidence,
      requiresEscalation: safetyResult.requiresEscalation,
      matchCount: safetyResult.matches.length,
      analysisTime: safetyResult.analysisTime,
      riskFactors: safetyResult.riskFactors,
      categories: safetyResult.matches.map(m => m.category)
    });
  }

  private checkMHRACompliance(responseText: string): string[] {
    const violations: string[] = [];
    
    // Load prohibited patterns from config
    const prohibitedPatterns = [
      /you should (take|stop|start|change)/i,
      /medication|medicine|drug|dose/i,
      /you (have|might have|probably have)/i,
      /(don't|do not) worry/i,
      /it's (just|only|probably)/i,
      /definitely|certainly/i,
      /diagnosis|diagnose/i,
      /prescribe|prescription/i
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(responseText)) {
        violations.push(`Prohibited pattern: ${pattern.source}`);
      }
    }

    return violations;
  }

  private generateSafeResponse(safetyResult?: SafetyResult): string {
    const baseResponse = "I understand you're seeking health information. ";
    const disclaimer = "This is general health information only and should not replace professional medical advice. ";
    const guidance = "Always consult your healthcare provider for medical concerns. ";
    const emergency = "If this is an emergency, call 999 immediately.";

    if (safetyResult?.severity === 'crisis') {
      return baseResponse + disclaimer + emergency;
    }

    return baseResponse + disclaimer + guidance;
  }

  private hashMessage(message: string): string {
    // Simple hash for audit trail without storing actual content
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private sanitizeUserId(userId: string): string {
    // Hash or truncate user ID for privacy while maintaining uniqueness
    return userId.substring(0, 8) + '***';
  }

  /**
   * Graceful shutdown - complete any pending safety operations
   */
  async shutdown(): Promise<void> {
    this.logger.info('SafetyMiddleware shutting down gracefully');
    
    try {
      // Allow time for any pending notifications to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      this.logger.info('SafetyMiddleware shutdown completed');
    } catch (error) {
      this.logger.error('Error during SafetyMiddleware shutdown', { error });
    }
  }
}