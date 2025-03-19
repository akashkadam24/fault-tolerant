import Peer from "simple-peer";
import { socketService } from "./socketService";
import { 
  SOCKET_EVENTS, 
  VIDEO_CONFIG,
  VIDEO_STATUS 
} from '../config/constants';

class VideoService {
  constructor() {
    this.peer = null;
    this.stream = null;
    this.isInitiator = false;
    this.remoteVideoEnabled = false;
    this.remoteVideoStateListeners = new Set();
    this.connectionRetryCount = 0;
    this.pendingCandidates = new Set();
    this.connectionState = VIDEO_STATUS.DISCONNECTED;
    this.setupVideoSignaling();
  }

  onRemoteVideoStateChange(callback) {
    this.remoteVideoStateListeners.add(callback);
  }

  offRemoteVideoStateChange(callback) {
    this.remoteVideoStateListeners.delete(callback);
  }

  notifyRemoteVideoStateChange(enabled) {
    this.remoteVideoEnabled = enabled;
    this.remoteVideoStateListeners.forEach(listener => {
      listener({ 
        enabled, 
        userId: socketService.socket.id,
        connectionState: this.connectionState
      });
    });
  }

  setupVideoSignaling() {
    socketService.socket.on(SOCKET_EVENTS.VIDEO_SIGNAL, async ({ signal, videoEnabled, type, retry = 0 }) => {
      try {
        if (videoEnabled !== this.remoteVideoEnabled) {
          this.notifyRemoteVideoStateChange(videoEnabled);
        }

        // Handle incoming signal based on type
        switch (type) {
          case 'offer':
            if (!this.peer || this.peer.destroyed) {
              await this.createPeer(false);
            }
            this.peer.signal(signal);
            break;

          case 'answer':
            if (this.peer && !this.peer.destroyed) {
              this.peer.signal(signal);
            }
            break;

          case 'candidate':
            if (this.peer && !this.peer.destroyed) {
              this.peer.signal(signal);
            } else {
              // Store candidate if peer not ready
              this.pendingCandidates.add(signal);
            }
            break;
        }

        // Acknowledge signal receipt
        socketService.socket.emit(`${SOCKET_EVENTS.VIDEO_SIGNAL}_ack`, {
          type,
          retry
        });

      } catch (error) {
        console.error('Error handling video signal:', error);
        this.handlePeerError(error);
      }
    });

    // Handle connection state changes
    socketService.socket.on(SOCKET_EVENTS.VIDEO_STATE, ({ videoEnabled, connectionState }) => {
      this.connectionState = connectionState;
      this.notifyRemoteVideoStateChange(videoEnabled);
    });
  }

