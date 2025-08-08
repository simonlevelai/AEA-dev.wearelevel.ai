# Supabase Setup Guide for Ask Eve Assist

## Step 1: Create Supabase Project

1. **Go to [supabase.com](https://supabase.com)** and sign up/login
2. **Click "New Project"**
3. **Fill in details:**
   - **Project Name**: `Ask Eve Assist`
   - **Database Password**: Generate a secure password (save it!)
   - **Region**: Choose `EU West (London)` for UK data compliance
   - **Pricing Plan**: Start with Free tier
4. **Click "Create new project"**
5. **Wait 2-3 minutes** for provisioning

## Step 2: Apply Database Schema

1. **In your Supabase dashboard**, go to **SQL Editor**
2. **Click "New Query"**
3. **Copy and paste** the entire contents of `supabase/schema.sql`
4. **Click "Run"** to create all tables and indexes
5. **Verify tables created** in the **Table Editor**

## Step 3: Get Connection Details

In your Supabase dashboard, go to **Settings > API**:

1. **Project URL**: `https://[your-project-ref].supabase.co`
2. **Anon Key**: `eyJhbGc...` (long token for client-side)
3. **Service Role Key**: `eyJhbGc...` (secret key for server-side)

## Step 4: Update Environment Variables

Add to your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://[your-project-ref].supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Step 5: Test Connection

Run the test script:
```bash
npx ts-node scripts/test-supabase-connection.ts
```

## Step 6: Enable Row Level Security

In **SQL Editor**, run:
```sql
-- Enable RLS on all tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY; 
ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to access their own data
CREATE POLICY "Users can access their own conversations" ON conversations
  FOR ALL USING (auth.jwt() ->> 'sub' = user_id);
```

## Expected Results

After setup, you should have:
- ✅ **Free PostgreSQL database** (500MB limit)
- ✅ **5 tables**: conversations, messages, safety_incidents, user_feedback, content_analytics
- ✅ **Row Level Security** enabled for GDPR compliance
- ✅ **Auto-generated REST API** for all tables
- ✅ **Real-time subscriptions** available
- ✅ **UK data compliance** (London region)

## Troubleshooting

**Connection Issues:**
- Verify project URL format: `https://[project-ref].supabase.co`
- Check API keys are copied correctly (they're very long)
- Ensure no extra spaces in environment variables

**Schema Issues:**
- Run schema in SQL Editor, not in client code
- Check for error messages in SQL Editor
- Verify extensions are enabled (uuid-ossp, pgcrypto)

**RLS Issues:**
- Policies must be created AFTER enabling RLS
- Test with service role key first (bypasses RLS)
- Use anon key for user-specific data access

## Cost Monitoring

**Free Tier Limits:**
- Database: 500MB
- API Requests: 500K/month  
- Bandwidth: 2GB
- Storage: 1GB

**Usage stays FREE for Ask Eve Assist** unless you have >10K daily users.

## Next Steps

Once Supabase is set up:
1. Test local connection
2. Update production App Service with Supabase environment variables
3. Deploy the working system
4. Monitor usage in Supabase dashboard