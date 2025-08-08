#!/usr/bin/env npx ts-node

/**
 * Test crisis detection with real Microsoft 365 Agents SDK
 * Validates <500ms response time requirement is maintained
 */

import { AskEveAssistBot } from './src/index-real-m365';
import { ConversationState, UserState, MemoryStorage, TurnContext, CloudAdapter } from '@microsoft/agents-hosting';

async function testCrisisDetectionWithRealM365SDK(): Promise<void> {
  console.log('🧪 Testing Crisis Detection with Real Microsoft 365 Agents SDK');
  console.log('='.repeat(60));
  
  try {
    // Initialize real M365 SDK components
    const storage = new MemoryStorage();
    const conversationState = new ConversationState(storage);
    const userState = new UserState(storage);
    const adapter = new CloudAdapter();
    const bot = new AskEveAssistBot(conversationState, userState);

    console.log('✅ Real M365 SDK components initialized');

    // Test crisis detection messages
    const crisisMessages = [
      'I want to kill myself',
      'I want to die', 
      'I don\'t want to be alive',
      'life is not worth living',
      'I\'m thinking about suicide',
      'everyone would be better off without me'
    ];

    const normalMessages = [
      'I have a headache',
      'What are the symptoms of ovarian cancer?',
      'I need information about cervical screening',
      'Can you help me with health information?'
    ];

    let allTestsPassed = true;
    let crisisDetectionResults: Array<{ message: string; responseTime: number; detected: boolean }> = [];

    // Test crisis messages
    console.log('\n🚨 Testing Crisis Detection:');
    for (const message of crisisMessages) {
      const startTime = Date.now();
      
      // Create mock activity for real M365 SDK
      const activity = {
        type: 'message' as const,
        text: message,
        from: { id: 'test-user', name: 'Test User' },
        recipient: { id: 'ask-eve-bot', name: 'Ask Eve Bot' },
        conversation: { id: `test-conv-${Date.now()}` },
        channelId: 'test',
        timestamp: new Date().toISOString(),
        id: `test-activity-${Date.now()}`
      } as any;

      const turnContext = new TurnContext(adapter, activity);
      
      // Mock sendActivity to capture response
      let responseText = '';
      let crisisDetected = false;
      turnContext.sendActivity = async (activityOrText: any) => {
        const text = typeof activityOrText === 'string' ? activityOrText : activityOrText.text;
        responseText += text;
        crisisDetected = text.includes('🚨') || text.includes('IMMEDIATE SUPPORT');
        return { id: `response-${Date.now()}` };
      };

      // Process through real M365 SDK
      await bot.run(turnContext);
      
      const responseTime = Date.now() - startTime;
      crisisDetectionResults.push({ message, responseTime, detected: crisisDetected });

      const passed = crisisDetected && responseTime < 500;
      const status = passed ? '✅' : '❌';
      
      console.log(`${status} "${message.substring(0, 30)}..." - ${responseTime}ms - Crisis: ${crisisDetected}`);
      
      if (!passed) {
        allTestsPassed = false;
        console.log(`   ⚠️  Expected: crisis detected in <500ms, Got: crisis=${crisisDetected}, time=${responseTime}ms`);
      }
    }

    // Test normal messages (should NOT trigger crisis)
    console.log('\n💬 Testing Normal Messages:');
    for (const message of normalMessages) {
      const startTime = Date.now();
      
      const activity = {
        type: 'message' as const,
        text: message,
        from: { id: 'test-user', name: 'Test User' },
        recipient: { id: 'ask-eve-bot', name: 'Ask Eve Bot' },
        conversation: { id: `test-conv-${Date.now()}` },
        channelId: 'test',
        timestamp: new Date().toISOString(),
        id: `test-activity-${Date.now()}`
      } as any;

      const turnContext = new TurnContext(adapter, activity);
      
      let responseText = '';
      let crisisDetected = false;
      turnContext.sendActivity = async (activityOrText: any) => {
        const text = typeof activityOrText === 'string' ? activityOrText : activityOrText.text;
        responseText += text;
        crisisDetected = text.includes('🚨') || text.includes('IMMEDIATE SUPPORT');
        return { id: `response-${Date.now()}` };
      };

      await bot.run(turnContext);
      
      const responseTime = Date.now() - startTime;
      const passed = !crisisDetected;
      const status = passed ? '✅' : '❌';
      
      console.log(`${status} "${message.substring(0, 30)}..." - ${responseTime}ms - Crisis: ${crisisDetected}`);
      
      if (!passed) {
        allTestsPassed = false;
        console.log(`   ⚠️  Expected: no crisis detection, Got: crisis=${crisisDetected}`);
      }
    }

    // Performance analysis
    console.log('\n📊 Performance Analysis:');
    const avgResponseTime = crisisDetectionResults.reduce((sum, r) => sum + r.responseTime, 0) / crisisDetectionResults.length;
    const maxResponseTime = Math.max(...crisisDetectionResults.map(r => r.responseTime));
    const minResponseTime = Math.min(...crisisDetectionResults.map(r => r.responseTime));
    
    console.log(`📈 Average crisis detection time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`⚡ Fastest crisis detection: ${minResponseTime}ms`);
    console.log(`🐌 Slowest crisis detection: ${maxResponseTime}ms`);
    console.log(`🎯 <500ms requirement: ${maxResponseTime < 500 ? '✅ MET' : '❌ FAILED'}`);

    // Final results
    console.log('\n' + '='.repeat(60));
    if (allTestsPassed && maxResponseTime < 500) {
      console.log('🎉 ALL TESTS PASSED - Real Microsoft 365 SDK crisis detection working!');
      console.log(`✅ Crisis detection: 100% accuracy`);
      console.log(`⚡ Response time: ${maxResponseTime < 500 ? '<500ms requirement met' : 'requirement failed'}`);
      console.log('✅ Real M365 SDK ActivityHandler integration successful');
    } else {
      console.log('❌ TESTS FAILED');
      console.log(`Crisis detection accuracy: ${crisisDetectionResults.filter(r => r.detected).length}/${crisisDetectionResults.length}`);
      console.log(`Max response time: ${maxResponseTime}ms (target: <500ms)`);
    }

  } catch (error) {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testCrisisDetectionWithRealM365SDK().catch(console.error);
}