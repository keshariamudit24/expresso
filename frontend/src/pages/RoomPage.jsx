import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import socket from '../utils/socket';
import QRCode from 'react-qr-code';
import { FaCopy, FaEye, FaEyeSlash } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import stringSimilarity from 'string-similarity';
import { createRoom, submitDoubt, getDoubts } from '../utils/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const RoomPage = ({ role }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const [doubts, setDoubts] = useState([]);
  const [newDoubt, setNewDoubt] = useState('');
  const [similarity, setSimilarity] = useState(0);
  const [upvotedDoubts, setUpvotedDoubts] = useState(new Set(JSON.parse(localStorage.getItem('upvotedDoubts') || '[]')));
  const [visibleEmails, setVisibleEmails] = useState(new Set());
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [roomClosureMessage, setRoomClosureMessage] = useState('');

  useEffect(() => {
    socket.emit('joinRoom', roomId, role);

    socket.on('existingDoubts', (existingDoubts) => {
      setDoubts(existingDoubts);
      const upvoted = new Set(existingDoubts.filter(d => d.upvotedBy.includes(user.id)).map(d => d.id));
      setUpvotedDoubts(upvoted);
    });

    socket.on('newDoubt', (doubt) => {
      setDoubts((prevDoubts) => [...prevDoubts, doubt]);
    });

    socket.on('upvoteDoubt', (doubtId) => {
      setDoubts((prevDoubts) =>
        prevDoubts.map((doubt) =>
          doubt.id === doubtId ? { ...doubt, upvotes: doubt.upvotes + 1 } : doubt
        )
      );
    });

    socket.on('downvoteDoubt', (doubtId) => {
      setDoubts((prevDoubts) =>
        prevDoubts.map((doubt) =>
          doubt.id === doubtId ? { ...doubt, upvotes: doubt.upvotes - 1 } : doubt
        )
      );
    });

    socket.on('roomClosed', () => {
      setIsRoomClosed(true);
      setRoomClosureMessage('The room was closed, kindly leave the room');
      toast.error('Room was closed, kindly leave the room');
    });

    return () => {
      socket.off('existingDoubts');
      socket.off('newDoubt');
      socket.off('upvoteDoubt');
      socket.off('downvoteDoubt');
      socket.off('roomClosed');
    };
  }, [roomId, role, user.id, navigate]);

  useEffect(() => {
    const fetchDoubts = async () => {
      const response = await axios.get(`${API_BASE_URL}/doubts`);
      setDoubts(response.data);
    };

    fetchDoubts();
  }, []);

  const handleAddDoubt = () => {
    const doubt = {
      id: Math.random().toString(36).substring(2, 15),
      text: newDoubt,
      user: user.primaryEmailAddress.emailAddress,
      upvotes: 0,
      createdAt: new Date().toISOString(), // Add createdAt field
    };
    socket.emit('newDoubt', roomId, doubt);
    setNewDoubt('');
    setSimilarity(0); // Reset similarity percentage to 0.00%
  };

  const handleToggleUpvote = (id) => {
    if (upvotedDoubts.has(id)) {
      socket.emit('downvoteDoubt', roomId, id, user.id);
      setUpvotedDoubts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        localStorage.setItem('upvotedDoubts', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
    } else {
      socket.emit('upvoteDoubt', roomId, id, user.id);
      setUpvotedDoubts((prev) => {
        const newSet = new Set(prev).add(id);
        localStorage.setItem('upvotedDoubts', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
    }
  };

  const handleToggleEmailVisibility = (id) => {
    setVisibleEmails((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied to clipboard!');
  };

  const handleCloseRoom = async () => {
    await axios.delete(`${API_BASE_URL}/rooms/${roomId}`);
    socket.emit('closeRoom', roomId);
    navigate('/');
  };

  const handleLeaveRoom = () => {
    navigate('/');
  };

  const handleDoubtChange = (e) => {
    const newDoubtText = e.target.value;
    setNewDoubt(newDoubtText);

    if (newDoubtText.trim() === '') {
      setSimilarity(0);
      return;
    }

    const existingDoubtTexts = doubts.map(doubt => doubt.text);
    const bestMatch = stringSimilarity.findBestMatch(newDoubtText, existingDoubtTexts);
    setSimilarity(bestMatch.bestMatch.rating * 100);
  };

  // Sort doubts by upvotes and then by creation time
  const sortedDoubts = doubts.sort((a, b) => {
    if (b.upvotes === a.upvotes) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    return b.upvotes - a.upvotes;
  });

  return (
    <div className='flex flex-col items-center mt-20'>
      <h1 className='text-3xl'>Room ID: {roomId}<FaCopy onClick={handleCopyRoomId} className='cursor-pointer inline-block ml-2 text-3xl' /></h1>
      {roomClosureMessage && <p className='text-xl text-red-600'>{roomClosureMessage}</p>}
      {role !== 'participant' && (
        <div className='flex flex-col items-center justify-center mt-10'>
          <QRCode className='mb-5' value={`http://localhost:5173/room/${roomId}`} />
          <p className='text-2xl text-center'>Share this QR code with users to join the room.</p>
        </div>
      )}
      {role === 'participant' && (
        <div className='mt-10 flex flex-col items-center gap-3'>
          <input
            type='text'
            value={newDoubt}
            onChange={handleDoubtChange}
            placeholder='Enter your doubt'
            className='p-2 border-2 border-black rounded-lg'
            disabled={isRoomClosed}
          />
          <p>Your doubt is {similarity.toFixed(2)}% similar to a previously asked one</p>
          <button
            onClick={handleAddDoubt}
            className='ml-2 text-2xl bg-blue-600 hover:bg-blue-700 cursor-pointer p-2 rounded-lg text-white border-2 border-black'
            disabled={isRoomClosed}
          >
            Add Doubt
          </button>
        </div>
      )}
      {role === 'host' && (
        <button onClick={handleCloseRoom} className='mt-5 text-2xl bg-red-600 hover:bg-red-700 cursor-pointer p-2 rounded-lg text-white border-2 border-black'>Close Room</button>
      )}
      {role !== 'host' && (
        <button onClick={handleLeaveRoom} className='mt-5 text-2xl bg-gray-600 hover:bg-gray-700 cursor-pointer p-2 rounded-lg text-white border-2 border-black'>Leave Room</button>
      )}
      <div className='mt-10'>
        <h2 className='text-3xl'>Doubts</h2>
        {sortedDoubts.map(doubt => (
          <div key={doubt.id} className='mt-5 p-2 border-2 border-black rounded-lg'>
            <p>{doubt.text}</p>
            {role === 'host' && (
              <div className='flex items-center'>
                <button
                  onClick={() => handleToggleEmailVisibility(doubt.id)}
                  className='text-xl bg-gray-600 hover:bg-gray-700 cursor-pointer p-1 rounded-lg text-white border-2 border-black ml-2'
                >
                  {visibleEmails.has(doubt.id) ? <FaEyeSlash /> : <FaEye />}
                </button>
                {visibleEmails.has(doubt.id) && <p className='ml-2'>{doubt.user}</p>}
              </div>
            )}
            <p>Upvotes: {doubt.upvotes}</p>
            <button
              onClick={() => handleToggleUpvote(doubt.id)}
              className={`text-xl ${upvotedDoubts.has(doubt.id) ? 'bg-red-600' : 'bg-blue-600'} hover:bg-blue-700 cursor-pointer p-1 rounded-lg text-white border-2 border-black`}
            >
              {upvotedDoubts.has(doubt.id) ? 'Undo Upvote' : 'Upvote'}
            </button>
          </div>
        ))}
      </div>
      <ToastContainer />
    </div>
  );
};

export default RoomPage;