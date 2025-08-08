import { z } from 'zod';

export const SeverityLevelSchema = z.enum(['crisis', 'high_concern', 'emotional_support', 'general']);
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>;

export const TriggerCategorySchema = z.enum([
  'suicide_ideation',
  'self_harm', 
  'severe_distress',
  'life_threatening',
  'severe_bleeding',
  'extreme_pain',
  'consciousness_issues',
  'immediate_danger',
  'medical_concerns',
  'mental_health_concerns',
  'social_concerns',
  'emotional_support',
  'general_wellbeing',
  'callback_request',
  'crisis_support'
]);
export type TriggerCategory = z.infer<typeof TriggerCategorySchema>;

export const ConversationContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  messageHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.number()
  })),
  userProfile: z.object({
    age: z.number().optional(),
    vulnerabilityFlags: z.array(z.string()).default([]),
    previousEscalations: z.array(z.string()).default([])
  }).optional()
});
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const TriggerMatchSchema = z.object({
  trigger: z.string(),
  confidence: z.number().min(0).max(1),
  category: TriggerCategorySchema,
  severity: SeverityLevelSchema,
  position: z.object({
    start: z.number(),
    end: z.number()
  }),
  matchType: z.enum(['exact', 'fuzzy', 'pattern', 'context'])
});
export type TriggerMatch = z.infer<typeof TriggerMatchSchema>;

export const SafetyResultSchema = z.object({
  severity: SeverityLevelSchema,
  confidence: z.number().min(0).max(1),
  requiresEscalation: z.boolean(),
  matches: z.array(TriggerMatchSchema),
  riskFactors: z.array(z.string()),
  contextualConcerns: z.array(z.string()),
  analysisTime: z.number(),
  recommendedActions: z.array(z.string())
});
export type SafetyResult = z.infer<typeof SafetyResultSchema>;

export const CrisisResponseSchema = z.object({
  immediateMessage: z.string(),
  resources: z.array(z.object({
    name: z.string(),
    contact: z.string(),
    description: z.string(),
    availability: z.string()
  })),
  escalationRequired: z.boolean(),
  followUpRequired: z.boolean(),
  disclaimers: z.array(z.string()),
  responseTime: z.number()
});
export type CrisisResponse = z.infer<typeof CrisisResponseSchema>;

// Contact details schema for escalations
export const ContactDetailsSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  preferredContact: z.enum(['phone', 'email', 'both']),
  bestTimeToCall: z.string().optional(),
  alternativeContact: z.string().optional()
});
export type ContactDetailsForEscalation = z.infer<typeof ContactDetailsSchema>;

export const EscalationEventSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  severity: SeverityLevelSchema,
  safetyResult: SafetyResultSchema,
  userMessage: z.string(),
  timestamp: z.number(),
  notificationSent: z.boolean(),
  nurseTeamAlerted: z.boolean(),
  responseGenerated: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
  contactDetails: ContactDetailsSchema.optional(),
  escalationType: z.enum(['crisis', 'nurse_callback', 'general_support']).default('general_support'),
  callbackRequested: z.boolean().default(false),
  preferredContactMethod: z.string().optional(),
  urgencyLevel: z.enum(['immediate', 'high', 'medium', 'low']).default('medium')
});
export type EscalationEvent = z.infer<typeof EscalationEventSchema>;

export const NotificationPayloadSchema = z.object({
  escalationId: z.string(),
  severity: SeverityLevelSchema,
  userId: z.string(),
  summary: z.string(),
  triggerMatches: z.array(z.string()),
  timestamp: z.number(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']),
  requiresCallback: z.boolean(),
  contactDetails: ContactDetailsSchema.optional(),
  escalationType: z.enum(['crisis', 'nurse_callback', 'general_support']).optional(),
  preferredContactMethod: z.string().optional()
});
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export const SafetyConfigSchema = z.object({
  response_times: z.object({
    crisis_detection_ms: z.number(),
    crisis_response_ms: z.number(),
    nurse_notification_ms: z.number(),
    audit_logging_ms: z.number()
  }),
  escalation_levels: z.record(z.object({
    priority: z.number(),
    immediate_response: z.boolean(),
    nurse_notification: z.boolean(),
    supervisor_alert: z.boolean(),
    log_level: z.string()
  })),
  crisis_responses: z.object({
    suicide_ideation: z.object({
      message: z.string(),
      resources: z.array(z.object({
        name: z.string(),
        contact: z.string(),
        description: z.string(),
        availability: z.string()
      }))
    }),
    self_harm: z.object({
      message: z.string(),
      resources: z.array(z.object({
        name: z.string(),
        contact: z.string(),
        description: z.string(),
        availability: z.string()
      }))
    }),
    medical_emergency: z.object({
      message: z.string(),
      resources: z.array(z.object({
        name: z.string(),
        contact: z.string(),
        description: z.string(),
        availability: z.string()
      })),
      immediate_resources: z.array(z.string())
    }),
    mental_health: z.object({
      message: z.string(),
      immediate_resources: z.array(z.string())
    }),
    domestic_violence: z.object({
      message: z.string(),
      immediate_resources: z.array(z.string())
    })
  }),
  mhra_compliance: z.object({
    prohibited_patterns: z.array(z.string()),
    required_disclaimers: z.record(z.string())
  })
});
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;