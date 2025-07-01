import { ConfigurationManager } from './ConfigurationManager';
import { CryptoUtils } from '../utils/CryptoUtils';
import { Logger } from '../utils/Logger';
import { ConfigMap } from './types/config.types';

export interface EncryptionConfig {
  enabled: boolean;
  internalKey?: string;
}

export class EncryptionConfigurationManager {
  private static encryptionConfig: EncryptionConfig = {
    enabled: true,
    internalKey: 'CS-Framework-2024-Internal-Encryption-Key-V1'
  };
  
  private static decryptionCache = new Map<string, string>();
  private static logger = Logger.getInstance();
  private static readonly ENCRYPTED_PREFIX = 'ENCRYPTED:';

  static initializeEncryption(config: Partial<EncryptionConfig>): void {
    this.encryptionConfig = { ...this.encryptionConfig, ...config };
    this.logger.info('Encryption configuration initialized', {
      enabled: this.encryptionConfig.enabled,
      hasInternalKey: !!this.encryptionConfig.internalKey
    });
  }

  static get(key: string, defaultValue: string = ''): string {
    const rawValue = ConfigurationManager.get(key, defaultValue);
    return this.processValueSync(key, rawValue);
  }

  static getDecrypted(key: string, defaultValue?: string): string {
    const rawValue = ConfigurationManager.get(key, defaultValue || '');
    if (!rawValue) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Required encrypted configuration '${key}' not found`);
    }

    const processedValue = this.processValueSync(key, rawValue);
    
    if (rawValue.startsWith(this.ENCRYPTED_PREFIX) && processedValue === rawValue) {
      throw new Error(`Failed to decrypt configuration value for key '${key}'`);
    }

    return processedValue;
  }

  static getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = this.get(key, defaultValue.toString());
    return this.parseBoolean(value) ?? defaultValue;
  }

  static getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key, defaultValue?.toString() || '');
    return this.parseNumber(value) ?? defaultValue;
  }

  static getArray(key: string, delimiter: string = ','): string[] {
    const value = this.get(key, '');
    if (!value) return [];
    return value.split(delimiter).map(item => item.trim()).filter(item => item.length > 0);
  }

  static getJSON<T = any>(key: string, defaultValue?: T): T {
    const value = this.get(key, defaultValue ? JSON.stringify(defaultValue) : '');
    if (!value) {
      return defaultValue as T;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      this.logger.warn(`Failed to parse JSON for key '${key}': ${error}`);
      return defaultValue as T;
    }
  }

  private static processValueSync(key: string, value: string): string {
    if (!value || !this.encryptionConfig.enabled) {
      return value;
    }

    if (!value.startsWith(this.ENCRYPTED_PREFIX)) {
      return value;
    }

    const cacheKey = this.getCacheKey(key, value);
    if (this.decryptionCache.has(cacheKey)) {
      return this.decryptionCache.get(cacheKey)!;
    }

    try {
      const decryptedValue = this.decryptValueSync(value);
      
      this.decryptionCache.set(cacheKey, decryptedValue);
      
      this.logger.debug(`Successfully decrypted configuration value for key: ${key}`);
      this.auditConfigAccess(key, true);
      return decryptedValue;
      
    } catch (error) {
      this.logger.error(`Failed to decrypt configuration value for key '${key}': ${error}`);
      
      if (this.encryptionConfig.enabled) {
        throw new Error(`Decryption failed for key '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      return value;
    }
  }

  private static async processValueAsync(key: string, value: string): Promise<string> {
    if (!value || !this.encryptionConfig.enabled) {
      return value;
    }

    if (!value.startsWith(this.ENCRYPTED_PREFIX)) {
      return value;
    }

    const cacheKey = this.getCacheKey(key, value);
    if (this.decryptionCache.has(cacheKey)) {
      return this.decryptionCache.get(cacheKey)!;
    }

    try {
      const decryptedValue = await this.decryptValue(value);
      
      this.decryptionCache.set(cacheKey, decryptedValue);
      
      this.logger.debug(`Successfully decrypted configuration value for key: ${key}`);
      this.auditConfigAccess(key, true);
      return decryptedValue;
      
    } catch (error) {
      this.logger.error(`Failed to decrypt configuration value for key '${key}': ${error}`);
      
      if (this.encryptionConfig.enabled) {
        throw new Error(`Decryption failed for key '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      return value;
    }
  }

  private static async decryptValue(encryptedValue: string): Promise<string> {
    if (!encryptedValue.startsWith(this.ENCRYPTED_PREFIX)) {
      return encryptedValue;
    }

    const base64Data = encryptedValue.substring(this.ENCRYPTED_PREFIX.length);
    
    try {
      const encryptionData = JSON.parse(atob(base64Data));
      
      const internalKey = this.getInternalKey();
      
      const fixedSalt = Buffer.from('CS-Framework-Salt-2024').toString('base64');
      
      return await CryptoUtils.decrypt(
        encryptionData.encrypted,
        internalKey,
        fixedSalt,
        encryptionData.iv,
        encryptionData.tag || '',
        {
          iterations: 10000
        }
      );
      
    } catch (error) {
      throw new Error(`Invalid encrypted data format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static decryptValueSync(encryptedValue: string): string {
    if (!encryptedValue.startsWith(this.ENCRYPTED_PREFIX)) {
      return encryptedValue;
    }

    this.logger.warn(`Synchronous decryption not supported for: ${encryptedValue.substring(0, 20)}...`);
    throw new Error('Synchronous decryption not implemented. Use async methods for encrypted values.');
  }

  private static getInternalKey(): string {
    return this.encryptionConfig.internalKey || 'CS-Framework-2024-Internal-Encryption-Key-V1';
  }

  private static getCacheKey(configKey: string, encryptedValue: string): string {
    return `${configKey}:${encryptedValue.substring(0, 50)}`;
  }

  static clearDecryptionCache(): void {
    this.decryptionCache.clear();
    this.logger.debug('Decryption cache cleared');
  }

  static getDecryptionCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.decryptionCache.size,
      keys: Array.from(this.decryptionCache.keys())
    };
  }

  static async encryptValue(plainValue: string): Promise<string> {
    const internalKey = this.getInternalKey();
    
    try {
      const encrypted = await CryptoUtils.encrypt(plainValue, internalKey, {
        saltLength: 16,
        iterations: 10000
      });
      
      const encryptedData = {
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag
      };
      
      const base64Data = btoa(JSON.stringify(encryptedData));
      return `${this.ENCRYPTED_PREFIX}${base64Data}`;
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async testDecryption(encryptedValue: string): Promise<{ success: boolean; error?: string; decrypted?: string }> {
    try {
      const decrypted = await this.decryptValue(encryptedValue);
      return { success: true, decrypted };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async getAllDecrypted(): Promise<ConfigMap> {
    const allConfig = ConfigurationManager.getAll();
    const decrypted: ConfigMap = {};

    for (const [key, value] of Object.entries(allConfig)) {
      try {
        decrypted[key] = await this.processValueAsync(key, value);
      } catch (error) {
        this.logger.warn(`Failed to decrypt value for key '${key}': ${error}`);
        decrypted[key] = `[DECRYPTION_FAILED: ${value}]`;
      }
    }

    return decrypted;
  }

  static async validateEncryptionConfig(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.encryptionConfig.enabled) {
      warnings.push('Encryption is disabled');
    }

    try {
      const key = this.getInternalKey();
      if (!key) {
        errors.push('Internal encryption key not available');
      }
    } catch (error) {
      errors.push(`Internal key error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const allConfig = ConfigurationManager.getAll();
    const encryptedKeys = Object.keys(allConfig).filter(key => 
      allConfig[key] && typeof allConfig[key] === 'string' && allConfig[key].startsWith(this.ENCRYPTED_PREFIX)
    );

    if (encryptedKeys.length === 0) {
      warnings.push('No encrypted values found in configuration');
    } else {
      this.logger.info(`Found ${encryptedKeys.length} encrypted configuration values: ${encryptedKeys.join(', ')}`);
    }

    for (const key of encryptedKeys) {
      const value = allConfig[key];
      if (!value || typeof value !== 'string') continue;
      const testResult = await this.testDecryption(value);
      if (!testResult.success) {
        errors.push(`Decryption test failed for key '${key}': ${testResult.error}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static auditConfigAccess(key: string, wasEncrypted: boolean): void {
    if (wasEncrypted) {
      this.logger.info('Encrypted configuration accessed', {
        key,
        timestamp: new Date().toISOString(),
        source: 'EncryptionConfigurationManager'
      });
    }
  }

  private static parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') return true;
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') return false;
    return undefined;
  }

  private static parseNumber(value: string | undefined): number | undefined {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return isNaN(parsed) ? undefined : parsed;
  }
} 
