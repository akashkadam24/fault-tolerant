import React, { useEffect, useState } from 'react';
import { useVideoContext } from '../context/VideoContext';
import { VIDEO_STATUS } from '../config/constants';
import './VideoCall.css';

const VideoSection = () => {
  const {
    videoEnabled,
    audioEnabled,
    remoteVideoEnabled,
    isVideoConnecting,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    toggleVideo,
    toggleAudio,
    videoStatus,
    connectionQuality,
    retryConnection
  } = useVideoContext();

  const [showStats, setShowStats] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleVideoError = () => {
      if (videoStatus === VIDEO_STATUS.ERROR || videoStatus === VIDEO_STATUS.FAILED) {
        setError('Video connection failed. Please try again.');
      } else {
        setError(null);
      }
    };

    handleVideoError();
  }, [videoStatus]);

  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (videoElement && remoteStream) {
      videoElement.play().catch(error => {
        console.error('Error playing remote video:', error);
        setError('Failed to play remote video. Please check your browser settings.');
      });
    }
  }, [remoteStream]);

  const getConnectionQualityLabel = () => {
    switch (connectionQuality) {
      case 'poor':
        return 'Poor Connection';
      case 'fair':
        return 'Fair Connection';
      case 'good':
        return 'Good Connection';
      default:
        return '';
    }
  };

  const getVideoWrapperClass = (isLocal) => {
    const classes = ['video-wrapper'];
    if (isLocal) classes.push('local');
    else classes.push('remote');
    if (isVideoConnecting) classes.push('loading');
    return classes.join(' ');
  };

  const handleRetryConnection = () => {
    setError(null);
    retryConnection();
  };

  return (
    <div className="video-section">
      <div className="video-header">
        <h3 className="section-title">Video Call</h3>
        {videoStatus === VIDEO_STATUS.CONNECTED && (
          <div className="connection-quality">
            <span className={`quality-indicator ${connectionQuality}`} />
            {getConnectionQualityLabel()}
          </div>
        )}
        {error && (
          <div className="error-message">
            {error}
            <button onClick={handleRetryConnection} className="retry-button">
              Retry Connection
            </button>
          </div>
        )}
      </div>
      <div className="video-grid">
        <div className={getVideoWrapperClass(true)}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={!videoEnabled ? 'hidden' : ''}
          />
          <div className="video-overlay">
            <div className="video-label">
              {videoEnabled ? 'Your Video' : 'Video Off'}
              {audioEnabled && <span className="audio-indicator">🎤</span>}
            </div>
          </div>
        </div>
        <div className={getVideoWrapperClass(false)}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={!remoteStream || !remoteVideoEnabled ? 'hidden' : ''}
          />
          <div className="video-overlay">
            <div className="video-label">
              {remoteVideoEnabled ? 'Remote Video' : 'Peer Video Off'}
              {remoteStream && <span className="connection-indicator" />}
            </div>
          </div>
        </div>
      </div>
      <div className="video-controls">
        <button
          onClick={toggleVideo}
          className={`control-button ${videoEnabled ? 'active' : ''}`}
          disabled={isVideoConnecting}
          title={isVideoConnecting ? 'Connecting...' : 'Toggle Video'}
        >
          <span className="control-icon">{videoEnabled ? '🎥' : '📵'}</span>
          <span className="control-text">
            {isVideoConnecting ? 'Connecting...' : 'Video'}
          </span>
        </button>
        <button
          onClick={toggleAudio}
          className={`control-button ${audioEnabled ? 'active' : ''}`}
          disabled={!videoEnabled}
          title="Toggle Audio"
        >
          <span className="control-icon">{audioEnabled ? '🎤' : '🔇'}</span>
          <span className="control-text">Audio</span>
        </button>
        <button
          onClick={() => setShowStats(!showStats)}
          className={`control-button ${showStats ? 'active' : ''}`}
          title="Connection Stats"
        >
          <span className="control-icon">📊</span>
          <span className="control-text">Stats</span>
        </button>
      </div>
      {showStats && (
        <div className="connection-stats">
          <div>Connection Quality: {connectionQuality}</div>
          <div>Video Status: {videoStatus}</div>
          <div>Remote Video: {remoteVideoEnabled ? 'Enabled' : 'Disabled'}</div>
          <div>Local Video: {videoEnabled ? 'Enabled' : 'Disabled'}</div>
          <div>Audio: {audioEnabled ? 'Enabled' : 'Disabled'}</div>
        </div>
      )}
    </div>
  );
};

export default VideoSection;