// src/api/client/ConnectionPool.ts
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { ConnectionOptions } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

interface PooledAgent extends http.Agent {
  getName?: (options: http.RequestOptions) => string;
  freeSockets: Record<string, net.Socket[]>;
  sockets: Record<string, net.Socket[]>;
  requests: Record<string, http.IncomingMessage[]>;
  createConnection?: (options: net.NetConnectOpts, callback?: (err: Error | null, socket?: net.Socket) => void) => net.Socket;
}

export class ConnectionPool {
  private static instance: ConnectionPool;
  private httpAgents: Map<string, PooledAgent> = new Map();
  private httpsAgents: Map<string, PooledAgent> = new Map();
  private connectionOptions: ConnectionOptions;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private connectionMetrics: Map<string, ConnectionMetrics> = new Map();

  private constructor() {
    this.connectionOptions = {
      keepAlive: ConfigurationManager.getBoolean('API_KEEP_ALIVE', true),
      keepAliveMsecs: ConfigurationManager.getInt('API_KEEP_ALIVE_MSECS', 1000),
      maxSockets: ConfigurationManager.getInt('API_MAX_SOCKETS', 50),
      maxFreeSockets: ConfigurationManager.getInt('API_MAX_FREE_SOCKETS', 10),
      timeout: ConfigurationManager.getInt('API_SOCKET_TIMEOUT', 60000),
      socketTimeout: ConfigurationManager.getInt('API_SOCKET_TIMEOUT', 60000)
    };

    this.startCleanupInterval();
    this.startMetricsCollection();
  }

