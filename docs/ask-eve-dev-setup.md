# Ask Eve Assist - Development Environment Setup Guide (Mac)

## 🎯 Overview

This guide gets you from zero to coding the Ask Eve chatbot on your Mac. Should take about 30-45 minutes, including tea breaks.

## 📋 Prerequisites Check

Before we start, make sure you've got:
- macOS Monterey (12.0) or later
- Admin access to your Mac
- Azure subscription (or free trial)
- GitHub account
- Basic familiarity with Terminal

## 🛠️ Step 1: Core Tools Installation

### 1.1 Install Homebrew (if you haven't already)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 1.2 Install Development Tools
```bash
# Install Node.js (v20 LTS)
brew install node@20

# Install Git
brew install git

# Install Azure CLI
brew install azure-cli

# Install VS Code
brew install --cask visual-studio-code

# Install Docker Desktop (for later)
brew install --cask docker
```

### 1.3 Verify Installations
```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
git --version   # Should show 2.x.x
az --version    # Should show 2.x.x
```

## 💻 Step 2: VS Code Configuration

### 2.1 Essential Extensions

Open VS Code and install these extensions:

1. **Azure Tools** (Microsoft)
   - Includes Azure App Service, Functions, etc.
   
2. **Azure Account** (Microsoft)
   - For Azure sign-in

3. **Bot Framework Emulator** (Microsoft)
   - Local bot testing

4. **TypeScript and JavaScript** (Microsoft)
   - Better IntelliSense

5. **Prettier** (Prettier)
   - Code formatting

6. **ESLint** (Microsoft)
   - Code linting

7. **GitLens** (GitKraken)
   - Git superpowers

### 2.2 VS Code Settings

Create `.vscode/settings.json` in your project root:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.updateImportsOnFileMove.enabled": "always",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "azure.tenant": "YOUR_TENANT_ID"
}
```

## 🔐 Step 3: Azure Setup

### 3.1 Login to Azure
```bash
# Login to Azure
az login

# Set your subscription (if you have multiple)
az account list --output table
az account set --subscription "YOUR_SUBSCRIPTION_NAME"
```

### 3.2 Create Resource Group
```bash
# Create resource group in UK South
az group create \
  --name rg-askeve-assist-dev \
  --location uksouth
```

### 3.3 Create Service Principal (for CI/CD)
```bash
az ad sp create-for-rbac \
  --name "ask-eve-assist-sp" \
  --role contributor \
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-askeve-assist-dev \
  --sdk-auth > azure-credentials.json

# IMPORTANT: Save this file securely and add to .gitignore!
```

## 🏗️ Step 4: Project Setup

### 4.1 Create Project Structure
```bash
# Create project directory
mkdir ask-eve-assist
cd ask-eve-assist

# Initialize git
git init

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*

# Build outputs
dist/
build/
*.js
*.js.map

# Environment
.env
.env.local
.env.development
.env.production
azure-credentials.json

# IDE
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Test coverage
coverage/
.nyc_output/
EOF
```

### 4.2 Initialize Node.js Project
```bash
# Initialize package.json
npm init -y

# Install core dependencies
npm install \
  @microsoft/botbuilder \
  @microsoft/botframework-connector \
  @azure/search-documents \
  @azure/identity \
  @azure/storage-blob \
  @azure/cosmos \
  applicationinsights \
  dotenv \
  express \
  typescript

# Install dev dependencies
npm install -D \
  @types/node \
  @types/express \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint \
  prettier \
  jest \
  @types/jest \
  ts-jest \
  nodemon \
  ts-node
```

### 4.3 TypeScript Configuration

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowJs": true,
    "sourceMap": true,
    "declaration": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## 🤖 Step 5: Bot Framework Setup

### 5.1 Install Bot Framework Emulator
```bash
# Download from: https://github.com/Microsoft/BotFramework-Emulator/releases
# Or use brew:
brew install --cask botframework-emulator
```

### 5.2 Create Bot Registration in Azure
```bash
# Create bot identity
az bot create \
  --resource-group rg-askeve-assist-dev \
  --name ask-eve-assist-bot \
  --kind registration \
  --location global \
  --sku F0 \
  --appid YOUR_APP_ID \
  --password YOUR_APP_PASSWORD

# Note: Save the appid and password securely!
```

## 🌍 Step 6: Environment Configuration

### 6.1 Create Environment Files

Create `.env.development`:
```bash
# Bot Configuration
BOT_ID=YOUR_BOT_ID
BOT_PASSWORD=YOUR_BOT_PASSWORD

