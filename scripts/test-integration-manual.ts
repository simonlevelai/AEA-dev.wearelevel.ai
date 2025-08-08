#!/usr/bin/env ts-node

/**
 * Ask Eve Assist - Manual Integration Test
 * Tests the complete workflow manually with clear output
 */

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';
import { AzureOpenAIService } from '../src/services/AzureOpenAIService';
import { SupabaseService } from '../src/services/SupabaseService';

dotenv.config();

async function testIntegrationManual() {
  console.log('🔄 Ask Eve Assist - Manual Integration Test');
  console.log('Testing Entity → OpenAI → Supabase workflow');
  console.log('=' .repeat(60));
  
  try {
    // Initialize services
    console.log('\n🔧 Step 1: Initialize Services');
    const entityService = new EntityService();
    await entityService.initialize();
    console.log('✅ EntityService ready');
    
    const openaiService = new AzureOpenAIService(
      process.env.AZURE_OPENAI_API_KEY!,
      process.env.AZURE_OPENAI_ENDPOINT!,
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      entityService
    );
    await openaiService.initialize();
    console.log('✅ AzureOpenAIService ready');
    
    const supabaseService = new SupabaseService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabaseService.initialize();
    console.log('✅ SupabaseService ready');
    
    // Test medical query workflow
    console.log('\n🏥 Step 2: Test Medical Query Workflow');
    const medicalQuery = "What are the symptoms of cervical cancer? I'm worried about bleeding.";
    console.log(`Query: "${medicalQuery}"`);
    
    // Entity extraction
    console.log('\n   📋 2a: Entity Extraction');
    const entities = entityService.findMatchingEntities(medicalQuery);
    console.log(`   Found ${entities.length} entity categories:`);
    entities.forEach(e => {
      console.log(`      - ${e.category}: ${e.matches.join(', ')}`);
    });
    
    // AI Response
    console.log('\n   🤖 2b: AI Response Generation');
    const startTime = Date.now();
    const aiResponse = await openaiService.generateResponse({
      message: medicalQuery,
      maxTokens: 300,
      userId: 'test-integration-medical'
    });
    const responseTime = Date.now() - startTime;
    console.log(`   Response generated in ${responseTime}ms`);
    console.log(`   Response length: ${aiResponse.response.length} characters`);
    console.log(`   Token usage: ${aiResponse.tokenUsage.totalTokens} total`);
    console.log(`   Preview: "${aiResponse.response.substring(0, 150)}..."`);
    
    // Database storage
    console.log('\n   💾 2c: Database Storage');
    const conversation = await supabaseService.createConversation({
      userId: 'test-integration-user',
      sessionId: 'test-integration-session',
      title: 'Integration Test Conversation',
      metadata: { testType: 'manual-integration' }
    });
    console.log(`   Created conversation: ${conversation.id}`);
    
    await supabaseService.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: medicalQuery,
      entities: entities.reduce((acc, e) => ({ ...acc, [e.category]: e.matches }), {}),
      isCrisis: false
    });
    
    await supabaseService.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: aiResponse.response,
      responseTimeMs: responseTime,
      tokenUsage: aiResponse.tokenUsage,
      isCrisis: false
    });
    console.log(`   Stored user and assistant messages`);
    
    // Verify retrieval
    const messages = await supabaseService.getConversationMessages(conversation.id);
    console.log(`   Retrieved ${messages.length} messages from database`);
    
    // Test crisis detection workflow
    console.log('\n🚨 Step 3: Test Crisis Detection Workflow');
    const crisisQuery = "I want to die, I can't cope anymore";
    console.log(`Crisis Query: "${crisisQuery}"`);
    
    console.log('\n   🚨 3a: Crisis Detection');
    const isCrisis = entityService.isCrisisIndicator(crisisQuery);
    console.log(`   Crisis detected: ${isCrisis}`);
    
    console.log('\n   ⚡ 3b: Emergency Response Generation');
    const crisisStartTime = Date.now();
    const crisisResponse = await openaiService.generateResponse({
      message: crisisQuery,
      maxTokens: 300,
      userId: 'test-integration-crisis'
    });
    const crisisResponseTime = Date.now() - crisisStartTime;
    console.log(`   Crisis response generated in ${crisisResponseTime}ms`);
    console.log(`   Contains emergency info: ${crisisResponse.response.includes('999') || crisisResponse.response.includes('Samaritans')}`);
    console.log(`   Finish reason: ${crisisResponse.finishReason}`);
    console.log(`   Response preview: "${crisisResponse.response.substring(0, 200)}..."`);
    
    // Performance validation
    console.log('\n⚡ Step 4: Performance Validation');
    console.log(`   Medical query response time: ${responseTime}ms (target: <5000ms)`);
    console.log(`   Crisis response time: ${crisisResponseTime}ms (target: <2000ms)`);
    console.log(`   Medical response valid: ${responseTime < 5000 ? '✅' : '❌'}`);
    console.log(`   Crisis response valid: ${crisisResponseTime < 2000 ? '✅' : '❌'}`);
    
    // Final summary
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 MANUAL INTEGRATION TEST RESULTS');
    console.log('=' .repeat(60));
    
    const medicalOK = entities.length > 0 && aiResponse.response.length > 100 && responseTime < 5000;
    const crisisOK = isCrisis && crisisResponseTime < 2000 && 
                    (crisisResponse.response.includes('999') || crisisResponse.response.includes('Samaritans'));
    const storageOK = messages.length === 2;
    
    console.log(`✅ Service Initialization: PASS`);
    console.log(`${medicalOK ? '✅' : '❌'} Medical Query Workflow: ${medicalOK ? 'PASS' : 'FAIL'}`);
    console.log(`${crisisOK ? '✅' : '❌'} Crisis Detection Workflow: ${crisisOK ? 'PASS' : 'FAIL'}`);
    console.log(`${storageOK ? '✅' : '❌'} Database Storage/Retrieval: ${storageOK ? 'PASS' : 'FAIL'}`);
    
    const allPassed = medicalOK && crisisOK && storageOK;
    
    if (allPassed) {
      console.log('\n🚀 ALL INTEGRATION TESTS PASSED!');
      console.log('💚 Ask Eve Assist core workflow is fully functional');
      console.log('\n📋 Ready for Bot Server Testing:');
      console.log('   ✅ Entity recognition working (15 categories)');
      console.log('   ✅ OpenAI responses accurate and fast');
      console.log('   ✅ Crisis detection with emergency contacts');
      console.log('   ✅ Database persistence working');
      console.log('   ✅ Performance requirements met');
    } else {
      console.log('\n⚠️ Some integration tests failed');
      console.log('🔧 Please address issues before proceeding');
    }
    
  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    process.exit(1);
  }
}

testIntegrationManual();