export class XtreamError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'XtreamError';
    }
}

export class AuthenticationError extends XtreamError {
    constructor(message: string = 'Authentication failed. Please check your credentials.') {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class ConnectionError extends XtreamError {
    constructor(message: string = 'Failed to connect to the server. Please check your internet connection.') {
        super(message);
        this.name = 'ConnectionError';
    }
}

export class StreamError extends XtreamError {
    constructor(message: string = 'Failed to load stream. Please try again.') {
        super(message);
        this.name = 'StreamError';
    }
}

export class EPGError extends XtreamError {
    constructor(message: string = 'Failed to load program guide data.') {
        super(message);
        this.name = 'EPGError';
    }
}

export class CategoryError extends XtreamError {
    constructor(message: string = 'Failed to load categories.') {
        super(message);
        this.name = 'CategoryError';
    }
}

export class ContentError extends XtreamError {
    constructor(message: string = 'Failed to load content data.') {
        super(message);
        this.name = 'ContentError';
    }
}

export class SessionError extends XtreamError {
    constructor(message: string = 'Session expired. Please authenticate again.') {
        super(message);
        this.name = 'SessionError';
    }
}

export class ParserError extends XtreamError {
    constructor(message: string = 'Failed to parse server response.') {
        super(message);
        this.name = 'ParserError';
    }
}