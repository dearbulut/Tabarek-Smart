```typescript
import { Database } from './db';
import { EPGParser, EPGData, EPGProgram } from '../utils/epgParser';

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

interface XtreamConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface XtreamUserInfo {
  username: string;
  password: string;
  message: string;
  auth: number;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

interface XtreamStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

interface XtreamEPG {
  id: number;
  epg_id: string;
  title: string;
  lang: string;
  start: string;
  end: string;
  description: string;
  channel_id: string;
  start_timestamp: number;
  stop_timestamp: number;
}

interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface XtreamSeries {
  series_id: number;
  name: string;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  rating: string;
  rating_5based: number;
}

interface XtreamVODStream {
  stream_id: number;
  name: string;
  added: string;
  category_id: string;
  container_extension: string;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  plot: string;
}

interface XtreamMovieInfo {
  movie_data: {
    name: string;
    stream_id: number;
    stream_icon: string;
    rating: string;
    rating_5based: number;
    added: string;
    category_id: string;
    container_extension: string;
    custom_sid: string;
    direct_source: string;
  };
  subtitle_tracks?: Array<{
    id: string;
    language: string;
    url: string;
  }>;
  audio_tracks?: Array<{
    id: string;
    language: string;
    name: string;
  }>;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class XtreamService {
  private config: XtreamConfig;
  private userInfo: XtreamUserInfo | null = null;
  private db: Database;
  private epgParser: EPGParser;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private sessionToken: string | null = null;
  private sessionExpiry: number | null = null;
  private connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private autoReconnectTimeout: NodeJS.Timeout | null = null;
  private retryDelays = [1000, 2000, 5000];

  private readonly CACHE_DURATION = {
    epg: 5 * 60 * 1000,
    fullEpg: 30 * 60 * 1000,
    movieInfo: 30 * 60 * 1000,
    streams: 10 * 60 * 1000
  };

  constructor(config: XtreamConfig) {
    this.config = config;
    this.db = new Database();
    this.epgParser = new EPGParser();
    this.initialize();

    setInterval(() => this.cleanCache(), 5 * 60 * 1000);
  }

  private async initialize() {
    try {
      const success = await this.authenticate();
      if (!success) {
        throw new AuthenticationError('Initial authentication failed');
      }
      this.startConnectionMonitoring();
    } catch (error) {
      console.error('Initialization failed:', error);
      this.retryInitialization();
    }
  }

  private startConnectionMonitoring() {
    setInterval(() => this.checkConnection(), 30000);
  }

  private async checkConnection() {
    if (this.connectionStatus === 'connecting') return;
    
    try {
      this.connectionStatus = 'connecting';
      const success = await this.authenticate();
      this.connectionStatus = success ? 'connected' : 'disconnected';
      
      if (!success) {
        throw new Error('Connection check failed');
      }
    } catch (error) {
      this.connectionStatus = 'disconnected';
      this.handleConnectionError();
    }
  }

  private handleConnectionError() {
    if (!this.autoReconnectTimeout) {
      this.autoReconnectTimeout = setTimeout(() => {
        this.checkConnection();
        this.autoReconnectTimeout = null;
      }, 30000);
    }
  }

  private retryInitialization(attempt: number = 0) {
    if (attempt < 3) {
      setTimeout(() => {
        this.initialize();
      }, Math.pow(2, attempt) * 1000);
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private cacheGet<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  private cacheSet<T>(key: string, data: T, duration: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + duration
    });
  }

  private async fetchWithRetry<T>(url: string, options: RequestInit = {}, retryCount = 0): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal,
        headers: {
          ...options.headers,
          'Accept': 'application/json',
          ...(this.sessionToken && { 'Authorization': `Bearer ${this.sessionToken}` })
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          await this.refreshSession();
          if (retryCount < this.retryDelays.length) {
            return this.fetchWithRetry(url, options, retryCount + 1);
          }
          throw new AuthenticationError('Authentication failed');
        }
        throw new ConnectionError(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      if (retryCount < this.retryDelays.length) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelays[retryCount]));
        return this.fetchWithRetry(url, options, retryCount + 1);
      }
      throw error;
    }
  }

  async authenticate(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/player_api.php?username=${this.config.username}&password=${this.config.password}`;
      const data = await this.fetchWithRetry<{ user_info: XtreamUserInfo }>(url);
      
      if (data.user_info && data.user_info.auth === 1) {
        this.userInfo = data.user_info;
        this.sessionToken = Math.random().toString(36).substring(7);
        this.sessionExpiry = Date.now() + (12 * 60 * 60 * 1000); // 12 hours
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    }
  }

  private async refreshSession(): Promise<void> {
    if (!this.sessionToken || (this.sessionExpiry && Date.now() >= this.sessionExpiry)) {
      const success = await this.authenticate();
      if (!success) {
        throw new AuthenticationError('Failed to refresh session');
      }
    }
  }

  async getLiveStreams(category_id?: string, signal?: AbortSignal): Promise<XtreamStream[]> {
    const cacheKey = `streams_${category_id || 'all'}`;
    const cached = this.cacheGet<XtreamStream[]>(cacheKey);
    if (cached) return cached;

    const pendingKey = `pending_${cacheKey}`;
    const pendingRequest = this.pendingRequests.get(pendingKey);
    if (pendingRequest) return pendingRequest;

    const url = new URL(`${this.config.baseUrl}/player_api.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    url.searchParams.append('action', 'get_live_streams');
    if (category_id) {
      url.searchParams.append('category_id', category_id);
    }

    const request = this.fetchWithRetry<XtreamStream[]>(url.toString(), { signal })
      .then(data => {
        this.cacheSet(cacheKey, data, this.CACHE_DURATION.streams);
        this.pendingRequests.delete(pendingKey);
        return data;
      })
      .catch(error => {
        this.pendingRequests.delete(pendingKey);
        throw error;
      });

    this.pendingRequests.set(pendingKey, request);
    return request;
  }

  async getLiveCategories(): Promise<XtreamCategory[]> {
    const url = new URL(`${this.config.baseUrl}/player_api.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    url.searchParams.append('action', 'get_live_categories');
    return this.fetchWithRetry<XtreamCategory[]>(url.toString());
  }

  async getVODCategories(): Promise<XtreamCategory[]> {
    const url = new URL(`${this.config.baseUrl}/player_api.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    url.searchParams.append('action', 'get_vod_categories');
    return this.fetchWithRetry<XtreamCategory[]>(url.toString());
  }

  async getVODStreams(category_id?: string): Promise<XtreamVODStream[]> {
    const url = new URL(`${this.config.baseUrl}/player_api.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    url.searchParams.append('action', 'get_vod_streams');
    if (category_id) {
      url.searchParams.append('category_id', category_id);
    }
    return this.fetchWithRetry<XtreamVODStream[]>(url.toString());
  }

  async getMovieInfo(movie_id: string | number): Promise<XtreamMovieInfo> {
    const cacheKey = `movie_${movie_id}`;
    const cached = this.cacheGet<XtreamMovieInfo>(cacheKey);
    if (cached) return cached;

    const url = new URL(`${this.config.baseUrl}/player_api.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    url.searchParams.append('action', 'get_movie_info');
    url.searchParams.append('movie_id', movie_id.toString());

    const data = await this.fetchWithRetry<XtreamMovieInfo>(url.toString());
    this.cacheSet(cacheKey, data, this.CACHE_DURATION.movieInfo);
    return data;
  }

  async getSeriesCategories(): Promise<XtreamCategory[]> {
    const url = new URL(`${this.config.baseUrl}/player_api.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    url.searchParams.append('action', 'get_series_categories');
    return this.fetchWithRetry<XtreamCategory[]>(url.toString());
  }

  getSeriesStreamUrl(series_id: string | number): string {
    return `${this.config.baseUrl}/series/${this.config.username}/${this.config.password}/${series_id}`;
  }

  async getFullEPG(channelIds?: string[]): Promise<EPGData> {
    const cacheKey = `full_epg_${channelIds?.join('_') || 'all'}`;
    const cached = this.cacheGet<EPGData>(cacheKey);
    if (cached) return cached;

    const url = new URL(`${this.config.baseUrl}/xmltv.php`);
    url.searchParams.append('username', this.config.username);
    url.searchParams.append('password', this.config.password);
    if (channelIds?.length) {
      url.searchParams.append('channel_id', channelIds.join(','));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new ConnectionError(`Failed to fetch EPG data: ${response.status}`);
    }

    const xmlText = await response.text();
    const epgData = this.epgParser.parse(xmlText);
    
    this.cacheSet(cacheKey, epgData, this.CACHE_DURATION.fullEpg);
    return epgData;
  }

  async getCurrentAndNextPrograms(channelId: string): Promise<{
    current?: EPGProgram;
    next?: EPGProgram;
  }> {
    const epgData = await this.getFullEPG([channelId]);
    return this.epgParser.getCurrentAndNextPrograms(channelId, epgData);
  }

  async getUpcomingPrograms(channelId: string, hours: number = 24): Promise<EPGProgram[]> {
    const epgData = await this.getFullEPG([channelId]);
    return this.epgParser.getUpcomingPrograms(channelId, epgData, hours);
  }

  async addToFavorites(type: 'live' | 'movie' | 'series', id: string): Promise<void> {
    await this.db.saveFavorite(type, id);
  }

  async removeFromFavorites(type: 'live' | 'movie' | 'series', id: string): Promise<void> {
    await this.db.removeFavorite(type, id);
  }

  async getFavorites(type: 'live' | 'movie' | 'series'): Promise<string[]> {
    return await this.db.getFavorites(type);
  }

  async saveWatchProgress(type: 'movie' | 'series', id: string, position: number, duration: number): Promise<void> {
    await this.db.saveProgress(type, id, position, duration);
  }

  async getWatchProgress(type: 'movie' | 'series', id: string): Promise<number> {
    return await this.db.getProgress(type, id);
  }
}

const xtreamService = new XtreamService({
  baseUrl: process.env.XTREAM_BASE_URL || '',
  username: process.env.XTREAM_USERNAME || '',
  password: process.env.XTREAM_PASSWORD || ''
});

export default xtreamService;