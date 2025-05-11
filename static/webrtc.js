import { initializeSocket, getSocket } from './socket.js';
import { 
    currentUserId, 
    currentUsername, 
    showToast, 
    currentConversationId,
    conversations 
} from './chat.js';

// --- DOM Elements (Declare vars here, assign in init) ---
let callBtn = null;
let callStatusDiv = null; // Keep for 'calling' status
let callStatusText = null;
let hangUpBtn = null; // Old hangup button in status bar
let incomingCallModal = null;
let callerNameEl = null;
let callerAvatarEl = null;
let acceptCallBtn = null;
let rejectCallBtn = null;
let localAudioEl = null; // Will be assigned from parameter
let remoteAudioEl = null; // Will be assigned from parameter
// --- NEW Active Call Modal Elements ---
let activeCallModal = null;
let activeCallAvatar = null;
let activeCallUsername = null;
let activeCallTimer = null;
let muteCallBtn = null;
let activeHangUpBtn = null;
let micIconUnmuted = null;
let micIconMuted = null;

// --- WebRTC State Management ---
const CallState = {
    IDLE: 'idle',
    CALLING: 'calling',
    RINGING: 'ringing',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ENDED: 'ended'
};

const CallError = {
    USER_OFFLINE: 'user_offline',
    USER_BUSY: 'user_busy',
    NETWORK_ERROR: 'network_error',
    PERMISSION_DENIED: 'permission_denied',
    UNKNOWN: 'unknown'
};

// --- WebRTC Configuration ---
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// --- Call State Management ---
let currentCall = {
    state: CallState.IDLE,
    callId: null,
    roomId: null,
    isInitiator: false,
    otherUserId: null,
    otherUsername: null,
    startTime: null,
    isMuted: false,
    localStream: null,
    remoteStream: null,
    peerConnection: null,
    callTimer: null
};

// --- UI Element References ---
let uiElements = {
    // Call Button
    callBtn: null,
    
    // Call Status Elements
    callStatusDiv: null,
    callStatusText: null,
    hangUpBtn: null,
    
    // Incoming Call Modal
    incomingCallModal: null,
    callerNameEl: null,
    callerAvatarEl: null,
    acceptCallBtn: null,
    rejectCallBtn: null,
    
    // Active Call Modal
    activeCallModal: null,
    activeCallAvatar: null,
    activeCallUsername: null,
    activeCallTimer: null,
    muteCallBtn: null,
    activeHangUpBtn: null,
    micIconUnmuted: null,
    micIconMuted: null,
    
    // Audio Elements
    localAudioEl: null,
    remoteAudioEl: null
};

// --- WebRTC State ---
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let callTimerInterval = null; // <-- Declare here
let callStartTime = null;
let isMuted = false;
let socket = null;

// Helper function to check socket connection
async function isSocketConnected() {
    if (!socket) {
        socket = await initializeSocket();
    }
    return socket && socket.connected;
}

// --- Helper Functions ---

function resetCallState() {
    console.log("Resetting call state");
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    remoteStream = null; // Remote stream is managed by peerConnection
    // Elements are now guaranteed to be assigned if init succeeded
    if (localAudioEl) localAudioEl.srcObject = null;
    if (remoteAudioEl) remoteAudioEl.srcObject = null;

    currentCall = {
        state: CallState.IDLE,
        callId: null,
        roomId: null,
        isInitiator: false,
        otherUserId: null,
        otherUsername: null,
        startTime: null,
        isMuted: false,
        localStream: null,
        remoteStream: null,
        peerConnection: null,
        callTimer: null
    };

    // Stop timer (Now safe to access callTimerInterval)
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callStartTime = null;
    isMuted = false;

    // Ensure active call modal is hidden
    activeCallModal?.classList.add('hidden');
    // Reset mute button state
    if (micIconUnmuted) micIconUnmuted.classList.remove('hidden');
    if (micIconMuted) micIconMuted.classList.add('hidden');

    updateUI();
}

