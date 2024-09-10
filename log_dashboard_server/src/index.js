const express = require("express");
const cors = require('cors')
const http = require('http');
const bodyParser = require('body-parser');
const { router, setupWebSocket } = require('./routes/get_logs_route');
const logService = require('./services/logservice');
const { Server } = require('socket.io');
require('dotenv').config({ path: '../.env' });


const app = express();

app.use(cors());
app.use(bodyParser.json());

// const testServiceResult =  logService.getTodaysLogs();
app.use('/api', router);
const server = http.createServer(app);

// var express = require('express');

const io = new Server(server,{
  cors: {
    origin: "http://localhost:5173",
    methods : ['GET','POST']
  },
});
setupWebSocket(io);




// io.on('connection', (socket) => {
//   console.log('A user connected');
// });




// const io = new Server(server,{
//   cors: {
//     origin: ['http://localhost:5173/*'],
//     methods : ['GET','POST']
//   }
// });

const port = 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// var io = require('socket.io').listen(server);
// setupWebSocket(io);
