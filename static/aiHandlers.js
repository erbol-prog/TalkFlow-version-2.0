import { showToast } from './chat.js';

// AI button handlers and functionality

// Function to make API calls to AI endpoints
async function callAIEndpoint(endpoint, text) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/ai/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error(`AI request failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result;
    } catch (error) {
        console.error(`Error calling AI endpoint ${endpoint}:`, error);
        showToast(`AI Error: ${error.message}`, "error");
        return null;
    }
}

// Function to update message input with AI result
function updateMessageInput(result) {
    if (!result) return;
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.value = result;
        messageInput.focus();
    }
}

// Function to enable/disable AI buttons based on input
function updateAIButtonsState() {
    const messageInput = document.getElementById('message-input');
    const fixGrammarBtn = document.getElementById('fix-grammar-btn');
    const completeSentenceBtn = document.getElementById('complete-sentence-btn');
    const translateBtn = document.getElementById('translate-btn');

    const hasText = messageInput && messageInput.value.trim().length > 0;
    
    if (fixGrammarBtn) fixGrammarBtn.disabled = !hasText;
    if (completeSentenceBtn) completeSentenceBtn.disabled = !hasText;
    if (translateBtn) translateBtn.disabled = !hasText;
}

// Initialize AI button handlers
function setupAIButtons() {
    const messageInput = document.getElementById('message-input');
    const fixGrammarBtn = document.getElementById('fix-grammar-btn');
    const completeSentenceBtn = document.getElementById('complete-sentence-btn');
    const translateBtn = document.getElementById('translate-btn');

    // Update button states when input changes
    if (messageInput) {
        messageInput.addEventListener('input', updateAIButtonsState);
    }

    // Fix Grammar button handler
    if (fixGrammarBtn) {
        fixGrammarBtn.addEventListener('click', async () => {
            const text = messageInput.value.trim();
            if (!text) return;
            
            fixGrammarBtn.disabled = true;
            const result = await callAIEndpoint('fix-grammar', text);
            fixGrammarBtn.disabled = false;
            
            if (result) {
                updateMessageInput(result);
            }
        });
    }

    // Complete Sentence button handler
    if (completeSentenceBtn) {
        completeSentenceBtn.addEventListener('click', async () => {
            const text = messageInput.value.trim();
            if (!text) return;
            
            completeSentenceBtn.disabled = true;
            const result = await callAIEndpoint('complete-sentence', text);
            completeSentenceBtn.disabled = false;
            
            if (result) {
                updateMessageInput(result);
            }
        });
    }

    // Translate button handler
    if (translateBtn) {
        translateBtn.addEventListener('click', async () => {
            const text = messageInput.value.trim();
            if (!text) return;
            
            translateBtn.disabled = true;
            const result = await callAIEndpoint('translate', text);
            translateBtn.disabled = false;
            
            if (result) {
                updateMessageInput(result);
            }
        });
    }

    // Initial button state update
    updateAIButtonsState();
}

// Export the setup function
export { setupAIButtons }; 