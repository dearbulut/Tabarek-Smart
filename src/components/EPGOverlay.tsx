import React, { useEffect, useState, useCallback } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { format, isAfter, isBefore } from 'date-fns';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faInfoCircle, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import xtreamService from '../services/xtream';
import './EPGOverlay.scss';

interface EPGProgram {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
}

interface EPGOverlayProps {
  channelId: string;
  current: EPGProgram;
  next?: EPGProgram;
  onClose: () => void;
  containerFocusKey: string;
}

const EPGOverlay: React.FC<EPGOverlayProps> = ({
  channelId,
  current,
  next,
  onClose,
  containerFocusKey
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<'current' | 'next' | number>('current');
  const [extendedEPG, setExtendedEPG] = useState<EPGProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const programsPerPage = 5;

  const { ref: overlayRef } = useFocusable({
    focusKey: `epg-overlay`,
    trackChildren: true,
    onBackPress: () => {
      if (showDetails) {
        setShowDetails(false);
        return true;
      }
      onClose();
      return true;
    }
  });

  const { ref: currentRef, focused: currentFocused } = useFocusable({
    focusKey: 'epg-current',
    onEnterPress: () => {
      setSelectedProgram('current');
      setShowDetails(true);
    }
  });

  const { ref: nextRef, focused: nextFocused } = useFocusable({
    focusKey: 'epg-next',
    onEnterPress: () => {
      setSelectedProgram('next');
      setShowDetails(true);
    }
  });

  const { ref: prevPageRef, focused: prevPageFocused } = useFocusable({
    focusKey: 'epg-prev-page',
    onEnterPress: () => {
      if (currentPage > 0) {
        setCurrentPage(prev => prev - 1);
      }
    }
  });

  const { ref: nextPageRef, focused: nextPageFocused } = useFocusable({
    focusKey: 'epg-next-page',
    onEnterPress: () => {
      if ((currentPage + 1) * programsPerPage < extendedEPG.length) {
        setCurrentPage(prev => prev + 1);
      }
    }
  });

  const loadExtendedEPG = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const epgData = await xtreamService.getEPG(channelId, 24); // Get 24 hours of EPG
      setExtendedEPG(epgData.map(program => ({
        title: program.title,
        description: program.description,
        startTime: program.start,
        endTime: program.end
      })));
    } catch (err) {
      setError('Failed to load EPG data');
      console.error('EPG loading error:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadExtendedEPG();
    const interval = setInterval(loadExtendedEPG, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [loadExtendedEPG]);

  const formatTime = (timeString: string) => {
    return format(new Date(timeString), 'HH:mm');
  };

  const calculateProgress = (program: EPGProgram) => {
    const now = new Date().getTime();
    const start = new Date(program.startTime).getTime();
    const end = new Date(program.endTime).getTime();
    
    if (isBefore(now, start)) return 0;
    if (isAfter(now, end)) return 100;
    
    const progress = ((now - start) / (end - start)) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const renderProgram = (program: EPGProgram, type: 'current' | 'next' | number, ref: React.RefObject<HTMLDivElement>, focused: boolean) => (
    <div
      ref={ref}
      className={`epg-program ${focused ? 'focused' : ''} ${type === 'current' ? 'current' : ''}`}
      data-focusable-key={`epg-${type}`}
    >
      <div className="epg-time">
        <FontAwesomeIcon icon={faClock} />
        <span>{formatTime(program.startTime)} - {formatTime(program.endTime)}</span>
      </div>
      <div className="epg-title">{program.title}</div>
      {(type === 'current' || (typeof type === 'number' && isBefore(new Date(program.startTime), new Date()) && isAfter(new Date(program.endTime), new Date()))) && (
        <div className="epg-progress">
          <div className="epg-progress-bar" style={{ width: `${calculateProgress(program)}%` }} />
        </div>
      )}
      <FontAwesomeIcon icon={faInfoCircle} className="epg-info-icon" />
    </div>
  );

  const renderDetails = () => {
    let program: EPGProgram | undefined;
    if (selectedProgram === 'current') {
      program = current;
    } else if (selectedProgram === 'next') {
      program = next;
    } else {
      program = extendedEPG[selectedProgram];
    }

    if (!program) return null;

    return (
      <div className="epg-details">
        <h2>{program.title}</h2>
        <div className="epg-time-details">
          <FontAwesomeIcon icon={faClock} />
          <span>{formatTime(program.startTime)} - {formatTime(program.endTime)}</span>
        </div>
        <p className="epg-description">{program.description}</p>
      </div>
    );
  };

  const renderPagination = () => {
    if (extendedEPG.length <= programsPerPage) return null;

    return (
      <div className="epg-pagination">
        <button
          ref={prevPageRef}
          className={`page-button ${prevPageFocused ? 'focused' : ''} ${currentPage === 0 ? 'disabled' : ''}`}
          data-focusable-key="epg-prev-page"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <span className="page-info">{currentPage + 1} / {Math.ceil(extendedEPG.length / programsPerPage)}</span>
        <button
          ref={nextPageRef}
          className={`page-button ${nextPageFocused ? 'focused' : ''} ${(currentPage + 1) * programsPerPage >= extendedEPG.length ? 'disabled' : ''}`}
          data-focusable-key="epg-next-page"
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
    );
  };

  return (
    <div 
      ref={overlayRef}
      className={`epg-overlay ${showDetails ? 'show-details' : ''}`}
      data-focusable-key={containerFocusKey}
    >
      <div className="epg-content">
        {loading && <div className="epg-loading">Loading EPG data...</div>}
        {error && <div className="epg-error">{error}</div>}
        {!loading && !error && !showDetails && (
          <>
            <h2>TV Guide</h2>
            <div className="epg-programs">
              {renderProgram(current, 'current', currentRef, currentFocused)}
              {next && renderProgram(next, 'next', nextRef, nextFocused)}
              {extendedEPG
                .slice(currentPage * programsPerPage, (currentPage + 1) * programsPerPage)
                .map((program, index) => {
                  const { ref, focused } = useFocusable({
                    focusKey: `epg-extended-${index}`,
                    onEnterPress: () => {
                      setSelectedProgram(currentPage * programsPerPage + index);
                      setShowDetails(true);
                    }
                  });
                  return renderProgram(program, currentPage * programsPerPage + index, ref, focused);
                })}
            </div>
            {renderPagination()}
          </>
        )}
        {!loading && !error && showDetails && renderDetails()}
      </div>
    </div>
  );
};

export default EPGOverlay;