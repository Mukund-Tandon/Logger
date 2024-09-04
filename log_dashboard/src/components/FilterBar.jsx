import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchLogs,connectWebSocket } from "../features/logs/services/fetch";
import { WiAlien } from "react-icons/wi";
export const FilterBar = () => {
  const [realTimeMode, setRealTimeMode] = useState(false);
  const [socketConnection, setSocketConnection] = useState(null);
  const dispatch = useDispatch();

  useEffect(() => {
    return () => {
      // Cleanup: disconnect if component unmounts while connected
      if (socketConnection) {
        socketConnection.disconnect();
      }
    };
  }, [socketConnection]);

  const toggleRealTimeMode = async () => {
    if (!realTimeMode) {
      // Connect
      try {
        const result = await dispatch(connectWebSocket()).unwrap();
        setSocketConnection(result);
        setRealTimeMode(true);
      } catch (error) {
        console.error("Failed to connect to WebSocket:", error);
      }
    } else {
      // Disconnect
      if (socketConnection) {
        socketConnection.disconnect();
        setSocketConnection(null);
      }
      setRealTimeMode(false);
    }
  };
  const refreshList = () => {
    // Logic to refresh the list goes here
    console.log("List refreshed!");
    dispatch(fetchLogs());

  };
  return (
    <div className="w-full h-12 px-4 flex  items-center mt-2">
      {/* <div className="flex items-center justify-end">
        <input
          className="h-8 border border-solid border-white bg-transparent rounded-lg px-4 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent text-border-white mr-2"
          type="text"
          placeholder="Include Text..."
        />
      </div> */}
      <div className="flex items-center">
      <button
        className={`h-8 rounded-lg px-4 focus:outline-none 
                    ${realTimeMode ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-500 text-white hover:bg-gray-600'}`}
        onClick={toggleRealTimeMode}
      >
        {realTimeMode ? "Real-time On" : "Real-time Off"}
      </button>
      <button
          className={`ml-2 h-8 rounded-lg px-4 focus:outline-none 
                      ${realTimeMode ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
          onClick={refreshList}
          disabled={realTimeMode}
        >
          Refresh
        </button>
    </div>
    </div>
  );
};


