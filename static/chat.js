// REMOVED: Transformer.js imports
// import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2';
// env.allowLocalModels = false;

// Use a simple function for showing toasts or ensure utils.js defines showToast correctly
const showToast = (message, type = 'info') => {
    if (typeof Toastify !== 'function') {
        console.warn("Toastify is not loaded. Cannot show toast:", message);
        return;
    }
    const backgroundColor = {
        info: "#3B82F6",    // Blue-500
        success: "#10B981", // Emerald-500
        error: "#EF4444",   // Red-500
        warning: "#F59E0B", // Amber-500
    }[type] || "#6B7280"; // Gray-500 for default

    Toastify({
        text: message,
        duration: 3000,
        gravity: "top", // `top` or `bottom`
        position: "right", // `left`, `center` or `right`
        style: { background: backgroundColor },
        stopOnFocus: true, // Prevents dismissing of toast on hover
    }).showToast();
};


import { setupMessageHandlers, setupReplyUI, hideReplyUI, handleMessageClick, clearMessageSelection } from './messageHandlers.js';
import { initializeSocket, joinConversation, connected_users } from './socket.js';
import { showProfile } from './profile.js';
import { initMessageInteractions, getReplyData } from './messageInteractions.js'; // Removed startReply import
// --- ADD WEBRTC IMPORTS ---
import { 
    initializeWebRTC, 
    startCall,  // Import startCall directly since that's what webrtc.js exports
    currentCall as webRTCCallState, 
    updateWebRTCUI 
} from './webrtc.js';
import { setupAIButtons } from './aiHandlers.js';

// --- Global Variables ---
let currentConversationId = null;
let currentUserId = null;
let currentUsername = null;
let conversations = [];
let userData = null;
let socket = null;

// --- DOM Element Variables (Declare here, assign in DOMContentLoaded) ---
let chatSection = null;
let profileSection = null;
let welcomeSection = null;
let signinSection = null;
let signupSection = null;
let messageList = null;
let messageInput = null;
let conversationNameEl = null;
let conversationAvatarEl = null;
let callBtn = null;
let localAudioElement = null;
let remoteAudioElement = null;
// ... add other frequently used elements if needed ...

// Define hideAllSections at the top level
function hideAllSections() {
    welcomeSection?.classList.add('hidden');
    signinSection?.classList.add('hidden');
    signupSection?.classList.add('hidden');
    chatSection?.classList.add('hidden');
    profileSection?.classList.add('hidden');
}

// Function to ensure socket is initialized
async function ensureSocketInitialized() {
    try {
        // If socket exists and is connected, return it
        if (socket?.connected) {
            return socket;
        }

        // If socket exists but is disconnected, try to reconnect
        if (socket) {
            console.log('Socket exists but disconnected, attempting to reconnect...');
            try {
                socket = await initializeSocket();
                if (!socket || !socket.connected) {
                    throw new Error('Failed to reconnect socket');
                }
                return socket;
            } catch (error) {
                console.error('Socket reconnection failed:', error);
                // If reconnection fails, try a fresh initialization
                socket = null;
            }
        }

        // Create new socket connection
        console.log('Initializing new socket connection...');
        socket = await initializeSocket();
        
        if (!socket || !socket.connected) {
            throw new Error('Socket initialization failed - no connection established');
        }

        console.log('Socket successfully initialized and connected');
        return socket;
    } catch (error) {
        console.error('Socket initialization error:', error);
        showToast('Connection error. Please refresh the page.', 'error');
        throw error; // Re-throw to let caller handle the error
    }
}

// Setup socket listeners
async function setupSocketListeners() {
    try {
        const socket = await ensureSocketInitialized();
        if (!socket) {
            console.error('Cannot setup socket listeners: socket initialization failed');
            return;
        }

        // Remove any existing listeners to prevent duplicates
        socket.removeAllListeners();

        socket.on('conversation_created', async (data) => {
            console.log('New conversation created:', data);
            await loadConversations();
        });

        socket.on('message', (data) => {
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
                }
            }
            loadConversations();
        });

        socket.on('message_deleted', (data) => {
            if (data.conversation_id === currentConversationId) {
                const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
                if (messageElement) {
                    messageElement.classList.add('deleted');
                    messageElement.innerHTML = '<div class="message-content">[Message deleted]</div>';
                }
            }
        });

        socket.on('message_edited', (data) => {
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

        socket.on('update_chat_list', () => {
            loadConversations();
        });

        socket.on('messages_read', (data) => {
            if (data.conversation_id === currentConversationId) {
                updateMessageReadStatus(data.message_ids);
            }
        });

        socket.on('user_status_change', (data) => {
            const { user_id, status, last_seen } = data;
            updateUserStatus(user_id, status, last_seen);
        });

        console.log('Socket listeners setup complete');
    } catch (error) {
        console.error('Error setting up socket listeners:', error);
    }
}

