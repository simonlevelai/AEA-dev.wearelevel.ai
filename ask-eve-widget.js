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
        brandColor: scriptTag?.getAttribute('data-brand-color') || '#FF4D4D', // Eve Appeal red
        silverColor: scriptTag?.getAttribute('data-silver-color') || '#DBDDED', // Eve Appeal silver
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
            font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
        }
        
        #ask-eve-button {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            background: ${config.brandColor};
            border: none;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            transition: all 0.2s ease;
            position: relative;
        }
        
        #ask-eve-button:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            filter: brightness(0.9);
        }
        
        #ask-eve-chat {
            position: absolute;
            ${config.position.includes('bottom') ? 'bottom: 90px;' : 'top: 90px;'}
            ${config.position.includes('right') ? 'right: 0;' : 'left: 0;'}
            width: 400px;
            height: 600px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            display: none;
            flex-direction: column;
            border: 1px solid ${config.silverColor};
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
            background: white;
            color: #0C0B0B;
            padding: 16px 20px;
            text-align: center;
            position: relative;
            border-bottom: 1px solid ${config.silverColor};
        }
        
        #ask-eve-header h3 {
            margin: 0 0 4px 0;
            font-size: 18px;
            font-weight: bold;
            color: #0C0B0B;
        }
        
        #ask-eve-header p {
            margin: 0;
            font-size: 12px;
            color: #0C0B0B;
        }
        
        #ask-eve-close {
            position: absolute;
            top: 12px;
            right: 12px;
            background: transparent;
            border: 1px solid ${config.silverColor};
            color: #0C0B0B;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        
        #ask-eve-close:hover {
            background: #F5F7FA;
            border-color: #0C0B0B;
        }
        
        #ask-eve-close:focus {
            outline: 2px solid ${config.brandColor};
            outline-offset: 2px;
        }
        
        #ask-eve-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: ${config.silverColor};
            scroll-behavior: smooth;
        }
        
        #ask-eve-messages::-webkit-scrollbar {
            width: 4px;
        }
        
        #ask-eve-messages::-webkit-scrollbar-track {
            background: transparent;
        }
        
        #ask-eve-messages::-webkit-scrollbar-thumb {
            background: #6E7078;
            border-radius: 2px;
        }
        
        #ask-eve-input-container {
            padding: 16px 20px;
            background: white;
            border-top: 1px solid ${config.silverColor};
            display: flex;
            gap: 12px;
            align-items: end;
        }
        
        #ask-eve-input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid ${config.silverColor};
            border-radius: 12px;
            outline: none;
            font-size: 14px;
            font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
            resize: none;
            min-height: 20px;
            max-height: 100px;
            transition: border-color 0.2s;
        }
        
        #ask-eve-input:focus {
            border-color: ${config.brandColor};
            outline: 2px solid ${config.brandColor};
            outline-offset: 2px;
        }
        
        #ask-eve-send {
            padding: 12px 20px;
            background: ${config.brandColor};
            color: white;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
            transition: all 0.2s;
            white-space: nowrap;
            min-width: 44px;
            min-height: 44px;
        }
        
        #ask-eve-send:hover {
            filter: brightness(0.9);
        }
        
        #ask-eve-send:focus {
            outline: 2px solid ${config.brandColor};
            outline-offset: 2px;
        }
        
        #ask-eve-send:disabled {
            background: #6E7078;
            cursor: not-allowed;
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
            border-radius: 12px;
            max-width: 70%;
            word-wrap: break-word;
            line-height: 1.2;
            font-size: 14px;
            font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
        }
        
        .ask-eve-user .ask-eve-message-content {
            background: #F5F7FA;
            color: #0C0B0B;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        
        .ask-eve-agent .ask-eve-message-content {
            background: white;
            color: #0C0B0B;
            border: 1px solid ${config.silverColor};
            border-bottom-left-radius: 4px;
        }
        
        .ask-eve-agent-name {
            font-size: 12px;
            color: #0C0B0B;
            font-weight: bold;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .ask-eve-crisis .ask-eve-message-content {
            background: #FFA500 !important;
            color: #0C0B0B !important;
            border: 1px solid #FF8C00 !important;
            font-weight: bold;
        }
        
        .ask-eve-actions {
            margin-top: 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .ask-eve-action-btn {
            background: white;
            border: 1px solid ${config.silverColor};
            padding: 6px 12px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 12px;
            font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
            transition: all 0.2s;
            color: #0C0B0B;
            min-height: 32px;
        }
        
        .ask-eve-action-btn:hover {
            background: ${config.brandColor};
            color: white;
            border-color: ${config.brandColor};
        }
        
        .ask-eve-action-btn:focus {
            outline: 2px solid ${config.brandColor};
            outline-offset: 2px;
        }
        
        .ask-eve-response-info {
            font-size: 12px;
            color: #6E7078;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid ${config.silverColor};
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .ask-eve-typing {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #6E7078;
            font-style: italic;
        }
        
        .ask-eve-typing-dots {
            display: flex;
            gap: 2px;
        }
        
        .ask-eve-typing-dot {
            width: 4px;
            height: 4px;
            background: #6E7078;
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
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100%;
                height: 100%;
                border-radius: 0;
                z-index: 1000000;
            }
            
            #ask-eve-widget {
                bottom: 20px !important;
                right: 20px !important;
                left: auto !important;
                top: auto !important;
            }
            
            #ask-eve-header {
                padding: 20px;
            }
            
            #ask-eve-close {
                top: 16px;
                right: 16px;
                width: 44px;
                height: 44px;
                font-size: 18px;
            }
        }
        
        @media (max-width: 480px) {
            #ask-eve-input-container {
                padding: 20px;
            }
            
            .ask-eve-message-content {
                max-width: 90%;
                font-size: 16px;
            }
            
            .ask-eve-action-btn {
                min-height: 44px;
                font-size: 14px;
                padding: 12px 16px;
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
                <svg width="24" height="24" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 26.25c-.6 0-1.15-.25-1.55-.65C10.2 22.9 3.75 17.1 3.75 11.25c0-4.15 3.35-7.5 7.5-7.5 1.95 0 3.75.75 5.1 2.1.35.35.35.9 0 1.25-.35.35-.9.35-1.25 0C14.2 6.2 12.5 5.625 11.25 5.625c-3.1 0-5.625 2.525-5.625 5.625 0 4.9 5.4 9.85 9.375 13.05 3.975-3.2 9.375-8.15 9.375-13.05 0-3.1-2.525-5.625-5.625-5.625-1.75 0-2.95.575-3.85 1.475-.35.35-.9.35-1.25 0-.35-.35-.35-.9 0-1.25C14.5 4.25 16.3 3.75 18.75 3.75c4.15 0 7.5 3.35 7.5 7.5 0 5.85-6.45 11.65-9.7 14.35-.4.4-.95.65-1.55.65z" fill="currentColor"/>
                </svg>
            </button>
            <div id="ask-eve-chat">
                <div id="ask-eve-header">
                    <button id="ask-eve-close" onclick="askEveWidget.close()" aria-label="Close chat">×</button>
                    <h3>
                        <svg width="16" height="16" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; margin-right: 8px; vertical-align: text-bottom;">
                            <path d="M15 26.25c-.6 0-1.15-.25-1.55-.65C10.2 22.9 3.75 17.1 3.75 11.25c0-4.15 3.35-7.5 7.5-7.5 1.95 0 3.75.75 5.1 2.1.35.35.35.9 0 1.25-.35.35-.9.35-1.25 0C14.2 6.2 12.5 5.625 11.25 5.625c-3.1 0-5.625 2.525-5.625 5.625 0 4.9 5.4 9.85 9.375 13.05 3.975-3.2 9.375-8.15 9.375-13.05 0-3.1-2.525-5.625-5.625-5.625-1.75 0-2.95.575-3.85 1.475-.35.35-.9.35-1.25 0-.35-.35-.35-.9 0-1.25C14.5 4.25 16.3 3.75 18.75 3.75c4.15 0 7.5 3.35 7.5 7.5 0 5.85-6.45 11.65-9.7 14.35-.4.4-.95.65-1.55.65z" fill="currentColor"/>
                        </svg>
                        ${config.title}
                    </h3>
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
                button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
                button.innerHTML = '<svg width="24" height="24" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 26.25c-.6 0-1.15-.25-1.55-.65C10.2 22.9 3.75 17.1 3.75 11.25c0-4.15 3.35-7.5 7.5-7.5 1.95 0 3.75.75 5.1 2.1.35.35.35.9 0 1.25-.35.35-.9.35-1.25 0C14.2 6.2 12.5 5.625 11.25 5.625c-3.1 0-5.625 2.525-5.625 5.625 0 4.9 5.4 9.85 9.375 13.05 3.975-3.2 9.375-8.15 9.375-13.05 0-3.1-2.525-5.625-5.625-5.625-1.75 0-2.95.575-3.85 1.475-.35.35-.9.35-1.25 0-.35-.35-.35-.9 0-1.25C14.5 4.25 16.3 3.75 18.75 3.75c4.15 0 7.5 3.35 7.5 7.5 0 5.85-6.45 11.65-9.7 14.35-.4.4-.95.65-1.55.65z" fill="currentColor"/></svg>';
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
                            'System',
                            { isEmergency: true }
                        );
                    }
                } catch (error) {
                    console.error('Ask Eve Widget Error:', error);
                    this.removeTypingIndicator(typingId);
                    
                    this.addMessage(
                        `I'm unable to connect right now. Please try again in a moment, or contact The Eve Appeal directly:\n\n📞 **${config.nurseLine}** - For health support\n📞 **999** - For emergencies\n\nWe're here to help you.`,
                        false,
                        'System',
                        { isEmergency: true }
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
                
                if (responseData && (responseData.isCrisis || responseData.isEmergency)) {
                    messageElement.classList.add('ask-eve-crisis');
                }
                
                let content = '<div class="ask-eve-message-content">';
                
                if (!isUser && agentName) {
                    content += '<div class="ask-eve-agent-name">' + agentName + '</div>';
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
                    if (responseData.responseTime) {
                        content += '<span>Response: ' + responseData.responseTime + 'ms</span>';
                    }
                    if (responseData.emergencyContacts || responseData.isEmergency || responseData.isCrisis) {
                        content += '<span style="color: #FFA500; font-weight: bold;">⚠️ Emergency contacts included</span>';
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
                        <div class="ask-eve-agent-name">Ask Eve Assist</div>
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