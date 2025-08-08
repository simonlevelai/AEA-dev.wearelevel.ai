#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { EntityService } from '../src/services/EntityService';

dotenv.config();

async function testEntityService() {
  console.log('📋 Testing Entity Service only...');
  
  try {
    const entityService = new EntityService();
    await entityService.initialize();
    console.log('✅ Entity Service initialized');
    
    // Test entity matching
    const testQuery = "I'm worried about cervical cancer symptoms";
    const entities = entityService.findMatchingEntities(testQuery);
    console.log(`✅ Found ${entities.length} entity matches`);
    
    // Test crisis detection 
    const crisisQuery = "I want to die";
    const isCrisis = entityService.isCrisisIndicator(crisisQuery);
    console.log(`✅ Crisis detection: ${isCrisis}`);
    
    console.log('🎯 Entity Service test complete');
    
  } catch (error) {
    console.error('❌ Entity Service failed:', error);
    process.exit(1);
  }
}

testEntityService();