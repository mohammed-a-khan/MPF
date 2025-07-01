// src/core/logging/ConsoleLogger.ts

import { LogLevel, LogLevelManager, shouldLogDebug, shouldLogInfo } from './LogLevel';

export class ConsoleLogger {
    private static instance: ConsoleLogger;
    private logManager: LogLevelManager;

    private constructor() {
        this.logManager = LogLevelManager.getInstance();
    }

    public static getInstance(): ConsoleLogger {
        if (!this.instance) {
            this.instance = new ConsoleLogger();
        }
        return this.instance;
    }

    public debug(...args: any[]): void {
        if (this.logManager.shouldLogDebug()) {
            console.log(...args);
        }
    }

    public info(...args: any[]): void {
        if (this.logManager.shouldLogInfo()) {
            console.log(...args);
        }
    }

    public warn(...args: any[]): void {
        if (this.logManager.shouldLogWarn()) {
            console.warn(...args);
        }
    }

    public error(...args: any[]): void {
        if (this.logManager.shouldLogError()) {
            console.error(...args);
        }
    }

    public log(...args: any[]): void {
        this.info(...args);
    }

    public debugOnly(message: string, ...args: any[]): void {
        if (this.logManager.isDebugEnabled()) {
            console.log(`🔍 DEBUG: ${message}`, ...args);
        }
    }

    public verboseOnly(message: string, ...args: any[]): void {
        if (this.logManager.getLogLevel() >= LogLevel.VERBOSE) {
            console.log(`📝 VERBOSE: ${message}`, ...args);
        }
    }
}

export const logger = ConsoleLogger.getInstance();

export function replaceConsoleLog(): void {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
        const firstArg = args[0];
        if (typeof firstArg === 'string') {
            if (firstArg.includes('DEBUG') || firstArg.includes('🔍')) {
                if (shouldLogDebug()) {
                    originalLog(...args);
                }
                return;
            }

            if (firstArg.includes('Step Registry') || 
                firstArg.includes('Loading step') ||
                firstArg.includes('Registered step') ||
                firstArg.includes('Class instance') ||
                firstArg.includes('Method metadata') ||
                firstArg.includes('Decorator called') ||
                firstArg.includes('Creating instance')) {
                if (shouldLogDebug()) {
                    originalLog(...args);
                }
                return;
            }

            if (firstArg.includes('✅') || 
                firstArg.includes('❌') ||
                firstArg.includes('⚠️') ||
                firstArg.includes('🚀') ||
                firstArg.includes('📊') ||
                firstArg.includes('🎉')) {
                originalLog(...args);
                return;
            }
        }

        if (shouldLogInfo()) {
            originalLog(...args);
        }
    };

    console.warn = (...args: any[]) => {
        if (LogLevelManager.getInstance().shouldLogWarn()) {
            originalWarn(...args);
        }
    };

    console.error = (...args: any[]) => {
        if (LogLevelManager.getInstance().shouldLogError()) {
            originalError(...args);
        }
    };
}

replaceConsoleLog();
