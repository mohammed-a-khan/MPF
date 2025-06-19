import { Page, WebSocket } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { 
    WebSocketState, 
    Message, 
    MessageMatcher,
    JSONMatcher,
    WebSocketConnection,
    WebSocketOptions,
    WebSocketMetrics,
    WebSocketEvent
} from './types/network.types';

/**
 * WebSocketHandler - Complete WebSocket connection management
 * Handles WebSocket connections, messages, and real-time communication
 */
export class WebSocketHandler {
    private page: Page;
    private connections: Map<string, WebSocketConnection> = new Map();
    private messageHistory: Map<string, Message[]> = new Map();
    private eventHistory: Map<string, WebSocketEvent[]> = new Map();
    private messageListeners: Map<string, Set<Function>> = new Map();
    private options: WebSocketOptions;
    private isMonitoring: boolean = false;

    constructor(page: Page, options: WebSocketOptions = {}) {
        this.page = page;
        this.options = {
            autoReconnect: false,
            reconnectInterval: 5000,
            maxReconnectAttempts: 3,
            messageTimeout: 30000,
            logMessages: true,
            maxHistorySize: 1000,
            ...options
        };
    }

    /**
     * Start monitoring WebSocket connections
     */
    async startMonitoring(): Promise<void> {
        if (this.isMonitoring) {
            const logger = Logger.getInstance();
            logger.warn('WebSocketHandler: Already monitoring');
            return;
        }

        // Set up WebSocket event listeners
        this.page.on('websocket', ws => this.handleNewWebSocket(ws));
        
        this.isMonitoring = true;
        
        ActionLogger.logInfo('websocket_monitoring_started', {
            options: this.options
        });
    }

    /**
     * Stop monitoring WebSocket connections
     */
    async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        this.page.removeAllListeners('websocket');
        this.isMonitoring = false;
        