// Initialize WebRTC when chat is loaded
async function initializeChatWebRTC() {
    try {
        console.log('Initializing chat WebRTC...');
        
        // Get all required UI elements
        const uiElements = {
            callBtn: document.getElementById('call-btn'),
            callStatusDiv: document.getElementById('call-status'),
            callStatusText: document.getElementById('call-status-text'),
            hangUpBtn: document.getElementById('hang-up-btn'),
            incomingCallModal: document.getElementById('incoming-call-modal'),
            callerNameEl: document.getElementById('caller-name'),
            callerAvatarEl: document.getElementById('caller-avatar'),
            acceptCallBtn: document.getElementById('accept-call-btn'),
            rejectCallBtn: document.getElementById('reject-call-btn'),
            localAudioElement: document.getElementById('local-audio'),
            remoteAudioElement: document.getElementById('remote-audio'),
            activeCallModal: document.getElementById('active-call-modal'),
            activeCallAvatar: document.getElementById('active-call-avatar'),
            activeCallUsername: document.getElementById('active-call-username'),
            activeCallTimer: document.getElementById('active-call-timer'),
            muteCallBtn: document.getElementById('mute-call-btn'),
            activeHangUpBtn: document.getElementById('active-hang-up-btn'),
            micIconUnmuted: document.getElementById('mic-icon-unmuted'),
            micIconMuted: document.getElementById('mic-icon-muted')
        };

        // Initialize WebRTC with UI elements
        const success = await initializeWebRTC(uiElements);
        if (!success) {
            throw new Error('Failed to initialize WebRTC');
        }

        // Setup call button visibility update
        if (uiElements.callBtn) {
            const updateCallButtonVisibility = () => {
                if (!currentConversationId) {
                    uiElements.callBtn.classList.add('hidden');
                    return;
                }
                
                const conversation = conversations.find(c => c.id === currentConversationId);
                if (!conversation) {
                    uiElements.callBtn.classList.add('hidden');
                    return;
                }
                
                // Only show call button for 1-on-1 chats
                uiElements.callBtn.classList.toggle('hidden', conversation.isGroup);
            };
            
            // Update call button visibility when conversation changes
            // Instead of modifying selectConversation, we'll add a listener to the chat list
            const chatList = document.getElementById('chat-list');
            if (chatList) {
                chatList.addEventListener('click', (e) => {
                    const conversationElement = e.target.closest('[data-conversation-id]');
                    if (conversationElement) {
                        const conversationId = conversationElement.dataset.conversationId;
                        if (conversationId) {
                            updateCallButtonVisibility();
                        }
                    }
                });
            }
            
            // Initial update
            updateCallButtonVisibility();
        }
        
        console.log('Chat WebRTC initialization completed successfully');
        return true;
    } catch (error) {
        console.error('Error during chat WebRTC initialization:', error);
        showToast('Call feature initialization failed: ' + error.message, 'error');
        return false;
    }
}

