// Cookie types
export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;  // Unix timestamp in seconds, -1 for session cookie
    size?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    priority?: 'Low' | 'Medium' | 'High';
}

// Cookie options for operations
export interface CookieOptions {
    url?: string;
    domain?: string;
    path?: string;
}

// Cookie filter for searching
export interface CookieFilter {
    name?: string | RegExp;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    expired?: boolean;
}

// Storage snapshot for backup/restore
export interface StorageSnapshot {
    cookies: Cookie[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    indexedDB?: IndexedDBData;
    origin: string;
    timestamp: Date;
}

// Storage export format
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

// Storage size information
export interface StorageSize {
    cookies: number;
    localStorage: number;
    sessionStorage: number;
    indexedDB?: number;
    total: number;
}

// Storage quota information
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

// IndexedDB data structure
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

// Storage manager options
export interface StorageOptions {
    autoBackup?: boolean;
    backupInterval?: number;  // milliseconds
    maxBackups?: number;
    compressBackups?: boolean;
    includeIndexedDB?: boolean;
    monitorChanges?: boolean;
}

// Storage item information
export interface StorageItemInfo {
    key: string;
    value: string;
    size: number;
    type: 'string' | 'json' | 'number' | 'boolean';
    lastModified: Date;
}

// Storage change event
export interface StorageChangeEvent {
    type: 'localStorage' | 'sessionStorage' | 'cookie';
    action: 'set' | 'remove' | 'clear';
    key?: string;
    oldValue?: string | null;
    newValue?: string | null;
    timestamp: Date;
    origin?: string;
}

// Storage monitoring options
export interface StorageMonitorOptions {
    includeLocalStorage?: boolean;
    includeSessionStorage?: boolean;
    includeCookies?: boolean;
    throttleInterval?: number;  // milliseconds
}

// Storage migration
export interface StorageMigration {
    fromVersion: string;
    toVersion: string;
    migrate: (data: StorageExport) => StorageExport | Promise<StorageExport>;
}

// Storage encryption options
export interface StorageEncryptionOptions {
    enabled: boolean;
    algorithm?: string;
    key?: string;
    excludeKeys?: string[];  // Keys to exclude from encryption
}

// Storage sync options
export interface StorageSyncOptions {
    enabled: boolean;
    syncInterval?: number;  // milliseconds
    syncUrl?: string;
    syncOnChange?: boolean;
}

// Storage validation
export interface StorageValidation {
    maxKeyLength?: number;
    maxValueLength?: number;
    allowedKeys?: string[] | RegExp;
    forbiddenKeys?: string[] | RegExp;
    validateValue?: (value: any) => boolean;
}

// Storage statistics
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
        age: number;  // milliseconds
    } | null;
    typeBreakdown: {
        string: number;
        json: number;
        number: number;
        boolean: number;
    };
}

// Storage cleanup options
export interface StorageCleanupOptions {
    maxAge?: number;  // milliseconds
    maxSize?: number;  // bytes
    excludeKeys?: string[] | RegExp;
    dryRun?: boolean;
}

// Storage diff result
export interface StorageDiff {
    added: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
    removed: Record<string, any>;
    unchanged: Record<string, any>;
}

// Storage merge options
export interface StorageMergeOptions {
    strategy: 'overwrite' | 'merge' | 'keep-existing';
    conflictResolver?: (key: string, existing: any, incoming: any) => any;
}

// Cookie jar for import/export
export interface CookieJar {
    version: string;
    cookies: Cookie[];
    metadata?: {
        exportDate: Date;
        source: string;
        [key: string]: any;
    };
}

// Storage operation result
export interface StorageOperationResult {
    success: boolean;
    operation: string;
    details?: any;
    error?: string;
    timestamp: Date;
}

// Storage health check
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

// Browser storage limits
export const STORAGE_LIMITS = {
    COOKIE_MAX_SIZE: 4096,  // 4KB per cookie
    COOKIE_MAX_COUNT: 180,  // Typical browser limit
    LOCAL_STORAGE_MAX_SIZE: 5 * 1024 * 1024,  // 5MB typical
    SESSION_STORAGE_MAX_SIZE: 5 * 1024 * 1024,  // 5MB typical
    INDEXED_DB_MAX_SIZE: -1,  // Browser dependent, usually 50% of free disk
    COOKIE_NAME_VALUE_MAX_SIZE: 4093,  // Name + value combined
    MAX_KEY_LENGTH: 1024,  // Reasonable limit for keys
};