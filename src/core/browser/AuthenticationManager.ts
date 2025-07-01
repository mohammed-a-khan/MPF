// src/core/browser/AuthenticationManager.ts
import { BrowserContext, Page } from 'playwright';
import { 
  HTTPCredentials, 
  Certificate, 
  ProxySettings,
  StorageState 
} from './types/browser.types';
import { CryptoUtils } from '../utils/CryptoUtils';
import { FileUtils } from '../utils/FileUtils';
import { ActionLogger } from '../logging/ActionLogger';
import { EncryptionConfigurationManager } from '../configuration/EncryptionConfigurationManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export class AuthenticationManager {
  private static instance: AuthenticationManager;
  private readonly authStateDir: string;
  private readonly certificateCache: Map<string, Certificate> = new Map();
  private readonly credentialStore: Map<string, HTTPCredentials> = new Map();

  private constructor() {
    this.authStateDir = path.join(process.cwd(), '.auth');
    this.ensureAuthDirectory();
  }

  static getInstance(): AuthenticationManager {
    if (!AuthenticationManager.instance) {
      AuthenticationManager.instance = new AuthenticationManager();
    }
    return AuthenticationManager.instance;
  }

  private async ensureAuthDirectory(): Promise<void> {
    await FileUtils.ensureDir(this.authStateDir);
  }

  async setHTTPCredentials(
    context: BrowserContext, 
    username: string, 
    password: string
  ): Promise<void> {
    try {
      const credentials: HTTPCredentials = { username, password };
      
      await context.setHTTPCredentials(credentials);
      
      const key = this.generateCredentialKey(username);
      this.credentialStore.set(key, credentials);
      
      ActionLogger.logInfo('HTTP credentials set', {
        type: 'authentication',
        action: 'http_credentials_set',
        username
      });
    } catch (error) {
      ActionLogger.logError('Failed to set HTTP credentials', error as Error);
      throw error;
    }
  }

  async setClientCertificates(
    context: BrowserContext,
    certificates: Certificate[]
  ): Promise<void> {
    try {
      const processedCerts = await Promise.all(
        certificates.map(cert => this.processCertificate(cert))
      );

      // Note: Client certificates need to be set during context creation
      (context as any)._clientCertificates = processedCerts;
      
      ActionLogger.logInfo('Client certificates set', {
        type: 'authentication',
        action: 'client_certificates_set',
        count: certificates.length
      });
    } catch (error) {
      ActionLogger.logError('Failed to set client certificates', error as Error);
      throw error;
    }
  }

  private async processCertificate(cert: Certificate): Promise<Certificate> {
    const cacheKey = this.generateCertificateKey(cert);
    const cached = this.certificateCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const processed: Certificate = { ...cert };

    if (cert.certPath) {
      const certData = await fs.readFile(cert.certPath);
      processed.cert = certData;
    }

    if (cert.keyPath) {
      const keyData = await fs.readFile(cert.keyPath);
      processed.key = keyData;
    }

    if (cert.passphrase && cert.passphrase.startsWith('encrypted:')) {
      const encryptedParts = cert.passphrase.substring(10).split(':');
      if (encryptedParts.length >= 3) {
        const encrypted = encryptedParts[0];
        const salt = encryptedParts[1];
        const iv = encryptedParts[2];
        const tag = encryptedParts[3] || '';
        
        if (encrypted && salt && iv) {
          const password = process.env['CRYPTO_PASSWORD'] || 'default-password';
          processed.passphrase = await CryptoUtils.decrypt(encrypted, password, salt, iv, tag);
        }
      }
    }

    if (cert.caPath) {
      const caData = await fs.readFile(cert.caPath);
      processed.ca = caData;
    }

    this.certificateCache.set(cacheKey, processed);
    
    return processed;
  }

  async setProxyCredentials(
    _context: BrowserContext,
    proxy: ProxySettings
  ): Promise<void> {
    try {
      if (proxy.username && proxy.password) {
        let decryptedPassword = proxy.password;
                  if (decryptedPassword.startsWith('ENCRYPTED:')) {
            const testResult = await EncryptionConfigurationManager.testDecryption(decryptedPassword);
            if (testResult.success && testResult.decrypted) {
              decryptedPassword = testResult.decrypted;
            }
        } else if (decryptedPassword.startsWith('encrypted:')) {
          const encryptedParts = decryptedPassword.substring(10).split(':');
          if (encryptedParts.length >= 3) {
            const encrypted = encryptedParts[0];
            const salt = encryptedParts[1];
            const iv = encryptedParts[2];
            const tag = encryptedParts[3] || '';
            
            if (encrypted && salt && iv) {
              const internalKey = 'CS-Framework-2024-Internal-Encryption-Key-V1';
              decryptedPassword = await CryptoUtils.decrypt(encrypted, internalKey, salt, iv, tag, {
                iterations: 10000
              });
            }
          }
        }

        (proxy as any)._decryptedPassword = decryptedPassword;

        // Note: Proxy is set during context creation
        ActionLogger.logInfo('Proxy credentials stored', {
          type: 'authentication',
          action: 'proxy_credentials_stored',
          username: proxy.username
        });
      }
    } catch (error) {
      ActionLogger.logError('Failed to set proxy credentials', error as Error);
      throw error;
    }
  }

  async saveAuthState(
    context: BrowserContext, 
    name: string
  ): Promise<void> {
    try {
      const statePath = path.join(this.authStateDir, `${name}.json`);
      
      const state = await context.storageState();
      
      const encryptedState = await this.encryptStorageState(state);
      
      await fs.writeFile(statePath, JSON.stringify(encryptedState, null, 2));
      
      ActionLogger.logInfo('Auth state saved', {
        type: 'authentication',
        action: 'auth_state_saved',
        name
      });
    } catch (error) {
      ActionLogger.logError('Failed to save auth state', error as Error);
      throw error;
    }
  }

  async loadAuthState(
    _context: BrowserContext,
    name: string
  ): Promise<void> {
    try {
      const statePath = path.join(this.authStateDir, `${name}.json`);
      
      if (!await FileUtils.exists(statePath)) {
        throw new Error(`Auth state '${name}' not found`);
      }
      
      const encryptedData = await fs.readFile(statePath, 'utf-8');
      const encryptedState = JSON.parse(encryptedData);
      
      const state = await this.decryptStorageState(encryptedState);
      
      ActionLogger.logInfo('Auth state loaded', {
        type: 'authentication',
        action: 'auth_state_loaded',
        name
      });
      
      return state as any;
    } catch (error) {
      ActionLogger.logError('Failed to load auth state', error as Error);
      throw error;
    }
  }

  async clearAuthState(context: BrowserContext): Promise<void> {
    try {
      await context.clearCookies();
      
      await context.clearPermissions();
      
      const pages = context.pages();
      for (const page of pages) {
        if (!page.isClosed()) {
          await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
          });
        }
      }
      
      ActionLogger.logInfo('Auth state cleared', {
        type: 'authentication',
        action: 'auth_state_cleared',
        scope: 'all'
      });
    } catch (error) {
      ActionLogger.logError('Failed to clear auth state', error as Error);
      throw error;
    }
  }

  async handleMFA(
    page: Page,
    mfaCode: string,
    options: {
      codeInputSelector?: string;
      submitButtonSelector?: string;
      waitForNavigation?: boolean;
    } = {}
  ): Promise<void> {
    try {
      const {
        codeInputSelector = 'input[type="text"], input[type="number"], input[name*="code"], input[name*="otp"]',
        submitButtonSelector = 'button[type="submit"], button:has-text("Submit"), button:has-text("Verify")',
        waitForNavigation = true
      } = options;

      await page.waitForSelector(codeInputSelector, { state: 'visible' });
      
      await page.fill(codeInputSelector, mfaCode);
      
      const submitButton = await page.$(submitButtonSelector);
      if (submitButton) {
        if (waitForNavigation) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            submitButton.click()
          ]);
        } else {
          await submitButton.click();
        }
      }
      
      ActionLogger.logInfo('MFA completed', {
        type: 'authentication',
        action: 'mfa_completed',
        status: 'code_submitted'
      });
    } catch (error) {
      ActionLogger.logError('Failed to handle MFA', error as Error);
      throw error;
    }
  }

  async handleOAuth2Flow(
    page: Page,
    options: {
      authorizeUrl: string;
      clientId: string;
      redirectUri: string;
      scope?: string;
      state?: string;
      responseType?: string;
    }
  ): Promise<string> {
    try {
      const {
        authorizeUrl,
        clientId,
        redirectUri,
        scope = '',
        state = this.generateState(),
        responseType = 'code'
      } = options;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        state,
        ...(scope && { scope })
      });

      const authUrl = `${authorizeUrl}?${params.toString()}`;
      
      await page.goto(authUrl);
      
      await page.waitForFunction(
        (uri) => window.location.href.startsWith(uri),
        redirectUri,
        { timeout: 60000 }
      );
      
      const url = new URL(page.url());
      const code = url.searchParams.get('code') || url.hash.match(/access_token=([^&]+)/)?.[1];
      
      if (!code) {
        throw new Error('No authorization code or token found in redirect URL');
      }
      
      ActionLogger.logInfo('OAuth2 completed', {
        type: 'authentication',
        action: 'oauth2_completed',
        status: 'authorization_code_received'
      });
      
      return code;
    } catch (error) {
      ActionLogger.logError('Failed to handle OAuth2 flow', error as Error);
      throw error;
    }
  }

  async applySSOSession(
    context: BrowserContext,
    ssoConfig: {
      provider: string;
      sessionCookies: Array<{
        name: string;
        value: string;
        domain: string;
        path?: string;
      }>;
    }
  ): Promise<void> {
    try {
      await context.addCookies(ssoConfig.sessionCookies);
      
      ActionLogger.logInfo('SSO applied', {
        type: 'authentication',
        action: 'sso_applied',
        provider: ssoConfig.provider
      });
    } catch (error) {
      ActionLogger.logError('Failed to apply SSO session', error as Error);
      throw error;
    }
  }

  private async encryptStorageState(state: StorageState): Promise<any> {
    const encrypted = { ...state };
    
    if (encrypted.cookies) {
      encrypted.cookies = await Promise.all(
        encrypted.cookies.map(async (cookie) => ({
          ...cookie,
          value: await this.encryptValue(cookie.value)
        }))
      );
    }
    
    if (encrypted.origins) {
      encrypted.origins = await Promise.all(
        encrypted.origins.map(async (origin) => ({
          ...origin,
          localStorage: await Promise.all(
            origin.localStorage.map(async (item) => ({
              ...item,
              value: await this.encryptValue(item.value)
            }))
          )
        }))
      );
    }
    
    return encrypted;
  }

  private async decryptStorageState(encryptedState: any): Promise<StorageState> {
    const decrypted = { ...encryptedState };
    
    if (decrypted.cookies) {
      decrypted.cookies = await Promise.all(
        decrypted.cookies.map(async (cookie: any) => ({
          ...cookie,
          value: await this.decryptValue(cookie.value)
        }))
      );
    }
    
    if (decrypted.origins) {
      decrypted.origins = await Promise.all(
        decrypted.origins.map(async (origin: any) => ({
          ...origin,
          localStorage: await Promise.all(
            origin.localStorage.map(async (item: any) => ({
              ...item,
              value: await this.decryptValue(item.value)
            }))
          )
        }))
      );
    }
    
    return decrypted;
  }

  private generateCredentialKey(username: string): string {
    return crypto.createHash('sha256').update(username).digest('hex');
  }

  private generateCertificateKey(cert: Certificate): string {
    const data = `${cert.origin}:${cert.certPath || ''}:${cert.keyPath || ''}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async getStoredCredentials(username: string): Promise<HTTPCredentials | null> {
    const key = this.generateCredentialKey(username);
    return this.credentialStore.get(key) || null;
  }

  async listSavedAuthStates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.authStateDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      ActionLogger.logError('Failed to list auth states', error as Error);
      return [];
    }
  }

  async deleteAuthState(name: string): Promise<void> {
    try {
      const statePath = path.join(this.authStateDir, `${name}.json`);
      await fs.unlink(statePath);
      ActionLogger.logInfo('Auth state deleted', {
        type: 'authentication',
        action: 'auth_state_deleted',
        name
      });
    } catch (error) {
      ActionLogger.logError('Failed to delete auth state', error as Error);
      throw error;
    }
  }

  private async encryptValue(value: string): Promise<any> {
    const internalKey = 'CS-Framework-2024-Internal-Encryption-Key-V1';
    const result = await CryptoUtils.encrypt(value, internalKey, {
      saltLength: 16,
      iterations: 10000
    });
    
    return {
      encrypted: result.encrypted,
      iv: result.iv,
      tag: result.tag
    };
  }

  private async decryptValue(encryptedData: any): Promise<string> {
    if (typeof encryptedData === 'string') {
      return encryptedData;
    }
    
    const internalKey = 'CS-Framework-2024-Internal-Encryption-Key-V1';
    const fixedSalt = Buffer.from('CS-Framework-Salt-2024').toString('base64');
    
    return await CryptoUtils.decrypt(
      encryptedData.encrypted,
      internalKey,
      fixedSalt,
      encryptedData.iv,
      encryptedData.tag || '',
      {
        iterations: 10000
      }
    );
  }

  dispose(): void {
    this.certificateCache.clear();
    this.credentialStore.clear();
  }
}
