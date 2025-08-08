require('dotenv').config();
const { AzureOpenAI } = require('openai');

async function quickTest() {
  console.log('🧪 Quick OpenAI Test...');
  
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2024-12-01-preview'
  });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      messages: [
        {
          role: 'system',
          content: 'You are Ask Eve Assist, a helpful assistant for gynaecological health questions.'
        },
        {
          role: 'user',
          content: 'What are the main symptoms of cervical cancer?'
        }
      ],
      max_completion_tokens: 200
    });

    console.log('✅ OpenAI Response:');
    console.log(completion.choices[0].message.content);
    console.log(`\n📊 Usage: ${completion.usage.total_tokens} tokens`);
    console.log('\n🎉 Ask Eve Assist is working!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickTest();