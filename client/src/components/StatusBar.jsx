import React from 'react';
import { useChatContext } from '../context/ChatContext';
import { socketService } from '../services/socketService';
import './Chat.css';

const StatusBar = () => {
  const { userId, connectionStatus, clearMessages } = useChatContext();

  return (
    <div className="status-bar">
      <span className={`status-indicator ${connectionStatus.toLowerCase()}`}>
        {connectionStatus}
      </span>
      <span className="user-id">Your ID: {userId}</span>
      <div className="status-controls">
        <button 
          className="clear-chat"
          onClick={clearMessages}
        >
          Clear Chat
        </button>
        <button 
          className="new-session"
          onClick={() => socketService.clearSession()}
        >
          New Session
        </button>
      </div>
    </div>
  );
};

export default StatusBar;