import { EncryptionConfigurationManager } from '../../core/configuration/EncryptionConfigurationManager';
import { Logger } from '../../core/utils/Logger';

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

export class SecureADOConfig {
  private static config: ADOIntegrationConfig | null = null;
  private static logger = Logger.getInstance();

  static async initialize(): Promise<void> {
    try {
      EncryptionConfigurationManager.initializeEncryption({
        enabled: true
      });

      const testPlanId = EncryptionConfigurationManager.getNumber('ADO_TEST_PLAN_ID');
      const testSuiteId = EncryptionConfigurationManager.getNumber('ADO_TEST_SUITE_ID');
      
      this.config = {
        enabled: EncryptionConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false),
        uploadResults: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_RESULTS', false),
        organizationUrl: EncryptionConfigurationManager.get('ADO_ORGANIZATION_URL', ''),
        projectName: EncryptionConfigurationManager.get('ADO_PROJECT_NAME', ''),
        authType: this.parseAuthType(EncryptionConfigurationManager.get('ADO_AUTH_TYPE', 'pat')),
        
        personalAccessToken: EncryptionConfigurationManager.get('ADO_PERSONAL_ACCESS_TOKEN', ''),
        username: EncryptionConfigurationManager.get('ADO_USERNAME', ''),
        password: EncryptionConfigurationManager.get('ADO_PASSWORD', ''),
        
        apiVersion: EncryptionConfigurationManager.get('ADO_API_VERSION', '7.0'),
        ...(testPlanId !== undefined && { testPlanId }),
        ...(testSuiteId !== undefined && { testSuiteId }),
        uploadAttachments: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_ATTACHMENTS', false),
        uploadScreenshots: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_SCREENSHOTS', false),
        uploadLogs: EncryptionConfigurationManager.getBoolean('ADO_UPLOAD_LOGS', false),
        
        timeout: EncryptionConfigurationManager.getNumber('ADO_TIMEOUT', 30000) || 30000,
        retryCount: EncryptionConfigurationManager.getNumber('ADO_RETRY_COUNT', 3) || 3,
        retryDelay: EncryptionConfigurationManager.getNumber('ADO_RETRY_DELAY', 1000) || 1000,
        maxConcurrentRequests: EncryptionConfigurationManager.getNumber('ADO_MAX_CONCURRENT_REQUESTS', 5) || 5,
        enableCaching: EncryptionConfigurationManager.getBoolean('ADO_ENABLE_CACHING', true),
        
        testRun: this.getTestRunConfig()
      };

      this.validateConfiguration();
      
      this.logger.info('Secure ADO configuration initialized successfully', {
        organizationUrl: SecureADOConfig.config?.organizationUrl || '',
        projectName: SecureADOConfig.config?.projectName || '',
        authType: SecureADOConfig.config?.authType || 'basic',
        hasToken: !!SecureADOConfig.config?.personalAccessToken,
        uploadResults: SecureADOConfig.config?.uploadResults || false
      });

    } catch (error) {
      this.logger.error('Failed to initialize secure ADO configuration', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`ADO Configuration initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static getConfig(): ADOIntegrationConfig {
    if (!this.config) {
      throw new Error('Secure ADO configuration not initialized. Call SecureADOConfig.initialize() first.');
    }
    return this.config;
  }

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
        
        const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
        break;

      case 'oauth':
        throw new Error('OAuth authentication not yet implemented');

      default:
        throw new Error(`Unsupported authentication type: ${config.authType}`);
    }

    return headers;
  }

  static buildUrl(endpoint: string, params?: Record<string, any>): string {
    const config = this.getConfig();
    
    if (!endpoint) {
      throw new Error('ADO endpoint is empty - check configuration');
    }

    let url = endpoint;
    
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value.toString()));
      }
    }

    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('api-version=')) {
      url += `${separator}api-version=${config.apiVersion}`;
    }

    return url;
  }

  static getBaseApiUrl(): string {
    const config = this.getConfig();
    
    if (!config.organizationUrl || !config.projectName) {
      throw new Error('ADO organization URL and project name must be configured');
    }

    return `${config.organizationUrl}/${config.projectName}/_apis`;
  }

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

  private static validateConfiguration(): void {
    const config = this.config!;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.organizationUrl) {
      errors.push('ADO_ORGANIZATION_URL is required');
    }
    
    if (!config.projectName) {
      errors.push('ADO_PROJECT_NAME is required');
    }

    if (config.authType === 'pat' && !config.personalAccessToken) {
      errors.push('ADO_PERSONAL_ACCESS_TOKEN is required for PAT authentication');
    }
    
    if (config.authType === 'basic' && (!config.username || !config.password)) {
      errors.push('ADO_USERNAME and ADO_PASSWORD are required for basic authentication');
    }

    if (config.personalAccessToken && !config.personalAccessToken.startsWith('ENCRYPTED:')) {
      warnings.push('ADO_PERSONAL_ACCESS_TOKEN is not encrypted - consider using encryption for security');
    }
    
    if (config.password && !config.password.startsWith('ENCRYPTED:')) {
      warnings.push('ADO_PASSWORD is not encrypted - consider using encryption for security');
    }

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

  private static getTestRunConfig(): ADOTestRunConfig {
    return {
      testPlanId: EncryptionConfigurationManager.getNumber('ADO_TEST_PLAN_ID') || 0,
      testSuiteId: EncryptionConfigurationManager.getNumber('ADO_TEST_SUITE_ID') || 0,
      buildId: EncryptionConfigurationManager.getNumber('ADO_BUILD_ID') || 0,
      releaseId: EncryptionConfigurationManager.getNumber('ADO_RELEASE_ID') || 0,
      releaseEnvironmentId: EncryptionConfigurationManager.getNumber('ADO_RELEASE_ENVIRONMENT_ID') || 0,
      runTitle: EncryptionConfigurationManager.get('ADO_RUN_TITLE', ''),
      buildNumber: EncryptionConfigurationManager.get('ADO_BUILD_NUMBER', ''),
      owner: EncryptionConfigurationManager.get('ADO_RUN_OWNER', ''),
      runComment: EncryptionConfigurationManager.get('ADO_RUN_COMMENT', ''),
      automated: EncryptionConfigurationManager.getBoolean('ADO_RUN_AUTOMATED', true)
    };
  }

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

  static getConfigForDisplay(): Partial<ADOIntegrationConfig> {
    const config = this.getConfig();
    
    return {
      ...config,
      personalAccessToken: config.personalAccessToken ? '[PROTECTED]' : '',
      password: config.password ? '[PROTECTED]' : '',
      username: config.username ? config.username.substring(0, 3) + '*'.repeat(Math.max(0, config.username.length - 3)) : ''
    };
  }

  static async testConnection(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const config = this.getConfig();
      const headers = this.getAuthHeaders();
      
      const testUrl = this.buildUrl(`${this.getBaseApiUrl()}/projects`);
      
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

  static clearSensitiveData(): void {
    if (this.config) {
      this.config.personalAccessToken = '';
      this.config.password = '';
    }
    
    EncryptionConfigurationManager.clearDecryptionCache();
    this.logger.info('Sensitive ADO configuration data cleared from memory');
  }
}

export class ADOConfig extends SecureADOConfig {
}

export async function migrateToSecureADOConfig(): Promise<void> {
  await SecureADOConfig.initialize();
  
  const logger = Logger.getInstance();
  logger.info('Successfully migrated to SecureADOConfig with encryption support');
  
  const testResult = await SecureADOConfig.testConnection();
  if (testResult.success) {
    logger.info('ADO connection test successful', testResult.details);
  } else {
    logger.warn('ADO connection test failed', { error: testResult.error });
  }
} 
