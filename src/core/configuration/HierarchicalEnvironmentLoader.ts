import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigMap } from './types/config.types';

/**
 * Hierarchical Environment Loader
 * Implements the new configuration loading strategy:
 * 1. Load global.env (always)
 * 2. Load common/*.env files (always) 
 * 3. Load project-specific common files (project/common/*.env)
 * 4. Load environment-specific files (project/environments/{env}.env)
 * 
 * Loading order (higher priority overrides lower):
 * 1. global.env
 * 2. common/*.env (framework level)
 * 3. project/common/*.env (project level)
 * 4. project/environments/{env}.env (environment level)
 */
export class HierarchicalEnvironmentLoader {
  private static readonly CONFIG_DIR = path.join(process.cwd(), 'config');
  private static readonly ENCODING = 'utf-8';
  private static readonly ENV_FILE_PATTERN = /^(.+)\.env$/;
  private static readonly VARIABLE_PATTERN = /\${([^}]+)}/g;

  /**
   * Load configuration with hierarchical structure
   */
  async loadConfiguration(project: string, environment: string): Promise<ConfigMap> {
    console.log(`🔄 Loading hierarchical configuration for project: ${project}, environment: ${environment}`);
    
    let mergedConfig: ConfigMap = {};
    const loadedSources: string[] = [];

    try {
      // Step 1: Load global.env
      const globalConfig = await this.loadGlobalConfig();
      mergedConfig = this.mergeConfigurations(mergedConfig, globalConfig);
      if (Object.keys(globalConfig).length > 0) {
        loadedSources.push('global.env');
        console.log(`✅ Loaded ${Object.keys(globalConfig).length} keys from global.env`);
      }

      // Step 2: Load framework common files (config/common/*.env)
      const frameworkCommonConfig = await this.loadFrameworkCommonConfig();
      mergedConfig = this.mergeConfigurations(mergedConfig, frameworkCommonConfig);
      if (Object.keys(frameworkCommonConfig).length > 0) {
        loadedSources.push('common/*.env');
        console.log(`✅ Loaded ${Object.keys(frameworkCommonConfig).length} keys from framework common files`);
      }

      // Step 3: Load project-specific common files (config/{project}/common/*.env)
      const projectCommonConfig = await this.loadProjectCommonConfig(project);
      mergedConfig = this.mergeConfigurations(mergedConfig, projectCommonConfig);
      if (Object.keys(projectCommonConfig).length > 0) {
        loadedSources.push(`${project}/common/*.env`);
        console.log(`✅ Loaded ${Object.keys(projectCommonConfig).length} keys from ${project} common files`);
      }

      // Step 4: Load environment-specific file (config/{project}/environments/{env}.env)
      const environmentConfig = await this.loadEnvironmentConfig(project, environment);
      mergedConfig = this.mergeConfigurations(mergedConfig, environmentConfig);
      if (Object.keys(environmentConfig).length > 0) {
        loadedSources.push(`${project}/environments/${environment}.env`);
        console.log(`✅ Loaded ${Object.keys(environmentConfig).length} keys from ${project}/${environment}.env`);
      }

      // Step 5: Resolve variable interpolation
      mergedConfig = this.resolveVariables(mergedConfig);

      console.log(`🎯 Total configuration loaded: ${Object.keys(mergedConfig).length} keys from ${loadedSources.length} sources`);
      console.log(`📁 Sources: ${loadedSources.join(', ')}`);

      return mergedConfig;

    } catch (error) {
      console.error(`❌ Error loading hierarchical configuration:`, error);
      throw error;
    }
  }

  /**
   * Load global.env from config root
   */
  private async loadGlobalConfig(): Promise<ConfigMap> {
    const globalPath = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, 'global.env');
    return await this.loadEnvFileFromPath(globalPath, 'global.env');
  }

  /**
   * Load all .env files from config/common/ directory
   */
  private async loadFrameworkCommonConfig(): Promise<ConfigMap> {
    const commonDir = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, 'common');
    return await this.loadAllEnvFilesFromDirectory(commonDir, 'framework common');
  }

  /**
   * Load all .env files from config/{project}/common/ directory
   */
  private async loadProjectCommonConfig(project: string): Promise<ConfigMap> {
    const projectCommonDir = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, project, 'common');
    return await this.loadAllEnvFilesFromDirectory(projectCommonDir, `${project} common`);
  }

  /**
   * Load environment-specific file from config/{project}/environments/{env}.env
   */
  private async loadEnvironmentConfig(project: string, environment: string): Promise<ConfigMap> {
    const envPath = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, project, 'environments', `${environment}.env`);
    return await this.loadEnvFileFromPath(envPath, `${project}/${environment}.env`);
  }

  /**
   * Load all .env files from a directory
   */
  private async loadAllEnvFilesFromDirectory(directory: string, description: string): Promise<ConfigMap> {
    let mergedConfig: ConfigMap = {};

    try {
      const files = await fs.readdir(directory);
      const envFiles = files.filter(file => HierarchicalEnvironmentLoader.ENV_FILE_PATTERN.test(file));

      for (const file of envFiles) {
        const filePath = path.join(directory, file);
        const fileConfig = await this.loadEnvFileFromPath(filePath, `${description}/${file}`);
        mergedConfig = this.mergeConfigurations(mergedConfig, fileConfig);
      }

      if (envFiles.length > 0) {
        console.log(`📂 Loaded ${envFiles.length} files from ${description}: ${envFiles.join(', ')}`);
      }

    } catch (error) {
      // Directory doesn't exist or is not accessible - this is okay
      console.log(`📂 Directory not found or empty: ${description} (${directory})`);
    }

    return mergedConfig;
  }

  /**
   * Load a single .env file from path
   */
  private async loadEnvFileFromPath(filePath: string, description: string): Promise<ConfigMap> {
    try {
      const content = await fs.readFile(filePath, HierarchicalEnvironmentLoader.ENCODING);
      const config = this.parseEnvFile(content, filePath);
      console.log(`📄 Loaded ${Object.keys(config).length} keys from ${description}`);
      return config;
    } catch (error) {
      console.log(`📄 File not found: ${description} (${filePath})`);
      return {};
    }
  }

  /**
   * Parse environment file content
   */
  private parseEnvFile(content: string, filePath: string): ConfigMap {
    const config: ConfigMap = {};
    const lines = content.split('\n');
    
    lines.forEach((line, lineNumber) => {
      // Skip empty lines and comments
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }
      
      // Parse KEY=VALUE format
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        console.warn(`⚠️  Invalid line format in ${filePath}:${lineNumber + 1}: ${line}`);
        return;
      }
      
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');
      
      config[key] = cleanValue;
    });
    
    return config;
  }

  /**
   * Merge two configuration objects (second overrides first)
   */
  private mergeConfigurations(base: ConfigMap, override: ConfigMap): ConfigMap {
    return { ...base, ...override };
  }

  /**
   * Resolve variable interpolation in configuration values
   */
  private resolveVariables(config: ConfigMap): ConfigMap {
    const resolved: ConfigMap = {};
    const maxIterations = 10; // Prevent infinite loops
    
    // Create a copy to work with
    const working = { ...config };
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let hasUnresolvedVariables = false;
      
      for (const [key, value] of Object.entries(working)) {
        if (typeof value === 'string' && value.includes('${')) {
          const resolvedValue = value.replace(HierarchicalEnvironmentLoader.VARIABLE_PATTERN, (match, varName) => {
            // Check if variable exists in working config
            if (working[varName] !== undefined) {
              return working[varName];
            }
            // Check process.env as fallback
            if (process.env[varName] !== undefined) {
              return process.env[varName]!;
            }
            // Variable not found, keep placeholder
            hasUnresolvedVariables = true;
            return match;
          });
          
          resolved[key] = resolvedValue;
        } else {
          resolved[key] = value;
        }
      }
      
      // Update working copy
      Object.assign(working, resolved);
      
      // If no unresolved variables, we're done
      if (!hasUnresolvedVariables) {
        break;
      }
    }
    
    return resolved;
  }
} 