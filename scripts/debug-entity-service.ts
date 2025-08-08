#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';

dotenv.config();

async function debugEntityService() {
  console.log('🔍 Debugging Entity Service...');
  
  try {
    const entityService = new EntityService();
    await entityService.initialize();
    console.log('✅ Entity Service initialized');
    
    // Test specific searches
    const testQueries = [
      "cervical cancer",
      "cervical cancer symptoms", 
      "I'm worried about cervical cancer symptoms",
      "bleeding",
      "pain",
      "symptoms",
      "cancer"
    ];
    
    console.log('\n📋 Testing entity matching:');
    for (const query of testQueries) {
      const entities = entityService.findMatchingEntities(query);
      console.log(`"${query}" -> ${entities.length} matches`);
      if (entities.length > 0) {
        entities.forEach(e => {
          console.log(`   - ${e.category}: ${e.matches.join(', ')}`);
        });
      }
    }
    
    // Test system prompt
    const systemPrompt = entityService.getSystemPrompt();
    console.log(`\n📝 System prompt length: ${systemPrompt.length} characters`);
    console.log(`System prompt preview: "${systemPrompt.substring(0, 200)}..."`);
    
    // Test crisis detection
    console.log('\n🚨 Testing crisis detection:');
    const crisisTests = [
      "I want to die",
      "I can't cope anymore", 
      "I'm thinking of ending it all",
      "Hello how are you"
    ];
    
    for (const test of crisisTests) {
      const isCrisis = entityService.isCrisisIndicator(test);
      console.log(`"${test}" -> Crisis: ${isCrisis}`);
    }
    
  } catch (error) {
    console.error('❌ Entity Service debug failed:', error);
  }
}

debugEntityService();