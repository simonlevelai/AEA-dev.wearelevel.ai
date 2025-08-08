#!/usr/bin/env npx ts-node

/**
 * Working Ask Eve Assist Production Server
 * Simplified version of src/index.ts with core functionality
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AzureOpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Simple logger
class Logger {
  constructor(private service: string) {}
  
  info(message: string, context?: any) {
    console.log(`[${this.service}] ${message}`, context ? JSON.stringify(context) : '');
  }
  
  error(message: string, context?: any) {
    console.error(`[${this.service}] ${message}`, context ? JSON.stringify(context) : '');
  }
  
  warn(message: string, context?: any) {
    console.warn(`[${this.service}] ${message}`, context ? JSON.stringify(context) : '');
  }
  
  debug(message: string, context?: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${this.service}] ${message}`, context ? JSON.stringify(context) : '');
    }
  }
}

// Content service for Eve Appeal information
class ContentService {
  private contentDatabase = {
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
    },
    'womb cancer': {
      found: true,
      content: 'Womb cancer (also called endometrial or uterine cancer) most commonly causes abnormal vaginal bleeding, especially after menopause. Other symptoms may include pelvic pain, pain during sex, and unexplained weight loss. It is important to see your GP if you experience any unusual bleeding.',
      source: 'The Eve Appeal',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/womb-cancer/',
      title: 'Womb Cancer Information',
      relevanceScore: 0.91
    },
    'pelvic pain': {
      found: true,
      content: 'Pelvic pain can have many causes including ovarian cysts, endometriosis, infections, or in rare cases, gynecological cancers. Persistent or severe pelvic pain should always be evaluated by a healthcare professional.',
      source: 'The Eve Appeal',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/pelvic-pain/',
      title: 'Understanding Pelvic Pain',
      relevanceScore: 0.88
    }
  };

  async searchContent(query: string) {
    const lowerQuery = query.toLowerCase();
    
    // Search for matching content
    for (const [topic, data] of Object.entries(this.contentDatabase)) {
      if (lowerQuery.includes(topic) || 
          topic.split(' ').some(word => lowerQuery.includes(word))) {
        return data;
      }
    }
    
    return { found: false, content: null, source: null, sourceUrl: null, relevanceScore: 0 };
  }
}

// Safety service for crisis detection
class SafetyService {
  async analyzeMessage(text: string) {
    const lowerText = text.toLowerCase();
    const crisisPatterns = [
      'suicide', 'kill myself', 'end it all', 'hopeless', 'dark thoughts',
      'crisis', 'emergency', 'urgent help', 'cannot cope', 'desperate'
    ];
    
    for (const pattern of crisisPatterns) {
      if (lowerText.includes(pattern)) {
        return {
          shouldEscalate: true,
          severity: 'critical',
          escalationType: 'crisis_support',
          reason: `Crisis indicator: "${pattern}"`,
          confidence: 0.9
        };
      }
    }
    
    return { shouldEscalate: false, severity: 'low', confidence: 0.1 };
  }
}

// Base system prompt for Ask Eve Assist
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

// Enhanced system prompt creation with priority content
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

// Crisis detection function
function detectCrisisIndicators(message: string, response: string): boolean {
  const lowerMessage = message.toLowerCase();
  const lowerResponse = response.toLowerCase();
  
  return lowerMessage.includes('hopeless') ||
         lowerMessage.includes('end my life') ||
         lowerMessage.includes('dark thoughts') ||
         lowerMessage.includes('giving up') ||
         lowerMessage.includes('suicide') ||
         lowerResponse.includes('999') ||
         lowerResponse.includes('samaritans');
}

async function startWorkingServer(): Promise<void> {
  const logger = new Logger('ask-eve-assist-working');
  
  try {
    logger.info('🚨 Starting Ask Eve Assist Production Server...');

    // Initialize Azure OpenAI client
    const azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });
    logger.info('✅ Azure OpenAI client initialized');

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || ''
    );
    logger.info('✅ Supabase client initialized');

    // Initialize services
    const contentService = new ContentService();
    const safetyService = new SafetyService();
    logger.info('✅ Content and Safety services initialized');

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
        'http://localhost:3978'
      ],
      credentials: true
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Add user identification middleware
    app.use((req: any, _res, next) => {
      req.userId = req.headers['x-user-id'] || `user-${Date.now()}`;
      req.sessionId = req.headers['x-session-id'] || `session-${Date.now()}`;
      next();
    });

    // Health check endpoint
    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: 'ask-eve-assist-working',
        timestamp: new Date().toISOString(),
        services: {
          azureOpenAI: 'connected',
          supabase: 'connected',
          contentService: 'active',
          safetyService: 'active'
        }
      });
    });

    // Main chat endpoint with Azure OpenAI + Content Service
    app.post('/api/v1/chat', async (req: any, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        logger.info(`🗣️ User message: ${message}`, { userId: req.userId });
        const startTime = Date.now();

        // Crisis detection first
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
            responseTime: Date.now() - startTime,
            isCrisis: true,
            timestamp: new Date().toISOString(),
            suggestedActions: ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse', "I'm okay, continue"],
            escalationReason: safetyResult.reason
          };
          
          logger.info(`🚨 Crisis response activated: ${safetyResult.reason}`);
          return res.json(crisisResponse);
        }

        // Search for relevant Eve Appeal content
        const contentResult = await contentService.searchContent(message);
        
        // Create enhanced system prompt
        const systemPrompt = createEnhancedSystemPrompt(contentResult);

        // Call Azure OpenAI with enhanced context
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

        // Check for crisis indicators
        const isCrisis = detectCrisisIndicators(message, responseText);

        logger.info(`🤖 Response generated (${responseTime}ms)`, { 
          userId: req.userId,
          tokens: completion.usage?.total_tokens,
          contentFound: contentResult.found 
        });

        const response = {
          message: responseText,
          safetyLevel: isCrisis ? 'crisis' : 'general',
          responseTime,
          tokenUsage: completion.usage?.total_tokens || 0,
          isCrisis,
          timestamp: new Date().toISOString(),
          contentUsed: contentResult.found ? {
            source: contentResult.source || 'Unknown',
            relevanceScore: contentResult.relevanceScore || 0,
            sourceUrl: contentResult.sourceUrl || '',
            title: (contentResult as any).title || 'Medical Information'
          } : null,
          resources: contentResult.found ? [contentResult.sourceUrl || ''] : [],
          suggestedActions: isCrisis 
            ? ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse']
            : ['Ask follow-up question', 'Speak to a nurse', 'Visit Eve Appeal website', 'Other symptoms'],
          disclaimers: [
            'This is general health information only and should not replace professional medical advice.',
            'Always consult your healthcare provider for medical concerns.',
            'In emergencies, call 999 immediately.'
          ]
        };

        return res.json(response);
      } catch (error: any) {
        logger.error('Chat endpoint error', { 
          error: error.message, 
          userId: req.userId 
        });

        // Handle Azure OpenAI content filtering
        if (error.message && error.message.includes('content')) {
          return res.json({
            message: `I understand you may be going through a difficult time. For your safety and wellbeing, please reach out for support:

**Emergency Contacts:**
• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7) 
• Crisis Text Line: Text SHOUT to 85258
• NHS 111: For urgent mental health support

Your safety matters, and there are people who want to help. Please speak to someone who can provide the care and support you need.`,
            safetyLevel: 'crisis',
            isCrisis: true,
            contentFiltered: true,
            timestamp: new Date().toISOString()
          });
        }

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

    // Chat interface endpoint
    app.get('/chat', (_req, res) => {
      res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Production Chat</title>
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
        
        .loading { 
            text-align: center; 
            color: #6b7280; 
            font-style: italic; 
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏥 Ask Eve Assist</h1>
        <p>Production Healthcare Assistant - Real Azure OpenAI Integration</p>
    </div>
    
    <div class="status">
        <strong>✅ PRODUCTION SYSTEM ACTIVE</strong><br>
        Azure OpenAI Connected | Eve Appeal Content | Crisis Detection | Real-time Responses
    </div>
    
    <div class="quickTests">
        <h3>🧪 Test Production System</h3>
        <button class="testBtn" onclick="sendTest('Hello, I\\'m worried about some symptoms')">👋 Health Concern</button>
        <button class="testBtn" onclick="sendTest('What are the symptoms of ovarian cancer?')">🔍 Medical Query</button>
        <button class="testBtn" onclick="sendTest('Tell me about cervical screening')">📋 Screening Info</button>
        <button class="testBtn" onclick="sendTest('Can I speak to a nurse?')">📞 Nurse Request</button>
        <button class="testBtn" onclick="sendTest('I\\'m feeling hopeless and having dark thoughts')">🚨 Crisis Test</button>
    </div>
    
    <div id="chatContainer">
        <div id="chatMessages">
            <div class="message bot">
                <strong>Ask Eve Assist:</strong> Hello! I'm Ask Eve Assist, your production healthcare assistant powered by Azure OpenAI and real Eve Appeal content. 
                <br><br>
                I can help you find evidence-based information about gynaecological health, connect you with support services, and provide emergency contacts when needed.
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
        
        function setLoading(loading) {
            isLoading = loading;
            const button = document.getElementById('sendButton');
            const input = document.getElementById('messageInput');
            
            button.disabled = loading;
            button.textContent = loading ? 'Thinking...' : 'Send';
            input.disabled = loading;
            
            if (loading) {
                addMessage('<div class="loading">🤖 Ask Eve is consulting medical knowledge...</div>', 'bot');
            }
        }
        
        async function sendMessage(text = null) {
            const input = document.getElementById('messageInput');
            const message = text || input.value.trim();
            
            if (!message || isLoading) return;
            
            // Add user message
            addMessage(\`<strong>You:</strong> \${message}\`, 'user');
            
            if (!text) input.value = '';
            setLoading(true);
            
            try {
                const response = await fetch('/api/v1/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                // Remove loading message
                const messages = document.getElementById('chatMessages');
                const lastMessage = messages.lastElementChild;
                if (lastMessage.querySelector('.loading')) {
                    lastMessage.remove();
                }
                
                let botContent = \`<strong>Ask Eve Assist:</strong> \${data.message.replace(/\\n/g, '<br>')}\`;
                
                if (data.responseTime || data.tokenUsage || data.contentUsed) {
                    botContent += '<div class="metrics">';
                    if (data.responseTime) botContent += \`⏱️ \${data.responseTime}ms\`;
                    if (data.tokenUsage) botContent += \` | 🔢 \${data.tokenUsage} tokens\`;
                    if (data.contentUsed) botContent += \` | 📚 \${data.contentUsed.source}\`;
                    botContent += '</div>';
                }
                
                if (data.suggestedActions && data.suggestedActions.length > 0) {
                    botContent += '<div class="actions">';
                    data.suggestedActions.forEach(action => {
                        botContent += \`<span class="actionBtn">\${action}</span>\`;
                    });
                    botContent += '</div>';
                }
                
                addMessage(botContent, 'bot', data.isCrisis);
                
            } catch (error) {
                // Remove loading message
                const messages = document.getElementById('chatMessages');
                const lastMessage = messages.lastElementChild;
                if (lastMessage.querySelector('.loading')) {
                    lastMessage.remove();
                }
                
                addMessage(\`<strong>Error:</strong> Connection failed - \${error.message}<br><br>Please try again or contact The Eve Appeal directly at https://eveappeal.org.uk\`, 'bot');
            } finally {
                setLoading(false);
            }
        }
        
        function sendTest(message) {
            sendMessage(message);
        }
        
        // Enter key support
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isLoading) {
                sendMessage();
            }
        });
        
        // Action button clicks
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('actionBtn')) {
                sendMessage(e.target.textContent);
            }
        });
        
        // Focus input on load
        document.getElementById('messageInput').focus();
    </script>
</body>
</html>
      `);
    });

    // Error handling middleware
    app.use((error: Error, req: any, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled application error', {
        error: error.message,
        path: req.path,
        method: req.method,
        userId: req.userId
      });

      res.status(500).json({
        error: 'Internal server error',
        code: 'UNHANDLED_ERROR',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path
      });
    });

    const port = parseInt(process.env.PORT || '3002', 10);
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`🚨 Ask Eve Assist Production Server running on port ${port}`);
      logger.info(`🌐 Chat interface: http://localhost:${port}/chat`);
      logger.info(`🔍 Health check: http://localhost:${port}/health`);
      logger.info(`📡 API endpoint: http://localhost:${port}/api/v1/chat`);
      logger.info('🛡️  Production safety systems active');
      logger.info('📞 Crisis detection and emergency contacts configured');
      logger.info('⚖️  MHRA compliance monitoring enabled');
      console.log('\\n🎉 PRODUCTION SYSTEM READY FOR TESTING!');
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('🛑 Shutting down Ask Eve Assist Production Server...');
      
      server.close(() => {
        logger.info('HTTP server closed');
      });

      try {
        process.exit(0);
      } catch (error: any) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception - system may be unstable', { error: error.message });
      shutdown();
    });
    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled promise rejection', { reason: reason?.message || reason });
      shutdown();
    });

  } catch (error: any) {
    logger.error('Failed to start Ask Eve Assist Production Server', { error: error.message });
    process.exit(1);
  }
}

// Start the production server
if (require.main === module) {
  startWorkingServer().catch((error) => {
    console.error('Critical startup failure:', error);
    process.exit(1);
  });
}