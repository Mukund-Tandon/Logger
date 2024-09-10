import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addMessage } from '../features/aichat/aiChatSlice';
import { getAiResponse } from '../features/aichat/services/aiCHatService';

export const AIChat = () => {
  const [message, setMessage] = useState('');
  const dispatch = useDispatch();
  const { messages, status } = useSelector((state) => state.aichat);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      console.log('Sending message:', message);
      dispatch(addMessage({ message: message, userType: 'user' }));
      dispatch(getAiResponse({ message }));
      setMessage('');
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="h-14 bg-gray-800 flex items-center justify-center">
        <h1 className="text-white text-xl font-bold">AI Search</h1>
      </div>
      <div className="flex-grow overflow-y-auto p-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.userType === 'user' ? 'justify-start' : 'justify-end'} mb-4`}
          >
            <div
              className={`p-3 rounded-lg max-w-[70%] ${
                msg.userType === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-white'
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
      </div>
      <div className="w-full p-4">
        {status === 'loading' && (
          <div className="w-full text-left mb-2">
            <p className="text-white text-sm">Searching ...</p>
          </div>
        )}
        <div className="flex items-center flex-col">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
            placeholder="Type your message..."
            className="flex-grow h-12 p-3 rounded-lg bg-gray-800 text-white border border-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSubmit}
            className="ml-2 h-12 bg-blue-500 text-white rounded-lg px-4 focus:outline-none hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};