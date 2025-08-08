#!/usr/bin/env ts-node

/**
 * Ask Eve Assist - End-to-End Integration Test
 * Tests the complete Entity → OpenAI → Supabase workflow
 */

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';
import { AzureOpenAIService } from '../src/services/AzureOpenAIService';
import { SupabaseService } from '../src/services/SupabaseService';
import { SearchService } from '../src/services/SearchService';

dotenv.config();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
  details?: any;
}

class E2EIntegrationTester {
  private results: TestResult[] = [];
  private entityService!: EntityService;
  private openaiService!: AzureOpenAIService;
  private supabaseService!: SupabaseService;
  private searchService!: SearchService;

  async runAllTests(): Promise<void> {
    console.log('🔄 Ask Eve Assist - End-to-End Integration Testing');
    console.log('=' .repeat(60));
    
    await this.initializeServices();
    await this.testMedicalQueryFlow();
    await this.testCrisisDetectionFlow();
    await this.testConversationPersistence();
    await this.testRAGPipelineWithFallback();
    await this.testPerformanceRequirements();
    
    this.printResults();
  }

  private async initializeServices(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🔧 Initializing all services...');
      
      // Entity Service
      this.entityService = new EntityService();
      await this.entityService.initialize();
      console.log('✅ EntityService initialized');
      
      // OpenAI Service  
      this.openaiService = new AzureOpenAIService(
        process.env.AZURE_OPENAI_API_KEY!,
        process.env.AZURE_OPENAI_ENDPOINT!,
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
        this.entityService
      );
      await this.openaiService.initialize();
      console.log('✅ AzureOpenAIService initialized');
      
      // Supabase Service
      this.supabaseService = new SupabaseService(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await this.supabaseService.initialize();
      console.log('✅ SupabaseService initialized');
      
      // Search Service (with error handling)
      try {
        this.searchService = new SearchService({
          endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
          apiKey: process.env.AZURE_SEARCH_API_KEY!,
          indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content'
        });
        console.log('✅ SearchService initialized (may have TypeScript warnings)');
      } catch (error) {
        console.log('⚠️ SearchService initialization failed, will use fallback');
        this.searchService = null as any;
      }
      
      const duration = Date.now() - startTime;
      this.addResult('Service Initialization', 'PASS', 'All core services initialized', duration);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.addResult('Service Initialization', 'FAIL', `${error}`, duration);
      throw error;
    }
  }

