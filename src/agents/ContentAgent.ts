import { Logger } from '../utils/logger';
import { AzureAISearchService, HealthcareSearchResult } from '../services/AzureAISearchService';
import { AzureTableStorageService } from '../services/AzureTableStorageService';
import { EntityService } from '../services/EntityService';
import {
  IAgent,
  AgentId,
  AgentMessage,
  AgentResponse,
  AgentPayload,
  ConversationContext,
  AgentCapabilities,
  ContentAgentConfig
} from '../types/agents';
import { SearchResponse } from '../types/content';
import { v4 as uuidv4 } from 'uuid';

/**
 * ContentAgent - Specialized medical content retrieval agent
 * Implements RAG (Retrieval-Augmented Generation) with PiF-approved content
 * MHRA compliant: No medical advice generation, only evidence-based content retrieval
 * Mandatory source attribution for all medical information
 */
export class ContentAgent implements IAgent {
  public readonly id: AgentId = 'content_agent';
  public readonly capabilities: AgentCapabilities;
  
  private readonly logger: Logger;
  private readonly config: ContentAgentConfig;
  private readonly searchService: AzureAISearchService;
  private readonly storageService: AzureTableStorageService;
  private readonly entityService: EntityService;
  
  // Performance tracking
  private readonly metrics = {
    totalSearches: 0,
    successfulSearches: 0,
    averageResponseTime: 0,
    contentFoundRate: 0,
    sourceAttributionRate: 1.0 // Must be 100% for MHRA compliance
  };

