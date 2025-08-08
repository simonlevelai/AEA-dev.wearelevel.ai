#!/usr/bin/env node

/**
 * Quick Demo Server for M365 Agents SDK Multi-Agent System
 * JavaScript version for immediate testing
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());

// Mock healthcare agents
class MockHealthcareAgents {
  constructor() {
    console.log('🤖 Healthcare Agents initialized');
  }

  async processHealthcareMessage(userMessage) {
    const startTime = Date.now();
    const lowerMessage = userMessage.toLowerCase();

    console.log(`Processing: "${userMessage}"`);

    // Safety Agent - Crisis Detection (PRIORITY)
    if (lowerMessage.includes('hopeless') || lowerMessage.includes('end my life') || 
        lowerMessage.includes('hurt myself') || lowerMessage.includes('suicide')) {
      await this.delay(400);
      
      return {
        success: true,
        response: `I'm very concerned about what you've shared. Your safety and wellbeing are the top priority right now. Please reach out for immediate support:

• **Emergency Services: 999** - For immediate danger  
• **Samaritans: 116 123** - Free, confidential support (24/7)
• **Crisis Text Line: Text SHOUT to 85258** 
• **NHS 111** - For urgent health support

You are not alone, and there are people who want to help. These feelings can change with the right support. Please reach out now.`,
        agentUsed: 'SafetyAgent',
        responseTime: Date.now() - startTime,
        isCrisis: true,
        emergencyContacts: {
          emergency: '999',
          samaritans: '116 123',
          crisisText: 'Text SHOUT to 85258',
          nhs: '111'
        },
        suggestedActions: ['Call 999 now', 'Contact Samaritans', 'Text SHOUT to 85258']
      };
    }

    // Escalation Agent - Nurse Callback
    if (lowerMessage.includes('nurse') || lowerMessage.includes('urgent') || lowerMessage.includes('worried')) {
      await this.delay(1800);
      
      return {
        success: true,
        response: `I understand you're concerned and would like to speak with a healthcare professional. I can help arrange a nurse callback from The Eve Appeal's specialist team.

Our qualified nurses can provide personalized guidance and support for your specific concerns. They're available Monday-Friday, 9am-5pm.

To arrange a callback, I'll need to collect some basic contact information in compliance with GDPR data protection requirements. Would you like to proceed with scheduling a nurse callback?`,
        agentUsed: 'EscalationAgent',
        responseTime: Date.now() - startTime,
        isCrisis: false,
        suggestedActions: ['Yes, schedule callback', 'Tell me more about the service', 'I need immediate help']
      };
    }

    // Content Agent - Health Information
    if (lowerMessage.includes('cancer') || lowerMessage.includes('symptoms') || 
        lowerMessage.includes('screening') || lowerMessage.includes('health')) {
      await this.delay(1200);
      
      return {
        success: true,
        response: `I can provide you with trusted information about gynaecological health from The Eve Appeal's expert resources.

**Ovarian Cancer Symptoms:**
- Persistent bloating that doesn't come and go
- Feeling full quickly when eating  
- Pelvic or abdominal pain
- Needing to urinate more frequently

**Cervical Screening:**
- Regular screening can prevent cervical cancer
- Recommended every 3-5 years depending on age
- Available through your GP or sexual health clinic

**Important**: This is general health information only and should not replace professional medical advice. If you're experiencing concerning symptoms, please consult your GP or contact our nurse line.`,
        agentUsed: 'ContentAgent',
        responseTime: Date.now() - startTime,
        isCrisis: false,
        suggestedActions: ['More about symptoms', 'Screening information', 'Speak to a nurse', 'Support services']
      };
    }

    // Default greeting/general response
    await this.delay(800);
    
    return {
      success: true,
      response: `Hello, I'm Ask Eve Assist - a digital assistant powered by a team of specialized AI agents working together to provide you with the best possible support.

I can help you with:
• Information about gynaecological health
• Understanding symptoms and screening
• Connecting you with qualified nurses
• Crisis support and emergency contacts

I'm not a medical professional, but I can help you access trusted information from The Eve Appeal and connect you with professional support when needed.

How can I help you today?`,
      agentUsed: 'ConversationAgent',
      responseTime: Date.now() - startTime,
      isCrisis: false,
      suggestedActions: ['Ovarian cancer info', 'Cervical screening', 'Speak to nurse', 'Crisis support']
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const healthcareAgents = new MockHealthcareAgents();

// API Routes
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`Chat request: ${message.length} chars`);

    const response = await healthcareAgents.processHealthcareMessage(message);
    
    res.json({
      ...response,
      conversationId: conversationId || `conv-${Date.now()}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      fallback: {
        response: "I'm experiencing technical difficulties. For immediate health support, please contact NHS 111 or call 999 in an emergency.",
        emergencyContacts: {
          emergency: '999',
          nhs: '111',
          eveAppeal: '0808 802 0019'
        }
      }
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Ask Eve Assist M365 Agents SDK Demo',
    agents: {
      safetyAgent: 'active',
      contentAgent: 'active', 
      escalationAgent: 'active',
      conversationAgent: 'active'
    },
    architecture: 'Microsoft 365 Agents SDK 2025'
  });
});

// Simple HTML interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ask Eve Assist - M365 Agents SDK Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .badge {
            background: #4CAF50;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .chat-container {
            border: 1px solid #ddd;
            border-radius: 8px;
            height: 400px;
            overflow-y: auto;
            padding: 15px;
            margin-bottom: 15px;
            background: #fafafa;
        }
        .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 8px;
            max-width: 80%;
        }
        .user-message {
            background: #007bff;
            color: white;
            margin-left: auto;
        }
        .agent-message {
            background: white;
            border: 1px solid #ddd;
        }
        .agent-name {
            font-weight: bold;
            color: #007bff;
            font-size: 12px;
            margin-bottom: 5px;
        }
        .crisis-alert {
            background: #dc3545 !important;
            color: white !important;
            border: none !important;
        }
        .input-container {
            display: flex;
            gap: 10px;
        }
        .message-input {
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }
        .send-button {
            padding: 12px 24px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
        }
        .send-button:hover {
            background: #0056b3;
        }
        .send-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .suggested-actions {
            margin-top: 10px;
        }
        .action-button {
            background: #f8f9fa;
            border: 1px solid #ddd;
            padding: 6px 12px;
            margin: 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .action-button:hover {
            background: #e9ecef;
        }
        .demo-examples {
            margin: 20px 0;
            padding: 15px;
            background: #e7f3ff;
            border-radius: 8px;
        }
        .demo-button {
            background: #17a2b8;
            color: white;
            border: none;
            padding: 8px 12px;
            margin: 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .response-info {
            font-size: 11px;
            color: #666;
            margin-top: 8px;
            border-top: 1px solid #eee;
            padding-top: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Ask Eve Assist</h1>
            <p><span class="badge">M365 AGENTS SDK 2025</span></p>
            <p>Healthcare Chatbot with Multi-Agent Orchestration</p>
        </div>

        <div class="demo-examples">
            <h4>🧪 Try These Demo Scenarios:</h4>
            <button class="demo-button" onclick="sendDemo('Hello, I need help with health information')">👋 Greeting</button>
            <button class="demo-button" onclick="sendDemo('I have questions about ovarian cancer symptoms')">📋 Health Query</button>
            <button class="demo-button" onclick="sendDemo('I am worried about unusual symptoms and need to speak with a nurse urgently')">🏥 Nurse Request</button>
            <button class="demo-button" onclick="sendDemo('I feel hopeless and want to end my life')" style="background: #dc3545;">🚨 Crisis (Test)</button>
        </div>

        <div class="chat-container" id="chatContainer"></div>
        
        <div class="input-container">
            <input 
                type="text" 
                class="message-input" 
                id="messageInput" 
                placeholder="Type your message here..." 
                onkeypress="if(event.key==='Enter') sendMessage()"
            >
            <button class="send-button" onclick="sendMessage()" id="sendButton">Send</button>
        </div>
    </div>

    <script>
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        let conversationId = 'conv-' + Date.now();

        function addMessage(text, isUser, agentName, responseInfo) {
            const message = document.createElement('div');
            message.className = 'message ' + (isUser ? 'user-message' : 'agent-message');
            
            if (responseInfo && responseInfo.isCrisis) {
                message.classList.add('crisis-alert');
            }
            
            let content = '';
            if (!isUser && agentName) {
                content += '<div class="agent-name">🤖 ' + agentName + '</div>';
            }
            content += text.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
            
            if (responseInfo && responseInfo.suggestedActions && responseInfo.suggestedActions.length > 0) {
                content += '<div class="suggested-actions">';
                responseInfo.suggestedActions.forEach(action => {
                    content += '<button class="action-button" onclick="sendDemo(\\''+action+'\\')">' + action + '</button>';
                });
                content += '</div>';
            }
            
            if (responseInfo) {
                content += '<div class="response-info">';
                content += 'Response Time: ' + responseInfo.responseTime + 'ms';
                if (responseInfo.emergencyContacts) {
                    content += ' | 🚨 Emergency contacts provided';
                }
                content += '</div>';
            }
            
            message.innerHTML = content;
            chatContainer.appendChild(message);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        async function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) return;

            addMessage(message, true);
            messageInput.value = '';
            sendButton.disabled = true;

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        conversationId,
                        userId: 'demo-user'
                    })
                });

                const data = await response.json();
                
                if (data.success) {
                    addMessage(data.response, false, data.agentUsed, data);
                } else {
                    addMessage('Sorry, I encountered an error. Please try again.', false, 'System');
                }
            } catch (error) {
                console.error('Error:', error);
                addMessage('Connection error. Please check your connection and try again.', false, 'System');
            } finally {
                sendButton.disabled = false;
                messageInput.focus();
            }
        }

        function sendDemo(message) {
            messageInput.value = message;
            sendMessage();
        }

        messageInput.focus();
        addMessage('Hello! I\\'m Ask Eve Assist, powered by multiple specialized AI agents. I can help with gynaecological health information, connect you with nurses, and provide crisis support. Try the demo scenarios above or ask me anything!', false, 'ConversationAgent');
    </script>
</body>
</html>
`);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🏥 Ask Eve Assist - M365 Agents SDK Demo`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Multi-Agent Architecture: Safety → Content → Escalation`);
  console.log(`\n✅ Ready for testing!`);
});