# Azure Configuration
AZURE_TENANT_ID=YOUR_TENANT_ID
AZURE_SUBSCRIPTION_ID=YOUR_SUBSCRIPTION_ID

# Azure AI Search
SEARCH_ENDPOINT=https://YOUR_SEARCH.search.windows.net
SEARCH_API_KEY=YOUR_SEARCH_KEY
SEARCH_INDEX_NAME=askeve-content

# Azure OpenAI
OPENAI_ENDPOINT=https://YOUR_OPENAI.openai.azure.com
OPENAI_API_KEY=YOUR_OPENAI_KEY
OPENAI_DEPLOYMENT=gpt-4

# Storage
STORAGE_CONNECTION_STRING=YOUR_STORAGE_CONNECTION

# Application Insights
APPINSIGHTS_INSTRUMENTATIONKEY=YOUR_KEY

# Environment
NODE_ENV=development
PORT=3978
```

## 🏃 Step 7: Development Scripts

Update `package.json` scripts:
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts",
    "emulator": "open -a 'Bot Framework Emulator'",
    "tunnel": "ngrok http 3978"
  }
}
```

## 🔧 Step 8: VS Code Debug Configuration

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Bot",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "tsc: build - tsconfig.json",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

## 🚀 Step 9: Quick Start Bot Template

Create `src/index.ts`:
```typescript
import * as dotenv from 'dotenv';
import * as express from 'express';
import { 
  BotFrameworkAdapter, 
  TurnContext, 
  ActivityHandler 
} from '@microsoft/botbuilder';

// Load environment variables
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

// Create Express server
const app = express();
const PORT = process.env.PORT || 3978;

// Create adapter
const adapter = new BotFrameworkAdapter({
  appId: process.env.BOT_ID,
  appPassword: process.env.BOT_PASSWORD
});

// Error handler
adapter.onTurnError = async (context: TurnContext, error: Error) => {
  console.error(`\n [onTurnError] unhandled error: ${error}`);
  await context.sendActivity('Oops. Something went wrong!');
};

// Create the main dialog
class AskEveBot extends ActivityHandler {
  constructor() {
    super();
    
    this.onMessage(async (context: TurnContext, next) => {
      // Bot disclosure
      if (context.activity.text?.toLowerCase().includes('hello')) {
        await context.sendActivity(
          "Hello, I'm Ask Eve Assist - a digital assistant here to help you find information about gynaecological health. " +
          "I'm not a medical professional or nurse, but I can help you access trusted information from The Eve Appeal."
        );
      } else {
        await context.sendActivity(`You said: ${context.activity.text}`);
      }
      
      await next();
    });
  }
}

// Create bot instance
const bot = new AskEveBot();

// Listen for incoming requests
app.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, async (context) => {
    await bot.run(context);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Ask Eve Assist bot is running on port ${PORT}`);
  console.log(`💬 Test with Bot Framework Emulator: http://localhost:${PORT}/api/messages`);
});
```

## 🧪 Step 10: Test Your Setup

### 10.1 Start the Bot
```bash
npm run dev
```

### 10.2 Open Bot Framework Emulator
1. Click "Open Bot"
2. Enter URL: `http://localhost:3978/api/messages`
3. Leave App ID and Password empty for local testing
4. Click "Connect"
5. Type "hello" and see the bot disclosure

## 📚 Helpful Resources

### Documentation
- [Bot Framework SDK](https://docs.microsoft.com/en-us/azure/bot-service/)
- [Azure AI Search](https://docs.microsoft.com/en-us/azure/search/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Debugging Tips
- Use `console.log` liberally during development
- Bot Framework Emulator shows full message JSON
- VS Code debugger works great with TypeScript
- Check Application Insights for production issues

## 🎉 You're Ready!

Your development environment is now set up. Next steps:
1. Implement the RAG pipeline
2. Add escalation logic
3. Integrate with Teams
4. Deploy to Azure

## 🚨 Common Issues & Fixes

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Bot not responding in emulator
- Check console for errors
- Verify PORT matches in code and emulator
- Ensure BOT_ID and BOT_PASSWORD are set correctly

### Azure CLI issues
```bash
az logout
az login --use-device-code
```

### TypeScript compilation errors
```bash
npx tsc --noEmit  # Check for errors without building
```

---

**Need help?** The quickest way is usually to check the error message carefully - TypeScript and Azure are pretty good at telling you what's wrong!