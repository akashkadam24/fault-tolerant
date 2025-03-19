import React, { useEffect, useRef } from 'react';
import { useChatContext } from '../context/ChatContext';
import Message from './Message';
import './Chat.css';

const MessageList = () => {
  const { messages, userId } = useChatContext();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages-container custom-scrollbar">
      {messages.map((msg) => (
        <Message
          key={msg.messageId}
          message={msg}
          isOwnMessage={msg.sender === userId}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;