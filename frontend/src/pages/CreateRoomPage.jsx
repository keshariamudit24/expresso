import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import arrowImage from '../assets/arrow/arroww.png'
import QRCode from 'react-qr-code';
import { FaCopy } from 'react-icons/fa';

const CreateRoomPage = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    // const newRoomId = Math.random().toString(36).substring(2, 15);
    const newRoomId = Math.floor(10000 + Math.random() * 90000).toString();
    setRoomId(newRoomId);
    // Navigate to the room page
    navigate(`/host/${newRoomId}`);
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert('Room ID copied to clipboard!');
  };

  return (
    <div className='flex justify-center items-center mt-40'>
      <div className='flex flex-col items-center ml-32'>
        <h1 className='text-5xl'>Create a Room</h1>
        <button onClick={handleCreateRoom} className="mt-10 text-xl text-black border-2 border-blue-500 p-2 rounded-lg cursor-pointer hover:bg-blue-500 hover:text-white">Create Room</button>
      </div>
      <div className="bg-white pt-10 w-32 h-64 flex justify-center items-center">
        <img src={arrowImage} alt="example" className="w-full h-full object-contain rotate-45" />
      </div>

      {/* {roomId && (
        <div className='mt-10'>
          <p>Room ID: {roomId} <FaCopy onClick={handleCopyRoomId} className='cursor-pointer inline-block ml-2' /></p>
          <QRCode value={`http://localhost:5173/join-room/${roomId}`} />
          <p className=''>Share this QR code with users to join the room.</p>
        </div>
      )} */}
    </div>
  );
};

export default CreateRoomPage;