import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { videoService } from '../services/videoService';
import { UI_CONSTANTS, VIDEO_STATUS } from '../config/constants';

const VideoContext = createContext();

export const useVideoContext = () => {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error('useVideoContext must be used within a VideoProvider');
  }
  return context;
};

export const VideoProvider = ({ children }) => {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoConnecting, setIsVideoConnecting] = useState(false);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(false);
  const [videoStatus, setVideoStatus] = useState(VIDEO_STATUS.DISCONNECTED);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Monitor connection quality
  useEffect(() => {
    let qualityCheckInterval;
    
    if (remoteStream) {
      qualityCheckInterval = setInterval(async () => {
        try {
          const stats = await videoService.getConnectionStats();
          if (stats.packetLoss > 5) {
            setConnectionQuality('poor');
          } else if (stats.packetLoss > 2) {
            setConnectionQuality('fair');
          } else {
            setConnectionQuality('good');
          }
        } catch (error) {
          console.error('Error checking connection quality:', error);
        }
      }, UI_CONSTANTS.QUALITY_CHECK_INTERVAL);
    }

    return () => {
      if (qualityCheckInterval) {
        clearInterval(qualityCheckInterval);
      }
    };
  }, [remoteStream]);

  // Handle remote video state changes
  useEffect(() => {
    const handleRemoteVideoState = ({ enabled }) => {
      setRemoteVideoEnabled(enabled);
      setVideoStatus(enabled ? VIDEO_STATUS.CONNECTED : VIDEO_STATUS.REMOTE_DISABLED);
    };

    videoService.onRemoteVideoStateChange(handleRemoteVideoState);
    return () => videoService.offRemoteVideoStateChange(handleRemoteVideoState);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupVideoConnection();
    };
  }, []);

  const cleanupVideoConnection = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setLocalStream(null);
    setRemoteStream(null);
    setVideoEnabled(false);
    setIsVideoConnecting(false);
    setVideoStatus(VIDEO_STATUS.DISCONNECTED);
    setReconnectAttempts(0);
  }, [localStream]);

  const handleConnectionError = useCallback(async (error) => {
    console.error('Video connection error:', error);
    
    // Don't retry for media access errors
    if (error.message.includes('Could not access camera/microphone') ||
        error.message.includes('NotReadableError') ||
        error.message.includes('NotAllowedError') ||
        error.message.includes('NotFoundError')) {
      setVideoStatus(VIDEO_STATUS.FAILED);
      await cleanupVideoConnection();
      return;
    }
    
    if (reconnectAttempts >= UI_CONSTANTS.MAX_RECONNECT_ATTEMPTS) {
      setVideoStatus(VIDEO_STATUS.FAILED);
      await cleanupVideoConnection();
      return;
    }

    setVideoStatus(VIDEO_STATUS.RECONNECTING);
    setIsVideoConnecting(true);
    setReconnectAttempts(prev => prev + 1);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Only attempt reconnection for network/peer errors
    reconnectTimeoutRef.current = setTimeout(async () => {
      try {
        if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
        }
        
        // Check if we already have a stream before trying to initialize again
        if (!localStream) {
          await initializeVideoConnection();
        } else {
          const peer = await videoService.createPeer(true, null);
          peerRef.current = peer;
          setupPeerEventHandlers(peer);
        }
      } catch (reconnectError) {
        console.error('Reconnection failed:', reconnectError);
        // Prevent recursive retries
        setVideoStatus(VIDEO_STATUS.FAILED);
        await cleanupVideoConnection();
      }
    }, UI_CONSTANTS.RECONNECT_TIMEOUT * Math.pow(2, reconnectAttempts));
  }, [reconnectAttempts, cleanupVideoConnection]);

  const setupPeerEventHandlers = useCallback((peer) => {
    peer.on('stream', (stream) => {
      if (stream.getTracks().length > 0) {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(error => {
            console.error('Error playing remote video:', error);
            setVideoStatus(VIDEO_STATUS.ERROR);
          });
        }
        setVideoStatus(VIDEO_STATUS.CONNECTED);
        setIsVideoConnecting(false);
        setReconnectAttempts(0);
      }
    });

    peer.on('close', () => {
      setVideoStatus(VIDEO_STATUS.DISCONNECTED);
      handleConnectionError(new Error('Peer connection closed'));
    });

    peer.on('error', (error) => {
      setVideoStatus(VIDEO_STATUS.ERROR);
      handleConnectionError(error);
    });

    peer.on('iceStateChange', (state) => {
      switch (state) {
        case 'connected':
          setVideoStatus(VIDEO_STATUS.CONNECTED);
          setIsVideoConnecting(false);
          break;
        case 'disconnected':
        case 'failed':
          handleConnectionError(new Error(`ICE connection ${state}`));
          break;
        default:
          console.log('ICE state:', state);
      }
    });

    // Handle remote video state changes
    videoService.onRemoteVideoStateChange(({ enabled, connectionState }) => {
      setRemoteVideoEnabled(enabled);
      if (connectionState) {
        setVideoStatus(connectionState);
      }
    });
  }, [handleConnectionError]);

  const initializeVideoConnection = async (remoteUserId = null) => {
    try {
      setVideoStatus(VIDEO_STATUS.CONNECTING);
      setIsVideoConnecting(true);

      const stream = await videoService.initializeStream();
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const isInitiator = !remoteUserId;
      const peer = await videoService.createPeer(isInitiator, remoteUserId);
      peerRef.current = peer;
      setupPeerEventHandlers(peer);
      return peer;
    } catch (error) {
      console.error('Error in initializeVideoConnection:', error);
      setVideoStatus(VIDEO_STATUS.ERROR);
      handleConnectionError(error);
      return null;
    }
  };

  const toggleVideo = async () => {
    try {
      if (!videoEnabled) {
        setIsVideoConnecting(true);
        setVideoStatus(VIDEO_STATUS.CONNECTING);
        await initializeVideoConnection();
        setVideoEnabled(true);
      } else {
        cleanupVideoConnection();
      }
    } catch (error) {
      console.error('Error toggling video:', error);
      setVideoStatus(VIDEO_STATUS.ERROR);
      setIsVideoConnecting(false);
    }
  };

  const toggleAudio = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
      videoService.updateAudioState(!audioEnabled);
    }
  }, [localStream, audioEnabled]);

  const retryConnection = useCallback(async () => {
    if (videoStatus === VIDEO_STATUS.FAILED || videoStatus === VIDEO_STATUS.ERROR) {
      setReconnectAttempts(0);
      await toggleVideo();
    }
  }, [videoStatus]);

  const value = {
    videoEnabled,
    audioEnabled,
    localStream,
    remoteStream,
    isVideoConnecting,
    remoteVideoEnabled,
    videoStatus,
    connectionQuality,
    localVideoRef,
    remoteVideoRef,
    toggleVideo,
    toggleAudio,
    retryConnection
  };

  return <VideoContext.Provider value={value}>{children}</VideoContext.Provider>;
};