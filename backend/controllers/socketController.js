const Doubt = require('../models/Doubt');

const handleSocketConnection = (io, socket) => {
  console.log('New client connected');

  socket.on('joinRoom', async (roomId, role) => {
    socket.join(roomId);
    console.log(`Client joined room: ${roomId} as ${role}`);
    socket.role = role;

    // Send existing doubts to the newly joined client
    const existingDoubts = await Doubt.find({ roomId });
    socket.emit('existingDoubts', existingDoubts);
  });

  socket.on('newDoubt', async (roomId, doubt) => {
    const newDoubt = new Doubt({ ...doubt, roomId, upvotes: 0, upvotedBy: [] });
    await newDoubt.save();
    io.to(roomId).emit('newDoubt', newDoubt); // Broadcast to all clients in the room
  });

  socket.on('upvoteDoubt', async (roomId, doubtId, userId) => {
    const doubt = await Doubt.findOne({ roomId, id: doubtId });
    if (doubt && !doubt.upvotedBy.includes(userId)) {
      doubt.upvotes += 1;
      doubt.upvotedBy.push(userId);
      await doubt.save();
      io.to(roomId).emit('upvoteDoubt', doubtId); // Broadcast to all clients in the room
    }
  });

  socket.on('downvoteDoubt', async (roomId, doubtId, userId) => {
    const doubt = await Doubt.findOne({ roomId, id: doubtId });
    if (doubt && doubt.upvotedBy.includes(userId)) {
      doubt.upvotes -= 1;
      doubt.upvotedBy = doubt.upvotedBy.filter(id => id !== userId);
      await doubt.save();
      io.to(roomId).emit('downvoteDoubt', doubtId); // Broadcast to all clients in the room
    }
  });

  socket.on('markAsAnswered', async (roomId, doubtId) => {
    console.log('markAsAnswered socket event received:', { roomId, doubtId });

    const doubt = await Doubt.findOne({ roomId, id: doubtId });
    console.log('Found doubt in database:', doubt);

    if (doubt) {
      doubt.answered = !doubt.answered;
      if (doubt.answered) {
        doubt.answeredAt = new Date();
      } else {
        doubt.answeredAt = null;
      }
      await doubt.save();
      console.log('Doubt updated and saved:', { doubtId, answered: doubt.answered });

      io.to(roomId).emit('markAsAnswered', doubtId, doubt.answered); // Broadcast to all clients in the room
      console.log('markAsAnswered event emitted to room:', roomId);
    } else {
      console.log('Doubt not found in database');
    }
  });

  socket.on('closeRoom', async (roomId) => {
    await Doubt.deleteMany({ roomId });
    io.to(roomId).emit('roomClosed'); // Broadcast to all clients in the room
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
};

module.exports = handleSocketConnection;