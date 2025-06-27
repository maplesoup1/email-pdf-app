const express = require('express');
const cors = require('cors');
const emailRoutes = require('./routes/email');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/email', emailRoutes);