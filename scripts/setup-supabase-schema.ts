#!/usr/bin/env ts-node

/**
 * Setup Supabase Schema Script
 * 
 * Creates the necessary tables and functions for PiF content storage
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

async function setupSupabaseSchema(): Promise<void> {
  console.log('🏗️ Setting up Supabase schema for PiF content');
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Create pif_documents table
    console.log('📄 Creating pif_documents table...');
    const { error: docTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS pif_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          filename TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          source_url TEXT NOT NULL,
          document_type TEXT NOT NULL,
          last_reviewed DATE NOT NULL,
          pif_approved BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `
    });
    
    if (docTableError) {
      console.error('❌ Error creating pif_documents table:', docTableError);
      throw docTableError;
    }

    // Create pif_content_chunks table
    console.log('🧩 Creating pif_content_chunks table...');
    const { error: chunksTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS pif_content_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id UUID REFERENCES pif_documents(id) ON DELETE CASCADE,
          chunk_id TEXT NOT NULL UNIQUE,
          title TEXT,
          content TEXT NOT NULL,
          content_type TEXT DEFAULT 'medical_information',
          priority_level TEXT DEFAULT 'medium' CHECK (priority_level IN ('critical', 'high', 'medium', 'low')),
          source_url TEXT NOT NULL,
          page_number INTEGER,
          relevance_keywords TEXT[],
          medical_categories TEXT[],
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          search_vector tsvector,
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `
    });

    if (chunksTableError) {
      console.error('❌ Error creating pif_content_chunks table:', chunksTableError);
      throw chunksTableError;
    }

    // Create content_search_logs table
    console.log('📊 Creating content_search_logs table...');
    const { error: logsTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS content_search_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          query TEXT NOT NULL,
          matched_chunks UUID[],
          response_generated BOOLEAN DEFAULT false,
          search_method TEXT DEFAULT 'keyword',
          response_time_ms INTEGER,
          user_satisfied BOOLEAN,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `
    });

    if (logsTableError) {
      console.error('❌ Error creating content_search_logs table:', logsTableError);
      throw logsTableError;
    }

    // Create indexes
    console.log('🔍 Creating indexes...');
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_pif_documents_type ON pif_documents(document_type);',
      'CREATE INDEX IF NOT EXISTS idx_pif_documents_reviewed ON pif_documents(last_reviewed);',
      'CREATE INDEX IF NOT EXISTS idx_pif_chunks_document_id ON pif_content_chunks(document_id);',
      'CREATE INDEX IF NOT EXISTS idx_pif_chunks_content_type ON pif_content_chunks(content_type);',
      'CREATE INDEX IF NOT EXISTS idx_pif_chunks_priority ON pif_content_chunks(priority_level);',
      'CREATE INDEX IF NOT EXISTS idx_pif_chunks_categories ON pif_content_chunks USING GIN(medical_categories);',
      'CREATE INDEX IF NOT EXISTS idx_pif_chunks_keywords ON pif_content_chunks USING GIN(relevance_keywords);'
    ];

    for (const query of indexQueries) {
      const { error } = await supabase.rpc('exec_sql', { sql: query });
      if (error) {
        console.warn('⚠️ Index creation warning:', error.message);
      }
    }

    console.log('✅ Supabase schema setup completed successfully!');
    console.log('\n📋 Created tables:');
    console.log('   - pif_documents');
    console.log('   - pif_content_chunks'); 
    console.log('   - content_search_logs');
    console.log('\n🔍 Created indexes for fast content retrieval');

  } catch (error) {
    console.error('❌ Schema setup failed:', error);
    throw error;
  }
}

// Run setup if called directly
if (require.main === module) {
  setupSupabaseSchema()
    .then(() => {
      console.log('\n🎉 Schema setup complete! Ready to import PiF content.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Schema setup failed:', error);
      process.exit(1);
    });
}