  public static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool();
    }
    return ConnectionPool.instance;
  }

  public getAgent(url: string, isHttps: boolean): http.Agent {
    const agentKey = this.getAgentKey(url);
    const agents = isHttps ? this.httpsAgents : this.httpAgents;

    if (!agents.has(agentKey)) {
      const agent = this.createAgent(isHttps);
      agents.set(agentKey, agent);
      
      ActionLogger.getInstance().debug(`Created new ${isHttps ? 'HTTPS' : 'HTTP'} agent for ${agentKey}`);
    }

    return agents.get(agentKey)!;
  }

  private createAgent(isHttps: boolean): PooledAgent {
    const options = {
      keepAlive: this.connectionOptions.keepAlive,
      keepAliveMsecs: this.connectionOptions.keepAliveMsecs,
      maxSockets: this.connectionOptions.maxSockets,
      maxFreeSockets: this.connectionOptions.maxFreeSockets,
      timeout: this.connectionOptions.timeout,
      scheduling: 'lifo' as 'lifo' | 'fifo',
    };

    const Agent = isHttps ? https.Agent : http.Agent;
    const agent = new Agent(options) as PooledAgent;
    
    // Ensure required properties are properly initialized
    if (!agent.freeSockets) {
      agent.freeSockets = {};
    }
    if (!agent.sockets) {
      agent.sockets = {};
    }
    if (!agent.requests) {
      agent.requests = {};
    }

    // Add connection event listeners
    this.attachAgentListeners(agent, isHttps);

    return agent;
  }

  private attachAgentListeners(agent: PooledAgent, isHttps: boolean): void {
    // Store the original createConnection method
    const originalCreateConnection = agent.createConnection;
    const protocol = isHttps ? 'HTTPS' : 'HTTP';

    agent.createConnection = (options: net.NetConnectOpts, callback?: (err: Error | null, socket?: net.Socket) => void) => {
      const startTime = Date.now();
      const host = 'host' in options ? (options as net.TcpNetConnectOpts).host || 'unknown' : 'unknown';
      
      const wrappedCallback = (err: Error | null, socket?: net.Socket) => {
        if (err) {
          this.recordConnectionError(host, err);
          callback?.(err, socket);
          return;
        }

        if (socket) {
          const connectionTime = Date.now() - startTime;
          this.recordConnectionSuccess(host, connectionTime);

          // Monitor socket events
          socket.on('timeout', () => {
            ActionLogger.getInstance().warn(`${protocol} socket timeout for ${host}`);
            this.recordSocketTimeout(host);
          });

          socket.on('error', (error) => {
            ActionLogger.getInstance().error(`${protocol} socket error for ${host}`, error);
            this.recordSocketError(host, error);
          });

          socket.on('close', () => {
            this.recordSocketClose(host);
          });
        }

        callback?.(null, socket);
      };

      if (originalCreateConnection) {
        return originalCreateConnection.call(agent, options, wrappedCallback);
      } else {
        // Default connection creation
        const socket = net.createConnection(options, () => wrappedCallback(null, socket));
        socket.on('error', (err) => wrappedCallback(err, socket));
        return socket;
      }
    };
  }

  private getAgentKey(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? 443 : 80)}`;
    } catch {
      return 'default';
    }
  }

  public getConnectionStats(): ConnectionPoolStats {
    const stats: ConnectionPoolStats = {
      http: this.getAgentStats(this.httpAgents),
      https: this.getAgentStats(this.httpsAgents),
      total: {
        agents: this.httpAgents.size + this.httpsAgents.size,
        activeSockets: 0,
        queuedRequests: 0,
        freeSockets: 0
      },
      metrics: Array.from(this.connectionMetrics.entries()).map(([host, metrics]) => ({
        host,
        ...metrics
      }))
    };

    stats.total.activeSockets = stats.http.activeSockets + stats.https.activeSockets;
    stats.total.queuedRequests = stats.http.queuedRequests + stats.https.queuedRequests;
    stats.total.freeSockets = stats.http.freeSockets + stats.https.freeSockets;

    return stats;
  }

  private getAgentStats(agents: Map<string, PooledAgent>): AgentStats {
    let activeSockets = 0;
    let queuedRequests = 0;
    let freeSockets = 0;

    agents.forEach((agent) => {
      if (agent.sockets) {
        Object.values(agent.sockets).forEach(sockets => {
          activeSockets += sockets.length;
        });
      }

      if (agent.requests) {
        Object.values(agent.requests).forEach(requests => {
          queuedRequests += requests.length;
        });
      }

      if (agent.freeSockets) {
        Object.values(agent.freeSockets).forEach(sockets => {
          freeSockets += sockets.length;
        });
      }
    });

    return {
      agents: agents.size,
      activeSockets,
      queuedRequests,
      freeSockets
    };
  }

  public updateConnectionOptions(options: Partial<ConnectionOptions>): void {
    Object.assign(this.connectionOptions, options);
    
    // Clear existing agents to apply new options
    this.clearAllAgents();
    
    ActionLogger.getInstance().info('Connection pool options updated', options);
  }

  public clearAllAgents(): void {
    this.httpAgents.forEach(agent => agent.destroy());
    this.httpsAgents.forEach(agent => agent.destroy());
    
    this.httpAgents.clear();
    this.httpsAgents.clear();
    
    ActionLogger.getInstance().info('All connection agents cleared');
  }

  public clearAgent(url: string): void {
    const agentKey = this.getAgentKey(url);
    
    const httpAgent = this.httpAgents.get(agentKey);
    if (httpAgent) {
      httpAgent.destroy();
      this.httpAgents.delete(agentKey);
    }

    const httpsAgent = this.httpsAgents.get(agentKey);
    if (httpsAgent) {
      httpsAgent.destroy();
      this.httpsAgents.delete(agentKey);
    }

    ActionLogger.getInstance().debug(`Cleared agents for ${agentKey}`);
  }

  private startCleanupInterval(): void {
    const interval = ConfigurationManager.getInt('API_POOL_CLEANUP_INTERVAL', 300000); // 5 minutes
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, interval);
  }

  private performCleanup(): void {
    const maxIdleTime = ConfigurationManager.getInt('API_MAX_SOCKET_IDLE_TIME', 120000); // 2 minutes
    const now = Date.now();

    [this.httpAgents, this.httpsAgents].forEach((agents) => {
      agents.forEach((agent, key) => {
        let hasActiveSockets = false;

        if (agent.sockets) {
          Object.values(agent.sockets).forEach(sockets => {
            if (sockets.length > 0) {
              hasActiveSockets = true;
            }
          });
        }

        if (agent.requests) {
          Object.values(agent.requests).forEach(requests => {
            if (requests.length > 0) {
              hasActiveSockets = true;
            }
          });
        }

        // Clean up idle free sockets
        if (agent.freeSockets) {
          Object.entries(agent.freeSockets).forEach(([name, sockets]) => {
            const activeFreeSockets = sockets.filter(socket => {
              const socketData = (socket as any);
              const lastUsed = socketData._lastUsed || 0;
              
              if (now - lastUsed > maxIdleTime) {
                socket.destroy();
                ActionLogger.getInstance().debug(`Destroyed idle socket for ${name}`);
                return false;
              }
              return true;
            });

            if (activeFreeSockets.length < sockets.length) {
              agent.freeSockets![name] = activeFreeSockets;
            }
          });
        }

        // Remove agent if no active connections
        if (!hasActiveSockets) {
          const agentData = (agent as any);
          const lastActivity = agentData._lastActivity || 0;
          
          if (now - lastActivity > maxIdleTime * 2) {
            agent.destroy();
            agents.delete(key);
            ActionLogger.getInstance().debug(`Removed idle agent for ${key}`);
          }
        }
      });
    });
  }

  private startMetricsCollection(): void {
    const interval = ConfigurationManager.getInt('API_METRICS_INTERVAL', 60000); // 1 minute
    
    this.metricsInterval = setInterval(() => {
      this.logMetrics();
    }, interval);
  }

  private logMetrics(): void {
    const stats = this.getConnectionStats();
    
    ActionLogger.getInstance().debug('Connection pool metrics', {
      totalAgents: stats.total.agents,
      activeSockets: stats.total.activeSockets,
      queuedRequests: stats.total.queuedRequests,
      freeSockets: stats.total.freeSockets
    });

    // Log per-host metrics if there are issues
    stats.metrics.forEach(metric => {
      if (metric.errors > 0 || metric.timeouts > 0) {
        ActionLogger.getInstance().warn(`Connection issues for ${metric.host}`, {
          errors: metric.errors,
          timeouts: metric.timeouts,
          avgConnectionTime: metric.avgConnectionTime
        });
      }
    });
  }

  private recordConnectionSuccess(host: string, connectionTime: number): void {
    const metrics = this.getOrCreateMetrics(host);
    metrics.connections++;
    metrics.totalConnectionTime += connectionTime;
    metrics.avgConnectionTime = metrics.totalConnectionTime / metrics.connections;
    metrics.lastConnectionTime = Date.now();
  }

  private recordConnectionError(host: string, error: Error): void {
    const metrics = this.getOrCreateMetrics(host);
    metrics.errors++;
    metrics.lastError = error.message;
    metrics.lastErrorTime = Date.now();
  }

  private recordSocketTimeout(host: string): void {
    const metrics = this.getOrCreateMetrics(host);
    metrics.timeouts++;
  }

  private recordSocketError(host: string, error: Error): void {
    const metrics = this.getOrCreateMetrics(host);
    metrics.socketErrors++;
    metrics.lastError = error.message;
    metrics.lastErrorTime = Date.now();
  }

  private recordSocketClose(host: string): void {
    const metrics = this.getOrCreateMetrics(host);
    metrics.closedSockets++;
  }

  private getOrCreateMetrics(host: string): ConnectionMetrics {
    if (!this.connectionMetrics.has(host)) {
      this.connectionMetrics.set(host, {
        connections: 0,
        errors: 0,
        timeouts: 0,
        socketErrors: 0,
        closedSockets: 0,
        totalConnectionTime: 0,
        avgConnectionTime: 0,
        lastConnectionTime: 0,
        lastError: '',
        lastErrorTime: 0
      });
    }
    return this.connectionMetrics.get(host)!;
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    this.clearAllAgents();
    this.connectionMetrics.clear();
    
    ActionLogger.getInstance().info('Connection pool destroyed');
  }

  public setMaxSockets(maxSockets: number): void {
    this.connectionOptions.maxSockets = maxSockets;
    
    // Update existing agents
    [this.httpAgents, this.httpsAgents].forEach((agents) => {
      agents.forEach((agent) => {
        agent.maxSockets = maxSockets;
      });
    });

    ActionLogger.getInstance().info(`Max sockets updated to ${maxSockets}`);
  }

  public setKeepAlive(keepAlive: boolean): void {
    this.connectionOptions.keepAlive = keepAlive;
    
    // Need to recreate agents for this change
    this.clearAllAgents();
    
    ActionLogger.getInstance().info(`Keep-alive ${keepAlive ? 'enabled' : 'disabled'}`);
  }

  public getActiveConnections(): Array<{
    host: string;
    protocol: string;
    activeSockets: number;
    queuedRequests: number;
    freeSockets: number;
  }> {
    const connections: Array<{
      host: string;
      protocol: string;
      activeSockets: number;
      queuedRequests: number;
      freeSockets: number;
    }> = [];

    const collectAgentInfo = (agents: Map<string, PooledAgent>, protocol: string) => {
      agents.forEach((agent, key) => {
        let activeSockets = 0;
        let queuedRequests = 0;
        let freeSockets = 0;

        if (agent.sockets) {
          Object.values(agent.sockets).forEach(sockets => {
            activeSockets += sockets.length;
          });
        }

        if (agent.requests) {
          Object.values(agent.requests).forEach(requests => {
            queuedRequests += requests.length;
          });
        }

        if (agent.freeSockets) {
          Object.values(agent.freeSockets).forEach(sockets => {
            freeSockets += sockets.length;
          });
        }

        if (activeSockets > 0 || queuedRequests > 0 || freeSockets > 0) {
          connections.push({
            host: key,
            protocol,
            activeSockets,
            queuedRequests,
            freeSockets
          });
        }
      });
    };

    collectAgentInfo(this.httpAgents, 'http');
    collectAgentInfo(this.httpsAgents, 'https');

    return connections;
  }
}

interface ConnectionMetrics {
  connections: number;
  errors: number;
  timeouts: number;
  socketErrors: number;
  closedSockets: number;
  totalConnectionTime: number;
  avgConnectionTime: number;
  lastConnectionTime: number;
  lastError: string;
  lastErrorTime: number;
}

interface AgentStats {
  agents: number;
  activeSockets: number;
  queuedRequests: number;
  freeSockets: number;
}

interface ConnectionPoolStats {
  http: AgentStats;
  https: AgentStats;
  total: AgentStats;
  metrics: Array<ConnectionMetrics & { host: string }>;
}