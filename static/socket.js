import { currentConversationId, loadConversations, currentUserId, createMessageElement, updateMessageReadStatus } from './chat.js'; // Import updateMessageReadStatus

// Track connected users
export const connected_users = new Map();

let socket = null;
let activeRooms = []; // Track which conversation rooms we've joined
let socketInitialized = false;
let pendingMessages = [];

// Initialize socket connection
export async function initializeSocket() {
    if (socket?.connected) {
        return socket;
    }

    console.log('Creating socket connection with token');
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No token available for socket connection');
        return null;
    }

    try {
        // Import socket.io-client dynamically
        const { io } = await import('https://cdn.socket.io/4.7.2/socket.io.esm.min.js');

        socket = io({
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socket.on('connect', () => {
            console.log('Socket connected successfully');
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
        });

        return socket;
    } catch (error) {
        console.error('Error initializing socket:', error);
        return null;
    }
}

// Function to join a conversation
export async function joinConversation(conversationId) {
    const socket = await initializeSocket();
    if (!socket) {
        console.error('Cannot join conversation: socket not initialized');
        return;
    }

    try {
        await socket.emit('join_conversation', { conversation_id: conversationId });
        console.log(`Joined conversation room: ${conversationId}`);
    } catch (error) {
        console.error('Error joining conversation:', error);
    }
}

export async function leaveConversation(conversationId) {
    const socket = await initializeSocket();
    if (!socket) {
        console.error('Cannot leave conversation: socket not initialized');
        return;
    }

    try {
        await socket.emit('leave_conversation', { conversation_id: conversationId });
        console.log(`Left conversation room: ${conversationId}`);
    } catch (error) {
        console.error('Error leaving conversation:', error);
    }
}

// Socket event handlers
function setupSocketEvents() {
    if (!socket) {
        console.error('Cannot setup socket events: socket is null');
        return;
    }

    // Remove any existing listeners to prevent duplicates
    socket.removeAllListeners();

    socket.io.on("error", (error) => {
        console.error('Transport error:', error);
    });

    socket.io.on("reconnect_attempt", (attempt) => {
        console.log('Reconnection attempt:', attempt);
    });

    socket.on('connect', () => {
        console.log('Socket.IO connected');

        // Rejoin current conversation if any
        if (socket.conversationToJoin) {
            joinConversation(socket.conversationToJoin);
            socket.conversationToJoin = null;
        } else if (currentConversationId) {
            joinConversation(currentConversationId);
        }

        // Handle pending messages when connected
        if (socket.pendingMessages && socket.pendingMessages.length > 0) {
            console.log('Sending pending messages:', socket.pendingMessages);
            socket.pendingMessages.forEach(msg => {
                socket.emit('message', msg);
            });
            socket.pendingMessages = [];
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err);
        if (err.message && err.message.includes("auth")) {
            console.log("Authentication error. Refreshing connection in 2 seconds...");
            setTimeout(() => {
                socket = initializeSocket();
                if (socket) {
                    setupSocketEvents();
                }
            }, 2000);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
            socket.connect();
        }
    });

    // Message handling
    socket.on('message', function (data) {
        console.log('Received message:', data);
        if (data.conversation_id === currentConversationId) {
            const messageList = document.getElementById('message-list');
            const messageDiv = createMessageElement(data);
            if (messageDiv) {
                messageList.appendChild(messageDiv);
                messageList.scrollTo({
                    top: messageList.scrollHeight,
                    behavior: 'smooth'
                });

                if (data.sender_id !== currentUserId) {
                    socket.emit('mark_read', {
                        message_id: data.id,
                        conversation_id: data.conversation_id
                    });
                }
            }
        }
        loadConversations();
    });

    socket.on('message_deleted', (data) => {
        console.log('Received message_deleted event:', data);
        if (data.conversation_id === currentConversationId) {
            const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
            if (messageElement) {
                messageElement.classList.add('deleted');
                messageElement.innerHTML = '<div class="message-content">[Message deleted]</div>';
            }
        }
    });

    socket.on('message_edited', (data) => {
        console.log('Received message_edited event:', data);
        if (data.conversation_id === currentConversationId) {
            const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
            if (messageElement) {
                const contentEl = messageElement.querySelector('.message-content');
                if (contentEl) {
                    contentEl.textContent = data.content;
                    messageElement.classList.add('highlight');
                    setTimeout(() => messageElement.classList.remove('highlight'), 1500);
                }
            }
        }
    });

    socket.on('update_chat_list', (data) => {
        console.log('Received update_chat_list event:', data);
        loadConversations();
    });

    socket.on('messages_read', (data) => {
        console.log('Received messages_read event:', data);
        if (data.conversation_id === currentConversationId) {
            updateMessageReadStatus(data.message_ids);
        }
    });
}

// Expose a function to check if socket is connected
function isSocketConnected() {
    return socket && socket.connected;
}

document.getElementById('send-btn').addEventListener('click', () => {
    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();

    if (!content) {
        return;
    }

    if (!currentConversationId) {

        console.error("Please select a conversation first");
        return;
    }

    // Initialize socket if needed
    if (!initializeSocket()) {

        console.error("Cannot connect to server. Please check your connection.");
        return;
    }

    // Check if socket is connected
    if (!socket.connected) {
        console.log('Socket not connected. Waiting to connect...');

        // Store message to send after connection
        if (!socket.pendingMessages) {
            socket.pendingMessages = [];
        }

        socket.pendingMessages.push({
            conversation_id: currentConversationId,
            content: content
        });

        // Toastify({
        //     text: "Connecting to server...",
        //     duration: 2000,
        //     close: true,
        //     gravity: "top",
        //     position: "right",
        //     backgroundColor: "#FFA500",
        // }).showToast();
        console.log("Connecting to server...");

        // Try to reconnect
        socket.connect();

        // Show message in UI anyway (will be sent when connected)
        const messageList = document.getElementById('message-list');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('p-3', 'mb-2', 'rounded-lg', 'bg-blue-500', 'text-white', 'self-end', 'opacity-50');
        messageDiv.textContent = content + " (sending...)";
        messageDiv.dataset.senderId = currentUserId;
        messageDiv.dataset.pending = true;
        messageList.appendChild(messageDiv);
        messageList.scrollTop = messageList.scrollHeight;
        messageInput.value = '';

        return;
    }

    const messageData = {
        conversation_id: currentConversationId,
        sender_id: currentUserId,
        content: content
    };
    console.log('Sending message:', messageData);

    // Optimistic UI update
    const messageList = document.getElementById('message-list');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('p-3', 'mb-2', 'rounded-lg', 'bg-blue-500', 'text-white', 'self-end');
    messageDiv.textContent = content;
    messageDiv.dataset.senderId = currentUserId;
    messageList.appendChild(messageDiv);
    messageList.scrollTop = messageList.scrollHeight;

    // Emit the message to the server
    socket.emit('message', messageData);
    messageInput.value = '';
});

// Handle enter key to send messages
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('send-btn').click();
    }
});

// Function to send a message
async function sendMessage(messageData) {
    try {
        const socket = await initializeSocket();
        if (!socket) {
            pendingMessages.push(messageData);
            throw new Error('Socket not initialized');
        }

        return new Promise((resolve, reject) => {
            socket.emit('message', messageData, (ack) => {
                if (ack?.status === 'success') {
                    resolve(ack);
                } else {
                    reject(new Error(ack?.message || 'Failed to send message'));
                }
            });
        });
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

// Function to get the current socket instance
function getSocket() {
    return socket;
}

// Function to get connected users
function getConnectedUsers() {
    return Array.from(connected_users.values());
}

// Export functions and variables
export {
    sendMessage,
    isSocketConnected,
    socket,
    getSocket,
    getConnectedUsers
};