  async initializeStream() {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      // Try HD quality first
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONFIG.constraints);
      } catch (hdError) {
        console.warn('Failed to get HD stream, falling back to basic video:', hdError);
        // Fallback to basic video constraints
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      if (!this.stream) {
        throw new Error('Failed to initialize media stream');
      }

      // Add stream quality monitoring
      this.stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => this.handleTrackEnded(track));
        track.addEventListener('mute', () => this.handleTrackMuted(track));
        track.addEventListener('unmute', () => this.handleTrackUnmuted(track));
      });

      return this.stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      // Provide more specific error messages
      if (error.name === 'NotReadableError') {
        throw new Error('Could not access camera/microphone. Please ensure no other application is using them and try again.');
      } else if (error.name === 'NotAllowedError') {
        throw new Error('Camera/microphone access denied. Please grant permission and try again.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera/microphone found. Please connect a device and try again.');
      }
      throw error;
    }
  }

  async createPeer(isInitiator) {
    try {
      if (this.peer) {
        this.peer.destroy();
      }

      if (!this.stream) {
        await this.initializeStream();
      }

      this.isInitiator = isInitiator;
      this.connectionState = VIDEO_STATUS.CONNECTING;
      
      const peerConfig = {
        initiator: isInitiator,
        stream: this.stream,
        trickle: false, // Disable trickle ICE to avoid process.nextTick issues
        config: {
          iceServers: VIDEO_CONFIG.iceServers,
          iceTransportPolicy: VIDEO_CONFIG.iceTransportPolicy,
          iceCandidatePoolSize: 10
        },
        sdpTransform: (sdp) => this.optimizeSdp(sdp),
        offerOptions: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        },
        // Polyfill timers for browser environment
        wrtc: {
          RTCPeerConnection: window.RTCPeerConnection,
          RTCSessionDescription: window.RTCSessionDescription,
          RTCIceCandidate: window.RTCIceCandidate,
          // Polyfill process.nextTick with setTimeout
          nextTick: (fn) => setTimeout(fn, 0)
        }
      };

      this.peer = new Peer(peerConfig);
      this.setupPeerEventHandlers();

      // Monitor connection quality
      this.startConnectionMonitoring();

      return this.peer;
    } catch (error) {
      console.error('Error creating peer:', error);
      throw error;
    }
  }

  setupPeerEventHandlers() {
    this.peer.on('signal', signal => {
      if (!this.peer.destroyed) {
        // Broadcast the signal to all peers - the server will handle routing
        const signalData = {
          signal,
          from: socketService.socket.id,
          videoEnabled: true,
          type: signal.type || 'candidate',
          timestamp: Date.now()
        };

        // Add reliability with acknowledgment
        socketService.socket.emit(SOCKET_EVENTS.VIDEO_SIGNAL, signalData, (ack) => {
          if (!ack && this.connectionRetryCount < VIDEO_CONFIG.reconnectionAttempts) {
            setTimeout(() => {
              if (!this.peer.destroyed) {
                socketService.socket.emit(SOCKET_EVENTS.VIDEO_SIGNAL, {
                  ...signalData,
                  retry: true
                });
              }
            }, VIDEO_CONFIG.reconnectionDelay * Math.pow(2, this.connectionRetryCount));
            this.connectionRetryCount++;
          }
        });
      }
    });

    this.peer.on('connect', () => {
      console.log('Peer connection established');
      this.connectionState = VIDEO_STATUS.CONNECTED;
      this.connectionRetryCount = 0;
      this.notifyRemoteVideoStateChange(true);

      // Process any pending ICE candidates
      this.pendingCandidates.forEach(candidate => {
        this.peer.signal(candidate);
      });
      this.pendingCandidates.clear();
    });

    this.peer.on('stream', (stream) => {
      this.handleRemoteStream(stream);
    });

    this.peer.on('track', (track, stream) => {
      this.handleNewTrack(track, stream);
    });

    this.peer.on('close', () => {
      this.connectionState = VIDEO_STATUS.DISCONNECTED;
      this.handlePeerError(new Error('Peer connection closed'));
    });

    this.peer.on('error', (error) => {
      this.handlePeerError(error);
    });

    // Monitor connection state
    this.peer.on('iceStateChange', (state) => {
      if (state === 'disconnected' || state === 'failed') {
        this.handlePeerError(new Error(`ICE connection ${state}`));
      }
    });
  }

  optimizeSdp(sdp) {
    // Modify SDP for better performance
    return sdp
      .replace(/a=fmtp:\d+ apt=\d+\r\n/g, '') // Remove redundant codecs
      .replace(/a=rtcp-fb:*\r\n/g, '') // Remove unnecessary feedback
      .replace(/a=extmap:*\r\n/g, ''); // Remove unnecessary extensions
  }

  handleRemoteStream(remoteStream) {
    this.connectionState = VIDEO_STATUS.CONNECTED;
    this.notifyRemoteVideoStateChange(true);
    
    // Monitor remote stream quality
    remoteStream.getTracks().forEach(track => {
      this.handleNewTrack(track);
    });
  }

  handleNewTrack(track) {
    track.addEventListener('ended', () => this.handleTrackEnded(track));
    track.addEventListener('mute', () => this.handleTrackMuted(track));
    track.addEventListener('unmute', () => this.handleTrackUnmuted(track));
  }

  handleTrackEnded(track) {
    console.log(`Track ${track.kind} ended`);
    if (track.kind === 'video' && this.connectionState === VIDEO_STATUS.CONNECTED) {
      this.handlePeerError(new Error('Video track ended unexpectedly'));
    }
  }

  handleTrackMuted(track) {
    console.log(`Track ${track.kind} muted`);
    if (track.kind === 'video') {
      this.notifyRemoteVideoStateChange(false);
    }
  }

  handleTrackUnmuted(track) {
    console.log(`Track ${track.kind} unmuted`);
    if (track.kind === 'video') {
      this.notifyRemoteVideoStateChange(true);
    }
  }

  handlePeerError(error) {
    console.error('Peer error:', error);
    
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    if (this.connectionRetryCount < VIDEO_CONFIG.reconnectionAttempts) {
      this.connectionState = VIDEO_STATUS.RECONNECTING;
      this.connectionRetryCount++;
      
      // Attempt to recreate peer after delay
      setTimeout(async () => {
        try {
          if (this.isInitiator) {
            await this.createPeer(true);
          }
        } catch (retryError) {
          console.error('Error during reconnection:', retryError);
        }
      }, VIDEO_CONFIG.reconnectionDelay * Math.pow(2, this.connectionRetryCount - 1));
    } else {
      this.connectionState = VIDEO_STATUS.FAILED;
      this.notifyRemoteVideoStateChange(false);
    }
  }

  async stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connectionState = VIDEO_STATUS.DISCONNECTED;
    this.notifyRemoteVideoStateChange(false);
    socketService.socket.emit(SOCKET_EVENTS.VIDEO_SIGNAL, {
      to: socketService.socket.id,
      videoEnabled: false
    });
  }

  startConnectionMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      if (this.peer && !this.peer.destroyed) {
        const stats = await this.getConnectionStats();
        
        // Check for poor connection quality
        if (stats.packetLoss > VIDEO_CONFIG.maxPacketLoss ||
            stats.videoBitrate < VIDEO_CONFIG.minVideoBitrate) {
          this.handlePoorConnection(stats);
        }
      }
    }, VIDEO_CONFIG.statsInterval);
  }

  handlePoorConnection(stats) {
    console.warn('Poor connection detected:', stats);
    
    // Notify UI of connection issues
    this.connectionState = VIDEO_STATUS.UNSTABLE;
    this.notifyRemoteVideoStateChange(this.remoteVideoEnabled);

    // Attempt to improve connection
    if (this.peer && !this.peer.destroyed) {
      // Reduce video quality if needed
      if (stats.videoBitrate < VIDEO_CONFIG.minVideoBitrate) {
        this.adjustVideoQuality('lower');
      }
    }
  }

  async getConnectionStats() {
    if (!this.peer || !this.peer._pc) {
      return { packetLoss: 0, videoBitrate: 0, audioBitrate: 0 };
    }

    try {
      const stats = await this.peer._pc.getStats();
      let totalPacketsLost = 0;
      let totalPackets = 0;
      let videoBitrate = 0;
      let audioBitrate = 0;
      let lastBytesReceived = this.lastBytesReceived || {};
      let lastTimestamp = this.lastStatsTimestamp || Date.now();
      let currentTimestamp = Date.now();

      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          totalPacketsLost += report.packetsLost || 0;
          totalPackets += report.packetsReceived || 0;
          
          const bytesReceived = report.bytesReceived;
          const timeDiff = (currentTimestamp - lastTimestamp) / 1000; // Convert to seconds
          
          if (report.kind === 'video') {
            videoBitrate = timeDiff > 0 ?
              ((bytesReceived - (lastBytesReceived.video || 0)) * 8) / timeDiff : 0;
            lastBytesReceived.video = bytesReceived;
          } else if (report.kind === 'audio') {
            audioBitrate = timeDiff > 0 ?
              ((bytesReceived - (lastBytesReceived.audio || 0)) * 8) / timeDiff : 0;
            lastBytesReceived.audio = bytesReceived;
          }
        }
      });

      this.lastBytesReceived = lastBytesReceived;
      this.lastStatsTimestamp = currentTimestamp;

      return {
        packetLoss: totalPackets > 0 ? (totalPacketsLost / totalPackets) * 100 : 0,
        videoBitrate,
        audioBitrate,
        totalPackets,
        totalPacketsLost
      };
    } catch (error) {
      console.error('Error getting connection stats:', error);
      return { packetLoss: 0, videoBitrate: 0, audioBitrate: 0 };
    }
  }

  adjustVideoQuality(action) {
    if (!this.stream) return;

    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const constraints = {
      width: { ideal: action === 'lower' ? 640 : 1280 },
      height: { ideal: action === 'lower' ? 480 : 720 },
      frameRate: { ideal: action === 'lower' ? 15 : 30 }
    };

    videoTrack.applyConstraints(constraints)
      .catch(error => console.error('Error adjusting video quality:', error));
  }

  async toggleVideo(enabled) {
    if (this.stream) {
      this.stream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async toggleAudio(enabled) {
    if (this.stream) {
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  isRemoteVideoEnabled() {
    return this.remoteVideoEnabled;
  }

  getConnectionState() {
    return this.connectionState;
  }
}

export const videoService = new VideoService();