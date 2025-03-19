# Fault-Tolerant Video Chat Application

A real-time video chat application with fault tolerance and automatic recovery mechanisms.

## System Architecture

```
                                     Fault-Tolerant Video Chat System
                                     ================================

┌─────────────────────┐     WebRTC     ┌─────────────────────┐
│    Client (Peer1)   │◄──────P2P──────►│    Client (Peer2)   │
└─────────────────────┘                 └─────────────────────┘
          ▲                                        ▲
          │                                        │
          │ WebSocket                   WebSocket │
          │                                        │
          ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                        Server Layer                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  WebSocket  │    │   Express   │    │    TURN     │     │
│  │   Server    │    │    API      │    │   Server    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Features

- Real-time video chat with WebRTC
- Automatic reconnection for dropped connections
- Fallback mechanisms for video quality
- Message queuing with Redis for reliability
- MongoDB for persistent storage
- Comprehensive error handling

## Prerequisites

- Node.js v20.11.0 (specified in .nvmrc)
- MongoDB
- Redis
- A TURN server (for production deployment)

## Quick Start

1. Install Node.js v20.11.0 using nvm:
   ```bash
   nvm install
   nvm use
   ```

2. Set up the server:
   ```bash
   cd server
   npm install
   cp .env.example .env
   ```

3. Set up the client:
   ```bash
   cd client
   npm install
   cp .env.example .env
   ```

4. Configure environment variables:
   - Server: Edit `server/.env` with MongoDB and Redis credentials
   - Client: Edit `client/.env` with backend URL

5. Start the application:
   ```bash
   # Terminal 1 - Start the server
   cd server
   npm run dev

   # Terminal 2 - Start the client
   cd client
   npm run dev
   ```

6. Access the application at `http://localhost:5175`

## Comprehensive Documentation

### Design and Architecture
- [System Architecture and Design Decisions](docs/ARCHITECTURE.md)
  - High-level system design
  - Component architecture
  - Design decisions and rationales
  - Safety protocols
  - Trade-offs considered

### Testing and Validation
- [Testing Documentation](docs/TESTING.md)
  - Testing strategy
  - Test categories
  - Dynamic input handling
  - Emergency response scenarios
  - Validation methods

### Critical Explanations
- [Problem Approach and Trade-offs](docs/CRITICAL_EXPLANATIONS.md)
  - Development approach
  - Key trade-offs
  - Safety strategy
  - System adaptability
  - Impact on workflow

### Component Documentation
- [Server Documentation](server/README.md)
  - Server architecture
  - API endpoints
  - WebSocket implementation
  - Database integration
  - Message queuing

- [Client Documentation](client/README.md)
  - React components
  - State management
  - WebRTC implementation
  - Error handling
  - UI/UX features

## Environment Setup

See `.env.example` files in both server and client directories for detailed environment variable documentation:
- [Server Environment Variables](server/.env.example)
- [Client Environment Variables](client/.env.example)

## Production Deployment

For production deployment:

1. Set NODE_ENV=production in both server and client .env files
2. Set up a proper TURN server (required for NAT traversal)
3. Configure secure MongoDB and Redis instances
4. Set appropriate CORS origins
5. Enable rate limiting
6. Use proper SSL/TLS certificates

## Security Considerations

1. Never commit .env files to version control
2. Use strong passwords for MongoDB and Redis
3. Configure proper CORS settings
4. Implement rate limiting for production
5. Use secure WebSocket connections
6. Regularly update dependencies

## Contributing

See detailed contribution guidelines in server and client READMEs.

## License

MIT License - see LICENSE file for details