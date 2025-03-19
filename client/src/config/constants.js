export const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETRYING: 'retrying'
};

export const VIDEO_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  REMOTE_DISABLED: 'remote_disabled',
  ERROR: 'error',
  FAILED: 'failed'
};

export const CONNECTION_QUALITY = {
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor'
};

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  REGISTER_USER: 'registerUser',
  SEND_MESSAGE: 'sendMessage',
  RECEIVE_MESSAGE: 'receiveMessage',
  MESSAGE_ACK: 'messageAck',
  MESSAGE_STATUS: 'messageStatus',
  VIDEO_SIGNAL: 'videoSignal',
  VIDEO_STATE: 'videoState',
  VIDEO_ERROR: 'videoError',
  VIDEO_RECONNECT: 'videoReconnect'
};

export const UI_CONSTANTS = {
  MAX_MESSAGES_STORED: 100,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_INTERVAL: 2000,
  MAX_RECONNECT_ATTEMPTS: 3,
  RECONNECT_TIMEOUT: 2000,
  QUALITY_CHECK_INTERVAL: 5000,
  STATUS_DISPLAY_DURATION: 3000,
  ERROR_DISPLAY_DURATION: 5000
};

export const VIDEO_CONFIG = {
  constraints: {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    },
    audio: true
  },
  iceServers: [
    { urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302'
    ]},
    // Note: Replace these with your own TURN server credentials in production
    {
      urls: import.meta.env.VITE_TURN_SERVER_URL || 'turn:numb.viagenie.ca',
      username: import.meta.env.VITE_TURN_SERVER_USERNAME || 'webrtc@live.com',
      credential: import.meta.env.VITE_TURN_SERVER_CREDENTIAL || 'muazkh'
    }
  ],
  iceTransportPolicy: 'all',
  reconnectionAttempts: 3,
  reconnectionDelay: 1000,
  timeout: 15000
};

export const LOCAL_STORAGE_KEYS = {
  CHAT_MESSAGES: 'chat_messages',
  PENDING_MESSAGES: 'pending_messages',
  USER_ID: 'user_id',
  VIDEO_SETTINGS: 'video_settings'
};