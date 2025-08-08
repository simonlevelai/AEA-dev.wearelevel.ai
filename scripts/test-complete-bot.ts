#!/usr/bin/env ts-node

/**
 * Complete Ask Eve Assist Bot Test
 * Tests the full end-to-end bot functionality locally
 */

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';
import { SearchService } from '../src/services/SearchService';
import { SupabaseService } from '../src/services/SupabaseService';
import { AzureOpenAIService } from '../src/services/AzureOpenAIService';

// Load environment variables
dotenv.config();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration?: number;
}

class CompleteBotTester {
  private results: TestResult[] = [];
  private entityService!: EntityService;
  private searchService!: SearchService;
  private supabaseService!: SupabaseService;
  private openaiService!: AzureOpenAIService;

  async runAllTests(): Promise<void> {
    console.log('🤖 Ask Eve Assist - Complete Bot Test Suite');
    console.log('=' .repeat(60));
    
    await this.initializeServices();
    await this.testMedicalQuery();
    await this.testCrisisDetection();
    await this.testRAGPipeline();
    await this.testConversationFlow();
    
    this.printSummary();
  }

  private async initializeServices(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🔧 Initializing All Services...');
      
      // Initialize Entity Service
      this.entityService = new EntityService();
      await this.entityService.initialize();
      
      // Initialize Search Service
      this.searchService = new SearchService({
        endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
        apiKey: process.env.AZURE_SEARCH_API_KEY!,
        indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content'
      });
      
      // Initialize Supabase Service
      this.supabaseService = new SupabaseService(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await this.supabaseService.initialize();
      
      // Initialize Azure OpenAI Service
      this.openaiService = new AzureOpenAIService(
        process.env.AZURE_OPENAI_API_KEY!,
        process.env.AZURE_OPENAI_ENDPOINT!,
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
        this.entityService
      );
      await this.openaiService.initialize();
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: 'Service Initialization',
        status: 'PASS',
        message: 'All services initialized successfully',
        duration
      });
      
