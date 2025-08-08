#!/usr/bin/env node

/**
 * Simple Chat Server for Ask Eve Assist
 * Minimal setup for local testing
 */

const express = require('express');
const dotenv = require('dotenv');
const { AzureOpenAI } = require('openai');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Initialize Azure OpenAI
let azureOpenAI;
try {
  azureOpenAI = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2024-12-01-preview'
  });
  console.log('✅ Azure OpenAI initialized');
} catch (error) {
  console.log('⚠️  Azure OpenAI not available');
}

// Mock content for testing
const getContent = (query) => {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('ovarian') || lowerQuery.includes('cancer')) {
    return {
      found: true,
      content: 'Ovarian cancer symptoms may include persistent bloating, pelvic or abdominal pain, difficulty eating or feeling full quickly, and urinary urgency.',
      source: 'The Eve Appeal',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-cancer/ovarian-cancer/'
    };
  }
  
  if (lowerQuery.includes('cervical') || lowerQuery.includes('screening')) {
    return {
      found: true,
      content: 'Cervical screening checks for abnormal cells on the cervix that could develop into cancer. It is offered every 3-5 years to women aged 25-64.',
      source: 'The Eve Appeal',
      sourceUrl: 'https://eveappeal.org.uk/gynaecological-health/cervical-screening/'
    };
  }
  
  return { found: false };
};

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    console.log(`💬 User: ${message}`);
    const startTime = Date.now();

    // Check for crisis keywords
    const lowerMessage = message.toLowerCase();
    const crisisWords = ['crisis', 'suicide', 'hopeless', 'dark thoughts', 'kill myself'];
    const isCrisis = crisisWords.some(word => lowerMessage.includes(word));

    if (isCrisis) {
      return res.json({
        message: `🚨 **Crisis Support Available**

If you need immediate support:
• Emergency services: 999
• Samaritans: 116 123 (24/7)
• Crisis text line: Text SHOUT to 85258

Would you like me to help you connect with a nurse for additional support?`,
        isCrisis: true,
        responseTime: Date.now() - startTime,
        suggestedActions: ['Call Emergency Services', 'Contact Samaritans', 'Speak to a nurse']
      });
    }

    // Get content
    const contentResult = getContent(message);
    
    let systemPrompt = `You are Ask Eve Assist, a helpful AI assistant providing gynaecological health information from The Eve Appeal charity.

Guidelines:
- Be empathetic and supportive
- Always recommend consulting healthcare professionals for personal concerns
- Include appropriate medical disclaimers
- Focus on gynaecological health topics`;

    if (contentResult.found) {
      systemPrompt += `

Priority medical information from The Eve Appeal:
${contentResult.content}

Source: ${contentResult.source}
Reference: ${contentResult.sourceUrl}

Base your response primarily on this authoritative content and cite the source.`;
    }

    // Call Azure OpenAI if available
    let responseText = '';
    let tokenUsage = 0;

    if (azureOpenAI) {
      try {
        const completion = await azureOpenAI.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_completion_tokens: 400,
          temperature: 0.7
        });

        responseText = completion.choices[0].message.content || '';
        tokenUsage = completion.usage?.total_tokens || 0;
      } catch (error) {
        console.log('OpenAI error:', error.message);
        responseText = contentResult.found ? 
          `${contentResult.content}\n\n*Source: ${contentResult.source}*\n\n📖 [Read more](${contentResult.sourceUrl})` :
          "I'm here to help with gynaecological health questions. Please ask about symptoms, screening, or other health concerns.";
      }
    } else {
      responseText = contentResult.found ? 
        `${contentResult.content}\n\n*Source: ${contentResult.source}*\n\n📖 [Read more](${contentResult.sourceUrl})` :
        "I'm here to help with gynaecological health questions. Please ask about symptoms, screening, or other health concerns.";
    }

    const responseTime = Date.now() - startTime;
    
    console.log(`🤖 Response (${responseTime}ms): ${responseText.substring(0, 50)}...`);

    res.json({
      message: responseText,
      responseTime,
      tokenUsage,
      isCrisis: false,
      contentUsed: contentResult.found ? {
        source: contentResult.source,
        sourceUrl: contentResult.sourceUrl
      } : null,
      suggestedActions: ['Ask follow-up question', 'Speak to a nurse', 'Visit Eve Appeal website']
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Sorry, I encountered an error. Please try again.',
      emergencyContacts: {
        emergency: '999',
        samaritans: '116 123',
        eveAppeal: 'https://eveappeal.org.uk'
      }
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ask-eve-assist',
    timestamp: new Date().toISOString(),
    azure: azureOpenAI ? 'connected' : 'fallback'
  });
});

