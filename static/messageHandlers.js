import { currentUserId } from './chat.js';
import { initializeSocket } from './socket.js';
import { showToast } from './chat.js';

// Global state
const state = {
    selectedMessage: null,
    replyingToMessage: null,
    editingMessage: null
};

// Add translation state
const translationState = {
    currentMessage: null,
    modal: null,
    originalText: null,
    languageSelect: null,
    resultDiv: null,
    closeBtn: null,
    cancelBtn: null
};

// --- Define setupMessageHandlers earlier in the file --- 
async function setupMessageHandlers() {
    console.log("[setupMessageHandlers] Running...");

    // --- Setup Edit Modal --- 
    setupEditMessageModal(); // Assuming this is defined elsewhere in the file

    // --- Setup Delete Modal --- 
    // Listeners are now attached in showDeleteConfirmation, so no separate setup needed here

    // --- Setup Double Click for Reply --- 
    setupDoubleClickForReply(); // Assuming this is defined elsewhere in the file

    // --- Setup Global Click/Key Listeners --- 
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message') && !e.target.closest('.floating-actions-menu')) {
            clearMessageSelection();
        }
    });

    document.addEventListener('keydown', (e) => {
        const replyContainer = document.getElementById('reply-container');
        if (e.key === 'Escape' && replyContainer && !replyContainer.classList.contains('hidden')) {
            hideReplyUI();
        }
        const deleteModal = document.getElementById('delete-message-modal');
        if (e.key === 'Escape' && deleteModal && !deleteModal.classList.contains('hidden')) {
            console.log("[Global Escape Listener] Closing delete modal.");
            hideDeleteConfirmation();
        }
        const editModal = document.getElementById('edit-message-modal');
        if (e.key === 'Escape' && editModal && !editModal.classList.contains('hidden')) {
            console.log("[Global Escape Listener] Closing edit modal.");
            hideEditUI();
        }
    });

    // --- Setup Socket Listeners --- 
    const socket = await initializeSocket();
    if (socket) {
        socket.on('message_edited', (data) => {
            if (!data || !data.message_id) return;

            const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
            if (messageElement) {
                const contentElement = messageElement.querySelector('.message-content');
                if (contentElement) {
                    contentElement.textContent = data.content;
                    messageElement.classList.add('highlight');
                    setTimeout(() => messageElement.classList.remove('highlight'), 1500);
                }
            }
        });
    } else {
        console.warn("[setupMessageHandlers] Socket not available yet for attaching listeners.");
    }

    console.log("[setupMessageHandlers] Finished.");
}

// --- Other function definitions (showReplyUI, hideReplyUI, etc.) ---

function showReplyUI(messageElement) {
    const messageId = messageElement.dataset.messageId;
    const messageContent = messageElement.querySelector('.message-content')?.textContent || '[deleted message]';
    const senderId = messageElement.dataset.senderId;

    selectedMessageForReply = {
        id: messageId,
        content: messageContent,
        senderId: senderId
    };

    const replyContainer = document.getElementById('reply-container');
    const replyPreview = document.getElementById('reply-preview');

    replyPreview.textContent = messageContent;
    replyContainer.classList.remove('hidden'); // Show the reply container
    document.getElementById('message-input').focus();
}

function hideReplyUI() {
    const replyContainer = document.getElementById('reply-container');

    // Clear the replying state
    state.replyingToMessage = null;
    selectedMessageForReply = null; // Also clear this if it's still used elsewhere

    // --- Explicitly add hidden class --- 
    if (replyContainer) {
        replyContainer.classList.add('hidden');
    }

    // Remove highlight from any message being replied to
    document.querySelectorAll('.message-being-replied-to').forEach(msg =>
        msg.classList.remove('message-being-replied-to'));
}

function showEditUI(messageElement) {
    const messageId = messageElement.dataset.messageId;
    const messageContent = messageElement.querySelector('.message-content')?.textContent;

    if (!messageContent || messageContent === '[Message deleted]') return;

    state.editingMessage = {
        id: messageId,
        content: messageContent
    };

    // Open the edit message modal
    const editModal = document.getElementById('edit-message-modal');
    const editTextarea = document.getElementById('edit-message-content');

    if (editModal && editTextarea) {
        editTextarea.value = messageContent;
        editModal.classList.remove('hidden');
        editTextarea.focus();
        // Put cursor at the end of text
        editTextarea.setSelectionRange(messageContent.length, messageContent.length);
    }
}

function hideEditUI() {
    const editModal = document.getElementById('edit-message-modal');
    if (editModal) {
        editModal.classList.add('hidden');
    }
    state.editingMessage = null;
}

