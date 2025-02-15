import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const JoinRoomPage = () => {
  const { roomId: qrRoomId } = useParams();
  const [roomId, setRoomId] = useState(qrRoomId || '');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoinRoom = () => {
    if (!roomId.trim()) {
      setError('Room ID cannot be empty.');
      return;
    }

    setError('');
    navigate(`/room/${roomId}`);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-col items-center mt-40 rounded-3xl bg-gray-200 pt-20 pb-20 w-96">
        <h1 className="text-5xl">Join a Room</h1>
        <input
          type="text"
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setError(''); // Clear error when typing
          }}
          placeholder="Enter Room ID"
          className="mt-10 p-2 border-2 border-black rounded-lg"
        />
        {error && <p className="text-red-500 mt-2">{error}</p>}
        <button
          onClick={handleJoinRoom}
          className="mt-5 text-2xl bg-blue-600 hover:bg-blue-700 cursor-pointer p-2 rounded-lg text-white border-2 border-black"
        >
          Join Room
        </button>
      </div>
    </div>
  );
};

export default JoinRoomPage;
