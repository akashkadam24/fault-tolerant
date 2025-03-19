const MESSAGE_STATUS = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed'
};

const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  REGISTER_USER: 'registerUser',
  SEND_MESSAGE: 'sendMessage',
  RECEIVE_MESSAGE: 'receiveMessage',
  MESSAGE_ACK: 'messageAck',
  MESSAGE_STATUS: 'messageStatus',
  VIDEO_SIGNAL: 'videoSignal',
  VIDEO_STATE: 'videoState',
  VIDEO_ERROR: 'videoError',
  VIDEO_RECONNECT: 'videoReconnect',
  SERVER_SHUTDOWN: 'server_shutdown',
  ERROR: 'error'
};

const RETRY_CONFIG = {
  DROP_RATE: parseFloat(process.env.MESSAGE_DROP_RATE) || 0.5,
  DELAY: parseInt(process.env.MESSAGE_RETRY_DELAY) || 2000,
  MAX_ATTEMPTS: parseInt(process.env.MESSAGE_MAX_ATTEMPTS) || 5,
  BACKOFF_TYPE: 'exponential',
  MAX_BACKOFF: 30000 // Maximum backoff delay in ms
};

const VIDEO_CONFIG = {
  ICE_SERVERS: [
    { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
    {
      urls: process.env.TURN_SERVER,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD
    }
  ].filter(server => server.urls), // Filter out undefined TURN server if not configured
  RECONNECT_ATTEMPTS: parseInt(process.env.VIDEO_RECONNECT_ATTEMPTS) || 3,
  RECONNECT_INTERVAL: parseInt(process.env.VIDEO_RECONNECT_INTERVAL) || 2000,
  CONNECTION_TIMEOUT: parseInt(process.env.VIDEO_CONNECTION_TIMEOUT) || 15000,
  QUALITY_CHECK_INTERVAL: parseInt(process.env.VIDEO_QUALITY_CHECK_INTERVAL) || 5000
};

const REDIS_CONFIG = {
  RETRY_STRATEGY: (times) => {
    const delay = Math.min(times * 1000, 15000);
    return delay;
  },
  MAX_ATTEMPTS: parseInt(process.env.REDIS_MAX_ATTEMPTS) || 5,
  KEEP_COMPLETED: {
    AGE: parseInt(process.env.REDIS_KEEP_COMPLETED_AGE) || 24 * 3600, // 24 hours
    COUNT: parseInt(process.env.REDIS_KEEP_COMPLETED_COUNT) || 1000
  },
  KEEP_FAILED: {
    AGE: parseInt(process.env.REDIS_KEEP_FAILED_AGE) || 7 * 24 * 3600 // 7 days
  }
};

const WEBSOCKET_CONFIG = {
  PING_TIMEOUT: parseInt(process.env.WS_PING_TIMEOUT) || 60000,
  PING_INTERVAL: parseInt(process.env.WS_PING_INTERVAL) || 25000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*"
};

const SERVER_CONFIG = {
  DEFAULT_PORT: parseInt(process.env.PORT) || 3001,
  BODY_LIMIT: process.env.BODY_LIMIT || "1mb",
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX) || 100
  }
};

const MONGODB_CONFIG = {
  DEFAULT_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app',
  OPTIONS: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    autoIndex: process.env.NODE_ENV === 'development'
  },
  INDEXES: {
    MESSAGE: {
      COMPOUND: [
        { sender: 1, status: 1 },
        { messageId: 1, status: 1 },
        { sequenceNumber: 1, timestamp: 1 },
        { delivered: 1, timestamp: 1 }
      ]
    }
  }
};

const CLEANUP_CONFIG = {
  MESSAGE: {
    DEFAULT_AGE: 24 * 60 * 60 * 1000, // 24 hours
    FAILED_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
    BATCH_SIZE: 1000
  }
};

module.exports = {
  MESSAGE_STATUS,
  SOCKET_EVENTS,
  RETRY_CONFIG,
  VIDEO_CONFIG,
  REDIS_CONFIG,
  WEBSOCKET_CONFIG,
  SERVER_CONFIG,
  MONGODB_CONFIG,
  CLEANUP_CONFIG
};