// Initialize socket when the module loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // First assign all DOM elements
        chatSection = document.getElementById('chat');
        profileSection = document.getElementById('profile');
        welcomeSection = document.getElementById('welcome');
        signinSection = document.getElementById('signin');
        signupSection = document.getElementById('signup');
        messageList = document.getElementById('message-list');
        messageInput = document.getElementById('message-input');
        conversationNameEl = document.getElementById('conversation-name');
        conversationAvatarEl = document.getElementById('conversation-avatar');
        callBtn = document.getElementById('call-btn');
        localAudioElement = document.getElementById('local-audio');
        remoteAudioElement = document.getElementById('remote-audio');

        const token = localStorage.getItem('token');
        console.log('Token found in localStorage:', token ? 'Yes' : 'No');

        if (!token) {
            console.log('No token found, showing welcome page');
            hideAllSections();
            welcomeSection?.classList.remove('hidden');
            return;
        }

        try {
            // First validate token and get user data
            console.log('Validating token...');
            const userResponse = await fetch('/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!userResponse.ok) {
                if (userResponse.status === 401) {
                    console.log('Token is invalid or expired.');
                    localStorage.removeItem('token');
                    throw new Error('Invalid token');
                } else {
                    throw new Error(`Failed to fetch user data: ${userResponse.statusText}`);
                }
            }

            userData = await userResponse.json();
            currentUserId = userData.id;
            currentUsername = userData.username;
            console.log('Current user:', userData);

            // Initialize socket AFTER user data is loaded
            const socket = await ensureSocketInitialized();
            if (!socket) {
                throw new Error('Failed to initialize socket connection');
            }

            // Setup socket listeners
            await setupSocketListeners();

            // --- Initialization successful, NOW hide all and show chat ---
            hideAllSections();
            chatSection?.classList.remove('hidden');

            // Load initial conversations
            await loadConversations();

            // Initialize WebRTC AFTER socket is ready and all elements are loaded
            const webrtcSuccess = await initializeChatWebRTC();
            if (!webrtcSuccess) {
                console.warn('WebRTC initialization failed, but continuing with chat functionality');
            }

            // Setup message handlers and interactions
            if (typeof setupMessageHandlers === 'function') {
                setupMessageHandlers();
            } else {
                console.error("setupMessageHandlers function not found!");
            }
            if (typeof initMessageInteractions === 'function') {
                initMessageInteractions();
            } else {
                console.error("initMessageInteractions function not found!");
            }

            // Initialize AI button handlers
            setupAIButtons();

            console.log('Chat initialized successfully.');

        } catch (error) {
            console.error('Error during initialization:', error);
            localStorage.removeItem('token');
            hideAllSections();
            welcomeSection?.classList.remove('hidden');
            showToast('Session expired or invalid. Please log in again.', 'error');
            return;
        }

        // --- Event Listeners Setup (Modal toggles, Search, Profile, etc.) ---

        const searchInput = document.getElementById('chat-search');
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            // Filter based on the 'conversations' array
            const filteredConversations = conversations.filter(conv =>
                conv.name.toLowerCase().includes(query) || // Check conversation name
                (conv.participants || []).some(p => p.toLowerCase().includes(query)) // Check participant names if available
            );
            renderChatList(filteredConversations); // Re-render the list with filtered results
        });

        // Modals
        const newConversationModal = document.getElementById('new-conversation-modal');
        const newConversationBtn = document.getElementById('new-conversation-btn');
        const menuModal = document.getElementById('menu-modal');
        const menuBtn = document.getElementById('menu-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const myProfileBtn = document.getElementById('my-profile-btn');
        const newChatModal = document.getElementById('new-chat-modal');
        const newChatBtn = document.getElementById('new-chat-btn');
        const newGroupModal = document.getElementById('new-group-modal');
        const newGroupBtn = document.getElementById('new-group-btn');

        // Generic outside click handler for modals
        document.addEventListener('click', (e) => {
            // Close New Conversation Options Modal
            if (newConversationModal && !newConversationModal.classList.contains('hidden') && !newConversationModal.contains(e.target) && e.target !== newConversationBtn) {
                newConversationModal.classList.add('hidden');
            }
            // Close Main Menu Modal
            if (menuModal && !menuModal.classList.contains('hidden') && !menuModal.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target) /* handle click on SVG inside button */) {
                menuModal.classList.add('hidden');
            }
            // Close New Chat Modal
            if (newChatModal && !newChatModal.classList.contains('hidden') && !newChatModal.querySelector('.bg-white').contains(e.target)) {
                // newChatModal.classList.add('hidden'); // Optionally close on outside click
            }
            // Close New Group Modal
            if (newGroupModal && !newGroupModal.classList.contains('hidden') && !newGroupModal.querySelector('.bg-white').contains(e.target)) {
                // newGroupModal.classList.add('hidden'); // Optionally close on outside click
            }
        });

        // Toggle Buttons
        if (newConversationBtn && newConversationModal) {
            newConversationBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent document click listener from closing it immediately
                menuModal?.classList.add('hidden'); // Close other modal if open
                newConversationModal.classList.toggle('hidden');
            });
        }

        if (menuBtn && menuModal) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                newConversationModal?.classList.add('hidden'); // Close other modal
                menuModal.classList.toggle('hidden');
                // Position menu modal near the button
                const rect = menuBtn.getBoundingClientRect();
                menuModal.style.position = 'fixed'; // Use fixed to position relative to viewport
                menuModal.style.top = `${rect.bottom + 5}px`; // Below the button
                menuModal.style.left = `${rect.left}px`; // Align left edge
            });
        }

        // Menu Actions
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('token');
                if (socket && socket.connected) {
                    socket.disconnect(); // Disconnect socket on logout
                }
                hideAllSections();
                welcomeSection?.classList.remove('hidden');
                menuModal.classList.add('hidden'); // Close modal
                showToast("You have been logged out.", "success");
                console.log("Logged out successfully.");
                // Reset state variables
                currentUserId = null;
                currentConversationId = null;
                conversations = [];
                document.getElementById('chat-list').innerHTML = '';
                document.getElementById('message-list').innerHTML = '';
                document.getElementById('conversation-name').textContent = 'Chat';

            });
        }

        if (myProfileBtn && menuModal) {
            myProfileBtn.addEventListener('click', () => {
                menuModal.classList.add('hidden');
                if (typeof showProfile === 'function') {
                    console.log('Showing profile for current user:', currentUserId);
                    showProfile(currentUserId); // showProfile should handle hiding chat and showing profile
                } else {
                    console.warn('showProfile function not found.');
                }
            });
        }    // Profile loading from conversation header
        const conversationHeader = document.getElementById('conversation-header');
        if (conversationHeader) {
            conversationHeader.addEventListener('click', async (event) => {
                // Don't trigger profile view if clicking on the call button
                if (event.target.closest('#call-btn')) return;

                if (!currentConversationId) return;
                const conversation = conversations.find(conv => conv.id === currentConversationId);
                if (!conversation || !conversation.participants) return;

                const token = localStorage.getItem('token'); // Needed for API calls
                if (!token) return; // Should not happen if already logged in

                // Get current user's username (needed to find the *other* participant)
                let currentUsername = null;
                try {
                    const meResponse = await fetch('/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!meResponse.ok) throw new Error('Failed to get current user info');
                    const meData = await meResponse.json();
                    currentUsername = meData.username;
                } catch (error) {
                    console.error("Error fetching current username:", error);
                    return;
                }

                // Find the *other* participant in a 1-on-1 chat
                if (conversation.participants.length === 2) {
                    const otherParticipantUsername = conversation.participants.find(username => username !== currentUsername);
                    if (otherParticipantUsername) {
                        try {
                            // Fetch the other user's ID by username
                            const userResponse = await fetch(`/auth/user/${otherParticipantUsername}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (!userResponse.ok) throw new Error(`Could not find user: ${otherParticipantUsername}`);
                            const userData = await userResponse.json();

                            // Show the other user's profile
                            if (typeof showProfile === 'function') {
                                console.log('Showing profile for other user:', userData.id);
                                showProfile(userData.id); // showProfile handles UI changes
                            } else {
                                console.warn('showProfile function not found.');
                            }

                        } catch (error) {
                            console.error('Error fetching/showing other user profile:', error);
                            showToast(`Could not load profile for ${otherParticipantUsername}.`, 'error');
                        }
                    }
                } else {
                    console.log('Clicked header of a group chat or self-chat. No profile to show.');
                    // Optionally show group info modal here later
                }
            });
        }


        // --- New Chat / Group Modals ---
        const newChatCancel = document.getElementById('new-chat-cancel');
        const newChatCreate = document.getElementById('new-chat-create');
        const newChatUsernameInput = document.getElementById('new-chat-username');
        const userSuggestions = document.getElementById('user-suggestions');
        let selectedUserIdForNewChat = null;
        let searchTimeout;

        if (newChatBtn && newChatModal) {
            newChatBtn.addEventListener('click', () => {
                newConversationModal.classList.add('hidden'); // Close options modal
                newChatModal.classList.remove('hidden');
                newChatUsernameInput.value = ''; // Clear input
                userSuggestions.innerHTML = ''; // Clear suggestions
                userSuggestions.classList.add('hidden'); // Hide suggestions box
                selectedUserIdForNewChat = null; // Reset selected user
                newChatUsernameInput.focus();
            });
        }

        if (newChatCancel) {
            newChatCancel.addEventListener('click', () => newChatModal.classList.add('hidden'));
        }

        newChatUsernameInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = newChatUsernameInput.value.trim();
            userSuggestions.innerHTML = ''; // Clear previous
            userSuggestions.classList.add('hidden');
            selectedUserIdForNewChat = null; // Reset selection if user types again

            if (query.length < 2) return; // Only search if query is long enough

            userSuggestions.innerHTML = '<div class="p-2 text-gray-500 text-sm">Searching...</div>';
            userSuggestions.classList.remove('hidden');

            searchTimeout = setTimeout(async () => {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(`/auth/users/search?query=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!response.ok) throw new Error('User search failed');

                    const users = await response.json();
                    userSuggestions.innerHTML = ''; // Clear "Searching..."

                    const currentUsername = document.getElementById('profile-username')?.textContent; // Get own username if profile was loaded

                    const filteredUsers = users.filter(user => user.id !== currentUserId); // Exclude self

                    if (filteredUsers.length === 0) {
                        userSuggestions.innerHTML = '<div class="p-2 text-gray-500 text-sm">No users found.</div>';
                    } else {
                        filteredUsers.forEach(user => {
                            const suggestionDiv = document.createElement('div');
                            // Added more padding, hover effect
                            suggestionDiv.className = 'p-2 hover:bg-gray-100 cursor-pointer text-sm';
                            suggestionDiv.textContent = user.username;
                            suggestionDiv.addEventListener('click', () => {
                                newChatUsernameInput.value = user.username; // Set input to selected user
                                selectedUserIdForNewChat = user.id; // Store the ID
                                userSuggestions.innerHTML = ''; // Clear suggestions
                                userSuggestions.classList.add('hidden'); // Hide box
                            });
                            userSuggestions.appendChild(suggestionDiv);
                        });
                    }
                } catch (error) {
                    console.error('Error searching users:', error);
                    userSuggestions.innerHTML = '<div class="p-2 text-red-500 text-sm">Error searching.</div>';
                }
        }, 300); // Debounce API call
    });

    // Create New Chat Action
    if (newChatCreate) {
        newChatCreate.addEventListener('click', async () => {
            if (!selectedUserIdForNewChat) {
                showToast("Please select a user from the suggestions.", "warning");
                return;
            }

            // Prevent creating chat with self
            if (selectedUserIdForNewChat === currentUserId) {
                showToast("You cannot create a chat with yourself.", "warning");
                return;
            }

            newChatCreate.disabled = true; // Prevent double clicks

            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/chat/conversations', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: null, // Backend determines name for 1-on-1 chats
                        participant_ids: [currentUserId, selectedUserIdForNewChat]
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);
                    // Check if it's a duplicate chat error (adjust status code if needed)
                    if (response.status === 409 || errorData?.detail?.includes("already exists")) {
                        showToast("A chat with this user already exists.", "warning");
                        // Optionally find and load the existing chat
                    } else {
                        throw new Error(errorData?.error || 'Failed to create chat');
                    }
                } else {
                    const data = await response.json();
                    newChatModal.classList.add('hidden'); // Close modal on success
                    await loadConversations(); // Refresh list to show the new chat
                    if (data.conversation_id) {
                        await loadConversation(data.conversation_id); // Load the newly created chat
                    }
                    showToast("Chat created successfully!", "success");
                }

            } catch (error) {
                console.error('Error creating chat:', error);
                showToast(`Error: ${error.message}`, "error");
            } finally {
                newChatCreate.disabled = false; // Re-enable button
            }
        });
    }

    // --- New Group Modal Logic ---
    const newGroupCancel = document.getElementById('new-group-cancel');
    const newGroupCreate = document.getElementById('new-group-create');
    const newGroupUserSearchInput = document.getElementById('new-group-user-search');
    const newGroupUserSuggestions = document.getElementById('new-group-user-suggestions');
    const newGroupAddedUsersContainer = document.getElementById('new-group-added-users');
    let newGroupSelectedUsers = []; // Array to store {id, username}
    let groupSearchTimeout;

    if (newGroupBtn && newGroupModal) {
        newGroupBtn.addEventListener('click', () => {
            newConversationModal.classList.add('hidden'); // Close options
            newGroupModal.classList.remove('hidden');
            // Reset group modal state
            document.getElementById('new-group-name').value = '';
            newGroupUserSearchInput.value = '';
            newGroupUserSuggestions.innerHTML = '';
            newGroupUserSuggestions.classList.add('hidden');
            newGroupSelectedUsers = [];
            renderGroupUserChips(); // Clear chips
            document.getElementById('new-group-name').focus();
        });
    }

    if (newGroupCancel) {
        newGroupCancel.addEventListener('click', () => newGroupModal.classList.add('hidden'));
    }

    // User search within New Group Modal
    if (newGroupUserSearchInput) {
        newGroupUserSearchInput.addEventListener('input', () => {
            clearTimeout(groupSearchTimeout);
            const query = newGroupUserSearchInput.value.trim();
            newGroupUserSuggestions.innerHTML = '';
            newGroupUserSuggestions.classList.add('hidden');

            if (query.length < 2) return;

            newGroupUserSuggestions.innerHTML = '<div class="p-2 text-gray-500 text-sm">Searching...</div>';
            newGroupUserSuggestions.classList.remove('hidden');

            groupSearchTimeout = setTimeout(async () => {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(`/auth/users/search?query=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!response.ok) throw new Error('User search failed');

                    const users = await response.json();
                    newGroupUserSuggestions.innerHTML = ''; // Clear "Searching..."

                    // Filter out self and already added users
                    const availableUsers = users.filter(user =>
                        user.id !== currentUserId &&
                        !newGroupSelectedUsers.some(selected => selected.id === user.id)
                    );

                    if (availableUsers.length === 0) {
                        newGroupUserSuggestions.innerHTML = '<div class="p-2 text-gray-500 text-sm">No more users found.</div>';
                    } else {
                        availableUsers.forEach(user => {
                            const suggestionDiv = document.createElement('div');
                            suggestionDiv.className = 'p-2 hover:bg-gray-100 cursor-pointer text-sm';
                            suggestionDiv.textContent = user.username;
                            suggestionDiv.addEventListener('click', () => {
                                addUserToGroupSelection(user.id, user.username); // Add user to chip list
                                newGroupUserSearchInput.value = ''; // Clear search input
                                newGroupUserSuggestions.innerHTML = ''; // Clear suggestions
                                newGroupUserSuggestions.classList.add('hidden'); // Hide box
                                newGroupUserSearchInput.focus(); // Refocus search input
                            });
                            newGroupUserSuggestions.appendChild(suggestionDiv);
                        });
                    }
                    // Ensure suggestions are visible if there's content
                    if (newGroupUserSuggestions.children.length > 0) {
                        newGroupUserSuggestions.classList.remove('hidden');
                    }

                } catch (error) {
                    console.error('Error searching users for group:', error);
                    newGroupUserSuggestions.innerHTML = '<div class="p-2 text-red-500 text-sm">Error searching.</div>';
                    newGroupUserSuggestions.classList.remove('hidden');
                }
            }, 300); // Debounce
        });

        // Hide suggestions when clicking outside the search input/suggestions list
        document.addEventListener('click', (e) => {
            if (newGroupUserSuggestions && !newGroupUserSuggestions.classList.contains('hidden') && !newGroupUserSearchInput.contains(e.target) && !newGroupUserSuggestions.contains(e.target)) {
                newGroupUserSuggestions.classList.add('hidden');
            }
        });
    }

    function addUserToGroupSelection(userId, username) {
        // Prevent adding duplicates
        if (!newGroupSelectedUsers.some(u => u.id === userId)) {
            newGroupSelectedUsers.push({ id: userId, username: username });
            renderGroupUserChips(); // Update the UI
        }
    }

    function removeUserFromGroupSelection(userIdToRemove) {
        newGroupSelectedUsers = newGroupSelectedUsers.filter(user => user.id !== userIdToRemove);
        renderGroupUserChips(); // Update the UI
    }

    function renderGroupUserChips() {
        newGroupAddedUsersContainer.innerHTML = ''; // Clear existing chips
        newGroupSelectedUsers.forEach(user => {
            const chip = document.createElement('span');
            chip.className = 'inline-flex items-center bg-indigo-100 text-indigo-700 text-sm font-medium px-3 py-1 rounded-full mr-2 mb-2 shadow-sm';
            chip.innerHTML = `
              <span class="mr-1">${user.username}</span>
              <button type="button" class="ml-1 flex-shrink-0 bg-indigo-200 text-indigo-600 hover:bg-indigo-300 hover:text-indigo-800 rounded-full p-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 group-chip-remove-btn" data-user-id="${user.id}">
                <svg class="h-3 w-3" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                  <path stroke-linecap="round" stroke-width="1.5" d="M1 1l6 6m0-6L1 7" />
                </svg>
              </button>
            `;
            // Add listener specifically to the button inside the chip
            chip.querySelector('.group-chip-remove-btn').addEventListener('click', (e) => {
                // Get the userId from the button's dataset
                const button = e.currentTarget; // Use currentTarget to ensure it's the button
                const userIdToRemove = parseInt(button.dataset.userId);
                removeUserFromGroupSelection(userIdToRemove);
            });
            newGroupAddedUsersContainer.appendChild(chip);
        });
    }

    // Create New Group Action
    if (newGroupCreate) {
        newGroupCreate.addEventListener('click', async () => {
            const groupName = document.getElementById('new-group-name').value.trim();
            const participantIds = newGroupSelectedUsers.map(u => u.id);

            if (!groupName) {
                showToast("Please enter a group name.", "warning");
                return;
            }
            // Require at least 2 members total (creator + 1 other)
            if (participantIds.length < 1) {
                showToast("Please add at least one other member to the group.", "warning");
                return;
            }

            newGroupCreate.disabled = true;

            const allParticipantIds = [currentUserId, ...participantIds];
            const uniqueParticipantIds = [...new Set(allParticipantIds)]; // Ensure uniqueness

            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/chat/conversations', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: groupName,
                        participant_ids: uniqueParticipantIds
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);
                    throw new Error(errorData?.error || 'Failed to create group');
                }

                const data = await response.json();
                newGroupModal.classList.add('hidden');
                await loadConversations(); // Refresh list
                if (data.conversation_id) {
                    await loadConversation(data.conversation_id); // Load the new group chat
                }
                showToast("Group created successfully!", "success");

            } catch (error) {
                console.error("Error creating group:", error);
                showToast(`Error: ${error.message}`, "error");
            } finally {
                newGroupCreate.disabled = false; // Re-enable button
            }
        });
    }

    // --- Send Button ---
    document.getElementById('send-btn').addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline
            e.preventDefault(); // Prevent default Enter behavior (like newline)
            handleSendMessage();
        }
    });

    // --- Call Button Listener (Ensure callBtn exists) ---
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            if (!currentConversationId || !userData) return;
            const conversation = conversations.find(conv => conv.id === currentConversationId);

            // Use participant_details from the conversation object
            if (!conversation || !conversation.participant_details || conversation.participant_details.length !== 2) {
                showToast('Calls are only supported in 1-on-1 chats.', 'warning');
                return;
            }

            // Find the other participant using participant_details
            const otherParticipant = conversation.participant_details.find(p => p.id !== currentUserId);

            if (!otherParticipant) {
                console.error("Could not find the other participant's details.");
                showToast('Error finding user to call.', 'error');
                return;
            }

            console.log(`Initiating call with User ID: ${otherParticipant.id}, Username: ${otherParticipant.username}`);
            startCall(otherParticipant.id, otherParticipant.username);
        });
    } else {
        // This log should now appear if the button isn't found during initial load
        console.error("Call button element not found during listener setup.");
    }

} catch (error) {
    console.error('Error during initialization:', error);
    hideAllSections();
    welcomeSection?.classList.remove('hidden');
    showToast('An error occurred. Please try again later.', 'error');
}
}); // End DOMContentLoaded

// --- Core Chat Functions ---

async function loadConversations() {
    console.log('Loading conversations...');
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No token available for loading conversations.');
            // Handle this case, e.g., redirect to login
            return;
        }

        const response = await fetch('/chat/conversations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) { // Unauthorized
                localStorage.removeItem('token');
                // Redirect to login or show welcome screen
                document.getElementById('chat').classList.add('hidden');
                document.getElementById('welcome').classList.remove('hidden');
                showToast("Session expired. Please sign in.", "error");
            } else {
                showToast("Failed to load conversations.", "error");
            }
            console.error('Failed to load conversations:', response.status, response.statusText);
            return; // Stop execution for this function
        }

        conversations = await response.json(); // Store conversation list globally
        console.log('Conversations loaded:', conversations);

        // --- ADD participant_details to conversation objects (Example - adjust based on your actual API response) ---
        // This part is crucial for getting the other user's ID for calling.
        // You might need to adjust your /chat/conversations endpoint to include participant IDs and usernames.
        // Example structure assumed for conversations array elements:
        // { id: 1, name: 'user_b', participants: ['user_a', 'user_b'], participant_details: [{id: 10, username: 'user_a'}, {id: 11, username: 'user_b'}], ... }

        renderChatList(conversations); // Update the UI

        // Automatically load the first conversation if none is selected,
        // or reload the current one if it exists after refresh.
        const messageList = document.getElementById('message-list');
        if (!currentConversationId && conversations.length > 0) {
            console.log("No current conversation, loading first one:", conversations[0].id);
            await loadConversation(conversations[0].id);
        } else if (currentConversationId && conversations.some(c => c.id === currentConversationId)) {
            console.log("Current conversation exists, reloading:", currentConversationId);
            await loadConversation(currentConversationId); // Reload potentially updated info
        } else if (currentConversationId && conversations.length > 0) {
            // Current conversation ID is invalid (e.g., deleted), load first one
            console.log("Current conversation ID invalid, loading first one:", conversations[0].id);
            await loadConversation(conversations[0].id);
        } else if (conversations.length === 0) {
            // Handle case with no conversations
            messageList.innerHTML = '<div class="p-4 text-center text-gray-500">No conversations yet. Start a new chat!</div>';
            document.getElementById('conversation-name').textContent = 'Chat';
            currentConversationId = null; // Ensure no conversation is selected
        }

    } catch (error) {
        console.error('Error loading conversations:', error);
        showToast("An error occurred while loading conversations.", "error");
    }
}

function renderChatList(convList) {
    const chatListEl = document.getElementById('chat-list');
    if (!chatListEl) return;
    chatListEl.innerHTML = ''; // Clear current list

    if (!convList || convList.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'p-4 text-center text-gray-500 text-sm';
        emptyMessage.textContent = 'No chats match your search.';
        chatListEl.appendChild(emptyMessage);
        return;
    }

    convList.forEach(conv => {
        const chatItem = document.createElement('div');
        // Base classes + conditional highlighting
        chatItem.className = `flex items-center p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-lg transition duration-150 ease-in-out chat-list-item ${conv.id === currentConversationId ? 'bg-blue-100 dark:bg-blue-800' : ''}`;
        chatItem.dataset.conversationId = conv.id; // Add dataset for easy selection

        // Determine display name (handle 1-on-1 vs group) - assumes 'participants' array exists
        let displayName = conv.name; // Use backend provided name
        // Maybe add logic here if backend doesn't provide a good default name for 1-on-1

        const unreadCount = conv.unread_count || 0;

        // Improved innerHTML structure
        chatItem.innerHTML = `
            <div class="relative mr-3">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&size=40" alt="${displayName}" class="w-10 h-10 rounded-full">
                ${unreadCount > 0 ? `<span class="absolute top-0 right-0 block h-4 w-4 transform -translate-y-1/2 translate-x-1/2 rounded-full ring-2 ring-white bg-red-500 text-white text-xs flex items-center justify-center">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">${displayName}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${conv.last_message || 'No messages yet'}</p>
            </div>
        `;

        chatItem.addEventListener('click', () => {
            // Prevent reloading if already selected
            if (conv.id !== currentConversationId) {
                loadConversation(conv.id);
                // Optional: Immediately highlight clicked item visually
                document.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('bg-blue-100', 'dark:bg-blue-800'));
                chatItem.classList.add('bg-blue-100', 'dark:bg-blue-800');
            }
        });
        chatListEl.appendChild(chatItem);
    });
}


async function loadConversation(conversationId) {
    console.log(`Loading conversation ${conversationId}...`);
    if (!conversationId || !messageList || !conversationNameEl || !callBtn) {
        console.warn("loadConversation called with null ID or missing essential elements.");
        return;
    }

    // --- Reset WebRTC state if a call is active --- 
    if (webRTCCallState.state !== 'idle') {
        console.log("Switching conversation during an active call. Ending the call.");
        if (typeof updateWebRTCUI === 'function') {
            const hangUpBtn = document.getElementById('hang-up-btn');
            const callStatusDiv = document.getElementById('call-status');
            hangUpBtn?.classList.add('hidden');
            callStatusDiv?.classList.add('hidden');
        }
    }

    // Visually indicate loading
    conversationNameEl.textContent = 'Loading...';
    messageList.innerHTML = '<div class="p-4 text-center text-gray-500">Loading messages...</div>';
    callBtn.classList.add('hidden');

    try {
        // Update current conversation ID state
        currentConversationId = conversationId;

        // Join the WebSocket room for this conversation
        await ensureSocketInitialized();
        if (socket && socket.connected) {
            await joinConversation(conversationId);
        } else {
            console.warn("Socket not ready when trying to join room.");
            if (typeof initializeSocket === 'function') {
                await initializeSocket();
            }
        }

        const token = localStorage.getItem('token');
        if (!token) throw new Error('Authentication token missing');

        // --- Fetch Conversation Details (Messages) ---
        const response = await fetch(`/chat/messages/${conversationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                showToast("You are not authorized to view this conversation.", "error");
            } else {
                showToast("Failed to load messages.", "error");
            }
            throw new Error(`Failed to load messages: ${response.statusText}`);
        }

        const messages = await response.json();
        console.log('Messages loaded for conversation', conversationId, messages);

        // --- Render Messages ---
        messageList.innerHTML = '';
        if (!messages || messages.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'p-4 text-center text-gray-500 italic system-message';
            emptyMessage.textContent = 'No messages yet. Be the first to say hello!';
            messageList.appendChild(emptyMessage);
        } else {
            // Sort messages by timestamp to ensure correct order
            messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            messages.forEach(msg => {
                const messageDiv = createMessageElement(msg);
                if (messageDiv) {
                    messageList.appendChild(messageDiv);
                }
            });
            // Scroll to bottom smoothly after messages are loaded
            setTimeout(() => {
                messageList.scrollTo({
                    top: messageList.scrollHeight,
                    behavior: 'smooth'
                });
            }, 100);
        }

        // --- Update Conversation Header --- 
        const convData = conversations.find(c => c.id === conversationId);
        if (convData) {
            conversationNameEl.textContent = convData.name;
            if (conversationAvatarEl) {
                conversationAvatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(convData.name)}&background=random&size=40`;
            }

            // --- Show/Hide Call Button --- 
            if (convData.participant_details && convData.participant_details.length === 2) {
                const otherParticipant = convData.participant_details.find(p => p.id !== currentUserId);
                if (otherParticipant) {
                    callBtn.classList.remove('hidden');
                    // Check if user is online
                    const isOnline = Array.from(connected_users.values()).includes(otherParticipant.id);
                    updateUserStatus(
                        otherParticipant.id,
                        isOnline ? 'online' : 'offline',
                        otherParticipant.last_seen
                    );
                } else {
                    callBtn.classList.add('hidden');
                }
            } else {
                callBtn.classList.add('hidden');
            }
        } else {
            conversationNameEl.textContent = 'Chat';
            callBtn.classList.add('hidden');
        }

        // --- Update Chat List Highlighting --- 
        renderChatList(conversations);

        // --- Mark Conversation as Read --- 
        await markConversationRead(conversationId);

        // Focus the message input
        messageInput?.focus();

    } catch (error) {
        console.error(`Error loading conversation ${conversationId}:`, error);
        messageList.innerHTML = `<div class="p-4 text-center text-red-500">Error loading messages. Please try again.</div>`;
        conversationNameEl.textContent = 'Error';
        callBtn.classList.add('hidden');
    }
}

async function markConversationRead(conversationId) {
    if (!conversationId) return;
    console.log(`Marking conversation ${conversationId} as read...`);
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/chat/conversations/${conversationId}/mark_read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            console.log(`Conversation ${conversationId} successfully marked as read.`);
            // Update local state immediately for UI responsiveness
            const convIndex = conversations.findIndex(c => c.id === conversationId);
            if (convIndex !== -1) {
                conversations[convIndex].unread_count = 0;
                // Re-render the chat list to remove the unread badge
                renderChatList(conversations);
            }
        } else {
            console.error('Failed to mark conversation as read on server:', response.status);
        }
    } catch (error) {
        console.error('Error during mark read API call:', error);
    }
}