// Simple chat interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Ask Eve Assist - Local Test</title>
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
        
        #chatContainer { 
            background: white;
            border-radius: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
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
            margin: 20px 0; 
            padding: 20px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
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
        
        .status { 
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
        <p>AI Healthcare Assistant - Local Testing Interface</p>
    </div>
    
    <div class="quickTests">
        <h3>🧪 Quick Test Messages</h3>
        <button class="testBtn" onclick="sendTest('Hello, I\\'m worried about some symptoms')">👋 Greeting</button>
        <button class="testBtn" onclick="sendTest('What are the symptoms of ovarian cancer?')">🔍 Health Query</button>
        <button class="testBtn" onclick="sendTest('Tell me about cervical screening')">📋 Screening Info</button>
        <button class="testBtn" onclick="sendTest('Can I speak to a nurse?')">📞 Nurse Request</button>
        <button class="testBtn" onclick="sendTest('I\\'m feeling hopeless')">🚨 Crisis Test</button>
    </div>
    
    <div id="chatContainer">
        <div id="chatMessages">
            <div class="message bot">
                <strong>Ask Eve Assist:</strong> Hello! I'm here to help you find information about gynaecological health from The Eve Appeal. How can I help you today?
            </div>
        </div>
        
        <div class="inputContainer">
            <input type="text" id="messageInput" placeholder="Type your health question here..." />
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
                addMessage('<div class="status">🤖 Ask Eve is thinking...</div>', 'bot');
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
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                // Remove loading message
                const messages = document.getElementById('chatMessages');
                const lastMessage = messages.lastElementChild;
                if (lastMessage.querySelector('.status')) {
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
                if (lastMessage.querySelector('.status')) {
                    lastMessage.remove();
                }
                
                addMessage(\`<strong>Error:</strong> Failed to get response. Please try again.<br><small>\${error.message}</small>\`, 'bot');
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
        
        // Focus input on load
        document.getElementById('messageInput').focus();
    </script>
</body>
</html>
  `);
});

// Start server
const port = 3000;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`\n🚀 Ask Eve Assist Local Server Running!`);
  console.log(`📍 Local URL: http://localhost:${port}`);
  console.log(`🌐 Network URL: http://0.0.0.0:${port}`);
  console.log(`\n✅ Services:`);
  console.log(`   Azure OpenAI: ${azureOpenAI ? '🟢 Connected' : '🟡 Fallback Mode'}`);
  console.log(`   Content Service: 🟢 Active`);
  console.log(`   Crisis Detection: 🟢 Active`);
  console.log(`\n🧪 Test the system:`);
  console.log(`   • Open http://localhost:${port} in your browser`);
  console.log(`   • Try the quick test buttons`);
  console.log(`   • Ask health questions about ovarian cancer, cervical screening`);
  console.log(`   • Test crisis detection with "I'm feeling hopeless"`);
  console.log(`\n💡 To stop: Press Ctrl+C`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Ask Eve Assist server...');
  server.close(() => {
    console.log('✅ Server stopped. Goodbye!');
    process.exit(0);
  });
});