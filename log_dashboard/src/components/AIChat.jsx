import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { addMessage } from '../features/aichat/aiChatSlice';
export const AIChat = () => {
    const [message, setMessage] = useState('');
    const dispatch = useDispatch();
  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle sending the message here
    console.log('Sending message:', message);
    setMessage('');
    dispatch(addMessage({ message: message, userType: 'user' }));
    // setMessage('');
  };
  return (
    <div className="w-full h-full flex flex-col">
      <div className="h-14 bg-gray-800 flex items-center justify-center">
        <h1 className="text-white text-xl font-bold">AI Search</h1>
      </div>
      <div className="w-full h-full overflow-auto"></div>
      <div className="w-full h-25 flex flex-col p-2 justify-center items-center">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          className="h-12  p-3 rounded-lg bg-gray-800 text-white border border-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
            onClick={handleSubmit}
            className="h-8 bg-blue-500 text-white rounded-lg px-4 focus:outline-none hover:bg-blue-600 mt-2"
          >
            Send
          </button>
      </div>
    </div>
  );
};
