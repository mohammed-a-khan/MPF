// src/core/configuration/ConfigurationValidator.ts

import { 
  ConfigMap, 
  ValidationResult, 
  ConfigValidationRule, 
  ConfigDependency,
  RequiredConfigFields 
} from './types/config.types';

export class ConfigurationValidator {
  private static readonly URL_PATTERN = /^https?:\/\/.+/;
  private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static readonly PORT_PATTERN = /^\d{1,5}$/;
  private static readonly COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
  
  private readonly requiredFields: RequiredConfigFields = {
    global: [
      'FRAMEWORK_NAME',
      'LOG_LEVEL',
      'DEFAULT_BROWSER',
      'REPORT_PATH',
      'REPORT_THEME_PRIMARY_COLOR'
    ],
    browser: [
      'HEADLESS',
      'VIEWPORT_WIDTH', 
      'VIEWPORT_HEIGHT',
      'DEFAULT_TIMEOUT'
    ],
    api: [
      'API_DEFAULT_TIMEOUT',
      'API_RETRY_COUNT',
      'API_RETRY_DELAY'
    ],
    database: [
      'DB_TYPE',
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USERNAME',
      'DB_PASSWORD'
    ],
    report: [
      'GENERATE_PDF_REPORT',
      'GENERATE_EXCEL_REPORT',
      'INCLUDE_SCREENSHOTS',
      'INCLUDE_LOGS'
    ],
    ai: [
      'AI_ENABLED',
      'AI_SELF_HEALING_ENABLED',
      'AI_CONFIDENCE_THRESHOLD'
    ]
  };

  private readonly validationRules: ConfigValidationRule[] = [
    { field: 'BASE_URL', required: true, type: 'url', message: 'BASE_URL must be a valid URL' },
    { field: 'API_BASE_URL', required: false, type: 'url', message: 'API_BASE_URL must be a valid URL' },
    
    { field: 'DB_PORT', required: false, pattern: ConfigurationValidator.PORT_PATTERN, message: 'DB_PORT must be a valid port number' },
    { field: 'PROXY_PORT', required: false, pattern: ConfigurationValidator.PORT_PATTERN, message: 'PROXY_PORT must be a valid port number' },
    
    { field: 'VIEWPORT_WIDTH', required: true, type: 'number', min: 320, max: 3840, message: 'VIEWPORT_WIDTH must be between 320 and 3840' },
    { field: 'VIEWPORT_HEIGHT', required: true, type: 'number', min: 240, max: 2160, message: 'VIEWPORT_HEIGHT must be between 240 and 2160' },
    { field: 'DEFAULT_TIMEOUT', required: true, type: 'number', min: 1000, max: 300000, message: 'DEFAULT_TIMEOUT must be between 1000 and 300000' },
    { field: 'MAX_PARALLEL_WORKERS', required: false, type: 'number', min: 1, max: 10, message: 'MAX_PARALLEL_WORKERS must be between 1 and 10' },
    
    { field: 'HEADLESS', required: true, type: 'boolean', message: 'HEADLESS must be true or false' },
    { field: 'AI_ENABLED', required: true, type: 'boolean', message: 'AI_ENABLED must be true or false' },
    { field: 'PARALLEL_EXECUTION', required: false, type: 'boolean', message: 'PARALLEL_EXECUTION must be true or false' },
    
    { field: 'DEFAULT_BROWSER', required: true, enum: ['chromium', 'firefox', 'webkit'], message: 'DEFAULT_BROWSER must be chromium, firefox, or webkit' },
    { field: 'LOG_LEVEL', required: true, enum: ['debug', 'info', 'warn', 'error'], message: 'LOG_LEVEL must be debug, info, warn, or error' },
    { field: 'DB_TYPE', required: false, enum: ['sqlserver', 'oracle', 'mysql', 'postgresql', 'mongodb', 'redis'], message: 'Invalid database type' },
    
    { field: 'REPORT_THEME_PRIMARY_COLOR', required: true, pattern: ConfigurationValidator.COLOR_PATTERN, message: 'REPORT_THEME_PRIMARY_COLOR must be a valid hex color' },
    
    { field: 'REPORT_PATH', required: true, type: 'string', message: 'REPORT_PATH is required' },
    { field: 'DOWNLOADS_PATH', required: false, type: 'string', message: 'DOWNLOADS_PATH must be a string' },
  ];

