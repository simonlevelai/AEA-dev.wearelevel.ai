#!/usr/bin/env node

/**
 * Azure OpenAI Integration Test for Ask Eve Assist
 * Tests Azure OpenAI connection and response quality locally
 */

const dotenv = require('dotenv');
dotenv.config();

// Import OpenAI for Azure
const { AzureOpenAI } = require('openai');

// Simple logger
const logger = {
  info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx || ''),
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx || ''),
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx || ''),
  debug: (msg, ctx) => process.env.LOG_LEVEL === 'debug' && console.log(`[DEBUG] ${msg}`, ctx || '')
};

// Initialize Azure OpenAI
async function initializeAzureOpenAI() {
  try {
    const azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });
    
    logger.info('✅ Azure OpenAI client initialized successfully');
    logger.info(`🔗 Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
    logger.info(`🤖 Model: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini'}`);
    
    return azureOpenAI;
  } catch (error) {
    logger.error('❌ Failed to initialize Azure OpenAI', { error: error.message });
    return null;
  }
}

// Mock content service with realistic Eve Appeal content
const mockContentService = {
  async searchContent(query) {
    const lowerQuery = query.toLowerCase();
    
    const contentDatabase = {
      'ovarian cancer symptoms': {
        found: true,
        content: 'Ovarian cancer symptoms may include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, urinary urgency or frequency, and changes in bowel habits. These symptoms are often subtle and can be mistaken for other conditions, but if they are new for you, occur frequently, and persist, it is important to see your GP.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/',
        title: 'Ovarian Cancer Signs and Symptoms',
        relevanceScore: 0.95
      },
      'cervical screening': {
        found: true,
        content: 'Cervical screening (previously known as a smear test) checks for abnormal cells on the cervix that could develop into cancer if left untreated. It is offered to women and people with a cervix aged 25-64 every 3-5 years in England. The test involves taking a small sample of cells from the cervix using a soft brush.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/',
        title: 'Cervical Screening Guide',
        relevanceScore: 0.94
      },
      'womb cancer': {
        found: true,
        content: 'Womb cancer (also called endometrial or uterine cancer) most commonly causes abnormal vaginal bleeding, especially after menopause. Other symptoms may include pelvic pain, pain during sex, and unexplained weight loss. It is important to see your GP if you experience any unusual bleeding.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/womb-cancer/',
        title: 'Womb Cancer Information',
        relevanceScore: 0.91
      }
    };
    
    // Find matching content
    for (const [topic, data] of Object.entries(contentDatabase)) {
      if (lowerQuery.includes(topic) || topic.includes(lowerQuery.replace(/[^a-z ]/g, ''))) {
        return data;
      }
    }
    
    // Check for individual terms
    if (lowerQuery.includes('ovarian')) {
      return contentDatabase['ovarian cancer symptoms'];
    } else if (lowerQuery.includes('cervical') || lowerQuery.includes('screening')) {
      return contentDatabase['cervical screening'];
    } else if (lowerQuery.includes('womb') || lowerQuery.includes('endometrial')) {
      return contentDatabase['womb cancer'];
    }
    
    return { found: false, content: null, source: null, sourceUrl: null, relevanceScore: 0 };
  }
};

// Create enhanced system prompt with Eve Appeal content
function createEnhancedSystemPrompt(contentResult) {
  let prompt = `You are Ask Eve Assist, a helpful and empathetic AI assistant providing gynaecological health information from The Eve Appeal charity.

Key Guidelines:
- Provide accurate, evidence-based health information
- Always recommend consulting healthcare professionals for personal medical concerns  
- Be empathetic and supportive, especially for sensitive topics
- Include appropriate disclaimers about not replacing professional medical advice
- For crisis situations involving self-harm, immediately provide emergency contact information:
  - Emergency Services: 999
  - Samaritans: 116 123 (free 24/7)
  - Crisis Text Line: Text SHOUT to 85258
- Focus on gynaecological health topics: cervical, ovarian, womb, vulval, and vaginal cancers
- Encourage regular screening and early detection`;

  if (contentResult && contentResult.found) {
    prompt += `\n\n🎯 PRIORITY MEDICAL INFORMATION from The Eve Appeal (USE THIS FIRST):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Title: ${contentResult.title || 'Unknown'}
🔗 Reference URL: ${contentResult.sourceUrl || ''}
📊 Relevance Score: ${((contentResult.relevanceScore || 0) * 100).toFixed(1)}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUTHORITATIVE CONTENT:
${contentResult.content}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 CRITICAL INSTRUCTIONS:
1. PRIORITIZE the above Eve Appeal content over your general knowledge
2. Base your response PRIMARILY on this authoritative medical information
3. ALWAYS cite the source and include the reference URL
4. Only supplement with general knowledge if the Eve Appeal content doesn't cover the question
5. Make it clear when information comes from The Eve Appeal vs general medical knowledge`;
  }

  return prompt;
}

// Test scenarios for Azure OpenAI integration
const testScenarios = [
  {
    name: "Health Information Query with Eve Appeal Content",
    message: "What are the symptoms of ovarian cancer?",
    expectedContent: ["ovarian cancer", "bloating", "pelvic pain", "Eve Appeal"],
    expectedSource: true
  },
  {
    name: "Screening Information Request",
    message: "Tell me about cervical screening",
    expectedContent: ["cervical screening", "smear test", "abnormal cells"],
    expectedSource: true
  },
  {
    name: "General Health Inquiry",
    message: "I'm worried about some symptoms I've been having",
    expectedContent: ["healthcare professional", "GP", "symptoms"],
    expectedSource: false
  },
  {
    name: "Crisis Support Scenario",
    message: "I'm feeling hopeless and having dark thoughts",
    expectedContent: ["999", "Samaritans", "116 123", "support"],
    expectedSource: false
  }
];

