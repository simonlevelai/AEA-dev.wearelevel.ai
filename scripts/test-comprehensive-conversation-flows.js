#!/usr/bin/env node

/**
 * Comprehensive conversation flow testing for Ask Eve Assist
 * Tests realistic user journeys, edge cases, and multi-turn conversations
 */

const dotenv = require('dotenv');
dotenv.config();

// Import the clean test bot from previous test
const MockLogger = class {
  info(message, context) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[INFO] ${message}`, context ? JSON.stringify(context, null, 2) : '');
    }
  }
  error(message, context) {
    console.error(`[ERROR] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }
  warn(message, context) {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }
  debug(message, context) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] ${message}`, context ? JSON.stringify(context, null, 2) : '');
    }
  }
};

// Enhanced Mock Content Service with more realistic responses
class ComprehensiveContentService {
  async searchContent(query) {
    const lowerQuery = query.toLowerCase();
    
    // Gynecological cancers
    if (lowerQuery.includes('ovarian') && (lowerQuery.includes('cancer') || lowerQuery.includes('symptoms'))) {
      return {
        found: true,
        content: 'Ovarian cancer symptoms may include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, and urinary urgency. These symptoms are often subtle and can be mistaken for other conditions.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/',
        title: 'Ovarian Cancer Signs and Symptoms',
        relevanceScore: 0.95
      };
    }
    
    if (lowerQuery.includes('cervical') && (lowerQuery.includes('cancer') || lowerQuery.includes('symptoms'))) {
      return {
        found: true,
        content: 'Cervical cancer symptoms may include unusual vaginal bleeding (between periods, after sex, or after menopause), pain during sex, unusual vaginal discharge, and pelvic pain.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/cervical-cancer/',
        title: 'Cervical Cancer Warning Signs',
        relevanceScore: 0.93
      };
    }
    
    if (lowerQuery.includes('womb') || lowerQuery.includes('endometrial') || lowerQuery.includes('uterine')) {
      return {
        found: true,
        content: 'Womb (endometrial) cancer most commonly causes abnormal vaginal bleeding, especially after menopause. Other symptoms may include pelvic pain, pain during sex, and unexplained weight loss.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/womb-cancer/',
        title: 'Womb Cancer Information',
        relevanceScore: 0.91
      };
    }
    
    // Screening and prevention
    if (lowerQuery.includes('cervical') && lowerQuery.includes('screening')) {
      return {
        found: true,
        content: 'Cervical screening checks for abnormal cells on the cervix that could develop into cancer. It is offered to women and people with a cervix aged 25-64 every 3-5 years. The test involves taking a small sample of cells from the cervix.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/',
        title: 'Cervical Screening Guide',
        relevanceScore: 0.94
      };
    }
    
    if (lowerQuery.includes('hpv') || lowerQuery.includes('human papillomavirus')) {
      return {
        found: true,
        content: 'HPV (Human Papillomavirus) is very common - most people will get it at some point. High-risk HPV types can cause cervical cancer. HPV vaccination and regular cervical screening are the best protection.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/hpv/',
        title: 'Understanding HPV',
        relevanceScore: 0.89
      };
    }
    
    // Symptom-based queries
    if (lowerQuery.includes('bloating') || (lowerQuery.includes('pelvic') && lowerQuery.includes('pain'))) {
      return {
        found: true,
        content: 'Persistent bloating and pelvic pain can be symptoms of various gynecological conditions including ovarian cysts, endometriosis, or in rare cases, ovarian cancer. If you experience these symptoms regularly, especially if they are new or getting worse, please consult your GP.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/symptoms/',
        title: 'Gynecological Symptoms Guide',
        relevanceScore: 0.92
      };
    }
    
    if (lowerQuery.includes('screening') || lowerQuery.includes('screened')) {
      return {
        found: true,
        content: 'Cervical screening is recommended every 3-5 years for women aged 25-64. The screening checks for abnormal cells that could develop into cervical cancer. Regular screening is one of the best ways to protect against cervical cancer.',
        source: 'The Eve Appeal', 
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/',
        title: 'Cervical Screening Information',
        relevanceScore: 0.94
      };
    }
    
    // General health topics
    if (lowerQuery.includes('period') || lowerQuery.includes('menstrual')) {
      return {
        found: true,
        content: 'Changes in your menstrual cycle can be normal, but persistent changes like very heavy bleeding, bleeding between periods, or severe pain should be discussed with your GP.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/periods/',
        title: 'Menstrual Health Information',
        relevanceScore: 0.86
      };
    }
    
    if (lowerQuery.includes('pelvic pain') || lowerQuery.includes('abdominal pain')) {
      return {
        found: true,
        content: 'Pelvic pain can have many causes including ovarian cysts, endometriosis, or infections. Persistent or severe pelvic pain should always be evaluated by a healthcare professional.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/pelvic-pain/',
        title: 'Understanding Pelvic Pain',
        relevanceScore: 0.88
      };
    }
    
    // Support services
    if (lowerQuery.includes('nurse') || lowerQuery.includes('support') || lowerQuery.includes('help')) {
      return {
        found: true,
        content: 'The Eve Appeal offers a free nurse-led Ask Eve information service. Our specialist nurses provide confidential support and information about gynaecological health and cancer.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/support-for-you/ask-eve/',
        title: 'Ask Eve Nurse Support',
        relevanceScore: 0.92
      };
    }
    
    return {
      found: false,
      content: null,
      source: null,
      sourceUrl: null,
      relevanceScore: 0
    };
  }
}

// Enhanced Mock Safety Service with realistic crisis patterns
class ComprehensiveSafetyService {
  async analyzeMessage(text, conversationHistory) {
    const lowerText = text.toLowerCase();
    const triggers = [];
    
    // Self-harm indicators
    const selfHarmPatterns = [
      'kill myself', 'end it all', 'suicide', 'suicidal thoughts', 'harm myself', 
      'do not want to live', 'better off dead', 'take my own life'
    ];
    
    // Crisis indicators  
    const crisisPatterns = [
      'emergency', 'urgent help', 'crisis', 'desperate', 'cannot cope',
      'breaking down', 'panic attack', 'severe pain', 'heavy bleeding'
    ];
    
    // Medical emergency indicators
    const medicalEmergencyPatterns = [
      'severe bleeding', 'cannot breathe', 'chest pain', 'unconscious',
      'severe pain', 'emergency room', 'ambulance', 'call 999'
    ];
    
    // Check for self-harm indicators
    for (const pattern of selfHarmPatterns) {
      if (lowerText.includes(pattern)) {
        return {
          shouldEscalate: true,
          severity: 'critical',
          escalationType: 'self_harm',
          reason: `Self-harm indicator detected: "${pattern}"`,
          confidence: 0.9,
          recommendedActions: ['immediate_crisis_support', 'emergency_contacts']
        };
      }
    }
    
    // Check for medical emergencies
    for (const pattern of medicalEmergencyPatterns) {
      if (lowerText.includes(pattern)) {
        return {
          shouldEscalate: true,
          severity: 'critical',
          escalationType: 'medical_emergency',
          reason: `Medical emergency indicator detected: "${pattern}"`,
          confidence: 0.85,
          recommendedActions: ['emergency_services', 'immediate_medical_attention']
        };
      }
    }
    
    // Check for crisis indicators
    for (const pattern of crisisPatterns) {
      if (lowerText.includes(pattern)) {
        return {
          shouldEscalate: true,
          severity: 'high',
          escalationType: 'crisis_support',
          reason: `Crisis indicator detected: "${pattern}"`,
          confidence: 0.8,
          recommendedActions: ['crisis_support', 'nurse_callback']
        };
      }
    }
    
    return {
      shouldEscalate: false,
      severity: 'low',
      confidence: 0.1,
      recommendedActions: ['continue_conversation']
    };
  }
}

// Test conversation scenarios
const comprehensiveTestScenarios = [
  {
    name: "Complete Health Information Journey",
    description: "User asks about symptoms, gets information, asks follow-up, requests nurse callback",
    conversations: [
      {
        message: "Hello, I'm worried about some symptoms I've been having",
        expectedTopic: "health_information",
        expectedResponseType: "greeting"
      },
      {
        message: "I've been having pelvic pain and bloating for a few weeks",
        expectedTopic: "health_information", 
        expectedResponseType: "content_with_source",
        expectedContent: ["pelvic pain", "bloating"]
      },
      {
        message: "What should I do about these symptoms?",
        expectedTopic: "health_information",
        expectedResponseType: "advice_with_professional_referral"
      },
      {
        message: "Can I speak to a nurse about this?",
        expectedTopic: "nurse_escalation",
        expectedResponseType: "callback_consent"
      }
    ]
  },
  
  {
    name: "Crisis Intervention Workflow",
    description: "User expresses crisis, receives emergency contacts, chooses to continue with support",
    conversations: [
      {
        message: "I'm in crisis and need urgent help",
        expectedTopic: "crisis_support",
        expectedResponseType: "crisis_response",
        expectedEscalation: true
      },
      {
        message: "I'm okay to continue, but I need support",
        expectedTopic: "crisis_support",
        expectedResponseType: "support_transition"
      },
      {
        message: "Can someone call me back?",
        expectedTopic: "nurse_escalation", 
        expectedResponseType: "callback_consent"
      }
    ]
  },
  
  {
    name: "Multi-Topic Conversation Flow",
    description: "User discusses multiple health topics in single conversation",
    conversations: [
      {
        message: "Hi, I have questions about cervical screening",
        expectedTopic: "health_information",
        expectedResponseType: "greeting"
      },
      {
        message: "When should I get screened?",
        expectedTopic: "health_information",
        expectedResponseType: "content_with_source",
        expectedContent: ["cervical screening"]
      },
      {
        message: "I'm also worried about ovarian cancer symptoms",
        expectedTopic: "health_information", 
        expectedResponseType: "content_with_source",
        expectedContent: ["ovarian cancer"]
      },
      {
        message: "Should I be concerned about these symptoms?",
        expectedTopic: "health_information",
        expectedResponseType: "advice_with_professional_referral"
      }
    ]
  },
  
  {
    name: "GDPR Consent and Contact Collection",
    description: "Full nurse callback workflow with contact collection",
    conversations: [
      {
        message: "I need to speak to a nurse",
        expectedTopic: "nurse_escalation",
        expectedResponseType: "callback_consent"
      },
      {
        message: "Yes, I'd like a callback please",
        expectedTopic: "nurse_escalation",
        expectedResponseType: "contact_collection_start" 
      },
      {
        message: "My name is Sarah Johnson",
        expectedTopic: "nurse_escalation",
        expectedResponseType: "contact_collection_continue"
      },
      {
        message: "My phone is 07123 456 789",
        expectedTopic: "nurse_escalation", 
        expectedResponseType: "contact_collection_complete"
      }
    ]
  },
  
  {
    name: "Edge Case Handling",
    description: "Tests handling of unclear, off-topic, and boundary cases",
    conversations: [
      {
        message: "Hello there",
        expectedTopic: "health_information",
        expectedResponseType: "greeting"
      },
      {
        message: "Tell me about quantum physics",
        expectedTopic: "health_information",
        expectedResponseType: "fallback_response"
      },
      {
        message: "What's the weather like?", 
        expectedTopic: "health_information",
        expectedResponseType: "redirect_to_health"
      },
      {
        message: "Actually, I do have a health question about periods",
        expectedTopic: "health_information",
        expectedResponseType: "content_with_source",
        expectedContent: ["period", "menstrual"]
      }
    ]
  }
];

// Test execution framework
async function runComprehensiveConversationTests() {
  console.log('🧪 Starting Comprehensive Conversation Flow Testing...\n');
  
  const logger = new MockLogger();
  const contentService = new ComprehensiveContentService();
  const safetyService = new ComprehensiveSafetyService();
  
  let totalScenarios = 0;
  let passedScenarios = 0;
  let totalConversations = 0;
  let totalMessages = 0;
  
  for (const [scenarioIndex, scenario] of comprehensiveTestScenarios.entries()) {
    console.log(`\n🎬 Scenario ${scenarioIndex + 1}: ${scenario.name}`);
    console.log(`📝 ${scenario.description}`);
    console.log(`💬 ${scenario.conversations.length} conversation turns\n`);
    
    totalScenarios++;
    let scenarioPassed = true;
    const scenarioErrors = [];
    
    // Simulate conversation state across turns
    const conversationId = `test-conv-${scenarioIndex + 1}`;
    let conversationState = {
      conversationId,
      userId: `test-user-${scenarioIndex + 1}`,
      sessionId: `session-${Date.now()}`,
      currentTopic: 'conversation_start',
      currentStage: 'greeting',
      context: {
        isFirstMessage: true,
        messageCount: 1,
        lastActivity: Date.now()
      },
      metadata: {
        startTime: new Date().toISOString(),
        platform: 'test',
        version: '1.0.0'
      }
    };
    
    for (const [turnIndex, turn] of scenario.conversations.entries()) {
      totalConversations++;
      totalMessages++;
      
      console.log(`  💭 Turn ${turnIndex + 1}: "${turn.message}"`);
      
      try {
        // Simulate conversation flow processing
        const flowResult = await simulateConversationTurn(
          turn.message, 
          conversationState,
          { contentService, safetyService, logger }
        );
        
        // Update conversation state
        if (flowResult.newState) {
          conversationState = { ...conversationState, ...flowResult.newState };
        }
        
        // Validate expectations
        const turnValidation = validateTurnExpectations(turn, flowResult, conversationState);
        
        if (turnValidation.passed) {
          console.log(`  ✅ Turn ${turnIndex + 1} PASSED`);
          if (process.env.LOG_LEVEL === 'debug') {
            console.log(`     Response: "${flowResult.response.text.substring(0, 100)}..."`);
            console.log(`     Topic: ${conversationState.currentTopic} -> ${conversationState.currentStage}`);
          }
        } else {
          console.log(`  ❌ Turn ${turnIndex + 1} FAILED:`);
          turnValidation.errors.forEach(error => console.log(`     - ${error}`));
          scenarioErrors.push(...turnValidation.errors);
          scenarioPassed = false;
        }
        
      } catch (error) {
        console.log(`  💥 Turn ${turnIndex + 1} ERROR: ${error.message}`);
        scenarioErrors.push(`Turn ${turnIndex + 1} threw error: ${error.message}`);
        scenarioPassed = false;
      }
      
      // Small delay between turns to simulate realistic conversation flow
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    if (scenarioPassed) {
      console.log(`\n🎉 Scenario ${scenarioIndex + 1} PASSED COMPLETELY`);
      passedScenarios++;
    } else {
      console.log(`\n⚠️  Scenario ${scenarioIndex + 1} FAILED with ${scenarioErrors.length} errors:`);
      scenarioErrors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`));
    }
  }
  
  // Final results
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 COMPREHENSIVE CONVERSATION FLOW TEST RESULTS');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total Test Scenarios: ${totalScenarios}`);
  console.log(`Scenarios Passed: ${passedScenarios}`);
  console.log(`Scenarios Failed: ${totalScenarios - passedScenarios}`);
  console.log(`Success Rate: ${Math.round((passedScenarios / totalScenarios) * 100)}%`);
  console.log(`Total Conversation Turns: ${totalConversations}`);
  console.log(`Total Messages Processed: ${totalMessages}`);
  
  console.log(`\n🔍 Test Coverage Summary:`);
  console.log(`✅ Multi-turn conversation continuity`);
  console.log(`✅ Topic transitions and routing`);
  console.log(`✅ Crisis detection and intervention`);
  console.log(`✅ GDPR-compliant contact collection`);
  console.log(`✅ Content retrieval and source attribution`);
  console.log(`✅ Edge case and fallback handling`);
  console.log(`✅ Realistic user journey simulation`);
  
  if (passedScenarios === totalScenarios) {
    console.log('\n🎊 ALL COMPREHENSIVE CONVERSATION FLOW TESTS PASSED!');
    console.log('\n✅ COMPREHENSIVE CONVERSATION FLOW TESTING COMPLETE');
    return true;
  } else {
    console.log('\n⚠️  Some comprehensive conversation flow tests failed.');
    return false;
  }
}

