const express = require('express');
const Doubt = require('../models/Doubt');
const Room = require('../models/Room'); // Import Room model

const router = express.Router();

// room create karne ke liye route
router.post('/rooms', async (req, res) => {
  try {
    const { roomId } = req.body;
    console.log('Creating room with ID:', roomId);

    if (!roomId) {
      return res.status(400).send({ message: 'Room ID is required' });
    }

    // Check if room already exists
    const existingRoom = await Room.findOne({ roomId });
    if (existingRoom) {
      return res.status(409).send({ message: 'Room already exists' });
    }

    const room = new Room({ roomId });
    await room.save();
    console.log('Room created successfully:', room);
    res.status(201).send({ message: 'Room created', room });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).send({ message: 'Failed to create room', error: error.message });
  }
});

// doubt submit karne ke liye route
router.post('/doubts', async (req, res) => {
  const { roomId, text, user } = req.body;
  const doubt = new Doubt({ roomId, text, user, upvotes: 0, upvotedBy: [], answered: false });
  await doubt.save();
  res.status(201).send(doubt);
});

// check if room exists
router.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findOne({ roomId });
    if (room) {
      res.status(200).send({ exists: true, room });
    } else {
      res.status(404).send({ exists: false, message: 'Room not found' });
    }
  } catch (error) {
    res.status(500).send({ exists: false, message: 'Server error' });
  }
});

// room se doubts ko lane ke liye route
router.get('/rooms/:roomId/doubts', async (req, res) => {
  const { roomId } = req.params;
  const doubts = await Doubt.find({ roomId });
  res.status(200).send(doubts);
});

// room close karne ke liye route
router.delete('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  await Doubt.deleteMany({ roomId });
  await Room.deleteOne({ roomId });
  res.status(200).send({ message: 'Room closed and doubts deleted' });
});

// fetch all doubts
router.get('/doubts', async (req, res) => {
  const doubts = await Doubt.find();
  res.status(200).send(doubts);
});

// Check if room exists
router.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const roomExists = await Room.exists({ roomId });
  if (roomExists) {
    res.status(200).send({ exists: true });
  } else {
    res.status(404).send({ exists: false });
  }
});

module.exports = router;
