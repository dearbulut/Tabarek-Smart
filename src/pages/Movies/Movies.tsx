```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faListUl, faSearch, faStar, faPlay,
    faHd, faClosedCaptioning, faVolumeUp, 
    faCalendarAlt, faClock
} from '@fortawesome/free-solid-svg-icons';
import xtreamService from '../../services/xtream';
import VideoPlayer from '../../components/IntegratedPlayer';
import './Movies.scss';

interface Movie {
    stream_id: number;
    name: string;
    stream_icon: string;
    rating: string;
    rating_5based: number;
    category_id: string;
    container_extension: string;
    plot: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    duration?: number;
    backdrop?: string;
    is_favorite?: boolean;
    progress?: number;
}

interface Category {
    category_id: string;
    category_name: string;
    movie_count?: number;
}

interface MovieDetails extends Movie {
    subtitles?: Array<{ id: string; language: string; url: string }>;
    audio_tracks?: Array<{ id: string; language: string; name: string }>;
}

const Movies: React.FC = () => {
    // State declarations
    const [categories, setCategories] = useState<Category[]>([]);
    const [movies, setMovies] = useState<Movie[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedMovie, setSelectedMovie] = useState<MovieDetails | null>(null);
    const [showCategories, setShowCategories] = useState(true);
    const [showPlayer, setShowPlayer] = useState(false);
    const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
    const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    const { ref: containerRef, focusKey: containerFocusKey } = useFocusable({
        isFocusBoundary: true
    });

    // Load categories
    useEffect(() => {
        const loadCategories = async () => {
            try {
                setIsLoading(true);
                const data = await xtreamService.getVODCategories();
                setCategories(data);
                if (data.length > 0) {
                    setSelectedCategory(data[0].category_id);
                }
            } catch (err) {
                setError('Failed to load movie categories');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadCategories();
    }, []);

    // Load movies for selected category
    useEffect(() => {
        const loadMovies = async () => {
            if (!selectedCategory) return;

            try {
                setIsLoading(true);
                const data = await xtreamService.getVODStreams(selectedCategory);
                const favorites = await xtreamService.getFavorites('movie');
                const progress = await Promise.all(
                    data.map(movie => 
                        xtreamService.getWatchProgress('movie', movie.stream_id.toString())
                    )
                );

                const moviesWithMeta = data.map((movie, index) => ({
                    ...movie,
                    is_favorite: favorites.includes(movie.stream_id.toString()),
                    progress: progress[index] || 0
                }));

                setMovies(moviesWithMeta);
            } catch (err) {
                setError('Failed to load movies');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadMovies();
    }, [selectedCategory]);

    // Handle keyboard/remote control
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
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
                    if (selectedMovie) {
                        handleToggleFavorite(selectedMovie);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMovie]);

    const handleMovieSelect = async (movie: Movie): Promise<void> => {
        try {
            setIsLoading(true);
            const details = await xtreamService.getMovieInfo(movie.stream_id);
            setSelectedMovie({
                ...movie,
                ...details.movie_data,
                subtitles: details.subtitle_tracks,
                audio_tracks: details.audio_tracks
            });
        } catch (err) {
            console.error('Failed to load movie details:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleFavorite = async (movie: Movie): Promise<void> => {
        try {
            if (movie.is_favorite) {
                await xtreamService.removeFromFavorites('movie', movie.stream_id.toString());
            } else {
                await xtreamService.addToFavorites('movie', movie.stream_id.toString());
            }
            
            setMovies(prev => prev.map(m => 
                m.stream_id === movie.stream_id 
                    ? { ...m, is_favorite: !m.is_favorite }
                    : m
            ));
            
            if (selectedMovie?.stream_id === movie.stream_id) {
                setSelectedMovie(prev => prev ? { ...prev, is_favorite: !prev.is_favorite } : null);
            }
        } catch (err) {
            console.error('Failed to update favorites:', err);
        }
    };

    const handlePlayMovie = async (movie: MovieDetails): Promise<() => Promise<void>> => {
        setShowPlayer(true);
        // Save last watched position on close
        const handleBack = async () => {
            const progress = await xtreamService.getWatchProgress('movie', movie.stream_id.toString());
            setMovies(prev => prev.map(m => 
                m.stream_id === movie.stream_id 
                    ? { ...m, progress }
                    : m
            ));
            setShowPlayer(false);
        };

        return handleBack;
    };

    const filteredMovies = searchQuery
        ? movies.filter(movie => 
            movie.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            movie.plot?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : movies;

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
            <div ref={containerRef} className="movies-page">
                {/* Color Button Controls */}
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
                        onClick={() => selectedMovie && handleToggleFavorite(selectedMovie)}
                        disabled={!selectedMovie}
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
                                            <span className="movie-count">
                                                {category.movie_count || 0} movies
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Movies Grid */}
                    <div className="movies-grid">
                        {isLoading ? (
                            <div className="loading-spinner">Loading movies...</div>
                        ) : (
                            <>
                                {showSearch && (
                                    <div className="search-bar">
                                        <FontAwesomeIcon icon={faSearch} />
                                        <input
                                            type="text"
                                            placeholder="Search movies..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                )}

                                <div className="movies-list">
                                    {filteredMovies.map(movie => {
                                        const { ref: movieRef, focused } = useFocusable({
                                            onEnterPress: () => handleMovieSelect(movie)
                                        });

                                        return (
                                            <div
                                                key={movie.stream_id}
                                                ref={movieRef}
                                                className={`movie-item ${focused ? 'focused' : ''}`}
                                            >
                                                <div className="poster">
                                                    <img src={movie.stream_icon} alt={movie.name} />
                                                    {movie.progress > 0 && (
                                                        <div className="progress-bar">
                                                            <div 
                                                                className="progress"
                                                                style={{ width: `${movie.progress}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                    {focused && (
                                                        <div className="hover-info">
                                                            <button className="play-button">
                                                                <FontAwesomeIcon icon={faPlay} />
                                                                <span>View Details</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="movie-info">
                                                    <h3>{movie.name}</h3>
                                                    <div className="metadata">
                                                        <span className="rating">
                                                            <FontAwesomeIcon icon={faStar} />
                                                            {movie.rating_5based.toFixed(1)}
                                                        </span>
                                                        {movie.container_extension === 'mkv' && (
                                                            <span className="quality">4K</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {movie.is_favorite && (
                                                    <FontAwesomeIcon icon={faStar} className="favorite-icon" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Movie Details */}
                    {selectedMovie && !showPlayer && (
                        <div className="movie-details">
                            <div className="backdrop">
                                <img src={selectedMovie.backdrop || selectedMovie.stream_icon} alt="" />
                                <div className="backdrop-overlay" />
                            </div>
                            <div className="content">
                                <h1>{selectedMovie.name}</h1>
                                <div className="metadata">
                                    <span className="rating">
                                        <FontAwesomeIcon icon={faStar} />
                                        {selectedMovie.rating_5based.toFixed(1)}
                                    </span>
                                    {selectedMovie.releaseDate && (
                                        <span className="year">
                                            <FontAwesomeIcon icon={faCalendarAlt} />
                                            {selectedMovie.releaseDate}
                                        </span>
                                    )}
                                    {selectedMovie.duration && (
                                        <span className="duration">
                                            <FontAwesomeIcon icon={faClock} />
                                            {Math.floor(selectedMovie.duration / 60)}m
                                        </span>
                                    )}
                                </div>
                                <p className="plot">{selectedMovie.plot}</p>
                                {selectedMovie.cast && (
                                    <div className="cast">
                                        <strong>Cast:</strong> {selectedMovie.cast}
                                    </div>
                                )}
                                {selectedMovie.director && (
                                    <div className="director">
                                        <strong>Director:</strong> {selectedMovie.director}
                                    </div>
                                )}
                                {selectedMovie.genre && (
                                    <div className="genre">
                                        <strong>Genre:</strong> {selectedMovie.genre}
                                    </div>
                                )}
                                <div className="features">
                                    {selectedMovie.container_extension === 'mkv' && (
                                        <span className="quality-badge">4K</span>
                                    )}
                                    {selectedMovie.subtitles?.length > 0 && (
                                        <span className="feature">
                                            <FontAwesomeIcon icon={faClosedCaptioning} />
                                            {selectedMovie.subtitles.length} Subtitle tracks
                                        </span>
                                    )}
                                    {selectedMovie.audio_tracks?.length > 0 && (
                                        <span className="feature">
                                            <FontAwesomeIcon icon={faVolumeUp} />
                                            {selectedMovie.audio_tracks.length} Audio tracks
                                        </span>
                                    )}
                                </div>
                                <div className="playback-options">
                                    {selectedMovie.subtitles && selectedMovie.subtitles.length > 0 && (
                                        <div className="track-selector">
                                            <h3>Subtitles</h3>
                                            <div className="track-list">
                                                {selectedMovie.subtitles.map(track => {
                                                    const { ref: subtitleRef, focused: subtitleFocused } = useFocusable({
                                                        onEnterPress: () => setSelectedSubtitle(track.id)
                                                    });
                                                    return (
                                                        <button
                                                            key={track.id}
                                                            ref={subtitleRef}
                                                            className={`track-button ${selectedSubtitle === track.id ? 'active' : ''} ${subtitleFocused ? 'focused' : ''}`}
                                                            onClick={() => setSelectedSubtitle(track.id)}
                                                        >
                                                            {track.language}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {selectedMovie.audio_tracks && selectedMovie.audio_tracks.length > 0 && (
                                        <div className="track-selector">
                                            <h3>Audio</h3>
                                            <div className="track-list">
                                                {selectedMovie.audio_tracks.map(track => {
                                                    const { ref: audioRef, focused: audioFocused } = useFocusable({
                                                        onEnterPress: () => setSelectedAudio(track.id)
                                                    });
                                                    return (
                                                        <button
                                                            key={track.id}
                                                            ref={audioRef}
                                                            className={`track-button ${selectedAudio === track.id ? 'active' : ''} ${audioFocused ? 'focused' : ''}`}
                                                            onClick={() => setSelectedAudio(track.id)}
                                                        >
                                                            {track.language}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <button 
                                        className="play-button primary"
                                        onClick={() => handlePlayMovie(selectedMovie)}
                                    >
                                        <FontAwesomeIcon icon={faPlay} />
                                        {selectedMovie.progress > 0 ? 'Resume' : 'Play'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showPlayer && selectedMovie && (
                        <VideoPlayer
                            content={{
                                type: 'movie',
                                id: selectedMovie.stream_id.toString(),
                                title: selectedMovie.name,
                                quality: selectedMovie.container_extension === 'mkv' ? '4K' : 'HD',
                                hasSubtitles: selectedMovie.subtitles?.length > 0,
                                duration: selectedMovie.duration || 0,
                                progress: selectedMovie.progress,
                                selectedSubtitle,
                                selectedAudio
                            }}
                            url={xtreamService.getMovieStreamUrl(selectedMovie.stream_id)}
                            onBack={async () => {
                                const handleBack = await handlePlayMovie(selectedMovie);
                                handleBack();
                            }}
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

export default Movies;