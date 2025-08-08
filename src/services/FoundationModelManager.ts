import { AzureOpenAI } from 'openai';
import { Logger } from '../utils/logger';
import { ConversationContext } from '../types/agents';

/**
 * Foundation model configurations for different use cases
 */
export interface ModelConfig {
  modelName: string;
  deploymentName: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPromptTemplate: string;
  contextWindow: number;
  costPerToken: number;
}

/**
 * Model usage analytics for cost optimization
 */
export interface ModelUsageMetrics {
  totalTokensUsed: number;
  totalCost: number;
  averageResponseTime: number;
  successfulRequests: number;
  failedRequests: number;
  modelSwitches: number;
  costOptimizationSavings: number;
}

/**
 * Context management for conversation continuity
 */
export interface ConversationMemory {
  conversationId: string;
  userId: string;
  shortTermMemory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokenCount: number;
  }>;
  longTermMemory: Array<{
    summary: string;
    importance: number;
    timestamp: number;
    medicalContext?: string;
  }>;
  totalTokens: number;
  lastOptimized: number;
}

/**
 * Foundation model request with healthcare-specific enhancements
 */
export interface FoundationModelRequest {
  agentId: string;
  conversationContext: ConversationContext;
  userMessage: string;
  modelPreference?: 'cost_optimized' | 'quality_optimized' | 'speed_optimized';
  healthcareCategory?: 'crisis' | 'medical_info' | 'general' | 'escalation';
  requiresCompliance?: boolean;
  maxResponseTokens?: number;
}

/**
 * FoundationModelManager provides intelligent model selection and optimization
 * Implements healthcare-specific model configurations and cost management
 */
export class FoundationModelManager {
  private readonly logger: Logger;
  private readonly azureOpenAI: AzureOpenAI;
  private readonly conversationMemories: Map<string, ConversationMemory> = new Map();
  private readonly modelConfigs: Map<string, ModelConfig>;
  private readonly usageMetrics: Map<string, ModelUsageMetrics> = new Map();
  
  // Healthcare-specific system prompts
  private readonly healthcareSystemPrompts = {
    crisis: `You are a specialized crisis support AI. Your ONLY goal is to provide immediate emergency contacts and safety resources. 
    
    CRITICAL INSTRUCTIONS:
    - Detect crisis situations in <500ms
    - Provide emergency contacts immediately
    - Never provide medical advice
    - Direct to professional help
    - Be empathetic but brief
    
    Emergency contacts: 999 (Emergency), 116 123 (Samaritans), NHS 111`,
    
    medical_info: `You are Ask Eve Assist, providing gynaecological health information from The Eve Appeal.
    
    MHRA COMPLIANCE REQUIREMENTS:
    - Only use information from provided sources
    - Always include source attribution
    - Never generate medical advice
    - Recommend consulting healthcare professionals
    - Be accurate and evidence-based
    
    You are knowledgeable, empathetic, and helpful while maintaining professional boundaries.`,
    
    escalation: `You are a healthcare escalation coordinator. Your role is to facilitate connections with healthcare professionals.
    
    GDPR COMPLIANCE REQUIREMENTS:
    - Only collect necessary contact information
    - Obtain explicit consent
    - Explain data usage clearly
    - Provide withdrawal options
    - Ensure secure data handling
    
    You coordinate nurse callbacks and professional consultations efficiently and compliantly.`,
    
    general: `You are Ask Eve Assist, a supportive digital assistant for gynaecological health information.
    
    CORE PRINCIPLES:
    - Be empathetic and understanding
    - Provide accurate information only
    - Direct to professional help when needed
    - Maintain user privacy and dignity
    - Support The Eve Appeal's mission
    
    You help users navigate health information and support services.`
  };

