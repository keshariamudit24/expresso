import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import socket from '../utils/socket';
import QRCode from 'react-qr-code';
import { FaCopy, FaEye, FaEyeSlash, FaCheck, FaThumbsUp, FaMicrophone, FaVolumeUp } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import stringSimilarity from 'string-similarity';
import { createRoom, submitDoubt, getDoubts } from '../utils/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

const RoomPage = ({ role: propRole }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Get role from URL params or props
  const urlParams = new URLSearchParams(window.location.search);
  const urlRole = urlParams.get('role');
  const role = urlRole || propRole || 'participant';

  const [doubts, setDoubts] = useState([]);
  const [answeredDoubts, setAnsweredDoubts] = useState([]);
  const [newDoubt, setNewDoubt] = useState('');
  const [similarity, setSimilarity] = useState(0);
  const [upvotedDoubts, setUpvotedDoubts] = useState(new Set(JSON.parse(localStorage.getItem('upvotedDoubts') || '[]')));
  const [visibleEmails, setVisibleEmails] = useState(new Set());
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [roomClosureMessage, setRoomClosureMessage] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Speech states
  const [isListening, setIsListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speechSynthesis = useRef(window.speechSynthesis);
  const speechRecognition = useRef(null);
  const questionListRef = useRef(null);

  // Initialize speech APIs
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      speechRecognition.current = new SpeechRecognition();
      speechRecognition.current.continuous = false;
      speechRecognition.current.interimResults = false;
      speechRecognition.current.lang = 'en-US';

      speechRecognition.current.onresult = (event) => {
        const result = event.results[0][0].transcript;
        setNewDoubt(prev => prev + (prev ? ' ' : '') + result);
        setIsListening(false);
      };

      speechRecognition.current.onerror = () => {
        setIsListening(false);
        toast.error('Speech recognition failed. Please try again.');
      };

      speechRecognition.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  useEffect(() => {
    socket.emit('joinRoom', roomId, role);

    socket.on('existingDoubts', (existingDoubts) => {
      const activeDoubts = existingDoubts.filter(d => !d.answered);
      const answeredDoubts = existingDoubts.filter(d => d.answered);
      setDoubts(activeDoubts);
      setAnsweredDoubts(answeredDoubts);
      const upvoted = new Set(existingDoubts.filter(d => d.upvotedBy.includes(user.id)).map(d => d.id));
      setUpvotedDoubts(upvoted);
    });

    socket.on('newDoubt', (doubt) => {
      setDoubts((prevDoubts) => [...prevDoubts, doubt]);
      toast.info(`New Doubt: ${doubt.text}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
        style: { backgroundColor: '#AA60C8' }
      });
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

    socket.on('markAsAnswered', (doubtId, answered) => {
      console.log('markAsAnswered event received:', doubtId, answered);

      if (answered) {
        // Move from active to answered
        setDoubts(prev => {
          const doubtToMove = prev.find(d => d.id === doubtId);
          console.log('Found doubt to move to answered:', doubtToMove);

          if (doubtToMove) {
            // First remove from active doubts
            const newActiveDoubts = prev.filter(d => d.id !== doubtId);

            // Then add to answered doubts
            setAnsweredDoubts(prevAnswered => {
              // Make sure it's not already in answered doubts
              const isAlreadyAnswered = prevAnswered.some(d => d.id === doubtId);
              if (isAlreadyAnswered) {
                return prevAnswered;
              }
              return [...prevAnswered, {
                ...doubtToMove,
                answered: true,
                answeredAt: new Date().toISOString()
              }];
            });

            return newActiveDoubts;
          }
          return prev;
        });
      } else {
        // Move from answered to active
        setAnsweredDoubts(prev => {
          const doubtToMove = prev.find(d => d.id === doubtId);
          console.log('Found doubt to move to active:', doubtToMove);

          if (doubtToMove) {
            // First remove from answered doubts
            const newAnsweredDoubts = prev.filter(d => d.id !== doubtId);

            // Then add to active doubts
            setDoubts(prevActive => {
              // Make sure it's not already in active doubts
              const isAlreadyActive = prevActive.some(d => d.id === doubtId);
              if (isAlreadyActive) {
                return prevActive;
              }
              return [...prevActive, {
                ...doubtToMove,
                answered: false
              }];
            });

            return newAnsweredDoubts;
          }
          return prev;
        });
      }
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
      socket.off('markAsAnswered');
      socket.off('roomClosed');
    };
  }, [roomId, role, user.id, navigate]);

  useEffect(() => {
    const fetchDoubts = async () => {
      const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}/doubts`);
      const allDoubts = response.data;
      const activeDoubts = allDoubts.filter(d => !d.answered);
      const answeredDoubts = allDoubts.filter(d => d.answered);
      setDoubts(activeDoubts);
      setAnsweredDoubts(answeredDoubts);
    };

    fetchDoubts();
  }, [roomId]);

  // Speech functionality
  const handleStartListening = () => {
    if (!speechRecognition.current) {
      toast.error('Speech recognition is not supported in your browser');
      return;
    }

    try {
      setIsListening(true);
      speechRecognition.current.start();
    } catch (error) {
      setIsListening(false);
      toast.error('Failed to start speech recognition');
    }
  };

  const handleStopListening = () => {
    if (speechRecognition.current && isListening) {
      speechRecognition.current.stop();
    }
    setIsListening(false);
  };

  const handleSpeakQuestion = (text) => {
    if (!('speechSynthesis' in window)) {
      toast.error('Text-to-speech is not supported in your browser');
      return;
    }

    if (speaking) {
      speechSynthesis.current.cancel();
      setSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      speechSynthesis.current.speak(utterance);
    }
  };

  const handleAddDoubt = () => {
    if (newDoubt.trim() === '') {
      toast.error('Question cannot be empty');
      return;
    }

    const doubt = {
      id: Math.random().toString(36).substring(2, 15),
      text: newDoubt.trim(),
      user: user.emailAddresses[0].emailAddress,
      upvotes: 0,
      createdAt: new Date().toISOString(),
      answered: false,
    };

    socket.emit('newDoubt', roomId, doubt);
    setNewDoubt('');
    setSimilarity(0);
    toast.success('Question submitted successfully!');
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

  const handleMarkAsAnswered = (id) => {
    console.log('handleMarkAsAnswered called with id:', id, 'roomId:', roomId);
    socket.emit('markAsAnswered', roomId, id);

    // Show immediate feedback
    toast.info('Marking question as answered...', {
      position: "top-right",
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "colored",
    });
  };

  const handleCopyRoomId = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomId).then(() => {
        toast.success('Room ID copied to clipboard!');
      }).catch((err) => {
        toast.error('Failed to copy Room ID');
        console.error('Failed to copy Room ID:', err);
      });
    } else {
      // Fallback method for copying text to clipboard
      const textArea = document.createElement('textarea');
      textArea.value = roomId;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success('Room ID copied to clipboard!');
      } catch (err) {
        toast.error('Failed to copy Room ID');
        console.error('Failed to copy Room ID:', err);
      }
      document.body.removeChild(textArea);
    }
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

    // Filter out any undefined/null text values and ensure we have valid strings
    const existingDoubtTexts = doubts
      .filter(doubt => doubt && doubt.text && typeof doubt.text === 'string')
      .map(doubt => doubt.text);

    // Only calculate similarity if there are existing doubts
    if (existingDoubtTexts.length === 0) {
      setSimilarity(0);
      return;
    }

    const bestMatch = stringSimilarity.findBestMatch(newDoubtText, existingDoubtTexts);
    setSimilarity(bestMatch.bestMatch.rating * 100);
  };

  // Filtering and sorting functions
  const getFilteredDoubts = (doubtsList) => {
    let filtered = [...doubtsList]; // Create a copy to avoid mutating original array

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(doubt =>
        doubt.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doubt.user.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'oldest':
        filtered = filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'upvotes':
        filtered = filtered.sort((a, b) => {
          if (b.upvotes === a.upvotes) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          }
          return b.upvotes - a.upvotes;
        });
        break;
      default:
        filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return filtered;
  };

  const sortedDoubts = getFilteredDoubts(doubts);
  const sortedAnsweredDoubts = getFilteredDoubts(answeredDoubts);

  const [showQRCode, setShowQRCode] = useState(true); // New state for QR code visibility

  const toggleQRCode = () => {
    setShowQRCode((prev) => !prev);
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black text-white overflow-x-hidden'>
      {/* Header Section */}
      <div className='bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-50'>
        <div className='w-full px-2 xs:px-3 sm:px-4 py-3 sm:py-4'>
          <div className='flex flex-col gap-3 sm:gap-4'>
            {/* Room Title and Copy Button */}
            <div className='flex items-center gap-2 min-w-0'>
              <h1 className='text-base xs:text-lg sm:text-xl md:text-2xl font-bold truncate flex-1'>
                Room: {roomId}
              </h1>
              <button
                onClick={handleCopyRoomId}
                className='p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0'
                title="Copy Room ID"
              >
                <FaCopy className='w-3 h-3 xs:w-4 xs:h-4' />
              </button>
            </div>

            {/* Action Buttons */}
            <div className='flex flex-col xs:flex-row gap-2 w-full'>
              {role !== 'participant' && (
                <div className='flex gap-2 flex-1'>
                  <button
                    onClick={toggleQRCode}
                    className='flex-1 px-3 py-2 text-xs xs:text-sm bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors'
                  >
                    {showQRCode ? 'Hide QR' : 'Show QR'}
                  </button>
                  <button
                    onClick={handleCloseRoom}
                    className='flex-1 px-3 py-2 text-xs xs:text-sm bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors'
                  >
                    Close Room
                  </button>
                </div>
              )}

              {role !== 'host' && (
                <button
                  onClick={handleLeaveRoom}
                  className='px-3 py-2 text-xs xs:text-sm bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors'
                >
                  Leave Room
                </button>
              )}
            </div>

            {/* Room Closure Message */}
            {roomClosureMessage && (
              <div className='p-3 bg-red-500/20 border border-red-500/50 rounded-lg'>
                <p className='text-red-200 text-sm'>{roomClosureMessage}</p>
              </div>
            )}

            {/* QR Code Section - Optimized for Mobile */}
            {showQRCode && role !== 'participant' && (
              <div className='flex flex-col items-center py-4'>
                <div className='bg-white p-2 xs:p-3 sm:p-4 rounded-lg'>
                  <QRCode 
                    value={`${FRONTEND_URL}/room/${roomId}`} 
                    size={window.innerWidth < 640 ? 150 : 200}
                  />
                </div>
                <p className='mt-2 text-center text-gray-300 text-xs xs:text-sm px-2'>
                  Share this QR code for easy room access
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className='w-full px-2 xs:px-3 sm:px-4 py-3 sm:py-4 pb-20'>
        {/* Enhanced Participant Input Section */}
        {role === 'participant' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='mb-4 sm:mb-6 bg-white/10 backdrop-blur-md rounded-xl p-3 xs:p-4 sm:p-5 border border-white/20'
          >
            <h2 className='text-base xs:text-lg sm:text-xl font-semibold mb-3 flex items-center gap-2'>
              💬 Ask Your Question
            </h2>

            <div className='space-y-3'>
              <textarea
                value={newDoubt}
                onChange={handleDoubtChange}
                placeholder='Type your question here...'
                className='w-full h-20 xs:h-24 sm:h-32 p-2 xs:p-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-gray-300 resize-none focus:outline-none focus:border-blue-400 transition-all text-sm xs:text-base'
                disabled={isRoomClosed || isListening}
              />

              {/* Stats Row */}
              <div className='flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-4 text-xs text-gray-300'>
                <span>Similarity: <span className='text-emerald-300 font-medium'>{similarity.toFixed(1)}%</span></span>
                <span className='hidden xs:inline'>•</span>
                <span>{newDoubt.length} characters</span>
              </div>

              {/* Action Buttons */}
              <div className='flex flex-col xs:flex-row gap-2 xs:gap-3'>
                {speechRecognition.current && (
                  <button
                    onClick={isListening ? handleStopListening : handleStartListening}
                    disabled={isRoomClosed}
                    className={`flex-1 xs:flex-none px-3 xs:px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-xs xs:text-sm ${
                      isListening ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                  >
                    <FaMicrophone className='w-3 h-3' />
                    {isListening ? 'Stop' : 'Speak'}
                  </button>
                )}

                <button
                  onClick={handleAddDoubt}
                  disabled={isRoomClosed || !newDoubt.trim() || isListening}
                  className='flex-1 px-3 xs:px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-xs xs:text-sm'
                >
                  Submit Question
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Enhanced Questions Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className='bg-white/10 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden'
        >
          {/* Header with Search and Controls */}
          <div className='bg-white/5 px-3 xs:px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10'>
            <div className='flex flex-col gap-3'>
              {/* Search Bar */}
              <div className='relative w-full'>
                <span className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm'>🔍</span>
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='w-full pl-8 pr-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-all text-xs xs:text-sm'
                />
              </div>

              {/* Sort and Speech Controls */}
              <div className='flex items-center gap-2'>
                <div className='flex items-center gap-2 flex-1'>
                  <span className='text-gray-400 text-sm hidden xs:inline'>📊</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className='flex-1 bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-blue-400'
                  >
                    <option value="newest" className='bg-gray-800'>Newest</option>
                    <option value="oldest" className='bg-gray-800'>Oldest</option>
                    <option value="upvotes" className='bg-gray-800'>Most Upvoted</option>
                  </select>
                </div>

                {/* Speech Test Button */}
                <button
                  onClick={() => handleSpeakQuestion('Speech features available')}
                  className='p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors'
                  title='Test text-to-speech'
                >
                  <FaVolumeUp className='w-3 h-3 xs:w-4 xs:h-4' />
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className='flex border-b border-white/20'>
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 px-2 xs:px-4 py-3 font-medium transition-colors flex items-center justify-center gap-1 xs:gap-2 text-xs xs:text-sm ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className='hidden xs:inline'>💬</span>
              <span>Active ({sortedDoubts.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('answered')}
              className={`flex-1 px-2 xs:px-4 py-3 font-medium transition-colors flex items-center justify-center gap-1 xs:gap-2 text-xs xs:text-sm ${
                activeTab === 'answered'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className='hidden xs:inline'>✅</span>
              <span>Answered ({sortedAnsweredDoubts.length})</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className='p-2 xs:p-3 sm:p-4'>
            <AnimatePresence mode="wait">
              {activeTab === 'active' && (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className='space-y-3 xs:space-y-4'
                >
                  {sortedDoubts.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className='text-center py-8 xs:py-12 sm:py-16'
                    >
                      <div className='text-4xl xs:text-5xl sm:text-6xl mb-3 xs:mb-4'>💬</div>
                      <p className='text-gray-400 text-sm xs:text-base sm:text-lg mb-2'>
                        {role === 'participant'
                          ? 'No questions yet. Be the first to ask!'
                          : 'No active questions at the moment.'
                        }
                      </p>
                      {searchQuery && (
                        <p className='text-gray-500 text-xs xs:text-sm'>
                          Try adjusting your search terms
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <div className='space-y-3 xs:space-y-4 max-h-80 xs:max-h-96 overflow-y-auto' ref={questionListRef}>
                      {sortedDoubts.map((doubt, index) => (
                        <motion.div
                          key={`active-${doubt.id}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className='bg-white/10 rounded-xl p-3 xs:p-4 sm:p-5 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all duration-300'
                        >
                          <div className='flex flex-col gap-3'>
                            {/* Question Header */}
                            <div className='flex items-start gap-2 xs:gap-3'>
                              <div className='w-6 h-6 xs:w-8 xs:h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-xs xs:text-sm flex-shrink-0 mt-0.5'>
                                {doubt.user.charAt(0).toUpperCase()}
                              </div>
                              <div className='flex-1 min-w-0'>
                                <p className='text-white text-sm xs:text-base sm:text-lg mb-2 break-words leading-relaxed'>
                                  {doubt.text}
                                </p>
                                <div className='flex flex-wrap items-center gap-1 xs:gap-2 text-xs text-gray-300'>
                                  <span className='flex items-center gap-1'>
                                    <FaThumbsUp className='text-xs' />
                                    {doubt.upvotes}
                                  </span>
                                  <span>•</span>
                                  <span>{new Date(doubt.createdAt).toLocaleTimeString()}</span>
                                  {role === 'host' && visibleEmails.has(doubt.id) && (
                                    <>
                                      <span className='hidden xs:inline'>•</span>
                                      <span className='text-blue-300 break-all text-xs'>{doubt.user}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className='flex items-center justify-end gap-1 xs:gap-2'>
                              {/* Text-to-Speech Button */}
                              {'speechSynthesis' in window && (
                                <button
                                  onClick={() => handleSpeakQuestion(doubt.text)}
                                  className={`p-1.5 xs:p-2 rounded-lg transition-colors ${
                                    speaking ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'
                                  }`}
                                  title={speaking ? 'Stop speaking' : 'Read question aloud'}
                                >
                                  {speaking ? <span className='text-xs'>🔇</span> : <FaVolumeUp className='w-3 h-3 xs:w-4 xs:h-4' />}
                                </button>
                              )}

                              {/* Host Controls */}
                              {role === 'host' && (
                                <>
                                  <button
                                    onClick={() => handleToggleEmailVisibility(doubt.id)}
                                    className='p-1.5 xs:p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors'
                                    title={visibleEmails.has(doubt.id) ? 'Hide email' : 'Show email'}
                                  >
                                    {visibleEmails.has(doubt.id) ? <FaEyeSlash className='w-3 h-3 xs:w-4 xs:h-4' /> : <FaEye className='w-3 h-3 xs:w-4 xs:h-4' />}
                                  </button>
                                  <button
                                    onClick={() => handleMarkAsAnswered(doubt.id)}
                                    className='p-1.5 xs:p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors'
                                    title='Mark as answered'
                                  >
                                    <FaCheck className='w-3 h-3 xs:w-4 xs:h-4' />
                                  </button>
                                </>
                              )}

                              {/* Upvote Button */}
                              <button
                                onClick={() => handleToggleUpvote(doubt.id)}
                                className={`p-1.5 xs:p-2 rounded-lg transition-all ${
                                  upvotedDoubts.has(doubt.id)
                                    ? 'bg-blue-600 text-white scale-105 xs:scale-110'
                                    : 'bg-gray-600 hover:bg-gray-700 hover:scale-105'
                                }`}
                                title='Upvote question'
                              >
                                <FaThumbsUp className='w-3 h-3 xs:w-4 xs:h-4' />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'answered' && (
                <motion.div
                  key="answered"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className='space-y-3 xs:space-y-4'
                >
                  {sortedAnsweredDoubts.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className='text-center py-8 xs:py-12 sm:py-16'
                    >
                      <div className='text-4xl xs:text-5xl sm:text-6xl mb-3 xs:mb-4'>✅</div>
                      <p className='text-gray-400 text-sm xs:text-base sm:text-lg mb-2'>No questions have been answered yet.</p>
                      {searchQuery && (
                        <p className='text-gray-500 text-xs xs:text-sm'>
                          Try adjusting your search terms
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <div className='space-y-3 xs:space-y-4 max-h-80 xs:max-h-96 overflow-y-auto'>
                      {sortedAnsweredDoubts.map((doubt, index) => (
                        <motion.div
                          key={`answered-${doubt.id}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className='bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl p-3 xs:p-4 sm:p-5 border border-green-500/30 hover:border-green-500/50 transition-all duration-300'
                        >
                          <div className='flex flex-col gap-3'>
                            {/* Question Header */}
                            <div className='flex items-start gap-2 xs:gap-3'>
                              <div className='w-6 h-6 xs:w-8 xs:h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-sm xs:text-base sm:text-lg flex-shrink-0 mt-0.5'>
                                ✅
                              </div>
                              <div className='flex-1 min-w-0'>
                                <p className='text-white text-sm xs:text-base sm:text-lg mb-2 break-words leading-relaxed'>
                                  {doubt.text}
                                </p>
                                <div className='flex flex-wrap items-center gap-1 xs:gap-2 text-xs text-gray-300'>
                                  <span className='flex items-center gap-1'>
                                    <FaThumbsUp className='text-xs' />
                                    {doubt.upvotes}
                                  </span>
                                  <span>•</span>
                                  <span className='text-green-400 font-medium'>✓ Answered</span>
                                  <span>•</span>
                                  <span>{new Date(doubt.answeredAt || doubt.createdAt).toLocaleTimeString()}</span>
                                  {role === 'host' && visibleEmails.has(doubt.id) && (
                                    <>
                                      <span className='hidden xs:inline'>•</span>
                                      <span className='text-blue-300 break-all text-xs'>{doubt.user}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className='flex items-center justify-end gap-1 xs:gap-2'>
                              {/* Text-to-Speech Button */}
                              {'speechSynthesis' in window && (
                                <button
                                  onClick={() => handleSpeakQuestion(doubt.text)}
                                  className={`p-1.5 xs:p-2 rounded-lg transition-colors ${
                                    speaking ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'
                                  }`}
                                  title={speaking ? 'Stop speaking' : 'Read question aloud'}
                                >
                                  {speaking ? <span className='text-xs'>🔇</span> : <FaVolumeUp className='w-3 h-3 xs:w-4 xs:h-4' />}
                                </button>
                              )}

                              {/* Host Controls */}
                              {role === 'host' && (
                                <button
                                  onClick={() => handleToggleEmailVisibility(doubt.id)}
                                  className='p-1.5 xs:p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors'
                                  title={visibleEmails.has(doubt.id) ? 'Hide email' : 'Show email'}
                                >
                                  {visibleEmails.has(doubt.id) ? <FaEyeSlash className='w-3 h-3 xs:w-4 xs:h-4' /> : <FaEye className='w-3 h-3 xs:w-4 xs:h-4' />}
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Toast Container with Mobile-Optimized Positioning */}
      <ToastContainer 
        position="top-center"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
        toastClassName="text-sm"
        bodyClassName="text-sm"
        style={{
          fontSize: '14px'
        }}
      />
      
      {/* Add custom CSS for extra small screens */}
      <style>{`
        @media (max-width: 475px) {
          .xs\\:text-xs { font-size: 0.75rem; }
          .xs\\:text-sm { font-size: 0.875rem; }
          .xs\\:text-base { font-size: 1rem; }
          .xs\\:text-lg { font-size: 1.125rem; }
          .xs\\:px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
          .xs\\:px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
          .xs\\:px-4 { padding-left: 1rem; padding-right: 1rem; }
          .xs\\:py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
          .xs\\:py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
          .xs\\:py-4 { padding-top: 1rem; padding-bottom: 1rem; }
          .xs\\:gap-2 { gap: 0.5rem; }
          .xs\\:gap-3 { gap: 0.75rem; }
          .xs\\:gap-4 { gap: 1rem; }
          .xs\\:w-4 { width: 1rem; }
          .xs\\:h-4 { width: 1rem; }
          .xs\\:w-8 { width: 2rem; }
          .xs\\:h-8 { height: 2rem; }
          .xs\\:p-2 { padding: 0.5rem; }
          .xs\\:p-3 { padding: 0.75rem; }
          .xs\\:p-4 { padding: 1rem; }
          .xs\\:space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 1rem; }
          .xs\\:max-h-96 { max-height: 24rem; }
          .xs\\:scale-110 { transform: scale(1.1); }
          .xs\\:flex-row { flex-direction: row; }
          .xs\\:items-center { align-items: center; }
          .xs\\:inline { display: inline; }
          .xs\\:text-5xl { font-size: 3rem; }
          .xs\\:mb-4 { margin-bottom: 1rem; }
          .xs\\:py-12 { padding-top: 3rem; padding-bottom: 3rem; }
          .xs\\:h-24 { height: 6rem; }
        }
      `}</style>
    </div>
  );
};

export default RoomPage;