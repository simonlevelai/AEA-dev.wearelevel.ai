#!/usr/bin/env node

/**
 * Test script to validate Ask Eve Conversation Flow end-to-end
 * Tests the conversation flow architecture with realistic user scenarios
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { ConversationFlowIntegrator } from '../src/services/ConversationFlowIntegrator';
import { Logger } from '../src/utils/logger';

interface TestScenario {
  name: string;
  description: string;
  messages: string[];
  expectedTopic?: string;
  expectedStage?: string;
  shouldEscalate?: boolean;
}

const testScenarios: TestScenario[] = [
  {
    name: 'Conversation Start Flow',
    description: 'Test mandatory opening statement and initial routing',
    messages: [
      'Hello',
      'I want to know about ovarian cancer symptoms'
    ],
    expectedTopic: 'health_information_router',
    expectedStage: 'information_gathering'
  },
  {
    name: 'Crisis Detection',
    description: 'Test crisis detection and emergency response',
    messages: [
      'I feel hopeless',
      'I want to hurt myself'
    ],
    expectedTopic: 'crisis_support_routing',
    expectedStage: 'escalation',
    shouldEscalate: true
  },
  {
    name: 'Health Information Query',
    description: 'Test health information retrieval',
    messages: [
      'Hi there',
      'What are the symptoms of cervical cancer?'
    ],
    expectedTopic: 'health_information_router'
  },
  {
    name: 'Direct Health Question',
    description: 'Test direct health question handling',
    messages: [
      'Tell me about womb cancer symptoms'
    ],
    expectedTopic: 'health_information_router'
  }
];

async function runConversationFlowTest(): Promise<void> {
  const logger = new Logger('conversation-flow-test');
  
  try {
    logger.info('🧪 Starting Ask Eve Conversation Flow Test...');

    // Check required environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      logger.error('❌ Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY');
      logger.info('Please ensure these are set in your .env file');
      process.exit(1);
    }

    // Initialize conversation flow integrator
    const integrator = new ConversationFlowIntegrator(
      {
        supabaseUrl,
        supabaseAnonKey: supabaseKey,
        teamsWebhookUrl: 'test-webhook-url',
        enableSafetyFirst: true
      },
      logger
    );

    await integrator.initialize();

    // Check system health
    const healthStatus = integrator.getHealthStatus();
    logger.info('📊 System Health Check:', healthStatus);

    if (!healthStatus.initialized) {
      throw new Error('System failed to initialize properly');
    }

    // Run test scenarios
    let passedTests = 0;
    let totalTests = testScenarios.length;

    for (const [index, scenario] of testScenarios.entries()) {
      logger.info(`\n🎬 Running Test Scenario ${index + 1}: ${scenario.name}`);
      logger.info(`Description: ${scenario.description}`);
      
      const conversationId = `test-conv-${index + 1}-${Date.now()}`;
      const userId = `test-user-${index + 1}`;
      
      try {
        let lastResult;
        
        for (const [msgIndex, message] of scenario.messages.entries()) {
          logger.info(`📨 Message ${msgIndex + 1}: "${message}"`);
          
          const result = await integrator.processMessage(
            conversationId,
            userId,
            message
          );
          
          logger.info(`🤖 Response: "${result.response.text.substring(0, 100)}..."`);
          logger.info(`📍 State: Topic=${result.newState.currentTopic}, Stage=${result.newState.currentStage}`);
          
          if (result.escalationTriggered) {
            logger.info('🚨 Escalation triggered');
          }
          
          if (result.response.suggestedActions) {
            logger.info(`💡 Suggested Actions: ${result.response.suggestedActions.join(', ')}`);
          }

          lastResult = result;
        }

        // Validate scenario expectations
        let scenarioPassed = true;
        const validationErrors: string[] = [];

        if (scenario.expectedTopic && lastResult && lastResult.newState.currentTopic !== scenario.expectedTopic) {
          validationErrors.push(`Expected topic '${scenario.expectedTopic}' but got '${lastResult.newState.currentTopic}'`);
          scenarioPassed = false;
        }

        if (scenario.expectedStage && lastResult && lastResult.newState.currentStage !== scenario.expectedStage) {
          validationErrors.push(`Expected stage '${scenario.expectedStage}' but got '${lastResult.newState.currentStage}'`);
          scenarioPassed = false;
        }

        if (scenario.shouldEscalate !== undefined && lastResult && lastResult.escalationTriggered !== scenario.shouldEscalate) {
          validationErrors.push(`Expected escalation: ${scenario.shouldEscalate}, but got: ${lastResult.escalationTriggered}`);
          scenarioPassed = false;
        }

        if (scenarioPassed) {
          logger.info(`✅ Test Scenario ${index + 1} PASSED`);
          passedTests++;
        } else {
          logger.error(`❌ Test Scenario ${index + 1} FAILED:`);
          validationErrors.forEach(error => logger.error(`  - ${error}`));
        }

        // Show conversation history for debugging
        if (!scenarioPassed) {
          const history = integrator.getConversationHistory(conversationId);
          logger.info('📋 Conversation History:', {
            state: history.state,
            messageCount: history.messages.length
          });
        }

      } catch (error) {
        logger.error(`❌ Test Scenario ${index + 1} FAILED with error:`, {
          error: error instanceof Error ? error : new Error('Unknown error')
        });
      }
    }

    // Test Summary
    logger.info(`\n📊 Test Results Summary:`);
    logger.info(`Total Scenarios: ${totalTests}`);
    logger.info(`Passed: ${passedTests}`);
    logger.info(`Failed: ${totalTests - passedTests}`);
    logger.info(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

    if (passedTests === totalTests) {
      logger.info('🎉 ALL TESTS PASSED! Conversation flow is working correctly.');
    } else {
      logger.warn('⚠️  Some tests failed. Review the errors above.');
    }

    // Performance test
    await runPerformanceTest(integrator, logger);

    // Cleanup
    await integrator.shutdown();

  } catch (error) {
    logger.error('💥 Conversation flow test failed:', {
      error: error instanceof Error ? error : new Error('Unknown error')
    });
    process.exit(1);
  }
}

async function runPerformanceTest(
  integrator: ConversationFlowIntegrator, 
  logger: Logger
): Promise<void> {
  logger.info('\n⚡ Running Performance Tests...');

  const performanceTests = [
    'Hello, I need help',
    'What are ovarian cancer symptoms?',
    'I want to hurt myself',
    'Tell me about cervical screening'
  ];

  const results: number[] = [];

  for (const [index, message] of performanceTests.entries()) {
    const startTime = Date.now();
    
    await integrator.processMessage(
      `perf-test-${index}`,
      `perf-user-${index}`,
      message
    );
    
    const responseTime = Date.now() - startTime;
    results.push(responseTime);
    
    logger.info(`⏱️  "${message.substring(0, 30)}..." - ${responseTime}ms`);
  }

  const avgResponseTime = results.reduce((a, b) => a + b, 0) / results.length;
  const maxResponseTime = Math.max(...results);
  
  logger.info('📈 Performance Summary:');
  logger.info(`Average Response Time: ${Math.round(avgResponseTime)}ms`);
  logger.info(`Max Response Time: ${maxResponseTime}ms`);
  
  if (maxResponseTime > 3000) {
    logger.warn('⚠️  Some responses exceeded 3 second target');
  } else {
    logger.info('✅ All responses within performance targets');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runConversationFlowTest().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { runConversationFlowTest };