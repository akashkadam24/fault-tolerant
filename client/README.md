# Fault-Tolerant Video Chat Client

The client-side React application for the fault-tolerant video chat system, featuring real-time video communication, chat functionality, and automatic recovery mechanisms.

## Technologies Used

- Node.js v20.11.0
- React 18
- Vite
- WebRTC for peer-to-peer video
- WebSocket for real-time communication
- CSS Modules for styling

## Prerequisites

- Node.js v20.11.0 (use nvm for version management)
- Modern web browser with WebRTC support
- Server component running and accessible
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
   VITE_APP_BACKEND_URL=http://localhost:3001
   ```

## Available Scripts

- `npm run dev`: Start the development server
- `npm run build`: Build for production
- `npm run preview`: Preview production build locally
- `npm run lint`: Run ESLint for code quality
- `npm test`: Run the test suite

## Application Structure

```
src/
├── assets/         # Static assets
├── components/     # React components
├── config/         # Configuration files
├── context/        # React context providers
├── services/       # API and service integrations
└── styles/         # Global styles and themes
```

## Key Features

### Video Chat

- Real-time peer-to-peer video communication
- Automatic quality adjustment
- Connection recovery
- Screen sharing support
- Multiple participant support

### Chat System

- Real-time messaging
- Message persistence
- Delivery confirmation
- Offline message queueing
- Rich text support

### Fault Tolerance

1. Connection Management
   - Automatic WebSocket reconnection
   - Video stream recovery
   - Session persistence

2. User Experience
   - Loading states
   - Error boundaries
   - Fallback UI components
   - Network status indicators

## Component Documentation

### VideoSection

Main video chat component handling:
- WebRTC connections
- Stream management
- Quality monitoring
- Layout management

### Chat

Real-time chat component featuring:
- Message threading
- Delivery status
- Typing indicators
- Message persistence

### MessageInput

Text input component with:
- Rich text support
- File attachment
- Emoji support
- Message validation

## State Management

- React Context for global state
- Custom hooks for shared logic
- Local storage for persistence
- WebSocket state synchronization

## Error Handling

1. Network Errors
   - Automatic reconnection
   - Offline mode support
   - User notifications

2. Media Errors
   - Device permission handling
   - Fallback to audio-only
   - Clear error messages

3. Application Errors
   - Error boundaries
   - Logging
   - Recovery mechanisms

## Performance Optimization

1. Video Optimization
   - Adaptive bitrate
   - Resolution scaling
   - CPU usage monitoring

2. React Optimization
   - Lazy loading
   - Memo usage
   - Virtual scrolling
   - Asset optimization

## Browser Support

Supported Browsers:
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

Required Features:
- WebRTC
- WebSocket
- MediaDevices API
- Screen Capture API

## Development Guidelines

1. Code Style
   - Follow ESLint configuration
   - Use TypeScript types
   - Document complex logic
   - Write unit tests

2. Component Guidelines
   - Keep components focused
   - Use proper prop types
   - Implement error boundaries
   - Follow accessibility guidelines

3. State Management
   - Use appropriate context
   - Implement proper reducers
   - Handle side effects
   - Maintain immutability

## Production Deployment

1. Environment Setup
   - Set NODE_ENV=production
   - Configure production API URL
   - Set up TURN server
   - Enable error tracking

2. Build Process
   - Run production build
   - Verify bundle size
   - Check for warnings
   - Test production build

3. Performance Checklist
   - Enable compression
   - Configure caching
   - Optimize assets
   - Monitor performance

## Troubleshooting

### Common Issues

1. Video Issues
   ```
   Error: Permission denied
   ```
   - Check camera permissions
   - Verify device availability
   - Clear site settings

2. Connection Issues
   ```
   WebSocket connection failed
   ```
   - Check server URL
   - Verify network connection
   - Check browser console

3. Build Issues
   - Clear node_modules
   - Update dependencies
   - Check for conflicts

## Contributing

1. Follow code style guidelines
2. Write tests for new features
3. Update documentation
4. Create detailed PRs
