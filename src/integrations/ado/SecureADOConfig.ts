import { EncryptionConfigurationManager } from '../../core/configuration/EncryptionConfigurationManager';
import { Logger } from '../../core/utils/Logger';

// Type definitions for secure ADO configuration
export type ADOAuthType = 'pat' | 'basic' | 'oauth';

export interface ADOTestRunConfig {
  testPlanId?: number;
  testSuiteId?: number;
  buildId?: number;
  releaseId?: number;
  releaseEnvironmentId?: number;
  runTitle?: string;
  buildNumber?: string;
  owner?: string;
  runComment?: string;
  automated?: boolean;
}

export interface ADOIntegrationConfig {
  enabled: boolean;
  uploadResults: boolean;
  organizationUrl: string;
  projectName: string;
  authType: ADOAuthType;
  personalAccessToken: string;
  username: string;
  password: string;
  apiVersion: string;
  testPlanId?: number;
  testSuiteId?: number;
  uploadAttachments: boolean;
  uploadScreenshots: boolean;
  uploadLogs: boolean;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  maxConcurrentRequests: number;
  enableCaching: boolean;
  testRun: ADOTestRunConfig;
}

/**
 * Secure ADO Configuration Manager with automatic decryption support
 * 
 * This class provides the same interface as ADOConfig but automatically
 * decrypts encrypted configuration values for enhanced security.
 * 
 * Usage:
 * 1. Encrypt your PAT token using the encryption tool
 * 2. Set ADO_PERSONAL_ACCESS_TOKEN=ENCRYPTED:... in your config
 * 3. Use this class instead of ADOConfig
 */
export class SecureADOConfig {
  private static config: ADOIntegrationConfig | null = null;
  private static logger = Logger.getInstance();

