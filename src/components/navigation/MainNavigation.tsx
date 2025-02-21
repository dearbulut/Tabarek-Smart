import React, { useEffect } from 'react';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTv, faFilm, faClapperboard } from '@fortawesome/free-solid-svg-icons';
import '../styles/MainNavigation.scss';

interface MainNavigationProps {
    onMenuSelect: (menu: 'live' | 'movies' | 'series') => void;
    currentMenu: 'live' | 'movies' | 'series';
}

export const MainNavigation: React.FC<MainNavigationProps> = ({ onMenuSelect, currentMenu }) => {
    const { ref, focusKey, setFocus } = useFocusable({
        trackChildren: true,
        isFocusBoundary: true
    });

    useEffect(() => {
        // Set initial focus to Live TV menu item
        setFocus('menu-live');
    }, [setFocus]);

    const menuItems = [
        { key: 'live', label: 'Live TV', icon: faTv },
        { key: 'movies', label: 'Movies', icon: faFilm },
        { key: 'series', label: 'Series', icon: faClapperboard }
    ];

    const renderMenuItem = (item: { key: string; label: string; icon: any }, index: number) => {
        const { ref: itemRef, focused } = useFocusable({
            focusKey: `menu-${item.key}`,
            onEnterPress: () => onMenuSelect(item.key as 'live' | 'movies' | 'series'),
            onArrowPress: (direction) => {
                if (direction === 'right') {
                    // Handle right arrow press - can be used to focus content grid
                    return false; // Allow focus to move to content
                }
                return true; // Block other directions within menu
            },
            preferredChildFocusKey: index === 0 ? `menu-${item.key}` : undefined
        });

        return (
            <div
                ref={itemRef}
                key={item.key}
                className={`menu-item ${focused ? 'focused' : ''} ${currentMenu === item.key ? 'active' : ''}`}
                role="menuitem"
                tabIndex={0}
                aria-selected={currentMenu === item.key}
            >
                <div className="menu-item-content">
                    <FontAwesomeIcon icon={item.icon} className="menu-icon" />
                    <span className="menu-label">{item.label}</span>
                </div>
                {currentMenu === item.key && (
                    <div className="menu-indicator" />
                )}
            </div>
        );
    };

    return (
        <FocusContext.Provider value={focusKey}>
            <nav 
                ref={ref} 
                className="main-navigation"
                role="navigation"
                aria-label="Main Menu"
            >
                <div className="menu-container">
                    <div className="menu-list" role="menubar">
                        {menuItems.map((item, index) => renderMenuItem(item, index))}
                    </div>
                </div>
            </nav>
        </FocusContext.Provider>
    );
};

export default MainNavigation;