import React from 'react';
import ReactDOM from 'react-dom/client';
import { init } from '@noriginmedia/norigin-spatial-navigation';
import App from './App';
import './styles/global.scss';

// Initialize spatial navigation with focus retention
init({
    debug: false,
    visualDebug: false,
    throttle: 100, // For better performance on TV
    rememberLastFocusedElement: true,
    // Additional TV-optimized settings
    forgetLastFocusedElementId: false,
    streamMode: true,
    focusableClassName: 'focusable',
    focusKey: 'data-focusable-key'
});

// Prevent default back/backspace behavior
window.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'GoBack') {
        e.preventDefault();
    }
});

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

// StrictMode is disabled to prevent double-mounting issues with spatial navigation
root.render(
    <App />
);