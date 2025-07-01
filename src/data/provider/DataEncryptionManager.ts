import { EncryptionConfigurationManager } from '../../core/configuration/EncryptionConfigurationManager';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { TestData } from '../types/data.types';

export class DataEncryptionManager {
  private static logger = Logger.getInstance();
  private static readonly ENCRYPTED_PREFIX = 'ENCRYPTED:';
  
  private static readonly DEFAULT_SENSITIVE_PATTERNS = [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'key',
    'credential',
    'auth',
    'api_key',
    'apikey',
    'access_token',
    'refresh_token',
    'bearer_token',
    'pat_token',
    'personal_access_token',
    'private_key',
    'client_secret',
    'connection_string',
    'database_password',
    'db_password'
  ];

  private static sensitivePatterns: string[] = [...this.DEFAULT_SENSITIVE_PATTERNS];
  private static isInitialized = false;

  static initialize(options: {
    sensitivePatterns?: string[];
    enableAutoDecryption?: boolean;
  } = {}): void {
    const {
      sensitivePatterns = this.DEFAULT_SENSITIVE_PATTERNS,
      enableAutoDecryption = true
    } = options;

    this.sensitivePatterns = [...sensitivePatterns];
    
    if (enableAutoDecryption) {
      EncryptionConfigurationManager.initializeEncryption({
        enabled: true
      });
    }

    this.isInitialized = true;
    this.logger.info('DataEncryptionManager initialized', {
      sensitivePatterns: this.sensitivePatterns.length,
      enableAutoDecryption
    });
  }

  static async processTestData(data: TestData[]): Promise<TestData[]> {
    if (!this.isInitialized) {
      this.initialize();
    }

    if (!data || data.length === 0) {
      return data;
    }

    ActionLogger.logInfo('Processing test data for encryption', {
      operation: 'data_encryption_process',
      recordCount: data.length
    });

    const processedData: TestData[] = [];

    for (const record of data) {
      try {
        const processedRecord = await this.processRecord(record);
        processedData.push(processedRecord);
      } catch (error) {
        this.logger.error('Failed to process test data record', error instanceof Error ? error : new Error(String(error)));
        processedData.push(record);
      }
    }

    return processedData;
  }

