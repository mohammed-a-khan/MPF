// src/data/types/data.types.ts

export interface TestData extends Record<string, any> {
    id?: string | number;
    name?: string;
    description?: string;
    
    ExecutionFlag?: ExecutionFlag;
    Priority?: number;
    Environment?: string;
    Tags?: string[];
    
    __dbId?: string | number;
    __tableName?: string;
    __connectionName?: string;
    __cleanupQuery?: string;
    __cleanupParams?: any[];
    __apiEndpoint?: string;
    __resourceUrl?: string;
    __resourceId?: string | number;
    __apiHeaders?: Record<string, string>;
    __createdFiles?: string[];
    __uploadedFiles?: string[];
    __createdDirectories?: string[];
    __cacheKeys?: string[];
    __cachePattern?: string;
    __redisKeys?: string[];
    __redisPattern?: string;
    __redisConnection?: {
        host: string;
        port: number;
        password?: string;
    };
    __cleanupHandler?: (task: CleanupTask) => Promise<void>;
    __cleanupPriority?: number;
}

export type ExecutionFlag = 'Y' | 'N' | 'S';

export type DataSource = 'excel' | 'csv' | 'json' | 'xml' | 'database' | 'file';

export interface DataProviderOptions {
    source?: string;
    type?: DataSource;
    tagValue?: string;
    
    scenarioName?: string;
    featurePath?: string;
    
    sheet?: string;
    range?: string;
    headers?: boolean;
    skipRows?: number;
    
    connection?: string;
    table?: string;
    query?: string;
    params?: any[];
    
    jsonPath?: string;
    xmlPath?: string;
    namespace?: Record<string, string>;
    
    filter?: Record<string, any>;
    where?: string;
    having?: string;
    
    executionFlagColumn?: string;
    skipExecutionFlag?: boolean;
    environment?: string;
    
    transformations?: DataTransformation[];
    interpolateVariables?: boolean;
    variables?: Record<string, any>;
    
    mergeSources?: Array<{
        source: string;
        type: DataSource;
        mergeOptions?: MergeOptions;
    }>;
    
    schemaPath?: string;
    requiredFields?: string[];
    uniqueFields?: string[];
    validations?: DataValidation[];
    
    streaming?: boolean;
    batchSize?: number;
    maxRecords?: number;
    
    cacheKey?: string;
    cacheTTL?: number;
    skipCache?: boolean;
}

export interface DataProviderConfig {
    cacheEnabled: boolean;
    cacheTTL: number;
    defaultDataPath: string;
    streamingThreshold: number;
    maxRetries: number;
    retryDelay: number;
    variablePrefix: string;
    variableSuffix: string;
    executionFlagColumn: string;
    defaultExecutionFlag: ExecutionFlag;
}

export interface DataProviderResult {
    data: TestData[];
    metadata?: {
        totalRecords: number;
        filteredRecords?: number;
        loadTime?: number;
        source?: string;
        cacheHit?: boolean;
        [key: string]: any;
    };
}

export interface DataHandler {
    load(options: DataProviderOptions): Promise<DataProviderResult>;
    validate?(data: TestData[]): Promise<ValidationResult>;
    transform?(data: TestData[], transformations: DataTransformation[]): Promise<TestData[]>;
    stream?(options: DataProviderOptions): AsyncIterableIterator<TestData>;
    loadPartial?(options: DataProviderOptions, offset: number, limit: number): Promise<DataProviderResult>;
    loadSchema?(options: DataProviderOptions): Promise<any>;
    getMetadata?(options: DataProviderOptions): Promise<Record<string, any>>;
}

export interface DataTransformation {
    type: 'map' | 'filter' | 'reduce' | 'sort' | 'group' | 'pivot' | 'custom';
    field?: string;
    operation?: string;
    value?: any;
    expression?: string;
    function?: (data: TestData) => any;
    options?: Record<string, any>;
}

export interface DataValidation {
    field: string;
    type: 'required' | 'unique' | 'format' | 'range' | 'custom';
    value?: any;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
    validator?: (value: any, record: TestData) => boolean;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
    details?: Array<{
        row?: number;
        field?: string;
        value?: any;
        error: string;
    }>;
}

export interface MergeOptions {
    strategy: 'append' | 'merge' | 'replace' | 'join';
    key?: string | string[];
    keepOriginal?: boolean;
    resolveConflicts?: 'original' | 'new' | 'custom';
    conflictResolver?: (original: TestData, updated: TestData) => TestData;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    lastAccessed: number;
    accessCount: number;
    size?: number;
}

