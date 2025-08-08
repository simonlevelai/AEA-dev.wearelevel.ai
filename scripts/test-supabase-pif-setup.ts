#!/usr/bin/env ts-node

/**
 * Test Supabase Connection and Setup
 * Simple test to check connection and create basic table structure
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

async function testSupabaseSetup(): Promise<void> {
  console.log('🔌 Testing Supabase connection and setup...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Test connection with existing table
    console.log('📞 Testing connection...');
    const { data, error: testError } = await supabase
      .from('conversations')
      .select('count')
      .limit(1);

    if (testError) {
      console.error('❌ Connection test failed:', testError);
      return;
    }

    console.log('✅ Connection successful!');

    // Check if our PiF tables exist
    console.log('🔍 Checking for existing PiF tables...');
    const { data: existingTables, error: tableError } = await supabase
      .from('information_schema.tables')  
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['pif_documents', 'pif_content_chunks']);

    console.log('📋 Existing tables:', existingTables);

    if (!existingTables || existingTables.length === 0) {
      console.log('⚠️ PiF tables do not exist yet.');
      console.log('💡 You need to manually create the tables in Supabase dashboard:');
      console.log('   1. Go to https://supabase.com/dashboard');
      console.log('   2. Open SQL Editor');
      console.log('   3. Run the SQL commands from supabase/schema.sql');
      console.log('   4. Or create tables via Table Editor in dashboard');
    } else {
      console.log('✅ PiF tables already exist!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if called directly
if (require.main === module) {
  testSupabaseSetup()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}