  static async processRecord(record: TestData): Promise<TestData> {
    if (!record || typeof record !== 'object') {
      return record;
    }

    const processedRecord: TestData = {};

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && value.startsWith(this.ENCRYPTED_PREFIX)) {
        try {
          const testResult = await EncryptionConfigurationManager.testDecryption(value);
          if (testResult.success && testResult.decrypted) {
            processedRecord[key] = testResult.decrypted;
            this.logger.debug(`Decrypted field: ${key}`);
          } else {
            this.logger.warn(`Failed to decrypt field: ${key}`);
            processedRecord[key] = value;
          }
        } catch (error) {
          this.logger.error(`Error decrypting field ${key}:`, error instanceof Error ? error : new Error(String(error)));
          processedRecord[key] = value;
        }
      } else {
        processedRecord[key] = value;
      }
    }

    return processedRecord;
  }

  static async encryptSensitiveData(data: TestData[]): Promise<TestData[]> {
    if (!this.isInitialized) {
      this.initialize();
    }

    if (!data || data.length === 0) {
      return data;
    }

    ActionLogger.logInfo('Encrypting sensitive data', {
      operation: 'data_encryption_encrypt',
      recordCount: data.length
    });

    const encryptedData: TestData[] = [];

    for (const record of data) {
      try {
        const encryptedRecord = await this.encryptRecord(record);
        encryptedData.push(encryptedRecord);
      } catch (error) {
        this.logger.error('Failed to encrypt test data record', error instanceof Error ? error : new Error(String(error)));
        encryptedData.push(record);
      }
    }

    return encryptedData;
  }

  static async encryptRecord(record: TestData): Promise<TestData> {
    if (!record || typeof record !== 'object') {
      return record;
    }

    const encryptedRecord: TestData = {};

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && this.isSensitiveField(key) && !value.startsWith(this.ENCRYPTED_PREFIX)) {
        try {
          const encrypted = await EncryptionConfigurationManager.encryptValue(value);
          encryptedRecord[key] = encrypted;
          this.logger.debug(`Encrypted field: ${key}`);
        } catch (error) {
          this.logger.error(`Error encrypting field ${key}:`, error instanceof Error ? error : new Error(String(error)));
          encryptedRecord[key] = value;
        }
      } else {
        encryptedRecord[key] = value;
      }
    }

    return encryptedRecord;
  }

  static isSensitiveField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return this.sensitivePatterns.some(pattern => 
      lowerFieldName.includes(pattern.toLowerCase())
    );
  }

  static getSensitiveFields(data: TestData[]): string[] {
    const sensitiveFields = new Set<string>();

    for (const record of data) {
      if (record && typeof record === 'object') {
        for (const key of Object.keys(record)) {
          if (this.isSensitiveField(key)) {
            sensitiveFields.add(key);
          }
        }
      }
    }

    return Array.from(sensitiveFields);
  }

  static validateEncryption(data: TestData[]): {
    valid: boolean;
    unencryptedFields: Array<{ record: number; field: string; value: string }>;
    warnings: string[];
  } {
    const unencryptedFields: Array<{ record: number; field: string; value: string }> = [];
    const warnings: string[] = [];

    data.forEach((record, index) => {
      if (record && typeof record === 'object') {
        for (const [key, value] of Object.entries(record)) {
          if (this.isSensitiveField(key) && typeof value === 'string') {
            if (!value.startsWith(this.ENCRYPTED_PREFIX)) {
              unencryptedFields.push({
                record: index + 1,
                field: key,
                value: this.maskValue(value)
              });
            }
          }
        }
      }
    });

    if (unencryptedFields.length > 0) {
      warnings.push(`Found ${unencryptedFields.length} unencrypted sensitive fields`);
    }

    return {
      valid: unencryptedFields.length === 0,
      unencryptedFields,
      warnings
    };
  }

  static addSensitivePatterns(patterns: string[]): void {
    this.sensitivePatterns.push(...patterns);
    this.logger.info('Added custom sensitive patterns', { patterns });
  }

  static removeSensitivePatterns(patterns: string[]): void {
    this.sensitivePatterns = this.sensitivePatterns.filter(
      pattern => !patterns.includes(pattern)
    );
    this.logger.info('Removed sensitive patterns', { patterns });
  }

  static getSensitivePatterns(): string[] {
    return [...this.sensitivePatterns];
  }

  static resetSensitivePatterns(): void {
    this.sensitivePatterns = [...this.DEFAULT_SENSITIVE_PATTERNS];
    this.logger.info('Reset to default sensitive patterns');
  }

  private static maskValue(value: string): string {
    if (!value || value.length <= 4) {
      return '***';
    }
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  static getEncryptionStats(data: TestData[]): {
    totalRecords: number;
    totalFields: number;
    sensitiveFields: number;
    encryptedFields: number;
    unencryptedSensitiveFields: number;
    encryptionRate: number;
  } {
    let totalFields = 0;
    let sensitiveFields = 0;
    let encryptedFields = 0;
    let unencryptedSensitiveFields = 0;

    data.forEach(record => {
      if (record && typeof record === 'object') {
        for (const [key, value] of Object.entries(record)) {
          totalFields++;
          
          if (this.isSensitiveField(key)) {
            sensitiveFields++;
            
            if (typeof value === 'string' && value.startsWith(this.ENCRYPTED_PREFIX)) {
              encryptedFields++;
            } else {
              unencryptedSensitiveFields++;
            }
          }
        }
      }
    });

    const encryptionRate = sensitiveFields > 0 ? (encryptedFields / sensitiveFields) * 100 : 100;

    return {
      totalRecords: data.length,
      totalFields,
      sensitiveFields,
      encryptedFields,
      unencryptedSensitiveFields,
      encryptionRate: Math.round(encryptionRate * 100) / 100
    };
  }

  static async createSampleEncryptedRecord(): Promise<TestData> {
    const sampleData: TestData = {
      username: 'testuser',
      password: 'mySecretPassword123',
      api_key: 'sk-1234567890abcdef',
      database_password: 'dbSecretPass456',
      normal_field: 'this is not sensitive'
    };

    return await this.encryptRecord(sampleData);
  }

  static async bulkEncryptData(
    data: TestData[],
    options: {
      backupOriginal?: boolean;
      validateAfterEncryption?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    encryptedRecords: number;
    errors: string[];
    stats: ReturnType<typeof DataEncryptionManager.getEncryptionStats>;
  }> {
    const { backupOriginal = true, validateAfterEncryption = true } = options;
    const errors: string[] = [];

    try {
      const initialStats = this.getEncryptionStats(data);
      
      const encryptedData = await this.encryptSensitiveData(data);
      
      if (validateAfterEncryption) {
        const validation = this.validateEncryption(encryptedData);
        if (!validation.valid) {
          errors.push(...validation.warnings);
        }
      }

      const finalStats = this.getEncryptionStats(encryptedData);

      return {
        success: errors.length === 0,
        encryptedRecords: finalStats.encryptedFields - initialStats.encryptedFields,
        errors,
        stats: finalStats
      };

    } catch (error) {
      errors.push(`Bulk encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        success: false,
        encryptedRecords: 0,
        errors,
        stats: this.getEncryptionStats(data)
      };
    }
  }
} 
