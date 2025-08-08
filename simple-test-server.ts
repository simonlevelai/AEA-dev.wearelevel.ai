#!/usr/bin/env npx ts-node

import express from 'express';
import cors from 'cors';
import { AzureOpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

// Minimal server to test basic functionality
async function startSimpleServer(): Promise<void> {
  console.log('🚀 Starting simple test server...');
  
  try {
    // Test Azure OpenAI connection
    const azureOpenAI = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-12-01-preview'
    });
    console.log('✅ Azure OpenAI client created');

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Simple health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'simple-test-server'
      });
    });

    // Simple chat endpoint
    app.post('/api/chat', async (req, res) => {
      try {
        const { message } = req.body;
        console.log('Received message:', message);

        const completion = await azureOpenAI.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are Ask Eve Assist, a helpful healthcare assistant.'
            },
            {
              role: 'user',
              content: message
            }
          ],
          max_completion_tokens: 300
        });

        res.json({
          message: completion.choices[0].message.content,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Chat error:', error);
        res.status(500).json({
          error: 'Server error',
          message: error.message
        });
      }
    });

    // Simple chat interface
    app.get('/chat', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Simple Ask Eve Test</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>🏥 Ask Eve Assist - Simple Test</h1>
          <div id="messages" style="border: 1px solid #ccc; height: 300px; overflow-y: auto; padding: 10px; margin: 20px 0;"></div>
          <input type="text" id="messageInput" placeholder="Type your message..." style="width: 70%; padding: 10px;">
          <button onclick="sendMessage()" style="width: 25%; padding: 10px;">Send</button>
          
          <script>
            function sendMessage() {
              const input = document.getElementById('messageInput');
              const messages = document.getElementById('messages');
              const message = input.value.trim();
              if (!message) return;
              
              messages.innerHTML += '<div><strong>You:</strong> ' + message + '</div>';
              input.value = '';
              
              fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
              })
              .then(res => res.json())
              .then(data => {
                messages.innerHTML += '<div><strong>Ask Eve:</strong> ' + (data.message || data.error) + '</div>';
                messages.scrollTop = messages.scrollHeight;
              })
              .catch(err => {
                messages.innerHTML += '<div><strong>Error:</strong> ' + err.message + '</div>';
              });
            }
            
            document.getElementById('messageInput').addEventListener('keypress', function(e) {
              if (e.key === 'Enter') sendMessage();
            });
          </script>
        </body>
        </html>
      `);
    });

    const port = 3003;
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`✅ Simple test server running on port ${port}`);
      console.log(`🌐 Chat interface: http://localhost:${port}/chat`);
      console.log(`🔍 Health check: http://localhost:${port}/health`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error: any) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startSimpleServer();
}