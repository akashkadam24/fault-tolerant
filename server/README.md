# Fault-Tolerant Video Chat Server

The server component of the fault-tolerant video chat application, handling WebSocket connections, message queuing, and video streaming coordination.

## Technologies Used

- Node.js v20.11.0
- Express.js for REST API
- WebSocket for real-time communication
- Redis for message queuing
- MongoDB for data persistence

## Prerequisites

- Node.js v20.11.0 (use nvm for version management)
- Redis server running locally or accessible
- MongoDB instance running locally or accessible
- TURN server credentials (for production)

## Environment Setup

1. Install the correct Node.js version:
   ```bash
   nvm install
   nvm use
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your .env file with the following required variables:
   ```
   NODE_ENV=development
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/chat-app
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   ```

## Available Scripts

- `npm run dev`: Start the server in development mode with hot reload
- `npm start`: Start the server in production mode
- `npm test`: Run the test suite
- `npm run lint`: Run ESLint for code quality
- `npm run build`: Build the project for production

## API Endpoints

### WebSocket Endpoints

- `/ws`: Main WebSocket connection endpoint
  - Handles real-time video and chat communication
  - Implements automatic reconnection
  - Manages peer connections

### HTTP Endpoints

- `POST /api/messages`: Send a new message
- `GET /api/messages`: Get message history
- `POST /api/rooms`: Create a new room
- `GET /api/rooms/:id`: Get room details

## Architecture

### Message Queue System

The server implements a reliable message queue using Redis:
- Messages are queued when delivery fails
- Automatic retry mechanism with configurable attempts
- Dead letter queue for failed messages
- Message persistence across server restarts

### Fault Tolerance Features

1. Connection Management
   - Automatic WebSocket reconnection
   - Session persistence
   - Graceful degradation

2. Data Reliability
   - Redis-based message queuing
   - MongoDB for persistent storage
   - Transaction support for critical operations

3. Error Handling
   - Comprehensive error logging
   - Automatic recovery mechanisms
   - Circuit breaker patterns

## Monitoring and Logging

- Winston logger configured for both file and console output
- Error tracking with stack traces
- Performance metrics logging
- Request/Response logging in development

## Security Measures

1. Environment Configuration
   - Secure credential management through .env
   - Different configurations for development/production

2. API Security
   - Rate limiting
   - CORS configuration
   - Input validation
   - XSS protection

3. WebSocket Security
   - Connection validation
   - Message rate limiting
   - Payload size restrictions

## Production Considerations

1. Environment Setup
   - Set NODE_ENV=production
   - Configure secure MongoDB connection
   - Set up production Redis instance
   - Configure TURN server credentials

2. Performance Optimization
   - Enable compression
   - Configure appropriate WebSocket ping intervals
   - Set proper connection timeouts
   - Optimize database queries

3. Monitoring
   - Set up error tracking service
   - Configure performance monitoring
   - Set up alerts for critical errors

## Troubleshooting

### Common Issues

1. Connection Errors
   ```
   Error: ECONNREFUSED 127.0.0.1:6379
   ```
   - Ensure Redis is running and accessible
   - Check Redis connection configuration

2. MongoDB Errors
   ```
   MongoServerError: Authentication failed
   ```
   - Verify MongoDB credentials
   - Check MongoDB connection string

3. WebSocket Issues
   - Check CORS configuration
   - Verify client connection URL
   - Check server logs for connection details

## Contributing

1. Follow the established code style
2. Write tests for new features
3. Update documentation as needed
4. Use descriptive commit messages