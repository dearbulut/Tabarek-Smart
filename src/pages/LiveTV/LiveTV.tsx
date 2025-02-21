import React, { useState, useEffect, useCallback } from 'react';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faListUl, faSearch, faStar, faPlay,
    faHd, faCalendarAlt, faChevronRight
} from '@fortawesome/free-solid-svg-icons';
import xtreamService from '../../services/xtream';
import VideoPlayer from '../../components/video/VideoPlayer';
import EPGTimeline from '../../components/epg/EPGTimeline';
import './LiveTV.scss';

interface Channel {
    stream_id: number;
    name: string;
    stream_icon: string;
    epg_channel_id?: string;
    is_favorite?: boolean;
    currentProgram?: {
        title: string;
        description: string;
        start_timestamp: number;
        stop_timestamp: number;
    };
}

interface Category {
    category_id: string;
    category_name: string;
    channel_count?: number;
}

const LiveTV: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [showCategories, setShowCategories] = useState(true);
    const [showEPG, setShowEPG] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showPlayer, setShowPlayer] = useState(false);

    const { ref: containerRef, focusKey: containerFocusKey } = useFocusable({
        isFocusBoundary: true
    });

    // Load categories
    useEffect(() => {
        const loadCategories = async () => {
            try {
                setIsLoading(true);
                const data = await xtreamService.getLiveCategories();
                setCategories(data);
                if (data.length > 0) {
                    setSelectedCategory(data[0].category_id);
                }
            } catch (err) {
                setError('Failed to load categories');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadCategories();
    }, []);

    // Load channels for selected category
    useEffect(() => {
        const loadChannels = async () => {
            if (!selectedCategory) return;

            try {
                setIsLoading(true);
                const data = await xtreamService.getLiveStreams(selectedCategory);
                const favorites = await xtreamService.getFavorites('live');
                
                // Get current EPG data for each channel
                const channelsWithEPG = await Promise.all(
                    data.map(async (channel) => {
                        let currentProgram;
                        if (channel.epg_channel_id) {
                            const epg = await xtreamService.getCurrentAndNextPrograms(channel.epg_channel_id);
                            currentProgram = epg.current;
                        }
                        return {
                            ...channel,
                            is_favorite: favorites.includes(channel.stream_id.toString()),
                            currentProgram
                        };
                    })
                );

                setChannels(channelsWithEPG);
            } catch (err) {
                setError('Failed to load channels');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadChannels();
    }, [selectedCategory]);

    // Handle keyboard/remote control
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'Red':
                case 'ColorF0Red':
                    setShowCategories(prev => !prev);
                    break;
                case 'Green':
                case 'ColorF1Green':
                    if (selectedChannel) {
                        setShowEPG(prev => !prev);
                    }
                    break;
                case 'Yellow':
                case 'ColorF2Yellow':
                    setShowSearch(prev => !prev);
                    break;
                case 'Blue':
                case 'ColorF3Blue':
                    if (selectedChannel) {
                        handleToggleFavorite(selectedChannel);
                    }
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                    if (showPlayer) {
                        handleChannelSwitch(event.key === 'ArrowUp' ? 'up' : 'down');
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedChannel, showPlayer]);

    const handleToggleFavorite = async (channel: Channel) => {
        try {
            if (channel.is_favorite) {
                await xtreamService.removeFromFavorites('live', channel.stream_id.toString());
            } else {
                await xtreamService.addToFavorites('live', channel.stream_id.toString());
            }
            
            setChannels(prev => prev.map(c => 
                c.stream_id === channel.stream_id 
                    ? { ...c, is_favorite: !c.is_favorite }
                    : c
            ));
            
            if (selectedChannel?.stream_id === channel.stream_id) {
                setSelectedChannel(prev => prev ? { ...prev, is_favorite: !prev.is_favorite } : null);
            }
        } catch (err) {
            console.error('Failed to update favorites:', err);
        }
    };

    const handleChannelSwitch = (direction: 'up' | 'down') => {
        if (!selectedChannel || !channels.length) return;

        const currentIndex = channels.findIndex(c => c.stream_id === selectedChannel.stream_id);
        let nextIndex = direction === 'up' 
            ? (currentIndex - 1 + channels.length) % channels.length
            : (currentIndex + 1) % channels.length;

        setSelectedChannel(channels[nextIndex]);
    };

    const handleChannelSelect = async (channel: Channel) => {
        setSelectedChannel(channel);
        setShowPlayer(true);
    };

    const filteredChannels = searchQuery
        ? channels.filter(channel => 
            channel.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : channels;

    if (error) {
        return (
            <div className="error-message">
                <h2>Error</h2>
                <p>{error}</p>
                <button onClick={() => window.location.reload()}>Retry</button>
            </div>
        );
    }

    return (
        <FocusContext.Provider value={containerFocusKey}>
            <div ref={containerRef} className="live-tv-page">
                {/* Color Button Controls */}
                <div className="color-buttons">
                    <button className="color-button red" onClick={() => setShowCategories(prev => !prev)}>
                        <FontAwesomeIcon icon={faListUl} />
                        <span>Categories</span>
                    </button>
                    <button 
                        className="color-button green" 
                        onClick={() => selectedChannel && setShowEPG(prev => !prev)}
                        disabled={!selectedChannel}
                    >
                        <FontAwesomeIcon icon={faCalendarAlt} />
                        <span>Guide</span>
                    </button>
                    <button className="color-button yellow" onClick={() => setShowSearch(prev => !prev)}>
                        <FontAwesomeIcon icon={faSearch} />
                        <span>Search</span>
                    </button>
                    <button 
                        className="color-button blue" 
                        onClick={() => selectedChannel && handleToggleFavorite(selectedChannel)}
                        disabled={!selectedChannel}
                    >
                        <FontAwesomeIcon icon={faStar} />
                        <span>Favorite</span>
                    </button>
                </div>

                {/* Main Content */}
                <div className="content-area">
                    {/* Categories Panel */}
                    {showCategories && (
                        <div className="categories-panel">
                            <h2>Categories</h2>
                            <div className="categories-list">
                                {categories.map(category => {
                                    const { ref: categoryRef, focused } = useFocusable({
                                        onEnterPress: () => setSelectedCategory(category.category_id)
                                    });

                                    return (
                                        <div
                                            key={category.category_id}
                                            ref={categoryRef}
                                            className={`category-item ${
                                                selectedCategory === category.category_id ? 'active' : ''
                                            } ${focused ? 'focused' : ''}`}
                                        >
                                            <span className="category-name">{category.category_name}</span>
                                            <span className="channel-count">
                                                {category.channel_count || 0} channels
                                            </span>
                                            <FontAwesomeIcon icon={faChevronRight} className="arrow-icon" />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Channel Grid/List */}
                    <div className={`channels-view ${viewMode}`}>
                        {isLoading ? (
                            <div className="loading-spinner">Loading channels...</div>
                        ) : (
                            <>
                                {showSearch && (
                                    <div className="search-bar">
                                        <FontAwesomeIcon icon={faSearch} />
                                        <input
                                            type="text"
                                            placeholder="Search channels..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                )}

                                <div className="channels-list">
                                    {filteredChannels.map(channel => {
                                        const { ref: channelRef, focused } = useFocusable({
                                            onEnterPress: () => handleChannelSelect(channel)
                                        });

                                        return (
                                            <div
                                                key={channel.stream_id}
                                                ref={channelRef}
                                                className={`channel-item ${focused ? 'focused' : ''}`}
                                            >
                                                <div className="channel-logo">
                                                    <img src={channel.stream_icon} alt={channel.name} />
                                                </div>
                                                <div className="channel-info">
                                                    <h3>{channel.name}</h3>
                                                    {channel.currentProgram && (
                                                        <div className="program-info">
                                                            <span className="title">
                                                                {channel.currentProgram.title}
                                                            </span>
                                                            <span className="time">
                                                                {new Date(channel.currentProgram.start_timestamp * 1000).toLocaleTimeString()} - 
                                                                {new Date(channel.currentProgram.stop_timestamp * 1000).toLocaleTimeString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                {channel.is_favorite && (
                                                    <FontAwesomeIcon icon={faStar} className="favorite-icon" />
                                                )}
                                                <FontAwesomeIcon icon={faHd} className="quality-icon" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* EPG Timeline */}
                    {showEPG && selectedChannel && selectedChannel.epg_channel_id && (
                        <EPGTimeline
                            channelId={selectedChannel.epg_channel_id}
                            currentTime={new Date()}
                            onProgramSelect={() => setShowEPG(false)}
                            channelName={selectedChannel.name}
                        />
                    )}

                    {/* Video Player */}
                    {showPlayer && selectedChannel && (
                        <VideoPlayer
                            content={{
                                type: 'live',
                                id: selectedChannel.stream_id.toString(),
                                title: selectedChannel.name,
                                channelName: selectedChannel.name,
                                programTitle: selectedChannel.currentProgram?.title,
                                quality: 'HD',
                                hasSubtitles: false
                            }}
                            url={xtreamService.getLiveStreamUrl(selectedChannel.stream_id)}
                            onBack={() => setShowPlayer(false)}
                            onError={(error) => {
                                setError(error.message);
                                setShowPlayer(false);
                            }}
                        />
                    )}
                </div>
            </div>
        </FocusContext.Provider>
    );
};

export default LiveTV;