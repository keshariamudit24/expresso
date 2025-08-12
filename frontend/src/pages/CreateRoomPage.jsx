import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaCopy } from 'react-icons/fa';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const CreateRoomPage = () => {
  const [roomId, setRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  // Debug: Log environment variables
  console.log('Environment variables:', {
    API_BASE_URL,
    NODE_ENV: import.meta.env.MODE
  });

  const handleCreateRoom = async () => {
    if (isCreating) return; // Prevent double clicks

    setIsCreating(true);
    const newRoomId = Math.floor(10000 + Math.random() * 90000).toString();
    console.log('Creating room with ID:', newRoomId);
    console.log('API Base URL:', API_BASE_URL);

    if (!API_BASE_URL) {
      toast.error('API configuration error. Please check environment variables.');
      setIsCreating(false);
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/rooms`, { roomId: newRoomId });
      console.log('Room creation response:', response.data);
      setRoomId(newRoomId);
      toast.success('Room created successfully');
      // Navigate to the room as host
      navigate(`/room/${newRoomId}?role=host`);
    } catch (error) {
      console.error('Room creation error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      if (error.code === 'NETWORK_ERROR' || !error.response) {
        toast.error('Network error. Please check your connection and try again.');
      } else {
        toast.error(`Failed to create room: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex flex-col items-center justify-center text-white px-4">
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 sm:mb-6 text-center">Create a Room</h1>
      <button
        onClick={handleCreateRoom}
        disabled={isCreating}
        className={`px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold rounded-lg shadow-lg transform transition-transform duration-300 cursor-pointer ${
          isCreating
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'
        }`}
      >
        {isCreating ? 'Creating...' : 'Create Room'}
      </button>
      {roomId && (
        <div className="mt-6 sm:mt-10 flex flex-col items-center">
          <div className="mb-4 sm:mb-5 p-4 bg-white rounded-lg">
            <QRCode value={roomId} size={window.innerWidth < 640 ? 150 : 200} />
          </div>
          <p className="text-base sm:text-lg md:text-xl mb-3 text-center">Room ID: <span className="font-mono text-orange-400">{roomId}</span></p>
          <button
            onClick={handleCopyRoomId}
            className="px-4 py-2 sm:px-6 sm:py-3 text-base sm:text-lg md:text-xl font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-300"
          >
            Copy Room ID
          </button>
        </div>
      )}
      <ToastContainer />
    </div>
  );
};

export default CreateRoomPage;