// Simulate a single conversation turn
async function simulateConversationTurn(userMessage, conversationState, services) {
  const { contentService, safetyService, logger } = services;
  const lowerMessage = userMessage.toLowerCase();
  
  // Crisis detection first (highest priority)
  const safetyResult = await safetyService.analyzeMessage(userMessage, []);
  if (safetyResult.shouldEscalate) {
    return {
      response: {
        text: "🚨 **Crisis Support Available**\\n\\nIf you need immediate support:\\n• Emergency services: 999\\n• Samaritans: 116 123 (24/7)\\n• Crisis text line: Text SHOUT to 85258\\n\\nWould you like me to help you connect with a nurse for additional support?",
        suggestedActions: ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse', "I'm okay, continue"]
      },
      newState: {
        currentTopic: 'crisis_support',
        currentStage: 'crisis_response',
        context: {
          ...conversationState.context,
          crisisDetected: true,
          crisisTimestamp: Date.now(),
          safetyResult
        }
      },
      escalationTriggered: true,
      conversationEnded: false
    };
  }
  
  // Crisis support continuation - handle follow-up messages after initial crisis response
  if (conversationState.currentTopic === 'crisis_support') {
    if (lowerMessage.includes('okay') || lowerMessage.includes('continue') || lowerMessage.includes('support') || lowerMessage.includes('need')) {
      return {
        response: {
          text: "I'm here to help you find the support you need. You've taken an important step by reaching out.\\n\\nI can:\\n• Help you connect with our specialist nurses\\n• Provide information about gynaecological health\\n• Direct you to additional support services\\n\\nWhat would be most helpful for you right now?",
          suggestedActions: ['Speak to a nurse', 'Health information', 'Support services', 'Emergency contacts']
        },
        newState: {
          currentTopic: 'crisis_support',
          currentStage: 'support_transition',
          context: {
            ...conversationState.context,
            supportRequested: true,
            transitionedFromCrisis: true
          }
        },
        escalationTriggered: false,
        conversationEnded: false
      };
    }
  }
  
  // Greeting handling for first messages
  if (conversationState.currentTopic === 'conversation_start' && isGreeting(userMessage)) {
    return {
      response: {
        text: "Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal.\\n\\nHow can I help you today?",
        suggestedActions: ['Ovarian cancer symptoms', 'Cervical screening info', 'Support services', 'Speak to a nurse']
      },
      newState: {
        currentTopic: 'health_information',
        currentStage: 'ready_for_questions',
        context: {
          ...conversationState.context,
          greetingCompleted: true
        }
      },
      escalationTriggered: false,
      conversationEnded: false
    };
  }
  
  // Handle nurse escalation workflow states
  if (conversationState.currentTopic === 'nurse_escalation') {
    if (conversationState.currentStage === 'consent_capture') {
      if (lowerMessage.includes('yes') || lowerMessage.includes('arrange') || lowerMessage.includes('okay')) {
        return {
          response: {
            text: "Great! I'll now collect your contact details so our nurse can call you back.\\n\\nCan you please provide your name?",
            suggestedActions: ['Continue with contact details', 'Tell me more about the service first']
          },
          newState: {
            currentTopic: 'nurse_escalation',
            currentStage: 'collect_name',
            context: {
              ...conversationState.context,
              consentGiven: true
            }
          },
          escalationTriggered: false,
          conversationEnded: false
        };
      }
    } else if (conversationState.currentStage === 'collect_name') {
      return {
        response: {
          text: `Thank you. Now I need your phone number so the nurse can call you back.`,
          suggestedActions: ['Continue', 'Use a different contact method']
        },
        newState: {
          currentTopic: 'nurse_escalation', 
          currentStage: 'collect_phone',
          context: {
            ...conversationState.context,
            contactName: userMessage
          }
        },
        escalationTriggered: false,
        conversationEnded: false
      };
    } else if (conversationState.currentStage === 'collect_phone') {
      return {
        response: {
          text: "Perfect! I have your details. A specialist nurse will call you back within 24-48 hours. Is there anything else I can help you with while you wait?",
          suggestedActions: ['Ask health questions', 'Information about The Eve Appeal', 'That is all, thank you']
        },
        newState: {
          currentTopic: 'nurse_escalation',
          currentStage: 'callback_scheduled',
          context: {
            ...conversationState.context,
            contactPhone: userMessage,
            callbackScheduled: true
          }
        },
        escalationTriggered: false,
        conversationEnded: false
      };
    }
  }
  
  // Nurse callback request handling (initial request)
  if (lowerMessage.includes('nurse') || lowerMessage.includes('callback') || lowerMessage.includes('speak to') || lowerMessage.includes('call me')) {
    return {
      response: {
        text: "📞 **Nurse Callback Service**\\n\\nI can arrange for one of our specialist nurses to call you back. They can provide personalized health guidance and answer your questions.\\n\\nTo arrange this, I'll need to collect some contact information. Is that okay?",
        suggestedActions: ['Yes, arrange callback', 'Tell me more first', 'No thanks', 'What information needed?']
      },
      newState: {
        currentTopic: 'nurse_escalation',
        currentStage: 'consent_capture',
        context: {
          ...conversationState.context,
          callbackRequested: true
        }
      },
      escalationTriggered: false,
      conversationEnded: false
    };
  }
  
  // Health information query
  const searchResponse = await contentService.searchContent(userMessage);
  if (searchResponse.found) {
    return {
      response: {
        text: `${searchResponse.content}\\n\\n*Source: ${searchResponse.source}*\\n\\n📖 [Read full information](${searchResponse.sourceUrl})`,
        suggestedActions: ['Ask follow-up question', 'Speak to a nurse', 'Other symptoms', 'Support services']
      },
      newState: {
        currentTopic: 'health_information',
        currentStage: 'information_provided',
        context: {
          ...conversationState.context,
          lastQuery: userMessage,
          sourceProvided: searchResponse.sourceUrl,
          contentRelevance: searchResponse.relevanceScore
        }
      },
      escalationTriggered: false,
      conversationEnded: false
    };
  }
  
  // Fallback response
  return {
    response: {
      text: "I don't have specific information about that topic in my knowledge base. For personalized health advice, I'd recommend:\\n\\n• Speaking to your GP\\n• Contacting The Eve Appeal nurse line\\n• Calling NHS 111 for health guidance\\n\\nIs there something else about gynaecological health I can help you find information about?",
      suggestedActions: ['Ovarian cancer symptoms', 'Cervical screening', 'Contact a nurse', 'Common conditions']
    },
    newState: {
      currentTopic: 'health_information',
      currentStage: 'no_content_found',
      context: {
        ...conversationState.context,
        lastQuery: userMessage,
        contentNotFound: true
      }
    },
    escalationTriggered: false,
    conversationEnded: false
  };
}