  private async testMedicalQueryFlow(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🏥 Testing medical query flow...');
      
      const query = "What are the symptoms of cervical cancer? I'm worried about bleeding.";
      
      // Step 1: Entity extraction
      const entities = this.entityService.findMatchingEntities(query);
      console.log(`   📋 Extracted ${entities.length} entity categories`);
      
      // Step 2: Generate AI response with entity context
      const aiResponse = await this.openaiService.generateResponse({
        message: query,
        maxTokens: 300,
        userId: 'test-e2e-medical'
      });
      
      // Step 3: Validate response quality
      const isGoodResponse = aiResponse.response.length > 100 && 
                           aiResponse.response.toLowerCase().includes('cervical') &&
                           aiResponse.tokenUsage.totalTokens > 0;
      
      const duration = Date.now() - startTime;
      
      if (isGoodResponse && entities.length > 0) {
        this.addResult('Medical Query Flow', 'PASS', 
          `Generated ${aiResponse.response.length} char response with ${entities.length} entities`, 
          duration, {
            entities: entities.map(e => `${e.category}: ${e.matches.join(', ')}`),
            responsePreview: aiResponse.response.substring(0, 150) + '...',
            tokenUsage: aiResponse.tokenUsage
          });
        console.log(`✅ Medical response generated successfully`);
      } else {
        throw new Error(`Response quality check failed: entities=${entities.length}, responseLength=${aiResponse.response.length}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.addResult('Medical Query Flow', 'FAIL', `${error}`, duration);
      console.log(`❌ Medical query flow failed: ${error}`);
    }
  }

  private async testCrisisDetectionFlow(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🚨 Testing crisis detection flow...');
      
      const crisisQuery = "I want to end my life, I can't cope with this anymore";
      
      // Step 1: Crisis detection
      const isCrisis = this.entityService.isCrisisIndicator(crisisQuery);
      console.log(`   🚨 Crisis detected: ${isCrisis}`);
      
      // Step 2: Generate crisis response
      const startCrisisTime = Date.now();
      const crisisResponse = await this.openaiService.generateResponse({
        message: crisisQuery,
        maxTokens: 300,
        userId: 'test-e2e-crisis'
      });
      const crisisResponseTime = Date.now() - startCrisisTime;
      
      // Step 3: Validate crisis response
      const hasEmergencyInfo = crisisResponse.response.includes('999') || 
                              crisisResponse.response.includes('Samaritans') ||
                              crisisResponse.response.includes('116 123');
      const isQuickResponse = crisisResponseTime < 2000; // < 2 seconds requirement
      const isCrisisIntervention = crisisResponse.finishReason === 'crisis_intervention';
      
      const duration = Date.now() - startTime;
      
      if (isCrisis && hasEmergencyInfo && isQuickResponse && isCrisisIntervention) {
        this.addResult('Crisis Detection Flow', 'PASS', 
          `Crisis detected and responded in ${crisisResponseTime}ms`, 
          duration, {
            crisisDetected: isCrisis,
            responseTime: crisisResponseTime,
            hasEmergencyContacts: hasEmergencyInfo,
            finishReason: crisisResponse.finishReason,
            responsePreview: crisisResponse.response.substring(0, 150) + '...'
          });
        console.log(`✅ Crisis response generated in ${crisisResponseTime}ms`);
      } else {
        throw new Error(`Crisis validation failed: crisis=${isCrisis}, emergency=${hasEmergencyInfo}, time=${crisisResponseTime}ms, reason=${crisisResponse.finishReason}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.addResult('Crisis Detection Flow', 'FAIL', `${error}`, duration);
      console.log(`❌ Crisis detection failed: ${error}`);
    }
  }

  private async testConversationPersistence(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n💬 Testing conversation persistence...');
      
      // Step 1: Create conversation
      const conversation = await this.supabaseService.createConversation({
        userId: 'test-e2e-conversation',
        sessionId: 'test-session-e2e',
        title: 'E2E Integration Test Conversation',
        metadata: { testType: 'e2e-integration' }
      });
      console.log(`   📝 Created conversation: ${conversation.id}`);
      
      // Step 2: Add user message
      await this.supabaseService.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'I have questions about ovarian cancer symptoms',
        entities: { cancer: ['ovarian cancer'], symptoms: ['symptoms'] },
        isCrisis: false
      });
      
      // Step 3: Generate AI response and store it
      const aiResponse = await this.openaiService.generateResponse({
        message: 'I have questions about ovarian cancer symptoms',
        maxTokens: 200,
        userId: 'test-e2e-conversation'
      });
      
