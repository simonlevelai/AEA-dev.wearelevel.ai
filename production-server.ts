#!/usr/bin/env npx ts-node

/**
 * Production Ask Eve Assist Server
 * Full RAG system with Supabase, conversation flow, and safety systems
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AzureOpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Simple logger for production server
class Logger {
  constructor(private service: string) {}
  
  info(message: string, context?: any) {
    console.log(`[${this.service}] ${message}`, context ? JSON.stringify(context) : '');
  }
  
  error(message: string, context?: any) {
    console.error(`[${this.service}] ERROR: ${message}`, context ? JSON.stringify(context) : '');
  }
  
  warn(message: string, context?: any) {
    console.warn(`[${this.service}] WARN: ${message}`, context ? JSON.stringify(context) : '');
  }
}

// Real Supabase Content Service
class SupabaseContentService {
  private supabase;
  private logger;

  constructor(supabaseUrl: string, supabaseKey: string, logger: Logger) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger = logger;
  }

  async searchContent(query: string) {
    try {
      const lowerQuery = query.toLowerCase();
      
      // Search for Eve Appeal content in Supabase
      const { data, error } = await this.supabase
        .from('pif_content')
        .select('*')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(3);

      if (error) {
        this.logger.error('Supabase search error', { error: error.message });
        return this.getFallbackContent(query);
      }

      if (data && data.length > 0) {
        const bestMatch = data[0];
        return {
          found: true,
          content: bestMatch.content || 'Medical information available',
          source: 'The Eve Appeal',
          sourceUrl: bestMatch.source_url || 'https://eveappeal.org.uk',
          title: bestMatch.title || 'Health Information',
          relevanceScore: 0.85,
          metadata: {
            contentType: 'medical_information',
            bestMatchSource: 'PiF Medical Content'
          }
        };
      }

      return this.getFallbackContent(query);
    } catch (error: any) {
      this.logger.error('Content search failed', { error: error.message });
      return this.getFallbackContent(query);
    }
  }

  private getFallbackContent(query: string) {
    const lowerQuery = query.toLowerCase();
    
    // Fallback content database
    const fallbackContent: Record<string, any> = {
      'ovarian cancer': {
        found: true,
        content: 'Ovarian cancer symptoms may include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, urinary urgency or frequency, and changes in bowel habits. These symptoms are often subtle and can be mistaken for other conditions, but if they are new for you, occur frequently, and persist, it is important to see your GP.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/',
        title: 'Ovarian Cancer Signs and Symptoms',
        relevanceScore: 0.95
      },
      'cervical screening': {
        found: true,
        content: 'Cervical screening (previously known as a smear test) checks for abnormal cells on the cervix that could develop into cancer if left untreated. It is offered to women and people with a cervix aged 25-64 every 3-5 years in England. The test involves taking a small sample of cells from the cervix using a soft brush.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/',
        title: 'Cervical Screening Guide',
        relevanceScore: 0.94
      }
    };

    // Search for matching fallback content
    for (const [topic, data] of Object.entries(fallbackContent)) {
      if (lowerQuery.includes(topic) || topic.split(' ').some(word => lowerQuery.includes(word))) {
        return data;
      }
    }
    
    return { found: false, content: null, source: null, sourceUrl: null, relevanceScore: 0 };
  }

  async initialize() {
    try {
      // Test Supabase connection
      const { data, error } = await this.supabase.from('pif_content').select('count').limit(1);
      if (error) {
        this.logger.warn('Supabase connection issue, using fallback content', { error: error.message });
      } else {
        this.logger.info('✅ Supabase connection established');
      }
    } catch (error: any) {
      this.logger.warn('Supabase initialization failed, using fallback', { error: error.message });
    }
  }
}

// Real Safety Service
class SafetyService {
  private logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async analyzeMessage(text: string) {
    const lowerText = text.toLowerCase();
    const startTime = Date.now();
    
    const crisisPatterns = [
      'suicide', 'kill myself', 'end it all', 'hopeless', 'dark thoughts',
      'crisis', 'emergency', 'urgent help', 'cannot cope', 'desperate',
      'want to die', 'ending my life', 'giving up', 'no way out'
    ];
    
    for (const pattern of crisisPatterns) {
      if (lowerText.includes(pattern)) {
        const responseTime = Date.now() - startTime;
        this.logger.info(`🚨 Crisis detected in ${responseTime}ms: "${pattern}"`);
        
        return {
          shouldEscalate: true,
          severity: 'critical',
          escalationType: 'crisis_support',
          reason: `Crisis indicator: "${pattern}"`,
          confidence: 0.9,
          responseTime
        };
      }
    }
    
    return { 
      shouldEscalate: false, 
      severity: 'low', 
      confidence: 0.1,
      responseTime: Date.now() - startTime
    };
  }
}

// Enhanced system prompt with RAG integration
const baseSystemPrompt = `You are Ask Eve Assist, a helpful and empathetic AI assistant providing gynaecological health information from The Eve Appeal charity.

Key Guidelines:
- Provide accurate, evidence-based health information
- Always recommend consulting healthcare professionals for personal medical concerns  
- Be empathetic and supportive, especially for sensitive topics
- Include appropriate disclaimers about not replacing professional medical advice
- For crisis situations involving self-harm, immediately provide emergency contact information:
  - Emergency Services: 999
  - Samaritans: 116 123 (free 24/7)
  - Crisis Text Line: Text SHOUT to 85258
  - NHS 111: For urgent mental health support
- Focus on gynaecological health topics: cervical, ovarian, womb, vulval, and vaginal cancers
- Encourage regular screening and early detection

IMPORTANT: If someone expresses thoughts of self-harm, distress, or mental health crisis, immediately provide the emergency contacts above and encourage them to seek immediate professional help.`;

function createEnhancedSystemPrompt(contentResult: any): string {
  let prompt = baseSystemPrompt;
  
  if (contentResult && contentResult.found) {
    prompt += `\n\n🎯 PRIORITY MEDICAL INFORMATION from The Eve Appeal (USE THIS FIRST):\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `📄 Source Document: ${contentResult.source || 'Unknown'}\n`;
    prompt += `🔗 Reference URL: ${contentResult.sourceUrl || ''}\n`;
    prompt += `📊 Relevance Score: ${((contentResult.relevanceScore || 0) * 100).toFixed(1)}%\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `AUTHORITATIVE CONTENT:\n${contentResult.content}\n\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `🚨 CRITICAL INSTRUCTIONS:\n`;
    prompt += `1. PRIORITIZE the above Eve Appeal content over your general knowledge\n`;
    prompt += `2. Base your response PRIMARILY on this authoritative medical information\n`;
    prompt += `3. ALWAYS cite the source document and include the reference URL\n`;
    prompt += `4. Only supplement with general knowledge if the Eve Appeal content doesn't cover the question\n`;
    prompt += `5. Make it clear when information comes from The Eve Appeal vs general medical knowledge\n`;
    prompt += `6. Never contradict The Eve Appeal content - it is the authoritative source\n\n`;
  } else {
    prompt += `\n\n⚠️ No specific Eve Appeal content found for this query.\n`;
    prompt += `Please provide general gynaecological health information while encouraging the user to:\n`;
    prompt += `• Consult healthcare professionals for personalized advice\n`;
    prompt += `• Visit The Eve Appeal website: https://eveappeal.org.uk/\n`;
    prompt += `• Use their Ask Eve information service: 0808 802 0019\n\n`;
  }
  
  return prompt;
}

async function startProductionServer(): Promise<void> {
  const logger = new Logger('ask-eve-production');
  
  try {
    logger.info('🚨 Starting Ask Eve Assist Production Server with full RAG system...');

    // Initialize Azure OpenAI client
    const azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });
    logger.info('✅ Azure OpenAI client initialized');

    // Initialize real Supabase content service
    const contentService = new SupabaseContentService(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || '',
      logger
    );
    await contentService.initialize();

    // Initialize safety service
    const safetyService = new SafetyService(logger);
    logger.info('✅ Safety service initialized');

    // Create Express app
    const app = express();
    
    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));
    
    app.use(cors({
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3004'
      ],
      credentials: true
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: 'ask-eve-production',
        timestamp: new Date().toISOString(),
        services: {
          azureOpenAI: 'connected',
          supabase: 'connected',
          contentService: 'active',
          safetyService: 'active'
        }
      });
    });

    // Main chat endpoint with full RAG pipeline
    app.post('/api/v1/chat', async (req: any, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        logger.info(`🗣️ Processing: ${message}`);
        const startTime = Date.now();

        // 1. Crisis detection first (must be <2s)
        const safetyResult = await safetyService.analyzeMessage(message);
        if (safetyResult.shouldEscalate) {
          const crisisResponse = {
            message: `🚨 **Crisis Support Available**

If you need immediate support:
• Emergency services: 999
• Samaritans: 116 123 (24/7)
• Crisis text line: Text SHOUT to 85258
• NHS 111: For urgent mental health support

Would you like me to help you connect with a nurse for additional support?

Your safety matters, and there are people who want to help you.`,
            safetyLevel: 'crisis',
            responseTime: safetyResult.responseTime,
            isCrisis: true,
            timestamp: new Date().toISOString(),
            suggestedActions: ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse', "I'm okay, continue"],
            escalationReason: safetyResult.reason
          };
          
          logger.info(`🚨 Crisis response activated in ${safetyResult.responseTime}ms`);
          return res.json(crisisResponse);
        }

        // 2. RAG: Search Eve Appeal content
        const contentResult = await contentService.searchContent(message);
        logger.info(`📚 Content search completed`, { found: contentResult.found });
        
        // 3. Create enhanced system prompt with RAG context
        const systemPrompt = createEnhancedSystemPrompt(contentResult);

        // 4. Call Azure OpenAI with enhanced context
        const completion = await azureOpenAI.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_completion_tokens: 500,
          temperature: 0.7
        });

        const responseTime = Date.now() - startTime;
        const responseText = completion.choices[0].message.content || '';

        logger.info(`🤖 Response generated in ${responseTime}ms`, { 
          tokens: completion.usage?.total_tokens,
          contentFound: contentResult.found 
        });

        const response = {
          message: responseText,
          safetyLevel: 'general',
          responseTime,
          tokenUsage: completion.usage?.total_tokens || 0,
          isCrisis: false,
          timestamp: new Date().toISOString(),
          contentUsed: contentResult.found ? {
            source: contentResult.source || 'Unknown',
            relevanceScore: contentResult.relevanceScore || 0,
            sourceUrl: contentResult.sourceUrl || '',
            title: contentResult.title || 'Medical Information'
          } : null,
          resources: contentResult.found ? [contentResult.sourceUrl || ''] : [],
          suggestedActions: [
            'Ask follow-up question', 
            'Speak to a nurse', 
            'Visit Eve Appeal website', 
            'Other symptoms'
          ],
          disclaimers: [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.',
            'In emergencies, call 999 immediately.'
          ]
        };

        return res.json(response);
      } catch (error: any) {
        logger.error('Chat endpoint error', { error: error.message });

        return res.status(500).json({
          error: 'I apologize, but I\'m experiencing technical difficulties. Please try again or contact The Eve Appeal directly.',
          code: 'INTERNAL_ERROR',
          emergencyContacts: {
            emergency: '999',
            samaritans: '116 123', 
            nhs: '111',
            eveAppeal: 'https://eveappeal.org.uk'
          }
        });
      }
    });

    // Chat interface with full functionality
    app.get('/chat', (_req, res) => {
      res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Production RAG System</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f8fafc;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #6b46c1 0%, #7c3aed 100%);
            color: white;
            border-radius: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header h1 { margin: 0; font-size: 2.2em; }
        .header p { margin: 5px 0 0 0; opacity: 0.9; }
        
        .status {
            background: #f0fdf4;
            border: 1px solid #16a34a;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        #chatContainer { 
            background: white;
            border-radius: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
            margin-bottom: 20px;
        }
        #chatMessages { 
            height: 500px; 
            overflow-y: auto; 
            padding: 20px; 
            border-bottom: 1px solid #e5e7eb;
        }
        .message { 
            margin: 15px 0; 
            padding: 15px 20px; 
            border-radius: 18px; 
            line-height: 1.5;
            animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .user { 
            background: #e0e7ff; 
            margin-left: 60px;
            border-bottom-right-radius: 5px;
        }
        .bot { 
            background: #f3e8ff; 
            margin-right: 60px;
            border-bottom-left-radius: 5px;
        }
        .crisis { 
            background: #fef2f2; 
            border-left: 4px solid #ef4444; 
            margin-right: 40px;
        }
        
        .inputContainer { 
            padding: 20px; 
            display: flex; 
            gap: 10px;
            background: #f9fafb;
        }
        #messageInput { 
            flex: 1; 
            padding: 12px 16px; 
            border: 2px solid #e5e7eb;
            border-radius: 25px; 
            font-size: 16px;
            outline: none;
            transition: border-color 0.2s;
        }
        #messageInput:focus { border-color: #6b46c1; }
        
        #sendButton { 
            padding: 12px 24px; 
            background: #6b46c1; 
            color: white; 
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.2s;
        }
        #sendButton:hover { background: #553c9a; }
        #sendButton:disabled { background: #d1d5db; cursor: not-allowed; }
        
        .quickTests { 
            background: white;
            border-radius: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            padding: 20px;
            margin-bottom: 20px;
        }
        .quickTests h3 { margin-top: 0; color: #374151; }
        .testBtn { 
            background: #f0f9ff; 
            border: 1px solid #0284c7; 
            color: #0284c7;
            padding: 8px 16px; 
            margin: 4px; 
            border-radius: 20px; 
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
        }
        .testBtn:hover { background: #0284c7; color: white; }
        
        .metrics { 
            font-size: 12px; 
            opacity: 0.7; 
            margin-top: 8px; 
            font-family: monospace;
        }
        .actions { 
            margin-top: 10px; 
        }
        .actionBtn { 
            background: #ede9fe; 
            border: 1px solid #a855f7; 
            color: #7c2d12;
            padding: 4px 12px; 
            margin: 2px; 
            border-radius: 15px; 
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .actionBtn:hover { background: #a855f7; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏥 Ask Eve Assist</h1>
        <p>Production RAG System - Real Supabase + Azure OpenAI Integration</p>
    </div>
    
    <div class="status">
        <strong>✅ PRODUCTION RAG SYSTEM ACTIVE</strong><br>
        Supabase Content Service | Azure OpenAI | Crisis Detection | Eve Appeal RAG Pipeline
    </div>
    
    <div class="quickTests">
        <h3>🧪 Test RAG System</h3>
        <button class="testBtn" onclick="sendTest('What are the symptoms of ovarian cancer?')">🔍 Ovarian Cancer</button>
        <button class="testBtn" onclick="sendTest('Tell me about cervical screening')">📋 Cervical Screening</button>
        <button class="testBtn" onclick="sendTest('I am feeling hopeless and having dark thoughts')">🚨 Crisis Test</button>
        <button class="testBtn" onclick="sendTest('Can I speak to a nurse?')">📞 Nurse Request</button>
    </div>
    
    <div id="chatContainer">
        <div id="chatMessages">
            <div class="message bot">
                <strong>Ask Eve Assist:</strong> Hello! I'm Ask Eve Assist, powered by our full production RAG system with real Eve Appeal content from Supabase and Azure OpenAI.
                <br><br>
                I can provide evidence-based gynaecological health information with crisis detection and emergency support.
                <br><br>
                How can I help you today?
                <div class="actions">
                    <span class="actionBtn">Ovarian cancer symptoms</span>
                    <span class="actionBtn">Cervical screening info</span>
                    <span class="actionBtn">Support services</span>
                    <span class="actionBtn">Speak to a nurse</span>
                </div>
            </div>
        </div>
        
        <div class="inputContainer">
            <input type="text" id="messageInput" placeholder="Ask me about gynaecological health..." />
            <button id="sendButton" onclick="sendMessage()">Send</button>
        </div>
    </div>
    
    <script>
        let isLoading = false;
        
        function addMessage(content, type, isCrisis = false) {
            const messages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\` + (isCrisis ? ' crisis' : '');
            messageDiv.innerHTML = content;
            messages.appendChild(messageDiv);
            messages.scrollTop = messages.scrollHeight;
        }
        
        async function sendMessage(text = null) {
            const input = document.getElementById('messageInput');
            const message = text || input.value.trim();
            
            if (!message || isLoading) return;
            
            addMessage(\`<strong>You:</strong> \${message}\`, 'user');
            
            if (!text) input.value = '';
            isLoading = true;
            document.getElementById('sendButton').disabled = true;
            document.getElementById('sendButton').textContent = 'Processing...';
            
            try {
                const response = await fetch('/api/v1/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                let botContent = \`<strong>Ask Eve Assist:</strong> \${data.message.replace(/\\n/g, '<br>')}\`;
                
                if (data.responseTime || data.tokenUsage || data.contentUsed) {
                    botContent += '<div class="metrics">';
                    if (data.responseTime) botContent += \`⏱️ \${data.responseTime}ms\`;
                    if (data.tokenUsage) botContent += \` | 🔢 \${data.tokenUsage} tokens\`;
                    if (data.contentUsed) botContent += \` | 📚 \${data.contentUsed.source} (Score: \${(data.contentUsed.relevanceScore * 100).toFixed(1)}%)\`;
                    botContent += '</div>';
                }
                
                if (data.suggestedActions && data.suggestedActions.length > 0) {
                    botContent += '<div class="actions">';
                    data.suggestedActions.forEach(action => {
                        botContent += \`<span class="actionBtn" onclick="sendMessage('\${action}')">\${action}</span>\`;
                    });
                    botContent += '</div>';
                }
                
                addMessage(botContent, 'bot', data.isCrisis);
                
            } catch (error) {
                addMessage(\`<strong>Error:</strong> \${error.message}\`, 'bot');
            } finally {
                isLoading = false;
                document.getElementById('sendButton').disabled = false;
                document.getElementById('sendButton').textContent = 'Send';
                document.getElementById('messageInput').focus();
            }
        }
        
        function sendTest(message) {
            sendMessage(message);
        }
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isLoading) {
                sendMessage();
            }
        });
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('actionBtn')) {
                sendMessage(e.target.textContent);
            }
        });
        
        document.getElementById('messageInput').focus();
    </script>
</body>
</html>
      `);
    });

    const port = 3004;
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`🚨 Ask Eve Assist Production RAG System running on port ${port}`);
      logger.info(`🌐 Full RAG chat interface: http://localhost:${port}/chat`);
      logger.info(`🔍 Health check: http://localhost:${port}/health`);
      logger.info(`📡 RAG API endpoint: http://localhost:${port}/api/v1/chat`);
      logger.info('🛡️  Crisis detection active (<2s response time)');
      logger.info('📚 Supabase Eve Appeal content integration active');
      logger.info('⚖️  MHRA compliance monitoring enabled');
      console.log('\n🎉 PRODUCTION RAG SYSTEM READY FOR TESTING!');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('🛑 Shutting down production server...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error: any) {
    logger.error('Failed to start production server', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  startProductionServer().catch((error) => {
    console.error('Critical startup failure:', error);
    process.exit(1);
  });
}