// Run Azure OpenAI integration tests
async function runAzureIntegrationTests() {
  console.log('🤖 Azure OpenAI Integration Test for Ask Eve Assist\\n');
  console.log('='.repeat(60));
  
  // Initialize Azure OpenAI
  const azureOpenAI = await initializeAzureOpenAI();
  
  if (!azureOpenAI) {
    console.log('❌ Cannot proceed with tests - Azure OpenAI client not available');
    console.log('\\n📋 Environment Variables Check:');
    console.log(`AZURE_OPENAI_API_KEY: ${process.env.AZURE_OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`AZURE_OPENAI_ENDPOINT: ${process.env.AZURE_OPENAI_ENDPOINT || '❌ Missing'}`);
    console.log(`AZURE_OPENAI_DEPLOYMENT_NAME: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '❌ Missing'}`);
    return;
  }

  let totalTests = 0;
  let passedTests = 0;
  let totalResponseTime = 0;
  let totalTokens = 0;

  console.log('\\n🧪 Running Test Scenarios...\\n');

  for (const [index, scenario] of testScenarios.entries()) {
    totalTests++;
    console.log(`🎬 Test ${index + 1}: ${scenario.name}`);
    console.log(`💬 Query: "${scenario.message}"`);
    
    const startTime = Date.now();
    
    try {
      // Search for relevant content
      const contentResult = await mockContentService.searchContent(scenario.message);
      
      // Create enhanced system prompt
      const systemPrompt = createEnhancedSystemPrompt(contentResult);
      
      // Call Azure OpenAI
      const completion = await azureOpenAI.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: scenario.message
          }
        ],
        max_completion_tokens: 500,
        temperature: 0.7
      });

      const responseTime = Date.now() - startTime;
      const responseText = completion.choices[0].message.content || '';
      const tokenUsage = completion.usage?.total_tokens || 0;

      totalResponseTime += responseTime;
      totalTokens += tokenUsage;

      console.log(`🤖 Response: "${responseText.substring(0, 150)}..."`);
      console.log(`📊 Metrics: ${responseTime}ms | ${tokenUsage} tokens | Content: ${contentResult.found ? 'Found' : 'Not Found'}`);
      
      // Validate response quality
      let testPassed = true;
      const validationErrors = [];
      
      // Check expected content
      for (const expectedTerm of scenario.expectedContent) {
        if (!responseText.toLowerCase().includes(expectedTerm.toLowerCase())) {
          validationErrors.push(`Missing expected content: "${expectedTerm}"`);
          testPassed = false;
        }
      }
      
      // Check source attribution if expected
      if (scenario.expectedSource && contentResult.found) {
        if (!responseText.includes('Eve Appeal') && !responseText.includes('Source:')) {
          validationErrors.push('Missing source attribution');
          testPassed = false;
        }
      }
      
      // Check response length (should be substantial)
      if (responseText.length < 100) {
        validationErrors.push('Response too short');
        testPassed = false;
      }
      
      if (testPassed) {
        console.log('✅ Test PASSED');
        passedTests++;
      } else {
        console.log('❌ Test FAILED:');
        validationErrors.forEach(error => console.log(`   - ${error}`));
      }
      
    } catch (error) {
      console.log('❌ Test FAILED with error:', error.message);
      
      // Handle specific Azure OpenAI errors
      if (error.message.includes('content')) {
        console.log('   - Content filtering triggered (expected for crisis scenarios)');
      }
    }
    
    console.log('');
  }
  
  // Final Results
  const avgResponseTime = Math.round(totalResponseTime / totalTests);
  const avgTokens = Math.round(totalTokens / totalTests);
  const successRate = Math.round((passedTests / totalTests) * 100);
  
  console.log('='.repeat(60));
  console.log('📊 AZURE OPENAI INTEGRATION TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Tests Passed: ${passedTests}`);
  console.log(`Tests Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Average Response Time: ${avgResponseTime}ms`);
  console.log(`Average Token Usage: ${avgTokens} tokens`);
  
  console.log('\\n🔍 Integration Coverage:');
  console.log('✅ Azure OpenAI client initialization');
  console.log('✅ GPT-4o-mini model deployment access'); 
  console.log('✅ System prompt with Eve Appeal content injection');
  console.log('✅ Content search and retrieval simulation');
  console.log('✅ Response quality and source attribution');
  console.log('✅ Crisis detection and safety measures');
  console.log('✅ Performance metrics (response time, tokens)');
  
  if (passedTests === totalTests) {
    console.log('\\n🎉 ALL AZURE INTEGRATION TESTS PASSED!');
    console.log('\\n✅ AZURE OPENAI + ASK EVE ASSIST INTEGRATION VALIDATED');
    console.log('🚀 Ready for local web interface testing');
  } else {
    console.log('\\n⚠️  Some Azure integration tests failed. Review responses for quality.');
  }
  
  // Test summary for next steps
  console.log('\\n📋 Next Steps:');
  if (successRate >= 75) {
    console.log('1. ✅ Azure OpenAI integration working - proceed with web interface');
    console.log('2. Test Supabase database connection');
    console.log('3. Run comprehensive end-to-end local testing');
  } else {
    console.log('1. ❌ Review Azure OpenAI configuration and API key');
    console.log('2. Check model deployment and permissions');
    console.log('3. Validate system prompt and content injection');
  }
}

// Run the integration tests
if (require.main === module) {
  runAzureIntegrationTests().catch(console.error);
}

module.exports = { runAzureIntegrationTests };