import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { socketService } from '../services/socketService';
import { LOCAL_STORAGE_KEYS, UI_CONSTANTS, MESSAGE_STATUS } from '../config/constants';

const ChatContext = createContext();

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState(new Map());
  const [userId] = useState(socketService.getUserId());
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [retryQueue, setRetryQueue] = useState(new Map());

  // Load persisted messages on mount
  useEffect(() => {
    const loadPersistedMessages = () => {
      const savedMessages = localStorage.getItem(LOCAL_STORAGE_KEYS.CHAT_MESSAGES);
      const savedPending = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_MESSAGES);
      
      if (savedMessages) {
        try {
          const parsedMessages = JSON.parse(savedMessages);
          const relevantMessages = parsedMessages
            .filter(msg => msg.sender === userId || msg.recipients?.includes(userId))
            .slice(-UI_CONSTANTS.MAX_MESSAGES_STORED);
          setMessages(relevantMessages);
        } catch (error) {
          console.error('Error parsing saved messages:', error);
        }
      }

      if (savedPending) {
        try {
          const parsedPending = JSON.parse(savedPending);
          setPendingMessages(new Map(parsedPending));
          // Queue undelivered messages for retry
          Object.entries(parsedPending).forEach(([messageId, message]) => {
            if (message.status !== MESSAGE_STATUS.DELIVERED) {
              setRetryQueue(prev => new Map(prev).set(messageId, message));
            }
          });
        } catch (error) {
          console.error('Error parsing pending messages:', error);
        }
      }
    };

    loadPersistedMessages();
  }, [userId]);

  // Handle message retries
  useEffect(() => {
    const retryInterval = setInterval(() => {
      if (connectionStatus === 'Connected' && retryQueue.size > 0) {
        retryQueue.forEach((message, messageId) => {
          if (message.attempts < UI_CONSTANTS.MAX_RETRY_ATTEMPTS) {
            console.log(`Retrying message ${messageId}, attempt ${message.attempts + 1}`);
            socketService.sendMessage(message.text, messageId);
            setRetryQueue(prev => {
              const updated = new Map(prev);
              message.attempts += 1;
              updated.set(messageId, message);
              return updated;
            });
          } else {
            console.log(`Max attempts reached for message ${messageId}`);
            updateMessageStatus(messageId, MESSAGE_STATUS.FAILED);
            setRetryQueue(prev => {
              const updated = new Map(prev);
              updated.delete(messageId);
              return updated;
            });
          }
        });
      }
    }, UI_CONSTANTS.RETRY_INTERVAL);

    return () => clearInterval(retryInterval);
  }, [connectionStatus, retryQueue]);

  // Socket event handlers
  useEffect(() => {
    const handleNewMessage = (newMessage) => {
      if (newMessage.requiresAck) {
        socketService.sendMessageAck(newMessage.messageId);
      }

      // Check for duplicate messages using deduplicationId
      const isDuplicate = messages.some(msg =>
        msg.messageId === newMessage.messageId &&
        msg.deduplicationId === newMessage.deduplicationId
      );

      if (!isDuplicate) {
        setMessages(prev => {
          const allMessages = [...prev, newMessage];
          const uniqueMessages = Array.from(
            new Map(allMessages.map(msg => [msg.messageId, msg])).values()
          )
            .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
            .slice(-UI_CONSTANTS.MAX_MESSAGES_STORED);
          
          localStorage.setItem(LOCAL_STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(uniqueMessages));
          return uniqueMessages;
        });
      }
    };

    const handleMessageAck = (ack) => {
      updateMessageStatus(ack.messageId, ack.status);
      if (ack.status === MESSAGE_STATUS.DELIVERED) {
        setRetryQueue(prev => {
          const updated = new Map(prev);
          updated.delete(ack.messageId);
          return updated;
        });
      }
    };

    const handleConnect = () => {
      setConnectionStatus('Connected');
      // Retry pending messages on reconnect
      pendingMessages.forEach((message, messageId) => {
        if (message.status !== MESSAGE_STATUS.DELIVERED) {
          setRetryQueue(prev => new Map(prev).set(messageId, message));
        }
      });
    };

    const handleDisconnect = () => {
      setConnectionStatus('Disconnected');
    };

    socketService.onMessage(handleNewMessage);
    socketService.socket.on('messageAck', handleMessageAck);
    socketService.socket.on('connect', handleConnect);
    socketService.socket.on('disconnect', handleDisconnect);

    return () => {
      socketService.socket.off('messageAck', handleMessageAck);
      socketService.socket.off('connect', handleConnect);
      socketService.socket.off('disconnect', handleDisconnect);
    };
  }, [pendingMessages]);

  const updateMessageStatus = useCallback((messageId, status) => {
    setPendingMessages(prev => {
      const updated = new Map(prev);
      const message = updated.get(messageId);
      if (message) {
        message.status = status;
        updated.set(messageId, message);
        localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_MESSAGES, 
          JSON.stringify(Array.from(updated.entries())));
      }
      return updated;
    });

    setMessages(prev => 
      prev.map(msg => 
        msg.messageId === messageId 
          ? { ...msg, status } 
          : msg
      )
    );
  }, []);

  const sendMessage = useCallback((text) => {
    if (!text.trim()) return;
    
    const messageId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newMessage = {
      text,
      sender: userId,
      messageId,
      timestamp: Date.now(),
      status: MESSAGE_STATUS.PENDING,
      attempts: 0
    };
    
    setPendingMessages(prev => {
      const updated = new Map(prev).set(messageId, newMessage);
      localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_MESSAGES, 
        JSON.stringify(Array.from(updated.entries())));
      return updated;
    });

    setMessages(prev => [...prev, newMessage]);
    socketService.sendMessage(text, messageId);
  }, [userId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingMessages(new Map());
    setRetryQueue(new Map());
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CHAT_MESSAGES);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.PENDING_MESSAGES);
  }, []);

  const value = {
    messages,
    userId,
    connectionStatus,
    sendMessage,
    clearMessages,
    pendingMessages: Array.from(pendingMessages.values())
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};