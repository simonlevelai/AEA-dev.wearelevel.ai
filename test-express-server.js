#!/usr/bin/env node

/**
 * Simple Express server test with Azure OpenAI integration
 * Bypasses TypeScript compilation issues for quick local testing
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

// Import OpenAI for Azure
const { AzureOpenAI } = require('openai');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple logger
const logger = {
  info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx || ''),
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx || ''),
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx || ''),
  debug: (msg, ctx) => process.env.LOG_LEVEL === 'debug' && console.log(`[DEBUG] ${msg}`, ctx || '')
};

// Initialize Azure OpenAI
let azureOpenAI;
try {
  azureOpenAI = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2024-12-01-preview'
  });
  logger.info('✅ Azure OpenAI client initialized');
} catch (error) {
  logger.error('❌ Failed to initialize Azure OpenAI', { error: error.message });
}

// Mock content service for testing
const mockContentService = {
  async searchContent(query) {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('ovarian') && (lowerQuery.includes('cancer') || lowerQuery.includes('symptoms'))) {
      return {
        found: true,
        content: 'Ovarian cancer symptoms may include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, and urinary urgency.',
        source: 'The Eve Appeal',
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/',
        relevanceScore: 0.95
      };
    }
    
    if (lowerQuery.includes('cervical') && lowerQuery.includes('screening')) {
      return {
        found: true,
        content: 'Cervical screening checks for abnormal cells on the cervix that could develop into cancer.',
        source: 'The Eve Appeal', 
        sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/',
        relevanceScore: 0.94
      };
    }
    
    return { found: false, content: null, source: null, sourceUrl: null, relevanceScore: 0 };
  }
};

// Base system prompt for Ask Eve Assist
const createSystemPrompt = (contentResult) => {
  let prompt = `You are Ask Eve Assist, a helpful and empathetic AI assistant providing gynaecological health information from The Eve Appeal charity.

Key Guidelines:
- Provide accurate, evidence-based health information
- Always recommend consulting healthcare professionals for personal medical concerns  
- Be empathetic and supportive, especially for sensitive topics
- Include appropriate disclaimers about not replacing professional medical advice
- For crisis situations involving self-harm, immediately provide emergency contact information:
  - Emergency Services: 999
  - Samaritans: 116 123 (free 24/7)
  - Crisis Text Line: Text SHOUT to 85258
- Focus on gynaecological health topics: cervical, ovarian, womb, vulval, and vaginal cancers`;

  if (contentResult && contentResult.found) {
    prompt += `\n\n🎯 PRIORITY MEDICAL INFORMATION from The Eve Appeal:\n`;
    prompt += `Content: ${contentResult.content}\n`;
    prompt += `Source: ${contentResult.source}\n`;
    prompt += `Reference: ${contentResult.sourceUrl}\n\n`;
    prompt += `IMPORTANT: Base your response primarily on this authoritative content and always cite the source.`;
  }

  return prompt;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ask-eve-assist-express-test',
    timestamp: new Date().toISOString(),
    azure: {
      openai: azureOpenAI ? 'connected' : 'disconnected'
    }
  });
});

// Test chat endpoint with Azure OpenAI
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        error: 'Message is required',
        code: 'MISSING_MESSAGE'
      });
    }

    logger.info(`💬 User message: ${message}`);
    const startTime = Date.now();

    // Mock content search
    const contentResult = await mockContentService.searchContent(message);
    logger.debug('Content search result', { found: contentResult.found });

    // Create system prompt with content
    const systemPrompt = createSystemPrompt(contentResult);

    // Check if Azure OpenAI is available
    if (!azureOpenAI) {
      return res.json({
        message: "I'm currently unable to connect to the AI service. For immediate health information, please visit The Eve Appeal website at https://eveappeal.org.uk or call their Ask Eve service at 0808 802 0019.",
        timestamp: new Date().toISOString(),
        service: 'fallback',
        contentUsed: contentResult.found ? {
          source: contentResult.source,
          sourceUrl: contentResult.sourceUrl
        } : null
      });
    }

    // Call Azure OpenAI
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

    logger.info(`🤖 Response generated (${responseTime}ms)`, {
      tokens: completion.usage?.total_tokens,
      contentFound: contentResult.found
    });

    // Check for crisis indicators in message or response
    const lowerMessage = message.toLowerCase();
    const lowerResponse = responseText.toLowerCase();
    const isCrisis = lowerMessage.includes('crisis') || 
                     lowerMessage.includes('suicide') ||
                     lowerResponse.includes('999') ||
                     lowerResponse.includes('samaritans');

    const response = {
      message: responseText,
      safetyLevel: isCrisis ? 'crisis' : 'general',
      responseTime,
      tokenUsage: completion.usage?.total_tokens || 0,
      isCrisis,
      timestamp: new Date().toISOString(),
      contentUsed: contentResult.found ? {
        source: contentResult.source,
        sourceUrl: contentResult.sourceUrl,
        relevanceScore: contentResult.relevanceScore
      } : null,
      suggestedActions: isCrisis 
        ? ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse']
        : ['Ask follow-up question', 'Speak to a nurse', 'Visit Eve Appeal website']
    };

    return res.json(response);

  } catch (error) {
    logger.error('Chat endpoint error', { error: error.message });

    // Handle Azure OpenAI content filtering
    if (error.message && error.message.includes('content')) {
      return res.json({
        message: `I understand you may be going through a difficult time. For your safety and wellbeing, please reach out for support:

**Emergency Contacts:**
• Emergency Services: 999
• Samaritans: 116 123 (free, 24/7)
• Crisis Text Line: Text SHOUT to 85258

Your safety matters, and there are people who want to help.`,
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

// Simple HTML chat interface for testing
app.get('/chat', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Local Test</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        #chatMessages { border: 1px solid #ccc; height: 400px; overflow-y: scroll; padding: 10px; margin-bottom: 10px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background-color: #e3f2fd; text-align: right; }
        .bot { background-color: #f3e5f5; }
        .crisis { background-color: #ffebee; border-left: 4px solid #f44336; }
        #messageInput { width: 70%; padding: 10px; }
        #sendButton { width: 25%; padding: 10px; background-color: #6b46c1; color: white; border: none; }
        .suggested-actions { margin: 5px 0; }
        .action-btn { background-color: #e0e7ff; border: 1px solid #c7d2fe; padding: 5px 10px; margin: 2px; border-radius: 3px; }
    </style>
</head>
<body>
    <h1>🏥 Ask Eve Assist - Local Test Interface</h1>
    
    <div id="chatMessages">
        <div class="message bot">
            <strong>Ask Eve Assist:</strong> Hello! I'm here to help you find information about gynaecological health. How can I help you today?
        </div>
    </div>
    
    <div>
        <input type="text" id="messageInput" placeholder="Type your message here..." />
        <button id="sendButton" onclick="sendMessage()">Send</button>
    </div>
    
    <div style="margin-top: 20px;">
        <h3>Quick Test Messages:</h3>
        <button class="action-btn" onclick="sendTestMessage('Hello, I\\'m worried about some symptoms')">Greeting</button>
        <button class="action-btn" onclick="sendTestMessage('What are the symptoms of ovarian cancer?')">Health Query</button>
        <button class="action-btn" onclick="sendTestMessage('Tell me about cervical screening')">Screening Info</button>
        <button class="action-btn" onclick="sendTestMessage('Can I speak to a nurse?')">Nurse Request</button>
    </div>
    
    <script>
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
            
            if (!message) return;
            
            // Add user message
            addMessage(\`<strong>You:</strong> \${message}\`, 'user');
            
            if (!text) input.value = '';
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                let botContent = \`<strong>Ask Eve Assist:</strong> \${data.message}\`;
                
                if (data.responseTime) {
                    botContent += \`<br><small>Response time: \${data.responseTime}ms\`;
                    if (data.tokenUsage) botContent += \` | Tokens: \${data.tokenUsage}\`;
                    if (data.contentUsed) botContent += \` | Source: \${data.contentUsed.source}\`;
                    botContent += '</small>';
                }
                
                if (data.suggestedActions && data.suggestedActions.length > 0) {
                    botContent += '<div class="suggested-actions"><strong>Suggested:</strong> ';
                    data.suggestedActions.forEach(action => {
                        botContent += \`<span class="action-btn">\${action}</span>\`;
                    });
                    botContent += '</div>';
                }
                
                addMessage(botContent, 'bot', data.isCrisis);
                
            } catch (error) {
                addMessage(\`<strong>Error:</strong> Failed to get response - \${error.message}\`, 'bot');
            }
        }
        
        function sendTestMessage(message) {
            sendMessage(message);
        }
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    </script>
</body>
</html>
  `);
});

// Start the server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`🚀 Ask Eve Assist Express Test Server running on port ${port}`);
  console.log(`🌐 Chat interface: http://localhost:${port}/chat`);
  console.log(`🔍 Health check: http://localhost:${port}/health`);
  console.log(`📡 API endpoint: http://localhost:${port}/api/chat`);
  console.log('');
  console.log('🧪 Test the system by:');
  console.log('1. Visit http://localhost:' + port + '/chat for web interface');
  console.log('2. Check health at http://localhost:' + port + '/health');
  console.log('3. Send POST to http://localhost:' + port + '/api/chat with {"message": "your question"}');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down Express test server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;