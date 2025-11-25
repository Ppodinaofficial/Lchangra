const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// Waiting users queue
let waitingUsers = [];
let activePairs = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-partner', () => {
    // Remove from any existing pair
    if (activePairs.has(socket.id)) {
      const partnerId = activePairs.get(socket.id);
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
      socket.to(partnerId).emit('partner-disconnected');
    }

    // Find partner
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      
      if (partnerSocket) {
        // Create pair
        activePairs.set(socket.id, partnerId);
        activePairs.set(partnerId, socket.id);
        
        // Notify both users
        socket.emit('partner-found');
        partnerSocket.emit('partner-found');
        
        console.log(`Paired: ${socket.id} with ${partnerId}`);
      } else {
        waitingUsers.push(socket.id);
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
      // Notify current partner
      socket.to(partnerId).emit('partner-disconnected');
      
      // Remove pair
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
      
      // Find new partner for both
      socket.emit('find-new-partner');
      io.to(partnerId).emit('find-new-partner');
    }
    
    // Find new partner
    setTimeout(() => {
      socket.emit('find-partner');
    }, 1000);
  });

  socket.on('disconnect', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('partner-disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
    }
    
    // Remove from waiting list
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Lchangra Random Chat running on port ${PORT}`);
});