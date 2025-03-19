const socketIO = require("socket.io");
const Message = require("../models/Message");
const messageQueueService = require("./RedisQueue");
const { 
  SOCKET_EVENTS, 
  MESSAGE_STATUS, 
  RETRY_CONFIG,
  WEBSOCKET_CONFIG,
  VIDEO_CONFIG 
} = require("../config/constants");

class WebSocketService {
  constructor(server) {
    this.io = socketIO(server, { 
      cors: { origin: WEBSOCKET_CONFIG.CORS_ORIGIN },
      pingTimeout: WEBSOCKET_CONFIG.PING_TIMEOUT,
      pingInterval: WEBSOCKET_CONFIG.PING_INTERVAL
    });
    this.connectedUsers = new Map();
    this.messageSequence = 0;
    this.pendingMessages = new Map();
    this.videoConnections = new Map();
    messageQueueService.setIO(this.io);
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
      console.log(`Socket connected: ${socket.id}`);

      socket.on(SOCKET_EVENTS.REGISTER_USER, ({ userId }) => {
        this.handleUserRegistration(socket, userId);
      });

      socket.on(SOCKET_EVENTS.SEND_MESSAGE, async (data) => {
        try {
          await this.handleMessage(socket, data);
        } catch (error) {
          this.handleError(socket, error, data.messageId);
        }
      });

      socket.on(SOCKET_EVENTS.MESSAGE_ACK, async (data) => {
        try {
          await this.handleMessageAcknowledgment(data);
        } catch (error) {
          console.error("Error handling message acknowledgment:", error);
        }
      });

      socket.on(SOCKET_EVENTS.VIDEO_SIGNAL, (data) => {
        try {
          this.handleVideoSignal(socket, data);
        } catch (error) {
          this.handleVideoError(socket, error);
        }
      });

      socket.on(SOCKET_EVENTS.VIDEO_STATE, (data) => {
        try {
          this.handleVideoStateChange(socket, data);
        } catch (error) {
          this.handleVideoError(socket, error);
        }
      });

      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        this.handleDisconnection(socket);
      });

      socket.on('error', (error) => {
        this.handleError(socket, error);
      });
    });
  }

  handleUserRegistration(socket, userId) {
    this.connectedUsers.set(socket.id, userId);
    console.log(`User registered: ${userId}`);
    
    // Send current video states to new user
    const videoStates = Array.from(this.videoConnections.entries())
      .filter(([socketId]) => socketId !== socket.id)
      .map(([_, state]) => state);
    
    if (videoStates.length > 0) {
      socket.emit(SOCKET_EVENTS.VIDEO_STATE, { states: videoStates });
    }
    
    this.resendPendingMessages(userId);
  }

  async handleMessage(socket, data) {
    const { text, sender, messageId, timestamp = Date.now(), isRetry = false } = data;
    
    try {
      // Validate message data
      if (!text || !sender || !messageId) {
        throw new Error("Invalid message data");
      }

      // Use findOneAndUpdate for atomic operation to prevent race conditions
      const message = await Message.findOneAndUpdate(
        { messageId },
        {
          $setOnInsert: {
            text,
            sender,
            messageId,
            timestamp,
            sequenceNumber: ++this.messageSequence,
            status: MESSAGE_STATUS.PENDING,
            attempts: 0,
            deduplicationId: `${messageId}-${Date.now()}`
          }
        },
        { 
          upsert: true, 
          new: true, 
          setDefaultsOnInsert: true 
        }
      );

      // If message already exists and is delivered, just acknowledge
      if (message.status === MESSAGE_STATUS.DELIVERED) {
        console.log(`Message ${messageId} already delivered, acknowledging`);
        this.sendMessageAcknowledgment(socket, message);
        return;
      }

      // Update pending messages map
      this.pendingMessages.set(messageId, message);

      // Only simulate drops for non-retry messages and respect drop rate
      if (!isRetry && Math.random() < RETRY_CONFIG.DROP_RATE) {
        console.log(`Message ${messageId} dropped, queueing retry`);
        message.status = MESSAGE_STATUS.RETRYING;
        await message.save();
        await this.queueMessageRetry(messageId);
        return;
      }

      // Update message status and broadcast
      message.status = MESSAGE_STATUS.SENDING;
      await message.save();
      
      // Broadcast with deduplication info
      this.broadcastMessage({
        ...message.toObject(),
        deduplicationId: `${messageId}-${message.attempts}`,
        requiresAck: true
      });
    } catch (error) {
      console.error(`Error handling message ${messageId}:`, error);
      throw error;
    }
  }

  async handleMessageAcknowledgment(data) {
    const { messageId, status } = data;
    const message = await Message.findOne({ messageId });
    
    if (!message) {
      console.error(`Message ${messageId} not found for acknowledgment`);
      return;
    }

    message.status = status;
    message.delivered = status === MESSAGE_STATUS.DELIVERED;
    message.acknowledged = true;
    await message.save();

    if (status === MESSAGE_STATUS.DELIVERED) {
      this.pendingMessages.delete(messageId);
    }

    this.io.emit(SOCKET_EVENTS.MESSAGE_ACK, {
      messageId,
      status,
      sequenceNumber: message.sequenceNumber
    });
  }

  async queueMessageRetry(messageId) {
    const backoffDelay = this.calculateBackoffDelay(messageId);
    await messageQueueService.addMessage(messageId, {
      delay: backoffDelay,
      attempts: RETRY_CONFIG.MAX_ATTEMPTS
    });
  }

  calculateBackoffDelay(messageId) {
    const message = this.pendingMessages.get(messageId);
    const attempts = message ? message.attempts : 0;
    const baseDelay = RETRY_CONFIG.DELAY;
    
    if (RETRY_CONFIG.BACKOFF_TYPE === 'exponential') {
      return Math.min(baseDelay * Math.pow(2, attempts), RETRY_CONFIG.MAX_BACKOFF);
    }
    return baseDelay;
  }

  async resendPendingMessages(userId) {
    const pendingMessages = await Message.find({
      status: MESSAGE_STATUS.PENDING,
      sender: userId
    }).sort({ sequenceNumber: 1 });

    for (const message of pendingMessages) {
      this.broadcastMessage({
        ...message.toObject(),
        deduplicationId: `${message.messageId}-${message.attempts}`,
        requiresAck: true,
        isRetry: true
      });
    }
  }

  broadcastMessage(message) {
    this.io.emit(SOCKET_EVENTS.RECEIVE_MESSAGE, message);
  }

  handleVideoSignal(socket, { signal, videoEnabled, type }) {
    try {
      const fromUser = this.connectedUsers.get(socket.id);
      const timestamp = Date.now();
      
      // Validate signal data
      if (!signal || !type) {
        throw new Error("Invalid video signal data");
      }

      // Update video connection state
      this.videoConnections.set(socket.id, {
        userId: fromUser,
        videoEnabled,
        timestamp,
        type,
        lastSignalType: type,
        connectionState: type === 'offer' ? 'initiating' :
                       type === 'answer' ? 'connected' :
                       'negotiating'
      });

      // For offers, broadcast to all other peers
      if (type === 'offer') {
        socket.broadcast.emit(SOCKET_EVENTS.VIDEO_SIGNAL, {
          signal,
          from: socket.id,
          fromUser,
          videoEnabled,
          type,
          timestamp
        });
      }
      // For answers and candidates, send to the peer that sent the offer
      else {
        const offeringSockets = Array.from(this.videoConnections.entries())
          .filter(([id, state]) =>
            id !== socket.id &&
            state.lastSignalType === 'offer' &&
            state.connectionState === 'initiating'
          )
          .map(([id]) => id);

        if (offeringSockets.length > 0) {
          const signalData = {
            signal,
            from: socket.id,
            fromUser,
            videoEnabled,
            type,
            timestamp
          };

          // Send to all potential offering sockets
          offeringSockets.forEach(targetSocket => {
            this.io.to(targetSocket).emit(SOCKET_EVENTS.VIDEO_SIGNAL, signalData, (ack) => {
              if (!ack) {
                let retryCount = 0;
                const retryInterval = setInterval(() => {
                  if (retryCount < VIDEO_CONFIG.RECONNECT_ATTEMPTS) {
                    console.log(`Retrying video signal to ${targetSocket}, attempt ${retryCount + 1}`);
                    this.io.to(targetSocket).emit(SOCKET_EVENTS.VIDEO_SIGNAL, {
                      ...signalData,
                      retry: ++retryCount
                    });
                  } else {
                    clearInterval(retryInterval);
                    this.handleVideoError(socket, new Error(`Failed to deliver video signal to peer`));
                  }
                }, VIDEO_CONFIG.RECONNECT_INTERVAL);
              }
            });
          });
        }
      }
    } catch (error) {
      console.error("Error in video signal handling:", error);
      this.handleVideoError(socket, error);
    }
  }

  handleVideoStateChange(socket, { videoEnabled }) {
    try {
      const userId = this.connectedUsers.get(socket.id);
      const timestamp = Date.now();
      
      if (!userId) {
        throw new Error("User not registered for video");
      }

      // Get existing connection state
      const existingState = this.videoConnections.get(socket.id);
      
      // Update video state with connection tracking
      const newState = {
        userId,
        videoEnabled,
        timestamp,
        connectionState: videoEnabled ? 'active' : 'inactive',
        lastStateChange: timestamp,
        connectionHistory: existingState?.connectionHistory || [],
        reconnectAttempts: 0
      };

      // Track state change in history
      newState.connectionHistory.push({
        state: videoEnabled ? 'enabled' : 'disabled',
        timestamp
      });

      // Keep only last 10 state changes
      if (newState.connectionHistory.length > 10) {
        newState.connectionHistory.shift();
      }

      this.videoConnections.set(socket.id, newState);

      // Broadcast state change with reliability check
      const stateChangeData = {
        userId,
        videoEnabled,
        timestamp,
        connectionId: `${socket.id}-${timestamp}`,
        connectionState: newState.connectionState
      };

      // Emit to all clients except sender with acknowledgment
      socket.broadcast.emit(SOCKET_EVENTS.VIDEO_STATE, stateChangeData, (ack) => {
        if (!ack && videoEnabled) {
          let retryCount = 0;
          const retryInterval = setInterval(() => {
            if (retryCount < VIDEO_CONFIG.RECONNECT_ATTEMPTS && 
                this.videoConnections.get(socket.id)?.videoEnabled) {
              console.log(`Retrying video state broadcast for ${userId}, attempt ${retryCount + 1}`);
              socket.broadcast.emit(SOCKET_EVENTS.VIDEO_STATE, {
                ...stateChangeData,
                retry: ++retryCount
              });
            } else {
              clearInterval(retryInterval);
            }
          }, VIDEO_CONFIG.RECONNECT_INTERVAL);
        }
      });
    } catch (error) {
      console.error("Error in video state change:", error);
      this.handleVideoError(socket, error);
    }
  }

  handleDisconnection(socket) {
    const userId = this.connectedUsers.get(socket.id);
    this.connectedUsers.delete(socket.id);
    
    const videoState = this.videoConnections.get(socket.id);
    this.videoConnections.delete(socket.id);
    
    console.log(`Socket disconnected: ${socket.id}, User: ${userId}`);
    
    if (videoState?.videoEnabled) {
      // Notify other users about video disconnection
      this.io.emit(SOCKET_EVENTS.VIDEO_STATE, {
        userId,
        videoEnabled: false,
        disconnected: true,
        timestamp: Date.now(),
        reason: 'user_disconnected'
      });
    }
  }

  handleError(socket, error, messageId = null) {
    console.error("Socket error:", error);
    
    if (messageId) {
      socket.emit(SOCKET_EVENTS.MESSAGE_ACK, {
        messageId,
        status: MESSAGE_STATUS.FAILED,
        error: error.message
      });
    }

    socket.emit('error', {
      message: error.message,
      timestamp: Date.now()
    });
  }

  handleVideoError(socket, error) {
    console.error("Video error:", error);
    socket.emit(SOCKET_EVENTS.VIDEO_ERROR, {
      error: error.message,
      timestamp: Date.now()
    });
  }

  sendMessageAcknowledgment(socket, message) {
    socket.emit(SOCKET_EVENTS.MESSAGE_ACK, {
      messageId: message.messageId,
      status: message.status,
      sequenceNumber: message.sequenceNumber
    });
  }
}

module.exports = WebSocketService;