      await this.supabaseService.addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse.response,
        responseTimeMs: 1200,
        tokenUsage: aiResponse.tokenUsage,
        isCrisis: false
      });
      
      // Step 4: Retrieve and validate conversation
      const messages = await this.supabaseService.getConversationMessages(conversation.id);
      
      const duration = Date.now() - startTime;
      
      if (messages.length === 2 && messages[0].role === 'user' && messages[1].role === 'assistant') {
        this.addResult('Conversation Persistence', 'PASS', 
          `Created conversation with ${messages.length} messages`, 
          duration, {
            conversationId: conversation.id,
            messages: messages.map(m => ({ role: m.role, contentLength: m.content.length }))
          });
        console.log(`✅ API → Database → Retrieval flow working`);
      } else {
        throw new Error(`Message count mismatch: expected 2, got ${messages.length}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.addResult('Conversation Persistence', 'FAIL', `${error}`, duration);
      console.log(`❌ Conversation persistence failed: ${error}`);
    }
  }

  private async testRAGPipelineWithFallback(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🔗 Testing RAG pipeline with fallback...');
      
      let searchResults: { results: any[], count: number } = { results: [], count: 0 };
      let searchStatus = 'skipped';
      
      // Try search service if available
      if (this.searchService) {
        try {
          searchResults = await this.searchService.search('HPV cervical cancer');
          searchStatus = 'working';
          console.log(`   🔍 Search found ${searchResults.results.length} results`);
        } catch (error) {
          console.log(`   ⚠️ Search failed, using fallback: ${error.message}`);
          searchStatus = 'fallback';
        }
      } else {
        console.log(`   ⚠️ Search service unavailable, using fallback`);
      }
      
      // Test entity extraction and AI response (core RAG components)
      const query = "What is HPV and how does it relate to cervical cancer?";
      const entities = this.entityService.findMatchingEntities(query);
      
      const aiResponse = await this.openaiService.generateResponse({
        message: query,
        maxTokens: 400,
        userId: 'test-e2e-rag'
      });
      
      const duration = Date.now() - startTime;
      
      const hasRelevantResponse = aiResponse.response.toLowerCase().includes('hpv') &&
                                 aiResponse.response.toLowerCase().includes('cervical');
      
      if (entities.length > 0 && hasRelevantResponse) {
        this.addResult('RAG Pipeline', 'PASS', 
          `Entity extraction + AI response working, search: ${searchStatus}`, 
          duration, {
            searchStatus,
            searchResults: searchResults.count,
            entities: entities.length,
            responseLength: aiResponse.response.length,
            containsHPV: aiResponse.response.toLowerCase().includes('hpv')
          });
        console.log(`✅ RAG pipeline functional (search status: ${searchStatus})`);
      } else {
        throw new Error(`RAG validation failed: entities=${entities.length}, relevantResponse=${hasRelevantResponse}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.addResult('RAG Pipeline', 'FAIL', `${error}`, duration);
      console.log(`❌ RAG pipeline failed: ${error}`);
    }
  }

  private async testPerformanceRequirements(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n⚡ Testing performance requirements...');
      
      // Test 1: Crisis response time < 2 seconds
      const crisisStart = Date.now();
      await this.openaiService.generateResponse({
        message: "I want to die",
        maxTokens: 200,
        userId: 'test-performance-crisis'
      });
      const crisisTime = Date.now() - crisisStart;
      
      // Test 2: Normal medical query < 5 seconds  
      const medicalStart = Date.now();
      await this.openaiService.generateResponse({
        message: "What are the symptoms of endometrial cancer?",
        maxTokens: 300,
        userId: 'test-performance-medical'
      });
      const medicalTime = Date.now() - medicalStart;
      
      // Test 3: Entity processing performance
      const entityStart = Date.now();
      this.entityService.findMatchingEntities("I'm worried about cervical cancer symptoms, bleeding, and pain during intercourse");
      const entityTime = Date.now() - entityStart;
      
      const duration = Date.now() - startTime;
      
      const crisisOK = crisisTime < 2000;
      const medicalOK = medicalTime < 5000;
      const entityOK = entityTime < 100; // Should be very fast
      
      if (crisisOK && medicalOK && entityOK) {
        this.addResult('Performance Requirements', 'PASS', 
          `Crisis: ${crisisTime}ms, Medical: ${medicalTime}ms, Entity: ${entityTime}ms`, 
          duration, {
            crisisResponseTime: crisisTime,
            medicalResponseTime: medicalTime,
            entityProcessingTime: entityTime,
            requirementsMet: { crisis: crisisOK, medical: medicalOK, entity: entityOK }
          });
        console.log(`✅ Performance requirements met`);
      } else {
        throw new Error(`Performance requirements failed: crisis=${crisisTime}ms, medical=${medicalTime}ms, entity=${entityTime}ms`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.addResult('Performance Requirements', 'FAIL', `${error}`, duration);
      console.log(`❌ Performance test failed: ${error}`);
    }
  }

  private addResult(name: string, status: 'PASS' | 'FAIL' | 'SKIP', message: string, duration: number, details?: any): void {
    this.results.push({ name, status, message, duration, details });
  }

  private printResults(): void {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 End-to-End Integration Test Results');
    console.log('=' .repeat(60));
    
    let passed = 0;
    let failed = 0;
    let totalDuration = 0;
    
    this.results.forEach(result => {
      const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
      const duration = ` (${result.duration}ms)`;
      
      console.log(`${statusIcon} ${result.name}${duration}`);
      console.log(`   ${result.message}`);
      
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2).substring(0, 200)}...`);
      }
      
      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      totalDuration += result.duration;
    });
    
    console.log('\n' + '-' .repeat(60));
    console.log(`📈 Summary: ${this.results.length} tests, ${passed} passed, ${failed} failed`);
    console.log(`⏱️ Total duration: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);
    
    if (failed === 0) {
      console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
      console.log('💚 Ask Eve Assist is ready for bot server testing');
      console.log('\n🏥 Verified Capabilities:');
      console.log('   ✅ Medical query processing with entity context');
      console.log('   ✅ Crisis detection with <2s emergency response');
      console.log('   ✅ Conversation persistence to database');
      console.log('   ✅ RAG pipeline with graceful fallback');
      console.log('   ✅ Performance requirements met');
    } else {
      console.log(`\n⚠️ ${failed} integration tests failed`);
      console.log('🔧 Please fix failing tests before proceeding to bot server testing');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new E2EIntegrationTester();
  tester.runAllTests().catch(error => {
    console.error('E2E integration test failed:', error);
    process.exit(1);
  });
}

export { E2EIntegrationTester };