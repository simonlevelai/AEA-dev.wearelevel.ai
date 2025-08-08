import { z } from 'zod';

// Agent system types for M365 Agents SDK 2025 multi-agent architecture

export type AgentId = 
  | 'safety_agent'
  | 'content_agent' 
  | 'escalation_agent'
  | 'conversation_agent'
  | 'analytics_agent';

export type AgentCapability = 
  | 'crisis_detection'
  | 'content_search'
  | 'medical_validation'
  | 'escalation_coordination'
  | 'conversation_management'
  | 'nurse_callback'
  | 'teams_notification'
  | 'performance_monitoring';

export type MessagePriority = 'immediate' | 'high' | 'normal' | 'low';

export type AgentMessageType = 
  | 'safety_check_request'
  | 'safety_cleared'
  | 'crisis_detected'
  | 'content_search_request'
  | 'content_found'
  | 'no_content_found'
  | 'escalation_required'
  | 'escalation_initiated'
  | 'callback_scheduled'
  | 'conversation_complete'
  | 'error_occurred';

// Zod schemas for validation
export const AgentPayloadSchema = z.object({
  messageId: z.string(),
  timestamp: z.number(),
  conversationId: z.string(),
  userId: z.string(),
  data: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional()
});

export const AgentMessageSchema = z.object({
  id: z.string(),
  fromAgent: z.enum(['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent']),
  toAgent: z.enum(['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent']),
  messageType: z.enum([
    'safety_check_request',
    'safety_cleared', 
    'crisis_detected',
    'content_search_request',
    'content_found',
    'no_content_found',
    'escalation_required',
    'escalation_initiated',
    'callback_scheduled',
    'conversation_complete',
    'error_occurred'
  ]),
  payload: AgentPayloadSchema,
  priority: z.enum(['immediate', 'high', 'normal', 'low']),
  timestamp: z.number(),
  expiresAt: z.number().optional()
});

export const AgentResponseSchema = z.object({
  messageId: z.string(),
  agentId: z.enum(['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent']),
  success: z.boolean(),
  responseTime: z.number(),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  nextActions: z.array(z.string()).optional(),
  handoffRequired: z.boolean().optional(),
  handoffTarget: z.enum(['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent']).optional()
});

export const AgentCapabilitiesSchema = z.object({
  agentId: z.enum(['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent']),
  name: z.string(),
  description: z.string(),
  capabilities: z.array(z.enum([
    'crisis_detection',
    'content_search', 
    'medical_validation',
    'escalation_coordination',
    'conversation_management',
    'nurse_callback',
    'teams_notification',
    'performance_monitoring'
  ])),
  responseTimeTarget: z.number(), // milliseconds
  priority: z.number().min(1).max(10), // 1 = highest priority
  isActive: z.boolean(),
  healthEndpoint: z.string().optional()
});

export const ConversationContextSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  messageHistory: z.array(z.object({
    text: z.string(),
    isUser: z.boolean(),
    timestamp: z.number(),
    agentId: z.enum(['safety_agent', 'content_agent', 'escalation_agent', 'conversation_agent', 'analytics_agent']).optional()
  })),
  currentTopic: z.string().optional(),
  safetyStatus: z.enum(['unknown', 'safe', 'concern', 'crisis']),
  escalationStatus: z.enum(['none', 'pending', 'initiated', 'completed']),
  metadata: z.record(z.unknown())
});

// Type definitions  
export type AgentPayload = z.infer<typeof AgentPayloadSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

// Agent interface definitions
export interface IAgent {
  readonly id: AgentId;
  readonly capabilities: AgentCapabilities;
  
  // Core agent methods
  initialize(): Promise<void>;
  processMessage(message: AgentMessage, context: ConversationContext): Promise<AgentResponse>;
  handleHandoff(fromAgent: AgentId, payload: AgentPayload): Promise<AgentResponse>;
  getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, unknown> }>;
  
  // Agent lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

export interface IChatManager {
  // Multi-agent orchestration
  orchestrateConversation(
    userMessage: string,
    conversationContext: ConversationContext
  ): Promise<AgentResponse>;
  
  // Agent coordination
  routeMessage(message: AgentMessage): Promise<AgentResponse>;
  coordinateHandoff(fromAgent: AgentId, toAgent: AgentId, payload: AgentPayload): Promise<AgentResponse>;
  
  // Group chat orchestration (≤3 agents)
  initiateGroupChat(
    agents: AgentId[],
    conversationContext: ConversationContext
  ): Promise<AgentResponse>;
  
  // Agent management
  registerAgent(agent: IAgent): Promise<void>;
  unregisterAgent(agentId: AgentId): Promise<void>;
  getActiveAgents(): AgentId[];
  
  // Monitoring
  getOrchestrationMetrics(): Promise<OrchestrationMetrics>;
}

export interface OrchestrationMetrics {
  activeAgents: number;
  totalMessages: number;
  averageResponseTime: number;
  handoffSuccessRate: number;
  errorRate: number;
  agentMetrics: Record<AgentId, {
    messagesProcessed: number;
    averageResponseTime: number;
    errorCount: number;
    lastActive: number;
  }>;
}

export interface SafetyAgentConfig {
  crisisDetectionTimeoutMs: number;
  triggerFiles: {
    crisisTriggersPath: string;
    highConcernTriggersPath: string;
    emotionalSupportTriggersPath: string;
  };
  emergencyContacts: {
    emergency: string;
    samaritans: string;
    nhs: string;
    crisisText: string;
  };
}

export interface ContentAgentConfig {
  supabaseConfig: {
    url: string;
    anonKey: string;
  };
  searchConfig: {
    maxResults: number;
    relevanceThreshold: number;
    requireSourceUrl: boolean;
  };
  mhraCompliance: {
    requireDisclaimers: boolean;
    prohibitDiagnosis: boolean;
    mandatorySourceAttribution: boolean;
  };
}

export interface EscalationAgentConfig {
  teamsWebhookUrl: string;
  nurseCallbackConfig: {
    availableHours: string;
    maxWaitTime: number;
    priorityLevels: ('immediate' | 'urgent' | 'standard')[];
  };
  gdprConfig: {
    retentionDays: number;
    consentRequired: boolean;
    auditLogging: boolean;
  };
}

export interface ConversationAgentConfig {
  openaiConfig: {
    apiKey: string;
    endpoint: string;
    deploymentName: string;
    temperature: number;
  };
  conversationFlow: {
    maxTurns: number;
    contextWindow: number;
    memoryManagement: 'full' | 'sliding' | 'summarized';
  };
  botDisclosure: {
    text: string;
    followUp: string;
    suggestedActions: string[];
  };
}