  private readonly dependencies: ConfigDependency[] = [
    { field: 'PROXY_USERNAME', dependsOn: 'PROXY_ENABLED', condition: (val) => val === 'true' },
    { field: 'PROXY_PASSWORD', dependsOn: 'PROXY_ENABLED', condition: (val) => val === 'true' },
    { field: 'PROXY_SERVER', dependsOn: 'PROXY_ENABLED', condition: (val) => val === 'true' },
    { field: 'PROXY_PORT', dependsOn: 'PROXY_ENABLED', condition: (val) => val === 'true' },
    
    { field: 'DB_HOST', dependsOn: 'DATABASE_ENABLED', condition: (val) => val === 'true' },
    { field: 'DB_PORT', dependsOn: 'DATABASE_ENABLED', condition: (val) => val === 'true' },
    { field: 'DB_USERNAME', dependsOn: 'DATABASE_ENABLED', condition: (val) => val === 'true' },
    { field: 'DB_PASSWORD', dependsOn: 'DATABASE_ENABLED', condition: (val) => val === 'true' },
    
    { field: 'AI_SELF_HEALING_ENABLED', dependsOn: 'AI_ENABLED', condition: (val) => val === 'true' },
    { field: 'AI_CONFIDENCE_THRESHOLD', dependsOn: 'AI_ENABLED', condition: (val) => val === 'true' },
    
    { field: 'MAX_PARALLEL_WORKERS', dependsOn: 'PARALLEL_EXECUTION', condition: (val) => val === 'true' },
  ];

  validate(config: ConfigMap): ValidationResult {
    const errors: string[] = [];
    
    errors.push(...this.validateRequiredFields(config));
    
    errors.push(...this.validateFieldFormats(config));
    
    errors.push(...this.validateDependencies(config));
    
    errors.push(...this.validateEnvironmentConfigs(config));
    errors.push(...this.validateAPIConfigs(config));
    errors.push(...this.validateDatabaseConfigs(config));
    errors.push(...this.validateProxyConfigs(config));
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateRequiredFields(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    this.requiredFields.global.forEach(field => {
      if (!config[field]) {
        errors.push(`Required field missing: ${field}`);
      }
    });
    
    if (config['API_ENABLED'] === 'true') {
      this.requiredFields.api.forEach(field => {
        if (!config[field]) {
          errors.push(`Required API field missing: ${field}`);
        }
      });
    }
    
    if (config['DATABASE_ENABLED'] === 'true') {
      this.requiredFields.database.forEach(field => {
        if (!config[field]) {
          errors.push(`Required database field missing: ${field}`);
        }
      });
    }
    
    return errors;
  }

  private validateFieldFormats(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    this.validationRules.forEach(rule => {
      const value = config[rule.field];
      
      if (!rule.required && !value) return;
      
      if (rule.required && !value) {
        errors.push(rule.message || `${rule.field} is required`);
        return;
      }
      
      if (!value) return;
      
      switch (rule.type) {
        case 'number':
          const num = parseInt(value, 10);
          if (isNaN(num)) {
            errors.push(`${rule.field} must be a number`);
          } else if (rule.min !== undefined && num < rule.min) {
            errors.push(`${rule.field} must be at least ${rule.min}`);
          } else if (rule.max !== undefined && num > rule.max) {
            errors.push(`${rule.field} must be at most ${rule.max}`);
          }
          break;
          
        case 'boolean':
          if (value !== 'true' && value !== 'false') {
            errors.push(rule.message || `${rule.field} must be true or false`);
          }
          break;
          
        case 'url':
          if (!ConfigurationValidator.URL_PATTERN.test(value)) {
            errors.push(rule.message || `${rule.field} must be a valid URL`);
          }
          break;
          
        case 'email':
          if (!ConfigurationValidator.EMAIL_PATTERN.test(value)) {
            errors.push(rule.message || `${rule.field} must be a valid email`);
          }
          break;
      }
      
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(rule.message || `${rule.field} has invalid format`);
      }
      
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(rule.message || `${rule.field} must be one of: ${rule.enum.join(', ')}`);
      }
      
      if (rule.custom && !rule.custom(value)) {
        errors.push(rule.message || `${rule.field} validation failed`);
      }
    });
    