// --- Add the missing function definition --- 
function getReplyingToMessage() {
    // This function should return the message being replied to, 
    // which is stored in the state object.
    return state.replyingToMessage;
}

function showDeleteConfirmation(messageElement) {
    const messageId = messageElement.dataset.messageId;
    const messageContent = messageElement.querySelector('.message-content')?.textContent;

    if (!messageContent || messageContent === '[Message deleted]') {
        console.warn("[showDeleteConfirmation] Attempted to delete an already deleted or invalid message.");
        return;
    }

    // Store the selected message details needed for the delete action
    state.selectedMessage = {
        id: messageId,
        content: messageContent
    };

    const deleteModal = document.getElementById('delete-message-modal');
    const deletePreview = document.getElementById('delete-message-preview');
    const closeBtn = document.getElementById('delete-modal-close');
    const cancelBtn = document.getElementById('delete-modal-cancel');
    const confirmBtn = document.getElementById('delete-modal-confirm');

    if (!deleteModal || !deletePreview || !closeBtn || !cancelBtn || !confirmBtn) {
        console.error("[showDeleteConfirmation] One or more modal elements not found!");
        return;
    }

    // --- Store message details --- 
    const messageIdToDelete = messageElement.dataset.messageId;
    const messageContentToDelete = messageElement.querySelector('.message-content')?.textContent;
    console.log(`[showDeleteConfirmation] Storing message ID for deletion: ${messageIdToDelete}`);
    // Store the ID directly in a variable accessible by the handler
    let currentMessageIdToDelete = messageIdToDelete;

    deletePreview.textContent = messageContentToDelete.length > 150
        ? messageContentToDelete.substring(0, 147) + '...'
        : messageContentToDelete;

    // --- Clear previous onclick handlers --- 
    closeBtn.onclick = null;
    cancelBtn.onclick = null;
    confirmBtn.onclick = null;
    console.log("[showDeleteConfirmation] Cleared previous handlers.");

    // --- Attach listeners directly here --- 
    closeBtn.onclick = () => {
        console.log("[Delete Modal] Close button clicked.");
        hideDeleteConfirmation();
    };
    cancelBtn.onclick = () => {
        console.log("[Delete Modal] Cancel button clicked.");
        hideDeleteConfirmation();
    };
    confirmBtn.onclick = async () => {
        console.log("[Delete Modal] Confirm button clicked.");
        // --- Use the locally scoped variable --- 
        if (!currentMessageIdToDelete) {
            console.error("[Delete Modal] No valid message ID found when confirm was clicked.");
            hideDeleteConfirmation();
            return;
        }
        console.log(`[Delete Modal] Attempting to call deleteMessage with ID: ${currentMessageIdToDelete}`);
        await deleteMessage(currentMessageIdToDelete); // Pass the ID directly
        hideDeleteConfirmation();
    };
    console.log("[showDeleteConfirmation] Attached new handlers.");

    // Show the modal
    deleteModal.classList.remove('hidden');
    console.log("[showDeleteConfirmation] Modal should be visible now.");
}

function hideDeleteConfirmation() {
    const deleteModal = document.getElementById('delete-message-modal');
    if (deleteModal) {
        console.log("[hideDeleteConfirmation] Hiding modal.");
        deleteModal.classList.add('hidden');
        // Clear handlers after hiding
        const closeBtn = document.getElementById('delete-modal-close');
        const cancelBtn = document.getElementById('delete-modal-cancel');
        const confirmBtn = document.getElementById('delete-modal-confirm');
        if (closeBtn) closeBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (confirmBtn) confirmBtn.onclick = null;
        console.log("[hideDeleteConfirmation] Cleared button onclick handlers.");
    }
}

function setupDoubleClickForReply() {
    // Use event delegation for double-click handling
    document.getElementById('message-list').addEventListener('dblclick', (e) => {
        // Find the closest message element to where the click occurred
        const messageElement = e.target.closest('.message');
        if (!messageElement) return;

        // Prevent text selection on double click
        e.preventDefault();

        // Get message details
        const messageId = parseInt(messageElement.dataset.messageId);
        const content = messageElement.querySelector('.message-content')?.textContent;
        const senderId = parseInt(messageElement.dataset.senderId);

        if (!messageId || !content) return;

        // Set up the reply UI
        setupReplyUI(messageId, content, senderId);

        // Clear any selected message to prevent UI conflicts
        clearMessageSelection();

        // Focus the input field after setting up the reply
        document.getElementById('message-input')?.focus();
    });
}

function setupReplyUI(messageId, content, senderId) {
    if (!messageId || !content) return;

    const replyContainer = document.getElementById('reply-container');
    const replyPreview = document.getElementById('reply-preview');
    const cancelReply = document.getElementById('cancel-reply');

    // Store the message we're replying to
    state.replyingToMessage = {
        id: messageId,
        content: content,
        sender_id: senderId
    };

    if (replyPreview && replyContainer) {
        // Find and highlight the original message
        const originalMessage = document.querySelector(`[data-message-id="${messageId}"]`);
        if (originalMessage) {
            // First remove highlight from any other messages
            document.querySelectorAll('.message-being-replied-to').forEach(msg =>
                msg.classList.remove('message-being-replied-to'));

            // Add highlight to the message being replied to
            originalMessage.classList.add('message-being-replied-to');

            // Scroll to make the message visible if needed
            originalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Format the preview content with sender information
        let senderName = 'Someone';
        if (senderId === currentUserId) {
            senderName = 'You';
        } else {
            // Try to find username from message element
            const usernameEl = originalMessage?.querySelector('.message-sender');
            if (usernameEl) {
                senderName = usernameEl.textContent || 'Someone';
            }
        }

        // Create enhanced preview with sender name and truncated content
        const previewContent = `${senderName}: ${content}`;

        // Set preview content with formatting
        replyPreview.innerHTML = `
            <span class="font-medium text-blue-700">${senderName}</span>
            <span class="text-gray-600">: ${content.length > 50 ? content.substring(0, 47) + '...' : content}</span>
        `;

        // Explicitly remove hidden class
        replyContainer.classList.remove('hidden');

        // Focus the message input
        document.getElementById('message-input')?.focus();
    }
}

function handleMessageClick(e, messageElement) {
    e.stopPropagation();
    if (!messageElement || !currentUserId) return;

    // Clear previous selection
    clearMessageSelection();

    // Select current message
    messageElement.classList.add('message-selected');

    state.selectedMessage = {
        id: parseInt(messageElement.dataset.messageId),
        // Ensure content is fetched correctly, even if it was previously deleted/edited
        content: messageElement.querySelector('.message-content')?.textContent || '',
        senderId: parseInt(messageElement.dataset.senderId)
    };

    // Show and position floating menu
    const actionsMenu = document.querySelector('.floating-actions-menu');
    if (!actionsMenu) return;

    const deleteBtn = actionsMenu.querySelector('.delete');
    const editBtn = actionsMenu.querySelector('.edit');
    const translateBtn = actionsMenu.querySelector('.translate');
    const isOwnMessage = state.selectedMessage.senderId === currentUserId;
    const isDeleted = messageElement.classList.contains('deleted');

    // Only show edit/delete for own, non-deleted messages
    if (editBtn) editBtn.style.display = (isOwnMessage && !isDeleted) ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = (isOwnMessage && !isDeleted) ? 'flex' : 'none';
    // Show translate button for all non-deleted messages
    if (translateBtn) translateBtn.style.display = isDeleted ? 'none' : 'flex';

    // Position the menu relative to the message
    const messageRect = messageElement.getBoundingClientRect();
    const menuRect = actionsMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let menuTop = messageRect.top;
    let menuLeft = messageRect.left - menuRect.width - 10;

    // Adjust if menu goes off-screen left
    if (menuLeft < 10) {
        menuLeft = 10;
    }

    // Adjust if menu goes off-screen bottom
    if (menuTop + menuRect.height > viewportHeight - 10) {
        menuTop = viewportHeight - menuRect.height - 10;
    }

    // Adjust if menu goes off-screen top
    if (menuTop < 10) {
        menuTop = 10;
    }

    actionsMenu.style.position = 'fixed';
    actionsMenu.style.left = `${menuLeft}px`;
    actionsMenu.style.top = `${menuTop}px`;

    // Setup button handlers
    actionsMenu.querySelector('.reply').onclick = () => {
        if (state.selectedMessage && !isDeleted) {
            setupReplyUI(
                state.selectedMessage.id,
                state.selectedMessage.content,
                state.selectedMessage.senderId
            );
        }
        clearMessageSelection();
    };

    if (translateBtn) {
        translateBtn.onclick = () => {
            if (state.selectedMessage && !isDeleted) {
                showTranslationModal(messageElement);
            }
            clearMessageSelection();
        };
    }

    if (editBtn) {
        editBtn.onclick = () => {
            if (state.selectedMessage && isOwnMessage && !isDeleted) {
                showEditUI(messageElement);
            }
            clearMessageSelection();
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (state.selectedMessage && isOwnMessage && !isDeleted) {
                // *** Explicitly call showDeleteConfirmation ***
                showDeleteConfirmation(messageElement);
            }
            clearMessageSelection();
        };
    }

    actionsMenu.classList.remove('hidden');
}

function clearMessageSelection() {
    document.querySelectorAll('.message').forEach(msg => msg.classList.remove('selected', 'message-selected'));
    document.querySelector('.floating-actions-menu')?.classList.add('hidden');
    state.selectedMessage = null;
}

// Ensure deleteMessage does NOT use confirm()
async function deleteMessage(messageId) {
    // No confirm() call here
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/chat/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                messageEl.classList.add('deleted');
                messageEl.querySelector('.message-content').textContent = '[Message deleted]';

                // Also emit socket event for real-time updates
                if (socket && socket.connected) {
                    socket.emit('delete_message', { message_id: messageId });
                }

                // Show toast notification
                Toastify({
                    text: "Message deleted successfully",
                    duration: 3000,
                    gravity: "top",
                    position: "right",
                    backgroundColor: "#4CAF50",
                }).showToast();
            }
        } else {
            console.error("Failed to delete message:", await response.text());
            Toastify({
                text: "Failed to delete message",
                duration: 3000,
                gravity: "top",
                position: "right",
                backgroundColor: "#F44336",
            }).showToast();
        }
    } catch (error) {
        console.error("Error deleting message:", error);
        Toastify({
            text: "Error deleting message",
            duration: 3000,
            gravity: "top",
            position: "right",
            backgroundColor: "#F44336",
        }).showToast();
    }
}

