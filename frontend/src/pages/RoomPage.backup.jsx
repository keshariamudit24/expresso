import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import socket from '../utils/socket';
import QRCode from 'react-qr-code';
import { FaCopy, FaEye, FaEyeSlash, FaCheck, FaThumbsUp, FaMicrophone, FaMicrophoneSlash, FaVolumeUp, FaVolumeMute, FaPaperPlane, FaKeyboard } from 'react-icons/fa';
import { Mic, MicOff, Volume2, VolumeX, Send, Keyboard, MessageSquare, CheckCircle, Search, SortDesc } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import stringSimilarity from 'string-similarity';
import { createRoom, submitDoubt, getDoubts } from '../utils/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

const RoomPage = ({ role }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doubts, setDoubts] = useState([]);
  const [answeredDoubts, setAnsweredDoubts] = useState([]);
  const [newDoubt, setNewDoubt] = useState('');
  const [similarity, setSimilarity] = useState(0);
  const [upvotedDoubts, setUpvotedDoubts] = useState(new Set(JSON.parse(localStorage.getItem('upvotedDoubts') || '[]')));
  const [visibleEmails, setVisibleEmails] = useState(new Set());
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [roomClosureMessage, setRoomClosureMessage] = useState('');
  const [activeTab, setActiveTab] = useState('active');

  // Speech functionality states
  const [isListening, setIsListening] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(true);
  const [inputMode, setInputMode] = useState('text'); // 'text' or 'voice'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'upvotes'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs
  const textareaRef = useRef(null);
  const questionListRef = useRef(null);

  // Speech synthesis and recognition refs
  const speechSynthesis = useRef(window.speechSynthesis);
  const speechRecognition = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);

  // Initialize speech APIs
  useEffect(() => {
    // Check speech synthesis support
    setSpeechSupported('speechSynthesis' in window);

    // Check speech recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setRecognitionSupported(true);
      speechRecognition.current = new SpeechRecognition();
      speechRecognition.current.continuous = false;
      speechRecognition.current.interimResults = false;
      speechRecognition.current.lang = 'en-US';

      speechRecognition.current.onresult = (event) => {
        const result = event.results[0][0].transcript;
        setNewDoubt(prev => prev + (prev ? ' ' : '') + result);
        setIsListening(false);
      };

      speechRecognition.current.onerror = (error) => {
        console.error('Speech recognition error:', error);
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
            // Add to answered doubts
            setAnsweredDoubts(prevAnswered => [...prevAnswered, {
              ...doubtToMove,
              answered: true,
              answeredAt: new Date().toISOString()
            }]);

            // Remove from active doubts
            return prev.filter(d => d.id !== doubtId);
          }
          return prev;
        });
      } else {
        // Move from answered to active
        setAnsweredDoubts(prev => {
          const doubtToMove = prev.find(d => d.id === doubtId);
          console.log('Found doubt to move to active:', doubtToMove);

          if (doubtToMove) {
            // Add to active doubts
            setDoubts(prevActive => [...prevActive, {
              ...doubtToMove,
              answered: false
            }]);

            // Remove from answered doubts
            return prev.filter(d => d.id !== doubtId);
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
    if (!recognitionSupported || !speechRecognition.current) {
      toast.error('Speech recognition is not supported in your browser');
      return;
    }

    try {
      setIsListening(true);
      setInputMode('voice');
      speechRecognition.current.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
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
    if (!speechSupported) {
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
      utterance.onerror = () => {
        setSpeaking(false);
        toast.error('Text-to-speech failed');
      };

      speechSynthesis.current.speak(utterance);
    }
  };

  const handleAddDoubt = async () => {
    if (newDoubt.trim() === '') {
      toast.error('Question cannot be empty');
      return;
    }

    setIsSubmitting(true);

    try {
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
      setInputMode('text');

      toast.success('Question submitted successfully!');

      // Focus back to textarea for better UX
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (error) {
      toast.error('Failed to submit question. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
    <div className='min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black text-white'>
      {/* Header Section */}
      <div className='bg-white/10 backdrop-blur-md border-b border-white/20'>
        <div className='max-w-7xl mx-auto px-4 py-6'>
          <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <h1 className='text-2xl md:text-3xl font-bold'>Room: {roomId}</h1>
              <FaCopy
                onClick={handleCopyRoomId}
                className='cursor-pointer text-xl hover:text-blue-300 transition-colors'
                title="Copy Room ID"
              />
            </div>

            {role !== 'participant' && (
              <div className='flex gap-3'>
                <button
                  onClick={toggleQRCode}
                  className='px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors'
                >
                  {showQRCode ? 'Hide QR' : 'Show QR'}
                </button>
                <button
                  onClick={handleCloseRoom}
                  className='px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors'
                >
                  Close Room
                </button>
              </div>
            )}

            {role !== 'host' && (
              <button
                onClick={handleLeaveRoom}
                className='px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors'
              >
                Leave Room
              </button>
            )}
          </div>

          {roomClosureMessage && (
            <div className='mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg'>
              <p className='text-red-200'>{roomClosureMessage}</p>
            </div>
          )}

          {showQRCode && role !== 'participant' && (
            <div className='mt-6 flex flex-col items-center'>
              <div className='bg-white p-4 rounded-lg'>
                <QRCode value={`${FRONTEND_URL}/room/${roomId}`} size={200} />
              </div>
              <p className='mt-3 text-center text-gray-300'>Share this QR code for easy room access</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className='max-w-7xl mx-auto px-4 py-6'>
        {/* Enhanced Participant Input Section */}
        {role === 'participant' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='mb-8 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden'
          >
            {/* Input Header */}
            <div className='bg-white/5 px-6 py-4 border-b border-white/10'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <MessageSquare className='w-5 h-5 text-blue-400' />
                  <h2 className='text-lg font-semibold'>Ask Your Question</h2>
                </div>
                <div className='flex items-center gap-2'>
                  {/* Input Mode Toggle */}
                  <div className='flex bg-white/10 rounded-lg p-1'>
                    <button
                      onClick={() => setInputMode('text')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        inputMode === 'text'
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      <Keyboard className='w-4 h-4' />
                    </button>
                    <button
                      onClick={() => setInputMode('voice')}
                      disabled={!recognitionSupported}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        inputMode === 'voice'
                          ? 'bg-green-600 text-white'
                          : 'text-gray-300 hover:text-white disabled:opacity-50'
                      }`}
                    >
                      <Mic className='w-4 h-4' />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Input Content */}
            <div className='p-6 space-y-4'>
              {/* Text Input Area */}
              <div className='relative'>
                <textarea
                  ref={textareaRef}
                  value={newDoubt}
                  onChange={handleDoubtChange}
                  placeholder={inputMode === 'voice' ? 'Click the microphone to start speaking...' : 'Type your question here...'}
                  className='w-full h-32 p-4 bg-white/10 border border-white/30 rounded-lg text-white placeholder-gray-300 resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all'
                  disabled={isRoomClosed || isListening}
                />

                {/* Voice Input Overlay */}
                <AnimatePresence>
                  {inputMode === 'voice' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className='absolute inset-0 bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-lg flex items-center justify-center backdrop-blur-sm'
                    >
                      <div className='text-center'>
                        <motion.div
                          animate={isListening ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                          transition={{ repeat: isListening ? Infinity : 0, duration: 1 }}
                          className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${
                            isListening ? 'bg-red-500' : 'bg-green-500'
                          }`}
                        >
                          {isListening ? <MicOff className='w-8 h-8' /> : <Mic className='w-8 h-8' />}
                        </motion.div>
                        <p className='text-white font-medium'>
                          {isListening ? 'Listening...' : 'Click to start speaking'}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Controls and Info */}
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                {/* Similarity and Info */}
                <div className='flex flex-col sm:flex-row sm:items-center gap-3 text-sm'>
                  <div className='flex items-center gap-2'>
                    <div className={`w-2 h-2 rounded-full ${
                      similarity > 70 ? 'bg-red-400' :
                      similarity > 40 ? 'bg-yellow-400' : 'bg-green-400'
                    }`} />
                    <span className='text-gray-300'>
                      Similarity: <span className='text-emerald-300 font-medium'>{similarity.toFixed(1)}%</span>
                    </span>
                  </div>
                  <span className='text-gray-400'>•</span>
                  <span className='text-gray-300'>{newDoubt.length} characters</span>
                </div>

                {/* Action Buttons */}
                <div className='flex items-center gap-3'>
                  {/* Voice Controls */}
                  {inputMode === 'voice' && recognitionSupported && (
                    <div className='flex items-center gap-2'>
                      <button
                        onClick={isListening ? handleStopListening : handleStartListening}
                        disabled={isRoomClosed}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          isListening
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-green-600 hover:bg-green-700'
                        } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                      >
                        {isListening ? <MicOff className='w-4 h-4' /> : <Mic className='w-4 h-4' />}
                        {isListening ? 'Stop' : 'Speak'}
                      </button>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleAddDoubt}
                    disabled={isRoomClosed || !newDoubt.trim() || isSubmitting || isListening}
                    className='px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center gap-2'
                  >
                    {isSubmitting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className='w-4 h-4 border-2 border-white border-t-transparent rounded-full'
                      />
                    ) : (
                      <Send className='w-4 h-4' />
                    )}
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
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
          <div className='bg-white/5 px-6 py-4 border-b border-white/10'>
            <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4'>
              {/* Search Bar */}
              <div className='relative flex-1 max-w-md'>
                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all'
                />
              </div>

              {/* Sort and Filter Controls */}
              <div className='flex items-center gap-3'>
                <div className='flex items-center gap-2'>
                  <SortDesc className='w-4 h-4 text-gray-400' />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className='bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400'
                  >
                    <option value="newest" className='bg-gray-800'>Newest First</option>
                    <option value="oldest" className='bg-gray-800'>Oldest First</option>
                    <option value="upvotes" className='bg-gray-800'>Most Upvoted</option>
                  </select>
                </div>

                {/* Speech Toggle */}
                <button
                  onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
                  className={`p-2 rounded-lg transition-colors ${
                    isSpeechEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                  title={isSpeechEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
                >
                  {isSpeechEnabled ? <Volume2 className='w-4 h-4' /> : <VolumeX className='w-4 h-4' />}
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className='flex border-b border-white/20'>
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <MessageSquare className='w-4 h-4' />
              Active Questions ({sortedDoubts.length})
            </button>
            <button
              onClick={() => setActiveTab('answered')}
              className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'answered'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <CheckCircle className='w-4 h-4' />
              Answered Questions ({sortedAnsweredDoubts.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className='p-6'>
            <AnimatePresence mode="wait">
              {activeTab === 'active' && (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className='space-y-4'
                >
                  {sortedDoubts.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className='text-center py-16'
                    >
                      <MessageSquare className='w-16 h-16 text-gray-400 mx-auto mb-4' />
                      <p className='text-gray-400 text-lg mb-2'>
                        {role === 'participant'
                          ? 'No questions yet. Be the first to ask!'
                          : 'No active questions at the moment.'
                        }
                      </p>
                      {searchQuery && (
                        <p className='text-gray-500 text-sm'>
                          Try adjusting your search terms
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <div className='space-y-4 max-h-96 overflow-y-auto' ref={questionListRef}>
                      {sortedDoubts.map((doubt, index) => (
                        <motion.div
                          key={doubt.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className='bg-white/10 rounded-xl p-5 border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all duration-300 group'
                        >
                          <div className='flex justify-between items-start gap-4'>
                            <div className='flex-1'>
                              <div className='flex items-start gap-3 mb-3'>
                                <div className='w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm'>
                                  {doubt.user.charAt(0).toUpperCase()}
                                </div>
                                <div className='flex-1'>
                                  <p className='text-white text-lg mb-2 break-words leading-relaxed'>{doubt.text}</p>
                                  <div className='flex items-center gap-4 text-sm text-gray-300'>
                                    <span className='flex items-center gap-1'>
                                      <FaThumbsUp className='text-xs' />
                                      {doubt.upvotes} upvotes
                                    </span>
                                    <span>•</span>
                                    <span>{new Date(doubt.createdAt).toLocaleTimeString()}</span>
                                    {role === 'host' && visibleEmails.has(doubt.id) && (
                                      <>
                                        <span>•</span>
                                        <span className='text-blue-300'>by {doubt.user}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                              {/* Text-to-Speech Button */}
                              {isSpeechEnabled && speechSupported && (
                                <button
                                  onClick={() => handleSpeakQuestion(doubt.text)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    speaking ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'
                                  }`}
                                  title={speaking ? 'Stop speaking' : 'Read question aloud'}
                                >
                                  {speaking ? <VolumeX className='w-4 h-4' /> : <Volume2 className='w-4 h-4' />}
                                </button>
                              )}

                              {/* Host Controls */}
                              {role === 'host' && (
                                <>
                                  <button
                                    onClick={() => handleToggleEmailVisibility(doubt.id)}
                                    className='p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors'
                                    title={visibleEmails.has(doubt.id) ? 'Hide email' : 'Show email'}
                                  >
                                    {visibleEmails.has(doubt.id) ? <FaEyeSlash className='w-4 h-4' /> : <FaEye className='w-4 h-4' />}
                                  </button>
                                  <button
                                    onClick={() => handleMarkAsAnswered(doubt.id)}
                                    className='p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors'
                                    title='Mark as answered'
                                  >
                                    <FaCheck className='w-4 h-4' />
                                  </button>
                                </>
                              )}

                              {/* Upvote Button */}
                              <button
                                onClick={() => handleToggleUpvote(doubt.id)}
                                className={`p-2 rounded-lg transition-all ${
                                  upvotedDoubts.has(doubt.id)
                                    ? 'bg-blue-600 text-white scale-110'
                                    : 'bg-gray-600 hover:bg-gray-700 hover:scale-105'
                                }`}
                                title='Upvote question'
                              >
                                <FaThumbsUp className='w-4 h-4' />
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
                  className='space-y-4'
                >
                  {sortedAnsweredDoubts.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className='text-center py-16'
                    >
                      <CheckCircle className='w-16 h-16 text-gray-400 mx-auto mb-4' />
                      <p className='text-gray-400 text-lg mb-2'>No questions have been answered yet.</p>
                      {searchQuery && (
                        <p className='text-gray-500 text-sm'>
                          Try adjusting your search terms
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <div className='space-y-4 max-h-96 overflow-y-auto'>
                      {sortedAnsweredDoubts.map((doubt, index) => (
                        <motion.div
                          key={doubt.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className='bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl p-5 border border-green-500/30 hover:border-green-500/50 transition-all duration-300 group'
                        >
                          <div className='flex justify-between items-start gap-4'>
                            <div className='flex-1'>
                              <div className='flex items-start gap-3 mb-3'>
                                <div className='w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white'>
                                  <CheckCircle className='w-5 h-5' />
                                </div>
                                <div className='flex-1'>
                                  <p className='text-white text-lg mb-2 break-words leading-relaxed'>{doubt.text}</p>
                                  <div className='flex items-center gap-4 text-sm text-gray-300'>
                                    <span className='flex items-center gap-1'>
                                      <FaThumbsUp className='text-xs' />
                                      {doubt.upvotes} upvotes
                                    </span>
                                    <span>•</span>
                                    <span className='text-green-400 font-medium'>✓ Answered</span>
                                    <span>•</span>
                                    <span>{new Date(doubt.answeredAt || doubt.createdAt).toLocaleTimeString()}</span>
                                    {role === 'host' && visibleEmails.has(doubt.id) && (
                                      <>
                                        <span>•</span>
                                        <span className='text-blue-300'>by {doubt.user}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                              {/* Text-to-Speech Button */}
                              {isSpeechEnabled && speechSupported && (
                                <button
                                  onClick={() => handleSpeakQuestion(doubt.text)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    speaking ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'
                                  }`}
                                  title={speaking ? 'Stop speaking' : 'Read question aloud'}
                                >
                                  {speaking ? <VolumeX className='w-4 h-4' /> : <Volume2 className='w-4 h-4' />}
                                </button>
                              )}

                              {/* Host Controls */}
                              {role === 'host' && (
                                <button
                                  onClick={() => handleToggleEmailVisibility(doubt.id)}
                                  className='p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors'
                                  title={visibleEmails.has(doubt.id) ? 'Hide email' : 'Show email'}
                                >
                                  {visibleEmails.has(doubt.id) ? <FaEyeSlash className='w-4 h-4' /> : <FaEye className='w-4 h-4' />}
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
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

export default RoomPage;