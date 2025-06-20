// src/core/configuration/EnvironmentLoader.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigMap } from './types/config.types';

export class EnvironmentLoader {
  private static readonly CONFIG_DIR = path.join(process.cwd(), 'config');
  private static readonly ENVIRONMENTS_DIR = path.join(process.cwd(), 'config', 'environments');
  private static readonly ENCODING = 'utf-8';
  private static readonly ENV_FILE_PATTERN = /^(.+)\.env$/;
  private static readonly VARIABLE_PATTERN = /\${([^}]+)}/g;

  /**
   * Load and merge environment configuration files
   */
  async loadEnvironmentFiles(environment: string): Promise<ConfigMap> {
    console.log(`DEBUG EnvironmentLoader: Loading files for environment: ${environment}`);
    
    // Load global.env from config root
    const globalConfig = await this.loadGlobalEnvFile();
    console.log(`DEBUG EnvironmentLoader: Global config loaded, keys: ${Object.keys(globalConfig).length}`);
    
    // Load environment-specific file from config/environments
    const envConfig = await this.loadEnvironmentEnvFile(environment);
    console.log(`DEBUG EnvironmentLoader: Environment config loaded, keys: ${Object.keys(envConfig).length}`);
    
    // Merge configurations with environment-specific overriding global
    let mergedConfig = this.mergeConfigurations(globalConfig, envConfig);
    console.log(`DEBUG EnvironmentLoader: After merging global+env, keys: ${Object.keys(mergedConfig).length}`);
    
    // Load additional configuration files if they exist
    const additionalConfigs = await this.loadAdditionalConfigs(mergedConfig);
    console.log(`DEBUG EnvironmentLoader: Additional configs loaded, keys: ${Object.keys(additionalConfigs).length}`);
    
    mergedConfig = this.mergeConfigurations(mergedConfig, additionalConfigs);
    console.log(`DEBUG EnvironmentLoader: After merging additional configs, keys: ${Object.keys(mergedConfig).length}`);
    
    // Interpolate variables
    mergedConfig = this.interpolateVariables(mergedConfig);
    
    // Add runtime environment variables
    mergedConfig = this.addRuntimeVariables(mergedConfig, environment);
    
    console.log(`DEBUG EnvironmentLoader: Final config keys: ${Object.keys(mergedConfig).length}`);
    
    return mergedConfig;
  }

  /**
   * Load global.env from config root directory
   */
  private async loadGlobalEnvFile(): Promise<ConfigMap> {
    const filePath = path.join(EnvironmentLoader.CONFIG_DIR, 'global.env');
    return await this.loadEnvFileFromPath(filePath, 'global.env');
  }

  /**
   * Load environment-specific file from config/environments
   */
  private async loadEnvironmentEnvFile(environment: string): Promise<ConfigMap> {
    const filePath = path.join(EnvironmentLoader.ENVIRONMENTS_DIR, `${environment}.env`);
    return await this.loadEnvFileFromPath(filePath, `${environment}.env`);
  }

  /**
   * Load a single environment file from specific path
   */
  private async loadEnvFileFromPath(filePath: string, fileName: string): Promise<ConfigMap> {
    try {
      await this.validateEnvFile(filePath);
      const content = await fs.readFile(filePath, EnvironmentLoader.ENCODING);
      console.log(`DEBUG EnvironmentLoader: Loading file ${fileName} from ${filePath}`);
      const config = this.parseEnvFile(content, filePath);
      console.log(`DEBUG EnvironmentLoader: Loaded ${Object.keys(config).length} keys from ${fileName}`);
      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`Configuration file not found: ${filePath}`);
        return {};
      }
      throw new Error(`Failed to load configuration file ${fileName}: ${error}`);
    }
  }

  /**
   * Parse environment file content
   */
  private parseEnvFile(content: string, _filePath: string): ConfigMap {
    const config: ConfigMap = {};
    const lines = content.split('\n');
    
    lines.forEach((line) => {
      // Skip empty lines
      if (!line.trim()) return;
      
      // Skip lines that start with # (comments)
      if (line.trim().startsWith('#')) return;
      
      // Parse key=value pairs
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        // Not a valid key=value line, skip it
        return;
      }
      
      const key = line.substring(0, separatorIndex).trim();
      const rawValue = line.substring(separatorIndex + 1);
      
      // Handle inline comments only if # is preceded by a space and not inside quotes
      let value = rawValue;
      const isQuoted = (rawValue.trim().startsWith('"') && rawValue.includes('"', 1)) || 
                      (rawValue.trim().startsWith("'") && rawValue.includes("'", 1));
      
      if (!isQuoted) {
        // Only treat # as comment start if preceded by space
        const commentIndex = rawValue.indexOf(' #');
        if (commentIndex !== -1) {
          value = rawValue.substring(0, commentIndex);
        }
      }
      
      value = value.trim();
      
      // Remove quotes if present
      const unquotedValue = this.unquoteValue(value);
      
      config[key] = unquotedValue;
    });
    
    return config;
  }

  /**
   * Remove quotes from value
   */
  private unquoteValue(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  /**
   * Merge two configuration objects
   */
  private mergeConfigurations(base: ConfigMap, override: ConfigMap): ConfigMap {
    return { ...base, ...override };
  }

  /**
   * Load additional configuration files based on enabled features
   */
  private async loadAdditionalConfigs(config: ConfigMap): Promise<ConfigMap> {
    let additionalConfig: ConfigMap = {};
    
    // Load database queries if database testing is enabled
    if (config['DATABASE_ENABLED'] === 'true') {
      const dbQueryPath = path.join(EnvironmentLoader.CONFIG_DIR, 'database.query.env');
      const dbQueryConfig = await this.loadEnvFileFromPath(dbQueryPath, 'database.query.env');
      additionalConfig = this.mergeConfigurations(additionalConfig, 
        this.prefixKeys(dbQueryConfig, 'QUERY_'));
    }
    
    // Load API endpoints if API testing is enabled
    if (config['API_ENABLED'] === 'true') {
      const apiEndpointPath = path.join(EnvironmentLoader.CONFIG_DIR, 'api.endpoints.env');
      const apiEndpointConfig = await this.loadEnvFileFromPath(apiEndpointPath, 'api.endpoints.env');
      additionalConfig = this.mergeConfigurations(additionalConfig, 
        this.prefixKeys(apiEndpointConfig, 'ENDPOINT_'));
    }
    
    // Load test configuration
    const testConfigPath = path.join(EnvironmentLoader.CONFIG_DIR, 'test.config.env');
    const testConfig = await this.loadEnvFileFromPath(testConfigPath, 'test.config.env');
    additionalConfig = this.mergeConfigurations(additionalConfig, testConfig);
    
    return additionalConfig;
  }

  /**
   * Prefix all keys in a config map
   */
  private prefixKeys(config: ConfigMap, prefix: string): ConfigMap {
    const prefixedConfig: ConfigMap = {};
    Object.entries(config).forEach(([key, value]) => {
      prefixedConfig[`${prefix}${key}`] = value;
    });
    return prefixedConfig;
  }

  /**
   * Interpolate variables in configuration values
   */
  private interpolateVariables(config: ConfigMap): ConfigMap {
    const interpolated: ConfigMap = {};
    const processed = new Set<string>();
    
    const interpolateValue = (key: string, value: string, depth: number = 0): string => {
      if (depth > 10) {
        throw new Error(`Circular reference detected in configuration: ${key}`);
      }
      
      if (processed.has(key)) {
        return value;
      }
      
      processed.add(key);
      
      return value.replace(EnvironmentLoader.VARIABLE_PATTERN, (match, varName) => {
        // First check in config
        if (config[varName]) {
          return interpolateValue(varName, config[varName], depth + 1);
        }
        
        // Then check environment variables
        if (process.env[varName]) {
          return process.env[varName]!;
        }
        
        // Return original if not found
        console.warn(`Variable ${varName} not found for interpolation`);
        return match;
      });
    };
    
    Object.entries(config).forEach(([key, value]) => {
      processed.clear();
      interpolated[key] = interpolateValue(key, value);
    });
    
    return interpolated;
  }

  /**
   * Add runtime environment variables
   */
  private addRuntimeVariables(config: ConfigMap, environment: string): ConfigMap {
    return {
      ...config,
      ENVIRONMENT: environment,
      EXECUTION_TIME: new Date().toISOString(),
      PROCESS_ID: process.pid.toString(),
      NODE_VERSION: process.version,
      PLATFORM: process.platform,
      WORKING_DIR: process.cwd(),
    };
  }

  /**
   * Validate environment file exists and is readable
   */
  private async validateEnvFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`Cannot read configuration file: ${filePath}`);
    }
  }

  /**
   * Get all available environments
   */
  async getAvailableEnvironments(): Promise<string[]> {
    try {
      const files = await fs.readdir(EnvironmentLoader.ENVIRONMENTS_DIR);
      return files
        .filter(file => EnvironmentLoader.ENV_FILE_PATTERN.test(file) && file !== 'global.env')
        .map(file => file.replace('.env', ''));
    } catch (error) {
      throw new Error(`Failed to read environments directory: ${error}`);
    }
  }

  /**
   * Validate environment exists
   */
  async validateEnvironment(environment: string): Promise<boolean> {
    const environments = await this.getAvailableEnvironments();
    return environments.includes(environment);
  }
}