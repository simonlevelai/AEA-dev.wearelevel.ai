import * as winston from 'winston';

export interface SafetyLogContext {
  userId?: string;
  sessionId?: string;
  escalationId?: string;
  severity?: string;
  analysisTime?: number;
  [key: string]: unknown;
}

export class Logger {
  private winston: winston.Logger;

  constructor(serviceName: string = 'ask-eve-assist') {
    this.winston = winston.createLogger({
      level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            service: serviceName,
            message,
            ...meta
          });
        })
      ),
      defaultMeta: { service: serviceName },
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        
        // File transport for all logs
        new winston.transports.File({ 
          filename: 'logs/app.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5
        }),
        
        // Separate file for safety-critical logs
        new winston.transports.File({ 
          filename: 'logs/safety.log',
          level: 'warn',
          maxsize: 10485760, // 10MB
          maxFiles: 10
        }),
        
        // Error logs
        new winston.transports.File({ 
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 10
        })
      ],
      
      // Handle uncaught exceptions and rejections
      exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' })
      ],
      rejectionHandlers: [
        new winston.transports.File({ filename: 'logs/rejections.log' })
      ]
    });

    // Create logs directory if it doesn't exist
    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory(): void {
    const fs = require('fs');
    const path = require('path');
    
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  debug(message: string, context?: SafetyLogContext): void {
    this.winston.debug(message, this.sanitizeContext(context));
  }

  info(message: string, context?: SafetyLogContext): void {
    this.winston.info(message, this.sanitizeContext(context));
  }

  warn(message: string, context?: SafetyLogContext): void {
    this.winston.warn(message, this.sanitizeContext(context));
  }

  error(message: string, context?: SafetyLogContext & { error?: Error }): void {
    const sanitizedContext = this.sanitizeContext(context);
    
    // Extract error details if present
    if (context?.error) {
      sanitizedContext['error'] = {
        name: context.error.name,
        message: context.error.message,
        stack: context.error.stack
      };
    }
    
    this.winston.error(message, sanitizedContext);
  }

  /**
   * Log safety-critical events with highest priority
   */
  critical(message: string, context?: SafetyLogContext): void {
    const criticalContext = {
      ...this.sanitizeContext(context),
      priority: 'CRITICAL',
      requiresAlert: true
    };
    
    this.winston.error(`[CRITICAL] ${message}`, criticalContext);
    
    // In production, this could trigger additional alerting mechanisms
    if (process.env['NODE_ENV'] === 'production') {
      // Could send to external monitoring service like Sentry, DataDog, etc.
      console.error(`CRITICAL SAFETY EVENT: ${message}`, criticalContext);
    }
  }

  /**
   * Log safety analysis results
   */
  safetyAnalysis(
    message: string, 
    context: {
      userId: string;
      sessionId: string;
      severity: string;
      confidence: number;
      requiresEscalation: boolean;
      analysisTime: number;
      matchCount: number;
    }
  ): void {
    const safetyContext = {
      ...this.sanitizeContext(context),
      category: 'safety_analysis',
      timestamp: new Date().toISOString()
    };
    
    this.winston.info(`[SAFETY] ${message}`, safetyContext);
  }

  /**
   * Log escalation events
   */
  escalation(
    message: string,
    context: {
      escalationId: string;
      userId: string;
      severity: string;
      notificationSent: boolean;
      nurseTeamAlerted: boolean;
    }
  ): void {
    const escalationContext = {
      ...this.sanitizeContext(context),
      category: 'escalation',
      timestamp: new Date().toISOString()
    };
    
    this.winston.warn(`[ESCALATION] ${message}`, escalationContext);
  }

  /**
   * Log notification events
   */
  notification(
    message: string,
    context: {
      escalationId: string;
      severity: string;
      attempt: number;
      success: boolean;
      responseTime?: number;
    }
  ): void {
    const notificationContext = {
      ...this.sanitizeContext(context),
      category: 'notification',
      timestamp: new Date().toISOString()
    };
    
    if (context.success) {
      this.winston.info(`[NOTIFICATION] ${message}`, notificationContext);
    } else {
      this.winston.error(`[NOTIFICATION] ${message}`, notificationContext);
    }
  }

  /**
   * Log MHRA compliance checks
   */
  compliance(
    message: string,
    context: {
      userId: string;
      violations?: string[];
      responseBlocked?: boolean;
    }
  ): void {
    const complianceContext = {
      ...this.sanitizeContext(context),
      category: 'mhra_compliance',
      timestamp: new Date().toISOString()
    };
    
    if (context.violations && context.violations.length > 0) {
      this.winston.warn(`[COMPLIANCE] ${message}`, complianceContext);
    } else {
      this.winston.info(`[COMPLIANCE] ${message}`, complianceContext);
    }
  }

  /**
   * Log performance metrics
   */
  performance(
    message: string,
    context: {
      operation: string;
      duration: number;
      threshold?: number;
      exceeded?: boolean;
    }
  ): void {
    const perfContext = {
      ...context,
      category: 'performance',
      timestamp: new Date().toISOString()
    };
    
    if (context.exceeded) {
      this.winston.warn(`[PERFORMANCE] ${message}`, perfContext);
    } else {
      this.winston.debug(`[PERFORMANCE] ${message}`, perfContext);
    }
  }

  private sanitizeContext(context?: SafetyLogContext): Record<string, unknown> {
    if (!context) return {};
    
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Sanitize user-identifying information
      if (key === 'userId' && typeof value === 'string') {
        sanitized[key] = this.sanitizeUserId(value);
      } else if (key === 'message' || key === 'userMessage') {
        // Hash the message content for audit trail without storing PII
        sanitized['messageHash'] = this.hashString(String(value));
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private sanitizeUserId(userId: string): string {
    // Truncate and mask user ID for privacy while maintaining uniqueness
    return userId.substring(0, 8) + '***';
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Create child logger with additional context
   */
  child(context: SafetyLogContext): Logger {
    const childLogger = new Logger();
    childLogger.winston = this.winston.child(this.sanitizeContext(context));
    return childLogger;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.winston.end(() => {
        resolve();
      });
    });
  }
}

// Export default logger instance
export const logger = new Logger();