  constructor(
    logger: Logger,
    config: ContentAgentConfig,
    searchService: AzureAISearchService,
    storageService: AzureTableStorageService,
    entityService: EntityService
  ) {
    this.logger = logger;
    this.config = config;
    this.searchService = searchService;
    this.storageService = storageService;
    this.entityService = entityService;
    
    this.capabilities = {
      agentId: 'content_agent',
      name: 'Content Agent',
      description: 'Specialized medical content retrieval agent using RAG with PiF-approved gynaecological health information. Provides evidence-based content with mandatory source attribution and MHRA compliance.',
      capabilities: ['content_search', 'medical_validation'],
      responseTimeTarget: 3000, // 3 seconds for content search
      priority: 2, // Second priority after safety
      isActive: false,
      healthEndpoint: '/health/content-agent'
    };
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('📚 Initializing ContentAgent with Azure AI Search RAG pipeline');
      
      // Initialize Azure AI Search service
      await this.searchService.initializeIndex();
      
      // Initialize Azure Table Storage service
      await this.storageService.initializeTables();
      
      // Initialize entity service for medical term recognition
      await this.entityService.initialize();
      
      // Validate content pipeline
      await this.validateContentPipeline();
      
      this.capabilities.isActive = true;
      
      const initTime = Date.now() - startTime;
      this.logger.info('✅ ContentAgent initialized successfully with Azure services', {
        initializationTime: initTime,
        azureSearchServiceReady: true,
        azureTableStorageReady: true,
        entityServiceReady: true,
        mhraCompliant: this.config.mhraCompliance?.mandatorySourceAttribution || true,
        architecture: 'ultra_cheap_azure_native'
      });
      
    } catch (error) {
      this.logger.error('❌ ContentAgent initialization failed', { error });
      throw new Error('ContentAgent initialization failed - cannot provide medical information');
    }
  }

  async processMessage(
    message: AgentMessage, 
    context: ConversationContext
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      const userMessage = message.payload.data.userMessage as string;
      if (!userMessage) {
        throw new Error('No user message found in payload');
      }

      const safetyCleared = message.payload.data.safetyCleared as boolean;
      if (!safetyCleared) {
        throw new Error('Cannot process content without safety clearance');
      }

      this.logger.info('🔍 Content search initiated', {
        conversationId: context.conversationId.substring(0, 8) + '***',
        messageLength: userMessage.length,
        fromAgent: message.fromAgent
      });

      // Perform enhanced content search with entity recognition
      const contentResult = await this.performEnhancedContentSearch(userMessage, context);
      
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(responseTime, contentResult.found, contentResult.sourceUrl !== undefined);
      
      const response: AgentResponse = {
        messageId: message.id,
        agentId: this.id,
        success: true,
        responseTime,
        result: {
          found: contentResult.found,
          content: contentResult.content,
          source: contentResult.source,
          sourceUrl: contentResult.sourceUrl,
          relevanceScore: contentResult.relevanceScore,
          medicalCategories: contentResult.metadata?.medicalCategories || [],
          entityMatches: contentResult.entityMatches,
          mhraCompliant: this.validateMHRACompliance(contentResult),
          escalationRecommended: this.shouldRecommendEscalation(userMessage, contentResult),
          nurseCallbackSuggested: this.shouldSuggestNurseCallback(userMessage, contentResult),
          disclaimers: this.getMandatoryDisclaimers()
        },
        nextActions: this.determineNextActions(contentResult, userMessage),
        handoffRequired: this.shouldHandoffToEscalation(contentResult, userMessage),
        handoffTarget: this.shouldHandoffToEscalation(contentResult, userMessage) ? 'escalation_agent' : undefined
      };

      this.logger.info('📖 Content search completed', {
        conversationId: context.conversationId.substring(0, 8) + '***',
        found: contentResult.found,
        responseTime,
        relevanceScore: contentResult.relevanceScore,
        sourceAttributed: !!contentResult.sourceUrl
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, false, false);
      
      this.logger.error('❌ Content processing failed', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: context.conversationId,
        responseTime
      });

      return {
        messageId: message.id,
        agentId: this.id,
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
        result: {
          found: false,
          content: "I don't have specific information about that topic in my knowledge base. For personalized health advice, I'd recommend speaking with your GP or contacting The Eve Appeal nurse line.",
          fallbackResponse: true,
          disclaimers: this.getMandatoryDisclaimers(),
          emergencyContacts: {
            gp: 'Contact your GP',
            eveAppealNurse: '0808 802 0019',
            nhs111: '111'
          }
        }
      };
    }
  }

  async handleHandoff(fromAgent: AgentId, payload: AgentPayload): Promise<AgentResponse> {
    this.logger.info('🔄 ContentAgent handling handoff', { fromAgent });
    
    // Create content search message from handoff payload
    const contentMessage: AgentMessage = {
      id: uuidv4(),
      fromAgent,
      toAgent: 'content_agent',
      messageType: 'content_search_request',
      payload: {
        ...payload,
        data: {
          ...payload.data,
          safetyCleared: true // Assume safety cleared if handed off
        }
      },
      priority: 'high',
      timestamp: Date.now()
    };

    const handoffContext: ConversationContext = {
      conversationId: payload.conversationId,
      userId: payload.userId,
      sessionId: `handoff-${Date.now()}`,
      messageHistory: [],
      safetyStatus: 'safe',
      escalationStatus: 'none',
      metadata: { handoffFrom: fromAgent }
    };

    return await this.processMessage(contentMessage, handoffContext);
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, unknown> }> {
    // Check Azure AI Search health
    const searchHealth = await this.searchService.validateIndexHealth();
    
    // Check Azure Table Storage health
    const storageHealth = await this.storageService.healthCheck();
    
    const healthDetails = {
      agentId: this.id,
      isActive: this.capabilities.isActive,
      metrics: this.metrics,
      azureSearchStatus: searchHealth.isHealthy ? 'healthy' : 'unhealthy',
      azureSearchDetails: {
        indexExists: searchHealth.indexExists,
        documentCount: searchHealth.documentCount,
        vectorConfigured: searchHealth.vectorFieldConfigured,
        semanticConfigured: searchHealth.semanticConfigured
      },
      azureStorageStatus: storageHealth.isHealthy ? 'healthy' : 'unhealthy',
      azureStorageDetails: {
        tablesAccessible: storageHealth.tablesAccessible,
        canWrite: storageHealth.canWrite,
        canRead: storageHealth.canRead
      },
      entityServiceReady: !!this.entityService,
      lastHealthCheck: Date.now(),
      mhraCompliance: {
        sourceAttributionRate: this.metrics.sourceAttributionRate,
        complianceTarget: 1.0
      }
    };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!this.capabilities.isActive || !searchHealth.isHealthy || !storageHealth.isHealthy) {
      status = 'unhealthy';
    } else if (
      this.metrics.sourceAttributionRate < 1.0 || // MHRA compliance violation
      this.metrics.averageResponseTime > this.capabilities.responseTimeTarget * 1.5 ||
      searchHealth.documentCount === 0 || // No content available
      searchHealth.issues.length > 0 || storageHealth.issues.length > 0
    ) {
      status = 'degraded';
    }

    return { status, details: healthDetails };
  }

  // Lifecycle methods
  async start(): Promise<void> {
    await this.initialize();
    this.logger.info('🟢 ContentAgent started');
  }

  async stop(): Promise<void> {
    this.capabilities.isActive = false;
    this.logger.info('🔴 ContentAgent stopped');
  }

  async pause(): Promise<void> {
    this.capabilities.isActive = false;
    this.logger.info('⏸️ ContentAgent paused');
  }

  async resume(): Promise<void> {
    this.capabilities.isActive = true;
    this.logger.info('▶️ ContentAgent resumed');
  }

  /**
   * Enhanced content search with entity recognition and medical validation using Azure AI Search
   */
  private async performEnhancedContentSearch(
    userMessage: string, 
    context: ConversationContext
  ): Promise<SearchResponse & { entityMatches?: any }> {
    
    // Step 1: Entity recognition for medical terms
    const entityMatches = this.entityService.recognizeEntities(userMessage);
    
    // Step 2: Enhanced query construction using entities
    const enhancedQuery = this.constructEnhancedQuery(userMessage, entityMatches);
    
    // Step 3: Log search operation
    const searchId = `search-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const searchStartTime = Date.now();
    
    // Step 4: Search content with Azure AI Search (with hybrid vector + text search)
    const searchResults = await this.searchService.searchHealthcareContent(enhancedQuery, {
      useVector: true, // Enable vector search for better semantic matching
      priorityLevels: ['critical', 'high', 'medium'], // Prioritize important content
      top: 3 // Get top 3 most relevant results
    });
    
    const searchResponseTime = Date.now() - searchStartTime;
    
    // Step 5: Process search results
    let searchResult: SearchResponse;
    
    if (searchResults.length > 0) {
      const topResult = searchResults[0];
      
      // Step 6: Validate result against MHRA requirements
      if (!this.isApprovedSource(topResult.document.sourceUrl)) {
        this.logger.warn('⚠️ Content from non-approved source rejected', {
          sourceUrl: topResult.document.sourceUrl
        });
        
        searchResult = {
          found: false,
          content: undefined,
          source: undefined,
          sourceUrl: undefined
        };
      } else {
        searchResult = {
          found: true,
          content: topResult.document.content,
          source: topResult.document.title,
          sourceUrl: topResult.document.sourceUrl,
          relevanceScore: topResult.score,
          metadata: {
            medicalCategories: topResult.document.medicalCategories,
            relevanceKeywords: topResult.document.relevanceKeywords,
            contentType: topResult.document.contentType,
            priorityLevel: topResult.document.priorityLevel
          }
        };
      }
    } else {
      searchResult = {
        found: false,
        content: undefined,
        source: undefined,
        sourceUrl: undefined
      };
    }
    
    // Step 7: Log search operation to Azure Table Storage
    try {
      await this.storageService.logSearchOperation({
        id: searchId,
        query: enhancedQuery,
        matchedChunks: searchResults.map(r => r.document.id),
        responseGenerated: searchResult.found,
        searchMethod: 'azure_hybrid_search',
        responseTimeMs: searchResponseTime,
        agentId: this.id,
        conversationId: context.conversationId,
        metadata: {
          entityMatches,
          originalQuery: userMessage,
          resultsCount: searchResults.length
        }
      });
    } catch (error) {
      this.logger.warn('⚠️ Failed to log search operation', { error: error.message });
    }
    
    return {
      ...searchResult,
      entityMatches
    };
  }

  private constructEnhancedQuery(userMessage: string, entityMatches: any): string {
    // Start with original message
    let enhancedQuery = userMessage;
    
    // Add relevant medical terms from entity recognition
    if (entityMatches && entityMatches.length > 0) {
      const medicalTerms = entityMatches
        .filter((match: any) => match.confidence > 0.8)
        .map((match: any) => match.entity)
        .join(' ');
      
      enhancedQuery = `${userMessage} ${medicalTerms}`;
    }
    
    // Add context-specific terms for better matching
    const contextTerms = this.extractContextualTerms(userMessage);
    if (contextTerms.length > 0) {
      enhancedQuery = `${enhancedQuery} ${contextTerms.join(' ')}`;
    }
    
    return enhancedQuery;
  }

  private extractContextualTerms(message: string): string[] {
    const contextMap: Record<string, string[]> = {
      'symptoms': ['symptoms', 'signs', 'indicators'],
      'screening': ['screening', 'test', 'check', 'examination'],
      'treatment': ['treatment', 'therapy', 'care', 'management'],
      'prevention': ['prevention', 'protect', 'avoid', 'reduce risk']
    };

    const terms: string[] = [];
    const lowerMessage = message.toLowerCase();

    for (const [category, synonyms] of Object.entries(contextMap)) {
      if (synonyms.some(synonym => lowerMessage.includes(synonym))) {
        terms.push(category);
      }
    }

    return terms;
  }

  private isApprovedSource(sourceUrl: string): boolean {
    const approvedDomains = [
      'eveappeal.org.uk',
      'nhs.uk',
      'nice.org.uk',
      'cancerresearchuk.org'
    ];

    return approvedDomains.some(domain => sourceUrl.includes(domain));
  }

  private validateMHRACompliance(contentResult: SearchResponse): boolean {
    // MHRA compliance requires:
    // 1. No diagnostic language
    // 2. No treatment recommendations  
    // 3. Mandatory source attribution
    // 4. General information only disclaimers

    if (!contentResult.found || !contentResult.content) {
      return true; // No content to validate
    }

    // Check for prohibited language
    const prohibitedPatterns = [
      /you (have|might have|probably have)/gi,
      /you should (take|stop|start|change)/gi,
      /(definitely|certainly) (have|need|should)/gi,
      /medication|medicine|drug|dose/gi,
      /diagnosis|diagnose/gi,
      /prescribe|prescription/gi
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(contentResult.content)) {
        this.logger.warn('⚠️ MHRA compliance violation detected', {
          pattern: pattern.source,
          content: contentResult.content.substring(0, 100) + '...'
        });
        return false;
      }
    }

    // Must have source URL
    if (!contentResult.sourceUrl) {
      this.logger.warn('⚠️ MHRA compliance violation: No source attribution');
      return false;
    }

    return true;
  }

  private shouldRecommendEscalation(userMessage: string, contentResult: SearchResponse): boolean {
    // Escalation indicators
    const escalationKeywords = [
      'urgent', 'emergency', 'severe', 'intense', 'unbearable',
      'getting worse', 'sudden', 'concerning', 'worried'
    ];

    const lowerMessage = userMessage.toLowerCase();
    const hasEscalationKeywords = escalationKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );

    // Also escalate if content suggests seeing a healthcare professional
    const professionalRecommendation = contentResult.content?.toLowerCase().includes('speak to') ||
                                     contentResult.content?.toLowerCase().includes('consult') ||
                                     contentResult.content?.toLowerCase().includes('see your gp');

    return hasEscalationKeywords || professionalRecommendation || false;
  }

  private shouldSuggestNurseCallback(userMessage: string, contentResult: SearchResponse): boolean {
    // Suggest nurse callback for:
    // 1. Complex medical questions
    // 2. Personal concerns
    // 3. When content found but more support might be helpful

    const callbackIndicators = [
      'personal', 'my', 'worried about myself', 'concerned about',
      'what should i do', 'help me understand', 'guidance'
    ];

    const lowerMessage = userMessage.toLowerCase();
    const hasPersonalConcerns = callbackIndicators.some(indicator => 
      lowerMessage.includes(indicator)
    );

    return hasPersonalConcerns && contentResult.found;
  }

  private shouldHandoffToEscalation(contentResult: SearchResponse, userMessage: string): boolean {
    return this.shouldRecommendEscalation(userMessage, contentResult) || 
           this.shouldSuggestNurseCallback(userMessage, contentResult);
  }

  private determineNextActions(contentResult: SearchResponse, userMessage: string): string[] {
    const actions: string[] = [];

    if (contentResult.found) {
      actions.push('provide_content_with_source');
    } else {
      actions.push('provide_fallback_response');
    }

    if (this.shouldRecommendEscalation(userMessage, contentResult)) {
      actions.push('recommend_gp_consultation');
    }

    if (this.shouldSuggestNurseCallback(userMessage, contentResult)) {
      actions.push('suggest_nurse_callback');
    }

    actions.push('provide_mandatory_disclaimers');

    return actions;
  }

  private getMandatoryDisclaimers(): string[] {
    return [
      'This is general health information only and should not replace professional medical advice.',
      'Always consult your healthcare provider for medical concerns.',
      'If this is an emergency, call 999 immediately.'
    ];
  }

  private async validateContentPipeline(): Promise<void> {
    try {
      // Test Azure AI Search with known medical term
      const testResults = await this.searchService.searchHealthcareContent('ovarian cancer symptoms', {
        useVector: false, // Simple text search for validation
        top: 1
      });

      // Validate Azure AI Search is responding
      if (!Array.isArray(testResults)) {
        throw new Error('Azure AI Search service not responding correctly');
      }

      // Test Azure Table Storage write capability
      await this.storageService.logSearchOperation({
        id: `validation-test-${Date.now()}`,
        query: 'pipeline validation test',
        matchedChunks: [],
        responseGenerated: true,
        searchMethod: 'validation_test',
        responseTimeMs: 100,
        agentId: this.id,
        metadata: { validationTest: true }
      });

      // Get Azure services statistics
      const searchStats = await this.searchService.getIndexStatistics();
      const storageStats = await this.storageService.getStorageStatistics();

      this.logger.info('✅ Azure content pipeline validation passed', {
        testSearchComplete: true,
        entityServiceReady: !!this.entityService,
        azureSearchDocuments: searchStats.documentCount,
        azureSearchSizeMB: searchStats.indexSizeMB,
        azureStorageEstimatedCost: storageStats.estimatedCostPerMonth
      });

    } catch (error) {
      throw new Error(`Azure content pipeline validation failed: ${error}`);
    }
  }

  private updateMetrics(responseTime: number, foundContent: boolean, hasSourceAttribution: boolean): void {
    this.metrics.totalSearches++;
    
    if (foundContent) {
      this.metrics.successfulSearches++;
    }
    
    // Update content found rate
    this.metrics.contentFoundRate = this.metrics.successfulSearches / this.metrics.totalSearches;
    
    // Update source attribution rate (critical for MHRA compliance)
    if (foundContent) {
      const totalWithSources = this.metrics.sourceAttributionRate * (this.metrics.successfulSearches - 1);
      this.metrics.sourceAttributionRate = 
        (totalWithSources + (hasSourceAttribution ? 1 : 0)) / this.metrics.successfulSearches;
    }
    
    // Update average response time
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalSearches - 1) + responseTime) / this.metrics.totalSearches;
  }
}