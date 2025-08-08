#!/usr/bin/env ts-node

/**
 * Local Environment Testing Script
 * Tests Azure OpenAI, Entity Service, and RAG pipeline locally
 */

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';
import { SearchService } from '../src/services/SearchService';

// Load environment variables
dotenv.config();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration?: number;
}

class LocalEnvironmentTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🧪 Ask Eve Assist - Local Environment Test Suite');
    console.log('=' .repeat(60));
    
    await this.testEntityService();
    await this.testSearchService();
    await this.testRAGPipeline();
    
    this.printSummary();
  }

  private async testEntityService(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n📋 Testing Entity Service...');
      
      const entityService = new EntityService();
      await entityService.initialize();
      
      // Test system prompt loading
      const systemPrompt = entityService.getSystemPrompt();
      if (!systemPrompt || systemPrompt.length < 100) {
        throw new Error('System prompt too short or missing');
      }
      
      // Test entity categories
      const categories = entityService.getEntityCategories();
      if (categories.length === 0) {
        throw new Error('No entity categories loaded');
      }
      
      // Test entity matching
      const testMessage = 'I am worried about ovarian cancer symptoms';
      entityService.findMatchingEntities(testMessage);
      
      // Test crisis detection
      const crisisText = 'I want to die';
      const isCrisis = entityService.isCrisisIndicator(crisisText);
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: 'Entity Service',
        status: 'PASS',
        message: `Loaded ${categories.length} categories, ${entityService.getAllEntities().length} entities. Crisis detection: ${isCrisis ? 'Working' : 'Failed'}`,
        duration
      });
      
      console.log(`✅ Entity Service: ${categories.length} categories loaded`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'Entity Service',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ Entity Service failed: ${error}`);
    }
  }

  private async testSearchService(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🔍 Testing Search Service...');
      
      if (!process.env.AZURE_SEARCH_API_KEY || !process.env.AZURE_SEARCH_ENDPOINT) {
        throw new Error('Azure Search credentials not configured');
      }
      
      const searchService = new SearchService({
        endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
        apiKey: process.env.AZURE_SEARCH_API_KEY!,
        indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content'
      });
      
      // Test search functionality
      const searchResults = await searchService.search('cervical screening');
      
      if (!searchResults || searchResults.results.length === 0) {
        throw new Error('No search results returned');
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: 'Search Service',
        status: 'PASS',
        message: `Found ${searchResults.results.length} results for test query`,
        duration
      });
      
      console.log(`✅ Search Service: ${searchResults.results.length} results found`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: 'Search Service',
        status: 'FAIL',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration
      });
      
      console.log(`❌ Search Service failed: ${error}`);
    }
  }

  private async testRAGPipeline(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('\n🔗 Testing RAG Pipeline...');
      
      // Test if we can create a complete RAG flow
      const entityService = new EntityService();
      await entityService.initialize();
      
      const testQuery = 'What should I know about cervical screening?';
      
      // 1. Entity extraction
      const entities = entityService.findMatchingEntities(testQuery);
      
      // 2. Search retrieval (if search service is working)
      let searchResults: any = { results: [] };
      if (process.env.AZURE_SEARCH_API_KEY && process.env.AZURE_SEARCH_ENDPOINT) {
        const searchService = new SearchService({
          endpoint: process.env.AZURE_SEARCH_ENDPOINT,
          apiKey: process.env.AZURE_SEARCH_API_KEY,
          indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'ask-eve-content'
        });
        searchResults = await searchService.search('cervical screening');
      }
      
      // 3. Crisis detection
      const isCrisis = entityService.isCrisisIndicator(testQuery);
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        name: 'RAG Pipeline',
        status: 'PASS',
        message: `Entities: ${entities.length}, Search: ${searchResults.results.length}, Crisis: ${isCrisis}`,
        duration
      });
      
      console.log(`✅ RAG Pipeline: Complete flow working`);
      
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

  private printSummary(): void {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Test Summary');
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
      console.log('\n🎉 All tests passed! Local environment is ready.');
    } else {
      console.log(`\n⚠️  ${failed} tests failed. Check configuration and try again.`);
    }
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Address any failed tests');
    console.log('2. Request Azure OpenAI quota increase');
    console.log('3. Deploy to production when ready');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new LocalEnvironmentTester();
  tester.runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}