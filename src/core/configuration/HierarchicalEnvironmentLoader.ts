import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigMap } from './types/config.types';

export class HierarchicalEnvironmentLoader {
  private static readonly CONFIG_DIR = path.join(process.cwd(), 'config');
  private static readonly ENCODING = 'utf-8';
  private static readonly ENV_FILE_PATTERN = /^(.+)\.env$/;
  private static readonly VARIABLE_PATTERN = /\${([^}]+)}/g;

  async loadConfiguration(project: string, environment: string): Promise<ConfigMap> {
    console.log(`🔄 Loading hierarchical configuration for project: ${project}, environment: ${environment}`);
    
    let mergedConfig: ConfigMap = {};
    const loadedSources: string[] = [];

    try {
      const globalConfig = await this.loadGlobalConfig();
      mergedConfig = this.mergeConfigurations(mergedConfig, globalConfig);
      if (Object.keys(globalConfig).length > 0) {
        loadedSources.push('global.env');
        console.log(`✅ Loaded ${Object.keys(globalConfig).length} keys from global.env`);
      }

      // Step 2: Load framework common files (config/common)
      const frameworkCommonConfig = await this.loadFrameworkCommonConfig();
      mergedConfig = this.mergeConfigurations(mergedConfig, frameworkCommonConfig);
      if (Object.keys(frameworkCommonConfig).length > 0) {
        loadedSources.push('framework common');
        console.log(`✅ Loaded ${Object.keys(frameworkCommonConfig).length} keys from framework common`);
      }

      // Step 3: Load project common files
      const projectCommonConfig = await this.loadProjectCommonConfig(project);
      mergedConfig = this.mergeConfigurations(mergedConfig, projectCommonConfig);
      if (Object.keys(projectCommonConfig).length > 0) {
        loadedSources.push(`${project} common`);
        console.log(`✅ Loaded ${Object.keys(projectCommonConfig).length} keys from ${project} common`);
      }

      // Step 4: Load environment-specific config
      const environmentConfig = await this.loadEnvironmentConfig(project, environment);
      mergedConfig = this.mergeConfigurations(mergedConfig, environmentConfig);
      if (Object.keys(environmentConfig).length > 0) {
        loadedSources.push(`${project}/${environment}.env`);
        console.log(`✅ Loaded ${Object.keys(environmentConfig).length} keys from ${project}/${environment}.env`);
      }

      // Step 5: Apply environment variable overrides
      const envOverrides = this.loadEnvironmentVariableOverrides();
      mergedConfig = this.mergeConfigurations(mergedConfig, envOverrides);
      if (Object.keys(envOverrides).length > 0) {
        loadedSources.push('environment variables');
        console.log(`✅ Loaded ${Object.keys(envOverrides).length} overrides from environment variables`);
      }

      // Step 6: Resolve variables
      mergedConfig = this.resolveVariables(mergedConfig);

      console.log(`✅ Configuration loaded successfully from sources: ${loadedSources.join(' → ')}`);
      console.log(`📊 Total configuration keys: ${Object.keys(mergedConfig).length}`);
      
      return mergedConfig;
    } catch (error) {
      console.error(`❌ Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async loadGlobalConfig(): Promise<ConfigMap> {
    const globalPath = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, 'global.env');
    return await this.loadEnvFileFromPath(globalPath, 'global.env');
  }

  private async loadFrameworkCommonConfig(): Promise<ConfigMap> {
    const commonDir = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, 'common');
    return await this.loadAllEnvFilesFromDirectory(commonDir, 'framework common');
  }

  private async loadProjectCommonConfig(project: string): Promise<ConfigMap> {
    const projectCommonDir = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, project, 'common');
    return await this.loadAllEnvFilesFromDirectory(projectCommonDir, `${project} common`);
  }

  private async loadEnvironmentConfig(project: string, environment: string): Promise<ConfigMap> {
    const envPath = path.join(HierarchicalEnvironmentLoader.CONFIG_DIR, project, 'environments', `${environment}.env`);
    return await this.loadEnvFileFromPath(envPath, `${project}/${environment}.env`);
  }

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
      console.log(`📂 Directory not found or empty: ${description} (${directory})`);
    }

    return mergedConfig;
  }

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

  private parseEnvFile(content: string, filePath: string): ConfigMap {
    const config: ConfigMap = {};
    const lines = content.split('\n');
    
    lines.forEach((line, lineNumber) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }
      
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        console.warn(`⚠️  Invalid line format in ${filePath}:${lineNumber + 1}: ${line}`);
        return;
      }
      
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      
      const cleanValue = value.replace(/^["']|["']$/g, '');
      
      config[key] = cleanValue;
    });
    
    return config;
  }

  private mergeConfigurations(base: ConfigMap, override: ConfigMap): ConfigMap {
    return { ...base, ...override };
  }

  private resolveVariables(config: ConfigMap): ConfigMap {
    const resolved: ConfigMap = {};
    const maxIterations = 10;
    
    const working = { ...config };
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let hasUnresolvedVariables = false;
      
      for (const [key, value] of Object.entries(working)) {
        if (typeof value === 'string' && value.includes('${')) {
          const resolvedValue = value.replace(HierarchicalEnvironmentLoader.VARIABLE_PATTERN, (match, varName) => {
            if (working[varName] !== undefined) {
              return working[varName];
            }
            if (process.env[varName] !== undefined) {
              return process.env[varName]!;
            }
            hasUnresolvedVariables = true;
            return match;
          });
          
          resolved[key] = resolvedValue;
        } else {
          resolved[key] = value;
        }
      }
      
      Object.assign(working, resolved);
      
      if (!hasUnresolvedVariables) {
        break;
      }
    }
    
    return resolved;
  }

  private loadEnvironmentVariableOverrides(): ConfigMap {
    const overrides: ConfigMap = {};
    const prefix = 'CS_';
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        const configKey = key.substring(prefix.length);
        overrides[configKey] = value;
      }
    }
    
    return overrides;
  }
} 
