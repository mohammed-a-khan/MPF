// src/core/configuration/EnvironmentLoader.ts

import * as fs from 'fs';
import * as path from 'path';
import { ConfigMap } from './types/config.types';
import dotenv from 'dotenv';

export class EnvironmentLoader {
  private readonly configDir = 'config';
  private readonly envDir = 'environments';

  async loadGlobalConfig(): Promise<ConfigMap> {
    const config: ConfigMap = {};

    const globalEnvPath = path.join(process.cwd(), this.configDir, 'global.env');
    if (fs.existsSync(globalEnvPath)) {
      const globalConfig = dotenv.parse(fs.readFileSync(globalEnvPath));
      Object.assign(config, globalConfig);
      console.log('✅ Loaded global.env configuration');
    }

    const configFiles = fs.readdirSync(path.join(process.cwd(), this.configDir))
      .filter(file => file.endsWith('.env') && !file.includes('environments/'));

    for (const file of configFiles) {
      if (file !== 'global.env') {
        const envPath = path.join(process.cwd(), this.configDir, file);
        const envConfig = dotenv.parse(fs.readFileSync(envPath));
        Object.assign(config, envConfig);
        console.log(`✅ Loaded ${file} configuration`);
      }
    }

    return config;
  }

  async loadEnvironmentFiles(environment: string): Promise<ConfigMap> {
    const config: ConfigMap = {};

    const envPath = path.join(process.cwd(), this.configDir, this.envDir, `${environment}.env`);
    if (fs.existsSync(envPath)) {
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      Object.assign(config, envConfig);
      console.log(`✅ Loaded ${environment}.env configuration`);
    }

    return config;
  }
}