function createMessageElement(msg) {
    if (!msg || !msg.id || !msg.sender_id) {
        console.warn("Invalid message data received:", msg);
        return null;
    }

    const messageWrapper = document.createElement('div');
    const messageDiv = document.createElement('div');
    const isOwnMessage = msg.sender_id === currentUserId;

    messageWrapper.className = `w-full flex mb-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`;
    messageDiv.className = `message ${isOwnMessage ? 'self-end' : 'self-start'}`;
    messageDiv.dataset.messageId = msg.id;
    messageDiv.dataset.senderId = msg.sender_id;

    if (msg.is_deleted) {
        messageDiv.classList.add('deleted', 'italic', 'text-gray-400');
    }

    // Add Reply Preview Box if applicable
    if (msg.replied_to_id && !msg.is_deleted) {
        const replyBox = document.createElement('div');
        const repliedContent = msg.replied_to_content || '[Message unavailable]';
        const repliedIsDeleted = repliedContent === '[Message deleted]';
        let repliedToUserText = msg.replied_to_username || 'Someone';
        if (msg.replied_to_sender === currentUserId) {
            repliedToUserText = 'You';
        }

        replyBox.className = `reply-box ${isOwnMessage ? 'self-end' : 'self-start'}`;
        replyBox.innerHTML = `
            <div class="font-semibold flex items-center gap-1">
                <svg class="w-3 h-3 inline flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                Replied to ${repliedToUserText}
            </div>
            <div class="mt-1 pl-1 truncate ${repliedIsDeleted ? 'italic text-gray-500' : ''}">
                ${repliedContent}
            </div>
        `;

        replyBox.addEventListener('click', (e) => {
            e.stopPropagation();
            const originalMsgEl = document.querySelector(`.message[data-message-id="${msg.replied_to_id}"]`);
            if (originalMsgEl) {
                originalMsgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                originalMsgEl.classList.add('highlight');
                setTimeout(() => originalMsgEl.classList.remove('highlight'), 1500);
            } else {
                showToast("Original message not found (it might be too old).", "warning");
            }
        });
        messageDiv.appendChild(replyBox);
    }

    // Message Content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = msg.is_deleted ? "[Message deleted]" : msg.content;
    messageDiv.appendChild(contentDiv);

    // Timestamp and Read Status
    if (msg.timestamp) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp flex items-center gap-1';

        try {
            const date = new Date(msg.timestamp);
            if (!isNaN(date.getTime())) {
                const timeString = date.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });

                // Add read status for own messages
                if (isOwnMessage) {
                    const isRead = msg.read_at !== null;
                    timestampDiv.innerHTML = `
                        <span>${timeString}</span>
                        <span class="message-status-icon text-xs ${isRead ? 'text-blue-500' : 'text-gray-400'}">
                            ${isRead ? '✓✓' : '✓'}
                        </span>
                    `;
                } else {
                    timestampDiv.textContent = timeString;
                }
            } else {
                timestampDiv.textContent = "Invalid time";
                console.warn("Invalid timestamp format received:", msg.timestamp);
            }
        } catch (e) {
            timestampDiv.textContent = "Time error";
            console.error("Error parsing timestamp:", msg.timestamp, e);
        }

        messageDiv.appendChild(timestampDiv);
    }

    // Add click handler for context menu if not deleted
    if (!msg.is_deleted) {
        messageDiv.addEventListener('click', (e) => handleMessageClick(e, messageDiv));
        messageDiv.addEventListener('dblclick', (e) => {
            e.preventDefault();
            setupReplyUI(msg.id, msg.content, msg.sender_id);
        });
    }

    messageWrapper.appendChild(messageDiv);
    return messageWrapper;
}

