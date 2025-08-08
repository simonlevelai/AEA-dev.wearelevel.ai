import { z } from 'zod';

// Conversation state types for Ask Eve Assist conversation flow
export type ConversationTopic = 
  | 'conversation_start'
  | 'crisis_support_routing' 
  | 'health_information_router'
  | 'nurse_escalation_handler'
  | 'support_options_overview'
  | 'user_satisfaction_handler'
  | 'exit_intent_detection'
  | 'fallback'
  | 'end_of_conversation'
  | 'on_error'
  | 'multiple_topics_matched';

export type ConversationStage = 
  | 'greeting'
  | 'consent_capture' 
  | 'topic_detection'
  | 'information_gathering'
  | 'contact_collection'
  | 'escalation'
  | 'crisis_response'
  | 'safety_planning'
  | 'satisfaction_check'
  | 'completion';

export type ConsentStatus = 
  | 'not_requested'
  | 'requested'
  | 'granted'
  | 'declined'
  | 'expired';

// Zod schemas for validation
export const UserContactInfoSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^(\+44|0)[1-9]\d{8,9}$/, 'Please provide a valid UK phone number'),
  email: z.string().email('Please provide a valid email address'),
  preferredContact: z.enum(['phone', 'email']).optional(),
  consentTimestamp: z.number(),
  gdprConsent: z.boolean()
});

export const ConversationStateSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  currentTopic: z.nativeEnum({
    conversation_start: 'conversation_start',
    crisis_support_routing: 'crisis_support_routing',
    health_information_router: 'health_information_router', 
    nurse_escalation_handler: 'nurse_escalation_handler',
    support_options_overview: 'support_options_overview',
    user_satisfaction_handler: 'user_satisfaction_handler',
    exit_intent_detection: 'exit_intent_detection',
    fallback: 'fallback',
    end_of_conversation: 'end_of_conversation',
    on_error: 'on_error',
    multiple_topics_matched: 'multiple_topics_matched'
  } as const),
  currentStage: z.nativeEnum({
    greeting: 'greeting',
    consent_capture: 'consent_capture',
    topic_detection: 'topic_detection', 
    information_gathering: 'information_gathering',
    contact_collection: 'contact_collection',
    escalation: 'escalation',
    crisis_response: 'crisis_response',
    safety_planning: 'safety_planning',
    satisfaction_check: 'satisfaction_check',
    completion: 'completion'
  } as const),
  consentStatus: z.nativeEnum({
    not_requested: 'not_requested',
    requested: 'requested', 
    granted: 'granted',
    declined: 'declined',
    expired: 'expired'
  } as const),
  userContactInfo: UserContactInfoSchema.optional(),
  conversationStarted: z.boolean(),
  hasSeenOpeningStatement: z.boolean(),
  lastActivity: z.number(),
  messageCount: z.number(),
  topics: z.array(z.string()),
  context: z.record(z.unknown()).optional(),
  escalationRequired: z.boolean().optional(),
  escalationId: z.string().optional(),
  satisfactionRating: z.number().min(1).max(5).optional(),
  completionReason: z.string().optional()
});

// Type definitions
export type UserContactInfo = z.infer<typeof UserContactInfoSchema>;
export type ConversationState = z.infer<typeof ConversationStateSchema>;

export interface ConversationMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
  topic?: ConversationTopic;
  stage?: ConversationStage;
  metadata?: Record<string, unknown>;
}

export interface TopicTransitionResult {
  success: boolean;
  newTopic: ConversationTopic;
  newStage: ConversationStage;
  requiresUserAction: boolean;
  message?: string;
  suggestedActions?: string[];
  error?: string;
}

export interface ConversationFlowResult {
  response: {
    text: string;
    suggestedActions?: string[];
    attachments?: Array<{
      contentType: string;
      content: unknown;
    }>;
  };
  newState: ConversationState;
  topicTransition?: TopicTransitionResult;
  escalationTriggered: boolean;
  conversationEnded: boolean;
}

export interface TopicDetectionResult {
  detectedTopic: ConversationTopic;
  confidence: number;
  reason: string;
  alternativeTopics?: Array<{
    topic: ConversationTopic;
    confidence: number;
  }>;
}

export interface ConsentCaptureOptions {
  purpose: 'health_information_access' | 'nurse_escalation' | 'data_collection';
  requiredConsents: Array<'data_processing' | 'contact_storage' | 'nurse_communication'>;
  retentionPeriod: string;
  dataUsage: string;
}

export interface ContactCollectionStep {
  field: 'name' | 'phone' | 'email' | 'preferred_contact';
  required: boolean;
  prompt: string;
  validation?: (value: string) => { valid: boolean; error?: string };
  completed: boolean;
  value?: string;
}

export interface NurseEscalationContext {
  userQuery: string;
  healthConcern: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  userContactInfo: UserContactInfo;
  conversationSummary: string;
  detectedTopics: string[];
  timestamp: number;
  escalationId: string;
}