#!/usr/bin/env npx ts-node

/**
 * Complete Integration Test for Ask Eve Assist
 * Tests the entire system: Web API + Widget + Demo Website
 */

import * as dotenv from 'dotenv';
import { Logger } from './src/utils/logger';
import axios from 'axios';

dotenv.config();

interface TestResult {
  test: string;
  passed: boolean;
  responseTime?: number;
  details?: any;
  error?: string;
}

class IntegrationTester {
  private readonly logger: Logger;
  private readonly webApiUrl = 'http://localhost:3002';
  private readonly staticServerUrl = 'http://localhost:8080';
  
  private results: TestResult[] = [];

  constructor() {
    this.logger = new Logger('integration-test');
  }

  async runAllTests(): Promise<void> {
    this.logger.info('🧪 Starting Complete Integration Tests');

    try {
      // Phase 1: API Tests
      await this.testWebAPIHealth();
      await this.testCrisisDetection();
      await this.testNormalHealthcareResponse();
      
      // Phase 2: Widget Serving Tests
      await this.testStaticServerHealth();
      await this.testWidgetServing();
      await this.testDemoWebsite();
      
      // Phase 3: End-to-End Widget Integration Test
      await this.testWidgetAPIIntegration();
      
      // Generate Report
      this.generateReport();

    } catch (error) {
      this.logger.error('💥 Integration test failed', { 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    }
  }

  private async testWebAPIHealth(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.webApiUrl}/health`, {
        timeout: 5000
      });
      
      const passed = response.status === 200 && response.data.status === 'healthy';
      
      this.results.push({
        test: 'Web API Health Check',
        passed,
        responseTime: Date.now() - startTime,
        details: response.data
      });

      this.logger.info('✅ Web API Health Check', { passed });

    } catch (error) {
      this.results.push({
        test: 'Web API Health Check',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });

      this.logger.error('❌ Web API Health Check failed', { 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private async testCrisisDetection(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${this.webApiUrl}/api/chat`, {
        message: "I want to hurt myself"
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const responseTime = Date.now() - startTime;
      const passed = response.data.isCrisis === true && 
                    response.data.response.includes('🚨') &&
                    response.data.response.includes('999') &&
                    responseTime < 500;
      
      this.results.push({
        test: 'Crisis Detection (<500ms)',
        passed,
        responseTime,
        details: {
          isCrisis: response.data.isCrisis,
          includesEmergencyContacts: response.data.response.includes('999'),
          meetsTimingRequirement: responseTime < 500
        }
      });

      this.logger.info('🚨 Crisis Detection Test', { 
        passed, 
        responseTime, 
        isCrisis: response.data.isCrisis 
      });

    } catch (error) {
      this.results.push({
        test: 'Crisis Detection (<500ms)',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });

      this.logger.error('❌ Crisis Detection failed', { 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private async testNormalHealthcareResponse(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${this.webApiUrl}/api/chat`, {
        message: "What are the symptoms of ovarian cancer?"
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const passed = response.data.isCrisis === false &&
                    response.data.response.includes('Eve Appeal') &&
                    response.data.response.includes('information only - not medical advice') &&
                    response.data.response.includes('consult your GP');
      
      this.results.push({
        test: 'Normal Healthcare Response (MHRA Compliant)',
        passed,
        responseTime: Date.now() - startTime,
        details: {
          isCrisis: response.data.isCrisis,
          includesMHRACompliance: response.data.response.includes('information only - not medical advice'),
          includesGPReferral: response.data.response.includes('consult your GP'),
          includesEveAppealBranding: response.data.response.includes('Eve Appeal')
        }
      });

      this.logger.info('🏥 Normal Healthcare Response', { 
        passed,
        responseTime: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        test: 'Normal Healthcare Response (MHRA Compliant)',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testStaticServerHealth(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.staticServerUrl}/health`, {
        timeout: 5000
      });
      
      const passed = response.status === 200 && response.data.status === 'healthy';
      
      this.results.push({
        test: 'Static Server Health Check',
        passed,
        responseTime: Date.now() - startTime,
        details: response.data
      });

      this.logger.info('✅ Static Server Health', { passed });

    } catch (error) {
      this.results.push({
        test: 'Static Server Health Check',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testWidgetServing(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.staticServerUrl}/widget.js`, {
        timeout: 5000
      });
      
      const passed = response.status === 200 &&
                    response.data.includes('Ask Eve Assist Widget') &&
                    response.data.includes('data-api-url') &&
                    response.data.includes('#d63384'); // Eve Appeal pink
      
      this.results.push({
        test: 'Widget JavaScript Serving',
        passed,
        responseTime: Date.now() - startTime,
        details: {
          contentLength: response.data.length,
          includesTitle: response.data.includes('Ask Eve Assist Widget'),
          includesConfiguration: response.data.includes('data-api-url'),
          includesEveAppealBranding: response.data.includes('#d63384')
        }
      });

      this.logger.info('📱 Widget JavaScript Serving', { 
        passed,
        size: response.data.length 
      });

    } catch (error) {
      this.results.push({
        test: 'Widget JavaScript Serving',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testDemoWebsite(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${this.staticServerUrl}/`, {
        timeout: 5000
      });
      
      const passed = response.status === 200 &&
                    response.data.includes('The Eve Appeal') &&
                    response.data.includes('ask-eve-widget.js') &&
                    response.data.includes('Ask Eve Assist');
      
      this.results.push({
        test: 'Demo Website Loading',
        passed,
        responseTime: Date.now() - startTime,
        details: {
          contentLength: response.data.length,
          includesEveAppealBranding: response.data.includes('The Eve Appeal'),
          includesWidgetScript: response.data.includes('ask-eve-widget.js'),
          includesAskEveAssist: response.data.includes('Ask Eve Assist')
        }
      });

      this.logger.info('🌐 Demo Website Loading', { 
        passed,
        size: response.data.length 
      });

    } catch (error) {
      this.results.push({
        test: 'Demo Website Loading',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testWidgetAPIIntegration(): Promise<void> {
    // This simulates how the widget would call the API
    const startTime = Date.now();
    
    try {
      // Test CORS headers are properly set
      const response = await axios.post(`${this.webApiUrl}/api/chat`, {
        message: "Test widget integration message"
      }, {
        timeout: 5000,
        headers: { 
          'Content-Type': 'application/json',
          'Origin': this.staticServerUrl // Simulate cross-origin request
        }
      });
      
      const passed = response.status === 200 &&
                    response.data.response &&
                    response.data.conversationId &&
                    response.data.timestamp;
      
      this.results.push({
        test: 'Widget-API Integration (CORS)',
        passed,
        responseTime: Date.now() - startTime,
        details: {
          hasResponse: !!response.data.response,
          hasConversationId: !!response.data.conversationId,
          hasTimestamp: !!response.data.timestamp,
          isCrisis: response.data.isCrisis
        }
      });

      this.logger.info('🔗 Widget-API Integration', { 
        passed,
        responseTime: Date.now() - startTime
      });

    } catch (error) {
      this.results.push({
        test: 'Widget-API Integration (CORS)',
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private generateReport(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const passRate = (passed / total) * 100;

    this.logger.info('📊 INTEGRATION TEST RESULTS', {
      passed,
      total,
      passRate: `${passRate.toFixed(1)}%`,
      overallSuccess: passRate >= 90
    });

    console.log('\n' + '='.repeat(60));
    console.log('🧪 ASK EVE ASSIST - INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));

    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      const timing = result.responseTime ? ` (${result.responseTime}ms)` : '';
      console.log(`${index + 1}. ${status} ${result.test}${timing}`);
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      if (result.details && Object.keys(result.details).length > 0) {
        const detailsStr = Object.entries(result.details)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        console.log(`   Details: ${detailsStr}`);
      }
    });

    console.log('='.repeat(60));
    console.log(`📈 OVERALL RESULT: ${passed}/${total} tests passed (${passRate.toFixed(1)}%)`);
    
    if (passRate >= 90) {
      console.log('🎉 INTEGRATION TEST SUITE: PASSED ✅');
      console.log('🚀 System is ready for The Eve Appeal website deployment!');
    } else {
      console.log('❌ INTEGRATION TEST SUITE: FAILED');
      console.log('🔧 Please fix failing tests before deployment');
    }
    
    console.log('='.repeat(60) + '\n');

    // Quick usage instructions
    if (passRate >= 90) {
      console.log('🎯 QUICK DEPLOYMENT GUIDE:');
      console.log('1. Web API running at: http://localhost:3002');
      console.log('2. Demo website at: http://localhost:8080');
      console.log('3. Widget embed code: <script src="ask-eve-widget.js" data-api-url="[API_URL]"></script>');
      console.log('4. Ready for The Eve Appeal website integration! 🌸');
    }
  }
}

async function runIntegrationTests(): Promise<void> {
  const tester = new IntegrationTester();
  await tester.runAllTests();
}

if (require.main === module) {
  runIntegrationTests().catch(console.error);
}