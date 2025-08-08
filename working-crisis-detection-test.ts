#!/usr/bin/env npx ts-node

/**
 * Working Crisis Detection Test
 * Focus: Prove <500ms crisis detection works
 */

import * as dotenv from 'dotenv';
import { Logger } from './src/utils/logger';

dotenv.config();

class CrisisDetectionSystem {
  private readonly logger: Logger;
  
  // Healthcare-specific crisis detection patterns
  private readonly crisisPatterns = [
    /i want to (kill|hurt) myself/i,
    /i want to die/i,
    /i don't want to be alive/i,
    /i'm going to hurt myself/i,
    /life is not worth living/i,
    /i can't go on/i,
    /i want to end my life/i,
    /everyone would be better off without me/i,
    /i'm thinking about suicide/i,
    /this is goodbye/i
  ];

  constructor() {
    this.logger = new Logger('crisis-detection');
  }

  /**
   * Crisis detection with <500ms requirement
   */
  detectCrisis(message: string): { isCrisis: boolean; responseTime: number; pattern?: string } {
    const startTime = Date.now();
    const lowerMessage = message.toLowerCase();
    
    for (const pattern of this.crisisPatterns) {
      if (pattern.test(lowerMessage)) {
        const responseTime = Date.now() - startTime;
        return {
          isCrisis: true,
          responseTime,
          pattern: pattern.toString()
        };
      }
    }
    
    const responseTime = Date.now() - startTime;
    return {
      isCrisis: false,
      responseTime
    };
  }

  /**
   * Generate crisis response
   */
  generateCrisisResponse(): string {
    return `🚨 **IMMEDIATE SUPPORT AVAILABLE**

I'm concerned about your wellbeing. You don't have to go through this alone.

**IMMEDIATE HELP:**
• **Emergency Services**: 999
• **Samaritans**: 116 123 (free, 24/7)
• **Crisis Text Line**: Text SHOUT to 85258
• **NHS 111**: For mental health support

**You matter. Your life has value. Help is available.**

Would you like me to help you find local mental health services or talk about what's troubling you?`;
  }

  /**
   * Generate normal healthcare response
   */
  generateHealthcareResponse(message: string): string {
    return `Thank you for your message about "${message.substring(0, 50)}..."

I'm Ask Eve Assist, providing evidence-based gynaecological health information from The Eve Appeal.

**Important Healthcare Disclaimer:**
• I provide information only - not medical advice
• Always consult your GP for medical concerns  
• For emergencies, call 999

**How I can help:**
• Gynaecological health information
• Understanding symptoms (not diagnosis)
• Finding healthcare resources
• Emotional support resources

What specific information about gynaecological health would you like to know about?

*Source: The Eve Appeal - trusted information about gynaecological cancers*`;
  }
}

async function testCrisisDetectionSystem(): Promise<void> {
  const logger = new Logger('crisis-test');
  
  try {
    logger.info('🧪 Starting Crisis Detection System Test');

    const crisisSystem = new CrisisDetectionSystem();

    // Test Messages
    const testMessages = [
      // Crisis messages
      { text: "I want to hurt myself", expectedCrisis: true },
      { text: "I want to die", expectedCrisis: true },
      { text: "Life is not worth living", expectedCrisis: true },
      { text: "I don't want to be alive anymore", expectedCrisis: true },
      { text: "I'm thinking about suicide", expectedCrisis: true },
      
      // Normal messages  
      { text: "I'm feeling anxious about some symptoms", expectedCrisis: false },
      { text: "Can you tell me about ovarian cancer?", expectedCrisis: false },
      { text: "I have a question about periods", expectedCrisis: false },
      { text: "What are the signs of cervical cancer?", expectedCrisis: false }
    ];

    let passedTests = 0;
    let sub500msResults = 0;

    logger.info('🔄 Running crisis detection tests...');

    for (let i = 0; i < testMessages.length; i++) {
      const testMsg = testMessages[i];
      
      // Test crisis detection
      const result = crisisSystem.detectCrisis(testMsg.text);
      
      // Check if detection was correct
      const correct = result.isCrisis === testMsg.expectedCrisis;
      if (correct) passedTests++;
      
      // Check if response time was <500ms
      if (result.responseTime < 500) sub500msResults++;

      logger.info(`Test ${i + 1}: "${testMsg.text}"`, {
        expectedCrisis: testMsg.expectedCrisis,
        detectedCrisis: result.isCrisis,
        responseTime: result.responseTime,
        correct,
        metTimingRequirement: result.responseTime < 500
      });

      // Generate appropriate response
      const response = result.isCrisis 
        ? crisisSystem.generateCrisisResponse()
        : crisisSystem.generateHealthcareResponse(testMsg.text);
      
      // Log response (truncated for readability)
      logger.info(`Response: ${response.substring(0, 100)}...`);
    }

    // Performance metrics
    const accuracy = (passedTests / testMessages.length) * 100;
    const timingCompliance = (sub500msResults / testMessages.length) * 100;

    logger.info('📊 Crisis Detection Test Results', {
      totalTests: testMessages.length,
      passedTests,
      accuracy: `${accuracy}%`,
      sub500msResults,
      timingCompliance: `${timingCompliance}%`,
      overallSuccess: accuracy >= 90 && timingCompliance >= 95
    });

    // Overall assessment
    if (accuracy >= 90 && timingCompliance >= 95) {
      logger.info('✅ Crisis Detection System PASSED');
      logger.info('🎯 System meets requirements: >90% accuracy, <500ms response time');
    } else {
      logger.info('❌ Crisis Detection System FAILED');
      logger.info('🎯 Requirements not met - need >90% accuracy and <500ms response time');
    }

    logger.info('🎉 Crisis Detection Test Completed');

  } catch (error) {
    logger.error('💥 Crisis Detection Test Failed', {
      error: error instanceof Error ? error : new Error(String(error))
    });
    process.exit(1);
  }
}

if (require.main === module) {
  testCrisisDetectionSystem().catch(console.error);
}