import { AzureOpenAI } from 'openai';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { EntityService } from './EntityService';
import { SupabaseContentService } from './SupabaseContentService';

const ChatCompletionOptionsSchema = z.object({
  message: z.string(),
  maxTokens: z.number().optional().default(1000),
  temperature: z.number().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional()
});

const ChatResponseSchema = z.object({
  response: z.string(),
  tokenUsage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number()
  }),
  finishReason: z.string(),
  model: z.string()
});

export type ChatCompletionOptions = z.infer<typeof ChatCompletionOptionsSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export class AzureOpenAIService {
  private openai: AzureOpenAI;
  private deploymentName: string;
  private entityService: EntityService;
  private contentService?: SupabaseContentService;
  private systemPrompt: string;

  constructor(
    apiKey: string,
    endpoint: string,
    deploymentName: string,
    entityService: EntityService,
    contentService?: SupabaseContentService
  ) {
    this.openai = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion: '2024-12-01-preview'
    });

    this.deploymentName = deploymentName;
    this.entityService = entityService;
    this.contentService = contentService;
    this.systemPrompt = '';
  }

  async initialize(): Promise<void> {
    try {
      if (!this.entityService) {
        throw new Error('EntityService is required for initialization');
      }
      
      this.systemPrompt = this.entityService.getSystemPrompt();
      logger.info('AzureOpenAIService initialized with system prompt');
    } catch (error) {
      logger.error('Failed to initialize AzureOpenAIService:', error);
      throw new Error('Azure OpenAI service initialization failed');
    }
  }

  async generateResponse(options: ChatCompletionOptions): Promise<ChatResponse> {
    const validatedOptions = ChatCompletionOptionsSchema.parse(options);
    
    try {
      // Check for crisis indicators before processing
      if (this.entityService.isCrisisIndicator(validatedOptions.message)) {
        logger.warn('Crisis indicator detected in user message', {
          userId: validatedOptions.userId,
          sessionId: validatedOptions.sessionId
        });
        
        return this.generateCrisisResponse();
      }

      let enhancedSystemPrompt = this.systemPrompt;

      // Use Supabase content service if available (preferred method)
      if (this.contentService) {
        try {
          const contentResult = await this.contentService.searchContent(validatedOptions.message);
          enhancedSystemPrompt = this.createEnhancedSystemPrompt(contentResult);
          
          logger.info('Enhanced content search completed', {
            userId: validatedOptions.userId,
            contentFound: contentResult.found,
            relevanceScore: contentResult.relevanceScore
          });
        } catch (error) {
          logger.warn('Supabase content search failed, falling back to entity matching', { 
            error, 
            userId: validatedOptions.userId 
          });
          // Fallback to entity matching
          const entityMatches = this.entityService.findMatchingEntities(validatedOptions.message);
          const contextInfo = this.buildContextFromEntities(entityMatches);
          enhancedSystemPrompt = this.systemPrompt + (contextInfo ? `\n\nRelevant medical context: ${contextInfo}` : '');
        }
      } else {
        // Fallback to entity matching when content service not available
        const entityMatches = this.entityService.findMatchingEntities(validatedOptions.message);
        const contextInfo = this.buildContextFromEntities(entityMatches);
        enhancedSystemPrompt = this.systemPrompt + (contextInfo ? `\n\nRelevant medical context: ${contextInfo}` : '');
      }

      const messages = [
        {
          role: 'system' as const,
          content: enhancedSystemPrompt
        },
        {
          role: 'user' as const,
          content: validatedOptions.message
        }
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.deploymentName,
        messages,
        max_completion_tokens: validatedOptions.maxTokens,
        temperature: 0.7,
        user: validatedOptions.userId
      });

      if (!completion.choices[0]?.message?.content) {
        throw new Error('No response generated from Azure OpenAI');
      }

      const response = ChatResponseSchema.parse({
        response: completion.choices[0].message.content,
        tokenUsage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        },
        finishReason: completion.choices[0].finish_reason || 'stop',
        model: completion.model
      });

      logger.info('Generated response successfully', {
        userId: validatedOptions.userId,
        sessionId: validatedOptions.sessionId,
        tokenUsage: response.tokenUsage,
        enhancedWithContent: !!this.contentService
      });

      return response;

    } catch (error) {
      logger.error('Failed to generate response:', error, {
        userId: validatedOptions.userId,
        sessionId: validatedOptions.sessionId,
        message: validatedOptions.message
      });
      
      if (error instanceof Error) {
        throw new Error(`Failed to generate response from Azure OpenAI: ${error.message}`);
      }
      
      throw new Error('Failed to generate response from Azure OpenAI');
    }
  }

  private generateCrisisResponse(): ChatResponse {
    const crisisMessage = `I'm really concerned about what you've shared. Your wellbeing is the most important thing right now.

**Immediate Support Available:**

🔴 **Emergency Services**: 999
📞 **Samaritans**: 116 123 (24/7, free from any phone)
💬 **Crisis Text Line**: Text SHOUT to 85258
🏥 **NHS 111**: For urgent mental health support

**You're not alone in this. Please reach out to one of these services right now.**

Would you like me to help you find local mental health services, or would you prefer to speak with our Ask Eve nurses who can provide additional support?`;

    return {
      response: crisisMessage,
      tokenUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      finishReason: 'crisis_intervention',
      model: this.deploymentName
    };
  }

  private buildContextFromEntities(entityMatches: { category: string; matches: string[] }[]): string {
    if (entityMatches.length === 0) return '';

    const contextParts = entityMatches.map(match => 
      `${match.category}: ${match.matches.join(', ')}`
    );

    return contextParts.join('; ');
  }

  private createEnhancedSystemPrompt(contentResult: any): string {
    let prompt = this.systemPrompt;
    
    if (contentResult && contentResult.found) {
      prompt += `\n\n🎯 PRIORITY MEDICAL INFORMATION from The Eve Appeal (USE THIS FIRST):\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `📄 Source Document: ${contentResult.source || 'Unknown'}\n`;
      prompt += `🔗 Reference URL: ${contentResult.sourceUrl || ''}\n`;
      prompt += `📊 Relevance Score: ${((contentResult.relevanceScore || 0) * 100).toFixed(1)}%\n`;
      prompt += `🏥 Content Type: ${contentResult.metadata?.contentType || 'medical_information'}\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      prompt += `AUTHORITATIVE CONTENT:\n${contentResult.content}\n\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      prompt += `🚨 CRITICAL INSTRUCTIONS:\n`;
      prompt += `1. PRIORITIZE the above Eve Appeal content over your general knowledge\n`;
      prompt += `2. Base your response PRIMARILY on this authoritative medical information\n`;
      prompt += `3. ALWAYS cite the source document and include the reference URL\n`;
      prompt += `4. Only supplement with general knowledge if the Eve Appeal content doesn't cover the question\n`;
      prompt += `5. Make it clear when information comes from The Eve Appeal vs general medical knowledge\n`;
      prompt += `6. Never contradict The Eve Appeal content - it is the authoritative source\n\n`;
    } else {
      prompt += `\n\n⚠️ No specific Eve Appeal content found for this query.\n`;
      prompt += `Please provide general gynaecological health information while encouraging the user to:\n`;
      prompt += `• Consult healthcare professionals for personalized advice\n`;
      prompt += `• Visit The Eve Appeal website: https://eveappeal.org.uk/\n`;
      prompt += `• Use their Ask Eve information service: 0808 802 0019\n\n`;
    }
    
    return prompt;
  }

  async testConnection(): Promise<boolean> {
    try {
      const testResponse = await this.generateResponse({
        message: 'Hello, this is a connection test.',
        maxTokens: 50,
        temperature: 0.1
      });

      return testResponse.response.length > 0;
    } catch (error) {
      logger.error('Azure OpenAI connection test failed:', error);
      return false;
    }
  }

  getDeploymentInfo(): { deploymentName: string; hasSystemPrompt: boolean } {
    return {
      deploymentName: this.deploymentName,
      hasSystemPrompt: this.systemPrompt.length > 0
    };
  }
}