export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    size?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    priority?: 'Low' | 'Medium' | 'High';
}

export interface CookieOptions {
    url?: string;
    domain?: string;
    path?: string;
}

export interface CookieFilter {
    name?: string | RegExp;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    expired?: boolean;
}

export interface StorageSnapshot {
    cookies: Cookie[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    indexedDB?: IndexedDBData;
    origin: string;
    timestamp: Date;
}

export interface StorageExport {
    version: string;
    timestamp: Date;
    snapshots: StorageSnapshot[];
    metadata?: {
        pagesCount: number;
        includesIndexedDB: boolean;
        [key: string]: any;
    };
}

export interface StorageSize {
    cookies: number;
    localStorage: number;
    sessionStorage: number;
    indexedDB?: number;
    total: number;
}

export interface StorageQuota {
    usage: number;
    quota: number;
    usageDetails?: {
        localStorage?: number;
        sessionStorage?: number;
        indexedDB?: number;
        caches?: number;
        serviceWorkerRegistrations?: number;
        [key: string]: number | undefined;
    };
}

export interface IndexedDBData {
    databases: Array<{
        name: string;
        version: number;
        stores: Array<{
            name: string;
            keyPath: string | string[] | null;
            autoIncrement: boolean;
            indexes: Array<{
                name: string;
                keyPath: string | string[];
                unique: boolean;
                multiEntry: boolean;
            }>;
            data: any[];
        }>;
    }>;
}

export interface StorageOptions {
    autoBackup?: boolean;
    backupInterval?: number;
    maxBackups?: number;
    compressBackups?: boolean;
    includeIndexedDB?: boolean;
    monitorChanges?: boolean;
}

export interface StorageItemInfo {
    key: string;
    value: string;
    size: number;
    type: 'string' | 'json' | 'number' | 'boolean';
    lastModified: Date;
}

export interface StorageChangeEvent {
    type: 'localStorage' | 'sessionStorage' | 'cookie';
    action: 'set' | 'remove' | 'clear';
    key?: string;
    oldValue?: string | null;
    newValue?: string | null;
    timestamp: Date;
    origin?: string;
}

export interface StorageMonitorOptions {
    includeLocalStorage?: boolean;
    includeSessionStorage?: boolean;
    includeCookies?: boolean;
    throttleInterval?: number;
}

export interface StorageMigration {
    fromVersion: string;
    toVersion: string;
    migrate: (data: StorageExport) => StorageExport | Promise<StorageExport>;
}

export interface StorageEncryptionOptions {
    enabled: boolean;
    algorithm?: string;
    key?: string;
    excludeKeys?: string[];
}

export interface StorageSyncOptions {
    enabled: boolean;
    syncInterval?: number;
    syncUrl?: string;
    syncOnChange?: boolean;
}

export interface StorageValidation {
    maxKeyLength?: number;
    maxValueLength?: number;
    allowedKeys?: string[] | RegExp;
    forbiddenKeys?: string[] | RegExp;
    validateValue?: (value: any) => boolean;
}

export interface StorageStats {
    totalItems: number;
    totalSize: number;
    averageItemSize: number;
    largestItem: {
        key: string;
        size: number;
    } | null;
    oldestItem: {
        key: string;
        age: number;
    } | null;
    typeBreakdown: {
        string: number;
        json: number;
        number: number;
        boolean: number;
    };
}

export interface StorageCleanupOptions {
    maxAge?: number;
    maxSize?: number;
    excludeKeys?: string[] | RegExp;
    dryRun?: boolean;
}

export interface StorageDiff {
    added: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
    removed: Record<string, any>;
    unchanged: Record<string, any>;
}

export interface StorageMergeOptions {
    strategy: 'overwrite' | 'merge' | 'keep-existing';
    conflictResolver?: (key: string, existing: any, incoming: any) => any;
}

export interface CookieJar {
    version: string;
    cookies: Cookie[];
    metadata?: {
        exportDate: Date;
        source: string;
        [key: string]: any;
    };
}

export interface StorageOperationResult {
    success: boolean;
    operation: string;
    details?: any;
    error?: string;
    timestamp: Date;
}

export interface StorageHealthCheck {
    healthy: boolean;
    issues: Array<{
        type: 'quota' | 'corruption' | 'permission' | 'other';
        severity: 'low' | 'medium' | 'high';
        message: string;
        details?: any;
    }>;
    recommendations: string[];
}

export const STORAGE_LIMITS = {
    COOKIE_MAX_SIZE: 4096,
    COOKIE_MAX_COUNT: 180,
    LOCAL_STORAGE_MAX_SIZE: 5 * 1024 * 1024,
    SESSION_STORAGE_MAX_SIZE: 5 * 1024 * 1024,
    INDEXED_DB_MAX_SIZE: -1,
    COOKIE_NAME_VALUE_MAX_SIZE: 4093,
    MAX_KEY_LENGTH: 1024,
};
