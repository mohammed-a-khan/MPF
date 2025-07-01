/**
 * CS Test Automation Framework - ProxyConfig
 * 
 * Comprehensive proxy configuration management with validation,
 * serialization, and environment variable support.
 * 
 * @author CS Test Automation Team
 * @version 4.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ProxyProtocol,
  ProxyRotation,
  ProxyHealthCheck,
  ProxyMetricsConfig,
  ProxyConnectionPool,
  ProxyRetry,
  ProxyServer,
  ProxyCertificate,
  ProxyEnvironment,
  ProxyValidationResult,
  ProxyConfigSchema
} from './proxy.types';

export class ProxyConfig {
  enabled: boolean = false;
  servers: ProxyServer[] = [];
  bypass: string[] = [];
  pacUrl?: string;
  pacScript?: string;
  rotation?: ProxyRotation;
  healthCheck?: ProxyHealthCheck;
  metrics?: ProxyMetricsConfig;
  connectionPool?: ProxyConnectionPool;
  retry?: ProxyRetry;
  certificates?: ProxyCertificate[];
  environment?: ProxyEnvironment;
  
  private static readonly CONFIG_SCHEMA: ProxyConfigSchema = {
    enabled: { type: 'boolean', required: false, default: false },
    servers: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        properties: {
          protocol: {
            type: 'string',
            enum: ['http', 'https', 'socks4', 'socks5'],
            required: true
          },
          host: { type: 'string', required: true, pattern: /^[a-zA-Z0-9.-]+$/ },
          port: { type: 'number', required: true, min: 1, max: 65535 },
          auth: {
            type: 'object',
            required: false,
            properties: {
              username: { type: 'string', required: true },
              password: { type: 'string', required: true },
              type: {
                type: 'string',
                enum: ['basic', 'digest', 'ntlm', 'negotiate'],
                required: false,
                default: 'basic'
              },
              domain: { type: 'string', required: false },
              workstation: { type: 'string', required: false }
            }
          },
          priority: { type: 'number', required: false, default: 1 },
          tags: { type: 'array', items: { type: 'string' }, required: false }
        }
      }
    },
    bypass: {
      type: 'array',
      required: false,
      items: { type: 'string' },
      default: []
    },
    pacUrl: { type: 'string', required: false, pattern: /^https?:\/\// },
    pacScript: { type: 'string', required: false },
    rotation: {
      type: 'object',
      required: false,
      properties: {
        enabled: { type: 'boolean', required: false, default: false },
        strategy: {
          type: 'string',
          enum: ['round-robin', 'weighted', 'least-connections', 'random'],
          required: false,
          default: 'round-robin'
        },
        weights: { type: 'object', required: false },
        sticky: { type: 'boolean', required: false, default: false },
        stickyTTL: { type: 'number', required: false, default: 3600000 }
      }
    },
    healthCheck: {
      type: 'object',
      required: false,
      properties: {
        enabled: { type: 'boolean', required: false, default: true },
        interval: { type: 'number', required: false, default: 60000 },
        timeout: { type: 'number', required: false, default: 5000 },
        retries: { type: 'number', required: false, default: 3 },
        testUrl: { type: 'string', required: false }
      }
    },
    metrics: {
      type: 'object',
      required: false,
      properties: {
        enabled: { type: 'boolean', required: false, default: true },
        collectInterval: { type: 'number', required: false, default: 60000 },
        retentionPeriod: { type: 'number', required: false, default: 86400000 }
      }
    },
    connectionPool: {
      type: 'object',
      required: false,
      properties: {
        maxSize: { type: 'number', required: false, default: 100 },
        maxIdleTime: { type: 'number', required: false, default: 300000 },
        acquireTimeout: { type: 'number', required: false, default: 30000 }
      }
    },
    retry: {
      type: 'object',
      required: false,
      properties: {
        maxAttempts: { type: 'number', required: false, default: 3 },
        delay: { type: 'number', required: false, default: 1000 },
        backoff: { type: 'number', required: false, default: 2 },
        maxDelay: { type: 'number', required: false, default: 30000 }
      }
    }
  };

  constructor(config?: Partial<ProxyConfig>) {
    if (config) {
      Object.assign(this, config);
    }
  }

  static fromEnvironment(): ProxyConfig {
    const config = new ProxyConfig();
    
    // Check standard proxy environment variables
    const httpProxy = process.env['HTTP_PROXY'] || process.env['http_proxy'];
    const httpsProxy = process.env['HTTPS_PROXY'] || process.env['https_proxy'];
    const socksProxy = process.env['SOCKS_PROXY'] || process.env['socks_proxy'];
    const noProxy = process.env['NO_PROXY'] || process.env['no_proxy'];
    
    // Parse proxy URLs
    if (httpProxy) {
      const server = ProxyConfig.parseProxyUrl(httpProxy, 'http');
      if (server) config.servers.push(server);
    }
    
    if (httpsProxy) {
      const server = ProxyConfig.parseProxyUrl(httpsProxy, 'https');
      if (server) config.servers.push(server);
    }
    
    if (socksProxy) {
      const server = ProxyConfig.parseProxyUrl(socksProxy, 'socks5');
      if (server) config.servers.push(server);
    }
    
    // Parse bypass list
    if (noProxy) {
      config.bypass = noProxy.split(',').map(s => s.trim()).filter(s => s);
    }
    
    // Check for PAC URL
    const pacUrl = process.env['PAC_URL'] || process.env['pac_url'];
    if (pacUrl) {
      config.pacUrl = pacUrl;
    }
    
    // Enable if any proxy is configured
    config.enabled = config.servers.length > 0 || !!config.pacUrl;
    
    // Load additional settings from environment
    config.loadEnvironmentSettings();
    
    return config;
  }

  static fromFile(filePath: string): ProxyConfig {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Proxy configuration file not found: ${absolutePath}`);
    }
    
    const content = fs.readFileSync(absolutePath, 'utf8');
    let data: any;
    
    try {
      if (filePath.endsWith('.json')) {
        data = JSON.parse(content);
      } else if (filePath.endsWith('.js')) {
        delete require.cache[absolutePath];
        data = require(absolutePath);
      } else {
        throw new Error('Unsupported configuration file format. Use .json or .js');
      }
    } catch (error) {
      throw new Error(`Failed to parse proxy configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return ProxyConfig.fromObject(data);
  }

  static fromObject(obj: any): ProxyConfig {
    const validation = ProxyConfig.validate(obj);
    
    if (!validation.valid) {
      throw new Error(`Invalid proxy configuration: ${validation.errors.join(', ')}`);
    }
    
    const config = new ProxyConfig();
    
    // Apply defaults and transform
    const processed = ProxyConfig.applyDefaults(obj);
    Object.assign(config, processed);
    
    return config;
  }

  static validate(config: any): ProxyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate against schema
    ProxyConfig.validateAgainstSchema(config, ProxyConfig.CONFIG_SCHEMA, '', errors, warnings);
    
    // Additional validation
    if (config.servers && config.servers.length > 0) {
      // Validate each server
      config.servers.forEach((server: any, index: number) => {
        if (server.auth) {
          // NTLM specific validation
          if (server.auth.type === 'ntlm' && !server.auth.domain) {
            warnings.push(`Server ${index}: NTLM authentication typically requires a domain`);
          }
          
          // Password strength warning
          if (server.auth.password && server.auth.password.length < 8) {
            warnings.push(`Server ${index}: Weak password detected`);
          }
        }
        
        // Port validation
        if (server.protocol === 'http' && server.port === 443) {
          warnings.push(`Server ${index}: HTTP proxy on port 443 is unusual`);
        }
        
        if (server.protocol === 'https' && server.port === 80) {
          warnings.push(`Server ${index}: HTTPS proxy on port 80 is unusual`);
        }
      });
    }
    
    // PAC validation
    if (config.pacUrl && config.pacScript) {
      warnings.push('Both pacUrl and pacScript are specified. pacUrl will take precedence');
    }
    
    // Rotation validation
    if (config.rotation?.enabled && (!config.servers || config.servers.length < 2)) {
      errors.push('Rotation requires at least 2 proxy servers');
    }
    
    if (config.rotation?.strategy === 'weighted' && !config.rotation.weights) {
      errors.push('Weighted rotation strategy requires weights configuration');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static validateAgainstSchema(
    value: any,
    schema: any,
    path: string,
    errors: string[],
    warnings: string[]
  ): void {
    if (schema.required && value === undefined) {
      errors.push(`${path} is required`);
      return;
    }
    
    if (value === undefined) {
      return;
    }
    
    switch (schema.type) {
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${path} must be a boolean`);
        }
        break;
        
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${path} must be a string`);
        } else {
          if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
          }
          if (schema.pattern && !schema.pattern.test(value)) {
            errors.push(`${path} has invalid format`);
          }
        }
        break;
        
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${path} must be a number`);
        } else {
          if (schema.min !== undefined && value < schema.min) {
            errors.push(`${path} must be at least ${schema.min}`);
          }
          if (schema.max !== undefined && value > schema.max) {
            errors.push(`${path} must be at most ${schema.max}`);
          }
        }
        break;
        
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${path} must be an array`);
        } else if (schema.items) {
          value.forEach((item: any, index: number) => {
            ProxyConfig.validateAgainstSchema(
              item,
              schema.items,
              `${path}[${index}]`,
              errors,
              warnings
            );
          });
        }
        break;
        
      case 'object':
        if (typeof value !== 'object' || value === null) {
          errors.push(`${path} must be an object`);
        } else if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            ProxyConfig.validateAgainstSchema(
              value[key],
              propSchema,
              path ? `${path}.${key}` : key,
              errors,
              warnings
            );
          }
        }
        break;
    }
  }

  private static applyDefaults(config: any, schema: any = ProxyConfig.CONFIG_SCHEMA): any {
    if (config === undefined && schema.default !== undefined) {
      return schema.default;
    }
    
    if (schema.type === 'object' && schema.properties && config) {
      const result: any = { ...config };
      
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result[key] = ProxyConfig.applyDefaults(config[key], propSchema as any);
      }
      
      return result;
    }
    
    if (schema.type === 'array' && Array.isArray(config) && schema.items) {
      return config.map(item => ProxyConfig.applyDefaults(item, schema.items));
    }
    
    return config;
  }

  private static parseProxyUrl(proxyUrl: string, defaultProtocol?: ProxyProtocol): ProxyServer | null {
    try {
      const parsed = new URL(proxyUrl);
      
      let protocol = parsed.protocol.replace(':', '') as ProxyProtocol;
      
      // Handle special cases
      if (protocol === 'socks' as ProxyProtocol) protocol = 'socks5';
      if (!['http', 'https', 'socks4', 'socks5'].includes(protocol)) {
        protocol = defaultProtocol || 'http';
      }
      
      const server: ProxyServer = {
        protocol,
        host: parsed.hostname,
        port: parseInt(parsed.port) || (protocol === 'https' ? 443 : protocol.startsWith('socks') ? 1080 : 80)
      };
      
      // Extract authentication
      if (parsed.username) {
        server.auth = {
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password || '')
        };
      }
      
      return server;
    } catch {
      // Try parsing as host:port
      const match = proxyUrl.match(/^([^:]+):(\d+)$/);
      if (match) {
        return {
          protocol: defaultProtocol || 'http',
          host: match[1]!,
          port: parseInt(match[2]!)
        };
      }
      
      return null;
    }
  }

  private loadEnvironmentSettings(): void {
    // Load rotation settings
    if (process.env['PROXY_ROTATION_ENABLED'] === 'true') {
      this.rotation = {
        enabled: true,
        strategy: (process.env['PROXY_ROTATION_STRATEGY'] as any) || 'round-robin',
        servers: []
      };
    }
    
    // Load health check settings
    if (process.env['PROXY_HEALTH_CHECK_ENABLED'] !== undefined) {
      this.healthCheck = {
        enabled: process.env['PROXY_HEALTH_CHECK_ENABLED'] === 'true',
        interval: parseInt(process.env['PROXY_HEALTH_CHECK_INTERVAL'] || '60000')
      };
    }
    
    // Load retry settings
    if (process.env['PROXY_RETRY_ATTEMPTS']) {
      this.retry = {
        maxAttempts: parseInt(process.env['PROXY_RETRY_ATTEMPTS']),
        delay: parseInt(process.env['PROXY_RETRY_DELAY'] || '1000'),
        backoff: parseFloat(process.env['PROXY_RETRY_BACKOFF'] || '2')
      };
    }
    
    // Load connection pool settings
    if (process.env['PROXY_POOL_SIZE']) {
      this.connectionPool = {
        maxSize: parseInt(process.env['PROXY_POOL_SIZE']),
        maxIdleTime: parseInt(process.env['PROXY_POOL_IDLE_TIME'] || '300000')
      };
    }
  }

  addServer(server: ProxyServer): void {
    const validation = ProxyConfig.validateServer(server);
    
    if (!validation.valid) {
      throw new Error(`Invalid proxy server: ${validation.errors.join(', ')}`);
    }
    
    this.servers.push(server);
  }

  removeServer(predicate: (server: ProxyServer) => boolean): void {
    this.servers = this.servers.filter(server => !predicate(server));
  }

  getServer(predicate: (server: ProxyServer) => boolean): ProxyServer | undefined {
    return this.servers.find(predicate);
  }

  getServersByTag(tag: string): ProxyServer[] {
    return this.servers.filter(server => server.tags?.includes(tag));
  }

  addBypassRule(pattern: string): void {
    if (!this.bypass.includes(pattern)) {
      this.bypass.push(pattern);
    }
  }

  removeBypassRule(pattern: string): void {
    this.bypass = this.bypass.filter(p => p !== pattern);
  }

  isEnabled(): boolean {
    return this.enabled && (this.servers.length > 0 || !!this.pacUrl || !!this.pacScript);
  }

  toObject(): any {
    return {
      enabled: this.enabled,
      servers: this.servers.map(server => ({
        ...server,
        auth: server.auth ? {
          ...server.auth,
          password: '[REDACTED]'
        } : undefined
      })),
      bypass: this.bypass,
      pacUrl: this.pacUrl,
      pacScript: this.pacScript ? '[PAC SCRIPT]' : undefined,
      rotation: this.rotation,
      healthCheck: this.healthCheck,
      metrics: this.metrics,
      connectionPool: this.connectionPool,
      retry: this.retry
    };
  }

  toJSON(): string {
    return JSON.stringify(this.toObject(), null, 2);
  }

  saveToFile(filePath: string): void {
    const content = this.toJSON();
    fs.writeFileSync(filePath, content, 'utf8');
  }

  clone(): ProxyConfig {
    return ProxyConfig.fromObject(JSON.parse(JSON.stringify(this)));
  }

  merge(other: Partial<ProxyConfig>): ProxyConfig {
    const merged = this.clone();
    
    if (other.servers) {
      merged.servers = [...merged.servers, ...other.servers];
    }
    
    if (other.bypass) {
      merged.bypass = [...new Set([...merged.bypass, ...other.bypass])];
    }
    
    // Merge other properties
    Object.assign(merged, {
      enabled: other.enabled !== undefined ? other.enabled : merged.enabled,
      pacUrl: other.pacUrl || merged.pacUrl,
      pacScript: other.pacScript || merged.pacScript,
      rotation: other.rotation ? { ...merged.rotation, ...other.rotation } : merged.rotation,
      healthCheck: other.healthCheck ? { ...merged.healthCheck, ...other.healthCheck } : merged.healthCheck,
      metrics: other.metrics ? { ...merged.metrics, ...other.metrics } : merged.metrics,
      connectionPool: other.connectionPool ? { ...merged.connectionPool, ...other.connectionPool } : merged.connectionPool,
      retry: other.retry ? { ...merged.retry, ...other.retry } : merged.retry
    });
    
    return merged;
  }

  private static validateServer(server: any): ProxyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!server.protocol) {
      errors.push('Server protocol is required');
    } else if (!['http', 'https', 'socks4', 'socks5'].includes(server.protocol)) {
      errors.push('Invalid server protocol');
    }
    
    if (!server.host) {
      errors.push('Server host is required');
    }
    
    if (!server.port) {
      errors.push('Server port is required');
    } else if (server.port < 1 || server.port > 65535) {
      errors.push('Server port must be between 1 and 65535');
    }
    
    if (server.auth) {
      if (!server.auth.username) {
        errors.push('Authentication username is required');
      }
      if (!server.auth.password) {
        errors.push('Authentication password is required');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Static factory methods for common configurations

  static createBasicProxy(host: string, port: number, username?: string, password?: string): ProxyConfig {
    const config = new ProxyConfig();
    config.enabled = true;
    
    const server: ProxyServer = {
      protocol: 'http',
      host,
      port
    };
    
    if (username && password) {
      server.auth = {
        username,
        password
      };
    }
    
    config.servers = [server];
    return config;
  }

  static createSOCKS5Proxy(host: string, port: number, username?: string, password?: string): ProxyConfig {
    const config = new ProxyConfig();
    config.enabled = true;
    
    const server: ProxyServer = {
      protocol: 'socks5',
      host,
      port
    };
    
    if (username && password) {
      server.auth = {
        username,
        password
      };
    }
    
    config.servers = [server];
    return config;
  }

  static createRotatingProxy(servers: ProxyServer[], strategy: string = 'round-robin'): ProxyConfig {
    const config = new ProxyConfig();
    config.enabled = true;
    config.servers = servers;
    config.rotation = {
      enabled: true,
      strategy: strategy as any,
      servers: []
    };
    
    return config;
  }

  static createPACProxy(pacUrl: string): ProxyConfig {
    const config = new ProxyConfig();
    config.enabled = true;
    config.pacUrl = pacUrl;
    
    return config;
  }
}