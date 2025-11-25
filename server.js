const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io with proper CORS for Railway
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Lchangra Server Running' });
});

// Waiting users queue
let waitingUsers = [];
let activePairs = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-partner', () => {
    console.log('Finding partner for:', socket.id);
    
    // Clean up existing connections
    if (activePairs.has(socket.id)) {
      const partnerId = activePairs.get(socket.id);
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
      socket.to(partnerId).emit('partner-disconnected');
    }

    waitingUsers = waitingUsers.filter(id => id !== socket.id);

    // Find partner
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      
      if (partnerSocket && partnerSocket.connected) {
        // Create pair
        activePairs.set(socket.id, partnerId);
        activePairs.set(partnerId, socket.id);
        
        // Notify both users
        socket.emit('partner-found');
        partnerSocket.emit('partner-found');
        
        console.log(`Paired: ${socket.id} with ${partnerId}`);
      } else {
        waitingUsers.push(socket.id);
        socket.emit('waiting-for-partner');
      }
    } else {
      waitingUsers.push(socket.id);
      socket.emit('waiting-for-partner');
    }
  });

  socket.on('send-message', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('receive-message', {
        message: data.message,
        isOwn: false
      });
    }
  });

  // WebRTC Signaling
  socket.on('webrtc-offer', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('webrtc-offer', data.offer);
    }
  });

  socket.on('webrtc-answer', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('webrtc-answer', data.answer);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('webrtc-ice-candidate', data.candidate);
    }
  });

  socket.on('next-partner', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('partner-disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
    }
    
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
    
    setTimeout(() => {
      socket.emit('find-partner');
    }, 1000);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('partner-disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
    }
    
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });
});

// Use Railway's port or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Lchangra Random Video Chat running on port ${PORT}`);
  console.log(`📱 Open your browser and test the app!`);
});