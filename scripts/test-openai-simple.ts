#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';

dotenv.config();

async function testOpenAI() {
  console.log('🧪 Testing Azure OpenAI Direct Connection...');
  
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: '2024-12-01-preview'
  });

  console.log(`Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
  console.log(`Deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`);
  
  try {
    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        {
          role: 'user',
          content: 'Hello, this is a test. Please respond with just "Test successful".'
        }
      ],
      max_completion_tokens: 100
    });

    console.log('Full response object:', JSON.stringify(completion, null, 2));

    console.log('✅ Response:', completion.choices[0]?.message?.content);
    console.log('✅ Token usage:', completion.usage);
    console.log('✅ Model:', completion.model);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testOpenAI();