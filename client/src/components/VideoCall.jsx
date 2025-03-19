import React, { useEffect, useRef, useState } from "react";
import { socketService } from "../services/socketService";
import { videoService } from "../services/videoService";
import "./VideoCall.css";

const VideoCall = () => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerRef = useRef();

  useEffect(() => {
    initializeCall();
    return () => cleanup();
  }, []);

  const initializeCall = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const stream = await videoService.initializeStream();
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const peer = await videoService.createPeer(true);
      setupPeerEvents(peer);
      peerRef.current = peer;

    } catch (err) {
      setError("Failed to initialize video call: " + err.message);
      setIsConnecting(false);
    }
  };

  const setupPeerEvents = (peer) => {
    peer.on("signal", data => {
      socketService.socket.emit("videoSignal", { signal: data });
    });

    peer.on("stream", stream => {
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      setIsConnected(true);
      setIsConnecting(false);
    });

    peer.on("error", err => {
      console.error("Peer connection error:", err);
      setError("Connection error: " + err.message);
      handleReconnect();
    });

    peer.on("close", () => {
      setIsConnected(false);
      handleReconnect();
    });

    socketService.socket.on("videoSignal", async ({ signal }) => {
      try {
        await peer.signal(signal);
      } catch (err) {
        console.error("Signal error:", err);
        setError("Signaling error: " + err.message);
      }
    });
  };

  const handleReconnect = async () => {
    if (!isConnecting) {
      setIsConnecting(true);
      try {
        await cleanup();
        await initializeCall();
      } catch (err) {
        setError("Reconnection failed: " + err.message);
        setIsConnecting(false);
      }
    }
  };

  const cleanup = async () => {
    await videoService.stopStream();
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
  };

  const toggleVideo = async () => {
    try {
      await videoService.toggleVideo(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    } catch (err) {
      setError("Failed to toggle video: " + err.message);
    }
  };

  const toggleAudio = async () => {
    try {
      await videoService.toggleAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    } catch (err) {
      setError("Failed to toggle audio: " + err.message);
    }
  };

  return (
    <div className="video-call-container">
      <div className="video-grid">
        <div className="video-wrapper local">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={!videoEnabled ? 'disabled' : ''}
          />
          <div className="video-overlay">
            <span>You</span>
          </div>
        </div>
        
        <div className="video-wrapper remote">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={!remoteStream ? 'disabled' : ''}
          />
          <div className="video-overlay">
            <span>{isConnected ? 'Remote User' : 'Connecting...'}</span>
          </div>
        </div>
      </div>

      <div className="controls">
        <button onClick={toggleVideo} className={!videoEnabled ? 'disabled' : ''}>
          {videoEnabled ? '🎥' : '❌'} Video
        </button>
        <button onClick={toggleAudio} className={!audioEnabled ? 'disabled' : ''}>
          {audioEnabled ? '🎤' : '🔇'} Audio
        </button>
        <button onClick={cleanup} className="end-call">
          📞 End Call
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {isConnecting && <div className="connecting-message">Connecting...</div>}
    </div>
  );
};

export default VideoCall;
