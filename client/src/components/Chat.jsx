import React, { useEffect, useState } from 'react';
import { ChatProvider, useChatContext } from '../context/ChatContext';
import { VideoProvider, useVideoContext } from '../context/VideoContext';
import { socketService } from '../services/socketService';
import StatusBar from './StatusBar';
import VideoSection from './VideoSection';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import './Chat.css';

const ConnectionStatus = ({ status, message }) => {
  const statusClasses = {
    connected: 'status-success',
    disconnected: 'status-error',
    connecting: 'status-warning',
    error: 'status-error'
  };

  return (
    <div className={`connection-banner ${statusClasses[status] || 'status-default'}`}>
      <span className="status-icon"></span>
      <span className="status-text">
        {status === 'connected' && 'Connected to server'}
        {status === 'disconnected' && 'Disconnected from server'}
        {status === 'connecting' && 'Connecting to server...'}
        {status === 'error' && `Error: ${message || 'Connection failed'}`}
      </span>
    </div>
  );
};

const ChatContent = () => {
  const { messages, connectionStatus } = useChatContext();
  const { videoStatus } = useVideoContext();
  const [showConnectionBanner, setShowConnectionBanner] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const handleConnectionChange = ({ status, message }) => {
      setShowConnectionBanner(status !== 'connected');
      setConnectionMessage(message);
    };

    const unsubscribe = socketService.onConnectionChange(handleConnectionChange);
    return () => unsubscribe();
  }, []);

  const getVideoContainerClass = () => {
    const classes = ['video-container'];
    if (videoStatus === 'connecting') classes.push('connecting');
    if (videoStatus === 'connected') classes.push('connected');
    if (videoStatus === 'failed') classes.push('failed');
    return classes.join(' ');
  };

  const getMainContentClass = () => {
    const classes = ['main-content'];
    if (videoStatus === 'connected') classes.push('video-active');
    return classes.join(' ');
  };

  return (
    <div className="app-container">
      {showConnectionBanner && (
        <ConnectionStatus
          status={connectionStatus}
          message={connectionMessage}
        />
      )}
      <StatusBar />
      <div className={getMainContentClass()}>
        <div className={getVideoContainerClass()}>
          <div className={`video-status-banner ${videoStatus !== 'connected' ? 'visible' : ''}`}>
            {videoStatus === 'connecting' && 'Establishing video connection...'}
            {videoStatus === 'failed' && 'Video connection failed. Click to retry.'}
            {videoStatus === 'unstable' && 'Poor connection quality. Adjusting video quality...'}
          </div>
          <VideoSection />
        </div>
        <div className="chat-section">
          <div className="chat-header">
            <h3 className="section-title">Chat Messages</h3>
            <div className="chat-status">
              {messages.length} messages • {
                connectionStatus === 'connected' ?
                'Live' :
                connectionStatus === 'connecting' ?
                'Connecting...' :
                'Reconnecting...'
              }
            </div>
          </div>
          <MessageList />
          <div className={`input-container ${inputFocused ? 'focused' : ''}`}>
            <MessageInput
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const Chat = () => {
  return (
    <ChatProvider>
      <VideoProvider>
        <ChatContent />
      </VideoProvider>
    </ChatProvider>
  );
};

export default Chat;
