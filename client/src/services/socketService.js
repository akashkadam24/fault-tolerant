import io from "socket.io-client";
import { 
  SOCKET_EVENTS, 
  LOCAL_STORAGE_KEYS,
  UI_CONSTANTS 
} from "../config/constants";

class SocketService {
  constructor() {
    this.socket = null;
    this.messageCallbacks = new Set();
    this.connectionCallbacks = new Set();
    this.pendingMessages = new Map();
    this.userId = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_ID) || 
                 `user_${Math.random().toString(36).substr(2, 9)}`;
    this.reconnectAttempts = 0;
    this.reconnectInterval = null;
    
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_ID, this.userId);
    this.connect();
  }

  connect() {
    if (this.socket) {
      this.socket.close();
    }

    const serverUrl = import.meta.env.VITE_APP_BACKEND_URL || "http://localhost:3001";
    
    this.socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: UI_CONSTANTS.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: UI_CONSTANTS.RECONNECT_TIMEOUT,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.socket.on('connect', () => {
      console.log("Connected to server with ID:", this.socket.id);
      this.reconnectAttempts = 0;
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }
      
      // Register user after successful connection
      this.socket.emit(SOCKET_EVENTS.REGISTER_USER, { 
        userId: this.userId,
        timestamp: Date.now()
      });

      // Notify connection status
      this.notifyConnectionStatus('connected');
    });

    this.socket.on('connect_error', (error) => {
      console.error("Connection error:", error);
      this.notifyConnectionStatus('error', error.message);
      this.handleReconnect();
    });

    this.socket.on(SOCKET_EVENTS.RECEIVE_MESSAGE, (message) => {
      // Send acknowledgment
      this.socket.emit(SOCKET_EVENTS.MESSAGE_ACK, { 
        messageId: message.messageId,
        timestamp: Date.now()
      });

      // Notify message handlers
      this.messageCallbacks.forEach(callback => callback(message));
    });

    this.socket.on('disconnect', (reason) => {
      console.log("Disconnected from server:", reason);
      this.notifyConnectionStatus('disconnected', reason);
      this.handleReconnect();
    });

    this.socket.on('error', (error) => {
      console.error("Socket error:", error);
      this.notifyConnectionStatus('error', error.message);
    });
  }

  handleReconnect() {
    if (!this.reconnectInterval && this.reconnectAttempts < UI_CONSTANTS.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectInterval = setInterval(() => {
        if (!this.socket.connected) {
          console.log(`Reconnection attempt ${this.reconnectAttempts + 1}`);
          this.reconnectAttempts++;
          this.socket.connect();
          
          if (this.reconnectAttempts >= UI_CONSTANTS.MAX_RECONNECT_ATTEMPTS) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
            this.notifyConnectionStatus('failed', 'Max reconnection attempts reached');
          }
        } else {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      }, UI_CONSTANTS.RECONNECT_TIMEOUT);
    }
  }

  notifyConnectionStatus(status, message = '') {
    this.connectionCallbacks.forEach(callback => callback({ status, message }));
  }

  onConnectionChange(callback) {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  sendMessage(text) {
    if (!this.socket.connected) {
      throw new Error('Not connected to server');
    }

    const messageId = `${this.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      text,
      sender: this.userId,
      messageId,
      timestamp: Date.now()
    };

    // Add to pending messages
    this.pendingMessages.set(messageId, {
      ...message,
      attempts: 0,
      lastAttempt: Date.now()
    });

    this.socket.emit(SOCKET_EVENTS.SEND_MESSAGE, message, (ack) => {
      if (!ack) {
        console.log(`Message ${messageId} not acknowledged, will retry`);
        this.handleMessageRetry(messageId);
      }
    });

    return messageId;
  }

  handleMessageRetry(messageId) {
    const message = this.pendingMessages.get(messageId);
    if (message && message.attempts < UI_CONSTANTS.MAX_RETRY_ATTEMPTS) {
      setTimeout(() => {
        if (this.socket.connected && this.pendingMessages.has(messageId)) {
          message.attempts++;
          message.lastAttempt = Date.now();
          this.socket.emit(SOCKET_EVENTS.SEND_MESSAGE, message);
        }
      }, UI_CONSTANTS.RETRY_INTERVAL * Math.pow(2, message.attempts));
    }
  }

  getUserId() {
    return this.userId;
  }

  onMessage(callback) {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  clearSession() {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_ID);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CHAT_MESSAGES);
    if (this.socket) {
      this.socket.close();
    }
    window.location.reload();
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
}

export const socketService = new SocketService();