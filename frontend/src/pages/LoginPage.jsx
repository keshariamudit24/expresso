import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, getGoogleRedirectResult, logOut } from '../config/firebase';
import { isEmailAllowed } from '../utils/emailValidation';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaGoogle } from 'react-icons/fa';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Check for redirect result on component mount
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getGoogleRedirectResult();
        if (result) {
          const userEmail = result.user.email;
          
          // Check if email is allowed
          if (!isEmailAllowed(userEmail)) {
            // Sign out the user immediately
            await logOut();
            toast.error('Access denied: This website is only for VNRVJIET students and faculty.');
            navigate('/access-denied');
            return;
          }
          
          toast.success('Successfully signed in with Google!');
          navigate('/');
        }
      } catch (error) {
        console.error('Redirect result error:', error);
        toast.error('Failed to complete Google sign-in');
      }
    };

    checkRedirectResult();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      const userEmail = result.user.email;
      
      // Check if email is allowed
      if (!isEmailAllowed(userEmail)) {
        // Sign out the user immediately
        await logOut();
        toast.error('Access denied: This website is only for VNRVJIET students and faculty.');
        navigate('/access-denied');
        return;
      }
      
      toast.success('Successfully signed in with Google!');
      navigate('/');
    } catch (error) {
      console.error('Google sign-in error:', error);
      toast.error('Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-800 to-black flex flex-col items-center justify-center text-white px-4">
      <div className="w-full max-w-sm sm:max-w-md p-4 sm:p-8 bg-gray-900 bg-opacity-50 rounded-lg shadow-2xl backdrop-blur-sm border border-gray-700">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            <span className="text-orange-500">Un</span>Doubt
          </h1>
          <p className="text-base sm:text-lg text-gray-300 mb-4">
            Welcome to UnDoubt!
          </p>
          <div className="bg-blue-900 bg-opacity-50 rounded-lg p-2 sm:p-3 border border-blue-600">
            <p className="text-xs sm:text-sm text-blue-200">
              🎓 For VNRVJIET Students & Faculty Only
            </p>
            <p className="text-xs text-blue-300 mt-1">
              Use your @vnrvjiet.in email address
            </p>
          </div>
        </div>

        {/* Google Sign In Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 sm:px-6 sm:py-4 mb-4 sm:mb-6 text-sm sm:text-lg font-semibold bg-white text-gray-900 hover:bg-gray-100 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          <FaGoogle className="text-base sm:text-xl text-red-500" />
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {/* Information */}
        <div className="text-center">
          <p className="text-xs sm:text-sm text-gray-400 mb-2">
            Sign in with your VNRVJIET Google account
          </p>
          <p className="text-xs text-gray-500">
            Only @vnrvjiet.in email addresses are allowed
          </p>
        </div>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </div>
  );
};

export default LoginPage;