// Update the updateMessageReadStatus function
function updateMessageReadStatus(messageIds) {
    if (!Array.isArray(messageIds)) return;
    console.log("Updating read status for messages:", messageIds);

    messageIds.forEach(messageId => {
        const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageElement && messageElement.dataset.senderId == currentUserId) {
            const statusIcon = messageElement.querySelector('.message-status-icon');
            if (statusIcon) {
                statusIcon.innerHTML = '✔✔';
                statusIcon.classList.remove('text-gray-400');
                statusIcon.classList.add('text-blue-500');
            }
        }
    });
}

// Function called when Send button is clicked or Enter is pressed
async function handleSendMessage() {
    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();

    if (!content) return;

    if (!currentConversationId) {
        showToast("Please select a conversation first.", "warning");
        return;
    }

    try {
        const socket = await ensureSocketInitialized();
        if (!socket || !socket.connected) {
            showToast("Not connected to server. Trying to reconnect...", "warning");
            return;
        }

        const messageData = {
            conversation_id: currentConversationId,
            sender_id: currentUserId,
            content: content,
            replied_to_id: null
        };

        const replyingTo = getReplyData();
        if (replyingTo) {
            messageData.replied_to_id = replyingTo.id;
        }

        console.log('Sending message via socket:', messageData);
        socket.emit('message', messageData, (ack) => {
            if (ack?.status === 'success') {
                console.log("Message sent and acknowledged by server.");
            } else if (ack?.status === 'error') {
                console.error("Server reported error sending message:", ack.message);
                showToast(`Server Error: ${ack.message || 'Failed to send'}`, "error");
            }
        });

        // Optimistic UI update
        const optimisticMessage = {
            id: `temp-${Date.now()}`,
            conversation_id: currentConversationId,
            sender_id: currentUserId,
            sender_username: 'You',
            content: content,
            timestamp: new Date().toISOString(),
            is_deleted: false,
            read_at: null,
            replied_to_id: messageData.replied_to_id,
            replied_to_content: replyingTo ? replyingTo.content : null,
            replied_to_sender: replyingTo ? replyingTo.senderId : null,
            replied_to_username: replyingTo ? replyingTo.senderUsername : null,
        };

        const messageElement = createMessageElement(optimisticMessage);
        if (messageElement) {
            messageElement.querySelector('.message')?.classList.add('pending');
            const messageList = document.getElementById('message-list');
            messageList.appendChild(messageElement);
            // Scroll to bottom smoothly
            messageList.scrollTo({
                top: messageList.scrollHeight,
                behavior: 'smooth'
            });
        }

        messageInput.value = '';
        if (typeof hideReplyUI === 'function') {
            hideReplyUI();
        }
        messageInput.focus();
        messageInput.dispatchEvent(new Event('input'));
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message. Please try again.', 'error');
    }
}