    return errors;
  }

  private validateDependencies(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    this.dependencies.forEach(dep => {
      const dependencyValue = config[dep.dependsOn];
      const shouldExist = dep.condition ? dep.condition(dependencyValue) : !!dependencyValue;
      
      if (shouldExist && !config[dep.field]) {
        errors.push(`${dep.field} is required when ${dep.dependsOn} is ${dependencyValue}`);
      }
    });
    
    return errors;
  }

  private validateEnvironmentConfigs(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    if (!config['BASE_URL'] && config['UI_TESTING_ENABLED'] !== 'false') {
      errors.push('BASE_URL is required for UI testing');
    }
    
    if (!config['API_BASE_URL'] && config['API_ENABLED'] === 'true') {
      errors.push('API_BASE_URL is required when API testing is enabled');
    }
    
    return errors;
  }

  private validateAPIConfigs(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    if (config['API_ENABLED'] !== 'true') return errors;
    
    const timeout = parseInt(config['API_DEFAULT_TIMEOUT'] || '0', 10);
    if (timeout < 1000 || timeout > 300000) {
      errors.push('API_DEFAULT_TIMEOUT must be between 1000ms and 300000ms');
    }
    
    const retryCount = parseInt(config['API_RETRY_COUNT'] || '0', 10);
    if (retryCount < 0 || retryCount > 10) {
      errors.push('API_RETRY_COUNT must be between 0 and 10');
    }
    
    return errors;
  }

  private validateDatabaseConfigs(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    if (config['DATABASE_ENABLED'] !== 'true') return errors;
    
    const port = parseInt(config['DB_PORT'] || '0', 10);
    if (port < 1 || port > 65535) {
      errors.push('DB_PORT must be between 1 and 65535');
    }
    
    const poolSize = parseInt(config['DB_CONNECTION_POOL_SIZE'] || '10', 10);
    if (poolSize < 1 || poolSize > 100) {
      errors.push('DB_CONNECTION_POOL_SIZE must be between 1 and 100');
    }
    
    return errors;
  }

  private validateProxyConfigs(config: ConfigMap): string[] {
    const errors: string[] = [];
    
    if (config['PROXY_ENABLED'] !== 'true') return errors;
    
    if (!config['PROXY_SERVER']) {
      errors.push('PROXY_SERVER is required when proxy is enabled');
    }
    
    if (config['PROXY_USERNAME'] && !config['PROXY_PASSWORD']) {
      errors.push('PROXY_PASSWORD is required when PROXY_USERNAME is provided');
    }
    
    if (!config['PROXY_USERNAME'] && config['PROXY_PASSWORD']) {
      errors.push('PROXY_USERNAME is required when PROXY_PASSWORD is provided');
    }
    
    return errors;
  }

  getValidationReport(config: ConfigMap): string {
    const result = this.validate(config);
    
    if (result.valid) {
      return 'Configuration validation passed successfully.';
    }
    
    const report = ['Configuration validation failed:', ''];
    result.errors.forEach((error, index) => {
      report.push(`${index + 1}. ${error}`);
    });
    
    return report.join('\n');
  }
}
