import { Page } from 'playwright';
import { CSBasePage } from '../CSBasePage';

export type LoadState = 'load' | 'domcontentloaded' | 'networkidle';

export interface PageCreationOptions {
    useCache?: boolean;
    cacheTTL?: number;
    cacheKey?: string;
    skipInitialization?: boolean;
    waitForReady?: (page: CSBasePage) => Promise<void>;
}

export interface PageCacheEntry {
    instance: CSBasePage;
    createdAt: number;
    lastAccessed: number;
    expiresAt: number | null;
}

export interface PageRegistration {
    name: string;
    pageClass: typeof CSBasePage;
    description: string;
    tags: string[];
    url: string;
    registeredAt: Date;
}

export interface PageRegistryStats {
    totalPages: number;
    totalAliases: number;
    totalTags: number;
    pagesByTag: Record<string, number>;
    registrationTimeline: Array<{
        name: string;
        registeredAt: Date;
    }>;
}

export interface PageState {
    url: string;
    data: Map<string, any>;
    metrics: PageMetrics;
    timestamp: Date;
}

export interface PageMetrics {
    loadTime: number;
    actions: Array<{
        action: string;
        duration: number;
        timestamp: Date;
        details?: any;
    }>;
    errors: Array<{
        error: string;
        stack?: string;
        context?: any;
        timestamp: Date;
    }>;
    screenshots: number;
    apiCalls: number;
    apiCallDetails?: Array<{
        url?: string;
        method?: string;
        status?: number;
        timestamp: Date;
    }>;
    customMetrics: Record<string, Array<{
        value: number;
        timestamp: Date;
    }>>;
    startTime?: number;
    totalActions?: number;
    totalErrors?: number;
    averageActionDuration?: number;
}

export interface ContextData {
    [key: string]: any;
}

export interface ValidationError {
    field: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
    details?: any;
}

export interface WaitOptions {
    timeout?: number;
    state?: 'attached' | 'detached' | 'visible' | 'hidden';
    waitUntil?: LoadState;
}

export interface PopupInfo {
    id: string;
    page: Page;
    openedAt: Date;
    parentPage: Page;
}

export interface PopupOptions {
    autoSwitch?: boolean;
    closeOnNavigation?: boolean;
    trackDialogs?: boolean;
    maxPopups?: number;
}

export interface DialogHandler {
    type: DialogType;
    action: DialogAction;
    text?: string;
    handled?: boolean;
}

export type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';
export type DialogAction = 'accept' | 'dismiss';

export interface FrameTree {
    url: string;
    name: string;
    children: FrameTree[];
    isDetached?: boolean;
}

export interface FrameInfo {
    url: string;
    name: string;
    isDetached: boolean;
    childFrameCount: number;
    parentFrameName: string | null;
    depth: number;
}

export interface NavigationOptions {
    timeout?: number;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    referer?: string;
}

export interface PageEvent {
    type: 'navigation' | 'load' | 'error' | 'console' | 'dialog' | 'download' | 'popup';
    timestamp: Date;
    details: any;
}

export interface PagePerformanceMetrics {
    navigation: {
        loadEventEnd: number;
        loadEventStart: number;
        domContentLoadedEventEnd: number;
        domContentLoadedEventStart: number;
        domInteractive: number;
        domComplete: number;
    };
    timing: {
        connectEnd: number;
        connectStart: number;
        domainLookupEnd: number;
        domainLookupStart: number;
        fetchStart: number;
        requestStart: number;
        responseEnd: number;
        responseStart: number;
    };
    resources: Array<{
        name: string;
        entryType: string;
        startTime: number;
        duration: number;
        size: number;
    }>;
}

export interface PageScreenshotOptions {
    fullPage?: boolean;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    quality?: number;
    type?: 'png' | 'jpeg';
    omitBackground?: boolean;
    animations?: 'disabled' | 'allow';
    caret?: 'hide' | 'initial';
    scale?: 'css' | 'device';
}

export interface PagePDFOptions {
    path?: string;
    scale?: number;
    displayHeaderFooter?: boolean;
    headerTemplate?: string;
    footerTemplate?: string;
    printBackground?: boolean;
    landscape?: boolean;
    pageRanges?: string;
    format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
    width?: string | number;
    height?: string | number;
    margin?: {
        top?: string | number;
        bottom?: string | number;
        left?: string | number;
        right?: string | number;
    };
    preferCSSPageSize?: boolean;
}

export interface PageClickOptions {
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    delay?: number;
    position?: { x: number; y: number };
    modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
    force?: boolean;
    noWaitAfter?: boolean;
    trial?: boolean;
    timeout?: number;
}

export interface PageLifecycle {
    created: Date;
    initialized?: Date;
    navigated?: Date;
    lastInteraction?: Date;
    errors: number;
    reloads: number;
    navigations: number;
}

export interface PageMetadata {
    title?: string;
    description?: string;
    keywords?: string[];
    author?: string;
    viewport?: string;
    charset?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
}

export interface PageAccessibilitySnapshot {
    role: string;
    name: string;
    children?: PageAccessibilitySnapshot[];
    description?: string;
    keyshortcuts?: string;
    roledescription?: string;
    valuetext?: string;
    disabled?: boolean;
    expanded?: boolean;
    focused?: boolean;
    modal?: boolean;
    multiline?: boolean;
    multiselectable?: boolean;
    readonly?: boolean;
    required?: boolean;
    selected?: boolean;
    checked?: boolean | 'mixed';
    pressed?: boolean | 'mixed';
    level?: number;
    valuemin?: number;
    valuemax?: number;
    autocomplete?: string;
    haspopup?: string;
    invalid?: string;
    orientation?: string;
}

export interface PageCoverage {
    js: Array<{
        url: string;
        ranges: Array<{
            start: number;
            end: number;
        }>;
        text: string;
    }>;
    css: Array<{
        url: string;
        ranges: Array<{
            start: number;
            end: number;
        }>;
        text: string;
    }>;
}

export interface PageResource {
    url: string;
    type: 'document' | 'stylesheet' | 'image' | 'media' | 'font' | 'script' | 'texttrack' | 'xhr' | 'fetch' | 'eventsource' | 'websocket' | 'manifest' | 'other';
    method: string;
    status: number;
    size: number;
    duration: number;
    fromCache: boolean;
    fromServiceWorker: boolean;
}
