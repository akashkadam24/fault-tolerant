import React from 'react';
import PropTypes from 'prop-types';
import './Chat.css';

const Message = ({ message, isOwnMessage }) => {
  if (!message || typeof message !== 'object') {
    console.error('Invalid message format:', message);
    return null;
  }

  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid time';
    }
  };

  const getSenderDisplay = () => {
    if (!message.sender) return 'Unknown';
    return isOwnMessage ? 'You' : `User ${message.sender.slice(-4)}`;
  };

  return (
    <div className={`message ${isOwnMessage ? 'sent' : 'received'}`}>
      <div className="message-content">
        <p>{message.text}</p>
        <div className="message-info">
          <small className="message-sender">{getSenderDisplay()}</small>
          <small className="message-time">{formatTime(message.timestamp)}</small>
        </div>
      </div>
    </div>
  );
};

Message.propTypes = {
  message: PropTypes.shape({
    text: PropTypes.string.isRequired,
    sender: PropTypes.string.isRequired,
    timestamp: PropTypes.number.isRequired,
    messageId: PropTypes.string.isRequired
  }).isRequired,
  isOwnMessage: PropTypes.bool.isRequired
};

export default Message;