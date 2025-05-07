import { currentUserId, conversations, loadConversations } from './chat.js';

let currentProfileUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Set up profile button handlers in navigation
    const myProfileBtn = document.getElementById('my-profile-btn');
    const backToChatBtn = document.getElementById('back-to-chat-btn');
    const backBtn = document.getElementById('back-btn');
    const newChatBtnProfile = document.getElementById('new-chat-btn-profile');
    const newGroupBtnProfile = document.getElementById('new-group-btn-profile');
    const startChatBtn = document.getElementById('start-chat-btn');

    // Set up event listeners for navigation
    if (myProfileBtn) {
        myProfileBtn.addEventListener('click', () => {
            if (currentUserId) {
                showProfile(currentUserId);
            } else {

                console.error("User must be logged in to view profile.");
            }
        });
    }

    if (backToChatBtn) {
        backToChatBtn.addEventListener('click', hideProfile);
    }

    if (backBtn) {
        backBtn.addEventListener('click', hideProfile);
    }

    // Linking the new chat and new group buttons on the profile page to their counterparts on the chat page
    if (newChatBtnProfile) {
        newChatBtnProfile.addEventListener('click', () => {
            hideProfile();
            document.getElementById('new-chat-btn').click();
        });
    }

    if (newGroupBtnProfile) {
        newGroupBtnProfile.addEventListener('click', () => {
            hideProfile();
            document.getElementById('new-group-btn').click();
        });
    }

    // Start conversation with the profile user
    if (startChatBtn) {
        startChatBtn.addEventListener('click', async () => {
            if (!currentProfileUserId || currentProfileUserId === currentUserId) {
                return;
            }

            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    throw new Error('Нет токена авторизации');
                }

                // Create a new conversation with this user
                const response = await fetch('/chat/conversations', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: null,
                        participant_ids: [currentUserId, currentProfileUserId]
                    })
                });

                if (!response.ok) {
                    throw new Error('Не удалось создать беседу');
                }

                const data = await response.json();

                // Switch back to chat view and load the new conversation
                hideProfile();
                await loadConversations();


                if (data.conversation_id) {
                    const loadConversationEvent = new CustomEvent('load-conversation', {
                        detail: { conversationId: data.conversation_id }
                    });
                    document.dispatchEvent(loadConversationEvent);
                }

            } catch (error) {
                console.error('Ошибка создания беседы:', error);

            }
        });
    }

    // Make user names in messages clickable to view profiles
    document.addEventListener('user-link-click', (event) => {
        const userId = event.detail.userId;
        if (userId) {
            showProfile(userId);
        }
    });
});

/**
 * Show the profile page for a specific user
 */
async function showProfile(userId) {
    currentProfileUserId = userId;
    const isOwnProfile = currentUserId === userId;

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Нет токена авторизации');
        }

        // Fetch user profile data
        const response = await fetch(`/auth/profile/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Не удалось загрузить профиль');
        }

        const profileData = await response.json();

        // Switch to profile view
        document.getElementById('chat').classList.add('hidden');
        document.getElementById('profile').classList.remove('hidden');

        // Update profile display
        const profileUsername = document.getElementById('profile-username');
        const profileUserId = document.getElementById('profile-user-id');
        const profileAvatar = document.getElementById('profile-avatar');

        // Set basic profile info
        profileUsername.textContent = profileData.username;
        profileUserId.textContent = `User ID: ${profileData.id}`;

        // Set the avatar with first letter of username
        if (profileData.username && profileData.username.length > 0) {
            profileAvatar.textContent = profileData.username[0].toUpperCase();
        } else {
            profileAvatar.textContent = '?';
        }

        // Show or hide sections based on whether viewing own profile
        const ownProfileStats = document.getElementById('own-profile-stats');
        const otherProfileView = document.getElementById('other-profile-view');

        if (isOwnProfile) {
            ownProfileStats.classList.remove('hidden');
            otherProfileView.classList.add('hidden');

            // Update stats for own profile
            document.getElementById('profile-message-count').textContent =
                profileData.message_count !== undefined ? profileData.message_count : 'N/A';
            document.getElementById('profile-conversation-count').textContent =
                profileData.conversation_count !== undefined ? profileData.conversation_count : 'N/A';

            // Format and display account creation date
            if (profileData.account_created) {
                const createdDate = new Date(profileData.account_created);
                document.getElementById('profile-created-at').textContent =
                    createdDate.toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
            } else {
                document.getElementById('profile-created-at').textContent = 'Недоступно';
            }
        } else {
            ownProfileStats.classList.add('hidden');
            otherProfileView.classList.remove('hidden');

            // Check if already in a conversation with this user
            const existingConversation = conversations.find(conv => {
                return conv.participants &&
                    conv.participants.length === 2 &&
                    conv.participants.includes(profileData.username);
            });

            // Hide start chat button if already in a conversation
            if (existingConversation) {
                document.getElementById('start-chat-btn').classList.add('hidden');

                // Remove any previously created button to prevent duplicates
                const existingBtn = document.querySelector('.existing-chat-btn');
                if (existingBtn) {
                    existingBtn.remove();
                }

                // Add a more beautiful button to open existing conversation
                const existingChatBtn = document.createElement('button');
                existingChatBtn.className = 'existing-chat-btn bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-5 py-2.5 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md flex items-center justify-center space-x-2';

                // Add a nice icon
                const iconSpan = document.createElement('span');
                iconSpan.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                `;

                const textSpan = document.createElement('span');
                textSpan.textContent = 'Open Conversation';

                existingChatBtn.appendChild(iconSpan);
                existingChatBtn.appendChild(textSpan);

                existingChatBtn.addEventListener('click', () => {
                    hideProfile();

                    const loadConversationEvent = new CustomEvent('load-conversation', {
                        detail: { conversationId: existingConversation.id }
                    });
                    document.dispatchEvent(loadConversationEvent);
                });

                document.getElementById('other-profile-view').appendChild(existingChatBtn);
            } else {
                document.getElementById('start-chat-btn').classList.remove('hidden');
            }
        }

        // Mirror the chat list for the sidebar
        const chatListProfile = document.getElementById('chat-list-profile');
        chatListProfile.innerHTML = document.getElementById('chat-list').innerHTML;

        // Re-add event listeners to the mirrored chat list items
        const chatItems = chatListProfile.querySelectorAll('div[class^="flex items-center p-3"]');
        chatItems.forEach((item, index) => {
            if (conversations[index]) {
                item.addEventListener('click', () => {
                    hideProfile();
                    const loadConversationEvent = new CustomEvent('load-conversation', {
                        detail: { conversationId: conversations[index].id }
                    });
                    document.dispatchEvent(loadConversationEvent);
                });
            }
        });

    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        // Toastify({
        //     text: "Не удалось загрузить профиль. Попробуйте снова.",
        //     duration: 3000,
        //     close: true,
        //     gravity: "top",
        //     position: "right",
        //     style: { background: "#F44336" },
        // }).showToast();

        // Fall back to chat view
        hideProfile();
    }
}

/**
 * Hide the profile page and return to chat
 */
function hideProfile() {
    document.getElementById('profile').classList.add('hidden');
    document.getElementById('chat').classList.remove('hidden');
    currentProfileUserId = null;
}

// Export functions that might be needed by other modules
export {
    showProfile,
    hideProfile
};