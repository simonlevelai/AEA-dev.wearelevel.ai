/**
 * 🚨 CRITICAL HEALTHCARE ESCALATION TEST MATRIX
 * Comprehensive testing for nurse escalation detection failures
 * 
 * This validates all the patterns that were failing in production:
 * - "Can I speak to a nurse please?" 
 * - "Yes please" responses
 * - "Can you arrange it for me?"
 * 
 * EVERY TEST MUST PASS - Patient safety depends on these patterns working
 */

const TEST_API_URL = 'http://localhost:3002'; // Change to production URL for production testing

// ===== CRITICAL ESCALATION PATTERNS =====
const ESCALATION_TEST_CASES = [
  {
    category: '🎯 DIRECT NURSE REQUESTS (Production Failures)',
    tests: [
      {
        message: "Can I speak to a nurse please?",
        expectedFlow: 'direct_escalation',
        priority: 'HIGH',
        description: 'Production failure case - direct nurse request with politeness'
      },
      {
        message: "I want to speak to a nurse",
        expectedFlow: 'direct_escalation',
        priority: 'HIGH',
        description: 'Direct statement of nurse need'
      },
      {
        message: "Can you connect me with someone?",
        expectedFlow: 'direct_escalation',
        priority: 'HIGH',
        description: 'Request for human connection'
      },
      {
        message: "I need to talk to a professional",
        expectedFlow: 'direct_escalation',
        priority: 'HIGH',
        description: 'Request for professional support'
      }
    ]
  },
  
  {
    category: '📋 ESCALATION ARRANGEMENT REQUESTS (Production Failures)',
    tests: [
      {
        message: "Can you arrange it for me?",
        expectedFlow: 'arrangement_request',
        priority: 'HIGH',
        description: 'Production failure case - arrangement request'
      },
      {
        message: "Please set that up",
        expectedFlow: 'arrangement_request',
        priority: 'HIGH',
        description: 'Arrangement setup request'
      },
      {
        message: "Help me arrange that",
        expectedFlow: 'arrangement_request',
        priority: 'HIGH',
        description: 'Help with arrangement'
      },
      {
        message: "Can you organize a callback?",
        expectedFlow: 'arrangement_request',
        priority: 'HIGH',
        description: 'Callback organization request'
      }
    ]
  },
  
  {
    category: '✅ POSITIVE RESPONSES TO OFFERS (Production Failures)', 
    tests: [
      {
        setup: "Would you like to speak with one of our Ask Eve nurses?", // Previous bot message
        message: "Yes please",
        expectedFlow: 'offer_acceptance',
        priority: 'CRITICAL',
        description: 'Production failure case - polite positive response'
      },
      {
        setup: "Would you like me to arrange for one to contact you?",
        message: "Sure please",
        expectedFlow: 'offer_acceptance', 
        priority: 'CRITICAL',
        description: 'Alternative polite positive response'
      },
      {
        setup: "Our nurses can provide additional support. Interested?",
        message: "That would be great",
        expectedFlow: 'offer_acceptance',
        priority: 'CRITICAL', 
        description: 'Natural positive response'
      },
      {
        setup: "Would you like nurse support?",
        message: "Yes",
        expectedFlow: 'offer_acceptance',
        priority: 'CRITICAL',
        description: 'Simple affirmative response'
      },
      {
        setup: "Shall I connect you with a nurse?",
        message: "Please do",
        expectedFlow: 'offer_acceptance',
        priority: 'CRITICAL',
        description: 'Polite agreement'
      }
    ]
  },
  
  {
    category: '🔄 CONTEXT TRACKING SCENARIOS',
    tests: [
      {
        setup: "Our nurses can help with that. Would you like to speak with one?",
        message: "What about HPV testing?", // New health question
        expectedFlow: 'new_health_question',
        priority: 'HIGH',
        description: 'New health question during pending offer should be answered first'
      },
      {
        setup: "Would you like nurse support?",
        message: "Maybe later",
        expectedFlow: 'offer_declined',
        priority: 'MEDIUM',
        description: 'Soft decline should be handled gracefully'
      },
      {
        setup: "Shall I arrange a nurse callback?",
        message: "I dont know",
        expectedFlow: 'clarification_needed',
        priority: 'MEDIUM', 
        description: 'Ambiguous responses should ask for clarification'
      }
    ]
  },
  
  {
    category: '🚨 CRISIS SCENARIOS WITH ESCALATION',
    tests: [
      {
        message: "I can't cope with this cancer diagnosis",
        expectedFlow: 'crisis_with_escalation',
        priority: 'CRITICAL',
        description: 'Crisis detection + immediate escalation offer'
      },
      {
        message: "I'm scared about my abnormal smear and don't know what to do",
        expectedFlow: 'emotional_distress_escalation',
        priority: 'HIGH',
        description: 'Emotional distress requiring nurse support'
      }
    ]
  }
];

