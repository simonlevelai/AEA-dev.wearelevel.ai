/**
 * Conversation types for Ask Eve Assist
 * Minimal interface for Azure Table Storage integration
 */

export interface ConversationState {
  conversationId: string;
  userId: string;
  sessionId: string;
  currentTopic: ConversationTopic;
  currentStage: ConversationStage;
  consentStatus: ConsentStatus;
  userContactInfo?: UserContactInfo;
  conversationStarted: boolean;
  hasSeenOpeningStatement: boolean;
  lastActivity: number;
  messageCount: number;
  topics: ConversationTopic[];
  context?: Record<string, unknown>;
  escalationRequired?: boolean;
  escalationId?: string;
  escalatedToNurse?: boolean;
  escalationTimestamp?: Date;
  satisfactionRating?: number;
  completionReason?: string;
  crisisDetected?: boolean;
}

export interface UserContactInfo {
  name?: string;
  email?: string;
  phoneNumber?: string;
  preferredContactMethod?: 'email' | 'phone';
  consentGiven: boolean;
  consentTimestamp: Date;
}

export type ConversationTopic = 
  | 'cervical_cancer'
  | 'ovarian_cancer' 
  | 'vulval_cancer'
  | 'vaginal_cancer'
  | 'womb_cancer'
  | 'hpv'
  | 'screening'
  | 'symptoms'
  | 'support'
  | 'general'
  | 'crisis';

export type ConversationStage = 
  | 'initial'
  | 'information_gathering'
  | 'providing_information'
  | 'escalation_offered'
  | 'escalation_declined'
  | 'escalation_accepted'
  | 'gdpr_consent'
  | 'contact_collection'
  | 'nurse_handover'
  | 'completed';

export type ConsentStatus = 
  | 'not_requested'
  | 'requested'
  | 'given'
  | 'declined'
  | 'expired';

export interface EscalationState {
  stage: 'consent' | 'name' | 'contact_method' | 'contact_details' | 'confirmation' | 'completed';
  data: {
    consentGiven?: boolean;
    name?: string;
    contactMethod?: 'email' | 'phone';
    email?: string;
    phoneNumber?: string;
  };
  startTime: number;
  lastUpdate: number;
}