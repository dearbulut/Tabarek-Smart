import React, { useState, useEffect, useCallback, memo } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { init, setFocus, getFocusedElement } from '@noriginmedia/norigin-spatial-navigation';
import { MainNavigation } from './components/navigation/MainNavigation';
import LiveTV from './pages/LiveTV/LiveTV';
import Movies from './pages/Movies/Movies';
import Series from './pages/Series/Series';
import xtreamService from './services/xtream';
import './styles/App.scss';

// Initialize spatial navigation with optimized settings
init({
    debug: false,
    visualDebug: false,
    throttle: 60, // Optimized for 60fps
    rememberLastFocusedElement: true,
    forgetLastFocusedElementId: false, // Maintain focus between page transitions
    isFocusBoundary: true, // Prevent focus from leaving the app
    streamMode: true, // Optimize for TV streaming
    // Custom selector for better TV performance
    selector: '[data-focusable="true"]',
    straightOnly: false, // Allow diagonal navigation
});

// Memoized navigation component for better performance
const MemoizedNavigation = memo(MainNavigation);

// Main app content with focus management
const AppContent: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);
    const [lastFocusKey, setLastFocusKey] = useState<string | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Performance optimized authentication
    const authenticate = useCallback(async () => {
        try {
            setIsLoading(true);
            const success = await xtreamService.authenticate();
            if (success) {
                setIsAuthenticated(true);
            } else {
                setError('Authentication failed. Please check your credentials.');
            }
        } catch (err) {
            setError('Failed to connect to the server. Please try again later.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        authenticate();
    }, [authenticate]);

    // Save focus state before navigation
    useEffect(() => {
        const focusedElement = getFocusedElement();
        if (focusedElement) {
            setLastFocusKey(focusedElement.getAttribute('data-focus-key') || null);
        }
    }, [location.pathname]);

    // Restore focus after navigation
    useEffect(() => {
        if (lastFocusKey && !isNavigating) {
            const element = document.querySelector(`[data-focus-key="${lastFocusKey}"]`);
            if (element) {
                setFocus(lastFocusKey);
            }
        }
    }, [isNavigating, lastFocusKey]);

    // Optimized TV back button handling
    const handleBackButton = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Backspace' || event.key === 'GoBack') {
            event.preventDefault();
            
            // Save current focus before navigation
            const focusedElement = getFocusedElement();
            if (focusedElement) {
                setLastFocusKey(focusedElement.getAttribute('data-focus-key') || null);
            }

            if (location.pathname !== '/live') {
                setIsNavigating(true);
                setTimeout(() => {
                    navigate(-1);
                    setIsNavigating(false);
                }, 300);
            }
        }
    }, [navigate, location.pathname]);

    // Optimized event listener management
    useEffect(() => {
        window.addEventListener('keydown', handleBackButton);
        return () => {
            window.removeEventListener('keydown', handleBackButton);
            // Clear navigation timeouts on unmount
            setIsNavigating(false);
        };
    }, [handleBackButton]);

    // Memoized page change handler
    const handlePageChange = useCallback((page: 'live' | 'movies' | 'series') => {
        const focusedElement = getFocusedElement();
        if (focusedElement) {
            setLastFocusKey(focusedElement.getAttribute('data-focus-key') || null);
        }

        setIsNavigating(true);
        setTimeout(() => {
            navigate(`/${page}`);
            setIsNavigating(false);
        }, 300);
    }, [navigate]);

    if (isLoading) {
        return (
            <div className="loading-screen" data-focusable="true">
                <div className="spinner" />
                <span>Loading...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-screen">
                <div className="error-icon">⚠️</div>
                <h1>Connection Error</h1>
                <p>{error}</p>
                <button 
                    className="retry-button"
                    data-focusable="true"
                    onClick={() => {
                        setError(null);
                        authenticate();
                    }}
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="auth-screen">
                <h1>Authentication Required</h1>
                <p>Please check your Xtream credentials and try again.</p>
                <button 
                    className="retry-button"
                    data-focusable="true"
                    onClick={() => authenticate()}
                >
                    Retry Authentication
                </button>
            </div>
        );
    }

    return (
        <div 
            className={`app ${isNavigating ? 'navigating' : ''}`}
            data-focusable-container="true"
        >
            <MemoizedNavigation 
                onMenuSelect={handlePageChange}
                currentMenu={location.pathname.slice(1) as 'live' | 'movies' | 'series'}
            />
            <div className="page-container">
                <Routes>
                    <Route path="/live" element={<LiveTV />} />
                    <Route path="/movies/*" element={<Movies />} />
                    <Route path="/series/*" element={<Series />} />
                    <Route path="/" element={<Navigate to="/live" replace />} />
                </Routes>
            </div>
        </div>
    );
};

// Root component with router
const App: React.FC = () => {
    return (
        <HashRouter>
            <AppContent />
        </HashRouter>
    );
};

export default memo(App);