function updateUI() {
    // Add debug logging
    console.log("Updating UI - Current call state:", currentCall.state, "Call details:", {
        isInitiator: currentCall.isInitiator,
        otherUserId: currentCall.otherUserId,
        otherUsername: currentCall.otherUsername
    });

    // Get UI elements from the global namespace
    const ui = window.webrtcUI;
    if (!ui) {
        console.error("WebRTC UI elements not initialized");
        return;
    }

    // Ensure elements exist before updating UI
    const requiredElements = {
        callStatusDiv: ui.callStatusDiv,
        hangUpBtn: ui.hangUpBtn,
        incomingCallModal: ui.incomingCallModal,
        callerNameEl: ui.callerNameEl,
        callerAvatarEl: ui.callerAvatarEl,
        callBtn: ui.callBtn,
        activeCallModal: ui.activeCallModal,
        activeCallUsername: ui.activeCallUsername,
        activeCallTimer: ui.activeCallTimer,
        activeCallAvatar: ui.activeCallAvatar,
        micIconUnmuted: ui.micIconUnmuted,
        micIconMuted: ui.micIconMuted
    };

    const missingElements = Object.entries(requiredElements)
        .filter(([_, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length > 0) {
        console.error("Critical UI elements missing in updateUI:", missingElements);
        return;
    }

    // Hide all call-related UI initially
    ui.callStatusDiv.classList.add('hidden');
    ui.hangUpBtn.classList.add('hidden');
    ui.incomingCallModal.classList.add('hidden');
    ui.activeCallModal.classList.add('hidden');
    ui.callBtn.classList.remove('hidden'); // Show call button by default

    switch (currentCall.state) {
        case CallState.IDLE:
            // Show call button only if a 1-on-1 chat is selected (handled by chat.js)
            break;
        case CallState.CALLING:
            // Show active call modal for caller
            ui.activeCallModal.classList.remove('hidden');
            if (ui.activeCallUsername) {
                ui.activeCallUsername.textContent = `Calling ${currentCall.otherUsername || 'user'}...`;
                console.log("Setting caller username to:", currentCall.otherUsername);
            }
            if (ui.activeCallTimer) ui.activeCallTimer.textContent = '00:00';
            if (ui.activeCallAvatar) {
                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentCall.otherUsername || 'U')}&background=random&size=80&color=fff`;
                ui.activeCallAvatar.src = avatarUrl;
                console.log("Setting caller avatar to:", avatarUrl);
            }
            ui.callBtn.classList.add('hidden');
            break;
        case CallState.RINGING:
            // Show incoming call modal for callee
            console.log("Showing incoming call modal for callee");
            ui.incomingCallModal.classList.remove('hidden');
            if (ui.callerNameEl) {
                ui.callerNameEl.textContent = currentCall.otherUsername || 'Someone';
                console.log("Setting callee caller name to:", currentCall.otherUsername);
            }
            if (ui.callerAvatarEl) {
                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentCall.otherUsername || 'C')}&background=random&size=60`;
                ui.callerAvatarEl.src = avatarUrl;
                console.log("Setting callee avatar to:", avatarUrl);
            }
            ui.callBtn.classList.add('hidden');
            break;
        case CallState.CONNECTING:
            // Show active call modal for both caller and callee
            ui.activeCallModal.classList.remove('hidden');
            if (ui.activeCallUsername) {
                ui.activeCallUsername.textContent = `Connecting to ${currentCall.otherUsername || 'user'}...`;
                console.log("Setting connecting username to:", currentCall.otherUsername);
            }
            if (ui.activeCallTimer) ui.activeCallTimer.textContent = '00:00';
            if (ui.activeCallAvatar) {
                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentCall.otherUsername || 'U')}&background=random&size=80&color=fff`;
                ui.activeCallAvatar.src = avatarUrl;
                console.log("Setting connecting avatar to:", avatarUrl);
            }
            ui.callBtn.classList.add('hidden');
            break;
        case 'connected':
            ui.activeCallModal.classList.remove('hidden');
            if (ui.activeCallUsername) {
                ui.activeCallUsername.textContent = currentCall.otherUsername || 'user';
                console.log("Setting connected username to:", currentCall.otherUsername);
            }
            if (ui.activeCallAvatar) {
                const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentCall.otherUsername || 'U')}&background=random&size=80&color=fff`;
                ui.activeCallAvatar.src = avatarUrl;
                console.log("Setting connected avatar to:", avatarUrl);
            }
            startCallTimer();
            ui.callBtn.classList.add('hidden');
            break;
        default:
            console.warn("Unknown call state:", currentCall.state);
            break;
    }
}

function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callStartTime = Date.now();
    if (!activeCallTimer) return;

    activeCallTimer.textContent = '00:00'; // Reset display

    callTimerInterval = setInterval(() => {
        if (!callStartTime) {
            clearInterval(callTimerInterval);
            return;
        }
        const elapsedSeconds = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
        const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
        if (activeCallTimer) activeCallTimer.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function toggleMute() {
    console.log('Toggling mute, current state:', isMuted);
    if (!localStream) {
        console.error('No local stream available for mute toggle');
        return;
    }
    
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
        console.log(`Track ${track.kind} ${isMuted ? 'muted' : 'unmuted'}`);
    });

    // Update UI
    const ui = window.webrtcUI;
    if (ui) {
        if (ui.micIconUnmuted) ui.micIconUnmuted.classList.toggle('hidden', isMuted);
        if (ui.micIconMuted) ui.micIconMuted.classList.toggle('hidden', !isMuted);
        if (ui.muteCallBtn) {
            ui.muteCallBtn.title = isMuted ? 'Unmute' : 'Mute';
            // Add visual feedback
            ui.muteCallBtn.classList.toggle('bg-red-500', isMuted);
            ui.muteCallBtn.classList.toggle('bg-white', !isMuted);
        }
    }

    // Update call state
    currentCall.isMuted = isMuted;
    console.log(`Microphone ${isMuted ? 'muted' : 'unmuted'}`);
}

async function getMedia() {
    console.log("Requesting microphone access...");
    
    // First ensure audio elements exist
    const ui = window.webrtcUI;
    if (!ui) {
        console.error("WebRTC UI elements not initialized");
        return false;
    }

    // Create audio elements if they don't exist
    if (!ui.localAudioEl) {
        const localAudio = document.createElement('audio');
        localAudio.id = 'local-audio';
        localAudio.autoplay = true;
        localAudio.playsInline = true;
        localAudio.muted = true; // Local audio should be muted
        document.body.appendChild(localAudio);
        ui.localAudioEl = localAudio;
    }

    if (!ui.remoteAudioEl) {
        console.log("Creating remote audio element");
        const remoteAudio = document.createElement('audio');
        remoteAudio.id = 'remote-audio';
        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;
        document.body.appendChild(remoteAudio);
        ui.remoteAudioEl = remoteAudio;
    }

    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });
        
        console.log("Microphone access granted");
        localStream = stream;
        
        // Set the stream to the local audio element
        if (ui.localAudioEl) {
            ui.localAudioEl.srcObject = stream;
            console.log("Local audio stream set");
        } else {
            console.error("Local audio element still not found after creation");
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        showToast('Microphone access denied. Please allow microphone access in your browser settings.', 'error');
        resetCallState();
        return false;
    }
}

