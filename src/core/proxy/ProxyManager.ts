/**
 * CS Test Automation Framework - ProxyManager
 * 
 * Enterprise-grade proxy management with support for HTTP, HTTPS, SOCKS5,
 * and PAC files. Includes authentication, bypass rules, and automatic failover.
 * 
 * Features:
 * - Multiple proxy protocol support
 * - Authentication (Basic, NTLM, Kerberos)
 * - PAC file execution
 * - Automatic proxy detection
 * - Connection pooling
 * - Failover and retry logic
 * - Performance monitoring
 * 
 * @author CS Test Automation Team
 * @version 4.0.0
 */

import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
// import * as url from 'url';  // Not used
// import * as fs from 'fs';  // Not used
import * as dns from 'dns';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { ProxyConfig } from './ProxyConfig';
import {
  ProxyProtocol,
  ProxySettings,
  ProxyAuthentication,
  ProxyConnection,
  ProxyStats,
  ProxyPool,
  ProxyTunnel,
  PACScript,
  // NTLMAuth,  // Only used in type annotation of commented method
  // ProxyRotation,  // Not used, ProxyConfig has its own rotation property
  ProxyHealth,
  ProxyMetrics,
  ConnectionOptions,
  TunnelOptions,
  ProxyBypassRule,
  // ProxyCertificate,  // Not used
  ProxyServer,
  ProxyConfig as ProxyConfigInterface
} from './proxy.types';

export class ProxyManager extends EventEmitter {
  private static instance: ProxyManager;
  private config!: ProxyConfig;
  private connections: Map<string, ProxyConnection> = new Map();
  private tunnels: Map<string, ProxyTunnel> = new Map();
  private pools: Map<string, ProxyPool> = new Map();
  private stats: ProxyStats;
  private pacScripts: Map<string, PACScript> = new Map();
  private rotationManager: RotationManager;
  private healthChecker: HealthChecker;
  private metricsCollector: MetricsCollector;
  private authHandlers: Map<string, AuthenticationHandler> = new Map();
  // private certificates: Map<string, ProxyCertificate> = new Map();  // Not used
  private bypassRules: ProxyBypassRule[] = [];
  private isInitialized: boolean = false;

  private constructor() {
    super();
    this.stats = this.initializeStats();
    this.rotationManager = new RotationManager();
    this.healthChecker = new HealthChecker();
    this.metricsCollector = new MetricsCollector();
    this.registerDefaultAuthHandlers();
  }

  static getInstance(): ProxyManager {
    if (!ProxyManager.instance) {
      ProxyManager.instance = new ProxyManager();
    }
    return ProxyManager.instance;
  }

  static getProxyConfig(targetUrl: string): ProxyConfig | null {
    const instance = ProxyManager.getInstance();
    if (!instance.isInitialized || !instance.config) {
      return null;
    }

    // Check if URL should bypass proxy
    if (instance.shouldBypassProxy(targetUrl)) {
      return null;
    }

    // Return the configured proxy for the target URL
    return instance.config;
  }

  async initialize(config: ProxyConfig): Promise<void> {
    if (this.isInitialized) {
      this.emit('warning', 'ProxyManager already initialized');
      return;
    }

    this.config = this.validateConfig(config);

    // Initialize proxy pools
    await this.initializeProxyPools();

    // Load PAC scripts if configured
    if (this.config.pacUrl || this.config.pacScript) {
      await this.loadPACScript();
    }

    // Setup bypass rules
    this.setupBypassRules();

    // Initialize health checking
    if (this.config.healthCheck?.enabled) {
      this.startHealthChecking();
    }

    // Initialize metrics collection
    if (this.config.metrics?.enabled) {
      this.startMetricsCollection();
    }

    // Setup rotation if configured
    if (this.config.rotation?.enabled) {
      await this.setupRotation();
    }

    this.isInitialized = true;
    this.emit('initialized', { config: this.config });
  }

  async createConnection(targetUrl: string, options?: ConnectionOptions): Promise<ProxyConnection> {
    const connectionId = this.generateConnectionId();
    const startTime = Date.now();

    try {
      // Check bypass rules
      if (this.shouldBypass(targetUrl)) {
        return this.createDirectConnection(targetUrl, connectionId, options);
      }

      // Select proxy
      const proxy = await this.selectProxy(targetUrl);
      if (!proxy) {
        throw new ProxyError('No available proxy for ' + targetUrl);
      }

      // Create connection based on protocol
      let connection: ProxyConnection;
      
      switch (proxy.protocol) {
        case 'http':
        case 'https':
          connection = await this.createHTTPConnection(proxy, targetUrl, connectionId, options);
          break;
          
        case 'socks5':
          connection = await this.createSOCKS5Connection(proxy, targetUrl, connectionId, options);
          break;
          
        case 'socks4':
          connection = await this.createSOCKS4Connection(proxy, targetUrl, connectionId, options);
          break;
          
        default:
          throw new ProxyError(`Unsupported proxy protocol: ${proxy.protocol}`);
      }

      // Store connection
      this.connections.set(connectionId, connection);

      // Update stats
      this.stats.totalConnections++;
      this.stats.activeConnections++;
      this.metricsCollector.recordConnection(proxy, Date.now() - startTime, true);

      this.emit('connectionCreated', { connectionId, proxy: proxy.host, duration: Date.now() - startTime });

      return connection;

    } catch (error) {
      this.stats.failedConnections++;
      this.metricsCollector.recordConnection(null, Date.now() - startTime, false);
      
      this.emit('connectionFailed', { 
        connectionId, 
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime 
      });
      
      throw error;
    }
  }

  async createTunnel(targetHost: string, targetPort: number, options?: TunnelOptions): Promise<ProxyTunnel> {
    const tunnelId = this.generateTunnelId();
    const startTime = Date.now();

    try {
      // Check bypass rules
      if (this.shouldBypass(`${targetHost}:${targetPort}`)) {
        return this.createDirectTunnel(targetHost, targetPort, tunnelId, options);
      }

      // Select proxy
      const proxy = await this.selectProxy(`https://${targetHost}:${targetPort}`);
      if (!proxy) {
        throw new ProxyError('No available proxy for tunnel');
      }

      // Create CONNECT tunnel
      const tunnel = await this.createConnectTunnel(proxy, targetHost, targetPort, tunnelId, options);

      // Store tunnel
      this.tunnels.set(tunnelId, tunnel);

      // Update stats
      this.stats.activeTunnels++;
      
      this.emit('tunnelCreated', { 
        tunnelId, 
        proxy: proxy.host,
        target: `${targetHost}:${targetPort}`,
        duration: Date.now() - startTime 
      });

      return tunnel;

    } catch (error) {
      this.emit('tunnelFailed', { 
        tunnelId,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime 
      });
      
      throw error;
    }
  }

  getBrowserProxy(): ProxySettings | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const defaultProxy = this.getDefaultProxy();
    if (!defaultProxy) {
      return undefined;
    }

    const settings: ProxySettings = {
      server: `${defaultProxy.protocol}://${defaultProxy.host}:${defaultProxy.port}`,
      ...(defaultProxy.auth?.username && {
        username: defaultProxy.auth.username,
        password: defaultProxy.auth.password
      }),
      ...(this.bypassRules.length > 0 && {
        bypass: this.bypassRules.map(rule => rule.pattern)
      })
    };
    