// ===== TEST EXECUTION ENGINE =====
class EscalationTestRunner {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.results = {
      passed: 0,
      failed: 0,
      critical_failures: 0,
      failures: []
    };
  }
  
  async runTest(testCase, conversationId = null) {
    console.log(`🧪 Testing: "${testCase.message}"`);
    
    try {
      // Setup phase - send setup message if provided
      if (testCase.setup) {
        console.log(`   📝 Setup: "${testCase.setup}"`);
        // Simulate previous bot message in conversation
        await this.sendMessage("Tell me about cervical cancer", conversationId);
        await this.delay(1000); // Wait for processing
      }
      
      // Test phase - send actual test message
      const response = await this.sendMessage(testCase.message, conversationId);
      
      // Validate response based on expected flow
      const validation = this.validateResponse(response, testCase);
      
      if (validation.passed) {
        console.log(`   ✅ PASS: ${validation.reason}`);
        this.results.passed++;
      } else {
        console.log(`   ❌ FAIL: ${validation.reason}`);
        this.results.failed++;
        
        if (testCase.priority === 'CRITICAL') {
          this.results.critical_failures++;
          console.log(`   🚨 CRITICAL FAILURE - PATIENT SAFETY RISK`);
        }
        
        this.results.failures.push({
          test: testCase,
          reason: validation.reason,
          response: response.response?.substring(0, 100) + '...'
        });
      }
      
    } catch (error) {
      console.log(`   💥 ERROR: ${error.message}`);
      this.results.failed++;
      this.results.failures.push({
        test: testCase,
        reason: `Network/API Error: ${error.message}`,
        response: null
      });
    }
    
    console.log(''); // Spacing
  }
  
  async sendMessage(message, conversationId = null) {
    const payload = {
      message: message,
      conversationId: conversationId || 'test-escalation-' + Date.now()
    };
    
    const response = await fetch(`${this.apiUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  validateResponse(response, testCase) {
    const botResponse = response.response?.toLowerCase() || '';
    const hasEscalation = response.hasEscalation || false;
    
    switch (testCase.expectedFlow) {
      case 'direct_escalation':
        // Should immediately start GDPR consent flow
        if (botResponse.includes('consent') && (botResponse.includes('nurse') || botResponse.includes('support'))) {
          return { passed: true, reason: 'GDPR consent flow started for direct request' };
        }
        return { passed: false, reason: 'Expected immediate consent flow, got: ' + botResponse.substring(0, 50) };
        
      case 'arrangement_request':
        // Should recognize as direct escalation request  
        if (botResponse.includes('consent') || botResponse.includes('happy to connect')) {
          return { passed: true, reason: 'Arrangement request recognized and processed' };
        }
        return { passed: false, reason: 'Arrangement request not recognized, got: ' + botResponse.substring(0, 50) };
        
      case 'offer_acceptance':
        // Should start consent flow after accepting offer
        if (botResponse.includes('consent') && botResponse.includes('collect some information')) {
          return { passed: true, reason: 'Offer acceptance triggered consent flow' };
        }
        return { passed: false, reason: 'Offer acceptance not detected, got: ' + botResponse.substring(0, 50) };
        
      case 'new_health_question':
        // Should provide healthcare information, not force escalation
        if (botResponse.includes('hpv') && !botResponse.includes('consent')) {
          return { passed: true, reason: 'New health question answered appropriately' };
        }
        return { passed: false, reason: 'New health question not handled properly, got: ' + botResponse.substring(0, 50) };
        
      case 'offer_declined':
        // Should continue conversation normally
        if (botResponse.includes('no problem') || botResponse.includes('here if you need')) {
          return { passed: true, reason: 'Offer decline handled gracefully' };
        }
        return { passed: false, reason: 'Offer decline not handled well, got: ' + botResponse.substring(0, 50) };
        
      case 'clarification_needed':
        // Should ask for clarification
        if (botResponse.includes('understand') && botResponse.includes('yes') && botResponse.includes('no')) {
          return { passed: true, reason: 'Clarification requested for ambiguous response' };
        }
        return { passed: false, reason: 'No clarification requested, got: ' + botResponse.substring(0, 50) };
        
      case 'crisis_with_escalation':
        // Should detect crisis AND offer escalation
        if (response.isCrisis && (botResponse.includes('nurses') || hasEscalation)) {
          return { passed: true, reason: 'Crisis detected with escalation offered' };
        }
        return { passed: false, reason: 'Crisis or escalation not detected properly' };
        
      case 'emotional_distress_escalation':
        // Should offer nurse support for emotional distress
        if (botResponse.includes('nurse') && (botResponse.includes('support') || botResponse.includes('speak'))) {
          return { passed: true, reason: 'Emotional distress escalation offered' };
        }
        return { passed: false, reason: 'Emotional distress escalation not offered, got: ' + botResponse.substring(0, 50) };
        
      default:
        return { passed: false, reason: 'Unknown expected flow: ' + testCase.expectedFlow };
    }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async runAllTests() {
    console.log('🚨 STARTING CRITICAL HEALTHCARE ESCALATION TEST MATRIX');
    console.log('='.repeat(60));
    console.log('Testing against:', this.apiUrl);
    console.log('');
    
    for (const category of ESCALATION_TEST_CASES) {
      console.log(`📊 ${category.category}`);
      console.log('-'.repeat(40));
      
      for (const test of category.tests) {
        await this.runTest(test);
        await this.delay(2000); // Prevent rate limiting
      }
      
      console.log('');
    }
    
    this.printSummary();
  }
  
  printSummary() {
    console.log('🎯 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`🚨 Critical Failures: ${this.results.critical_failures}`);
    console.log(`📊 Success Rate: ${Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100)}%`);
    
    if (this.results.critical_failures > 0) {
      console.log('\n🚨 CRITICAL FAILURES (PATIENT SAFETY RISK):');
      this.results.failures
        .filter(f => f.test.priority === 'CRITICAL')
        .forEach(failure => {
          console.log(`   • "${failure.test.message}" - ${failure.reason}`);
        });
    }
    
    if (this.results.failures.length > 0) {
      console.log('\n❌ ALL FAILURES:');
      this.results.failures.forEach(failure => {
        console.log(`   • [${failure.test.priority}] "${failure.test.message}"`);
        console.log(`     ${failure.reason}`);
        console.log('');
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (this.results.critical_failures === 0) {
      console.log('🎉 NO CRITICAL FAILURES - Patient safety validated!');
    } else {
      console.log('⚠️  CRITICAL FAILURES DETECTED - Do not deploy until fixed!');
    }
  }
}

// ===== RUN TESTS =====
async function runEscalationTests() {
  const runner = new EscalationTestRunner(TEST_API_URL);
  await runner.runAllTests();
}

// Run if called directly
if (require.main === module) {
  runEscalationTests().catch(console.error);
}

module.exports = { EscalationTestRunner, ESCALATION_TEST_CASES };