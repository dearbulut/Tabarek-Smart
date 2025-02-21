```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faListUl, faSearch, faStar, faPlay,
    faHd, faClosedCaptioning, faVolumeUp,
    faCalendarAlt, faClock, faLayerGroup
} from '@fortawesome/free-solid-svg-icons';
import xtreamService from '../../services/xtream';
import VideoPlayer from '../../components/IntegratedPlayer';
import './Series.scss';

interface Series {
    series_id: number;
    name: string;
    cover: string;
    plot: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    rating: string;
    rating_5based: number;
    is_favorite?: boolean;
    last_watched_episode?: {
        season: number;
        episode: number;
        position: number;
    };
}

interface Season {
    season_number: number;
    name?: string;
    overview?: string;
    cover?: string;
    episode_count: number;
    air_date?: string;
}

interface Episode {
    id: number;
    episode_num: number;
    title: string;
    container_extension: string;
    duration: number;
    overview?: string;
    still_path?: string;
    air_date?: string;
    progress?: number;
    subtitles?: Array<{ id: string; language: string; url: string }>;
    audio_tracks?: Array<{ id: string; language: string; name: string }>;
}

interface Category {
    category_id: string;
    category_name: string;
    series_count?: number;
}

const Series: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [seriesList, setSeriesList] = useState<Series[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
    const [episodes, setEpisodes] = useState<Episode[]>([]);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
    const [showCategories, setShowCategories] = useState(true);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showPlayer, setShowPlayer] = useState(false);
    const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
    const [selectedAudio, setSelectedAudio] = useState<string | null>(null);

    const { ref: containerRef, focusKey: containerFocusKey } = useFocusable({
        isFocusBoundary: true
    });

    useEffect(() => {
        const loadCategories = async () => {
            try {
                setIsLoading(true);
                const data = await xtreamService.getSeriesCategories();
                setCategories(data);
                if (data.length > 0) {
                    setSelectedCategory(data[0].category_id);
                }
            } catch (err) {
                setError('Failed to load series categories');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadCategories();
    }, []);

    useEffect(() => {
        const loadSeries = async () => {
            if (!selectedCategory) return;

            try {
                setIsLoading(true);
                const data = await xtreamService.getSeries(selectedCategory);
                const favorites = await xtreamService.getFavorites('series');
                
                const seriesWithMeta = await Promise.all(
                    data.map(async (series) => {
                        const lastWatched = await xtreamService.getLastWatchedEpisode(series.series_id.toString());
                        return {
                            ...series,
                            is_favorite: favorites.includes(series.series_id.toString()),
                            last_watched_episode: lastWatched
                        };
                    })
                );

                setSeriesList(seriesWithMeta);
            } catch (err) {
                setError('Failed to load series');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadSeries();
    }, [selectedCategory]);

    useEffect(() => {
        const loadSeasons = async () => {
            if (!selectedSeries) return;

            try {
                setIsLoading(true);
                const data = await xtreamService.getSeriesSeasons(selectedSeries.series_id);
                setSeasons(data);
                if (data.length > 0) {
                    const targetSeason = selectedSeries.last_watched_episode
                        ? data.find(s => s.season_number === selectedSeries.last_watched_episode?.season)
                        : data[0];
                    setSelectedSeason(targetSeason || data[0]);
                }
            } catch (err) {
                setError('Failed to load seasons');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadSeasons();
    }, [selectedSeries]);

    useEffect(() => {
        const loadEpisodes = async () => {
            if (!selectedSeries || !selectedSeason) return;

            try {
                setIsLoading(true);
                const data = await xtreamService.getSeriesEpisodes(
                    selectedSeries.series_id,
                    selectedSeason.season_number
                );

                const episodesWithProgress = await Promise.all(
                    data.map(async (episode) => {
                        const progress = await xtreamService.getWatchProgress(
                            'series',
                            `${selectedSeries.series_id}_${selectedSeason.season_number}_${episode.episode_num}`
                        );
                        return { ...episode, progress };
                    })
                );

                setEpisodes(episodesWithProgress);

                if (selectedSeries.last_watched_episode?.season === selectedSeason.season_number) {
                    const lastEpisode = episodesWithProgress.find(
                        e => e.episode_num === selectedSeries.last_watched_episode?.episode
                    );
                    if (lastEpisode) {
                        setSelectedEpisode(lastEpisode);
                    }
                }
            } catch (err) {
                setError('Failed to load episodes');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadEpisodes();
    }, [selectedSeries, selectedSeason]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        switch (event.key) {
            case 'Red':
            case 'ColorF0Red':
                setShowCategories(prev => !prev);
                break;
            case 'Yellow':
            case 'ColorF2Yellow':
                setShowSearch(prev => !prev);
                break;
            case 'Blue':
            case 'ColorF3Blue':
                if (selectedSeries) {
                    handleToggleFavorite(selectedSeries);
                }
                break;
        }
    }, [selectedSeries]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleToggleFavorite = async (series: Series) => {
        try {
            if (series.is_favorite) {
                await xtreamService.removeFromFavorites('series', series.series_id.toString());
            } else {
                await xtreamService.addToFavorites('series', series.series_id.toString());
            }
            
            setSeriesList(prev => prev.map(s => 
                s.series_id === series.series_id 
                    ? { ...s, is_favorite: !s.is_favorite }
                    : s
            ));
            
            if (selectedSeries?.series_id === series.series_id) {
                setSelectedSeries(prev => prev ? { ...prev, is_favorite: !prev.is_favorite } : null);
            }
        } catch (err) {
            console.error('Failed to update favorites:', err);
        }
    };

    const handleEpisodeSelect = async (episode: Episode) => {
        setSelectedEpisode(episode);
        setShowPlayer(true);
    };

    const handleProgress = async (progress: { playedSeconds: number }) => {
        if (!selectedSeries || !selectedSeason || !selectedEpisode) return;
        await xtreamService.saveWatchProgress(
            'series',
            `${selectedSeries.series_id}_${selectedSeason.season_number}_${selectedEpisode.episode_num}`,
            progress.playedSeconds,
            selectedEpisode.duration
        );
    };

    const handlePlaybackEnd = async () => {
        if (!selectedSeries || !selectedSeason || !selectedEpisode) return;

        // Save progress
        await xtreamService.saveWatchProgress(
            'series',
            `${selectedSeries.series_id}_${selectedSeason.season_number}_${selectedEpisode.episode_num}`,
            selectedEpisode.duration,
            selectedEpisode.duration
        );

        // Auto-play next episode
        const currentIndex = episodes.findIndex(e => e.id === selectedEpisode.id);
        if (currentIndex < episodes.length - 1) {
            setSelectedEpisode(episodes[currentIndex + 1]);
        } else if (currentIndex === episodes.length - 1 && seasons.length > 0) {
            const currentSeasonIndex = seasons.findIndex(s => s.season_number === selectedSeason.season_number);
            if (currentSeasonIndex < seasons.length - 1) {
                setSelectedSeason(seasons[currentSeasonIndex + 1]);
            }
        }
    };

    const handleSeasonChange = (direction: 'next' | 'prev') => {
        if (!selectedSeason || !seasons.length) return;
        const currentIndex = seasons.findIndex(s => s.season_number === selectedSeason.season_number);
        const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex >= 0 && nextIndex < seasons.length) {
            setSelectedSeason(seasons[nextIndex]);
        }
    };

    if (error) {
        return (
            <div className="error-message">
                <h2>Error</h2>
                <p>{error}</p>
                <button onClick={() => window.location.reload()}>Retry</button>
            </div>
        );
    }

    const filteredSeries = searchQuery
        ? seriesList.filter(series =>
            series.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            series.plot.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : seriesList;

    return (
        <FocusContext.Provider value={containerFocusKey}>
            <div ref={containerRef} className="series-page">
                <div className="color-buttons">
                    <button className="color-button red" onClick={() => setShowCategories(prev => !prev)}>
                        <FontAwesomeIcon icon={faListUl} />
                        <span>Categories</span>
                    </button>
                    <button className="color-button yellow" onClick={() => setShowSearch(prev => !prev)}>
                        <FontAwesomeIcon icon={faSearch} />
                        <span>Search</span>
                    </button>
                    <button 
                        className="color-button blue"
                        onClick={() => selectedSeries && handleToggleFavorite(selectedSeries)}
                        disabled={!selectedSeries}
                    >
                        <FontAwesomeIcon icon={faStar} />
                        <span>Favorite</span>
                    </button>
                </div>

                <div className="content-area">
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
                                            <span className="series-count">
                                                {category.series_count || 0} series
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="series-content">
                        {showSearch && (
                            <div className="search-bar">
                                <FontAwesomeIcon icon={faSearch} />
                                <input
                                    type="text"
                                    placeholder="Search series..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        )}

                        {!selectedSeries ? (
                            <div className="series-grid">
                                {filteredSeries.map(series => {
                                    const { ref: seriesRef, focused } = useFocusable({
                                        onEnterPress: () => setSelectedSeries(series)
                                    });

                                    return (
                                        <div
                                            key={series.series_id}
                                            ref={seriesRef}
                                            className={`series-card ${focused ? 'focused' : ''}`}
                                        >
                                            <img src={series.cover} alt={series.name} className="cover" />
                                            <div className="series-info">
                                                <h3>{series.name}</h3>
                                                <div className="metadata">
                                                    <span className="rating">
                                                        <FontAwesomeIcon icon={faStar} />
                                                        {series.rating_5based.toFixed(1)}
                                                    </span>
                                                    {series.last_watched_episode && (
                                                        <span className="progress">
                                                            S{series.last_watched_episode.season}
                                                            E{series.last_watched_episode.episode}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {series.is_favorite && (
                                                <FontAwesomeIcon icon={faStar} className="favorite-icon" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="series-details">
                                <div className="details-content">
                                    <h1>{selectedSeries.name}</h1>
                                    <div className="metadata">
                                        <span className="rating">
                                            <FontAwesomeIcon icon={faStar} />
                                            {selectedSeries.rating_5based.toFixed(1)}
                                        </span>