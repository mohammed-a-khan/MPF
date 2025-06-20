import { ConfigurationManager } from './ConfigurationManager';
import { EncryptionConfigurationManager } from './EncryptionConfigurationManager';
import { Logger } from '../utils/Logger';
import { ConfigurationOptions } from './types/config.types';

export interface SecureConfigOptions extends Partial<ConfigurationOptions> {
  enableEncryption?: boolean;
  validateEncryption?: boolean;
  migrationMode?: boolean;
  internalKey?: string;
}

/**
 * Secure Configuration Loader with automatic encryption detection and setup
 * 
 * This class provides a simple way to:
 * 1. Load configuration with automatic encryption support
 * 2. Validate existing encrypted values
 * 3. Migrate from plain to encrypted configuration
 * 4. Provide secure access patterns
 */
export class SecureConfigurationLoader {
  private static logger = Logger.getInstance();
  private static isInitialized = false;

  /**
   * Initialize secure configuration with encryption support
   */
  static async initialize(options: SecureConfigOptions = {}): Promise<void> {
    const {
      enableEncryption = true,
      validateEncryption = true,
      migrationMode = false,
      internalKey,
      ...configOptions
    } = options;

    try {
      // Load base configuration first
      if (configOptions.environment) {
        await ConfigurationManager.loadConfiguration(configOptions.environment, configOptions);
      }

      if (enableEncryption) {
        // Initialize encryption configuration
        EncryptionConfigurationManager.initializeEncryption({
          enabled: true,
          internalKey: internalKey
        });

        if (validateEncryption) {
          // Validate encryption setup
          const validation = await EncryptionConfigurationManager.validateEncryptionConfig();
          
          if (!validation.valid) {
            this.logger.error('Encryption validation failed', { errors: validation.errors });
            if (!migrationMode) {
              throw new Error(`Encryption validation failed: ${validation.errors.join(', ')}`);
            }
          }

          if (validation.warnings.length > 0) {
            this.logger.warn('Encryption validation warnings', { warnings: validation.warnings });
          }
        }

        this.logger.info('Secure configuration initialized with encryption support');
      } else {
        this.logger.warn('Encryption disabled - sensitive data will not be protected');
      }

      this.isInitialized = true;

    } catch (error) {
      this.logger.error('Failed to initialize secure configuration', error);
      throw error;
    }
  }

  /**
   * Get configuration value with automatic decryption
   */
  static get(key: string, defaultValue?: string): string {
    this.ensureInitialized();
    return EncryptionConfigurationManager.get(key, defaultValue || '');
  }

  /**
   * Get secure configuration value (throws if decryption fails)
   */
  static getSecure(key: string, defaultValue?: string): string {
    this.ensureInitialized();
    return EncryptionConfigurationManager.getDecrypted(key, defaultValue);
  }

  /**
   * Get boolean configuration value
   */
  static getBoolean(key: string, defaultValue?: boolean): boolean {
    this.ensureInitialized();
    return EncryptionConfigurationManager.getBoolean(key, defaultValue || false);
  }

  /**
   * Get number configuration value
   */
  static getNumber(key: string, defaultValue?: number): number | undefined {
    this.ensureInitialized();
    return EncryptionConfigurationManager.getNumber(key, defaultValue);
  }

  /**
   * Get array configuration value
   */
  static getArray(key: string, delimiter?: string): string[] {
    this.ensureInitialized();
    return EncryptionConfigurationManager.getArray(key, delimiter);
  }

  /**
   * Get JSON configuration value
   */
  static getJSON<T = any>(key: string, defaultValue?: T): T {
    this.ensureInitialized();
    return EncryptionConfigurationManager.getJSON(key, defaultValue);
  }

  /**
   * Encrypt a value for configuration storage
   */
  static async encryptValue(value: string): Promise<string> {
    this.ensureInitialized();
    return await EncryptionConfigurationManager.encryptValue(value);
  }