  /**
   * Initialize ADO configuration with automatic decryption
   */
  static async initialize(): Promise<void> {
    try {
      // Initialize encryption support first
      EncryptionConfigurationManager.initializeEncryption({
        enabled: true
      });

      // Load configuration with automatic decryption
      this.config = {
        enabled: EncryptionConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false),
        uploadResults: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_RESULTS', false),
        organizationUrl: EncryptionConfigurationManager.get('ADO_ORGANIZATION_URL', ''),
        projectName: EncryptionConfigurationManager.get('ADO_PROJECT_NAME', ''),
        authType: this.parseAuthType(EncryptionConfigurationManager.get('ADO_AUTH_TYPE', 'pat')),
        
        // Sensitive values - automatically decrypted if encrypted
        personalAccessToken: EncryptionConfigurationManager.get('ADO_PERSONAL_ACCESS_TOKEN', ''),
        username: EncryptionConfigurationManager.get('ADO_USERNAME', ''),
        password: EncryptionConfigurationManager.get('ADO_PASSWORD', ''),
        
        // Other configuration
        apiVersion: EncryptionConfigurationManager.get('ADO_API_VERSION', '7.0'),
        testPlanId: EncryptionConfigurationManager.getNumber('ADO_TEST_PLAN_ID'),
        testSuiteId: EncryptionConfigurationManager.getNumber('ADO_TEST_SUITE_ID'),
        uploadAttachments: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_ATTACHMENTS', false),
        uploadScreenshots: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_SCREENSHOTS', false),
        uploadLogs: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_LOGS', false),
        
        // Advanced settings
        timeout: EncryptionConfigurationManager.getNumber('ADO_TIMEOUT', 30000),
        retryCount: EncryptionConfigurationManager.getNumber('ADO_RETRY_COUNT', 3),
        retryDelay: EncryptionConfigurationManager.getNumber('ADO_RETRY_DELAY', 1000),
        maxConcurrentRequests: EncryptionConfigurationManager.getNumber('ADO_MAX_CONCURRENT_REQUESTS', 5),
        enableCaching: EncryptionConfigurationManager.getBoolean('ADO_ENABLE_CACHING', true),
        
        // Test run configuration
        testRun: this.getTestRunConfig()
      };

      // Validate configuration
      this.validateConfiguration();
      
      this.logger.info('Secure ADO configuration initialized successfully', {
        organizationUrl: this.config.organizationUrl,
        projectName: this.config.projectName,
        authType: this.config.authType,
        hasToken: !!this.config.personalAccessToken,
        uploadResults: this.config.uploadResults
      });

    } catch (error) {
      this.logger.error('Failed to initialize secure ADO configuration', error);
      throw new Error(`ADO Configuration initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current configuration (ensures initialization)
   */
  static getConfig(): ADOIntegrationConfig {
    if (!this.config) {
      throw new Error('Secure ADO configuration not initialized. Call SecureADOConfig.initialize() first.');
    }
    return this.config;
  }

  /**
   * Get authentication headers with automatic token decryption
   */
  static getAuthHeaders(): Record<string, string> {
    const config = this.getConfig();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    switch (config.authType) {
      case 'pat':
        if (!config.personalAccessToken) {
          this.logger.warn('PAT token is empty or failed to decrypt!');
          throw new Error('ADO Personal Access Token is required but not configured or failed to decrypt');
        }
        
        // Token is automatically decrypted by EncryptionConfigurationManager
        const token = Buffer.from(`:${config.personalAccessToken}`).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
        
        this.logger.debug('Auth header created for PAT', {
          tokenLength: config.personalAccessToken.length,
          organization: config.organizationUrl
        });
        break;

      case 'basic':
        if (!config.username || !config.password) {
          throw new Error('Username and password are required for basic authentication');
        }
        
        // Password is automatically decrypted
        const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
        break;

      case 'oauth':
        // OAuth implementation would go here
        throw new Error('OAuth authentication not yet implemented');

      default:
        throw new Error(`Unsupported authentication type: ${config.authType}`);
    }

    return headers;
  }

  /**
   * Build ADO API URL with parameters
   */
  static buildUrl(endpoint: string, params?: Record<string, any>): string {
    const config = this.getConfig();
    
    if (!endpoint) {
      throw new Error('ADO endpoint is empty - check configuration');
    }

    let url = endpoint;
    
    // Replace URL parameters
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value.toString()));
      }
    }

    // Add API version if not already present
    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('api-version=')) {
      url += `${separator}api-version=${config.apiVersion}`;
    }

    return url;
  }

  /**
   * Get base API URL for the configured organization and project
   */
  static getBaseApiUrl(): string {
    const config = this.getConfig();
    
    if (!config.organizationUrl || !config.projectName) {
      throw new Error('ADO organization URL and project name must be configured');
    }

    return `${config.organizationUrl}/${config.projectName}/_apis`;
  }

  /**
   * Check if ADO integration is enabled and properly configured
   */
  static isEnabled(): boolean {
    try {
      const config = this.getConfig();
      return config.enabled && 
             !!config.organizationUrl && 
             !!config.projectName && 
             !!config.personalAccessToken;
    } catch {
      return false;
    }
  }

  /**
   * Validate configuration completeness and security
   */
  private static validateConfiguration(): void {
    const config = this.config!;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.organizationUrl) {
      errors.push('ADO_ORGANIZATION_URL is required');
    }
    
    if (!config.projectName) {
      errors.push('ADO_PROJECT_NAME is required');
    }

    // Authentication validation
    if (config.authType === 'pat' && !config.personalAccessToken) {
      errors.push('ADO_PERSONAL_ACCESS_TOKEN is required for PAT authentication');
    }
    
    if (config.authType === 'basic' && (!config.username || !config.password)) {
      errors.push('ADO_USERNAME and ADO_PASSWORD are required for basic authentication');
    }

    // Security warnings
    if (config.personalAccessToken && !config.personalAccessToken.startsWith('ENCRYPTED:')) {
      warnings.push('ADO_PERSONAL_ACCESS_TOKEN is not encrypted - consider using encryption for security');
    }
    
    if (config.password && !config.password.startsWith('ENCRYPTED:')) {
      warnings.push('ADO_PASSWORD is not encrypted - consider using encryption for security');
    }

    // Configuration warnings
    if (config.enabled && !config.uploadResults) {
      warnings.push('ADO integration is enabled but result uploading is disabled');
    }

    if (errors.length > 0) {
      throw new Error(`ADO configuration validation failed: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      warnings.forEach(warning => this.logger.warn(warning));
    }
  }

