-- Run this SQL in Supabase Dashboard > SQL Editor
-- Creates tables for PiF content storage and search

-- PiF Documents table
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

-- PiF Content Chunks table
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

-- Content Search Logs table
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pif_documents_type ON pif_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_pif_documents_reviewed ON pif_documents(last_reviewed);

CREATE INDEX IF NOT EXISTS idx_pif_chunks_document_id ON pif_content_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_pif_chunks_content_type ON pif_content_chunks(content_type);
CREATE INDEX IF NOT EXISTS idx_pif_chunks_priority ON pif_content_chunks(priority_level);
CREATE INDEX IF NOT EXISTS idx_pif_chunks_categories ON pif_content_chunks USING GIN(medical_categories);
CREATE INDEX IF NOT EXISTS idx_pif_chunks_keywords ON pif_content_chunks USING GIN(relevance_keywords);
CREATE INDEX IF NOT EXISTS idx_pif_chunks_search_vector ON pif_content_chunks USING GIN(search_vector);

-- Full-text search trigger function
CREATE OR REPLACE FUNCTION update_content_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic search vector updates
DROP TRIGGER IF EXISTS update_pif_content_search_vector ON pif_content_chunks;
CREATE TRIGGER update_pif_content_search_vector
  BEFORE INSERT OR UPDATE ON pif_content_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_content_search_vector();

-- Medical content search function
CREATE OR REPLACE FUNCTION search_medical_content(
  query_text TEXT,
  limit_results INTEGER DEFAULT 5,
  content_types TEXT[] DEFAULT NULL,
  priority_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  chunk_id UUID,
  title TEXT,
  content TEXT,
  source_url TEXT,
  relevance_score REAL,
  content_type TEXT,
  priority_level TEXT,
  medical_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.title,
    pc.content,
    pc.source_url,
    ts_rank(pc.search_vector, plainto_tsquery('english', query_text)) as relevance_score,
    pc.content_type,
    pc.priority_level,
    pc.medical_categories
  FROM pif_content_chunks pc
  WHERE 
    pc.search_vector @@ plainto_tsquery('english', query_text)
    AND (content_types IS NULL OR pc.content_type = ANY(content_types))
    AND (priority_filter IS NULL OR pc.priority_level = priority_filter)
  ORDER BY relevance_score DESC, 
    CASE pc.priority_level 
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2  
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    pc.created_at DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;