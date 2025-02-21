import React, { useState } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import './TrackOverlay.scss';

interface Track {
  id: string;
  language: string;
  name?: string;
  url?: string;
}

interface TrackOverlayProps {
  type: 'subtitle' | 'audio';
  tracks: Track[];
  selectedTrackId: string | null;
  onTrackSelect: (trackId: string | null) => void;
  onClose: () => void;
  containerFocusKey: string;
}

const TrackOverlay: React.FC<TrackOverlayProps> = ({
  type,
  tracks,
  selectedTrackId,
  onTrackSelect,
  onClose,
  containerFocusKey
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 6;

  const { ref: overlayRef } = useFocusable({
    focusKey: `track-overlay`,
    trackChildren: true,
    onBackPress: () => {
      onClose();
      return true;
    }
  });

  const renderTrackItem = (track: Track, index: number) => {
    const { ref: itemRef, focused } = useFocusable({
      focusKey: `track-${index}`,
      onEnterPress: () => {
        onTrackSelect(track.id);
        onClose();
      }
    });

    return (
      <div
        key={track.id}
        ref={itemRef}
        className={`track-item ${focused ? 'focused' : ''} ${track.id === selectedTrackId ? 'selected' : ''}`}
        data-focusable-key={`track-${index}`}
      >
        <div className="track-info">
          <span className="track-language">{track.language}</span>
          {track.name && <span className="track-name">{track.name}</span>}
        </div>
        {track.id === selectedTrackId && (
          <FontAwesomeIcon icon={faCheck} className="track-selected-icon" />
        )}
      </div>
    );
  };

  // Add "Off" option for subtitles
  const allTracks = type === 'subtitle' 
    ? [{ id: 'off', language: 'Off', name: 'No subtitles' }, ...tracks]
    : tracks;

  const totalPages = Math.ceil(allTracks.length / itemsPerPage);
  const currentTracks = allTracks.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  const { ref: prevRef, focused: prevFocused } = useFocusable({
    focusKey: 'track-prev',
    onEnterPress: () => {
      if (currentPage > 0) {
        setCurrentPage(prev => prev - 1);
      }
    }
  });

  const { ref: nextRef, focused: nextFocused } = useFocusable({
    focusKey: 'track-next',
    onEnterPress: () => {
      if (currentPage < totalPages - 1) {
        setCurrentPage(prev => prev + 1);
      }
    }
  });

  return (
    <div 
      ref={overlayRef}
      className="track-overlay"
      data-focusable-key={containerFocusKey}
    >
      <div className="track-content">
        <h2>{type === 'subtitle' ? 'Subtitles' : 'Audio'}</h2>
        <div className="track-list">
          {currentTracks.map((track, index) => renderTrackItem(track, index))}
        </div>
        {totalPages > 1 && (
          <div className="track-pagination">
            <button
              ref={prevRef}
              className={`page-button ${prevFocused ? 'focused' : ''} ${currentPage === 0 ? 'disabled' : ''}`}
              disabled={currentPage === 0}
            >
              Previous
            </button>
            <span className="page-info">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              ref={nextRef}
              className={`page-button ${nextFocused ? 'focused' : ''} ${currentPage === totalPages - 1 ? 'disabled' : ''}`}
              disabled={currentPage === totalPages - 1}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackOverlay;