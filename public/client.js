class RandomVideoChat {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isConnected = false;
        this.partnerFound = false;

        this.initializeApp();
        this.setupEventListeners();
    }

    initializeApp() {
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    setupEventListeners() {
        document.getElementById('startChatBtn').addEventListener('click', () => this.startChat());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextPartner());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveChat());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('retryPermissions').addEventListener('click', () => this.startChat());
    }

    async startChat() {
        try {
            // Request camera and microphone
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // Show chat screen
            this.showScreen('chatScreen');
            this.hideModal('permissionModal');

            // Initialize socket connection
            this.socket = io();

            // Setup socket events
            this.setupSocketEvents();

            // Start finding partner
            this.socket.emit('find-partner');

            // Show local video
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.showModal('permissionModal');
        }
    }

    setupSocketEvents() {
        this.socket.on('waiting-for-partner', () => {
            this.updateStatus('Searching for partner...', 'waiting');
            this.showWaitingScreen();
            this.disableChat();
        });

        this.socket.on('partner-found', () => {
            this.partnerFound = true;
            this.updateStatus('Connected to stranger', 'connected');
            this.hideWaitingScreen();
            this.enableChat();
            this.setupWebRTC();
            this.addSystemMessage('You are now connected with a stranger');
        });

        this.socket.on('partner-disconnected', () => {
            this.addSystemMessage('Stranger disconnected');
            this.handlePartnerDisconnect();
        });

        this.socket.on('find-new-partner', () => {
            this.socket.emit('find-partner');
        });

        this.socket.on('receive-message', (data) => {
            this.displayMessage(data.message, false);
        });

        // WebRTC events
        this.socket.on('webrtc-offer', async (offer) => {
            await this.handleOffer(offer);
        });

        this.socket.on('webrtc-answer', async (answer) => {
            await this.handleAnswer(answer);
        });

        this.socket.on('webrtc-ice-candidate', async (candidate) => {
            await this.handleIceCandidate(candidate);
        });
    }

    async setupWebRTC() {
        this.peerConnection = new RTCPeerConnection(this.rtcConfig);

        // Add local stream tracks
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                this.remoteStream = event.streams[0];
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    candidate: event.candidate
                });
            }
        };

        // Create and send offer
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('webrtc-offer', { offer: offer });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(offer) {
        if (!this.peerConnection) return;

        try {
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.socket.emit('webrtc-answer', { answer: answer });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer) {
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(answer);
        }
    }

    async handleIceCandidate(candidate) {
        if (this.peerConnection && candidate) {
            await this.peerConnection.addIceCandidate(candidate);
        }
    }

    nextPartner() {
        if (this.socket) {
            this.socket.emit('next-partner');
            this.handlePartnerDisconnect();
            this.addSystemMessage('Looking for new partner...');
        }
    }

    handlePartnerDisconnect() {
        this.partnerFound = false;
        this.updateStatus('Searching for partner...', 'waiting');
        this.showWaitingScreen();
        this.disableChat();
        
        // Clear remote video
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = null;
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    leaveChat() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // Stop all media tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        this.showScreen('welcomeScreen');
        this.clearChat();
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (message && this.socket && this.partnerFound) {
            this.socket.emit('send-message', { message });
            this.displayMessage(message, true);
            messageInput.value = '';
        }
    }

    displayMessage(message, isOwn) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwn ? 'own' : 'other'}`;
        messageElement.textContent = message;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addSystemMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        messageElement.textContent = message;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    clearChat() {
        document.getElementById('messagesContainer').innerHTML = '';
    }

    updateStatus(text, type) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.innerHTML = type === 'connected' 
            ? `<i class="fas fa-check-circle"></i> ${text}`
            : `<i class="fas fa-search"></i> ${text}`;
        statusElement.className = `status-${type}`;
    }

    showWaitingScreen() {
        document.getElementById('waitingScreen').classList.remove('hidden');
        document.getElementById('videoContainer').classList.add('hidden');
        document.getElementById('nextBtn').disabled = true;
    }

    hideWaitingScreen() {
        document.getElementById('waitingScreen').classList.add('hidden');
        document.getElementById('videoContainer').classList.remove('hidden');
        document.getElementById('nextBtn').disabled = false;
    }

    enableChat() {
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
    }

    disableChat() {
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new RandomVideoChat();
});