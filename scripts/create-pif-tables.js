// Simple JavaScript script to create PiF tables in Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function createPiFTables() {
  console.log('🏗️ Creating PiF tables in Supabase...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Create a simple test to verify connection
  try {
    const { data, error } = await supabase
      .from('conversations') 
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Connection failed:', error.message);
      return;
    }

    console.log('✅ Connected to Supabase successfully!');

    // Try to create a simple table first
    console.log('📄 Creating pif_documents table...');
    
    // We'll use a different approach - insert some test data to see what happens
    const testDocument = {
      filename: 'test.pdf',
      title: 'Test Document',
      source_url: 'https://example.com',
      document_type: 'test',
      last_reviewed: '2024-01-01',
      pif_approved: true
    };

    const { data: insertResult, error: insertError } = await supabase
      .from('pif_documents')
      .insert(testDocument)
      .select();

    if (insertError) {
      if (insertError.message.includes('does not exist')) {
        console.log('⚠️ PiF tables do not exist in Supabase yet.');
        console.log('');
        console.log('🔧 MANUAL SETUP REQUIRED:');
        console.log('1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/ltsxefwboildzjflffuq');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy and paste the SQL from supabase/schema.sql (starting from "-- PiF Document content tables...")');
        console.log('4. Run the SQL to create the tables');
        console.log('5. Then run: node scripts/import-pif-to-supabase.js');
      } else {
        console.error('❌ Insert error:', insertError.message);
      }
    } else {
      console.log('✅ Test insert successful:', insertResult);
      
      // Clean up test data
      await supabase.from('pif_documents').delete().eq('filename', 'test.pdf');
      console.log('🧹 Cleaned up test data');
    }

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

createPiFTables();