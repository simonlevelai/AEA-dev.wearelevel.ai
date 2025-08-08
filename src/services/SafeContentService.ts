import { ContentService } from './ContentService';
import { SafetyServiceAdapter } from './SafetyServiceAdapter';
import { SearchResponse } from '../types/content';
import { logger } from '../utils/logger';

/**
 * SafeContentService integrates content search with safety monitoring
 * Ensures all content retrieval is safety-aware and includes proper escalation
 */
export class SafeContentService {
  constructor(
    private readonly _contentService: ContentService,
    private readonly _safetyService: SafetyServiceAdapter
  ) {}

  /**
   * Search for content with integrated safety monitoring
   * Analyzes user query for safety concerns while providing accurate health information
   */
  async searchWithSafetyMonitoring(
    query: string,
    context: {
      userId: string;
      sessionId: string;
      conversationHistory: Array<{text: string; isUser: boolean; timestamp: Date}>;
    }
  ): Promise<{
    searchResponse: SearchResponse;
    safetyAnalysis: {
      shouldEscalate: boolean;
      severity: 'low' | 'medium' | 'high' | 'critical';
      escalationType?: 'medical_emergency' | 'self_harm' | 'inappropriate_content';
      reason?: string;
    };
  }> {
    try {
      logger.info('Safe content search initiated', { 
        query, 
        userId: context.userId, 
        sessionId: context.sessionId 
      });

      // 1. Perform safety analysis first
      const safetyResult = await this.safetyService.analyzeMessage(
        query,
        context.conversationHistory
      );

      // 2. Search for content regardless of safety concerns
      // Healthcare information should always be provided, but with appropriate escalation
      const searchResponse = await this.contentService.searchWithSafetyFilter(query, {
        userId: context.userId,
        sessionId: context.sessionId,
        isCrisis: safetyResult.shouldEscalate && safetyResult.severity === 'critical'
      });

      // 3. Enhance safety response with context
      const safetyAnalysis = {
        shouldEscalate: safetyResult.shouldEscalate,
        severity: safetyResult.severity,
        escalationType: safetyResult.escalationType,
        reason: safetyResult.reason
      };

      // 4. Log the integrated response
      logger.info('Safe content search completed', {
        query,
        userId: context.userId,
        sessionId: context.sessionId,
        contentFound: searchResponse.found,
        sourceUrl: searchResponse.sourceUrl,
        shouldEscalate: safetyAnalysis.shouldEscalate,
        severity: safetyAnalysis.severity
      });

      return {
        searchResponse,
        safetyAnalysis
      };

    } catch (error) {
      logger.error('Safe content search failed', { 
        query, 
        userId: context.userId, 
        sessionId: context.sessionId, 
        error 
      });
      
      // Return safe defaults in case of error
      return {
        searchResponse: {
          found: false,
          content: '',
          source: '',
          sourceUrl: ''
        },
        safetyAnalysis: {
          shouldEscalate: true,  // Escalate on error to be safe
          severity: 'high',
          reason: 'Content search system error - recommend human assistance'
        }
      };
    }
  }

  /**
   * Search for multiple content pieces with safety monitoring
   * Useful for complex queries that may require multiple sources
   */
  async searchMultipleWithSafety(
    query: string,
    context: {
      userId: string;
      sessionId: string;
      conversationHistory: Array<{text: string; isUser: boolean; timestamp: Date}>;
    },
    maxResults: number = 3
  ): Promise<{
    searchResults: {
      found: boolean;
      results: SearchResponse[];
      totalCount: number;
    };
    safetyAnalysis: {
      shouldEscalate: boolean;
      severity: 'low' | 'medium' | 'high' | 'critical';
      escalationType?: 'medical_emergency' | 'self_harm' | 'inappropriate_content';
      reason?: string;
    };
  }> {
    try {
      logger.info('Safe multiple content search initiated', { 
        query, 
        maxResults,
        userId: context.userId, 
        sessionId: context.sessionId 
      });

      // 1. Safety analysis
      const safetyResult = await this.safetyService.analyzeMessage(
        query,
        context.conversationHistory
      );

      // 2. Search for multiple content pieces
      const searchResults = await this.contentService.searchMultipleContent(query, maxResults);

      // 3. Prepare response
      const safetyAnalysis = {
        shouldEscalate: safetyResult.shouldEscalate,
        severity: safetyResult.severity,
        escalationType: safetyResult.escalationType,
        reason: safetyResult.reason
      };

      logger.info('Safe multiple content search completed', {
        query,
        maxResults,
        userId: context.userId,
        sessionId: context.sessionId,
        contentFound: searchResults.found,
        resultCount: searchResults.totalCount,
        shouldEscalate: safetyAnalysis.shouldEscalate,
        severity: safetyAnalysis.severity
      });

      return {
        searchResults,
        safetyAnalysis
      };

    } catch (error) {
      logger.error('Safe multiple content search failed', { 
        query, 
        maxResults,
        userId: context.userId, 
        sessionId: context.sessionId, 
        error 
      });
      
      return {
        searchResults: {
          found: false,
          results: [],
          totalCount: 0
        },
        safetyAnalysis: {
          shouldEscalate: true,
          severity: 'high',
          reason: 'Multiple content search system error - recommend human assistance'
        }
      };
    }
  }