  /**
   * Get test run configuration
   */
  private static getTestRunConfig(): ADOTestRunConfig {
    return {
      testPlanId: EncryptionConfigurationManager.getNumber('ADO_TEST_PLAN_ID'),
      testSuiteId: EncryptionConfigurationManager.getNumber('ADO_TEST_SUITE_ID'),
      buildId: EncryptionConfigurationManager.getNumber('ADO_BUILD_ID'),
      releaseId: EncryptionConfigurationManager.getNumber('ADO_RELEASE_ID'),
      releaseEnvironmentId: EncryptionConfigurationManager.getNumber('ADO_RELEASE_ENVIRONMENT_ID'),
      runTitle: EncryptionConfigurationManager.get('ADO_RUN_TITLE', ''),
      buildNumber: EncryptionConfigurationManager.get('ADO_BUILD_NUMBER', ''),
      owner: EncryptionConfigurationManager.get('ADO_RUN_OWNER', ''),
      runComment: EncryptionConfigurationManager.get('ADO_RUN_COMMENT', ''),
      automated: EncryptionConfigurationManager.getBoolean('ADO_RUN_AUTOMATED', true)
    };
  }

  /**
   * Parse authentication type from string
   */
  private static parseAuthType(authType: string): ADOAuthType {
    switch (authType.toLowerCase()) {
      case 'pat':
      case 'token':
        return 'pat';
      case 'basic':
      case 'username':
        return 'basic';
      case 'oauth':
      case 'oauth2':
        return 'oauth';
      default:
        this.logger.warn(`Unknown auth type '${authType}', defaulting to 'pat'`);
        return 'pat';
    }
  }

  /**
   * Get configuration for display (with sensitive values masked)
   */
  static getConfigForDisplay(): Partial<ADOIntegrationConfig> {
    const config = this.getConfig();
    
    return {
      ...config,
      personalAccessToken: config.personalAccessToken ? '[PROTECTED]' : '',
      password: config.password ? '[PROTECTED]' : '',
      username: config.username ? config.username.substring(0, 3) + '*'.repeat(Math.max(0, config.username.length - 3)) : ''
    };
  }

  /**
   * Test ADO connection with current configuration
   */
  static async testConnection(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const config = this.getConfig();
      const headers = this.getAuthHeaders();
      
      // Simple test API call to validate connection
      const testUrl = this.buildUrl(`${this.getBaseApiUrl()}/projects`);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          details: {
            status: response.status,
            projectCount: data.count || 0,
            organization: config.organizationUrl,
            project: config.projectName
          }
        };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: {
            status: response.status,
            url: testUrl
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clear sensitive data from memory
   */
  static clearSensitiveData(): void {
    if (this.config) {
      this.config.personalAccessToken = '';
      this.config.password = '';
    }
    
    EncryptionConfigurationManager.clearDecryptionCache();
    this.logger.info('Sensitive ADO configuration data cleared from memory');
  }
}

/**
 * Migration helper - use this to replace existing ADOConfig usage
 */
export class ADOConfig extends SecureADOConfig {
  // Backward compatibility alias
}

/**
 * Utility function to help migrate from old ADOConfig
 */
export async function migrateToSecureADOConfig(): Promise<void> {
  await SecureADOConfig.initialize();
  
  // Log migration info
  const logger = Logger.getInstance();
  logger.info('Successfully migrated to SecureADOConfig with encryption support');
  
  // Test configuration
  const testResult = await SecureADOConfig.testConnection();
  if (testResult.success) {
    logger.info('ADO connection test successful', testResult.details);
  } else {
    logger.warn('ADO connection test failed', { error: testResult.error });
  }
} 