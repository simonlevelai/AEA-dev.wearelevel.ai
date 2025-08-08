#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';
import { SearchService } from '../src/services/SearchService';
import { SupabaseService } from '../src/services/SupabaseService';

dotenv.config();

async function testSupportingServices() {
  console.log('🔧 Testing Supporting Services (non-OpenAI)...');
  console.log('='.repeat(50));
  
  // Test Entity Service
  console.log('\n📋 Testing Entity Service...');
  try {
    const entityService = new EntityService();
    await entityService.initialize();
    
    // Test entity matching
    const testQuery = "I'm worried about cervical cancer symptoms and HPV";
    const entities = entityService.findMatchingEntities(testQuery);
    console.log(`✅ Entity Service: Found ${entities.length} entity matches`);
    entities.forEach(e => console.log(`   - ${e.category}: ${e.matches.join(', ')}`));
    
    // Test crisis detection 
    const crisisQuery = "I want to die, I can't cope anymore";
    const isCrisis = entityService.isCrisisIndicator(crisisQuery);
    console.log(`✅ Crisis Detection: ${isCrisis ? 'Working' : 'Failed'} (detected: ${isCrisis})`);
    
    // Test system prompt
    const systemPrompt = entityService.getSystemPrompt();
    console.log(`✅ System Prompt: ${systemPrompt.length} characters loaded`);
    
  } catch (error) {
    console.error('❌ Entity Service failed:', error);
  }
  
  // Test Search Service
  console.log('\n🔍 Testing Search Service...');
  try {
    const searchService = new SearchService({
      endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      apiKey: process.env.AZURE_SEARCH_API_KEY!,
      indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content'
    });
    
    const searchResults = await searchService.search('cervical cancer screening');
    console.log(`✅ Search Service: Found ${searchResults.results.length} results`);
    
    if (searchResults.results.length > 0) {
      const firstResult = searchResults.results[0];
      console.log(`   - First result: "${firstResult.document.title}" (score: ${firstResult.score})`);
    }
    
  } catch (error) {
    console.error('❌ Search Service failed:', error);
  }
  
  // Test Supabase Service
  console.log('\n🗄️ Testing Supabase Service...');
  try {
    const supabaseService = new SupabaseService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabaseService.initialize();
    console.log('✅ Supabase Service: Initialized successfully');
    
    // Test conversation creation
    const testConversation = await supabaseService.createConversation({
      userId: 'test-support-services',
      sessionId: 'test-session-support',
      title: 'Supporting Services Test',
      metadata: { source: 'support-test' }
    });
    console.log(`✅ Supabase Service: Created conversation ${testConversation.id}`);
    
    // Test message creation
    const testMessage = await supabaseService.addMessage({
      conversationId: testConversation.id,
      role: 'user',
      content: 'Test message for supporting services',
      entities: {},
      isCrisis: false
    });
    console.log(`✅ Supabase Service: Added message ${testMessage.id}`);
    
    // Test message retrieval
    const messages = await supabaseService.getConversationMessages(testConversation.id);
    console.log(`✅ Supabase Service: Retrieved ${messages.length} messages`);
    
  } catch (error) {
    console.error('❌ Supabase Service failed:', error);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 Supporting Services Test Complete');
  console.log('Ready for OpenAI integration once quota clears!');
}

testSupportingServices().catch(console.error);