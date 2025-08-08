import { TurnContext } from 'botbuilder';

export type MessageContext = {
  message: {
    text: string;
    id: string;
  };
  conversationId: string;
  userId: string;
  conversationHistory: Array<{
    text: string;
    isUser: boolean;
    timestamp: Date;
  }>;
  send: (_response: AgentResponse) => Promise<void>;
  sendTyping: () => Promise<void>;
  turnContext?: TurnContext;
};

export type AgentResponse = {
  text: string;
  attachments?: Array<{
    contentType: string;
    content: unknown;
  }>;
  markdown?: string;
  suggestedActions?: string[];
};

export type SafetyResult = {
  shouldEscalate: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason?: string;
  escalationType?: 'medical_emergency' | 'self_harm' | 'inappropriate_content';
};

export type SearchResponse = {
  found: boolean;
  content?: string;
  source?: string;
  sourceUrl?: string;
  relevanceScore?: number;
  metadata?: {
    bestMatchSource?: string;
    contentType?: string;
    priorityLevel?: string;
    medicalCategories?: string[];
    chunkId?: string;
  };
};

export type BotDisclosure = {
  text: string;
  followUp: string;
  suggestedActions: string[];
};

export type AgentOptions = {
  botId: string;
  botName: string;
  safetyService: SafetyService;
  contentService: ContentService;
  // TODO: Re-enable after fixing service dependencies
  // failoverManager?: import('../services/FailoverManager').FailoverManager;
};

export interface SafetyService {
  analyzeMessage(_text: string, _conversationHistory: MessageContext['conversationHistory']): Promise<SafetyResult>;
}

export interface ContentService {
  searchContent(_query: string): Promise<SearchResponse>;
}