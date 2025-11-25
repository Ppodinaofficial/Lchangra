// Simple socket connection for Railway
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

        // Simple socket connection - Railway will handle URL
        this.socket = io();

        // Setup socket events
        this.setupSocketEvents();

        // Show local video
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = this.localStream;

        // Start finding partner
        this.socket.emit('find-partner');

    } catch (error) {
        console.error('Error accessing media devices:', error);
        this.showModal('permissionModal');
    }
}