  /**
   * Test encryption/decryption of a value
   */
  static async testEncryption(value: string): Promise<{ encrypted: string; decrypted: string; success: boolean }> {
    this.ensureInitialized();
    
    try {
      const encrypted = await this.encryptValue(value);
      const testResult = await EncryptionConfigurationManager.testDecryption(encrypted);
      
      return {
        encrypted,
        decrypted: testResult.decrypted || '',
        success: testResult.success && testResult.decrypted === value
      };
    } catch (error) {
      this.logger.error('Encryption test failed', error);
      return {
        encrypted: '',
        decrypted: '',
        success: false
      };
    }
  }

  /**
   * Get all configuration with sensitive values masked
   */
  static getAllMasked(): Record<string, string> {
    this.ensureInitialized();
    const allConfig = ConfigurationManager.getAll();
    const masked: Record<string, string> = {};

    for (const [key, value] of Object.entries(allConfig)) {
      if (this.isSensitiveKey(key)) {
        masked[key] = this.maskValue(value);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Get encryption statistics
   */
  static getEncryptionStats(): {
    enabled: boolean;
    encryptedKeys: string[];
    cacheSize: number;
    totalKeys: number;
  } {
    this.ensureInitialized();
    
    const allConfig = ConfigurationManager.getAll();
    const encryptedKeys = Object.keys(allConfig).filter(key => 
      allConfig[key].startsWith('ENCRYPTED:')
    );
    
    const cacheStats = EncryptionConfigurationManager.getDecryptionCacheStats();

    return {
      enabled: true,
      encryptedKeys,
      cacheSize: cacheStats.size,
      totalKeys: Object.keys(allConfig).length
    };
  }

  /**
   * Clear sensitive data from memory
   */
  static clearSensitiveData(): void {
    this.ensureInitialized();
    EncryptionConfigurationManager.clearDecryptionCache();
    this.logger.info('Sensitive data cleared from memory');
  }

  /**
   * Check if configuration is properly initialized
   */
  static isSecurelyInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Generate migration commands for existing configuration
   */
  static generateMigrationCommands(keys?: string[]): string[] {
    this.ensureInitialized();
    
    const allConfig = ConfigurationManager.getAll();
    const keysToMigrate = keys || this.getSensitiveKeys(Object.keys(allConfig));
    const commands: string[] = [];

    commands.push('# Configuration Migration Commands');
    commands.push('# Use the encryption tool to encrypt these values:');
    commands.push('');

    for (const key of keysToMigrate) {
      const value = allConfig[key];
      if (value && !value.startsWith('ENCRYPTED:')) {
        commands.push(`# ${key}=${this.maskValue(value)}`);
        commands.push(`# After encryption, replace with:`);
        commands.push(`# ${key}=ENCRYPTED:...`);
        commands.push('');
      }
    }

    return commands;
  }

  /**
   * Ensure configuration is initialized
   */
  private static ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('SecureConfigurationLoader not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if a key contains sensitive data
   */
  private static isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /key/i,
      /credential/i,
      /auth/i,
      /api.*key/i,
      /access.*token/i,
      /private/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(key));
  }

  /**
   * Get all keys that might contain sensitive data
   */
  private static getSensitiveKeys(allKeys: string[]): string[] {
    return allKeys.filter(key => this.isSensitiveKey(key));
  }

  /**
   * Mask a configuration value for display
   */
  private static maskValue(value: string): string {
    if (!value) return value;
    
    if (value.startsWith('ENCRYPTED:')) {
      return 'ENCRYPTED:[PROTECTED]';
    }
    
    if (value.length <= 4) {
      return '***';
    }
    
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }
}

/**
 * Backward compatibility - replace ConfigurationManager usage
 */
export class SecureConfig extends SecureConfigurationLoader {
  // Alias for easier migration
}

/**
 * Quick setup function for common scenarios
 */
export async function initializeSecureConfig(environment?: string, internalKey?: string): Promise<void> {
  await SecureConfigurationLoader.initialize({
    environment,
    internalKey,
    enableEncryption: true,
    validateEncryption: true
  });
} 