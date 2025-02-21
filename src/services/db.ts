interface StorageData {
    favorites: {
        live: Set<string>;
        movie: Set<string>;
        series: Set<string>;
    };
    watchProgress: {
        [key: string]: {
            position: number;
            duration: number;
            timestamp: number;
        };
    };
    lastWatched: {
        live: string[];
        movie: string[];
        series: string[];
    };
}

export class Database {
    private storage: StorageData;
    private readonly STORAGE_KEY = 'tabarek_iptv_data';
    private readonly MAX_LAST_WATCHED = 20;

    constructor() {
        this.storage = this.loadFromStorage();
    }

    private loadFromStorage(): StorageData {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                return {
                    favorites: {
                        live: new Set(parsed.favorites?.live || []),
                        movie: new Set(parsed.favorites?.movie || []),
                        series: new Set(parsed.favorites?.series || [])
                    },
                    watchProgress: parsed.watchProgress || {},
                    lastWatched: {
                        live: parsed.lastWatched?.live || [],
                        movie: parsed.lastWatched?.movie || [],
                        series: parsed.lastWatched?.series || []
                    }
                };
            }
        } catch (error) {
            console.error('Failed to load data from storage:', error);
        }

        return {
            favorites: {
                live: new Set(),
                movie: new Set(),
                series: new Set()
            },
            watchProgress: {},
            lastWatched: {
                live: [],
                movie: [],
                series: []
            }
        };
    }

    private saveToStorage(): void {
        try {
            const data = {
                favorites: {
                    live: Array.from(this.storage.favorites.live),
                    movie: Array.from(this.storage.favorites.movie),
                    series: Array.from(this.storage.favorites.series)
                },
                watchProgress: this.storage.watchProgress,
                lastWatched: this.storage.lastWatched
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save data to storage:', error);
        }
    }

    async saveFavorite(type: 'live' | 'movie' | 'series', id: string): Promise<void> {
        this.storage.favorites[type].add(id);
        this.saveToStorage();
    }

    async removeFavorite(type: 'live' | 'movie' | 'series', id: string): Promise<void> {
        this.storage.favorites[type].delete(id);
        this.saveToStorage();
    }

    async getFavorites(type: 'live' | 'movie' | 'series'): Promise<string[]> {
        return Array.from(this.storage.favorites[type]);
    }

    async isFavorite(type: 'live' | 'movie' | 'series', id: string): Promise<boolean> {
        return this.storage.favorites[type].has(id);
    }

    async saveProgress(type: 'movie' | 'series', id: string, position: number, duration: number): Promise<void> {
        const key = `${type}_${id}`;
        this.storage.watchProgress[key] = {
            position,
            duration,
            timestamp: Date.now()
        };
        
        // Update last watched
        const lastWatched = this.storage.lastWatched[type];
        const index = lastWatched.indexOf(id);
        if (index > -1) {
            lastWatched.splice(index, 1);
        }
        lastWatched.unshift(id);
        if (lastWatched.length > this.MAX_LAST_WATCHED) {
            lastWatched.pop();
        }
        
        this.saveToStorage();
    }

    async getProgress(type: 'movie' | 'series', id: string): Promise<number> {
        const key = `${type}_${id}`;
        return this.storage.watchProgress[key]?.position || 0;
    }

    async getLastWatched(type: 'live' | 'movie' | 'series'): Promise<string[]> {
        return this.storage.lastWatched[type];
    }

    async clearWatchProgress(type: 'movie' | 'series', id: string): Promise<void> {
        const key = `${type}_${id}`;
        delete this.storage.watchProgress[key];
        this.saveToStorage();
    }

    async clearAllWatchProgress(): Promise<void> {
        this.storage.watchProgress = {};
        this.storage.lastWatched = {
            live: [],
            movie: [],
            series: []
        };
        this.saveToStorage();
    }

    async clearAllFavorites(): Promise<void> {
        this.storage.favorites = {
            live: new Set(),
            movie: new Set(),
            series: new Set()
        };
        this.saveToStorage();
    }

    async clearAllData(): Promise<void> {
        localStorage.removeItem(this.STORAGE_KEY);
        this.storage = this.loadFromStorage();
    }
}

export default Database;