function createPeerConnection() {
    // Ensure elements exist before setting srcObject
    if (!remoteAudioEl) {
        console.error("Remote audio element not found in createPeerConnection");
        return;
    }
    console.log("Creating Peer Connection...");
    peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log("Adding local track:", track.kind);
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind);
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteAudioEl.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate:', event.candidate);
            sendSignalingMessage('ice-candidate', event.candidate);
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Peer Connection state changed:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
            case 'connected':
                if (currentCall.state !== 'connected') {
                    currentCall.state = 'connected';
                    currentCall.otherUsername = currentCall.isInitiator ? currentCall.calleeUsername : currentCall.callerUsername;
                    updateUI();
                    showToast('Call connected!', 'success');
                }
                break;
            case 'disconnected':
            case 'failed':
            case 'closed':
                if (currentCall.state !== 'idle') {
                    showToast('Call ended or disconnected.', 'info');
                    resetCallState();
                }
                break;
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection state changed:', peerConnection.iceConnectionState);
        // Can add more detailed handling here if needed
    }
}

function sendSignalingMessage(type, data) {
    if (!isSocketConnected()) {
        console.error("Socket not connected, cannot send signaling message");
        showToast('Connection error, cannot send call signal.', 'error');
        return;
    }
    const targetId = currentCall.isInitiator ? currentCall.calleeId : currentCall.callerId;
    if (!targetId) {
        console.error("Target ID missing for signaling message");
        return;
    }
    console.log(`Sending signal: ${type} to ${targetId}`);
    socket.emit('webrtc_signal', {
        target_id: targetId,
        type: type,
        data: data
    });
}

// --- Call Initiation and Handling ---

async function startCall(calleeId, calleeUsername) {
    try {
        console.log('Starting call:', { 
            calleeId, 
            calleeUsername, 
            caller: {
                id: currentUserId,
                username: currentUsername,
                socketId: socket?.id
            },
            timestamp: new Date().toISOString()
        });
        
        // Validate current state
        if (currentCall.state !== 'idle') {
            console.warn('Cannot start call - already in call state:', {
                currentState: currentCall.state,
                caller: {
                    id: currentUserId,
                    socketId: socket?.id
                }
            });
            showToast('Cannot start call - already in a call', 'warning');
            return;
        }

        // Validate socket
        if (!socket || !socket.connected) {
            console.error('Socket not connected when trying to start call:', {
                socketState: socket?.connected,
                caller: {
                    id: currentUserId,
                    socketId: socket?.id
                }
            });
            showToast('Cannot start call - connection error', 'error');
            return;
        }

        // Get media access first
        if (!await getMedia()) {
            console.error('Failed to get media access for caller:', {
                id: currentUserId,
                socketId: socket?.id
            });
            return;
        }

        // Generate unique room ID for this call
        const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Update call state
        currentCall = {
            state: 'calling',
            roomId: roomId,
            callerId: currentUserId,
            callerUsername: currentUsername,
            calleeId: calleeId,
            calleeUsername: calleeUsername,
            startTime: null,
            isMuted: false,
            isInitiator: true,
            localStream: localStream
        };

        // Update UI to show calling state
        updateUI();

        // Emit call request with more detailed logging
        const callRequestData = {
            roomId: roomId,
            callerId: currentUserId,
            callerUsername: currentUsername,
            calleeId: calleeId,
            timestamp: new Date().toISOString()
        };
        
        console.log('Emitting call request:', {
            requestData: callRequestData,
            caller: {
                id: currentUserId,
                username: currentUsername,
                socketId: socket.id
            },
            timestamp: new Date().toISOString()
        });
        
        socket.emit('call_request', callRequestData, (response) => {
            console.log('Call request acknowledgment:', {
                response,
                caller: {
                    id: currentUserId,
                    username: currentUsername,
                    socketId: socket.id
                },
                timestamp: new Date().toISOString()
            });
            if (response && response.error) {
                console.error('Call request failed:', {
                    error: response.error,
                    caller: {
                        id: currentUserId,
                        socketId: socket.id
                    }
                });
                showToast(`Call request failed: ${response.error}`, 'error');
                resetCallState();
            }
        });

        // Set timeout for call request
        setTimeout(() => {
            if (currentCall.state === 'calling') {
                console.log('Call request timed out:', {
                    caller: {
                        id: currentUserId,
                        username: currentUsername,
                        socketId: socket.id
                    },
                    timestamp: new Date().toISOString()
                });
                showToast('No answer received', 'info');
                endCall();
            }
        }, 30000); // 30 second timeout

    } catch (error) {
        console.error('Error starting call:', {
            error,
            caller: {
                id: currentUserId,
                socketId: socket?.id
            }
        });
        showToast('Failed to start call', 'error');
        resetCallState();
    }
}

