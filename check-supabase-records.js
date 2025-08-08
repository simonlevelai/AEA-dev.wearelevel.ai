// Check Supabase Records and Logging
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSupabaseRecords() {
  console.log('🔍 CHECKING SUPABASE DATABASE RECORDS');
  console.log('=' .repeat(60));

  try {
    // Check PiF Documents
    console.log('\n📄 PIF DOCUMENTS:');
    const { data: documents, error: docError } = await supabase
      .from('pif_documents')
      .select('id, title, document_type, created_at')
      .order('created_at', { ascending: false });

    if (docError) {
      console.error('❌ Error fetching documents:', docError);
    } else {
      console.log(`✅ Total documents: ${documents.length}`);
      documents.forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.title} (${doc.document_type}) - ${doc.created_at}`);
      });
    }

    // Check PiF Content Chunks
    console.log('\n📝 PIF CONTENT CHUNKS:');
    const { data: chunks, error: chunkError } = await supabase
      .from('pif_content_chunks')
      .select('id, title, content_type, priority_level, created_at')
      .order('created_at', { ascending: false });

    if (chunkError) {
      console.error('❌ Error fetching chunks:', chunkError);
    } else {
      console.log(`✅ Total chunks: ${chunks.length}`);
      
      // Group by content type
      const chunksByType = chunks.reduce((acc, chunk) => {
        acc[chunk.content_type] = (acc[chunk.content_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('   📊 Chunks by content type:');
      Object.entries(chunksByType).forEach(([type, count]) => {
        console.log(`      • ${type}: ${count}`);
      });
    }

    // Check Content Search Logs
    console.log('\n📊 CONTENT SEARCH LOGS:');
    const { data: logs, error: logError } = await supabase
      .from('content_search_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (logError) {
      console.error('❌ Error fetching search logs:', logError);
    } else {
      console.log(`✅ Total recent logs: ${logs.length}`);
      if (logs.length === 0) {
        console.log('   ⚠️ NO SEARCH LOGS FOUND - This confirms your observation!');
        console.log('   📝 The chat server is not logging conversations');
      } else {
        logs.forEach((log, i) => {
          console.log(`   ${i + 1}. "${log.query}" - ${log.created_at} (${log.response_generated ? 'Found' : 'Not found'})`);
        });
      }
    }

    // Check if tables exist and have correct structure
    console.log('\n🏗️ TABLE STRUCTURE CHECK:');
    
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('table_name, column_name, data_type')
      .in('table_name', ['pif_documents', 'pif_content_chunks', 'content_search_logs']);

    if (!tableError && tableInfo) {
      const tables = tableInfo.reduce((acc, col) => {
        if (!acc[col.table_name]) acc[col.table_name] = [];
        acc[col.table_name].push(`${col.column_name} (${col.data_type})`);
        return acc;
      }, {});

      Object.entries(tables).forEach(([tableName, columns]) => {
        console.log(`   📋 ${tableName}: ${columns.length} columns`);
      });
    }

  } catch (error) {
    console.error('❌ Database check failed:', error);
  }
}

async function testLoggingFunction() {
  console.log('\n🧪 TESTING SEARCH LOGGING');
  console.log('─'.repeat(60));

  try {
    // Test inserting a search log entry
    const testLog = {
      query: 'Test search query for logging verification',
      matched_chunks: ['test-chunk-1', 'test-chunk-2'],
      response_generated: true,
      search_method: 'supabase_fulltext',
      response_time_ms: 150,
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };

    console.log('📝 Inserting test log entry...');
    const { data, error } = await supabase
      .from('content_search_logs')
      .insert(testLog)
      .select();

    if (error) {
      console.error('❌ Failed to insert test log:', error);
    } else {
      console.log('✅ Test log inserted successfully:', data[0].id);
      
      // Clean up test entry
      await supabase
        .from('content_search_logs')
        .delete()
        .eq('id', data[0].id);
      console.log('🧹 Test log entry cleaned up');
    }

  } catch (error) {
    console.error('❌ Logging test failed:', error);
  }
}

// Run checks
async function main() {
  await checkSupabaseRecords();
  await testLoggingFunction();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 RECOMMENDATIONS:');
  console.log('1. Add search logging to local-azure-chat.js server');
  console.log('2. Log every search query and result for analytics');
  console.log('3. Track user conversations for improvement insights');
  console.log('='.repeat(60));
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Database check failed:', error);
  process.exit(1);
});