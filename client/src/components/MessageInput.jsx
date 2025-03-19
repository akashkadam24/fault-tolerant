import React, { useState } from 'react';
import { useChatContext } from '../context/ChatContext';
import './Chat.css';

const MessageInput = ({ onFocus, onBlur }) => {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { sendMessage, connectionStatus } = useChatContext();
  const typingTimeoutRef = React.useRef(null);

  const handleSend = () => {
    if (!message.trim()) return;
    try {
      sendMessage(message);
      setMessage('');
      setIsTyping(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    
    // Handle typing indicator
    if (!isTyping) {
      setIsTyping(true);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1500);
  };

  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <input
        value={message}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={
          connectionStatus === 'connected'
            ? "Type a message..."
            : "Reconnecting to server..."
        }
        disabled={connectionStatus !== 'connected'}
        className={connectionStatus !== 'connected' ? 'disabled' : ''}
      />
      <button
        className="send-button"
        onClick={handleSend}
        disabled={!message.trim() || connectionStatus !== 'connected'}
      >
        {connectionStatus === 'connected' ? 'Send' : 'Connecting...'}
      </button>
    </>
  );
};

export default MessageInput;