function handleIncomingCall(data) {
    try {
        console.log('Handling incoming call:', data);
        
        // Validate incoming call data
        if (!data || !data.callerId || !data.callerUsername || !data.roomId) {
            console.error('Invalid incoming call data:', data);
            return;
        }

        // Check if already in a call
        if (currentCall.state !== 'idle') {
            console.log('Rejecting incoming call - already in call state:', currentCall.state);
            socket.emit('call_rejected', {
                roomId: data.roomId,
                callerId: data.callerId,
                reason: 'User is busy'
            });
            return;
        }

        // Update call state
        currentCall = {
            state: 'ringing',
            roomId: data.roomId,
            callerId: data.callerId,
            callerUsername: data.callerUsername,
            calleeId: currentUserId,
            calleeUsername: currentUsername,
            startTime: null,
            isMuted: false,
            isInitiator: false
        };

        // Update UI to show incoming call
        const ui = window.webrtcUI;
        if (!ui) {
            console.error('WebRTC UI elements not found');
            return;
        }

        // Show incoming call modal with animation
        if (ui.incomingCallModal && ui.callerNameEl && ui.callerAvatarEl) {
            ui.callerNameEl.textContent = data.callerUsername;
            ui.callerAvatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.callerUsername)}&background=random&size=60`;
            ui.incomingCallModal.classList.remove('hidden');
            ui.incomingCallModal.classList.add('animate-fade-scale');
            
            // Ensure buttons are properly set up
            if (ui.acceptCallBtn) {
                ui.acceptCallBtn.onclick = () => {
                    console.log('Accept call button clicked');
                    acceptCall();
                };
            }
            if (ui.rejectCallBtn) {
                ui.rejectCallBtn.onclick = () => {
                    console.log('Reject call button clicked');
                    rejectCall();
                };
            }
        } else {
            console.error('Missing UI elements for incoming call modal');
        }

        // Set auto-reject timeout
        currentCall.autoRejectTimeout = setTimeout(() => {
            if (currentCall.state === 'ringing') {
                console.log('Auto-rejecting unanswered call');
                rejectCall();
            }
        }, 30000); // 30 second timeout

        // Update overall UI state
        updateUI();

    } catch (error) {
        console.error('Error handling incoming call:', error);
        showToast('Error receiving call', 'error');
        resetCallState();
    }
}

async function acceptCall() {
    console.log("Accepting call, current state:", currentCall.state);
    
    if (currentCall.state !== 'ringing') {
        console.warn("Cannot accept call - not in ringing state");
        return;
    }

    try {
        // Get media access first
        if (!await getMedia()) {
            console.error('Failed to get media access');
            rejectCall();
            return;
        }

        // Stop ringtone
        if (currentCall.ringtone) {
            currentCall.ringtone.pause();
            currentCall.ringtone.currentTime = 0;
        }

        // Clear incoming call timeout
        if (currentCall.autoRejectTimeout) {
            clearTimeout(currentCall.autoRejectTimeout);
            currentCall.autoRejectTimeout = null;
        }

        // Update call state
        currentCall.state = 'connecting';
        currentCall.localStream = localStream;
        updateUI();

        // Create peer connection
        createPeerConnection();

        // Notify caller that call is accepted
        socket.emit('call_accepted', {
            roomId: currentCall.roomId,
            callerId: currentCall.callerId,
            calleeId: currentUserId,
            calleeUsername: currentUsername
        });

        console.log("Call acceptance sent to caller");
    } catch (error) {
        console.error('Error accepting call:', error);
        showToast('Failed to accept call', 'error');
        rejectCall();
    }
}

function rejectCall() {
    console.log("Rejecting call, current state:", currentCall.state);
    
    if (currentCall.state !== 'ringing' && currentCall.state !== 'connecting') {
        console.warn("Cannot reject call - not in ringing or connecting state");
        return;
    }

    // Stop ringtone
    if (currentCall.ringtone) {
        currentCall.ringtone.pause();
        currentCall.ringtone.currentTime = 0;
    }

    // Clear incoming call timeout
    if (currentCall.autoRejectTimeout) {
        clearTimeout(currentCall.autoRejectTimeout);
        currentCall.autoRejectTimeout = null;
    }

    // Notify caller if we're rejecting an incoming call
    if (!currentCall.isInitiator && currentCall.callerId) {
        socket.emit('reject_call', {
            callerId: currentCall.callerId,
            reason: 'rejected'
        });
    }

    // Reset call state
    resetCallState();
    updateUI();
}

function endCall() {
    console.log('Ending call, current state:', currentCall.state);
    
    if (currentCall.state === 'idle') {
        console.log('No active call to end');
        return;
    }

    // Stop any playing ringtone
    if (currentCall.ringtone) {
        currentCall.ringtone.pause();
        currentCall.ringtone.currentTime = 0;
    }

    // Notify the other party
    const targetId = currentCall.isInitiator ? currentCall.calleeId : currentCall.callerId;
    if (targetId) {
        socket.emit('call_ended', {
            target_id: targetId,
            room_id: currentCall.roomId,
            reason: 'User ended the call'
        });
    }

    // Reset everything
    resetCallState();
    showToast('Call ended', 'info');
}

// --- Signaling Message Handlers ---

async function handleWebRTCSignal(data) {
    console.log('Received WebRTC signal:', data.type, 'from', data.sender_id);

    // Ensure peer connection exists if needed
    if (!peerConnection && (data.type === 'answer' || data.type === 'ice-candidate')) {
        console.warn('Received signal but peer connection does not exist. Creating...');
        if (!localStream && !await getMedia()) {
            console.error("Cannot handle signal without local media.");
            return;
        }
        createPeerConnection();
    }

    // If receiving an offer, ensure PC exists before setting remote description
    if (!peerConnection && data.type === 'offer') {
        if (!localStream && !await getMedia()) {
            console.error("Cannot handle offer without local media.");
            return;
        }
        createPeerConnection();
    }

    try {
        switch (data.type) {
            case 'offer':
                if (!currentCall.isInitiator && currentCall.state === 'connecting') {
                    console.log('Setting remote description (offer)');
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.data));
                    console.log('Creating answer...');
                    const answer = await peerConnection.createAnswer();
                    console.log('Setting local description (answer)');
                    await peerConnection.setLocalDescription(answer);
                    sendSignalingMessage('answer', answer);
                } else {
                    console.warn('Received offer in unexpected state:', currentCall.state);
                }
                break;

            case 'answer':
                if (currentCall.isInitiator && currentCall.state === 'connecting') {
                    console.log('Setting remote description (answer)');
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.data));
                } else {
                    console.warn('Received answer in unexpected state:', currentCall.state);
                }
                break;

            case 'ice-candidate':
                if (data.data && peerConnection) {
                    console.log('Adding ICE candidate');
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.data));
                }
                break;

            default:
                console.warn('Unknown signal type:', data.type);
        }
    } catch (error) {
        console.error('Error handling WebRTC signal:', error);
        showToast(`Error processing call signal: ${error.message}`, 'error');
        resetCallState();
    }
}

function handleCallResponse(data) {
    console.log('Received call response:', data);
    if (!currentCall.isInitiator || currentCall.callerId !== currentUserId || currentCall.calleeId !== data.callee_id) {
        console.warn('Received call response for a different call or as callee.');
        return;
    }

    if (data.response === 'accepted') {
        showToast(`${currentCall.calleeUsername || 'User'} accepted the call. Connecting...`, 'info');
        currentCall.state = 'connecting';
        currentCall.callId = data.call_id;
        currentCall.otherUsername = currentCall.calleeUsername;
        updateUI();

        // Now create the peer connection and the offer
        createPeerConnection();
        peerConnection.createOffer()
            .then(offer => {
                console.log('Setting local description (offer)');
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                console.log('Sending offer');
                sendSignalingMessage('offer', peerConnection.localDescription);
            })
            .catch(error => {
                console.error('Error creating offer:', error);
                showToast('Failed to initiate call connection.', 'error');
                resetCallState();
            });
    } else if (data.response === 'rejected') {
        showToast(`${currentCall.calleeUsername || 'User'} rejected the call.`, 'warning');
        resetCallState();
    } else if (data.response === 'busy') {
        showToast(`${currentCall.calleeUsername || 'User'} is busy.`, 'warning');
        resetCallState();
    }
}

function handleCallEnded(data) {
    console.log('Received call_ended signal:', data);
    if (currentCall.callId === data.call_id && currentCall.state !== 'idle') {
        showToast('Call ended by the other user.', 'info');
        resetCallState();
    }
}

function handleCallUnavailable(data) {
    console.log('Received call_unavailable signal:', data);
    if (currentCall.isInitiator && currentCall.calleeId === data.callee_id && currentCall.state === 'calling') {
        showToast(`${currentCall.calleeUsername || 'User'} is not available.`, 'warning');
        resetCallState();
    }
}

function handleCallError(data) {
    console.error('Received call_error signal:', data);
    showToast(`Call error: ${data.message || 'Unknown error'}`, 'error');
    resetCallState(); // Reset state on any call error
}

// WebRTC Signal Handlers
function handleIceCandidate(data) {
    console.log('Received ICE candidate:', data);
    if (!peerConnection) {
        console.warn('Received ICE candidate but no peer connection exists');
        return;
    }
    
    try {
        if (data.candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(error => {
                    console.error('Error adding ICE candidate:', error);
                });
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

function handleCallOffer(data) {
    console.log('Received call offer:', data);
    if (!peerConnection) {
        console.warn('Received offer but no peer connection exists');
        return;
    }

    try {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
            .then(() => peerConnection.createAnswer())
            .then(answer => peerConnection.setLocalDescription(answer))
            .then(() => {
                socket.emit('call_answer', {
                    target_id: data.sender_id,
                    answer: peerConnection.localDescription
                });
            })
            .catch(error => {
                console.error('Error handling call offer:', error);
                showToast('Error processing call offer', 'error');
                resetCallState();
            });
    } catch (error) {
        console.error('Error handling call offer:', error);
        showToast('Error processing call offer', 'error');
        resetCallState();
    }
}

function handleCallAnswer(data) {
    console.log('Received call answer:', data);
    if (!peerConnection) {
        console.warn('Received answer but no peer connection exists');
        return;
    }

    try {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
            .catch(error => {
                console.error('Error handling call answer:', error);
                showToast('Error processing call answer', 'error');
                resetCallState();
            });
    } catch (error) {
        console.error('Error handling call answer:', error);
        showToast('Error processing call answer', 'error');
        resetCallState();
    }
}

// --- Event Listeners ---
function setupWebRTCListeners(socket) {
    if (!socket) {
        console.error('Cannot set up WebRTC listeners: socket is null');
        return;
    }

    // Ensure elements exist before adding listeners
    if (!hangUpBtn || !acceptCallBtn || !rejectCallBtn || !activeHangUpBtn || !muteCallBtn) {
        console.warn("UI elements not yet initialized in setupWebRTCListeners");
        return;
    }

    // UI Listeners
    // Old hangup button (used during 'calling' state)
    hangUpBtn.addEventListener('click', endCall);
    // Incoming call modal buttons
    acceptCallBtn.addEventListener('click', acceptCall);
    rejectCallBtn.addEventListener('click', rejectCall);
    // --- NEW Active Call Modal Buttons ---
    activeHangUpBtn.addEventListener('click', endCall);
    muteCallBtn.addEventListener('click', toggleMute);

    // Socket Listeners
    console.log("Setting up WebRTC socket listeners...");
    socket.on('incoming_call', handleIncomingCall);
    socket.on('call_response', handleCallResponse);
    socket.on('webrtc_signal', handleWebRTCSignal);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_unavailable', handleCallUnavailable);
    socket.on('call_error', handleCallError);

    socket.on('call_accepted', (data) => {
        console.log("Call accepted by callee:", data);
        if (currentCall.state !== 'calling') {
            console.warn("Received call_accepted in unexpected state:", currentCall.state);
            return;
        }

        // Update call state
        currentCall.state = 'connecting';
        currentCall.roomId = data.roomId || currentCall.roomId;
        updateUI();

        // Initialize WebRTC as caller
        initializeWebRTC(true);
    });

    socket.on('call_rejected', (data) => {
        console.log("Call rejected by callee:", data);
        if (currentCall.state !== 'calling' && currentCall.state !== 'connecting') {
            console.warn("Received call_rejected in unexpected state:", currentCall.state);
            return;
        }

        // Show rejection reason if available
        if (data.reason) {
            showNotification(`Call rejected: ${data.reason}`, 'error');
        } else {
            showNotification('Call rejected', 'error');
        }

        // Reset call state
        resetCallState();
        updateUI();
    });

    socket.on('call_ended', (data) => {
        console.log("Call ended by other party:", data);
        if (currentCall.state === 'idle') {
            console.warn("Received call_ended in idle state");
            return;
        }

        // Show who ended the call if available
        if (data.endedBy) {
            showNotification(`Call ended by ${data.endedBy}`, 'info');
        } else {
            showNotification('Call ended', 'info');
        }

        // Reset call state
        resetCallState();
        updateUI();
    });
}

// Function to store UI element references
function storeUIElements(params) {
    console.log('Storing WebRTC UI elements...');
    
    // Define all UI elements with their corresponding DOM elements
    const elements = {
        // Call button and status
        callBtn: document.getElementById('call-btn'),
        callStatusDiv: document.getElementById('call-status'),
        callStatusText: document.getElementById('call-status-text'),
        hangUpBtn: document.getElementById('hang-up-btn'),
        
        // Incoming call modal
        incomingCallModal: document.getElementById('incoming-call-modal'),
        callerNameEl: document.getElementById('caller-name'),
        callerAvatarEl: document.getElementById('caller-avatar'),
        acceptCallBtn: document.getElementById('accept-call-btn'),
        rejectCallBtn: document.getElementById('reject-call-btn'),
        
        // Active call modal
        activeCallModal: document.getElementById('active-call-modal'),
        activeCallAvatar: document.getElementById('active-call-avatar'),
        activeCallUsername: document.getElementById('active-call-username'),
        activeCallTimer: document.getElementById('active-call-timer'),
        muteCallBtn: document.getElementById('mute-call-btn'),
        activeHangUpBtn: document.getElementById('active-hang-up-btn'),
        micIconUnmuted: document.getElementById('mic-icon-unmuted'),
        micIconMuted: document.getElementById('mic-icon-muted'),
        
        // Audio elements - try to find existing ones first
        localAudioEl: document.getElementById('local-audio'),
        remoteAudioEl: document.getElementById('remote-audio')
    };

    // If audio elements don't exist in DOM, create them
    if (!elements.localAudioEl) {
        console.log("Creating local audio element");
        const localAudio = document.createElement('audio');
        localAudio.id = 'local-audio';
        localAudio.autoplay = true;
        localAudio.playsInline = true;
        localAudio.muted = true;
        document.body.appendChild(localAudio);
        elements.localAudioEl = localAudio;
    }

    if (!elements.remoteAudioEl) {
        console.log("Creating remote audio element");
        const remoteAudio = document.createElement('audio');
        remoteAudio.id = 'remote-audio';
        remoteAudio.autoplay = true;
        remoteAudio.playsInline = true;
        document.body.appendChild(remoteAudio);
        elements.remoteAudioEl = remoteAudio;
    }

    // Log status of all elements with more detail
    console.log('WebRTC UI elements status:');
    Object.entries(elements).forEach(([key, element]) => {
        console.log(`${key}: ${element ? 'Found' : 'Missing'} (ID: ${element?.id || 'N/A'})`);
    });

    // Check if we have all critical elements
    const criticalElements = [
        'callBtn',
        'callStatusDiv',
        'callStatusText',
        'hangUpBtn',
        'incomingCallModal',
        'callerNameEl',
        'callerAvatarEl',
        'acceptCallBtn',
        'rejectCallBtn',
        'localAudioEl',
        'remoteAudioEl',
        'activeCallModal',
        'activeCallAvatar',
        'activeCallUsername',
        'activeCallTimer',
        'muteCallBtn',
        'activeHangUpBtn',
        'micIconUnmuted',
        'micIconMuted'
    ];

    const missingCritical = criticalElements.filter(key => !elements[key]);
    if (missingCritical.length > 0) {
        console.error('Missing critical WebRTC UI elements:', missingCritical.map(key => ({
            element: key,
            expectedId: elements[key]?.id || 'unknown'
        })));
        return false;
    }

    // Store elements in global scope
    Object.keys(elements).forEach(key => {
        window[key] = elements[key];
    });
    
    // Also store in a namespaced object for easy access
    window.webrtcUI = elements;

    console.log('All WebRTC UI elements stored successfully');
    return true;
}

// --- Initialization ---
async function initializeWebRTC(uiElements) {
    try {
        console.log('Initializing WebRTC with UI elements:', uiElements);
        
        // Store UI elements and validate
        if (!storeUIElements(uiElements)) {
            throw new Error('Failed to store UI elements');
        }

        // Initialize socket if not already done
        if (!socket || !socket.connected) {
            console.log('Initializing socket for WebRTC...');
            socket = await initializeSocket();
            if (!socket || !socket.connected) {
                throw new Error('Failed to initialize socket connection');
            }
            console.log('Socket connected successfully for WebRTC. Socket ID:', socket.id);
        } else {
            console.log('Socket already connected for WebRTC. Socket ID:', socket.id);
        }

        // Verify socket connection and setup listeners
        socket.on('connect', () => {
            console.log('WebRTC socket connected. Socket ID:', socket.id, 'User ID:', currentUserId);
            // Emit a test event to verify connection
            socket.emit('webrtc_test_connection', {
                userId: currentUserId,
                username: currentUsername,
                socketId: socket.id
            });
        });

        socket.on('disconnect', () => {
            console.warn('WebRTC socket disconnected. Socket ID:', socket.id);
            showToast('Connection lost. Please refresh the page.', 'error');
        });

        // Setup socket event listeners for calls
        setupCallSocketListeners();

        // Initialize audio elements
        if (localAudioEl && remoteAudioEl) {
            localAudioEl.autoplay = true;
            localAudioEl.playsInline = true;
            localAudioEl.muted = true; // Local audio should be muted
            
            remoteAudioEl.autoplay = true;
            remoteAudioEl.playsInline = true;
        }

        // Setup call button click handler
        if (callBtn) {
            callBtn.addEventListener('click', async () => {
                if (!currentConversationId) {
                    showToast('Please select a conversation first', 'warning');
                    return;
                }
                const conversation = conversations.find(conv => conv.id === currentConversationId);
                if (!conversation || !conversation.participant_details || conversation.participant_details.length !== 2) {
                    showToast('Calls are only available in 1-on-1 chats', 'warning');
                    return;
                }
                const otherParticipant = conversation.participant_details.find(p => p.id !== currentUserId);
                if (otherParticipant) {
                    // Ensure socket is connected before starting call
                    if (!socket || !socket.connected) {
                        console.log('Reconnecting socket before starting call...');
                        socket = await initializeSocket();
                        if (!socket || !socket.connected) {
                            showToast('Cannot start call - connection error', 'error');
                            return;
                        }
                    }
                    startCall(otherParticipant.id, otherParticipant.username);
                }
            });
        }

        console.log('WebRTC initialization complete for user:', currentUserId);
        return true;
    } catch (error) {
        console.error('WebRTC initialization failed:', error);
        showToast('Call feature initialization failed: ' + error.message, 'error');
        return false;
    }
}

function setupCallSocketListeners() {
    if (!socket) {
        console.error('Socket not available for setting up call listeners');
        return;
    }

    console.log('Setting up call socket listeners for socket ID:', socket.id, 'User ID:', currentUserId);

    // Remove any existing listeners to prevent duplicates
    socket.off('call_request');
    socket.off('call_accepted');
    socket.off('call_rejected');
    socket.off('call_ended');
    socket.off('call_ice_candidate');
    socket.off('call_offer');
    socket.off('call_answer');
    socket.off('webrtc_signal');
    socket.off('webrtc_test_connection');
    socket.off('direct_call_request');
    socket.off('direct_call_response');

    // Test connection event with more detailed logging
    socket.on('webrtc_test_connection', (data) => {
        console.log('WebRTC test connection received:', {
            from: data,
            currentUser: {
                id: currentUserId,
                username: currentUsername,
                socketId: socket.id
            },
            timestamp: new Date().toISOString()
        });
    });

    // Setup call-related socket listeners with enhanced logging
    socket.on('connect', () => {
        console.log('Socket connected for WebRTC:', {
            socketId: socket.id,
            userId: currentUserId,
            username: currentUsername,
            timestamp: new Date().toISOString()
        });
        
        // Emit a test event to verify connection
        socket.emit('webrtc_test_connection', {
            userId: currentUserId,
            username: currentUsername,
            socketId: socket.id,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('disconnect', () => {
        console.warn('Socket disconnected for WebRTC:', {
            socketId: socket.id,
            userId: currentUserId,
            username: currentUsername,
            timestamp: new Date().toISOString()
        });
    });

    // Add direct call listeners
    socket.on('direct_call_request', handleDirectCallRequest);

    // Keep existing call request handling for backward compatibility
    socket.on('call_request', (data) => {
        console.log('Call request received:', {
            data,
            currentUser: {
                id: currentUserId,
                username: currentUsername,
                socketId: socket.id
            },
            timestamp: new Date().toISOString()
        });
        
        // Validate incoming call data
        if (!data || !data.callerId || !data.callerUsername || !data.roomId) {
            console.error('Invalid call request data:', {
                data,
                currentUser: {
                    id: currentUserId,
                    socketId: socket.id
                }
            });
            return;
        }

        // Verify this call is intended for this user
        if (data.calleeId !== currentUserId) {
            console.warn('Call request intended for different user:', {
                receivedFor: data.calleeId,
                currentUser: currentUserId,
                socketId: socket.id
            });
            return;
        }

        console.log('Processing valid call request:', {
            callData: data,
            currentUser: {
                id: currentUserId,
                username: currentUsername,
                socketId: socket.id
            },
            timestamp: new Date().toISOString()
        });

        // Play ringtone for incoming call
        try {
            const ringtone = new Audio('/static/ringtone.mp3');
            ringtone.loop = true;
            ringtone.play().catch(error => {
                console.error('Error playing ringtone:', {
                    error,
                    currentUser: {
                        id: currentUserId,
                        socketId: socket.id
                    }
                });
            });
            currentCall.ringtone = ringtone;
        } catch (error) {
            console.error('Error creating ringtone:', {
                error,
                currentUser: {
                    id: currentUserId,
                    socketId: socket.id
                }
            });
        }
        
        handleIncomingCall(data);
    });

    // Keep other existing socket listeners
    socket.on('call_accepted', (data) => {
        console.log("Call accepted by callee:", data);
        if (currentCall.state !== 'calling') {
            console.warn("Received call_accepted in unexpected state:", currentCall.state);
            return;
        }

        // Update call state
        currentCall.state = 'connecting';
        currentCall.roomId = data.roomId || currentCall.roomId;
        updateUI();

        // Initialize WebRTC as caller
        initializeWebRTC(true);
    });

    socket.on('call_rejected', (data) => {
        console.log("Call rejected by callee:", data);
        if (currentCall.state !== 'calling' && currentCall.state !== 'connecting') {
            console.warn("Received call_rejected in unexpected state:", currentCall.state);
            return;
        }

        // Show rejection reason if available
        if (data.reason) {
            showNotification(`Call rejected: ${data.reason}`, 'error');
        } else {
            showNotification('Call rejected', 'error');
        }

        // Reset call state
        resetCallState();
        updateUI();
    });

    socket.on('call_ended', (data) => {
        console.log("Call ended by other party:", data);
        if (currentCall.state === 'idle') {
            console.warn("Received call_ended in idle state");
            return;
        }

        // Show who ended the call if available
        if (data.endedBy) {
            showNotification(`Call ended by ${data.endedBy}`, 'info');
        } else {
            showNotification('Call ended', 'info');
        }

        // Reset call state
        resetCallState();
        updateUI();
    });

    socket.on('webrtc_signal', handleWebRTCSignal);
}

async function createAndSendOffer() {
    try {
        console.log('Creating and sending offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignalingMessage('offer', offer);
    } catch (error) {
        console.error('Error creating/sending offer:', error);
        showToast('Failed to initiate call connection', 'error');
        resetCallState();
    }
}

// Add new direct call connection function
async function connectDirectCall(targetUserId, targetUsername) {
    try {
        console.log('Attempting direct call connection:', {
            target: { id: targetUserId, username: targetUsername },
            caller: { id: currentUserId, username: currentUsername }
        });

        // First ensure we have socket connection
        if (!socket || !socket.connected) {
            console.log('Reconnecting socket for direct call...');
            socket = await initializeSocket();
            if (!socket || !socket.connected) {
                throw new Error('Socket connection failed');
            }
        }

        // Get media access
        if (!await getMedia()) {
            throw new Error('Microphone access denied');
        }

        // Create a simple call ID
        const callId = `direct_${currentUserId}_${targetUserId}_${Date.now()}`;

        // Update call state
        currentCall = {
            state: 'calling',
            callId: callId,
            isInitiator: true,
            otherUserId: targetUserId,
            otherUsername: targetUsername,
            startTime: null,
            isMuted: false,
            localStream: localStream
        };

        // Update UI
        updateUI();

        // Send direct call request
        socket.emit('direct_call_request', {
            callId: callId,
            callerId: currentUserId,
            callerUsername: currentUsername,
            targetId: targetUserId,
            timestamp: Date.now()
        });

        // Set up direct call response handler
        socket.once('direct_call_response', (response) => {
            console.log('Received direct call response:', response);
            
            if (response.accepted) {
                // Call was accepted
                currentCall.state = 'connecting';
                updateUI();
                
                // Create peer connection and start call
                createPeerConnection();
                createAndSendOffer();
            } else {
                // Call was rejected
                showToast(`Call ${response.reason || 'rejected'}`, 'info');
                resetCallState();
            }
        });

        // Set timeout for call request
        setTimeout(() => {
            if (currentCall.state === 'calling') {
                showToast('No answer received', 'info');
                resetCallState();
            }
        }, 30000);

    } catch (error) {
        console.error('Direct call connection failed:', error);
        showToast('Call failed: ' + error.message, 'error');
        resetCallState();
    }
}

// Add direct call request handler
function handleDirectCallRequest(data) {
    console.log('Received direct call request:', data);

    // Validate request
    if (!data || !data.callerId || !data.callerUsername || !data.callId) {
        console.error('Invalid direct call request:', data);
        return;
    }

    // Check if we're already in a call
    if (currentCall.state !== 'idle') {
        socket.emit('direct_call_response', {
            callId: data.callId,
            accepted: false,
            reason: 'User is busy'
        });
        return;
    }

    // Update call state
    currentCall = {
        state: 'ringing',
        callId: data.callId,
        isInitiator: false,
        otherUserId: data.callerId,
        otherUsername: data.callerUsername,
        startTime: null,
        isMuted: false
    };

    // Show incoming call UI
    updateUI();

    // Play ringtone
    try {
        const ringtone = new Audio('/static/ringtone.mp3');
        ringtone.loop = true;
        ringtone.play().catch(console.error);
        currentCall.ringtone = ringtone;
    } catch (error) {
        console.error('Error playing ringtone:', error);
    }

    // Set up accept/reject handlers
    const ui = window.webrtcUI;
    if (ui) {
        if (ui.acceptCallBtn) {
            ui.acceptCallBtn.onclick = async () => {
                // Get media access
                if (!await getMedia()) {
                    socket.emit('direct_call_response', {
                        callId: data.callId,
                        accepted: false,
                        reason: 'Media access denied'
                    });
                    return;
                }

                // Stop ringtone
                if (currentCall.ringtone) {
                    currentCall.ringtone.pause();
                    currentCall.ringtone = null;
                }

                // Accept call
                socket.emit('direct_call_response', {
                    callId: data.callId,
                    accepted: true
                });

                // Update state
                currentCall.state = 'connecting';
                currentCall.localStream = localStream;
                updateUI();

                // Create peer connection
                createPeerConnection();
            };
        }

        if (ui.rejectCallBtn) {
            ui.rejectCallBtn.onclick = () => {
                socket.emit('direct_call_response', {
                    callId: data.callId,
                    accepted: false,
                    reason: 'User rejected'
                });
                resetCallState();
            };
        }
    }

    // Auto-reject after 30 seconds
    setTimeout(() => {
        if (currentCall.state === 'ringing') {
            socket.emit('direct_call_response', {
                callId: data.callId,
                accepted: false,
                reason: 'No answer'
            });
            resetCallState();
        }
    }, 30000);
}

// --- Exports ---
export {
    // Core WebRTC functions
    initializeWebRTC,
    startCall,
    handleIncomingCall,
    endCall,
    toggleMute,
    
    // State and enums
    CallState,
    CallError,
    currentCall,
    
    // UI updates
    updateUI as updateWebRTCUI
};

// Helper function to show notifications
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // You can implement a UI notification system here if needed
}
