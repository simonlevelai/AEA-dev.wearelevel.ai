/**
 * Ask Eve Assist - Drop-In Chat Widget for The Eve Appeal
 * Version: 1.0.0
 * 
 * Usage: <script src="https://cdn.eveappeal.org.uk/ask-eve-assist/widget.js" data-api-url="YOUR_API_URL"></script>
 */

(function() {
    'use strict';
    
    // Get configuration from script tag data attributes
    const scriptTag = document.currentScript || document.querySelector('script[src*="ask-eve-widget"]');
    const config = {
        apiUrl: scriptTag?.getAttribute('data-api-url') || 'https://api.eveappeal.org.uk/chat',
        brandColor: scriptTag?.getAttribute('data-brand-color') || '#d63384',
        position: scriptTag?.getAttribute('data-position') || 'bottom-right',
        welcomeMessage: scriptTag?.getAttribute('data-welcome-message') || 'Hello! I\'m Ask Eve Assist. How can I help you with gynaecological health information today?',
        crisisPhone: scriptTag?.getAttribute('data-crisis-phone') || '0808 802 0019',
        nurseLine: scriptTag?.getAttribute('data-nurse-line') || '0808 802 0019',
        title: scriptTag?.getAttribute('data-title') || 'Ask Eve Assist',
        subtitle: scriptTag?.getAttribute('data-subtitle') || 'AI-Powered Health Support'
    };

    // Prevent multiple widget instances
    if (window.askEveWidget) {
        console.warn('Ask Eve Widget already loaded');
        return;
    }

    // Widget styles with The Eve Appeal branding
    const styles = `
        #ask-eve-widget {
            position: fixed;
            ${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
            ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        
        #ask-eve-button {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${config.brandColor} 0%, #b52759 100%);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(214, 51, 132, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        
        #ask-eve-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.6s;
        }
        
        #ask-eve-button:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 25px rgba(214, 51, 132, 0.4);
        }
        
        #ask-eve-button:hover::before {
            left: 100%;
        }
        
        #ask-eve-chat {
            position: absolute;
            ${config.position.includes('bottom') ? 'bottom: 80px;' : 'top: 80px;'}
            ${config.position.includes('right') ? 'right: 0;' : 'left: 0;'}
            width: 380px;
            height: 550px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.2);
            display: none;
            flex-direction: column;
            border: 1px solid rgba(214, 51, 132, 0.1);
            overflow: hidden;
            animation: slideUp 0.3s ease-out;
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        #ask-eve-header {
            background: linear-gradient(135deg, ${config.brandColor} 0%, #b52759 100%);
            color: white;
            padding: 20px;
            text-align: center;
            position: relative;
        }
        
        #ask-eve-header h3 {
            margin: 0 0 4px 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        #ask-eve-header p {
            margin: 0;
            font-size: 12px;
            opacity: 0.9;
        }
        
        #ask-eve-close {
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        
        #ask-eve-close:hover {
            background: rgba(255,255,255,0.3);
        }
        
        #ask-eve-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #fafbfc;
            scroll-behavior: smooth;
        }
        
        #ask-eve-messages::-webkit-scrollbar {
            width: 4px;
        }
        
        #ask-eve-messages::-webkit-scrollbar-track {
            background: transparent;
        }
        
        #ask-eve-messages::-webkit-scrollbar-thumb {
            background: rgba(214, 51, 132, 0.3);
            border-radius: 2px;
        }
        
        #ask-eve-input-container {
            padding: 20px;
            background: white;
            border-top: 1px solid #e9ecef;
            display: flex;
            gap: 12px;
            align-items: end;
        }
        
        #ask-eve-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e9ecef;
            border-radius: 24px;
            outline: none;
            font-size: 14px;
            resize: none;
            min-height: 20px;
            max-height: 100px;
            transition: border-color 0.2s;
        }
        
        #ask-eve-input:focus {
            border-color: ${config.brandColor};
        }
        
        #ask-eve-send {
            padding: 12px 20px;
            background: ${config.brandColor};
            color: white;
            border: none;
            border-radius: 24px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            white-space: nowrap;
        }
        
        #ask-eve-send:hover {
            background: #b52759;
            transform: translateY(-1px);
        }
        
        #ask-eve-send:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }
        
        .ask-eve-message {
            margin-bottom: 16px;
            animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .ask-eve-message-content {
            padding: 12px 16px;
            border-radius: 16px;
            max-width: 85%;
            word-wrap: break-word;
            line-height: 1.4;
            font-size: 14px;
        }
        
        .ask-eve-user .ask-eve-message-content {
            background: ${config.brandColor};
            color: white;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        
        .ask-eve-agent .ask-eve-message-content {
            background: white;
            border: 1px solid #e9ecef;
            border-bottom-left-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        
        .ask-eve-agent-name {
            font-size: 11px;
            color: ${config.brandColor};
            font-weight: 600;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .ask-eve-crisis .ask-eve-message-content {
            background: #dc3545 !important;
            color: white !important;
            border: none !important;
            box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
        }
        
        .ask-eve-actions {
            margin-top: 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .ask-eve-action-btn {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            padding: 6px 12px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            color: #495057;
        }
        
        .ask-eve-action-btn:hover {
            background: ${config.brandColor};
            color: white;
            border-color: ${config.brandColor};
            transform: translateY(-1px);
        }
        
        .ask-eve-response-info {
            font-size: 10px;
            color: #6c757d;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .ask-eve-typing {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #6c757d;
            font-style: italic;
        }
        
        .ask-eve-typing-dots {
            display: flex;
            gap: 2px;
        }
        
        .ask-eve-typing-dot {
            width: 4px;
            height: 4px;
            background: #6c757d;
            border-radius: 50%;
            animation: typingDot 1.4s infinite ease-in-out;
        }
        
        .ask-eve-typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .ask-eve-typing-dot:nth-child(2) { animation-delay: -0.16s; }
        .ask-eve-typing-dot:nth-child(3) { animation-delay: 0s; }
        
        @keyframes typingDot {
            0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
        }
        
        @media (max-width: 768px) {
            #ask-eve-chat {
                width: calc(100vw - 40px);
                height: 70vh;
                ${config.position.includes('bottom') ? 'bottom: 80px;' : 'top: 80px;'}
                left: 20px !important;
                right: 20px !important;
            }
            
            #ask-eve-widget {
                bottom: 20px !important;
                right: 20px !important;
                left: auto !important;
                top: auto !important;
            }
        }
        
        @media (max-width: 480px) {
            #ask-eve-chat {
                width: calc(100vw - 20px);
                height: 80vh;
                left: 10px !important;
                right: 10px !important;
                border-radius: 12px;
            }
            
            #ask-eve-widget {
                bottom: 15px !important;
                right: 15px !important;
            }
        }
    `;

    // Inject styles
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    // Create widget HTML
    const widgetHTML = `
        <div id="ask-eve-widget">
            <button id="ask-eve-button" onclick="askEveWidget.toggle()" aria-label="Open Ask Eve Assist Chat">
                🌺
            </button>
            <div id="ask-eve-chat">
                <div id="ask-eve-header">
                    <button id="ask-eve-close" onclick="askEveWidget.close()" aria-label="Close chat">×</button>
                    <h3>🌺 ${config.title}</h3>
                    <p>${config.subtitle}</p>
                </div>
                <div id="ask-eve-messages"></div>
                <div id="ask-eve-input-container">
                    <textarea id="ask-eve-input" placeholder="Type your message..." rows="1" onkeypress="askEveWidget.handleKeyPress(event)" oninput="askEveWidget.autoResize(this)"></textarea>
                    <button id="ask-eve-send" onclick="askEveWidget.send()">Send</button>
                </div>
            </div>
        </div>
    `;

    // Add widget to page when DOM is ready
    function initWidget() {
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        
        // Initialize widget functionality
        window.askEveWidget = {
            conversationId: 'widget-' + Date.now() + '-' + Math.random().toString(36).substring(2),
            isOpen: false,
            isTyping: false,

            toggle: function() {
                if (this.isOpen) {
                    this.close();
                } else {
                    this.open();
                }
            },

            open: function() {
                const chat = document.getElementById('ask-eve-chat');
                const button = document.getElementById('ask-eve-button');
                
                chat.style.display = 'flex';
                button.innerHTML = '✕';
                this.isOpen = true;
                
                // Show welcome message if first time
                const messages = document.getElementById('ask-eve-messages');
                if (messages.children.length === 0) {
                    this.addMessage(config.welcomeMessage, false, 'Ask Eve Assist');
                    
                    // Add some helpful quick actions
                    const quickActions = [
                        'Tell me about ovarian cancer symptoms',
                        'I need to speak with a nurse',
                        'Information about cervical screening',
                        'I need crisis support'
                    ];
                    
                    setTimeout(() => {
                        this.addMessage('Here are some ways I can help you:', false, 'Ask Eve Assist', {
                            suggestedActions: quickActions
                        });
                    }, 1000);
                }
                
                // Focus input
                setTimeout(() => {
                    document.getElementById('ask-eve-input').focus();
                }, 100);
            },

            close: function() {
                const chat = document.getElementById('ask-eve-chat');
                const button = document.getElementById('ask-eve-button');
                
                chat.style.display = 'none';
                button.innerHTML = '🌺';
                this.isOpen = false;
            },

            handleKeyPress: function(event) {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    this.send();
                }
            },

            autoResize: function(textarea) {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
            },

            send: async function() {
                const input = document.getElementById('ask-eve-input');
                const sendButton = document.getElementById('ask-eve-send');
                const message = input.value.trim();
                
                if (!message || this.isTyping) return;
                
                // Add user message
                this.addMessage(message, true);
                input.value = '';
                input.style.height = 'auto';
                
                // Disable input during processing
                this.isTyping = true;
                input.disabled = true;
                sendButton.disabled = true;
                
                // Show typing indicator
                const typingId = this.addTypingIndicator();
                
                try {
                    const response = await fetch(config.apiUrl, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Widget-Version': '1.0.0',
                            'X-Widget-Source': 'eve-appeal-website'
                        },
                        body: JSON.stringify({
                            message: message,
                            conversationId: this.conversationId,
                            userId: 'website-visitor-' + this.conversationId,
                            source: 'widget',
                            website: window.location.hostname
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    
                    const data = await response.json();
                    
                    // Remove typing indicator
                    this.removeTypingIndicator(typingId);
                    
                    if (data.success) {
                        // Add agent response with data
                        this.addMessage(data.response, false, data.agentUsed, data);
                        
                        // Track analytics
                        this.trackEvent('message_received', {
                            agentUsed: data.agentUsed,
                            responseTime: data.responseTime,
                            isCrisis: data.isCrisis
                        });
                    } else {
                        this.addMessage(
                            `I apologize, but I'm having technical difficulties. Please contact The Eve Appeal directly:\n\n📞 **${config.nurseLine}** - Nurse line\n📞 **999** - Emergency services\n\nOur team is here to help you.`,
                            false, 
                            'System'
                        );
                    }
                } catch (error) {
                    console.error('Ask Eve Widget Error:', error);
                    this.removeTypingIndicator(typingId);
                    
                    this.addMessage(
                        `I'm unable to connect right now. Please try again in a moment, or contact The Eve Appeal directly:\n\n📞 **${config.nurseLine}** - For health support\n📞 **999** - For emergencies\n\nWe're here to help you.`,
                        false,
                        'System'
                    );
                    
                    this.trackEvent('connection_error', { error: error.message });
                } finally {
                    // Re-enable input
                    this.isTyping = false;
                    input.disabled = false;
                    sendButton.disabled = false;
                    input.focus();
                }
            },

            addMessage: function(text, isUser, agentName, responseData) {
                const messages = document.getElementById('ask-eve-messages');
                const messageElement = document.createElement('div');
                const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2);
                
                messageElement.id = messageId;
                messageElement.className = 'ask-eve-message ' + (isUser ? 'ask-eve-user' : 'ask-eve-agent');
                
                if (responseData && responseData.isCrisis) {
                    messageElement.classList.add('ask-eve-crisis');
                }
                
                let content = '<div class="ask-eve-message-content">';
                
                if (!isUser && agentName) {
                    content += '<div class="ask-eve-agent-name">🤖 ' + agentName + '</div>';
                }
                
                // Format text with basic markdown support
                const formattedText = text
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');
                
                content += formattedText;
                content += '</div>';
                
                // Add suggested actions
                if (responseData && responseData.suggestedActions && responseData.suggestedActions.length > 0) {
                    content += '<div class="ask-eve-actions">';
                    responseData.suggestedActions.forEach(action => {
                        content += '<button class="ask-eve-action-btn" onclick="askEveWidget.sendSuggested(\\''+action.replace(/'/g, "\\'")+'\\')">' + action + '</button>';
                    });
                    content += '</div>';
                }
                
                // Add response info for agent messages
                if (responseData && !isUser) {
                    content += '<div class="ask-eve-response-info">';
                    content += '<span>Response: ' + responseData.responseTime + 'ms</span>';
                    if (responseData.emergencyContacts) {
                        content += '<span>🚨 Emergency contacts included</span>';
                    }
                    content += '</div>';
                }
                
                messageElement.innerHTML = content;
                messages.appendChild(messageElement);
                
                // Smooth scroll to bottom
                setTimeout(() => {
                    messages.scrollTop = messages.scrollHeight;
                }, 50);
                
                return messageId;
            },

            addTypingIndicator: function() {
                const messages = document.getElementById('ask-eve-messages');
                const typingElement = document.createElement('div');
                const typingId = 'typing-' + Date.now();
                
                typingElement.id = typingId;
                typingElement.className = 'ask-eve-message ask-eve-agent';
                typingElement.innerHTML = `
                    <div class="ask-eve-message-content">
                        <div class="ask-eve-agent-name">🤖 Ask Eve Assist</div>
                        <div class="ask-eve-typing">
                            <span>Thinking</span>
                            <div class="ask-eve-typing-dots">
                                <div class="ask-eve-typing-dot"></div>
                                <div class="ask-eve-typing-dot"></div>
                                <div class="ask-eve-typing-dot"></div>
                            </div>
                        </div>
                    </div>
                `;
                
                messages.appendChild(typingElement);
                messages.scrollTop = messages.scrollHeight;
                
                return typingId;
            },

            removeTypingIndicator: function(typingId) {
                const typingElement = document.getElementById(typingId);
                if (typingElement) {
                    typingElement.remove();
                }
            },

            sendSuggested: function(message) {
                document.getElementById('ask-eve-input').value = message;
                this.send();
            },

            // Simple analytics tracking (can be extended)
            trackEvent: function(eventName, data) {
                if (typeof gtag !== 'undefined') {
                    gtag('event', eventName, {
                        custom_parameter_widget: 'ask-eve-assist',
                        ...data
                    });
                }
                
                // Can also send to other analytics platforms
                console.log('Ask Eve Analytics:', eventName, data);
            }
        };
        
        // Track widget load
        window.askEveWidget.trackEvent('widget_loaded', {
            url: window.location.href,
            referrer: document.referrer
        });
        
        console.log('✅ Ask Eve Assist widget loaded successfully');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }

    // Expose widget for external control
    window.askEve = {
        open: function() { window.askEveWidget?.open(); },
        close: function() { window.askEveWidget?.close(); },
        toggle: function() { window.askEveWidget?.toggle(); },
        sendMessage: function(message) {
            if (window.askEveWidget) {
                document.getElementById('ask-eve-input').value = message;
                window.askEveWidget.send();
            }
        }
    };

})();