  constructor(logger: Logger) {
    this.logger = logger;
    
    // Initialize Azure OpenAI client
    this.azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });

    // Initialize model configurations
    this.modelConfigs = this.createModelConfigurations();
    
    // Initialize usage metrics for each model
    for (const modelName of this.modelConfigs.keys()) {
      this.usageMetrics.set(modelName, {
        totalTokensUsed: 0,
        totalCost: 0,
        averageResponseTime: 0,
        successfulRequests: 0,
        failedRequests: 0,
        modelSwitches: 0,
        costOptimizationSavings: 0
      });
    }
  }

  /**
   * Generate response using optimal foundation model
   */
  async generateResponse(request: FoundationModelRequest): Promise<{
    response: string;
    modelUsed: string;
    tokensUsed: number;
    cost: number;
    responseTime: number;
    confidence: number;
  }> {
    const startTime = Date.now();
    
    try {
      this.logger.info('🧠 Processing foundation model request', {
        agentId: request.agentId,
        healthcareCategory: request.healthcareCategory,
        modelPreference: request.modelPreference,
        conversationId: request.conversationContext.conversationId.substring(0, 8) + '***'
      });

      // Select optimal model based on request
      const selectedModel = this.selectOptimalModel(request);
      const modelConfig = this.modelConfigs.get(selectedModel)!;

      // Prepare conversation memory and context
      const conversationMemory = await this.getOrCreateConversationMemory(
        request.conversationContext.conversationId,
        request.conversationContext.userId
      );

      // Build optimized prompt with memory management
      const optimizedPrompt = await this.buildOptimizedPrompt(
        request,
        modelConfig,
        conversationMemory
      );

      // Generate response with model
      const completion = await this.azureOpenAI.chat.completions.create({
        model: modelConfig.deploymentName,
        messages: optimizedPrompt.messages,
        temperature: modelConfig.temperature,
        max_completion_tokens: request.maxResponseTokens || modelConfig.maxTokens,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty
      });

      const responseTime = Date.now() - startTime;
      const response = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;
      const cost = this.calculateCost(tokensUsed, modelConfig);

      // Update conversation memory
      await this.updateConversationMemory(
        conversationMemory,
        request.userMessage,
        response,
        tokensUsed
      );

      // Update usage metrics
      this.updateUsageMetrics(selectedModel, tokensUsed, cost, responseTime, true);

      // Validate response for healthcare compliance
      const confidence = await this.validateHealthcareCompliance(
        response,
        request.healthcareCategory
      );

      this.logger.info('✅ Foundation model response generated', {
        modelUsed: selectedModel,
        tokensUsed,
        cost: cost.toFixed(4),
        responseTime,
        confidence,
        agentId: request.agentId
      });

      return {
        response,
        modelUsed: selectedModel,
        tokensUsed,
        cost,
        responseTime,
        confidence
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('❌ Foundation model request failed', {
        error: errorMessage,
        agentId: request.agentId,
        responseTime,
        conversationId: request.conversationContext.conversationId
      });

      // Update failure metrics
      const selectedModel = this.selectOptimalModel(request);
      this.updateUsageMetrics(selectedModel, 0, 0, responseTime, false);

      throw new Error(`Foundation model generation failed: ${errorMessage}`);
    }
  }

  /**
   * Select optimal model based on request characteristics
   */
  private selectOptimalModel(request: FoundationModelRequest): string {
    // Crisis situations always use fastest, most reliable model
    if (request.healthcareCategory === 'crisis') {
      return 'gpt-4o-mini-crisis';
    }

    // Cost optimization for general queries
    if (request.modelPreference === 'cost_optimized') {
      return 'gpt-4o-mini-standard';
    }

    // Quality optimization for complex medical information
    if (request.modelPreference === 'quality_optimized' || request.healthcareCategory === 'medical_info') {
      return 'gpt-4o-standard';
    }

    // Speed optimization for escalation coordination
    if (request.modelPreference === 'speed_optimized' || request.healthcareCategory === 'escalation') {
      return 'gpt-4o-mini-standard';
    }

    // Default to balanced model
    return 'gpt-4o-mini-standard';
  }

  /**
   * Create model configurations for different use cases
   */
  private createModelConfigurations(): Map<string, ModelConfig> {
    return new Map([
      ['gpt-4o-mini-crisis', {
        modelName: 'gpt-4o-mini',
        deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
        temperature: 0.1, // Very low for consistent crisis responses
        maxTokens: 150, // Brief, focused responses
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        systemPromptTemplate: this.healthcareSystemPrompts.crisis,
        contextWindow: 8000, // Smaller context for speed
        costPerToken: 0.00015
      }],
      ['gpt-4o-mini-standard', {
        modelName: 'gpt-4o-mini',
        deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
        temperature: 0.3, // Balanced creativity/accuracy
        maxTokens: 400, // Standard response length
        topP: 0.95,
        frequencyPenalty: 0.1,
        presencePenalty: 0.1,
        systemPromptTemplate: this.healthcareSystemPrompts.medical_info,
        contextWindow: 16000, // Standard context
        costPerToken: 0.00015
      }],
      ['gpt-4o-standard', {
        modelName: 'gpt-4o',
        deploymentName: 'gpt-4o', // Would need separate deployment
        temperature: 0.2, // Low for medical accuracy
        maxTokens: 600, // Longer, detailed responses
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        systemPromptTemplate: this.healthcareSystemPrompts.medical_info,
        contextWindow: 32000, // Large context window
        costPerToken: 0.005 // Higher cost for GPT-4
      }],
      ['escalation-coordinator', {
        modelName: 'gpt-4o-mini',
        deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
        temperature: 0.2, // Consistent for process coordination
        maxTokens: 300, // Process-focused responses
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.1,
        systemPromptTemplate: this.healthcareSystemPrompts.escalation,
        contextWindow: 12000,
        costPerToken: 0.00015
      }]
    ]);
  }

  /**
   * Build optimized prompt with conversation memory
   */
  private async buildOptimizedPrompt(
    request: FoundationModelRequest,
    modelConfig: ModelConfig,
    memory: ConversationMemory
  ): Promise<{ messages: any[]; tokensEstimate: number }> {
    
    const messages: any[] = [];
    let tokensEstimate = 0;

    // System prompt with healthcare-specific instructions
    const systemPrompt = this.buildSystemPrompt(modelConfig, request.healthcareCategory);
    messages.push({ role: 'system', content: systemPrompt });
    tokensEstimate += this.estimateTokens(systemPrompt);

    // Add relevant conversation history within context window
    const contextWindow = modelConfig.contextWindow - tokensEstimate - (request.maxResponseTokens || modelConfig.maxTokens) - 500; // Safety buffer
    const relevantHistory = this.selectRelevantHistory(memory, contextWindow);

    for (const historyItem of relevantHistory) {
      messages.push({ role: historyItem.role, content: historyItem.content });
      tokensEstimate += historyItem.tokenCount;
    }

    // Add current user message
    messages.push({ role: 'user', content: request.userMessage });
    tokensEstimate += this.estimateTokens(request.userMessage);

    return { messages, tokensEstimate };
  }

  /**
   * Build healthcare-specific system prompt
   */
  private buildSystemPrompt(modelConfig: ModelConfig, category?: string): string {
    let systemPrompt = modelConfig.systemPromptTemplate;

    // Add MHRA compliance reminder for medical information
    if (category === 'medical_info') {
      systemPrompt += `\n\nMHRA COMPLIANCE CHECK:
      - ✓ Source attribution required
      - ✓ No medical advice generation
      - ✓ Professional consultation recommended
      - ✓ Evidence-based information only`;
    }

    // Add crisis handling instructions
    if (category === 'crisis') {
      systemPrompt += `\n\nCRISIS RESPONSE PROTOCOL:
      - Response time target: <500ms
      - Provide emergency contacts immediately
      - Be empathetic but directive
      - Never delay emergency guidance`;
    }

    // Add current date for temporal context
    systemPrompt += `\n\nCurrent date: ${new Date().toISOString().split('T')[0]}`;

    return systemPrompt;
  }

  /**
   * Get or create conversation memory
   */
  private async getOrCreateConversationMemory(conversationId: string, userId: string): Promise<ConversationMemory> {
    if (!this.conversationMemories.has(conversationId)) {
      const memory: ConversationMemory = {
        conversationId,
        userId,
        shortTermMemory: [],
        longTermMemory: [],
        totalTokens: 0,
        lastOptimized: Date.now()
      };
      this.conversationMemories.set(conversationId, memory);
    }
    
    return this.conversationMemories.get(conversationId)!;
  }

  /**
   * Update conversation memory with new interaction
   */
  private async updateConversationMemory(
    memory: ConversationMemory,
    userMessage: string,
    assistantResponse: string,
    tokensUsed: number
  ): Promise<void> {
    
    const userTokens = this.estimateTokens(userMessage);
    const assistantTokens = this.estimateTokens(assistantResponse);
    
    // Add to short-term memory
    memory.shortTermMemory.push(
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        tokenCount: userTokens
      },
      {
        role: 'assistant', 
        content: assistantResponse,
        timestamp: Date.now(),
        tokenCount: assistantTokens
      }
    );

    memory.totalTokens += tokensUsed;

    // Optimize memory if it's getting too large
    if (memory.shortTermMemory.length > 20 || memory.totalTokens > 50000) {
      await this.optimizeConversationMemory(memory);
    }
  }

  /**
   * Optimize conversation memory for cost and performance
   */
  private async optimizeConversationMemory(memory: ConversationMemory): Promise<void> {
    this.logger.info('🧹 Optimizing conversation memory', {
      conversationId: memory.conversationId.substring(0, 8) + '***',
      currentMessages: memory.shortTermMemory.length,
      totalTokens: memory.totalTokens
    });

    // Keep only the most recent and important messages
    const recentMessages = memory.shortTermMemory.slice(-10);
    
    // Create summary of older messages for long-term memory
    const olderMessages = memory.shortTermMemory.slice(0, -10);
    if (olderMessages.length > 0) {
      const summary = await this.createConversationSummary(olderMessages);
      memory.longTermMemory.push({
        summary,
        importance: this.calculateImportance(olderMessages),
        timestamp: Date.now(),
        medicalContext: this.extractMedicalContext(olderMessages)
      });
    }

    // Update memory
    memory.shortTermMemory = recentMessages;
    memory.totalTokens = recentMessages.reduce((sum, msg) => sum + msg.tokenCount, 0);
    memory.lastOptimized = Date.now();

    this.logger.info('✅ Memory optimization completed', {
      newMessageCount: memory.shortTermMemory.length,
      newTokenCount: memory.totalTokens,
      longTermEntries: memory.longTermMemory.length
    });
  }

  /**
   * Select relevant conversation history within context window
   */
  private selectRelevantHistory(memory: ConversationMemory, availableTokens: number): ConversationMemory['shortTermMemory'] {
    const relevantMessages: ConversationMemory['shortTermMemory'] = [];
    let tokensUsed = 0;

    // Start with most recent messages
    for (let i = memory.shortTermMemory.length - 1; i >= 0; i--) {
      const message = memory.shortTermMemory[i];
      if (tokensUsed + message.tokenCount <= availableTokens) {
        relevantMessages.unshift(message);
        tokensUsed += message.tokenCount;
      } else {
        break;
      }
    }

    return relevantMessages;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 0.75 words ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost based on token usage
   */
  private calculateCost(tokens: number, modelConfig: ModelConfig): number {
    return tokens * modelConfig.costPerToken;
  }

  /**
   * Validate healthcare compliance of response
   */
  private async validateHealthcareCompliance(
    response: string,
    category?: string
  ): Promise<number> {
    
    let confidence = 1.0;
    
    // Check for medical advice language (should be avoided)
    const medicalAdvicePatterns = [
      /you should take/gi,
      /you need to/gi,
      /diagnosis/gi,
      /prescribe/gi,
      /medication/gi
    ];

    for (const pattern of medicalAdvicePatterns) {
      if (pattern.test(response)) {
        confidence -= 0.1;
        this.logger.warn('⚠️ Potential MHRA compliance issue detected', {
          pattern: pattern.source,
          category
        });
      }
    }

    // Check for emergency contact provision in crisis responses
    if (category === 'crisis') {
      const emergencyPatterns = [/999/g, /116 123/g, /samaritans/gi];
      const hasEmergencyContacts = emergencyPatterns.some(pattern => pattern.test(response));
      if (!hasEmergencyContacts) {
        confidence -= 0.3;
        this.logger.warn('⚠️ Crisis response missing emergency contacts');
      }
    }

    return Math.max(confidence, 0);
  }

  /**
   * Create summary of conversation messages
   */
  private async createConversationSummary(messages: ConversationMemory['shortTermMemory']): Promise<string> {
    // Simple implementation - in production would use LLM summarization
    const topics = new Set<string>();
    for (const message of messages) {
      // Extract key medical terms (simplified)
      const medicalTerms = message.content.toLowerCase().match(/\b(cancer|screening|symptoms|treatment|health)\b/g);
      if (medicalTerms) {
        medicalTerms.forEach(term => topics.add(term));
      }
    }
    
    return `Conversation covered: ${Array.from(topics).join(', ')}. ${messages.length} exchanges.`;
  }

  /**
   * Calculate importance score for messages
   */
  private calculateImportance(messages: ConversationMemory['shortTermMemory']): number {
    let importance = 0.5; // Base importance
    
    for (const message of messages) {
      // Higher importance for crisis-related content
      if (message.content.toLowerCase().includes('crisis') || 
          message.content.toLowerCase().includes('emergency')) {
        importance += 0.3;
      }
      
      // Higher importance for medical terms
      const medicalTerms = message.content.toLowerCase().match(/\b(cancer|screening|symptoms|treatment)\b/g);
      if (medicalTerms) {
        importance += medicalTerms.length * 0.1;
      }
    }
    
    return Math.min(importance, 1.0);
  }

  /**
   * Extract medical context from messages
   */
  private extractMedicalContext(messages: ConversationMemory['shortTermMemory']): string {
    const medicalCategories = new Set<string>();
    
    for (const message of messages) {
      const text = message.content.toLowerCase();
      if (text.includes('ovarian') || text.includes('ovary')) medicalCategories.add('ovarian');
      if (text.includes('cervical') || text.includes('cervix')) medicalCategories.add('cervical');
      if (text.includes('womb') || text.includes('uterine')) medicalCategories.add('womb');
      if (text.includes('vulval') || text.includes('vulva')) medicalCategories.add('vulval');
      if (text.includes('screening')) medicalCategories.add('screening');
    }
    
    return Array.from(medicalCategories).join(', ');
  }

  /**
   * Update usage metrics
   */
  private updateUsageMetrics(
    modelName: string,
    tokens: number,
    cost: number,
    responseTime: number,
    success: boolean
  ): void {
    const metrics = this.usageMetrics.get(modelName);
    if (!metrics) return;

    metrics.totalTokensUsed += tokens;
    metrics.totalCost += cost;
    
    if (success) {
      metrics.successfulRequests++;
      const totalSuccessfulRequests = metrics.successfulRequests;
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * (totalSuccessfulRequests - 1) + responseTime) / totalSuccessfulRequests;
    } else {
      metrics.failedRequests++;
    }
  }

  /**
   * Get foundation model usage statistics
   */
  getUsageStatistics(): Record<string, ModelUsageMetrics> {
    const stats: Record<string, ModelUsageMetrics> = {};
    for (const [modelName, metrics] of this.usageMetrics.entries()) {
      stats[modelName] = { ...metrics };
    }
    return stats;
  }

  /**
   * Get conversation memory statistics
   */
  getMemoryStatistics(): {
    activeConversations: number;
    totalShortTermMessages: number;
    totalLongTermEntries: number;
    averageTokensPerConversation: number;
  } {
    let totalShortTerm = 0;
    let totalLongTerm = 0;
    let totalTokens = 0;

    for (const memory of this.conversationMemories.values()) {
      totalShortTerm += memory.shortTermMemory.length;
      totalLongTerm += memory.longTermMemory.length;
      totalTokens += memory.totalTokens;
    }

    return {
      activeConversations: this.conversationMemories.size,
      totalShortTermMessages: totalShortTerm,
      totalLongTermEntries: totalLongTerm,
      averageTokensPerConversation: this.conversationMemories.size > 0 ? totalTokens / this.conversationMemories.size : 0
    };
  }

  /**
   * Shutdown foundation model manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('🛑 Shutting down Foundation Model Manager');
    
    // Clear conversation memories
    this.conversationMemories.clear();
    
    this.logger.info('✅ Foundation Model Manager shutdown complete');
  }
}