// Function to create a new chat
async function createNewChat(otherUserId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/chat/conversations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                participant_ids: [otherUserId]
            })
        });

        if (response.ok) {
            const conversation = await response.json();

            // Add the new conversation to the chat list for both users
            socket.emit('new_conversation', {
                conversation_id: conversation.id,
                participant_ids: [otherUserId]
            });

            // Update the UI
            await loadConversations();
            return conversation;
        } else {
            throw new Error('Failed to create conversation');
        }
    } catch (error) {
        console.error('Error creating chat:', error);
        showToast('Failed to create chat', 'error');
    }
}

// Add this function to handle user status updates
function updateUserStatus(userId, status, lastSeen) {
    // Update status in conversation header if this is the current conversation
    if (currentConversationId) {
        const conversation = conversations.find(conv => conv.id === currentConversationId);
        if (conversation && conversation.participant_details) {
            const otherParticipant = conversation.participant_details.find(p => p.id === userId);
            if (otherParticipant) {
                const statusElement = document.getElementById('user-status');
                if (!statusElement) {
                    // Create status element if it doesn't exist
                    const headerDiv = document.querySelector('.conversation-header');
                    if (headerDiv) {
                        const newStatusElement = document.createElement('div');
                        newStatusElement.id = 'user-status';
                        newStatusElement.className = 'flex items-center text-sm';
                        headerDiv.appendChild(newStatusElement);
                    }
                }

                if (statusElement) {
                    if (status === 'online') {
                        statusElement.innerHTML = `
                            <span class="online-indicator"></span>
                            <span class="text-green-600">Online</span>
                        `;
                    } else {
                        const lastSeenDate = lastSeen ? new Date(lastSeen) : null;
                        const lastSeenText = lastSeenDate ?
                            `Last seen ${formatLastSeen(lastSeenDate)}` :
                            'Offline';
                        statusElement.innerHTML = `
                            <span class="text-gray-500">${lastSeenText}</span>
                        `;
                    }
                }
            }
        }
    }
}

// Helper function to format last seen time
function formatLastSeen(date) {
    const now = new Date();
    const diff = now - date;

    // Less than a minute
    if (diff < 60000) {
        return 'just now';
    }
    // Less than an hour
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    // Less than a day
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    // Less than a week
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    // Otherwise show the date
    return date.toLocaleDateString();
}

// --- Exports ---
// Export functions needed by other modules
export {
    currentConversationId,
    currentUserId,
    currentUsername,
    conversations, // Make conversation list accessible if needed
    loadConversations,
    loadConversation,
    createMessageElement,
    updateMessageReadStatus,
    renderChatList, // Export if needed for socket updates
    showToast // Export showToast if it's defined here
};