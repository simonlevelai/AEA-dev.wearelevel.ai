#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';
import { AzureOpenAIService } from '../src/services/AzureOpenAIService';

dotenv.config();

async function testServices() {
  console.log('🧪 Testing Services Integration...');
  
  try {
    // Initialize Entity Service
    const entityService = new EntityService();
    await entityService.initialize();
    console.log('✅ Entity Service initialized');
    
    // Initialize Azure OpenAI Service
    const openaiService = new AzureOpenAIService(
      process.env.AZURE_OPENAI_API_KEY!,
      process.env.AZURE_OPENAI_ENDPOINT!,
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      entityService
    );
    await openaiService.initialize();
    console.log('✅ OpenAI Service initialized');
    
    // Test simple message
    console.log('\n🤖 Testing simple message...');
    const response = await openaiService.generateResponse({
      message: 'Hello, please respond with "Service test successful"',
      maxTokens: 50,
      userId: 'test-user'
    });
    
    console.log('Response:', response);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testServices();