        ActionLogger.logInfo('websocket_monitoring_stopped', {
            activeConnections: this.connections.size
        });
    }

    /**
     * Wait for WebSocket connection
     */
    async waitForWebSocket(url: string, timeout?: number): Promise<WebSocket> {
        const timeoutMs = timeout || this.options.messageTimeout;
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`WebSocket connection timeout: ${url}`));
            }, timeoutMs);

            const checkExisting = () => {
                const connection = this.findConnectionByUrl(url);
                if (connection) {
                    clearTimeout(timer);
                    resolve(connection.websocket);
                    return true;
                }
                return false;
            };

            // Check if already connected
            if (checkExisting()) return;

            // Wait for new connection
            const listener = (ws: WebSocket) => {
                if (ws.url().includes(url)) {
                    clearTimeout(timer);
                    this.page.off('websocket', listener);
                    resolve(ws);
                }
            };

            this.page.on('websocket', listener);
        });
    }

    /**
     * Send message through WebSocket
     */
    async sendMessage(ws: WebSocket, message: string | Buffer): Promise<void> {
        try {
            // Ensure connection is open
            await this.ensureConnected(ws);
            
            // Send message through page evaluation
            await this.page.evaluate(
                ({ url, message }) => {
                    const sockets = Array.from((window as any).__websockets || []) as any[];
                    const socket = sockets.find((s: any) => s.url === url) as any;
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(message);
                    } else {
                        throw new Error('WebSocket not open');
                    }
                },
                { url: ws.url(), message: typeof message === 'string' ? message : message.toString('base64') }
            );
            
            // Record message
            this.recordMessage(ws.url(), {
                type: 'sent',
                data: message,
                timestamp: new Date()
            });
            
            ActionLogger.logInfo('websocket_message_sent', {
                type: 'sent',
                url: ws.url(),
                size: typeof message === 'string' ? message.length : message.length
            });
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('WebSocketHandler: Failed to send message', error as Error);
            throw error;
        }
    }

    /**
     * Send JSON message
     */
    async sendJSON(ws: WebSocket, data: any): Promise<void> {
        const jsonString = JSON.stringify(data);
        await this.sendMessage(ws, jsonString);
    }

    /**
     * Wait for specific message
     */
    async waitForMessage(
        ws: WebSocket, 
        matcher?: MessageMatcher,
        timeout?: number
    ): Promise<string> {
        const timeoutMs = timeout || this.options.messageTimeout;
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                ws.off('framereceived', handler);
                reject(new Error('WebSocket message timeout'));
            }, timeoutMs);

            const handler = (data: any) => {
                const message = data.toString();
                
                if (!matcher || matcher(message)) {
                    clearTimeout(timer);
                    ws.off('framereceived', handler);
                    resolve(message);
                }
            };

            ws.on('framereceived', handler);
        });
    }

    /**
     * Wait for JSON message
     */
    async waitForJSON(
        ws: WebSocket, 
        matcher?: JSONMatcher,
        timeout?: number
    ): Promise<any> {
        const message = await this.waitForMessage(ws, (msg) => {
            try {
                const json = JSON.parse(msg);
                return !matcher || matcher(json);
            } catch {
                return false;
            }
        }, timeout);

        return JSON.parse(message);
    }

    /**
     * Close WebSocket connection
     */
    async closeWebSocket(
        ws: WebSocket, 
        code?: number, 
        reason?: string
    ): Promise<void> {
        try {
            const connection = this.connections.get(ws.url());
            if (connection) {
                connection.state = 'closing';
            }

            // Close with code and reason if provided
            if (code !== undefined) {
                await this.page.evaluate(
                    ({ url, code, reason }) => {
                        const sockets = Array.from((window as any).__websockets || []) as any[];
                        const socket = sockets.find((s: any) => s.url === url) as any;
                        if (socket && typeof socket.close === 'function') {
                            socket.close(code, reason);
                        }
                    },
                    { url: ws.url(), code, reason }
                );
            } else {
                // Close through page evaluation
                await this.page.evaluate(
                    (url) => {
                        const sockets = Array.from((window as any).__websockets || []) as any[];
                        const socket = sockets.find((s: any) => s.url === url) as any;
                        if (socket && typeof socket.close === 'function') {
                            socket.close();
                        }
                    },
                    ws.url()
                );
            }

            const eventData: WebSocketEvent = {
                type: 'close',
                timestamp: new Date()
            };
            if (code !== undefined) {
                eventData.code = code;
            }
            if (reason !== undefined) {
                eventData.reason = reason;
            }
            this.recordEvent(ws.url(), eventData);

            ActionLogger.logInfo('websocket_event', {
                type: 'close',
                url: ws.url(),
                code,
                reason
            });
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('WebSocketHandler: Failed to close WebSocket', error as Error);
            throw error;
        }
    }

    /**
     * Get WebSocket state
     */
    getWebSocketState(ws: WebSocket): WebSocketState {
        const connection = this.connections.get(ws.url());
        
        if (!connection) {
            return {
                readyState: 'closed',
                bufferedAmount: 0,
                extensions: '',
                protocol: ''
            };
        }

        return {
            readyState: connection.state,
            bufferedAmount: connection.metrics.bufferedAmount,
            extensions: connection.extensions,
            protocol: connection.protocol
        };
    }

    /**
     * Get message history for WebSocket
     */
    getWebSocketMessages(ws: WebSocket): Message[] {
        return this.messageHistory.get(ws.url()) || [];
    }

    /**
     * Clear message history
     */
    clearMessageHistory(ws: WebSocket): void {
        this.messageHistory.delete(ws.url());
        
        ActionLogger.logInfo('websocket_history_cleared', { url: ws.url() });
    }

    /**
     * Simulate disconnect
     */
    async simulateDisconnect(ws: WebSocket): Promise<void> {
        await this.page.evaluate((url) => {
            const sockets = Array.from((window as any).__websockets || []) as any[];
            const socket = sockets.find((s: any) => s.url === url) as any;
            if (socket && typeof socket.close === 'function') {
                // Simulate network disconnect
                socket.close(1006, 'Abnormal Closure');
            }
        }, ws.url());

        this.recordEvent(ws.url(), {
            type: 'disconnect',
            timestamp: new Date(),
            simulated: true
        });
    }

    /**
     * Simulate reconnect
     */
    async simulateReconnect(ws: WebSocket): Promise<WebSocket> {
        const url = ws.url();
        const connection = this.connections.get(url);
        
        if (!connection) {
            throw new Error('WebSocket connection not found');
        }

        // Close existing connection
        await this.simulateDisconnect(ws);
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create new connection
        const newWs = await this.createWebSocket(url, connection.protocols);
        
        this.recordEvent(url, {
            type: 'reconnect',
            timestamp: new Date(),
            simulated: true
        });

        return newWs;
    }

    /**
     * Get all active connections
     */
    getActiveConnections(): WebSocketConnection[] {
        return Array.from(this.connections.values())
            .filter(conn => conn.state === 'open');
    }

    /**
     * Get connection metrics
     */
    getConnectionMetrics(ws: WebSocket): WebSocketMetrics {
        const connection = this.connections.get(ws.url());
        
        if (!connection) {
            throw new Error('WebSocket connection not found');
        }

        return { ...connection.metrics };
    }

    /**
     * Subscribe to messages
     */
    subscribeToMessages(
        ws: WebSocket, 
        callback: (message: Message) => void
    ): () => void {
        const url = ws.url();
        
        if (!this.messageListeners.has(url)) {
            this.messageListeners.set(url, new Set());
        }
        
        this.messageListeners.get(url)!.add(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.messageListeners.get(url);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }

    /**
     * Export connection data
     */
    exportConnectionData(ws: WebSocket): any {
        const connection = this.connections.get(ws.url());
        const messages = this.messageHistory.get(ws.url()) || [];
        const events = this.eventHistory.get(ws.url()) || [];
        
        return {
            url: ws.url(),
            connection: connection ? {
                state: connection.state,
                protocol: connection.protocol,
                extensions: connection.extensions,
                metrics: connection.metrics
            } : null,
            messages: messages.map(msg => ({
                ...msg,
                data: typeof msg.data === 'string' ? msg.data : '<binary>'
            })),
            events
        };
    }

    // Private helper methods

    private handleNewWebSocket(ws: WebSocket): void {
        const url = ws.url();
        
        // Create connection record
        const connection: WebSocketConnection = {
            websocket: ws,
            url,
            state: 'connecting',
            protocol: '',
            extensions: '',
            protocols: [],
            metrics: {
                messagesSent: 0,
                messagesReceived: 0,
                bytesSent: 0,
                bytesReceived: 0,
                errors: 0,
                reconnects: 0,
                bufferedAmount: 0,
                connectionTime: Date.now()
            }
        };

        this.connections.set(url, connection);
        this.setupWebSocketListeners(ws, connection);
        
        ActionLogger.logInfo('websocket_new_connection', { url });
    }

    private setupWebSocketListeners(ws: WebSocket, connection: WebSocketConnection): void {
        // Connection opened
        ws.on('framesent', () => {
            if (connection.state === 'connecting') {
                connection.state = 'open';
                this.recordEvent(ws.url(), {
                    type: 'open',
                    timestamp: new Date()
                });
                ActionLogger.logInfo('websocket_event', {
                    type: 'open',
                    url: ws.url()
                });
            }
        });

        // Message received
        ws.on('framereceived', (data: { payload: string | Buffer }) => {
            const messageData = typeof data.payload === 'string' ? data.payload : data.payload.toString();
            const message: Message = {
                type: 'received',
                data: messageData,
                timestamp: new Date()
            };

            this.recordMessage(ws.url(), message);
            connection.metrics.messagesReceived++;
            connection.metrics.bytesReceived += typeof data.payload === 'string' ? data.payload.length : data.payload.length;

            // Notify listeners
            const listeners = this.messageListeners.get(ws.url());
            if (listeners) {
                listeners.forEach(callback => callback(message));
            }

            if (this.options.logMessages) {
                ActionLogger.logInfo('websocket_message_received', {
                    type: 'received',
                    url: ws.url(),
                    size: typeof data.payload === 'string' ? data.payload.length : data.payload.length
                });
            }
        });

        // Message sent
        ws.on('framesent', (data: { payload: string | Buffer }) => {
            connection.metrics.messagesSent++;
            connection.metrics.bytesSent += typeof data.payload === 'string' ? data.payload.length : data.payload.length;
        });

        // Connection closed
        ws.on('close', () => {
            connection.state = 'closed';
            this.recordEvent(ws.url(), {
                type: 'close',
                timestamp: new Date()
            });

            // Handle auto-reconnect if enabled
            if (this.options.autoReconnect && connection.metrics.reconnects < this.options.maxReconnectAttempts!) {
                this.attemptReconnect(ws.url(), connection);
            }

            ActionLogger.logInfo('websocket_event', {
                type: 'close',
                url: ws.url()
            });
        });

        // Error occurred
        ws.on('socketerror', (error) => {
            connection.metrics.errors++;
            this.recordEvent(ws.url(), {
                type: 'error',
                error: error.toString(),
                timestamp: new Date()
            });

            ActionLogger.logError('websocket_error', error);
        });
    }

    private async ensureConnected(ws: WebSocket): Promise<void> {
        const connection = this.connections.get(ws.url());
        
        if (!connection || connection.state !== 'open') {
            // Wait for connection to open
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WebSocket not connected'));
                }, 5000);

                // Check periodically
                const interval = setInterval(() => {
                    const conn = this.connections.get(ws.url());
                    if (conn && conn.state === 'open') {
                        clearTimeout(timeout);
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });
        }
    }

    private recordMessage(url: string, message: Message): void {
        if (!this.messageHistory.has(url)) {
            this.messageHistory.set(url, []);
        }

        const history = this.messageHistory.get(url)!;
        history.push(message);

        // Limit history size
        if (history.length > this.options.maxHistorySize!) {
            history.shift();
        }
    }

    private recordEvent(url: string, event: WebSocketEvent): void {
        if (!this.eventHistory.has(url)) {
            this.eventHistory.set(url, []);
        }

        const history = this.eventHistory.get(url)!;
        history.push(event);

        // Limit history size
        if (history.length > this.options.maxHistorySize!) {
            history.shift();
        }
    }

    private findConnectionByUrl(url: string): WebSocketConnection | undefined {
        for (const [connUrl, connection] of Array.from(this.connections.entries())) {
            if (connUrl.includes(url)) {
                return connection;
            }
        }
        return undefined;
    }

    private async createWebSocket(url: string, protocols?: string[]): Promise<WebSocket> {
        // Create WebSocket through page evaluation
        await this.page.evaluate(
            ({ url, protocols }) => {
                const ws = new WebSocket(url, protocols);
                
                // Store reference for later access
                (window as any).__websockets = (window as any).__websockets || [];
                (window as any).__websockets.push(ws);
            },
            { url, protocols }
        );
        
        // Wait for the WebSocket to be created
        const ws = await this.waitForWebSocket(url, 5000);
        return ws;
    }

    private async attemptReconnect(url: string, connection: WebSocketConnection): Promise<void> {
        connection.metrics.reconnects++;
        
        ActionLogger.logInfo('websocket_reconnect_attempt', {
            url,
            attempt: connection.metrics.reconnects
        });

        setTimeout(async () => {
            try {
                const newWs = await this.createWebSocket(url, connection.protocols);
                
                // Update connection
                connection.websocket = newWs;
                connection.state = 'connecting';
                
                this.setupWebSocketListeners(newWs, connection);
            } catch (error) {
                const logger = Logger.getInstance();
                logger.error('WebSocketHandler: Reconnect failed', error as Error);
            }
        }, this.options.reconnectInterval);
    }
}