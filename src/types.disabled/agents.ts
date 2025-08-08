import { z } from 'zod';

// Healthcare bot types for Microsoft 365 Agents SDK integration

export type MessagePriority = 'immediate' | 'high' | 'normal' | 'low';

export type CrisisLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type HealthcareResponseType = 
  | 'crisis_response'
  | 'health_information'
  | 'escalation_required'
  | 'fallback_response'
  | 'error_response';

// Zod schemas for healthcare bot validation
export const HealthcareMessageSchema = z.object({
  id: z.string(),
  text: z.string(),
  userId: z.string(),
  conversationId: z.string(),
  timestamp: z.number(),
  priority: z.enum(['immediate', 'high', 'normal', 'low']),
  metadata: z.record(z.unknown()).optional()
});

export const CrisisDetectionResultSchema = z.object({
  isCrisis: z.boolean(),
  severity: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  responseTime: z.number(),
  triggeredPatterns: z.array(z.string()),
  emergencyContacts: z.object({
    emergency: z.string(),
    samaritans: z.string(),
    nhs: z.string(),
    crisisText: z.string()
  }).optional()
});

export const HealthcareResponseSchema = z.object({
  messageId: z.string(),
  responseType: z.enum(['crisis_response', 'health_information', 'escalation_required', 'fallback_response', 'error_response']),
  text: z.string(),
  success: z.boolean(),
  responseTime: z.number(),
  crisisDetected: z.boolean(),
  escalationRequired: z.boolean(),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string(),
    type: z.string()
  })).optional(),
  error: z.string().optional()
});

export const ConversationDataSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  messageHistory: z.array(z.object({
    text: z.string(),
    isUser: z.boolean(),
    timestamp: z.number(),
    crisisDetected: z.boolean().optional(),
    responseType: z.enum(['crisis_response', 'health_information', 'escalation_required', 'fallback_response', 'error_response']).optional()
  })),
  currentTopic: z.string().optional(),
  safetyStatus: z.enum(['unknown', 'safe', 'concern', 'crisis']),
  escalationStatus: z.enum(['none', 'pending', 'initiated', 'completed']),
  userPreferences: z.object({
    hasSeenWelcome: z.boolean(),
    totalMessages: z.number(),
    lastCrisisCheck: z.number()
  }),
  metadata: z.record(z.unknown())
});

export const TeamsEscalationSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  severity: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  message: z.string(),
  timestamp: z.number(),
  escalationType: z.enum(['crisis', 'nurse_callback', 'medical_query']),
  webhookUrl: z.string()
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

export interface HealthcareBotConfig {
  // Crisis detection configuration
  crisisDetection: {
    responseTimeTargetMs: number;
    emergencyContacts: {
      emergency: string;
      samaritans: string;
      nhs: string;
      crisisText: string;
    };
  };
  
  // Content service configuration
  contentService: {
    azureSearchConfig: {
      endpoint: string;
      apiKey: string;
      indexName: string;
    };
    mhraCompliance: {
      requireDisclaimers: boolean;
      prohibitDiagnosis: boolean;
      mandatorySourceAttribution: boolean;
    };
  };
  
  // Teams escalation configuration
  teamsEscalation: {
    webhookUrl: string;
    escalationTimeoutMs: number;
    nurseCallbackEnabled: boolean;
  };
  
  // Microsoft 365 SDK configuration
  microsoft365: {
    appId: string;
    appPassword: string;
    appType: string;
    tenantId: string;
  };
  
  // Azure OpenAI configuration
  openai: {
    apiKey: string;
    endpoint: string;
    deploymentName: string;
    region: 'uksouth'; // UK data residency
  };
  
  // GDPR compliance configuration
  gdpr: {
    dataRetentionDays: number;
    consentRequired: boolean;
    auditLogging: boolean;
  };
}

// Microsoft 365 SDK conversation state types
export interface ConversationStateData {
  conversationHistory: string[];
  crisisDetected: boolean;
  lastMessageTime: number;
  escalationTriggered: boolean;
}

export interface UserProfileData {
  hasSeenWelcome: boolean;
  totalMessages: number;
  lastCrisisCheck: number;
  preferredLanguage?: string;
}