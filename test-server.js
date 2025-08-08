const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'ask-eve-integrated-test',
    timestamp: new Date().toISOString(),
    supabaseIntegration: 'active',
    azureOpenAI: 'connected'
  });
});

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  res.json({
    message: `Echo: ${message}`,
    integration: 'supabase-typescript-working',
    timestamp: new Date().toISOString()
  });
});

const port = 3010;
app.listen(port, () => {
  console.log(`✅ Test server running on http://localhost:${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
  console.log(`💬 Chat: POST http://localhost:${port}/api/chat`);
});
