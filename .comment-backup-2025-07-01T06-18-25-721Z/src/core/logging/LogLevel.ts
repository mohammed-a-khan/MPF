// src/core/logging/LogLevel.ts

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    VERBOSE = 4
}

export class LogLevelManager {
    private static instance: LogLevelManager;
    private currentLevel: LogLevel = LogLevel.INFO;
    private debugEnabled: boolean = false;

    private constructor() {
        // Set initial log level from environment
        const envLogLevel = process.env.LOG_LEVEL || process.env.log_level;
        if (envLogLevel) {
            this.setLogLevel(envLogLevel);
        }

        // Check if debug mode is enabled
        this.debugEnabled = process.env.DEBUG === 'true' || 
                           process.env.DEBUG_MODE === 'true' ||
                           process.argv.includes('--debug');
    }

    public static getInstance(): LogLevelManager {
        if (!this.instance) {
            this.instance = new LogLevelManager();
        }
        return this.instance;
    }

    public setLogLevel(level: string | LogLevel): void {
        if (typeof level === 'string') {
            switch (level.toLowerCase()) {
                case 'error':
                    this.currentLevel = LogLevel.ERROR;
                    break;
                case 'warn':
                case 'warning':
                    this.currentLevel = LogLevel.WARN;
                    break;
                case 'info':
                    this.currentLevel = LogLevel.INFO;
                    break;
                case 'debug':
                    this.currentLevel = LogLevel.DEBUG;
                    break;
                case 'verbose':
                case 'trace':
                    this.currentLevel = LogLevel.VERBOSE;
                    break;
                default:
                    this.currentLevel = LogLevel.INFO;
            }
        } else {
            this.currentLevel = level;
        }
    }

    public getLogLevel(): LogLevel {
        return this.currentLevel;
    }

    public isDebugEnabled(): boolean {
        return this.debugEnabled || this.currentLevel >= LogLevel.DEBUG;
    }

    public shouldLog(level: LogLevel): boolean {
        return level <= this.currentLevel;
    }

    public shouldLogDebug(): boolean {
        return this.shouldLog(LogLevel.DEBUG);
    }

    public shouldLogInfo(): boolean {
        return this.shouldLog(LogLevel.INFO);
    }

    public shouldLogWarn(): boolean {
        return this.shouldLog(LogLevel.WARN);
    }

    public shouldLogError(): boolean {
        return this.shouldLog(LogLevel.ERROR);
    }
}

// Global helper functions
export function shouldLogDebug(): boolean {
    return LogLevelManager.getInstance().shouldLogDebug();
}

export function shouldLogInfo(): boolean {
    return LogLevelManager.getInstance().shouldLogInfo();
}

export function isDebugMode(): boolean {
    return LogLevelManager.getInstance().isDebugEnabled();
}