    return settings;
  }

  getContextProxy(): ProxySettings | undefined {
    // Same as browser proxy but may have different configuration
    return this.getBrowserProxy();
  }

  async getProxyForURL(targetUrl: string): Promise<ProxySettings | null> {
    // Check bypass rules
    if (this.shouldBypass(targetUrl)) {
      return null;
    }

    // Check PAC script
    if (this.pacScripts.size > 0) {
      const pacResult = await this.evaluatePAC(targetUrl);
      if (pacResult === 'DIRECT') {
        return null;
      }
      return this.parsePACResult(pacResult);
    }

    // Use configured proxy
    const proxy = await this.selectProxy(targetUrl);
    if (!proxy) {
      return null;
    }

    const settings: ProxySettings = {
      server: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
      ...(proxy.auth?.username && {
        username: proxy.auth.username,
        password: proxy.auth.password
      })
    };
    
    return settings;
  }

  // HTTP/HTTPS Proxy Implementation

  private async createHTTPConnection(
    proxy: ProxyServer,
    targetUrl: string,
    connectionId: string,
    options?: ConnectionOptions
  ): Promise<ProxyConnection> {
    const targetUrlObj = new URL(targetUrl);
    const isHTTPS = targetUrlObj.protocol === 'https:';

    const connection: ProxyConnection = {
      id: connectionId,
      target: targetUrl,
      state: 'connecting',
      createdAt: new Date(),
      stats: {
        bytesSent: 0,
        bytesReceived: 0,
        requestCount: 0,
        errorCount: 0
      }
    };

    if (isHTTPS) {
      // Create CONNECT tunnel for HTTPS
      const tunnel = await this.createConnectTunnel(
        proxy,
        targetUrlObj.hostname,
        parseInt(targetUrlObj.port || '443'),
        connectionId,
        options
      );
      
      connection.socket = tunnel.socket;
      connection.state = 'connected';
    } else {
      // Direct HTTP proxy connection
      const socket = await this.connectToProxy(proxy, options);
      connection.socket = socket;
      connection.state = 'connected';
    }

    // Setup connection monitoring
    this.monitorConnection(connection);

    return connection;
  }

  private async createConnectTunnel(
    proxy: ProxyServer,
    targetHost: string,
    targetPort: number,
    tunnelId: string,
    options?: TunnelOptions
  ): Promise<ProxyTunnel> {
    return new Promise((resolve, reject) => {
      const connectOptions: any = {
        host: proxy.host,
        port: proxy.port,
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: {
          'Host': `${targetHost}:${targetPort}`,
          'User-Agent': 'CS-Test-Automation/4.0',
          'Proxy-Connection': 'Keep-Alive'
        }
      };

      // Add proxy authentication
      if (proxy.auth) {
        const authHeader = this.getAuthHeader(proxy.auth);
        if (authHeader) {
          connectOptions.headers['Proxy-Authorization'] = authHeader;
        }
      }

      const request = http.request(connectOptions);
      
      request.on('connect', (res, socket, _head) => {
        if (res.statusCode !== 200) {
          reject(new ProxyError(`Tunnel creation failed: ${res.statusCode} ${res.statusMessage}`));
          return;
        }

        const startTime = Date.now();
        const tunnel: ProxyTunnel = {
          id: tunnelId,
          targetHost,
          targetPort,
          socket,
          state: 'connected',
          createdAt: new Date(),
          stats: {
            bytesSent: 0,
            bytesReceived: 0,
            latency: Date.now() - startTime
          }
        };

        // Setup TLS if needed
        if (options?.tls) {
          const tlsSocket = tls.connect({
            socket,
            servername: targetHost,
            ...options.tls
          });

          tlsSocket.on('secureConnect', () => {
            tunnel.socket = tlsSocket;
            resolve(tunnel);
          });

          tlsSocket.on('error', reject);
        } else {
          resolve(tunnel);
        }
      });

      request.on('error', reject);
      
      // const startTime = Date.now();  // Not used
      request.end();
    });
  }

  // SOCKS4 Implementation

  private async createSOCKS4Connection(
    proxy: ProxyServer,
    targetUrl: string,
    connectionId: string,
    options?: ConnectionOptions
  ): Promise<ProxyConnection> {
    const targetUrlObj = new URL(targetUrl);
    const targetHost = targetUrlObj.hostname;
    const targetPort = parseInt(targetUrlObj.port || (targetUrlObj.protocol === 'https:' ? '443' : '80'));

    const socket = await this.connectToProxy(proxy, options);
    
    // SOCKS4 handshake
    await this.performSOCKS4Handshake(socket, targetHost, targetPort, proxy.auth);

    const connection: ProxyConnection = {
      id: connectionId,
      target: targetUrl,
      socket,
      state: 'connected',
      createdAt: new Date(),
      stats: {
        bytesSent: 0,
        bytesReceived: 0,
        requestCount: 0,
        errorCount: 0
      }
    };

    // Setup TLS if HTTPS
    if (targetUrlObj.protocol === 'https:') {
      const tlsSocket = tls.connect({
        socket,
        servername: targetHost
      });

      await new Promise<void>((resolve, reject) => {
        tlsSocket.once('secureConnect', resolve);
        tlsSocket.once('error', reject);
      });

      connection.socket = tlsSocket;
    }

    this.monitorConnection(connection);
    return connection;
  }

  private async performSOCKS4Handshake(
    socket: net.Socket,
    host: string,
    port: number,
    auth?: ProxyAuthentication
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // SOCKS4 request
      const userId = auth?.username ? Buffer.from(auth.username) : Buffer.alloc(0);
      
      // Resolve host to IP for SOCKS4
      dns.lookup(host, 4, (err, address) => {
        if (err) {
          reject(new ProxyError('Failed to resolve host for SOCKS4'));
          return;
        }

        const ipParts = address.split('.').map(n => parseInt(n));
        const request = Buffer.concat([
          Buffer.from([
            0x04, // SOCKS version
            0x01, // CONNECT command
            port >> 8, port & 0xFF, // Port (big-endian)
            ...ipParts // IP address
          ]),
          userId,
          Buffer.from([0x00]) // Null terminator
        ]);

        socket.write(request);

        socket.once('data', (data) => {
          if (data[0] !== 0x00) {
            reject(new ProxyError('Invalid SOCKS4 response'));
            return;
          }

          if (data[1] !== 0x5A) {
            const errors = {
              0x5B: 'Request rejected or failed',
              0x5C: 'Request failed because client is not running identd',
              0x5D: 'Request failed because client\'s identd could not confirm the user ID'
            };
            
            const errorCode = data[1];
        const errorMessage = errorCode !== undefined ? errors[errorCode as keyof typeof errors] : undefined;
        reject(new ProxyError(errorMessage || 'Unknown SOCKS4 error'));
            return;
          }

          resolve();
        });

        socket.once('error', reject);
      });
    });
  }

  // SOCKS5 Implementation

  private async createSOCKS5Connection(
    proxy: ProxyServer,
    targetUrl: string,
    connectionId: string,
    options?: ConnectionOptions
  ): Promise<ProxyConnection> {
    const targetUrlObj = new URL(targetUrl);
    const targetHost = targetUrlObj.hostname;
    const targetPort = parseInt(targetUrlObj.port || (targetUrlObj.protocol === 'https:' ? '443' : '80'));

    const socket = await this.connectToProxy(proxy, options);
    
    // SOCKS5 handshake
    await this.performSOCKS5Handshake(socket, proxy.auth);
    
    // SOCKS5 connect request
    await this.sendSOCKS5ConnectRequest(socket, targetHost, targetPort);

    const connection: ProxyConnection = {
      id: connectionId,
      target: targetUrl,
      socket,
      state: 'connected',
      createdAt: new Date(),
      stats: {
        bytesSent: 0,
        bytesReceived: 0,
        requestCount: 0,
        errorCount: 0
      }
    };

    // Setup TLS if HTTPS
    if (targetUrlObj.protocol === 'https:') {
      const tlsSocket = tls.connect({
        socket,
        servername: targetHost
      });

      await new Promise<void>((resolve, reject) => {
        tlsSocket.once('secureConnect', resolve);
        tlsSocket.once('error', reject);
      });

      connection.socket = tlsSocket;
    }

    this.monitorConnection(connection);
    return connection;
  }

  private async performSOCKS5Handshake(socket: net.Socket, auth?: ProxyAuthentication): Promise<void> {
    return new Promise((resolve, reject) => {
      // Send greeting
      const methods = [0x00]; // NO AUTHENTICATION REQUIRED
      if (auth) {
        methods.push(0x02); // USERNAME/PASSWORD
      }

      const greeting = Buffer.from([
        0x05, // SOCKS version
        methods.length,
        ...methods
      ]);

      socket.write(greeting);

      socket.once('data', async (data) => {
        if (data[0] !== 0x05) {
          reject(new ProxyError('Invalid SOCKS5 response'));
          return;
        }

        const method = data[1];
        
        if (method === 0xFF) {
          reject(new ProxyError('No acceptable authentication method'));
          return;
        }

        if (method === 0x02 && auth) {
          // Username/password authentication
          await this.performSOCKS5Auth(socket, auth);
        }

        resolve();
      });

      socket.once('error', reject);
    });
  }

  private async performSOCKS5Auth(socket: net.Socket, auth: ProxyAuthentication): Promise<void> {
    return new Promise((resolve, reject) => {
      const username = Buffer.from(auth.username);
      const password = Buffer.from(auth.password);
      
      const authRequest = Buffer.concat([
        Buffer.from([0x01]), // Version
        Buffer.from([username.length]),
        username,
        Buffer.from([password.length]),
        password
      ]);

      socket.write(authRequest);

      socket.once('data', (data) => {
        if (data[0] !== 0x01 || data[1] !== 0x00) {
          reject(new ProxyError('SOCKS5 authentication failed'));
          return;
        }
        resolve();
      });

      socket.once('error', reject);
    });
  }

  private async sendSOCKS5ConnectRequest(socket: net.Socket, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let addressType: number;
      let addressBuffer: Buffer;

      // Check if IP address
      if (net.isIP(host)) {
        if (net.isIPv4(host)) {
          addressType = 0x01; // IPv4
          addressBuffer = Buffer.from(host.split('.').map(n => parseInt(n)));
        } else {
          addressType = 0x04; // IPv6
          addressBuffer = Buffer.from(host.split(':').flatMap(part => {
            const num = parseInt(part, 16);
            return [num >> 8, num & 0xFF];
          }));
        }
      } else {
        // Domain name
        addressType = 0x03;
        addressBuffer = Buffer.concat([
          Buffer.from([host.length]),
          Buffer.from(host)
        ]);
      }

      const portBuffer = Buffer.allocUnsafe(2);
      portBuffer.writeUInt16BE(port, 0);

      const request = Buffer.concat([
        Buffer.from([
          0x05, // SOCKS version
          0x01, // CONNECT command
          0x00  // Reserved
        ]),
        Buffer.from([addressType]),
        addressBuffer,
        portBuffer
      ]);

      socket.write(request);

      socket.once('data', (data) => {
        if (data[0] !== 0x05) {
          reject(new ProxyError('Invalid SOCKS5 response'));
          return;
        }

        if (data[1] !== 0x00) {
          const errors: Record<number, string> = {
            0x01: 'General SOCKS server failure',
            0x02: 'Connection not allowed by ruleset',
            0x03: 'Network unreachable',
            0x04: 'Host unreachable',
            0x05: 'Connection refused',
            0x06: 'TTL expired',
            0x07: 'Command not supported',
            0x08: 'Address type not supported'
          };
          
          const errorCode = data[1];
          const errorMessage = errorCode !== undefined ? errors[errorCode] : undefined;
          reject(new ProxyError(errorMessage || 'Unknown SOCKS5 error'));
          return;
        }

        resolve();
      });

      socket.once('error', reject);
    });
  }

  // NTLM Authentication Implementation - Currently unused but kept for future implementation
  /* Commented out for future implementation
  private async performNTLMAuth(socket: net.Socket, auth: NTLMAuth): Promise<void> {
    // Type 1 message (Negotiate)
    const type1 = this.createNTLMType1Message(auth.domain, auth.workstation);
    const authHeader = `NTLM ${type1.toString('base64')}`;
    
    // Send initial request with Type 1
    await this.sendProxyAuthRequest(socket, authHeader);
    
    // Receive Type 2 challenge
    const challenge = await this.receiveNTLMChallenge(socket);
    
    // Create Type 3 response
    const type3 = this.createNTLMType3Message(
      auth.username,
      auth.password,
      auth.domain,
      auth.workstation,
      challenge
    );
    
    // Send Type 3 authentication
    const finalAuthHeader = `NTLM ${type3.toString('base64')}`;
    await this.sendProxyAuthRequest(socket, finalAuthHeader);
  }

  private createNTLMType1Message(_domain?: string, _workstation?: string): Buffer {
    const NTLMSSP_NEGOTIATE = 0x00000001;
    const NTLM_NEGOTIATE_OEM = 0x00000002;
    const NTLM_NEGOTIATE_UNICODE = 0x00000001;
    const NTLM_NEGOTIATE_NTLM = 0x00000200;
    const NTLM_NEGOTIATE_ALWAYS_SIGN = 0x00008000;
    const NTLM_NEGOTIATE_NTLM2_KEY = 0x00080000;

    const flags = NTLMSSP_NEGOTIATE | NTLM_NEGOTIATE_OEM | NTLM_NEGOTIATE_UNICODE |
                  NTLM_NEGOTIATE_NTLM | NTLM_NEGOTIATE_ALWAYS_SIGN | NTLM_NEGOTIATE_NTLM2_KEY;

    const type1 = Buffer.allocUnsafe(32);
    let offset = 0;

    // Signature
    type1.write('NTLMSSP\0', offset, 'ascii');
    offset += 8;

    // Type
    type1.writeUInt32LE(1, offset);
    offset += 4;

    // Flags
    type1.writeUInt32LE(flags, offset);
    offset += 4;

    // Domain (empty)
    type1.writeUInt16LE(0, offset); // Length
    type1.writeUInt16LE(0, offset + 2); // Max length
    type1.writeUInt32LE(0, offset + 4); // Offset
    offset += 8;

    // Workstation (empty)
    type1.writeUInt16LE(0, offset); // Length
    type1.writeUInt16LE(0, offset + 2); // Max length
    type1.writeUInt32LE(0, offset + 4); // Offset

    return type1;
  }

  private createNTLMType3Message(
    username: string,
    password: string,
    domain: string,
    workstation: string,
    challenge: Buffer
  ): Buffer {
    // This is a simplified implementation
    // Real NTLM involves complex cryptographic operations
    const ntlmHash = this.createNTLMHash(password);
    const ntlmv2Hash = this.createNTLMv2Hash(ntlmHash, username, domain);
    
    // Extract server challenge from Type 2 message
    const serverChallenge = challenge.slice(24, 32);
    
    // Generate client challenge
    const clientChallenge = crypto.randomBytes(8);
    
    // Calculate response
    const ntlmv2Response = this.calculateNTLMv2Response(
      ntlmv2Hash,
      serverChallenge,
      clientChallenge
    );

    // Build Type 3 message
    const type3 = Buffer.allocUnsafe(1024); // Allocate enough space
    let offset = 0;

    // Signature
    type3.write('NTLMSSP\0', offset, 'ascii');
    offset += 8;

    // Type
    type3.writeUInt32LE(3, offset);
    offset += 4;

    // LM response (not used in NTLMv2)
    offset = this.writeSecurityBuffer(type3, offset, Buffer.alloc(0));

    // NTLM response
    offset = this.writeSecurityBuffer(type3, offset, ntlmv2Response);

    // Domain
    const domainBuffer = Buffer.from(domain, 'utf16le');
    offset = this.writeSecurityBuffer(type3, offset, domainBuffer);

    // Username
    const usernameBuffer = Buffer.from(username, 'utf16le');
    offset = this.writeSecurityBuffer(type3, offset, usernameBuffer);

    // Workstation
    const workstationBuffer = Buffer.from(workstation, 'utf16le');
    offset = this.writeSecurityBuffer(type3, offset, workstationBuffer);

    // Session key (empty for now)
    offset = this.writeSecurityBuffer(type3, offset, Buffer.alloc(0));

    // Flags
    type3.writeUInt32LE(0x00008201, offset);
    offset += 4;

    return type3.slice(0, offset);
  }

  private createNTLMHash(password: string): Buffer {
    // Convert password to uppercase Unicode
    const unicodePassword = Buffer.from(password.toUpperCase(), 'utf16le');
    
    // MD4 hash
    const md4 = crypto.createHash('md4');
    md4.update(unicodePassword);
    return md4.digest();
  }

  private createNTLMv2Hash(ntlmHash: Buffer, username: string, domain: string): Buffer {
    const usernameUpper = username.toUpperCase();
    const identity = Buffer.from(usernameUpper + domain, 'utf16le');
    
    const hmac = crypto.createHmac('md5', ntlmHash);
    hmac.update(identity);
    return hmac.digest();
  }

  private calculateNTLMv2Response(
    ntlmv2Hash: Buffer,
    serverChallenge: Buffer,
    clientChallenge: Buffer
  ): Buffer {
    const timestamp = this.getNTLMTimestamp();
    
    // Build blob
    const blob = Buffer.concat([
      Buffer.from([0x01, 0x01, 0x00, 0x00]), // Blob signature
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // Reserved
      timestamp,
      clientChallenge,
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // Unknown
      Buffer.from([0x00, 0x00, 0x00, 0x00])  // Target info terminator
    ]);

    // Calculate response
    const hmac = crypto.createHmac('md5', ntlmv2Hash);
    hmac.update(serverChallenge);
    hmac.update(blob);
    const proof = hmac.digest();

    return Buffer.concat([proof, blob]);
  }

  private getNTLMTimestamp(): Buffer {
    // Windows FILETIME (100-nanosecond intervals since January 1, 1601)
    const EPOCH_DIFFERENCE = 11644473600000; // milliseconds
    const timestamp = Date.now() + EPOCH_DIFFERENCE;
    const filetime = timestamp * 10000; // Convert to 100-nanosecond intervals
    
    const buffer = Buffer.allocUnsafe(8);
    // Write as two 32-bit integers for compatibility
    const low = filetime & 0xFFFFFFFF;
    const high = Math.floor(filetime / 0x100000000);
    buffer.writeUInt32LE(low, 0);
    buffer.writeUInt32LE(high, 4);
    return buffer;
  }

  private writeSecurityBuffer(target: Buffer, offset: number, data: Buffer): number {
    const length = data.length;
    
    // Length
    target.writeUInt16LE(length, offset);
    // Max length
    target.writeUInt16LE(length, offset + 2);
    // Offset (will be updated later)
    target.writeUInt32LE(0, offset + 4);
    
    return offset + 8;
  }
  */

  // PAC Script Implementation

  private async loadPACScript(): Promise<void> {
    let pacContent: string;

    if (this.config.pacUrl) {
      // Download PAC script
      pacContent = await this.downloadPAC(this.config.pacUrl);
    } else if (this.config.pacScript) {
      // Use provided PAC script
      pacContent = this.config.pacScript;
    } else {
      return;
    }

    const pacScript: PACScript = {
      id: this.generatePACId(),
      content: pacContent,
      loadedAt: new Date(),
      cache: new Map()
    };
    
    if (this.config.pacUrl) {
      pacScript.url = this.config.pacUrl;
    }

    // Validate and compile PAC script
    this.compilePACScript(pacScript);

    this.pacScripts.set(pacScript.id, pacScript);
    this.emit('pacLoaded', { id: pacScript.id, url: this.config.pacUrl });
  }

  private async downloadPAC(pacUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(pacUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      const request = client.get(pacUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new ProxyError(`Failed to download PAC: ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new ProxyError('PAC download timeout'));
      });
    });
  }

  private compilePACScript(pacScript: PACScript): void {
    // Create PAC sandbox environment
    const sandbox = {
      // PAC script functions
      isPlainHostName: (host: string) => !host.includes('.'),
      
      dnsDomainIs: (host: string, domain: string) => {
        return host.endsWith(domain);
      },
      
      localHostOrDomainIs: (host: string, hostdom: string) => {
        return host === hostdom || host === hostdom.split('.')[0];
      },
      
      isResolvable: (_host: string) => {
        // Simplified implementation - in production, use async DNS
        return true;
      },
      
      isInNet: (host: string, subnet: string, mask: string) => {
        const hostIP = this.resolveHost(host);
        if (!hostIP) return false;
        return this.isIPInNetwork(hostIP, subnet, mask);
      },
      
      dnsResolve: (host: string) => {
        return this.resolveHost(host);
      },
      
      myIpAddress: () => {
        return this.getLocalIP();
      },
      
      dnsDomainLevels: (host: string) => {
        return host.split('.').length - 1;
      },
      
      shExpMatch: (str: string, pattern: string) => {
        const regex = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(`^${regex}$`).test(str);
      },
      
      weekdayRange: (wd1: string, wd2?: string, _gmt?: string) => {
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const today = new Date().getDay();
        const start = days.indexOf(wd1.toUpperCase());
        const end = wd2 ? days.indexOf(wd2.toUpperCase()) : start;
        
        if (start <= end) {
          return today >= start && today <= end;
        } else {
          return today >= start || today <= end;
        }
      },
      
      dateRange: (..._args: any[]) => {
        // Complex date range implementation
        return true; // Simplified
      },
      
      timeRange: (..._args: any[]) => {
        // Time range implementation
        return true; // Simplified
      }
    };

    // Compile PAC function
    try {
      const vm = eval('require')('vm');
      const script = new vm.Script(`
        ${pacScript.content}
        FindProxyForURL;
      `);
      
      const context = vm.createContext(sandbox);
      pacScript.findProxyForURL = script.runInContext(context);
    } catch (error) {
      throw new ProxyError(`Invalid PAC script: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async evaluatePAC(targetUrl: string): Promise<string> {
    const urlObj = new URL(targetUrl);
    
    // Check cache first
    const pacScripts = Array.from(this.pacScripts.values());
    for (const pacScript of pacScripts) {
      const cached = pacScript.cache?.get(targetUrl);
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
        return cached.result;
      }
    }

    // Evaluate PAC script
    let result = 'DIRECT';
    
    const pacScripts2 = Array.from(this.pacScripts.values());
    for (const pacScript of pacScripts2) {
      if (pacScript.findProxyForURL) {
        try {
          result = pacScript.findProxyForURL(targetUrl, urlObj.hostname);
          
          // Cache result
          pacScript.cache?.set(targetUrl, {
            result,
            timestamp: Date.now()
          });
          
          break;
        } catch (error) {
          this.emit('pacError', { error: error instanceof Error ? error.message : String(error), url: targetUrl });
        }
      }
    }

    return result;
  }

  private parsePACResult(pacResult: string): ProxySettings | null {
    const parts = pacResult.split(';').map(p => p.trim());
    
    for (const part of parts) {
      if (part === 'DIRECT') {
        return null;
      }
      
      const match = part.match(/^(PROXY|SOCKS|SOCKS5)\s+([^:]+):(\d+)$/i);
      if (match) {
        const [, type, host, port] = match;
        
        let protocol: ProxyProtocol = 'http';
        const upperType = type?.toUpperCase();
        if (upperType === 'SOCKS' || upperType === 'SOCKS5') {
          protocol = 'socks5';
        }
        
        return {
          server: `${protocol}://${host}:${port}`
        };
      }
    }
    
    return null;
  }

  // Proxy Selection and Rotation

  private async selectProxy(targetUrl: string): Promise<ProxyServer | null> {
    // Check if rotation is enabled
    if (this.config.rotation?.enabled) {
      return this.rotationManager.getNextProxy();
    }

    // Check PAC script result
    if (this.pacScripts.size > 0) {
      const pacResult = await this.evaluatePAC(targetUrl);
      if (pacResult !== 'DIRECT') {
        const proxySettings = this.parsePACResult(pacResult);
        if (proxySettings) {
          return this.parseProxySettings(proxySettings);
        }
      }
    }

    // Return default proxy
    return this.getDefaultProxy();
  }

  private getDefaultProxy(): ProxyServer | null {
    if (!this.config.enabled || !this.config.servers || this.config.servers.length === 0) {
      return null;
    }

    // Find first healthy proxy
    for (const server of this.config.servers) {
      if (this.healthChecker.isHealthy(server)) {
        return server;
      }
    }

    // If no healthy proxy, return first one
    return this.config.servers[0] || null;
  }

  private parseProxySettings(settings: ProxySettings): ProxyServer {
    const urlObj = new URL(settings.server);
    
    const server: ProxyServer = {
      protocol: urlObj.protocol.replace(':', '') as ProxyProtocol,
      host: urlObj.hostname,
      port: parseInt(urlObj.port || '80')
    };
    
    if (settings.username) {
      server.auth = {
        username: settings.username,
        password: settings.password || '',
        type: 'basic' as const
      };
    }
    
    return server;
  }

  // Bypass Rules

  private setupBypassRules(): void {
    this.bypassRules = [];

    if (this.config.bypass) {
      for (const pattern of this.config.bypass) {
        this.bypassRules.push({
          pattern,
          regex: this.createBypassRegex(pattern)
        });
      }
    }

    // Add default bypass rules
    this.bypassRules.push(
      { pattern: 'localhost', regex: /^localhost$/i },
      { pattern: '127.0.0.1', regex: /^127\.0\.0\.1$/ },
      { pattern: '::1', regex: /^::1$/ },
      { pattern: '169.254.*', regex: /^169\.254\.\d+\.\d+$/ }
    );
  }

  private createBypassRegex(pattern: string): RegExp {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`, 'i');
  }

  private shouldBypass(targetUrl: string): boolean {
    try {
      const urlObj = new URL(targetUrl);
      const host = urlObj.hostname;

      for (const rule of this.bypassRules) {
        if (rule.regex.test(host)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  // Connection Management

  private async connectToProxy(proxy: ProxyServer, options?: ConnectionOptions): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({
        host: proxy.host,
        port: proxy.port,
        ...options?.socketOptions
      });

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new ProxyError('Proxy connection timeout'));
      }, options?.timeout || 30000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve(socket);
      });

      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(new ProxyError(`Proxy connection failed: ${error instanceof Error ? error.message : String(error)}`));
      });
    });
  }

  private async createDirectConnection(
    targetUrl: string,
    connectionId: string,
    options?: ConnectionOptions
  ): Promise<ProxyConnection> {
    const urlObj = new URL(targetUrl);
    const port = parseInt(urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'));

    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const sock = net.connect({
        host: urlObj.hostname,
        port,
        ...options?.socketOptions
      });

      sock.once('connect', () => resolve(sock));
      sock.once('error', reject);
    });

    const connection: ProxyConnection = {
      id: connectionId,
      target: targetUrl,
      socket,
      state: 'connected',
      createdAt: new Date(),
      stats: {
        bytesSent: 0,
        bytesReceived: 0,
        requestCount: 0,
        errorCount: 0
      }
    };

    // Setup TLS if HTTPS
    if (urlObj.protocol === 'https:') {
      const tlsSocket = tls.connect({
        socket,
        servername: urlObj.hostname
      });

      await new Promise<void>((resolve, reject) => {
        tlsSocket.once('secureConnect', resolve);
        tlsSocket.once('error', reject);
      });

      connection.socket = tlsSocket;
    }

    this.monitorConnection(connection);
    return connection;
  }

  private async createDirectTunnel(
    targetHost: string,
    targetPort: number,
    tunnelId: string,
    options?: TunnelOptions
  ): Promise<ProxyTunnel> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const sock = net.connect({
        host: targetHost,
        port: targetPort
      });

      sock.once('connect', () => resolve(sock));
      sock.once('error', reject);
    });

    const tunnel: ProxyTunnel = {
      id: tunnelId,
      targetHost,
      targetPort,
      socket,
      state: 'connected',
      createdAt: new Date(),
      stats: {
        bytesSent: 0,
        bytesReceived: 0,
        latency: 0
      }
    };

    if (options?.tls) {
      const tlsSocket = tls.connect({
        socket,
        servername: targetHost,
        ...options.tls
      });

      await new Promise<void>((resolve, reject) => {
        tlsSocket.once('secureConnect', resolve);
        tlsSocket.once('error', reject);
      });

      tunnel.socket = tlsSocket;
    }

    return tunnel;
  }

  private monitorConnection(connection: ProxyConnection): void {
    const socket = connection.socket;
    if (!socket) return;

    // Monitor data transfer
    socket.on('data', (data) => {
      connection.stats.bytesReceived += data.length;
    });

    // Monitor socket closure
    socket.once('close', () => {
      connection.state = 'closed';
      this.connections.delete(connection.id);
      this.stats.activeConnections--;
      
      this.emit('connectionClosed', { 
        connectionId: connection.id,
        stats: connection.stats 
      });
    });

    // Monitor errors
    socket.once('error', (error) => {
      connection.stats.errorCount++;
      connection.state = 'error';
      
      this.emit('connectionError', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  // Authentication Handlers

  private registerDefaultAuthHandlers(): void {
    // Basic authentication
    this.authHandlers.set('basic', {
      createHeader: (auth: ProxyAuthentication) => {
        const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        return `Basic ${credentials}`;
      }
    });

    // NTLM authentication
    this.authHandlers.set('ntlm', {
      createHeader: (_auth: ProxyAuthentication) => {
        // NTLM requires special handling, return empty for now
        return '';
      }
    });

    // Digest authentication
    this.authHandlers.set('digest', {
      createHeader: (auth: ProxyAuthentication, challenge?: string) => {
        // Simplified digest implementation
        return this.createDigestAuthHeader(auth, challenge);
      }
    });
  }

  private getAuthHeader(auth: ProxyAuthentication): string {
    const authType = auth.type || 'basic';
    const handler = this.authHandlers.get(authType);
    if (!handler) {
      throw new ProxyError(`Unsupported authentication type: ${authType}`);
    }

    const result = handler.createHeader(auth);
    if (result instanceof Promise) {
      // For async auth handlers, return empty string and handle separately
      return '';
    }
    return result || '';
  }

  private createDigestAuthHeader(auth: ProxyAuthentication, challenge?: string): string {
    if (!challenge) {
      return '';
    }

    // Parse challenge
    const params = this.parseDigestChallenge(challenge);
    
    // Generate response
    const ha1 = this.md5(`${auth.username}:${params.realm}:${auth.password}`);
    const ha2 = this.md5(`CONNECT:${params.uri}`);
    const response = this.md5(`${ha1}:${params.nonce}:${ha2}`);

    return `Digest username="${auth.username}", realm="${params.realm}", ` +
           `nonce="${params.nonce}", uri="${params.uri}", response="${response}"`;
  }

  private parseDigestChallenge(challenge: string): any {
    const params: any = {};
    const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
    let match;

    while ((match = regex.exec(challenge)) !== null) {
      const key = match[1];
      const value = match[2] || match[3];
      if (key !== undefined) {
        params[key] = value;
      }
    }

    return params;
  }

  private md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // Utility Methods

  private resolveHost(_host: string): string | null {
    // Simplified implementation - in production, use async DNS
    return '127.0.0.1';
  }

  private getLocalIP(): string {
    const interfaces = eval('require')('os').networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    
    return '127.0.0.1';
  }

  private isIPInNetwork(ip: string, network: string, mask: string): boolean {
    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);
    const maskNum = this.ipToNumber(mask);
    
    return (ipNum & maskNum) === (networkNum & maskNum);
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split('.');
    return parts.reduce((acc, part) => (acc << 8) + parseInt(part), 0);
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTunnelId(): string {
    return `tunnel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePACId(): string {
    return `pac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateConfig(config: ProxyConfig): ProxyConfig {
    if (!config.servers || config.servers.length === 0) {
      throw new ProxyError('At least one proxy server must be configured');
    }

    // Validate each server
    for (const server of config.servers) {
      if (!server.host || !server.port) {
        throw new ProxyError('Proxy server must have host and port');
      }

      if (!['http', 'https', 'socks4', 'socks5'].includes(server.protocol)) {
        throw new ProxyError(`Invalid proxy protocol: ${server.protocol}`);
      }

      if (server.auth) {
        if (!server.auth.username || !server.auth.password) {
          throw new ProxyError('Proxy authentication requires username and password');
        }

        const authType = server.auth.type || 'basic';
        if (!['basic', 'digest', 'ntlm', 'negotiate'].includes(authType)) {
          throw new ProxyError(`Invalid authentication type: ${authType}`);
        }
      }
    }

    // Set defaults if not provided
    if (!config.rotation) {
      config.rotation = { enabled: false, strategy: 'round-robin', servers: [] };
    }
    if (!config.healthCheck) {
      config.healthCheck = { enabled: true, interval: 60000 };
    }
    if (!config.metrics) {
      config.metrics = { enabled: true };
    }
    if (!config.connectionPool) {
      config.connectionPool = { maxSize: 100, maxIdleTime: 300000 };
    }
    if (!config.retry) {
      config.retry = { maxAttempts: 3, delay: 1000, backoff: 2 };
    }

    return config;
  }

  private initializeStats(): ProxyStats {
    return {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      activeTunnels: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      avgLatency: 0,
      connectionsByProxy: new Map(),
      errorsByType: new Map(),
      startTime: new Date()
    };
  }

  private async initializeProxyPools(): Promise<void> {
    for (const server of this.config.servers) {
      const poolId = `${server.host}:${server.port}`;
      
      const pool: ProxyPool = {
        id: poolId,
        proxy: this.config,
        connections: new Map(),
        maxSize: this.config.connectionPool?.maxSize || 100,
        maxIdleTime: this.config.connectionPool?.maxIdleTime || 300000,
        stats: {
          active: 0,
          idle: 0,
          total: 0,
          created: 0,
          destroyed: 0,
          errors: 0
        }
      };

      this.pools.set(poolId, pool);
      
      // Start pool maintenance
      this.startPoolMaintenance(pool);
    }
  }

  private startPoolMaintenance(pool: ProxyPool): void {
    setInterval(() => {
      const now = Date.now();
      const toRemove: string[] = [];

      const connections = Array.from(pool.connections.entries());
      for (const [id, conn] of connections) {
        if (conn.state === 'idle' && conn.lastUsed && now - conn.lastUsed.getTime() > pool.maxIdleTime) {
          toRemove.push(id);
        }
      }

      for (const id of toRemove) {
        this.removeFromPool(pool, id);
      }
    }, 30000); // Check every 30 seconds
  }

  // Currently not used but kept for future connection pooling implementation
  /*
  private async getPooledConnection(proxy: ProxyServer, targetUrl: string): Promise<ProxyConnection | null> {
    const poolId = `${proxy.host}:${proxy.port}`;
    const pool = this.pools.get(poolId);
    
    if (!pool) {
      return null;
    }

    // Find idle connection
    const connections = Array.from(pool.connections.entries());
    for (const [_id, conn] of connections) {
      if (conn.state === 'idle' && this.canReuseConnection(conn, targetUrl)) {
        conn.state = 'connected';
        conn.target = targetUrl;
        pool.stats.active++;
        pool.stats.idle--;
        return conn;
      }
    }

    // Create new connection if pool not full
    if (pool.connections.size < pool.maxSize) {
      return null; // Let caller create new connection
    }

    // Pool is full, wait or reject
    throw new ProxyError('Connection pool is full');
  }
  */

  // Currently not used but kept for future connection pooling implementation
  /*
  private canReuseConnection(connection: ProxyConnection, targetUrl: string): boolean {
    if (!connection.socket || connection.socket.destroyed) {
      return false;
    }

    // For HTTPS connections, we need exact host match
    try {
      const currentUrl = new URL(connection.target);
      const newUrl = new URL(targetUrl);
      
      return currentUrl.host === newUrl.host && 
             currentUrl.protocol === newUrl.protocol;
    } catch {
      return false;
    }
  }
  */

  // Currently not used but kept for future connection pooling implementation
  /*
  private addToPool(pool: ProxyPool, connection: ProxyConnection): void {
    pool.connections.set(connection.id, connection);
    pool.stats.total++;
    pool.stats.created++;
    
    if (connection.state === 'connected') {
      pool.stats.active++;
    } else {
      pool.stats.idle++;
    }
  }
  */

  private removeFromPool(pool: ProxyPool, connectionId: string): void {
    const connection = pool.connections.get(connectionId);
    if (!connection) return;

    pool.connections.delete(connectionId);
    pool.stats.total--;
    
    if (connection.state === 'connected') {
      pool.stats.active--;
    } else {
      pool.stats.idle--;
    }
    
    pool.stats.destroyed++;

    // Close socket
    if (connection.socket && !connection.socket.destroyed) {
      connection.socket.destroy();
    }
  }

  private startHealthChecking(): void {
    const interval = this.config.healthCheck?.interval || 60000;
    
    setInterval(() => {
      for (const server of this.config.servers) {
        this.healthChecker.checkProxy(server);
      }
    }, interval);
    
    // Initial check
    for (const server of this.config.servers) {
      this.healthChecker.checkProxy(server);
    }
  }

  private startMetricsCollection(): void {
    this.metricsCollector.on('metrics', (metrics: ProxyMetrics) => {
      this.emit('metrics', metrics);
    });

    // Periodic metrics emission
    setInterval(() => {
      const metrics = this.getMetrics();
      this.emit('metrics', metrics);
    }, 60000); // Every minute
  }

  private async setupRotation(): Promise<void> {
    const rotationConfig = this.config.rotation!;
    
    const rotationSettings: ProxyRotationConfig = {
      servers: this.config.servers,
      strategy: rotationConfig.strategy || 'round-robin',
      sticky: rotationConfig.sticky || false,
      stickyTTL: rotationConfig.stickyTTL || 3600000
    };
    
    if (rotationConfig.weights) {
      rotationSettings.weights = rotationConfig.weights;
    }
    
    await this.rotationManager.initialize(rotationSettings);

    this.rotationManager.on('rotated', (event) => {
      this.emit('proxyRotated', event);
    });
  }

  // Currently not used but kept for future NTLM implementation
  /*
  private async sendProxyAuthRequest(socket: net.Socket, authHeader: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = `CONNECT proxy-authorization: ${authHeader}\r\n\r\n`;
      
      socket.write(request, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  */

  // Currently not used but kept for future NTLM implementation
  /*
  private async receiveNTLMChallenge(socket: net.Socket): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      socket.once('data', (data) => {
        // Parse HTTP response
        const response = data.toString();
        const match = response.match(/Proxy-Authenticate: NTLM (.+)\r?\n/);
        
        if (!match) {
          reject(new ProxyError('No NTLM challenge received'));
          return;
        }
        
        const authData = match[1];
        if (!authData) {
          reject(new ProxyError('Invalid NTLM challenge format'));
          return;
        }
        const challenge = Buffer.from(authData, 'base64');
        resolve(challenge);
      });

      socket.once('error', reject);
    });
  }
  */

  // Public Methods

  async close(): Promise<void> {
    // Close all connections
    const connections = Array.from(this.connections.values());
    for (const connection of connections) {
      if (connection.socket && !connection.socket.destroyed) {
        connection.socket.destroy();
      }
    }
    this.connections.clear();

    // Close all tunnels
    const tunnels = Array.from(this.tunnels.values());
    for (const tunnel of tunnels) {
      if (tunnel.socket && !tunnel.socket.destroyed) {
        tunnel.socket.destroy();
      }
    }
    this.tunnels.clear();

    // Clear pools
    const pools = Array.from(this.pools.values());
    for (const pool of pools) {
      const connections = Array.from(pool.connections.values());
      for (const connection of connections) {
        if (connection.socket && !connection.socket.destroyed) {
          connection.socket.destroy();
        }
      }
      pool.connections.clear();
    }
    this.pools.clear();

    // Stop health checker
    if (this.healthChecker) {
      this.healthChecker.stop();
    }

    // Stop metrics collector
    if (this.metricsCollector) {
      this.metricsCollector.stop();
    }

    this.isInitialized = false;
    this.emit('closed');
  }

  getStats(): ProxyStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime.getTime(),
      poolStats: this.getPoolStats(),
      healthStats: this.healthChecker.getStats()
    };
  }

  getMetrics(): ProxyMetrics {
    return this.metricsCollector.getMetrics();
  }

  getActiveConnections(): ProxyConnection[] {
    return Array.from(this.connections.values());
  }

  getActiveTunnels(): ProxyTunnel[] {
    return Array.from(this.tunnels.values());
  }

  /**
   * Check if proxy is enabled and configured
   */
  isEnabled(): boolean {
    return this.isInitialized && this.config && this.config.enabled && 
           this.config.servers && this.config.servers.length > 0;
  }

  /**
   * Get the current proxy configuration
   */
  getProxyConfig(): ProxyConfig | null {
    return this.isInitialized ? this.config : null;
  }

  async testProxy(proxy: ProxyConfig, testUrl?: string): Promise<boolean> {
    const url = testUrl || 'https://www.google.com';
    
    try {
      const connection = await this.createConnection(url, {
        timeout: 10000,
        proxy
      });
      
      if (connection.socket && !connection.socket.destroyed) {
        connection.socket.destroy();
      }
      
      return true;
    } catch {
      return false;
    }
  }

  private getPoolStats(): any {
    const stats: any = {};
    
    const pools = Array.from(this.pools.entries());
    for (const [id, pool] of pools) {
      stats[id] = { ...pool.stats };
    }
    
    return stats;
  }

  private shouldBypassProxy(targetUrl: string): boolean {
    try {
      const parsedUrl = new URL(targetUrl);
      const hostname = parsedUrl.hostname;
      const port = parsedUrl.port;

      // Check bypass rules
      for (const rule of this.bypassRules) {
        if (this.matchesBypassRule(hostname, port, rule)) {
          return true;
        }
      }

      // Check common bypass patterns
      const localPatterns = [
        'localhost',
        '127.0.0.1',
        '::1',
        '*.local',
        '10.*',
        '172.16.*',
        '172.17.*',
        '172.18.*',
        '172.19.*',
        '172.20.*',
        '172.21.*',
        '172.22.*',
        '172.23.*',
        '172.24.*',
        '172.25.*',
        '172.26.*',
        '172.27.*',
        '172.28.*',
        '172.29.*',
        '172.30.*',
        '172.31.*',
        '192.168.*'
      ];

      return localPatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(hostname);
        }
        return hostname === pattern;
      });
    } catch (error) {
      // If URL parsing fails, don't bypass
      return false;
    }
  }

  private matchesBypassRule(hostname: string, port: string, rule: ProxyBypassRule): boolean {
    // Check hostname pattern
    if (rule.pattern) {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(hostname)) {
        return false;
      }
    }

    // Check port range
    if (rule.ports && port) {
      const portNum = parseInt(port, 10);
      if (!rule.ports.includes(portNum)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Stop proxy operations
   */
  stop(): void {
    if (this.healthChecker) {
      this.healthChecker.stop();
    }
    if (this.metricsCollector) {
      this.metricsCollector.stop();
    }
  }

  /**
   * Cleanup proxy resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop proxy operations
      this.stop();
      
      // Close all connections
      for (const connection of this.connections.values()) {
        try {
          if (connection.socket && !connection.socket.destroyed) {
            connection.socket.destroy();
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }
      this.connections.clear();
      
      // Close all tunnels
      for (const tunnel of this.tunnels.values()) {
        try {
          if (tunnel.socket && !tunnel.socket.destroyed) {
            tunnel.socket.destroy();
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }
      this.tunnels.clear();
      
      // Clear pools and scripts
      this.pools.clear();
      this.pacScripts.clear();
      
    } catch (error) {
      // Ignore cleanup errors
    }
  }

}

// Helper Classes

interface ProxyRotationConfig {
  servers: ProxyServer[];
  strategy?: string;
  weights?: Record<string, number>;
  sticky?: boolean;
  stickyTTL?: number;
}

class RotationManager extends EventEmitter {
  private servers: ProxyServer[] = [];
  private strategy: string = 'round-robin';
  private currentIndex: number = 0;
  private weights: Map<string, number> = new Map();
  private sticky: boolean = false;
  private stickyMap: Map<string, ProxyServer> = new Map();
  private stickyTTL: number = 3600000;

  async initialize(config: ProxyRotationConfig): Promise<void> {
    this.servers = config.servers;
    this.strategy = config.strategy || 'round-robin';
    this.sticky = config.sticky || false;
    this.stickyTTL = config.stickyTTL || 3600000;

    if (config.weights) {
      for (const [key, weight] of Object.entries(config.weights)) {
        this.weights.set(key, weight);
      }
    }

    if (this.sticky) {
      this.startStickyCleanup();
    }
  }

  getNextProxy(clientId?: string): ProxyServer {
    if (this.sticky && clientId) {
      const sticky = this.stickyMap.get(clientId);
      if (sticky) {
        return sticky;
      }
    }

    let proxy: ProxyServer;

    switch (this.strategy) {
      case 'round-robin':
        proxy = this.roundRobin();
        break;
        
      case 'weighted':
        proxy = this.weightedRandom();
        break;
        
      case 'least-connections':
        proxy = this.leastConnections();
        break;
        
      case 'random':
        proxy = this.random();
        break;
        
      default:
        proxy = this.roundRobin();
    }

    if (this.sticky && clientId) {
      this.stickyMap.set(clientId, proxy);
      setTimeout(() => {
        this.stickyMap.delete(clientId);
      }, this.stickyTTL);
    }

    this.emit('rotated', { proxy, strategy: this.strategy });
    return proxy;
  }

  private roundRobin(): ProxyServer {
    const proxy = this.servers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;
    if (!proxy) {
      throw new Error('No proxy server available');
    }
    return proxy;
  }

  private weightedRandom(): ProxyServer {
    const totalWeight = Array.from(this.weights.values()).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (const server of this.servers) {
      const key = `${server.host}:${server.port}`;
      const weight = this.weights.get(key) || 1;
      
      random -= weight;
      if (random <= 0) {
        return server;
      }
    }
    
    return this.servers[0] || this.roundRobin();
  }

  private leastConnections(): ProxyServer {
    // This would need connection tracking from ProxyManager
    return this.roundRobin();
  }

  private random(): ProxyServer {
    const index = Math.floor(Math.random() * this.servers.length);
    const proxy = this.servers[index];
    if (!proxy) {
      throw new Error('No proxy server available');
    }
    return proxy;
  }

  private startStickyCleanup(): void {
    setInterval(() => {
      // const now = Date.now();  // Not used in simplified implementation
      const toRemove: string[] = [];
      
      // This is simplified - in production, we'd track expiry times
      const clientIds = Array.from(this.stickyMap.keys());
      for (const clientId of clientIds) {
        // Check if expired - for now just clear all
        toRemove.push(clientId);
      }
      
      for (const clientId of toRemove) {
        this.stickyMap.delete(clientId);
      }
    }, 60000); // Every minute
  }
}

class HealthChecker extends EventEmitter {
  private health: Map<string, ProxyHealth> = new Map();
  private intervals: Map<string, NodeJS.Timer> = new Map();

  async checkProxy(proxy: ProxyServer): Promise<ProxyHealth> {
    const key = `${proxy.host}:${proxy.port}`;
    const startTime = Date.now();
    
    // Create a minimal ProxyConfig interface for health checking
    let health: ProxyHealth = {
      proxy: {} as ProxyConfigInterface,
      healthy: false,
      lastCheck: new Date(),
      responseTime: 0,
      successRate: 0,
      errorCount: 0
    };

    try {
      // Create test connection
      const socket = await this.createTestConnection(proxy);
      
      health.healthy = true;
      health.responseTime = Date.now() - startTime;
      
      socket.destroy();
      
      // Update success rate
      const previous = this.health.get(key);
      if (previous) {
        health.successRate = (previous.successRate * 0.9) + 0.1;
        health.errorCount = 0;
      } else {
        health.successRate = 1;
      }
    } catch (error) {
      health.healthy = false;
      health.error = error instanceof Error ? error.message : String(error);
      
      // Update error count
      const previous = this.health.get(key);
      if (previous) {
        health.errorCount = previous.errorCount + 1;
        health.successRate = previous.successRate * 0.9;
      } else {
        health.errorCount = 1;
        health.successRate = 0;
      }
    }

    this.health.set(key, health);
    this.emit('healthCheck', health);
    
    return health;
  }

  private async createTestConnection(proxy: ProxyServer): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({
        host: proxy.host,
        port: proxy.port
      });

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('Health check timeout'));
      }, 5000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        
        if (proxy.protocol === 'http' || proxy.protocol === 'https') {
          // Send test CONNECT request
          const request = 'CONNECT www.google.com:443 HTTP/1.1\r\n' +
                         'Host: www.google.com:443\r\n' +
                         'Proxy-Connection: Keep-Alive\r\n\r\n';
          
          socket.write(request);
          
          socket.once('data', (data) => {
            const response = data.toString();
            if (response.includes('200')) {
              resolve(socket);
            } else {
              const firstLine = response.split('\r\n')[0];
            reject(new Error(`Proxy returned: ${firstLine || 'Unknown response'}`));
            }
          });
        } else {
          // For SOCKS, just connection is enough for basic check
          resolve(socket);
        }
      });

      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  isHealthy(proxy: ProxyServer): boolean {
    const key = `${proxy.host}:${proxy.port}`;
    const health = this.health.get(key);
    
    if (!health) {
      return true; // Assume healthy if not checked yet
    }
    
    return health.healthy && health.errorCount < 3;
  }

  getStats(): any {
    const stats: any = {};
    
    const healthEntries = Array.from(this.health.entries());
    for (const [key, health] of healthEntries) {
      stats[key] = {
        healthy: health.healthy,
        successRate: health.successRate,
        errorCount: health.errorCount,
        lastCheck: health.lastCheck,
        responseTime: health.responseTime
      };
    }
    
    return stats;
  }

  stop(): void {
    const intervals = Array.from(this.intervals.values());
    for (const interval of intervals) {
      clearInterval(interval as any);
    }
    this.intervals.clear();
  }
}

class MetricsCollector extends EventEmitter {
  private metrics: ProxyMetrics = {
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      active: 0
    },
    bytes: {
      sent: 0,
      received: 0
    },
    latency: {
      min: Infinity,
      max: 0,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0
    },
    connections: {
      total: 0,
      active: 0,
      idle: 0,
      failed: 0
    },
    errors: new Map()
  };

  private latencyValues: number[] = [];
  private readonly maxLatencyValues = 10000;

  recordConnection(_proxy: ProxyServer | null, duration: number, success: boolean): void {
    this.metrics.connections.total++;
    
    if (success) {
      this.metrics.connections.active++;
      this.recordLatency(duration);
    } else {
      this.metrics.connections.failed++;
    }
  }

  recordRequest(success: boolean): void {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
  }

  recordBytes(sent: number, received: number): void {
    this.metrics.bytes.sent += sent;
    this.metrics.bytes.received += received;
  }

  recordError(error: string): void {
    const count = this.metrics.errors.get(error) || 0;
    this.metrics.errors.set(error, count + 1);
  }

  private recordLatency(latency: number): void {
    this.latencyValues.push(latency);
    
    // Keep only recent values
    if (this.latencyValues.length > this.maxLatencyValues) {
      this.latencyValues = this.latencyValues.slice(-this.maxLatencyValues);
    }
    
    // Update metrics
    this.updateLatencyMetrics();
  }

  private updateLatencyMetrics(): void {
    if (this.latencyValues.length === 0) return;
    
    const sorted = [...this.latencyValues].sort((a, b) => a - b);
    const len = sorted.length;
    
    this.metrics.latency.min = sorted[0] || 0;
    this.metrics.latency.max = sorted[len - 1] || 0;
    this.metrics.latency.avg = sorted.reduce((a, b) => a + b, 0) / len;
    this.metrics.latency.p50 = sorted[Math.floor(len * 0.5)] || 0;
    this.metrics.latency.p95 = sorted[Math.floor(len * 0.95)] || 0;
    this.metrics.latency.p99 = sorted[Math.floor(len * 0.99)] || 0;
  }

  getMetrics(): ProxyMetrics {
    return {
      ...this.metrics,
      timestamp: new Date()
    };
  }

  stop(): void {
    // Cleanup if needed
  }
}

export class ProxyError extends Error {
  code?: string | undefined;
  details?: any;
  proxy?: ProxyServer;
  retry?: boolean;
  
  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.details = details;
  }
}

interface AuthenticationHandler {
  createHeader: (auth: ProxyAuthentication, challenge?: string, socket?: net.Socket) => string | Promise<string | null>;
}

// Export singleton instance
export const proxyManager = ProxyManager.getInstance();