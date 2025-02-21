import { XMLParser } from 'fast-xml-parser';

interface EPGProgram {
    start: string;
    stop: string;
    channel: string;
    title: string;
    desc?: string;
    category?: string;
    rating?: string;
    icon?: string;
    episodeNum?: string;
    language?: string;
    subTitle?: string;
    date?: string;
}

interface EPGChannel {
    id: string;
    displayName: string;
    icon?: string;
    language?: string;
}

interface EPGData {
    channels: {
        [channelId: string]: EPGChannel;
    };
    programs: {
        [channelId: string]: EPGProgram[];
    };
}

export class ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ParseError';
    }
}

export class EPGParser {
    private parser: XMLParser;
    private static DATE_FORMATS = [
        'YYYYMMDDHHmmss Z',
        'YYYYMMDDHHMMSS',
        'YYYY-MM-DD HH:mm:ss'
    ];

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            parseAttributeValue: true,
            trimValues: true,
            parseTagValue: true,
            allowBooleanAttributes: true
        });
    }

    parse(xmlData: string): EPGData {
        try {
            const result = this.parser.parse(xmlData);
            if (!result.tv) {
                throw new ParseError('Invalid EPG XML: missing tv element');
            }

            const tv = result.tv;
            const epgData: EPGData = {
                channels: {},
                programs: {}
            };

            // Parse channels
            if (Array.isArray(tv.channel)) {
                tv.channel.forEach((channel: any) => {
                    try {
                        const channelId = channel['@_id'];
                        if (!channelId) {
                            throw new ParseError('Channel missing ID attribute');
                        }

                        epgData.channels[channelId] = {
                            id: channelId,
                            displayName: this.extractTextContent(channel['display-name']),
                            icon: channel.icon ? channel.icon['@_src'] : undefined,
                            language: channel['@_lang']
                        };
                        epgData.programs[channelId] = [];
                    } catch (error) {
                        console.error('Error parsing channel:', error);
                    }
                });
            }

            // Parse programs
            if (Array.isArray(tv.programme)) {
                tv.programme.forEach((programme: any) => {
                    try {
                        const channelId = programme['@_channel'];
                        if (!channelId || !epgData.channels[channelId]) {
                            return; // Skip invalid programs
                        }

                        if (!epgData.programs[channelId]) {
                            epgData.programs[channelId] = [];
                        }

                        const program: EPGProgram = {
                            start: this.normalizeDate(programme['@_start']),
                            stop: this.normalizeDate(programme['@_stop']),
                            channel: channelId,
                            title: this.extractTextContent(programme.title),
                            desc: this.extractTextContent(programme.desc),
                            category: this.extractTextContent(programme.category),
                            rating: programme.rating ? 
                                this.extractTextContent(programme.rating.value) : undefined,
                            icon: programme.icon ? programme.icon['@_src'] : undefined,
                            episodeNum: this.extractTextContent(programme['episode-num']),
                            language: programme['@_lang'],
                            subTitle: this.extractTextContent(programme['sub-title']),
                            date: programme.date ? this.extractTextContent(programme.date) : undefined
                        };

                        epgData.programs[channelId].push(program);
                    } catch (error) {
                        console.error('Error parsing program:', error);
                    }
                });
            }

            // Sort and optimize programs
            Object.keys(epgData.programs).forEach(channelId => {
                epgData.programs[channelId].sort((a, b) => 
                    new Date(a.start).getTime() - new Date(b.start).getTime()
                );
                
                // Remove past programs older than 1 hour
                const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
                epgData.programs[channelId] = epgData.programs[channelId].filter(
                    program => program.stop >= oneHourAgo
                );
            });

            return epgData;
        } catch (error) {
            throw new ParseError(
                `Failed to parse EPG XML: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private extractTextContent(element: any): string {
        if (!element) return '';
        if (Array.isArray(element)) {
            return element[0]?.['#text'] || element[0] || '';
        }
        return element['#text'] || element || '';
    }

    private normalizeDate(dateStr: string): string {
        try {
            // Handle XMLTV date format (YYYYMMDDHHMMSS +0000)
            if (dateStr.length >= 14) {
                const year = dateStr.slice(0, 4);
                const month = dateStr.slice(4, 6);
                const day = dateStr.slice(6, 8);
                const hour = dateStr.slice(8, 10);
                const minute = dateStr.slice(10, 12);
                const second = dateStr.slice(12, 14);
                const timezone = dateStr.slice(14).trim() || '+0000';
                
                return `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone.replace(' ', '')}`;
            }
            return dateStr;
        } catch (error) {
            console.error('Error normalizing date:', dateStr, error);
            return dateStr;
        }
    }

    formatDateTime(date: string): string {
        try {
            return new Date(date).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date:', date, error);
            return date;
        }
    }

    getCurrentAndNextPrograms(channelId: string, epgData: EPGData): {
        current?: EPGProgram;
        next?: EPGProgram;
    } {
        try {
            const now = new Date().toISOString();
            const programs = epgData.programs[channelId];
            
            if (!programs?.length) {
                return {};
            }

            const current = programs.find(program => 
                program.start <= now && program.stop > now
            );

            if (!current) {
                return {};
            }

            const currentIndex = programs.indexOf(current);
            const next = currentIndex < programs.length - 1 ? 
                programs[currentIndex + 1] : undefined;

            return { current, next };
        } catch (error) {
            console.error('Error getting current/next programs:', error);
            return {};
        }
    }

    getUpcomingPrograms(channelId: string, epgData: EPGData, hours: number = 24): EPGProgram[] {
        try {
            const now = new Date();
            const endTime = new Date(now.getTime() + (hours * 3600000)).toISOString();
            const programs = epgData.programs[channelId];

            if (!programs?.length) {
                return [];
            }

            return programs.filter(program => 
                program.start >= now.toISOString() && program.start < endTime
            );
        } catch (error) {
            console.error('Error getting upcoming programs:', error);
            return [];
        }
    }
}

export const epgParser = new EPGParser();