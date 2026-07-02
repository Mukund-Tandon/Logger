// Load .env FIRST — before any require that reads env at import time. In
// particular ./routes/get_logs_route transitively imports config/models.js,
// which reads LLM_PROVIDER when the module is evaluated. If dotenv ran after
// that require, the provider would be locked to its default before .env loaded.
// Path is resolved relative to this file so it works from any cwd.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require("express");
const cors = require('cors')
const http = require('http');
const bodyParser = require('body-parser');
const { router, setupWebSocket } = require('./routes/get_logs_route');
const logService = require('./services/logservice');
const { Server } = require('socket.io');


const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use('/api', router);
const server = http.createServer(app);


const io = new Server(server,{
  cors: {
    origin: "http://localhost:5173",
    methods : ['GET','POST']
  },
});
setupWebSocket(io);


const port = 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

