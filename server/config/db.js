const mongoose = require('mongoose');

// Disable buffering so queries fail fast when MongoDB is offline
mongoose.set('bufferCommands', false);

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

let retryCount = 0;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/jarvis';

  const options = {
    serverSelectionTimeoutMS: 10000,
    heartbeatFrequencyMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: true,
    family: 4, // Force IPv4 — avoids SSL handshake issues on Windows
  };

  try {
    const conn = await mongoose.connect(uri, options);
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
    retryCount = 0;
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[MongoDB] Retrying in ${RETRY_DELAY_MS / 1000}s... (${retryCount}/${MAX_RETRIES})`);
      setTimeout(connectDB, RETRY_DELAY_MS);
    } else {
      console.error('[MongoDB] Max retries reached. Running without database.');
    }
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Disconnected from database.');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Reconnected successfully.');
  retryCount = 0;
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Error: ${err.message}`);
});

const getConnectionStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
};

module.exports = { connectDB, getConnectionStatus };
