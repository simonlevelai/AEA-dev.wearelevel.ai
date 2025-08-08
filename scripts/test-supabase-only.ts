#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { SupabaseService } from '../src/services/SupabaseService';

dotenv.config();

async function testSupabaseService() {
  console.log('🗄️ Testing Supabase Service only...');
  
  try {
    const supabaseService = new SupabaseService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabaseService.initialize();
    console.log('✅ Supabase Service initialized');
    
    // Test conversation creation
    const testConversation = await supabaseService.createConversation({
      userId: 'test-supabase-only',
      sessionId: 'test-session-supabase',
      title: 'Supabase Only Test',
      metadata: { source: 'supabase-test' }
    });
    console.log(`✅ Created conversation: ${testConversation.id}`);
    
    // Test message creation
    const testMessage = await supabaseService.addMessage({
      conversationId: testConversation.id,
      role: 'user',
      content: 'Test message for Supabase service',
      entities: {},
      isCrisis: false
    });
    console.log(`✅ Added message: ${testMessage.id}`);
    
    // Test message retrieval
    const messages = await supabaseService.getConversationMessages(testConversation.id);
    console.log(`✅ Retrieved ${messages.length} messages`);
    
    if (messages.length > 0) {
      console.log(`   - Message content: "${messages[0].content}"`);
      console.log(`   - Message role: ${messages[0].role}`);
    }
    
    console.log('🎯 Supabase Service test complete');
    
  } catch (error) {
    console.error('❌ Supabase Service failed:', error);
    process.exit(1);
  }
}

testSupabaseService();