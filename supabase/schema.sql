-- Ask Eve Assist - Supabase Database Schema
-- Replaces expensive Cosmos DB with free PostgreSQL

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Conversations table for storing chat sessions
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true
);

-- Messages table for storing individual chat messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  entities JSONB DEFAULT '{}'::jsonb,
  is_crisis BOOLEAN DEFAULT false,
  response_time_ms INTEGER,
  token_usage JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Safety incidents table for tracking crisis interventions
CREATE TABLE IF NOT EXISTS safety_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL,
  severity_level TEXT NOT NULL CHECK (severity_level IN ('low', 'medium', 'high', 'critical')),
  trigger_words TEXT[],
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMP WITH TIME ZONE,
  resolution_status TEXT DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- User feedback table for improving responses
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  feedback_type TEXT CHECK (feedback_type IN ('helpful', 'unhelpful', 'inappropriate', 'crisis_resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Content analytics for tracking search performance
CREATE TABLE IF NOT EXISTS content_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query TEXT NOT NULL,
  search_results_count INTEGER DEFAULT 0,
  entities_matched TEXT[],
  response_generated BOOLEAN DEFAULT false,
  user_satisfied BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_is_crisis ON messages(is_crisis);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_severity ON safety_incidents(severity_level);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_created_at ON safety_incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_escalated ON safety_incidents(escalated);

-- Row Level Security (RLS) for GDPR compliance
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users to access their own data)
CREATE POLICY "Users can access their own conversations" ON conversations
  FOR ALL USING (auth.jwt() ->> 'sub' = user_id OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can access messages from their conversations" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (conversations.user_id = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'admin')
    )
  );

-- Admin-only access for safety incidents (healthcare professionals only)
CREATE POLICY "Admin access to safety incidents" ON safety_incidents
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Allow feedback from message owners
CREATE POLICY "Users can provide feedback on their messages" ON user_feedback
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = user_feedback.message_id 
      AND (c.user_id = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'admin')
    )
  );

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for conversations
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old conversations (GDPR compliance)
CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS void AS $$
BEGIN
  -- Delete conversations older than 30 days (configurable)
  DELETE FROM conversations 
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND is_active = false;
END;
$$ LANGUAGE plpgsql;

-- PiF Document content tables for RAG (Retrieval Augmented Generation)
CREATE TABLE IF NOT EXISTS pif_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  document_type TEXT NOT NULL, -- 'early_recognition', 'hpv_guide', 'genetic_testing', etc.
  last_reviewed DATE NOT NULL,
  pif_approved BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- PiF Content chunks for searchable medical information
CREATE TABLE IF NOT EXISTS pif_content_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES pif_documents(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL UNIQUE, -- Original chunk ID from processing
  title TEXT,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'medical_information', -- 'symptoms', 'when_to_see_gp', 'emergency', 'screening', 'treatment'
  priority_level TEXT DEFAULT 'medium' CHECK (priority_level IN ('critical', 'high', 'medium', 'low')),
  source_url TEXT NOT NULL,
  page_number INTEGER,
  relevance_keywords TEXT[], -- For fast keyword matching
  medical_categories TEXT[], -- 'ovarian', 'cervical', 'hpv', 'screening', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  search_vector tsvector, -- Full-text search vector
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Content search analytics
CREATE TABLE IF NOT EXISTS content_search_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query TEXT NOT NULL,
  matched_chunks UUID[],
  response_generated BOOLEAN DEFAULT false,
  search_method TEXT DEFAULT 'keyword', -- 'keyword', 'fulltext', 'semantic'
  response_time_ms INTEGER,
  user_satisfied BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for fast content retrieval
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
CREATE TRIGGER update_pif_content_search_vector
  BEFORE INSERT OR UPDATE ON pif_content_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_content_search_vector();

-- Content search function for medical queries
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

-- Sample data retention view
CREATE OR REPLACE VIEW conversation_summary AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as conversation_count,
  COUNT(CASE WHEN is_active THEN 1 END) as active_conversations,
  AVG(
    (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id)
  ) as avg_messages_per_conversation
FROM conversations
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Content usage analytics view
CREATE OR REPLACE VIEW content_usage_summary AS
SELECT 
  pc.content_type,
  pc.priority_level,
  COUNT(DISTINCT csl.id) as search_count,
  AVG(csl.response_time_ms) as avg_response_time,
  COUNT(CASE WHEN csl.user_satisfied THEN 1 END) as satisfied_responses,
  pd.title as document_title
FROM pif_content_chunks pc
LEFT JOIN content_search_logs csl ON pc.id = ANY(csl.matched_chunks)
JOIN pif_documents pd ON pd.id = pc.document_id
GROUP BY pc.content_type, pc.priority_level, pd.title
ORDER BY search_count DESC;