export interface CacheStatistics {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    totalSize: number;
    oldestEntry: { key: string; age: number } | null;
    newestEntry: { key: string; age: number } | null;
    mostAccessed: { key: string; count: number } | null;
}

export interface IteratorOptions {
    batchSize?: number;
    shuffle?: boolean;
    loop?: boolean;
    filter?: (item: TestData) => boolean;
    skip?: number;
    take?: number;
    parallel?: boolean;
    onBeforeIteration?: (item: TestData, index: number, state: IteratorState) => void;
    onAfterIteration?: (item: TestData, index: number, state: IteratorState) => void;
    onError?: (error: any, item: TestData, state: IteratorState) => void;
}

export interface IteratorState {
    totalItems: number;
    currentIndex: number;
    iterationCount: number;
    batchCount: number;
    errors: Array<{
        message: string;
        item: TestData;
        index: number;
        timestamp: Date;
    }>;
    startTime: number;
    progress?: number;
    remainingItems?: number;
    elapsedTime?: number;
}

export type CleanupStrategy = 'database' | 'api' | 'file' | 'cache' | 'custom';

export interface CleanupTask {
    id: string;
    type: CleanupStrategy;
    target: string;
    data: any;
    priority?: number;
    created: Date;
    executed?: boolean;
    executedAt?: Date;
    error?: Error;
    rollback?: () => Promise<void>;
}

export interface CleanupStatistics {
    pendingTasks: number;
    executedTasks: number;
    failedTasks: number;
    pendingByType: Record<CleanupStrategy, number>;
    executedByType: Record<CleanupStrategy, number>;
    failedByType: Record<CleanupStrategy, number>;
    dataIds: string[];
    autoCleanupEnabled: boolean;
}

export interface ExecutionFlagOptions {
    columnName: string;
    environment: string;
    defaultFlag: ExecutionFlag;
    skipEmptyFlag?: boolean;
    treatSAsSkip?: boolean;
}

export interface DataSchema {
    version?: string;
    fields: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
        required?: boolean;
        unique?: boolean;
        format?: string;
        pattern?: string;
        enum?: any[];
        min?: number;
        max?: number;
        minLength?: number;
        maxLength?: number;
        default?: any;
        transform?: string;
        validate?: string;
    }>;
    constraints?: Array<{
        type: 'unique' | 'composite' | 'foreign' | 'check';
        fields: string[];
        reference?: string;
        condition?: string;
    }>;
}

export interface ParserOptions {
    encoding?: string;
    skipEmptyRows?: boolean;
    trimValues?: boolean;
    
    sheetName?: string;
    sheetIndex?: number;
    range?: string;
    headerRow?: number;
    formulaValues?: boolean;
    
    delimiter?: string;
    quote?: string;
    escape?: string;
    headers?: boolean | string[];
    skipRows?: number;
    maxRows?: number;
    
    jsonPath?: string;
    
    xmlPath?: string;
    namespaces?: Record<string, string>;
    attributePrefix?: string;
    textNodeName?: string;
    ignoreAttributes?: boolean;
}

export interface StreamOptions extends ParserOptions {
    highWaterMark?: number;
    batchSize?: number;
    onBatch?: (batch: TestData[]) => Promise<void>;
    onError?: (error: Error) => void;
    onEnd?: () => void;
}

export interface TypeConversionOptions {
    dateFormat?: string;
    numberFormat?: string;
    booleanTrueValues?: string[];
    booleanFalseValues?: string[];
    nullValues?: string[];
    trimStrings?: boolean;
    emptyStringAsNull?: boolean;
    parseNumbers?: boolean;
    parseDates?: boolean;
    parseBooleans?: boolean;
}

export interface InterpolationContext extends Record<string, any> {
    env: Record<string, string>;
    random: {
        uuid: () => string;
        number: (min?: number, max?: number) => number;
        string: (length?: number) => string;
        email: () => string;
        phone: () => string;
        date: (format?: string) => string;
    };
    date: {
        now: (format?: string) => string;
        today: (format?: string) => string;
        tomorrow: (format?: string) => string;
        yesterday: (format?: string) => string;
        addDays: (days: number, format?: string) => string;
    };
    scenario: {
        name: string;
        tags: string[];
        feature: string;
        line: number;
    };
}

export interface HandlerRegistration {
    type: string;
    handler: new() => DataHandler;
    description?: string;
    supportedExtensions?: string[];
    capabilities?: string[];
}