// Add the message editing function
async function editMessage(messageId, newContent) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/chat/messages/${messageId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: newContent })
        });

        if (response.ok) {
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                const contentEl = messageEl.querySelector('.message-content');
                if (contentEl) {
                    contentEl.textContent = newContent;

                    // Highlight the edited message briefly
                    messageEl.classList.add('highlight');
                    setTimeout(() => messageEl.classList.remove('highlight'), 1500);

                    // Also emit socket event for real-time updates to other clients
                    if (socket && socket.connected) {
                        socket.emit('edit_message', {
                            message_id: messageId,
                            content: newContent
                        });
                    }

                    // Show toast notification
                    Toastify({
                        text: "Message updated successfully",
                        duration: 3000,
                        gravity: "top",
                        position: "right",
                        backgroundColor: "#4CAF50",
                    }).showToast();
                }
            }
        } else {
            console.error("Failed to edit message:", await response.text());
            Toastify({
                text: "Failed to edit message",
                duration: 3000,
                gravity: "top",
                position: "right",
                backgroundColor: "#F44336",
            }).showToast();
        }
    } catch (error) {
        console.error("Error editing message:", error);
        Toastify({
            text: "Error editing message",
            duration: 3000,
            gravity: "top",
            position: "right",
            backgroundColor: "#F44336",
        }).showToast();
    }
}

// --- setupEditMessageModal definition needs to be here or before setupMessageHandlers ---
function setupEditMessageModal() {
    // Placeholder: Ensure this function is defined correctly somewhere above
    console.log("Setting up edit message modal...");
    const editModal = document.getElementById('edit-message-modal');
    if (!editModal) return;

    const closeBtn = document.getElementById('edit-modal-close');
    const cancelBtn = document.getElementById('edit-modal-cancel');
    const saveBtn = document.getElementById('edit-modal-save');
    const textarea = document.getElementById('edit-message-content');

    if (closeBtn) closeBtn.onclick = hideEditUI;
    if (cancelBtn) cancelBtn.onclick = hideEditUI;

    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (!state.editingMessage || !textarea) return;
            const newContent = textarea.value.trim();
            if (!newContent) {
                alert('Message cannot be empty.');
                return;
            }
            await editMessage(state.editingMessage.id, newContent);
            hideEditUI();
        };
    }
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                saveBtn?.click();
            }
        });
    }
}

// Function to handle language selection change
async function handleLanguageChange() {
    if (!translationState.originalText || !translationState.languageSelect || !translationState.resultDiv) {
        console.error('Translation state is incomplete');
        return;
    }

    const targetLanguage = translationState.languageSelect.value;
    const resultDiv = translationState.resultDiv;
    
    // Show loading state with a better spinner
    resultDiv.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full py-4 text-gray-600">
            <svg class="animate-spin h-6 w-6 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm">Translating to ${targetLanguage === 'russian' ? 'Russian' : 'German'}...</span>
        </div>
    `;

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch('/ai/translate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: translationState.originalText,
                target_language: targetLanguage
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Translation request failed');
        }

        const data = await response.json();
        if (!data.result) {
            throw new Error('No translation result received');
        }

        // Show the translation with a nice fade-in effect
        resultDiv.innerHTML = `
            <div class="animate-fade-in p-3 text-gray-800">
                ${data.result}
            </div>
        `;
    } catch (error) {
        console.error('Translation error:', error);
        resultDiv.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full py-4 text-red-500">
                <svg class="w-6 h-6 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-sm text-center">${error.message || 'Failed to translate. Please try again.'}</span>
            </div>
        `;
        showToast('Translation failed. Please try again.', 'error');
    }
}