      console.log(`✅ All Services: Initialized (${duration}ms)`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'Service Initialization',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ Service Initialization failed: ${error}`);
      throw error; // Stop execution if services fail
    }
  }

  private async testMedicalQuery(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🏥 Testing Medical Query Processing...');
      
      const query = "I'm worried about cervical cancer symptoms. What should I look out for?";
      
      // 1. Entity extraction
      const entities = this.entityService.findMatchingEntities(query);
      
      // 2. Crisis detection
      const isCrisis = this.entityService.isCrisisIndicator(query);
      
      // 3. Search for relevant content (with fallback for TypeScript issues)
      let searchResults;
      try {
        searchResults = await this.searchService.search('cervical cancer symptoms');
      } catch (error) {
        console.log('   ⚠️ SearchService has TypeScript issues but may work at runtime');
        searchResults = { results: [], count: 0 };
      }
      
      // 4. Generate AI response
      const aiResponse = await this.openaiService.generateResponse({
        message: query,
        maxTokens: 300,
        temperature: 0.7,
        userId: 'test-user-medical'
      });
      
      const duration = Date.now() - startTime;
      
      // Validate results
      if (searchResults.results.length === 0) {
        throw new Error('No search results found for medical query');
      }
      
      if (!aiResponse.response || aiResponse.response.length < 50) {
        throw new Error('AI response too short or empty');
      }
      
      this.results.push({
        name: 'Medical Query Processing',
        status: 'PASS',
        message: `Entities: ${entities.length}, Search: ${searchResults.results.length}, AI response: ${aiResponse.response.length} chars, Crisis: ${isCrisis}`,
        duration
      });
      
      console.log(`✅ Medical Query: Complete pipeline working`);
      console.log(`   📋 Found ${entities.length} entities, ${searchResults.results.length} search results`);
      console.log(`   🤖 AI Response: "${aiResponse.response.substring(0, 100)}..."`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'Medical Query Processing',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ Medical Query failed: ${error}`);
    }
  }

  private async testCrisisDetection(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🚨 Testing Crisis Detection...');
      
      const crisisQuery = "I want to die, I can't cope anymore";
      
      // 1. Crisis detection
      const isCrisis = this.entityService.isCrisisIndicator(crisisQuery);
      
      // 2. Generate crisis response
      const aiResponse = await this.openaiService.generateResponse({
        message: crisisQuery,
        maxTokens: 300,
        temperature: 0.3,
        userId: 'test-user-crisis'
      });
      
      const duration = Date.now() - startTime;
      
      // Validate crisis handling
      if (!isCrisis) {
        throw new Error('Crisis not detected when it should have been');
      }
      
      if (!aiResponse.response.includes('999') && !aiResponse.response.includes('Samaritans')) {
        throw new Error('Crisis response missing emergency contact information');
      }
      
      if (aiResponse.finishReason !== 'crisis_intervention') {
        throw new Error('AI response not marked as crisis intervention');
      }
      
      this.results.push({
        name: 'Crisis Detection',
        status: 'PASS',
        message: `Crisis detected correctly, emergency response generated (${aiResponse.response.length} chars)`,
        duration
      });
      
      console.log(`✅ Crisis Detection: Working correctly`);
      console.log(`   🚨 Crisis detected: ${isCrisis}`);
      console.log(`   📞 Emergency response includes: ${aiResponse.response.includes('999') ? 'Emergency services' : ''} ${aiResponse.response.includes('Samaritans') ? 'Samaritans' : ''}`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'Crisis Detection',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ Crisis Detection failed: ${error}`);
    }
  }

  private async testRAGPipeline(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🔗 Testing Complete RAG Pipeline...');
      
      const query = "What is HPV and how is it related to cervical cancer?";
      
      // 1. Search for relevant documents (with fallback)
      let searchResults;
      try {
        searchResults = await this.searchService.search('HPV cervical cancer');
      } catch (error) {
        console.log('   ⚠️ SearchService has TypeScript issues - using fallback');
        searchResults = { results: [], count: 0 };
      }
      
      // 2. Extract entities
      const entities = this.entityService.findMatchingEntities(query);
      
      // 3. Generate contextual response
      const aiResponse = await this.openaiService.generateResponse({
        message: query,
        maxTokens: 400,
        temperature: 0.6,
        userId: 'test-user-rag'
      });
      
      const duration = Date.now() - startTime;
      
      // Validate RAG pipeline
      if (searchResults.results.length === 0) {
        throw new Error('No relevant documents found');
      }
      
      if (entities.length === 0) {
        throw new Error('No medical entities extracted');
      }
      
      if (!aiResponse.response || aiResponse.response.length < 100) {
        throw new Error('Generated response too short');
      }
      
      this.results.push({
        name: 'RAG Pipeline',
        status: 'PASS',
        message: `Search: ${searchResults.results.length} docs, Entities: ${entities.length}, AI: ${aiResponse.tokenUsage.totalTokens} tokens`,
        duration
      });
      
      console.log(`✅ RAG Pipeline: Complete flow working`);
      console.log(`   🔍 Search results: ${searchResults.results.length}`);
      console.log(`   📋 Entities: ${entities.map(e => e.category).join(', ')}`);
      console.log(`   🤖 Token usage: ${aiResponse.tokenUsage.totalTokens} total`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'RAG Pipeline',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ RAG Pipeline failed: ${error}`);
    }
  }

  private async testConversationFlow(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n💬 Testing Conversation Flow...');
      
      // 1. Create conversation
      const conversation = await this.supabaseService.createConversation({
        userId: 'test-user-flow',
        sessionId: 'test-session-flow',
        title: 'Test Conversation Flow',
        metadata: { source: 'bot-test' }
      });
      
      // 2. Add user message
      await this.supabaseService.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, I have questions about cervical screening',
        entities: { screening: true },
        isCrisis: false
      });
      
      // 3. Generate and store AI response
      const aiResponse = await this.openaiService.generateResponse({
        message: 'Hello, I have questions about cervical screening',
        maxTokens: 200,
        userId: 'test-user-flow'
      });
      
      await this.supabaseService.addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse.response,
        responseTimeMs: 1500,
        tokenUsage: aiResponse.tokenUsage,
        isCrisis: false
      });
      
      // 4. Retrieve conversation history
      const messages = await this.supabaseService.getConversationMessages(conversation.id);
      
      const duration = Date.now() - startTime;
      
      // Validate conversation flow
      if (messages.length !== 2) {
        throw new Error(`Expected 2 messages, got ${messages.length}`);
      }
      
      if (messages[0].role !== 'user' || messages[1].role !== 'assistant') {
        throw new Error('Message roles not in correct order');
      }
      
      this.results.push({
        name: 'Conversation Flow',
        status: 'PASS',
        message: `Created conversation with ${messages.length} messages, full flow working`,
        duration
      });
      
      console.log(`✅ Conversation Flow: Complete workflow working`);
      console.log(`   💬 Messages: ${messages.length} stored correctly`);
      console.log(`   📊 Database: Conversation and messages persisted`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'Conversation Flow',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ Conversation Flow failed: ${error}`);
    }
  }

  private printSummary(): void {
    console.log('\n' + '=' .repeat(60));
    console.log('🤖 Complete Bot Test Summary');
    console.log('=' .repeat(60));
    
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    
    this.results.forEach(result => {
      const statusIcon = result.status === 'PASS' ? '✅' : 
                        result.status === 'FAIL' ? '❌' : '⏭️';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      
      console.log(`${statusIcon} ${result.name}${duration}`);
      console.log(`   ${result.message}`);
      
      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      else skipped++;
    });
    
    console.log('\n' + '-' .repeat(60));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
    
    if (failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Ask Eve Assist bot is fully functional!');
      console.log('\n💰 Current Costs:');
      console.log('   - Azure AI Search: ~£20/month');
      console.log('   - Azure OpenAI (dev): ~£5-15/month (usage-based)');
      console.log('   - Supabase: £0/month (free tier)');
      console.log('   - Total: ~£25-35/month');
      
      console.log('\n🚀 Ready for Production:');
      console.log('   1. Bot fully functional locally');
      console.log('   2. All components tested and working');
      console.log('   3. Crisis detection operational');
      console.log('   4. Medical content accessible');
      console.log('   5. Conversation storage working');
      
    } else {
      console.log(`\n⚠️  ${failed} tests failed. Bot not ready for production.`);
    }
    
    console.log('\n🔄 Next Steps:');
    if (failed === 0) {
      console.log('1. Deploy to Azure App Service');
      console.log('2. Configure production environment variables');  
      console.log('3. Test production deployment');
      console.log('4. Monitor usage and costs');
    } else {
      console.log('1. Fix failing tests');
      console.log('2. Re-run complete test suite');
      console.log('3. Verify all components working');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new CompleteBotTester();
  tester.runAllTests().catch(error => {
    console.error('Complete bot test failed:', error);
    process.exit(1);
  });
}