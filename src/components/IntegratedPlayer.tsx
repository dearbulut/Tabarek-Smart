import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TVPlayer } from 'custom-tv-player';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClosedCaptioning, faVolumeUp, faInfo } from '@fortawesome/free-solid-svg-icons';
import xtreamService from '../services/xtream';
import EPGOverlay from './EPGOverlay';
import TrackOverlay from './TrackOverlay';

interface IntegratedPlayerProps {
  contentType: 'live' | 'movie' | 'series';
  contentId: string;
  onError?: (error: Error) => void;
  onBack?: () => void;
}

interface StreamInfo {
  url: string;
  title?: string;
  subtitleTracks?: Array<{ id: string; language: string; url: string }>;
  audioTracks?: Array<{ id: string; language: string; name: string }>;
  epgData?: {
    current: { title: string; description: string; startTime: string; endTime: string };
    next?: { title: string; description: string; startTime: string; endTime: string };
  };
}

export const IntegratedPlayer: React.FC<IntegratedPlayerProps> = ({
  contentType,
  contentId,
  onError,
  onBack
}) => {
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showAudioTracks, setShowAudioTracks] = useState(false);
  const [showEPG, setShowEPG] = useState(false);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  // Refs for cleanup and abort control
  const abortController = useRef<AbortController | null>(null);
  const epgUpdateInterval = useRef<number | null>(null);

  const { ref: containerRef, focusKey: containerFocusKey } = useFocusable({
    onBackPress: () => {
      if (showSubtitles || showAudioTracks || showEPG) {
        setShowSubtitles(false);
        setShowAudioTracks(false);
        setShowEPG(false);
        return true;
      }
      onBack?.();
      return true;
    }
  });

  const loadContent = useCallback(async () => {
    // Cancel any ongoing requests
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      // Get stream URL based on content type
      let url: string;
      switch (contentType) {
        case 'live':
          url = xtreamService.getLiveStreamUrl(contentId);
          break;
        case 'movie':
          url = xtreamService.getMovieStreamUrl(contentId);
          break;
        case 'series':
          url = xtreamService.getSeriesStreamUrl(contentId);
          break;
      }

      const streamData: StreamInfo = { url };

      // Load additional information based on content type
      if (contentType === 'live') {
        const epg = await xtreamService.getEPG(contentId);
        if (epg && epg.length > 0) {
          const current = epg[0];
          streamData.epgData = {
            current: {
              title: current.title,
              description: current.description,
              startTime: current.start,
              endTime: current.end
            },
            next: epg[1] ? {
              title: epg[1].title,
              description: epg[1].description,
              startTime: epg[1].start,
              endTime: epg[1].end
            } : undefined
          };

          // Set up EPG auto-update for live content
          epgUpdateInterval.current = window.setInterval(async () => {
            try {
              const updatedEpg = await xtreamService.getEPG(contentId);
              if (updatedEpg && updatedEpg.length > 0) {
                setStreamInfo(prev => prev ? {
                  ...prev,
                  epgData: {
                    current: {
                      title: updatedEpg[0].title,
                      description: updatedEpg[0].description,
                      startTime: updatedEpg[0].start,
                      endTime: updatedEpg[0].end
                    },
                    next: updatedEpg[1] ? {
                      title: updatedEpg[1].title,
                      description: updatedEpg[1].description,
                      startTime: updatedEpg[1].start,
                      endTime: updatedEpg[1].end
                    } : undefined
                  }
                } : null);
              }
            } catch (error) {
              console.error('Failed to update EPG:', error);
            }
          }, 60000); // Update every minute
        }
      } else if (contentType === 'movie') {
        const movieInfo = await xtreamService.getMovieInfo(contentId);
        streamData.title = movieInfo.movie_data.name;
        streamData.subtitleTracks = movieInfo.subtitle_tracks;
        streamData.audioTracks = movieInfo.audio_tracks;
        
        // Set initial audio track if available
        if (movieInfo.audio_tracks?.[0]) {
          setSelectedAudioId(movieInfo.audio_tracks[0].id);
        }
      }

      setStreamInfo(streamData);
    } catch (err) {
      // Only set error if not aborted
      if (err instanceof Error && err.name !== 'AbortError') {
        const error = err instanceof Error ? err : new Error('Failed to load content');
        setError(error);
        onError?.(error);
      }
    } finally {
      setLoading(false);
    }
  }, [contentType, contentId, onError]);

  useEffect(() => {
    loadContent();

    // Cleanup function
    return () => {
      // Cancel any ongoing requests
      if (abortController.current) {
        abortController.current.abort();
      }
      // Clear EPG update interval
      if (epgUpdateInterval.current) {
        clearInterval(epgUpdateInterval.current);
      }
    };
  }, [loadContent]);

  const handleSubtitleChange = useCallback((trackId: string | null) => {
    setSelectedSubtitleId(trackId);
    if (trackId === 'off') {
      setSelectedSubtitleId(null);
    }
  }, []);

  const handleAudioTrackChange = useCallback((trackId: string) => {
    setSelectedAudioId(trackId);
  }, []);

  const customButtons = [
    {
      action: 'subtitle',
      label: 'Subtitles',
      icon: <FontAwesomeIcon icon={faClosedCaptioning} />,
      onPress: () => setShowSubtitles(true),
      focusKey: 'subtitle-button',
      disabled: !streamInfo?.subtitleTracks?.length
    },
    {
      action: 'audio',
      label: 'Audio',
      icon: <FontAwesomeIcon icon={faVolumeUp} />,
      onPress: () => setShowAudioTracks(true),
      focusKey: 'audio-button',
      disabled: !streamInfo?.audioTracks?.length
    }
  ];

  if (contentType === 'live') {
    customButtons.push({
      action: 'epg',
      label: 'Guide',
      icon: <FontAwesomeIcon icon={faInfo} />,
      onPress: () => setShowEPG(true),
      focusKey: 'epg-button',
      disabled: !streamInfo?.epgData
    });
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>;
  }

  if (!streamInfo) {
    return <div className="error">No stream information available</div>;
  }

  return (
    <div ref={containerRef} className="player-container" data-focusable-key={containerFocusKey}>
      <TVPlayer
        url={streamInfo.url}
        title={streamInfo.title}
        customButtons={customButtons}
        subtitleTracks={streamInfo.subtitleTracks}
        audioTracks={streamInfo.audioTracks}
        selectedSubtitleId={selectedSubtitleId}
        selectedAudioId={selectedAudioId}
        onSubtitleChange={handleSubtitleChange}
        onAudioTrackChange={handleAudioTrackChange}
        onOverlayClose={() => {
          setShowSubtitles(false);
          setShowAudioTracks(false);
          setShowEPG(false);
        }}
      />
      {showEPG && streamInfo.epgData && (
        <EPGOverlay
          channelId={contentId}
          current={streamInfo.epgData.current}
          next={streamInfo.epgData.next}
          onClose={() => setShowEPG(false)}
          containerFocusKey={`${containerFocusKey}-epg`}
        />
      )}
      {showSubtitles && streamInfo.subtitleTracks && (
        <TrackOverlay
          type="subtitle"
          tracks={streamInfo.subtitleTracks}
          selectedTrackId={selectedSubtitleId}
          onTrackSelect={handleSubtitleChange}
          onClose={() => setShowSubtitles(false)}
          containerFocusKey={`${containerFocusKey}-subtitles`}
        />
      )}
      {showAudioTracks && streamInfo.audioTracks && (
        <TrackOverlay
          type="audio"
          tracks={streamInfo.audioTracks}
          selectedTrackId={selectedAudioId}
          onTrackSelect={handleAudioTrackChange}
          onClose={() => setShowAudioTracks(false)}
          containerFocusKey={`${containerFocusKey}-audio`}
        />
      )}
    </div>
  );
};

export default IntegratedPlayer;