// Function to format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Function to show translation modal with immediate translation
function showTranslationModal(messageElement) {
    if (!messageElement) {
        console.error('No message element provided');
        return;
    }
    
    const messageContent = messageElement.querySelector('.message-content')?.textContent;
    if (!messageContent || messageContent === '[Message deleted]') {
        showToast('Cannot translate deleted messages', 'error');
        return;
    }

    // Store the message content
    translationState.currentMessage = messageElement;
    translationState.originalText = messageContent;

    // Get modal elements
    translationState.modal = document.getElementById('translation-modal');
    translationState.originalDiv = document.getElementById('translation-original');
    translationState.languageSelect = document.getElementById('translation-language');
    translationState.resultDiv = document.getElementById('translation-result');
    translationState.closeBtn = document.getElementById('translation-modal-close');
    translationState.cancelBtn = document.getElementById('translation-modal-cancel');

    if (!translationState.modal || !translationState.originalDiv || !translationState.languageSelect || 
        !translationState.resultDiv || !translationState.closeBtn || !translationState.cancelBtn) {
        console.error('Translation modal elements not found');
        showToast('Error loading translation modal', 'error');
        return;
    }

    // Set original message with better formatting
    translationState.originalDiv.innerHTML = `
        <div class="p-3 bg-gray-50 rounded-lg text-gray-800 break-words">
            ${messageContent}
        </div>
    `;

    // Show loading state immediately
    translationState.resultDiv.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full py-4 text-gray-600">
            <svg class="animate-spin h-6 w-6 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm">Translating to Russian...</span>
        </div>
    `;

    // Add event listeners with error handling
    try {
        translationState.languageSelect.onchange = handleLanguageChange;
        translationState.closeBtn.onclick = hideTranslationModal;
        translationState.cancelBtn.onclick = hideTranslationModal;

        // Show modal with animation
        translationState.modal.classList.remove('hidden');
        translationState.modal.classList.add('animate-fade-in');

        // Trigger translation immediately
        handleLanguageChange();
    } catch (error) {
        console.error('Error setting up translation modal:', error);
        showToast('Error setting up translation modal', 'error');
    }
}

// Function to hide translation modal
function hideTranslationModal() {
    if (translationState.modal) {
        translationState.modal.classList.add('hidden');
        // Clear state
        translationState.currentMessage = null;
        translationState.originalText = null;
        // Remove event listeners
        if (translationState.languageSelect) {
            translationState.languageSelect.onchange = null;
        }
        if (translationState.closeBtn) {
            translationState.closeBtn.onclick = null;
        }
        if (translationState.cancelBtn) {
            translationState.cancelBtn.onclick = null;
        }
    }
}

// Function to create or update message element with timestamp
function createMessageElement(message, isOwnMessage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'self-end' : 'self-start'}`;
    messageDiv.dataset.messageId = message.id;
    messageDiv.dataset.senderId = message.sender_id;

    // Add timestamp to the message
    const timestamp = formatTimestamp(message.timestamp || message.created_at);
    
    messageDiv.innerHTML = `
        <div class="message-content">${message.content}</div>
        <span class="message-timestamp">${timestamp}</span>
    `;

    // Add click handler
    messageDiv.onclick = (e) => handleMessageClick(e, messageDiv);

    return messageDiv;
}

// Update the socket message handler to include timestamps
function setupSocketMessageHandler(socket) {
    if (!socket) return;

    socket.on('new_message', (message) => {
        const messageList = document.getElementById('message-list');
        if (!messageList) return;

        const isOwnMessage = message.sender_id === currentUserId;
        const messageElement = createMessageElement(message, isOwnMessage);
        
        messageList.appendChild(messageElement);
        messageList.scrollTop = messageList.scrollHeight;
    });
}

export {
    setupMessageHandlers,
    setupReplyUI,
    hideReplyUI,
    handleMessageClick,
    clearMessageSelection,
    deleteMessage,
    editMessage,
    getReplyingToMessage,
    showTranslationModal,
    hideTranslationModal
};