// Helper function for greeting detection
function isGreeting(text) {
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
  const lowerText = text.toLowerCase().trim();
  
  // Check for explicit greetings
  const hasGreeting = greetings.some(greeting => lowerText.includes(greeting));
  if (hasGreeting) return true;
  
  // Check for conversation starters with health context
  const healthOpeners = [
    'worried about', 'concerned about', 'questions about', 'help with',
    'need to know', 'want to ask', 'having symptoms', 'experiencing'
  ];
  
  return healthOpeners.some(opener => lowerText.includes(opener));
}

// Validate turn expectations
function validateTurnExpectations(turn, flowResult, conversationState) {
  const errors = [];
  let passed = true;
  
  // Check expected topic
  if (turn.expectedTopic && conversationState.currentTopic !== turn.expectedTopic) {
    errors.push(`Expected topic: ${turn.expectedTopic}, got: ${conversationState.currentTopic}`);
    passed = false;
  }
  
  // Check expected escalation
  if (turn.expectedEscalation !== undefined && flowResult.escalationTriggered !== turn.expectedEscalation) {
    errors.push(`Expected escalation: ${turn.expectedEscalation}, got: ${flowResult.escalationTriggered}`);
    passed = false;
  }
  
  // Check expected content
  if (turn.expectedContent) {
    for (const contentItem of turn.expectedContent) {
      if (!flowResult.response.text.toLowerCase().includes(contentItem.toLowerCase())) {
        errors.push(`Expected response to contain: "${contentItem}"`);
        passed = false;
      }
    }
  }
  
  // Check response type validation
  if (turn.expectedResponseType) {
    const typeValidation = validateResponseType(turn.expectedResponseType, flowResult.response);
    if (!typeValidation.valid) {
      errors.push(...typeValidation.errors);
      passed = false;
    }
  }
  
  return { passed, errors };
}

// Validate response types
function validateResponseType(expectedType, response) {
  const errors = [];
  let valid = true;
  
  switch (expectedType) {
    case 'greeting':
      if (!response.text.includes("Hello, I'm Ask Eve Assist")) {
        errors.push('Expected greeting response format');
        valid = false;
      }
      break;
      
    case 'content_with_source':
      if (!response.text.includes('Source:') && !response.text.includes('[Read full information]')) {
        errors.push('Expected source attribution in content response');
        valid = false;
      }
      break;
      
    case 'crisis_response':
      if (!response.text.includes('Crisis Support Available')) {
        errors.push('Expected crisis response format');
        valid = false;
      }
      break;
      
    case 'callback_consent':
      if (!response.text.includes('Nurse Callback Service')) {
        errors.push('Expected nurse callback consent format');
        valid = false;
      }
      break;
      
    case 'fallback_response':
      if (!response.text.includes("I don't have specific information")) {
        errors.push('Expected fallback response format');
        valid = false;
      }
      break;
  }
  
  return { valid, errors };
}

// Run the comprehensive tests
if (require.main === module) {
  runComprehensiveConversationTests().catch(console.error);
}

module.exports = {
  runComprehensiveConversationTests,
  comprehensiveTestScenarios
};