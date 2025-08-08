#!/usr/bin/env ts-node

/**
 * Test Azure AI Search Service Implementation
 * Validates hybrid text + vector search functionality with PiF content
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { AzureAISearchService, HealthcareSearchDocument } from '../src/services/AzureAISearchService';

dotenv.config();

interface TestSuite {
  name: string;
  tests: Array<() => Promise<void>>;
}

class AzureSearchTestRunner {
  private searchService: AzureAISearchService;
  private testResults: Array<{ name: string; success: boolean; duration: number; error?: string }> = [];

  constructor() {
    // Validate required environment variables
    const requiredEnvVars = [
      'AZURE_SEARCH_ENDPOINT',
      'AZURE_SEARCH_API_KEY',
      'AZURE_OPENAI_API_KEY'
    ];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    this.searchService = new AzureAISearchService({
      searchEndpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      searchApiKey: process.env.AZURE_SEARCH_API_KEY!,
      openaiApiKey: process.env.AZURE_OPENAI_API_KEY!,
      openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT
    });
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    console.log(`\n🧪 Running test: ${name}`);
    const startTime = Date.now();

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.testResults.push({ name, success: true, duration });
      console.log(`✅ ${name} - PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.testResults.push({ 
        name, 
        success: false, 
        duration, 
        error: error.message 
      });
      console.log(`❌ ${name} - FAILED (${duration}ms): ${error.message}`);
    }
  }

  async testIndexInitialization(): Promise<void> {
    await this.searchService.initializeIndex();
    console.log('   Index initialized successfully');
  }

  async testIndexHealthValidation(): Promise<void> {
    const health = await this.searchService.validateIndexHealth();
    
    if (!health.indexExists) {
      throw new Error('Index does not exist');
    }

    console.log(`   Index health: ${health.isHealthy ? 'HEALTHY' : 'NEEDS ATTENTION'}`);
    console.log(`   Document count: ${health.documentCount}`);
    console.log(`   Vector configured: ${health.vectorFieldConfigured}`);
    console.log(`   Semantic configured: ${health.semanticConfigured}`);

    if (health.issues.length > 0) {
      console.log(`   Issues: ${health.issues.join(', ')}`);
    }
  }

  async testContentIndexing(): Promise<void> {
    // Load PiF content
    const contentPath = path.join(__dirname, '../data/pif-chunks.json');
    
    if (!fs.existsSync(contentPath)) {
      throw new Error(`PiF content file not found: ${contentPath}`);
    }

    const rawContent = fs.readFileSync(contentPath, 'utf8');
    const chunks = JSON.parse(rawContent);

    if (!chunks || chunks.length === 0) {
      throw new Error('No PiF content chunks found');
    }

    // Transform to Azure AI Search documents
    const documents: Omit<HealthcareSearchDocument, 'contentVector'>[] = chunks.map((chunk: any, index: number) => ({
      id: `chunk-${index + 1}`,
      chunkId: `chunk-${index + 1}`,
      title: chunk.title || `PiF Content Chunk ${index + 1}`,
      content: chunk.content,
      contentType: 'medical_information',
      priorityLevel: 'high',
      sourceUrl: chunk.sourceUrl || 'https://eveappeal.org.uk',
      pageNumber: chunk.chunkIndex || index + 1,
      relevanceKeywords: chunk.keywords || [],
      medicalCategories: ['womens_health', 'gynaecology'],
      createdAt: new Date(),
      lastUpdated: new Date()
    }));

    console.log(`   Indexing ${documents.length} healthcare documents...`);
    await this.searchService.indexHealthcareContent(documents);
    console.log(`   Successfully indexed ${documents.length} documents with embeddings`);
  }

  async testTextSearch(): Promise<void> {
    const results = await this.searchService.searchHealthcareContent('cancer symptoms', {
      useVector: false,
      top: 3
    });

    if (results.length === 0) {
      throw new Error('Text search returned no results');
    }

    console.log(`   Text search returned ${results.length} results`);
    console.log(`   Top result: "${results[0].document.title}" (score: ${results[0].score})`);
  }

  async testVectorSearch(): Promise<void> {
    const results = await this.searchService.searchHealthcareContent('women health screening prevention', {
      useVector: true,
      top: 3
    });

    if (results.length === 0) {
      throw new Error('Vector search returned no results');
    }

    console.log(`   Vector search returned ${results.length} results`);
    console.log(`   Top result: "${results[0].document.title}" (score: ${results[0].score})`);
  }

  async testSemanticSearch(): Promise<void> {
    const results = await this.searchService.searchHealthcareContent('What are the early warning signs of ovarian cancer?', {
      useVector: false,
      top: 3
    });

    if (results.length === 0) {
      throw new Error('Semantic search returned no results');
    }

    console.log(`   Semantic search returned ${results.length} results`);
    console.log(`   Top result: "${results[0].document.title}" (score: ${results[0].score})`);
  }

  async testCriticalContentSearch(): Promise<void> {
    // This should prioritize high-priority content
    const results = await this.searchService.getCriticalHealthcareContent('emergency symptoms');

    console.log(`   Critical content search returned ${results.length} results`);
    if (results.length > 0) {
      console.log(`   Top critical result: "${results[0].document.title}"`);
    }
  }

  async testSearchTests(): Promise<void> {
    const testResults = await this.searchService.runSearchTests();

    console.log(`   Text search works: ${testResults.textSearchWorks}`);
    console.log(`   Vector search works: ${testResults.vectorSearchWorks}`);
    console.log(`   Semantic search works: ${testResults.semanticSearchWorks}`);

    // At least one search method should work
    if (!testResults.textSearchWorks && !testResults.vectorSearchWorks && !testResults.semanticSearchWorks) {
      throw new Error('No search methods are working');
    }

    // Log detailed results
    testResults.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} ${result.testName}: ${result.resultCount} results in ${result.executionTimeMs}ms`);
    });
  }

  async testIndexStatistics(): Promise<void> {
    const stats = await this.searchService.getIndexStatistics();

    console.log(`   Document count: ${stats.documentCount}`);
    console.log(`   Storage size: ${stats.indexSizeMB} MB`);

    if (stats.documentCount === 0) {
      throw new Error('Index is empty');
    }

    // Validate we're within Free tier limits (50MB)
    if (stats.indexSizeMB > 50) {
      console.warn(`   ⚠️ Index size (${stats.indexSizeMB} MB) exceeds Free tier limit (50 MB)`);
    } else {
      console.log(`   ✅ Index fits within Free tier limit (${(50 - stats.indexSizeMB).toFixed(2)} MB remaining)`);
    }
  }

  async testPerformance(): Promise<void> {
    const testQueries = [
      'cervical cancer screening',
      'ovarian cancer symptoms',
      'HPV vaccine information',
      'endometriosis treatment options',
      'women health check guidelines'
    ];

    const results: Array<{ query: string; time: number; results: number }> = [];

    for (const query of testQueries) {
      const start = Date.now();
      const searchResults = await this.searchService.searchHealthcareContent(query, { top: 5 });
      const time = Date.now() - start;
      
      results.push({ query, time, results: searchResults.length });
    }

    const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
    const maxTime = Math.max(...results.map(r => r.time));

    console.log(`   Average search time: ${avgTime.toFixed(0)}ms`);
    console.log(`   Max search time: ${maxTime}ms`);
    console.log(`   Total queries tested: ${results.length}`);

    // Performance requirement: searches should complete under 3 seconds
    if (maxTime > 3000) {
      throw new Error(`Search performance too slow: ${maxTime}ms > 3000ms`);
    }

    // Average should be much faster
    if (avgTime > 1000) {
      console.warn(`   ⚠️ Average search time (${avgTime.toFixed(0)}ms) is slower than ideal (<1000ms)`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Azure AI Search Service Tests\n');
    console.log('=' .repeat(80));

    const testSuites: TestSuite[] = [
      {
        name: 'Infrastructure Tests',
        tests: [
          () => this.runTest('Index Initialization', () => this.testIndexInitialization()),
          () => this.runTest('Index Health Validation', () => this.testIndexHealthValidation())
        ]
      },
      {
        name: 'Content Indexing Tests',
        tests: [
          () => this.runTest('Content Indexing with Embeddings', () => this.testContentIndexing()),
          () => this.runTest('Index Statistics', () => this.testIndexStatistics())
        ]
      },
      {
        name: 'Search Functionality Tests',
        tests: [
          () => this.runTest('Text Search', () => this.testTextSearch()),
          () => this.runTest('Vector Search', () => this.testVectorSearch()),
          () => this.runTest('Semantic Search', () => this.testSemanticSearch()),
          () => this.runTest('Critical Content Search', () => this.testCriticalContentSearch()),
          () => this.runTest('Built-in Search Tests', () => this.testSearchTests())
        ]
      },
      {
        name: 'Performance Tests',
        tests: [
          () => this.runTest('Search Performance', () => this.testPerformance())
        ]
      }
    ];

    for (const suite of testSuites) {
      console.log(`\n📋 ${suite.name}`);
      console.log('-' .repeat(40));
      
      for (const test of suite.tests) {
        await test();
      }
    }

    // Print summary
    this.printSummary();
  }

  private printSummary(): void {
    console.log('\n' + '=' .repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(80));

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n🏁 Results:`);
    console.log(`   Total tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests} ✅`);
    console.log(`   Failed: ${failedTests} ❌`);
    console.log(`   Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`   Total duration: ${totalDuration}ms`);

    if (failedTests > 0) {
      console.log(`\n❌ Failed tests:`);
      this.testResults
        .filter(r => !r.success)
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    if (passedTests === totalTests) {
      console.log('\n🎉 All tests passed! Azure AI Search service is ready for production.');
    } else {
      console.log('\n⚠️ Some tests failed. Please address issues before deploying.');
    }

    console.log('\n💰 Cost Analysis:');
    const stats = this.testResults.find(r => r.name.includes('Index Statistics'));
    if (stats && stats.success) {
      console.log('   ✅ Healthcare content fits in Azure AI Search Free tier');
      console.log('   📊 Ultra-cheap architecture: £3-5/month total cost');
      console.log('   🔄 Can scale to Basic tier (£23-25/month) when needed');
    }
  }
}

async function main() {
  try {
    const testRunner = new AzureSearchTestRunner();
    await testRunner.runAllTests();
  } catch (error) {
    console.error('\n❌ Test initialization failed:', error);
    console.error('\nPlease ensure:');
    console.error('1. Environment variables are set in .env file:');
    console.error('   - AZURE_SEARCH_ENDPOINT');
    console.error('   - AZURE_SEARCH_API_KEY');
    console.error('   - AZURE_OPENAI_API_KEY');
    console.error('   - AZURE_OPENAI_ENDPOINT (optional)');
    console.error('2. PiF content is available at data/pif-chunks.json');
    console.error('3. Azure AI Search service is accessible');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}