  /**
   * Validate that content meets MHRA compliance requirements
   * All content must have proper source attribution from eveappeal.org.uk
   */
  validateMHRACompliance(response: SearchResponse): {
    isCompliant: boolean;
    issues: string[];
    sourceAttribution: {
      hasSourceUrl: boolean;
      isValidDomain: boolean;
      sourceUrl?: string;
    };
  } {
    const issues: string[] = [];
    
    // Check source URL exists
    const hasSourceUrl = Boolean(response.sourceUrl);
    if (!hasSourceUrl) {
      issues.push('Missing source URL - MHRA requires source attribution for all health information');
    }

    // Check valid domain
    const isValidDomain = hasSourceUrl && response.sourceUrl.startsWith('https://eveappeal.org.uk');
    if (hasSourceUrl && !isValidDomain) {
      issues.push(`Invalid source domain: ${response.sourceUrl} - Only eveappeal.org.uk content is approved`);
    }

    // Check content has source information
    if (!response.source) {
      issues.push('Missing source information - Content must identify its source organization');
    }

    const sourceAttribution = {
      hasSourceUrl,
      isValidDomain,
      sourceUrl: response.sourceUrl
    };

    const isCompliant = issues.length === 0;

    logger.info('MHRA compliance validation', {
      isCompliant,
      issues: issues.length,
      sourceUrl: response.sourceUrl,
      source: response.source
    });

    return {
      isCompliant,
      issues,
      sourceAttribution
    };
  }

  /**
   * Generate safety-aware response with proper source attribution
   * Ensures MHRA compliance while handling safety escalation
   */
  generateSafeResponse(
    searchResponse: SearchResponse,
    safetyAnalysis: {
      shouldEscalate: boolean;
      severity: 'low' | 'medium' | 'high' | 'critical';
      escalationType?: 'medical_emergency' | 'self_harm' | 'inappropriate_content';
      reason?: string;
    }
  ): {
    content: string;
    sourceAttribution: string;
    escalationMessage?: string;
    requiresEscalation: boolean;
  } {
    // Validate MHRA compliance
    const compliance = this.validateMHRACompliance(searchResponse);
    
    if (!compliance.isCompliant) {
      logger.error('MHRA compliance violation', {
        issues: compliance.issues,
        sourceUrl: searchResponse.sourceUrl
      });
      
      return {
        content: 'I apologize, but I cannot provide this information as it does not meet medical information standards. Please consult with a healthcare professional.',
        sourceAttribution: 'Content validation failed - no source attribution available',
        escalationMessage: 'Content compliance issues detected - human review required',
        requiresEscalation: true
      };
    }

    // Generate source attribution
    let sourceAttribution = `Source: ${searchResponse.source}`;
    if (searchResponse.sourceUrl) {
      sourceAttribution += ` (${searchResponse.sourceUrl})`;
    }
    if (searchResponse.sourcePage) {
      sourceAttribution += ` - Page ${searchResponse.sourcePage}`;
    }

    // Handle safety escalation
    let escalationMessage: string | undefined;
    if (safetyAnalysis.shouldEscalate) {
      switch (safetyAnalysis.severity) {
        case 'critical':
          escalationMessage = 'This appears to be a medical emergency. Please call 999 or go to your nearest A&E immediately.';
          break;
        case 'high':
          escalationMessage = 'This sounds concerning. Please contact your GP or NHS 111 for urgent medical advice.';
          break;
        case 'medium':
          escalationMessage = 'Please consider speaking with a healthcare professional about your concerns.';
          break;
        default:
          escalationMessage = safetyAnalysis.reason;
      }
    }

    const content = searchResponse.found 
      ? searchResponse.content 
      : 'I could not find specific information about this topic. Please consult with a healthcare professional for personalized advice.';

    logger.info('Safe response generated', {
      hasContent: searchResponse.found,
      sourceUrl: searchResponse.sourceUrl,
      requiresEscalation: safetyAnalysis.shouldEscalate,
      severity: safetyAnalysis.severity
    });

    return {
      content,
      sourceAttribution,
      escalationMessage,
      requiresEscalation: safetyAnalysis.shouldEscalate
    };
  }
}