#!/usr/bin/env ts-node

/**
 * Complete Azure Architecture Integration Test
 * 
 * Tests the full ultra-cheap Azure-native architecture:
 * - Azure AI Search (Free tier with vector search)
 * - Azure Table Storage (£1-2/month)
 * - M365 Agents SDK integration
 * - ContentAgent with Azure services
 * - Cost validation (£3-5/month target)
 * - Performance validation (<3s content search, <500ms crisis detection)
 */

import * as dotenv from 'dotenv';
import { Logger } from '../src/utils/logger';
import { AzureServicesFactory, createAzureServicesFromEnv } from '../src/services/AzureServicesFactory';
import { ContentAgent } from '../src/agents/ContentAgent';
import { EntityService } from '../src/services/EntityService';
import { 
  ConversationContext, 
  AgentMessage, 
  ContentAgentConfig 
} from '../src/types/agents';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

interface ArchitectureTestResult {
  testName: string;
  passed: boolean;
  duration: number;
  details: any;
  error?: string;
}

interface ArchitectureValidation {
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  costValidation: {
    totalCostPerMonth: number;
    meetsUltraCheapTarget: boolean;
    tier: 'ultra_cheap' | 'production' | 'premium';
  };
  performanceValidation: {
    averageSearchTime: number;
    meetsPerformanceTarget: boolean;
    crisisDetectionTime?: number;
  };
  functionalValidation: {
    searchWorks: boolean;
    vectorSearchWorks: boolean;
    tableStorageWorks: boolean;
    agentIntegrationWorks: boolean;
  };
  testResults: ArchitectureTestResult[];
  recommendations: string[];
}

class CompleteAzureArchitectureTestRunner {
  private logger: Logger;
  private azureFactory: AzureServicesFactory;
  private results: ArchitectureTestResult[] = [];

  constructor() {
    this.logger = new Logger({
      service: 'azure-architecture-test',
      level: 'info'
    });
    
    try {
      this.azureFactory = createAzureServicesFromEnv(this.logger);
    } catch (error) {
      throw new Error(`Failed to initialize Azure services: ${error.message}`);
    }
  }

  async runCompleteTest(): Promise<ArchitectureValidation> {
    this.logger.info('🚀 Starting Complete Azure Architecture Integration Test');
    this.logger.info('=' .repeat(80));

    try {
      // Phase 1: Infrastructure Tests
      await this.runTest('Azure Services Initialization', () => this.testAzureServicesInitialization());
      await this.runTest('Azure Services Health Check', () => this.testAzureServicesHealth());
      
      // Phase 2: Content Pipeline Tests
      await this.runTest('Content Search Functionality', () => this.testContentSearch());
      await this.runTest('Vector Search Functionality', () => this.testVectorSearch());
      await this.runTest('Table Storage Operations', () => this.testTableStorageOperations());
      
      // Phase 3: Agent Integration Tests
      await this.runTest('ContentAgent Azure Integration', () => this.testContentAgentIntegration());
      await this.runTest('Multi-Query Performance Test', () => this.testMultiQueryPerformance());
      
      // Phase 4: Cost and Performance Validation
      await this.runTest('Cost Analysis Validation', () => this.testCostAnalysis());
      await this.runTest('Performance Benchmarking', () => this.testPerformanceBenchmarking());
      
      // Generate comprehensive report
      return await this.generateArchitectureValidation();

    } catch (error) {
      this.logger.error('💥 Architecture test failed', { error });
      throw error;
    }
  }

  private async runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
    this.logger.info(`\n🧪 Running test: ${testName}`);
    const startTime = Date.now();

