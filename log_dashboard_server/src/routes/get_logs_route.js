const express = require('express');
const logService = require('../services/logservice');
const queryBuilder = require('../services/queryBuilder');
const router = express.Router();
const { executeAISearchChain } = require('../services/aiSearch/executeChain');

router.get('/logs', async (req, res) => {
  
  const logs = await logService.getLatestLogs();
  setTimeout(() => {
    res.json(logs);
  }, 1000);
  // res.json(logs);
});

router.get('/logs/between', async (req, res) => {
  const { start, end } = req.query;
  const logs = await logService.getLogsOfDateRange(start, end);
  res.json(logs);
}
);

router.get('/logs/filters', async (req, res) => {
  const { start, end, level, containsText, resourceId } = req.query;
  
  const searchQuery = queryBuilder.getSearchQuerWithFilters(start, end, level, containsText, resourceId);
  const logs = await logService.getLogsByFilters(searchQuery);

  res.json(logs);
});



router.post('/ai_search', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await executeAISearchChain(message);

    if (response.type === 'error') {
      return res.status(200).json({ message: response.message });
    }

    res.json(response);
  } catch (error) {
    console.error('Error in AI search:', error);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

function setupWebSocket(io) {
  console.log('Setting up websockets');
  io.on('connection', async (socket) => {
    console.log('A client connected');
    
    // Initial logs emission
    let lastLog = null;
    const  initialLogs = await logService.getLogsToBeStreamed();
    socket.emit('logs', initialLogs);
    lastLog = initialLogs[initialLogs.length - 1];

    
    const intervalId = setInterval(async () => {
      console.log('Checking for new logs');
      const logs = await logService.getLogsToBeStreamed(lastLog.Timestamp);
      if (logs.length > 0) {
        lastLog = logs[logs.length - 1];
        for(let i = 0; i < logs.length; i= i +1){
          if(logs[i].Timestamp == lastLog.Timestamp && logs[i].Message == lastLog.Message && logs[i].Level == lastLog.Level){
            logs.splice(i,1);
          }
        }
        socket.emit('logs', logs);
      } else if (lastLog === null) {
        console.log('No logs to be streamed');
        socket.emit('logs', []);
      }
    }, 1500);

    socket.on('disconnect', (reason) => {
      console.log(`Client ${socket.id} disconnected. Reason: ${reason}`);
      clearInterval(intervalId);
      // No need to call socket.disconnect() here, as the client has already initiated the disconnect
    });

    // Handle explicit disconnect request from client
    // socket.on('forceDisconnect', () => {
    //   console.log(`Client ${socket.id} requested forced disconnect`);
    //   clearInterval(intervalId);
    //   socket.disconnect(true);
    // });
  });

}
module.exports = { router,setupWebSocket};