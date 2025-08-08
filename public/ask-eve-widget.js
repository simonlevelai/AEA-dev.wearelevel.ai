/**
 * Ask Eve Assist Widget v1.0.0
 * Easy embedding widget for The Eve Appeal website
 * Usage: <script src="ask-eve-widget.js" data-api-url="http://localhost:3002"></script>
 */

(function() {
  'use strict';
  
  // Configuration
  const script = document.currentScript || document.querySelector('script[src*="ask-eve-widget.js"]');
  const config = {
    apiUrl: script.getAttribute('data-api-url') || 'https://askeve-container-app.calmdesert-7b431664.uksouth.azurecontainerapps.io',
    themeColor: script.getAttribute('data-theme') || '#d63384', // Eve Appeal pink
    position: script.getAttribute('data-position') || 'bottom-right'
  };
  
  let conversationId = null;
  let isOpen = false;
  
  // Widget HTML template
  const widgetHTML = `
    <div id="ask-eve-widget" class="ask-eve-widget">
      <div id="ask-eve-button" class="ask-eve-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM6 9H18V11H6V9ZM14 14H6V12H14V14ZM18 8H6V6H18V8Z" fill="white"/>
        </svg>
        <span>Ask Eve</span>
      </div>
      
      <div id="ask-eve-chat" class="ask-eve-chat" style="display: none;">
        <div class="ask-eve-header">
          <div class="ask-eve-title">
            <h3>Ask Eve Assist</h3>
            <p>Trusted gynaecological health information</p>
          </div>
          <button id="ask-eve-close" class="ask-eve-close" aria-label="Close chat">×</button>
        </div>
        
        <div id="ask-eve-messages" class="ask-eve-messages">
          <div class="ask-eve-message ask-eve-bot-message">
            <div class="ask-eve-avatar">🌸</div>
            <div class="ask-eve-text">
              <p>Hello! I'm Ask Eve Assist, here to provide trusted gynaecological health information from The Eve Appeal.</p>
              <p><strong>I provide information only - not medical advice. Always consult your GP for medical concerns.</strong></p>
              <p>How can I help you today?</p>
            </div>
          </div>
        </div>
        
        <div class="ask-eve-input-area">
          <input 
            type="text" 
            id="ask-eve-input" 
            placeholder="Type your message..."
            maxlength="500"
            aria-label="Type your message"
          >
          <button id="ask-eve-send" class="ask-eve-send-btn" aria-label="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="white"/>
            </svg>
          </button>
        </div>
        
        <div class="ask-eve-disclaimer">
          <small>
            Information from <a href="https://eveappeal.org.uk" target="_blank" rel="noopener">The Eve Appeal</a> - the UK's gynaecological cancer charity
          </small>
        </div>
      </div>
    </div>
  `;
  
  // Widget CSS styles - Fixed template literal evaluation
  const verticalPosition = config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;';
  const horizontalPosition = config.position.includes('right') ? 'right: 20px;' : 'left: 20px;';
  const themeColor = config.themeColor;
  
  const widgetCSS = `
    .ask-eve-widget {
      position: fixed;
      ${verticalPosition}
      ${horizontalPosition}
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      z-index: 999999;
      direction: ltr;
    }
    
    .ask-eve-button {
      background: ${themeColor};
      color: white;
      padding: 16px 20px;
      border-radius: 30px;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(214, 51, 132, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.3s ease;
      user-select: none;
    }
    
    .ask-eve-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(214, 51, 132, 0.5);
    }
    
    .ask-eve-chat {
      width: 380px;
      height: 600px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      margin-bottom: 15px;
      border: 1px solid #e1e5e9;
      overflow: hidden;
    }
    
    .ask-eve-header {
      background: ${themeColor};
      color: white;
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    .ask-eve-title h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    
    .ask-eve-title p {
      margin: 4px 0 0 0;
      font-size: 13px;
      opacity: 0.9;
    }
    
    .ask-eve-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }
    
    .ask-eve-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .ask-eve-messages {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #d1d5db transparent;
    }
    
    .ask-eve-messages::-webkit-scrollbar {
      width: 6px;
    }
    
    .ask-eve-messages::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .ask-eve-messages::-webkit-scrollbar-thumb {
      background-color: #d1d5db;
      border-radius: 3px;
    }
    
    .ask-eve-message {
      margin-bottom: 20px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    
    .ask-eve-user-message {
      flex-direction: row-reverse;
    }
    
    .ask-eve-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    
    .ask-eve-bot-message .ask-eve-avatar {
      background: ${themeColor};
      color: white;
    }
    
    .ask-eve-user-message .ask-eve-avatar {
      background: #f3f4f6;
      color: #6b7280;
    }
    
    .ask-eve-text {
      max-width: 280px;
      word-wrap: break-word;
    }
    
    .ask-eve-bot-message .ask-eve-text {
      background: #f8f9fa;
      padding: 12px 16px;
      border-radius: 16px 16px 16px 4px;
      border-left: 3px solid ${themeColor};
    }
    
    .ask-eve-user-message .ask-eve-text {
      background: ${themeColor};
      color: white;
      padding: 12px 16px;
      border-radius: 16px 16px 4px 16px;
    }
    
    .ask-eve-text p {
      margin: 0 0 8px 0;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .ask-eve-text p:last-child {
      margin-bottom: 0;
    }
    
    .ask-eve-crisis {
      border-left: 4px solid #dc3545 !important;
      background: #fff5f5 !important;
    }
    
    .ask-eve-input-area {
      padding: 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 12px;
      align-items: center;
    }
    
    #ask-eve-input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    
    #ask-eve-input:focus {
      border-color: ${themeColor};
    }
    
    .ask-eve-send-btn {
      background: ${themeColor};
      color: white;
      border: none;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    
    .ask-eve-send-btn:hover {
      background: #c12d5f;
      transform: scale(1.05);
    }
    
    .ask-eve-send-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
      transform: none;
    }
    
    .ask-eve-disclaimer {
      padding: 12px 20px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      text-align: center;
    }
    
    .ask-eve-disclaimer small {
      color: #6b7280;
      font-size: 12px;
    }
    
    .ask-eve-disclaimer a {
      color: ${themeColor};
      text-decoration: none;
    }
    
    .ask-eve-disclaimer a:hover {
      text-decoration: underline;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 480px) {
      .ask-eve-chat {
        width: calc(100vw - 40px);
        height: calc(100vh - 40px);
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        bottom: 20px;
        margin: 0;
      }
      
      .ask-eve-widget {
        left: 20px !important;
        right: 20px !important;
      }
      
      .ask-eve-button {
        width: calc(100vw - 40px);
        justify-content: center;
      }
    }
    
    /* Loading animation */
    .ask-eve-loading {
      display: flex;
      gap: 4px;
      padding: 8px 0;
    }
    
    .ask-eve-loading-dot {
      width: 8px;
      height: 8px;
      background: ${themeColor};
      border-radius: 50%;
      opacity: 0.4;
      animation: askEveLoading 1.4s infinite ease-in-out both;
    }
    
    .ask-eve-loading-dot:nth-child(1) { animation-delay: -0.32s; }
    .ask-eve-loading-dot:nth-child(2) { animation-delay: -0.16s; }
    .ask-eve-loading-dot:nth-child(3) { animation-delay: 0; }
    
    @keyframes askEveLoading {
      0%, 80%, 100% { 
        transform: scale(0);
        opacity: 0.4;
      } 
      40% { 
        transform: scale(1);
        opacity: 1;
      }
    }
  `;
  
  // Initialize widget
  function initWidget() {
    try {
      console.log('Ask Eve Widget: Adding CSS styles');
      console.log('Ask Eve Widget: CSS preview:', widgetCSS.substring(0, 200) + '...');
      
      // Add CSS
      const styleSheet = document.createElement('style');
      styleSheet.textContent = widgetCSS;
      document.head.appendChild(styleSheet);
      
      console.log('Ask Eve Widget: Adding HTML to body');
      
      // Add HTML
      const widgetContainer = document.createElement('div');
      widgetContainer.innerHTML = widgetHTML;
      document.body.appendChild(widgetContainer);
      
      console.log('Ask Eve Widget: Widget HTML added, checking elements');
      
      // Verify elements were created
      const widget = document.getElementById('ask-eve-widget');
      const button = document.getElementById('ask-eve-button');
      
      if (widget && button) {
        console.log('Ask Eve Widget: Elements created successfully');
        console.log('Ask Eve Widget: Button computed styles:', getComputedStyle(button).position, getComputedStyle(button).bottom, getComputedStyle(button).right);
        // Attach event listeners
        attachEventListeners();
        console.log('Ask Eve Widget: Initialization complete!');
      } else {
        console.error('Ask Eve Widget: Failed to create elements', { widget: !!widget, button: !!button });
      }
      
    } catch (error) {
      console.error('Ask Eve Widget: Error in initWidget:', error);
    }
  }
  
  function attachEventListeners() {
    const button = document.getElementById('ask-eve-button');
    const chat = document.getElementById('ask-eve-chat');
    const close = document.getElementById('ask-eve-close');
    const input = document.getElementById('ask-eve-input');
    const send = document.getElementById('ask-eve-send');
    
    button.addEventListener('click', toggleChat);
    close.addEventListener('click', closeChat);
    send.addEventListener('click', sendMessage);
    
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    // Focus input when chat opens
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'style') {
          const chat = mutation.target;
          if (chat.style.display !== 'none' && isOpen) {
            setTimeout(() => input.focus(), 100);
          }
        }
      });
    });
    
    observer.observe(chat, { attributes: true });
  }
  
  function toggleChat() {
    const chat = document.getElementById('ask-eve-chat');
    isOpen = !isOpen;
    chat.style.display = isOpen ? 'flex' : 'none';
  }
  
  function closeChat() {
    const chat = document.getElementById('ask-eve-chat');
    isOpen = false;
    chat.style.display = 'none';
  }
  
  function sendMessage() {
    const input = document.getElementById('ask-eve-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addMessage('user', message);
    input.value = '';
    
    // Show loading indicator
    showLoading();
    
    // Send to API
    fetch(config.apiUrl + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: message,
        conversationId: conversationId 
      })
    })
    .then(response => response.json())
    .then(data => {
      hideLoading();
      
      // Store conversation ID
      if (data.conversationId) {
        conversationId = data.conversationId;
      }
      
      // Add bot response
      addMessage('bot', data.response, data.isCrisis);
      
      // Log for analytics (if needed)
      console.log('Ask Eve response:', {
        isCrisis: data.isCrisis,
        responseTime: data.responseTime
      });
    })
    .catch(error => {
      hideLoading();
      console.error('Ask Eve error:', error);
      addMessage('bot', 
        'I apologize, but I\'m experiencing technical difficulties. For immediate health support, please call NHS 111 or emergency services 999.',
        false
      );
    });
  }
  
  function addMessage(sender, text, isCrisis = false) {
    const messages = document.getElementById('ask-eve-messages');
    const messageDiv = document.createElement('div');
    
    messageDiv.className = `ask-eve-message ask-eve-${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'ask-eve-avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🌸';
    
    const textDiv = document.createElement('div');
    textDiv.className = `ask-eve-text${isCrisis ? ' ask-eve-crisis' : ''}`;
    
    // Convert newlines to paragraphs
    const paragraphs = text.split('\n').filter(p => p.trim());
    paragraphs.forEach(paragraph => {
      const p = document.createElement('p');
      p.textContent = paragraph;
      textDiv.appendChild(p);
    });
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(textDiv);
    messages.appendChild(messageDiv);
    
    // Scroll to bottom
    messages.scrollTop = messages.scrollHeight;
  }
  
  function showLoading() {
    const messages = document.getElementById('ask-eve-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ask-eve-message ask-eve-bot-message';
    loadingDiv.id = 'ask-eve-loading-message';
    
    loadingDiv.innerHTML = `
      <div class="ask-eve-avatar">🌸</div>
      <div class="ask-eve-text">
        <div class="ask-eve-loading">
          <div class="ask-eve-loading-dot"></div>
          <div class="ask-eve-loading-dot"></div>
          <div class="ask-eve-loading-dot"></div>
        </div>
      </div>
    `;
    
    messages.appendChild(loadingDiv);
    messages.scrollTop = messages.scrollHeight;
  }
  
  function hideLoading() {
    const loadingMessage = document.getElementById('ask-eve-loading-message');
    if (loadingMessage) {
      loadingMessage.remove();
    }
  }
  
  // Auto-initialize when DOM is ready with better error handling
  function safeInit() {
    try {
      console.log('Ask Eve Widget: Initializing...');
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          console.log('Ask Eve Widget: DOM loaded, initializing widget');
          initWidget();
        });
      } else {
        console.log('Ask Eve Widget: DOM already loaded, initializing widget immediately');
        initWidget();
      }
    } catch (error) {
      console.error('Ask Eve Widget: Initialization error:', error);
    }
  }
  
  // Add a small delay to ensure all other scripts have loaded
  if (document.readyState === 'complete') {
    safeInit();
  } else {
    window.addEventListener('load', safeInit);
  }
  
})();