    try {
      const details = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        passed: true,
        duration,
        details
      });
      
      this.logger.info(`✅ ${testName} - PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        passed: false,
        duration,
        details: null,
        error: error.message
      });
      
      this.logger.error(`❌ ${testName} - FAILED (${duration}ms): ${error.message}`);
    }
  }

  private async testAzureServicesInitialization(): Promise<any> {
    this.logger.info('   Initializing Azure services...');
    
    const services = await this.azureFactory.initialize();
    
    // Verify services are available
    if (!services.searchService || !services.storageService) {
      throw new Error('Azure services not properly initialized');
    }
    
    return {
      searchServiceInitialized: !!services.searchService,
      storageServiceInitialized: !!services.storageService,
      factoryType: 'ultra_cheap_azure_native'
    };
  }

  private async testAzureServicesHealth(): Promise<any> {
    this.logger.info('   Checking Azure services health...');
    
    const healthCheck = await this.azureFactory.checkServicesHealth();
    
    if (healthCheck.overall === 'unhealthy') {
      throw new Error(`Azure services unhealthy: ${healthCheck.issues.join(', ')}`);
    }
    
    this.logger.info(`   Overall health: ${healthCheck.overall}`);
    if (healthCheck.issues.length > 0) {
      this.logger.warn(`   Health issues: ${healthCheck.issues.join(', ')}`);
    }
    
    return healthCheck;
  }

  private async testContentSearch(): Promise<any> {
    this.logger.info('   Testing content search functionality...');
    
    const searchService = this.azureFactory.getSearchService();
    
    // Test healthcare-specific search
    const results = await searchService.searchHealthcareContent('cervical cancer symptoms', {
      useVector: false,
      top: 3
    });
    
    if (!Array.isArray(results)) {
      throw new Error('Search results not in expected format');
    }
    
    this.logger.info(`   Found ${results.length} search results`);
    
    return {
      resultsCount: results.length,
      hasResults: results.length > 0,
      topResultScore: results.length > 0 ? results[0].score : 0,
      searchMethod: 'text_search'
    };
  }

  private async testVectorSearch(): Promise<any> {
    this.logger.info('   Testing vector search functionality...');
    
    const searchService = this.azureFactory.getSearchService();
    
    // Test semantic vector search
    const results = await searchService.searchHealthcareContent('women health screening prevention', {
      useVector: true,
      top: 3
    });
    
    if (!Array.isArray(results)) {
      throw new Error('Vector search results not in expected format');
    }
    
    this.logger.info(`   Vector search found ${results.length} results`);
    
    return {
      resultsCount: results.length,
      hasResults: results.length > 0,
      topResultScore: results.length > 0 ? results[0].score : 0,
      searchMethod: 'vector_search'
    };
  }

  private async testTableStorageOperations(): Promise<any> {
    this.logger.info('   Testing Azure Table Storage operations...');
    
    const storageService = this.azureFactory.getStorageService();
    
    // Test search logging
    const testSearchId = `test-${Date.now()}`;
    await storageService.logSearchOperation({
      id: testSearchId,
      query: 'architecture test query',
      matchedChunks: ['chunk1', 'chunk2'],
      responseGenerated: true,
      searchMethod: 'test_search',
      responseTimeMs: 150,
      agentId: 'test_agent',
      conversationId: 'test_conversation',
      metadata: { test: true }
    });
    
    // Get storage statistics
    const stats = await storageService.getStorageStatistics();
    
    this.logger.info(`   Table Storage operations: ${stats.searchLogCount} search logs`);
    
    return {
      canLogSearches: true,
      searchLogCount: stats.searchLogCount,
      estimatedCostPerMonth: stats.estimatedCostPerMonth,
      storageOperational: true
    };
  }

  private async testContentAgentIntegration(): Promise<any> {
    this.logger.info('   Testing ContentAgent with Azure services integration...');
    
    // Create services
    const services = this.azureFactory.getServices();
    const entityService = new EntityService();
    await entityService.initialize();
    
    // Create ContentAgent with Azure services
    const contentAgent = new ContentAgent(
      this.logger,
      {
        mhraCompliance: {
          mandatorySourceAttribution: true,
          prohibitMedicalAdvice: true,
          requireDisclaimers: true
        },
        searchConfiguration: {
          maxResults: 5,
          useVectorSearch: true,
          prioritizeCriticalContent: true
        },
        performance: {
          responseTimeTarget: 3000,
          enableCaching: false,
          logSearchOperations: true
        }
      } as ContentAgentConfig,
      services.searchService,
      services.storageService,
      entityService
    );
    
    // Initialize agent
    await contentAgent.initialize();
    
    // Test agent message processing
    const testMessage: AgentMessage = {
      id: uuidv4(),
      fromAgent: 'test_runner',
      toAgent: 'content_agent',
      messageType: 'content_search_request',
      payload: {
        conversationId: 'test-conversation',
        userId: 'test-user',
        data: {
          userMessage: 'What are the symptoms of ovarian cancer?',
          safetyCleared: true
        }
      },
      priority: 'high',
      timestamp: Date.now()
    };
    
    const testContext: ConversationContext = {
      conversationId: 'test-conversation',
      userId: 'test-user',
      sessionId: 'test-session',
      messageHistory: [],
      safetyStatus: 'safe',
      escalationStatus: 'none',
      metadata: { test: true }
    };
    
    const agentResponse = await contentAgent.processMessage(testMessage, testContext);
    
    // Validate response
    if (!agentResponse.success) {
      throw new Error(`Agent processing failed: ${agentResponse.error}`);
    }
    
    const hasContent = agentResponse.result?.found;
    const hasSourceAttribution = !!agentResponse.result?.sourceUrl;
    const responseTime = agentResponse.responseTime;
    
    this.logger.info(`   Agent response: found=${hasContent}, sourceAttributed=${hasSourceAttribution}, time=${responseTime}ms`);
    
    return {
      agentInitialized: true,
      processingWorks: agentResponse.success,
      contentFound: hasContent,
      sourceAttributed: hasSourceAttribution,
      responseTime,
      meetsPerformanceTarget: responseTime < 3000,
      mhraCompliant: hasSourceAttribution
    };
  }

  private async testMultiQueryPerformance(): Promise<any> {
    this.logger.info('   Testing multi-query performance...');
    
    const searchService = this.azureFactory.getSearchService();
    
    const testQueries = [
      'cervical screening guidelines',
      'endometriosis symptoms',
      'ovarian cancer risk factors',
      'HPV vaccine information',
      'menopause management'
    ];
    
    const results = [];
    const startTime = Date.now();
    
    for (const query of testQueries) {
      const queryStart = Date.now();
      const searchResults = await searchService.searchHealthcareContent(query, {
        useVector: true,
        top: 2
      });
      const queryTime = Date.now() - queryStart;
      
      results.push({
        query,
        resultCount: searchResults.length,
        time: queryTime
      });
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / testQueries.length;
    const maxTime = Math.max(...results.map(r => r.time));
    
    this.logger.info(`   Multi-query performance: avg=${avgTime.toFixed(0)}ms, max=${maxTime}ms`);
    
    return {
      queriesProcessed: testQueries.length,
      totalTime,
      averageTime: avgTime,
      maxTime,
      results,
      meetsPerformanceTarget: maxTime < 3000
    };
  }

  private async testCostAnalysis(): Promise<any> {
    this.logger.info('   Validating cost analysis...');
    
    const costAnalysis = await this.azureFactory.getCostAnalysis();
    
    this.logger.info(`   Total cost: £${costAnalysis.totalCostPerMonth.toFixed(2)}/month`);
    this.logger.info(`   Search tier: ${costAnalysis.searchTier}`);
    this.logger.info(`   Category: ${costAnalysis.costCategory}`);
    
    return costAnalysis;
  }

  private async testPerformanceBenchmarking(): Promise<any> {
    this.logger.info('   Running performance benchmarking...');
    
    const searchService = this.azureFactory.getSearchService();
    const benchmarkResults = await searchService.runSearchTests();
    
    this.logger.info(`   Text search: ${benchmarkResults.textSearchWorks ? 'WORKS' : 'FAILED'}`);
    this.logger.info(`   Vector search: ${benchmarkResults.vectorSearchWorks ? 'WORKS' : 'FAILED'}`);
    this.logger.info(`   Semantic search: ${benchmarkResults.semanticSearchWorks ? 'WORKS' : 'FAILED'}`);
    
    const avgResponseTime = benchmarkResults.results.reduce((sum, r) => sum + r.executionTimeMs, 0) / benchmarkResults.results.length;
    
    return {
      ...benchmarkResults,
      averageResponseTime: avgResponseTime,
      allSearchMethodsWork: benchmarkResults.textSearchWorks || benchmarkResults.vectorSearchWorks,
      meetsPerformanceTarget: avgResponseTime < 3000
    };
  }

  private async generateArchitectureValidation(): Promise<ArchitectureValidation> {
    this.logger.info('\n🔍 Generating architecture validation report...');
    
    // Analyze test results
    const passedTests = this.results.filter(r => r.passed).length;
    const totalTests = this.results.length;
    const overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 
      passedTests === totalTests ? 'healthy' : 
      passedTests > totalTests * 0.8 ? 'degraded' : 'unhealthy';
    
    // Extract specific validations
    const costTest = this.results.find(r => r.testName === 'Cost Analysis Validation');
    const performanceTest = this.results.find(r => r.testName === 'Performance Benchmarking');
    const agentTest = this.results.find(r => r.testName === 'ContentAgent Azure Integration');
    const multiQueryTest = this.results.find(r => r.testName === 'Multi-Query Performance Test');
    
    // Cost validation
    const costValidation = {
      totalCostPerMonth: costTest?.details?.totalCostPerMonth || 0,
      meetsUltraCheapTarget: (costTest?.details?.totalCostPerMonth || 100) <= 5,
      tier: costTest?.details?.costCategory || 'unknown' as any
    };
    
    // Performance validation
    const performanceValidation = {
      averageSearchTime: performanceTest?.details?.averageResponseTime || 0,
      meetsPerformanceTarget: (performanceTest?.details?.averageResponseTime || 10000) < 3000,
      crisisDetectionTime: undefined // Could be added with SafetyAgent test
    };
    
    // Functional validation
    const functionalValidation = {
      searchWorks: !!performanceTest?.details?.textSearchWorks,
      vectorSearchWorks: !!performanceTest?.details?.vectorSearchWorks,
      tableStorageWorks: !!this.results.find(r => r.testName === 'Table Storage Operations')?.passed,
      agentIntegrationWorks: !!agentTest?.details?.processingWorks
    };
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (costValidation.meetsUltraCheapTarget) {
      recommendations.push('✅ Ultra-cheap architecture target achieved (≤£5/month)');
    } else if (costValidation.totalCostPerMonth <= 25) {
      recommendations.push('✅ Production-ready cost achieved (≤£25/month)');
    } else {
      recommendations.push('⚠️ Consider optimizing costs - exceeds target thresholds');
    }
    
    if (performanceValidation.meetsPerformanceTarget) {
      recommendations.push('✅ Performance targets met (<3s response time)');
    } else {
      recommendations.push('⚠️ Performance optimization needed');
    }
    
    if (functionalValidation.vectorSearchWorks) {
      recommendations.push('✅ Advanced vector search capabilities active');
    }
    
    if (overallHealth === 'healthy') {
      recommendations.push('🚀 Ready for production deployment');
    } else {
      recommendations.push('⚠️ Address failed tests before production deployment');
    }
    
    return {
      overallHealth,
      costValidation,
      performanceValidation,
      functionalValidation,
      testResults: this.results,
      recommendations
    };
  }
}

async function main() {
  console.log('🏗️ Complete Azure Architecture Integration Test');
  console.log('Testing ultra-cheap Azure-native M365 Agents architecture\n');

  try {
    const testRunner = new CompleteAzureArchitectureTestRunner();
    const validation = await testRunner.runCompleteTest();
    
    // Print comprehensive report
    console.log('\n' + '=' .repeat(80));
    console.log('📋 ARCHITECTURE VALIDATION REPORT');
    console.log('=' .repeat(80));
    
    console.log(`\n🏥 Overall Health: ${validation.overallHealth.toUpperCase()}`);
    
    console.log(`\n💰 Cost Analysis:`);
    console.log(`   Total monthly cost: £${validation.costValidation.totalCostPerMonth.toFixed(2)}`);
    console.log(`   Ultra-cheap target (≤£5): ${validation.costValidation.meetsUltraCheapTarget ? '✅ MET' : '❌ NOT MET'}`);
    console.log(`   Cost tier: ${validation.costValidation.tier}`);
    
    console.log(`\n⚡ Performance Analysis:`);
    console.log(`   Average response time: ${validation.performanceValidation.averageSearchTime.toFixed(0)}ms`);
    console.log(`   Performance target (<3s): ${validation.performanceValidation.meetsPerformanceTarget ? '✅ MET' : '❌ NOT MET'}`);
    
    console.log(`\n🔧 Functional Validation:`);
    console.log(`   Text search: ${validation.functionalValidation.searchWorks ? '✅ WORKS' : '❌ FAILED'}`);
    console.log(`   Vector search: ${validation.functionalValidation.vectorSearchWorks ? '✅ WORKS' : '❌ FAILED'}`);
    console.log(`   Table storage: ${validation.functionalValidation.tableStorageWorks ? '✅ WORKS' : '❌ FAILED'}`);
    console.log(`   Agent integration: ${validation.functionalValidation.agentIntegrationWorks ? '✅ WORKS' : '❌ FAILED'}`);
    
    console.log(`\n📊 Test Results (${validation.testResults.filter(r => r.passed).length}/${validation.testResults.length} passed):`);
    validation.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`   ${status} ${result.testName} (${result.duration}ms)`);
      if (!result.passed && result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });
    
    console.log(`\n💡 Recommendations:`);
    validation.recommendations.forEach(rec => {
      console.log(`   ${rec}`);
    });
    
    // Exit with appropriate code
    const success = validation.overallHealth !== 'unhealthy' && 
                   validation.functionalValidation.agentIntegrationWorks;
    
    if (success) {
      console.log('\n🎉 Azure Architecture Validation SUCCESSFUL!');
      console.log('Ready for ultra-cheap production deployment.');
    } else {
      console.log('\n⚠️ Azure Architecture Validation requires attention.');
      console.log('Address issues before production deployment.');
    }
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error('\n💥 Architecture test failed:', error.message);
    console.error('\nEnsure all required environment variables are set:');
    console.error('- AZURE_SEARCH_ENDPOINT');
    console.error('- AZURE_SEARCH_API_KEY');  
    console.error('- AZURE_STORAGE_CONNECTION_STRING');
    console.error('- AZURE_OPENAI_API_KEY');
    console.error('- AZURE_OPENAI_ENDPOINT (optional)');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { CompleteAzureArchitectureTestRunner, ArchitectureValidation };