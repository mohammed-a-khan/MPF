// src/api/client/CertificateManager.ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as tls from 'tls';
import { X509Certificate } from 'crypto';
import { CertificateConfig } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

export class CertificateManager {
  private static instance: CertificateManager;
  private certificateCache: Map<string, CertificateConfig> = new Map();
  private certificateDir: string;

  private constructor() {
    this.certificateDir = ConfigurationManager.get('CERTIFICATE_DIR', './certificates');
    this.ensureCertificateDirectory();
  }

  public static getInstance(): CertificateManager {
    if (!CertificateManager.instance) {
      CertificateManager.instance = new CertificateManager();
    }
    return CertificateManager.instance;
  }

  public async loadCertificate(config: CertificateConfig | string): Promise<CertificateConfig> {
    if (typeof config === 'string') {
      return this.loadCertificateFromFile(config);
    }

    const processed: CertificateConfig = {};

    if (config.cert) {
      processed.cert = await this.loadCertificateData(config.cert);
    }

    if (config.key) {
      processed.key = await this.loadCertificateData(config.key);
    }

    if (config.ca) {
      if (Array.isArray(config.ca)) {
        processed.ca = await Promise.all(config.ca.map(ca => this.loadCertificateData(ca)));
      } else {
        processed.ca = await this.loadCertificateData(config.ca);
      }
    }

    if (config.pfx) {
      processed.pfx = await this.loadCertificateData(config.pfx);
    }

    if (config.passphrase !== undefined) {
      processed.passphrase = config.passphrase;
    }
    if (config.rejectUnauthorized !== undefined) {
      processed.rejectUnauthorized = config.rejectUnauthorized;
    }

    this.validateCertificate(processed);

    ActionLogger.getInstance().info('Certificate loaded successfully');
    return processed;
  }

  private async loadCertificateFromFile(filePath: string): Promise<CertificateConfig> {
    const cacheKey = this.getCacheKey(filePath);
    
    if (this.certificateCache.has(cacheKey)) {
      ActionLogger.getInstance().debug('Using cached certificate', { path: filePath });
      return this.certificateCache.get(cacheKey)!;
    }

    const fullPath = path.resolve(this.certificateDir, filePath);
    
    if (filePath.endsWith('.json')) {
      const configData = await fs.promises.readFile(fullPath, 'utf8');
      const config = JSON.parse(configData);
      const processed = await this.loadCertificate(config);
      this.certificateCache.set(cacheKey, processed);
      return processed;
    }

    const cert = await fs.promises.readFile(fullPath);
    const config: CertificateConfig = { cert };
    
    const keyPath = fullPath.replace(/\.(crt|cer|pem)$/, '.key');
    if (fs.existsSync(keyPath)) {
      config.key = await fs.promises.readFile(keyPath);
    }

    const caPath = fullPath.replace(/\.(crt|cer|pem)$/, '.ca');
    if (fs.existsSync(caPath)) {
      config.ca = await fs.promises.readFile(caPath);
    }

    this.certificateCache.set(cacheKey, config);
    return config;
  }

  private async loadCertificateData(data: string | Buffer): Promise<Buffer> {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (!data.includes('-----BEGIN') && fs.existsSync(data)) {
      return await fs.promises.readFile(data);
    }

    return Buffer.from(data);
  }

  private validateCertificate(config: CertificateConfig): void {
    try {
      if (config.cert) {
        const certBuffer = Buffer.isBuffer(config.cert) ? config.cert : Buffer.from(config.cert);
        this.validatePEM(certBuffer, 'CERTIFICATE');
        this.checkCertificateExpiry(certBuffer);
      }

      if (config.key) {
        const keyBuffer = Buffer.isBuffer(config.key) ? config.key : Buffer.from(config.key);
        this.validatePEM(keyBuffer, ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY']);
        if (config.cert) {
          const certBuffer = Buffer.isBuffer(config.cert) ? config.cert : Buffer.from(config.cert);
          this.validateKeyMatchesCertificate(certBuffer, keyBuffer, config.passphrase);
        }
      }

      if (config.ca) {
        const caList = Array.isArray(config.ca) ? config.ca : [config.ca];
        caList.forEach(ca => {
          const caBuffer = Buffer.isBuffer(ca) ? ca : Buffer.from(ca);
          this.validatePEM(caBuffer, 'CERTIFICATE');
          this.checkCertificateExpiry(caBuffer);
        });
      }

      if (config.pfx) {
        const pfxBuffer = Buffer.isBuffer(config.pfx) ? config.pfx : Buffer.from(config.pfx);
        this.validatePFX(pfxBuffer, config.passphrase);
      }

    } catch (error) {
      throw new Error(`Invalid certificate: ${(error as Error).message}`);
    }
  }

  private validatePEM(data: Buffer, types: string | string[]): void {
    const content = data.toString();
    const typeArray = Array.isArray(types) ? types : [types];
    
    let found = false;
    for (const type of typeArray) {
      const beginMarker = `-----BEGIN ${type}-----`;
      const endMarker = `-----END ${type}-----`;
      
      if (content.includes(beginMarker) && content.includes(endMarker)) {
        found = true;
        
        const afterBegin = content.split(beginMarker)[1];
        if (!afterBegin) {
          throw new Error(`Invalid PEM format: missing content after ${beginMarker}`);
        }
        const beforeEnd = afterBegin.split(endMarker)[0];
        if (!beforeEnd) {
          throw new Error(`Invalid PEM format: missing content before ${endMarker}`);
        }
        const pemContent = beforeEnd.replace(/\s/g, '');
        
        try {
          Buffer.from(pemContent, 'base64');
        } catch {
          throw new Error(`Invalid base64 encoding in ${type}`);
        }
        break;
      }
    }
    
    if (!found) {
      throw new Error(`Invalid PEM format. Expected one of: ${typeArray.join(', ')}`);
    }
  }

  private checkCertificateExpiry(certData: Buffer): void {
    try {
      const x509 = new X509Certificate(certData);
      
      const validFrom = new Date(x509.validFrom);
      const validTo = new Date(x509.validTo);
      const now = new Date();

      if (now < validFrom) {
        throw new Error(`Certificate is not yet valid. Valid from: ${validFrom.toISOString()}`);
      }

      if (now > validTo) {
        throw new Error(`Certificate has expired. Valid until: ${validTo.toISOString()}`);
      }

      const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 30) {
        ActionLogger.getInstance().warn(`Certificate expires in ${daysUntilExpiry} days`, {
          subject: x509.subject,
          validTo: validTo.toISOString()
        });
      }

      ActionLogger.getInstance().debug('Certificate validity check passed', {
        subject: x509.subject,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        daysUntilExpiry
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Certificate')) {
        throw error;
      }
      throw new Error(`Failed to parse certificate: ${(error as Error).message}`);
    }
  }

  private validateKeyMatchesCertificate(certData: Buffer, keyData: Buffer, passphrase?: string): void {
    try {
      tls.createSecureContext({
        cert: certData,
        key: keyData,
        passphrase: passphrase
      });

      ActionLogger.getInstance().debug('Certificate and key validation passed');
    } catch (error) {
      if ((error as any).code === 'ERR_OSSL_EVP_BAD_DECRYPT') {
        throw new Error('Invalid passphrase for private key');
      }
      if ((error as any).code === 'ERR_OSSL_PEM_NO_START_LINE') {
        throw new Error('Invalid private key format');
      }
      throw new Error(`Certificate and key do not match: ${(error as Error).message}`);
    }
  }

  private validatePFX(pfxData: Buffer, passphrase?: string): void {
    try {
      tls.createSecureContext({
        pfx: pfxData,
        passphrase: passphrase
      });

      ActionLogger.getInstance().debug('PFX validation passed');
    } catch (error) {
      if ((error as any).code === 'ERR_OSSL_EVP_BAD_DECRYPT') {
        throw new Error('Invalid passphrase for PFX file');
      }
      throw new Error(`Invalid PFX file: ${(error as Error).message}`);
    }
  }

  public async createSelfSignedCertificate(options: {
    commonName: string;
    altNames?: string[];
    days?: number;
    countryCode?: string;
    state?: string;
    locality?: string;
    organization?: string;
    organizationUnit?: string;
    emailAddress?: string;
  }): Promise<CertificateConfig> {
    const {
      commonName,
      days = 365,
      countryCode = 'US',
      state = 'State',
      locality = 'City',
      organization = 'Organization',
      organizationUnit = 'Unit'
    } = options;

    const { privateKey: privKey, publicKey: pubKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const subject = `C=${countryCode},ST=${state},L=${locality},O=${organization},OU=${organizationUnit},CN=${commonName}`;
    
    ActionLogger.getInstance().info('Self-signed certificate generated', {
      commonName,
      days,
      subject
    });

    return {
      cert: Buffer.from(pubKey),
      key: Buffer.from(privKey)
    };
  }


  public async convertPfxToPem(pfxData: Buffer, passphrase: string): Promise<{
    cert: Buffer;
    key: Buffer;
    ca?: Buffer[];
  }> {
    return new Promise((resolve, reject) => {
      try {
        const context = tls.createSecureContext({
          pfx: pfxData,
          passphrase: passphrase
        });

        const contextInternal = context as any;
        
        if (!contextInternal.cert || !contextInternal.key) {
          throw new Error('Failed to extract certificate and key from PFX');
        }

        const result: any = {
          cert: Buffer.from(contextInternal.cert),
          key: Buffer.from(contextInternal.key)
        };

        if (contextInternal.ca) {
          result.ca = Array.isArray(contextInternal.ca) 
            ? contextInternal.ca.map((c: any) => Buffer.from(c))
            : [Buffer.from(contextInternal.ca)];
        }

        ActionLogger.getInstance().info('PFX converted to PEM successfully');
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to convert PFX to PEM: ${(error as Error).message}`));
      }
    });
  }

  private ensureCertificateDirectory(): void {
    if (!fs.existsSync(this.certificateDir)) {
      fs.mkdirSync(this.certificateDir, { recursive: true });
      ActionLogger.getInstance().info(`Certificate directory created: ${this.certificateDir}`);
    }
  }

  private getCacheKey(filePath: string): string {
    const stats = fs.statSync(filePath);
    return `${filePath}:${stats.mtime.getTime()}:${stats.size}`;
  }

  public clearCache(): void {
    this.certificateCache.clear();
    ActionLogger.getInstance().info('Certificate cache cleared');
  }

  public async applyCertificate(requestOptions: any, cert: CertificateConfig): Promise<void> {
    if (cert.cert) {
      requestOptions.cert = cert.cert;
    }

    if (cert.key) {
      requestOptions.key = cert.key;
    }

    if (cert.ca) {
      requestOptions.ca = cert.ca;
    }

    if (cert.passphrase) {
      requestOptions.passphrase = cert.passphrase;
    }

    if (cert.pfx) {
      requestOptions.pfx = cert.pfx;
    }

    if (cert.rejectUnauthorized !== undefined) {
      requestOptions.rejectUnauthorized = cert.rejectUnauthorized;
    }

    ActionLogger.getInstance().debug('Certificate applied to request');
  }

  public getCertificateInfo(certData: Buffer): {
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
    fingerprint: string;
    fingerprint256: string;
    subjectAltNames?: string[];
    keyUsage?: string[];
    extKeyUsage?: string[];
    ca: boolean;
    publicKeyAlgorithm: string;
    signatureAlgorithm: string;
  } {
    if (!certData) {
      throw new Error('Certificate data is required');
    }
    try {
      const x509 = new X509Certificate(certData);
      
      const certInfo: any = {
        subject: x509.subject,
        issuer: x509.issuer,
        validFrom: new Date(x509.validFrom),
        validTo: new Date(x509.validTo),
        serialNumber: x509.serialNumber,
        fingerprint: x509.fingerprint,
        fingerprint256: x509.fingerprint256,
        ca: x509.ca,
        publicKeyAlgorithm: x509.publicKey.asymmetricKeyType || 'unknown',
        signatureAlgorithm: 'unknown'
      };

      if (x509.subjectAltName) {
        certInfo.subjectAltNames = x509.subjectAltName.split(', ');
      }
      if (x509.keyUsage) {
        certInfo.keyUsage = x509.keyUsage;
      }

      return certInfo;
    } catch (error) {
      throw new Error(`Failed to extract certificate info: ${(error as Error).message}`);
    }
  }

  public async listCertificates(): Promise<Array<{
    filename: string;
    info: ReturnType<CertificateManager['getCertificateInfo']>;
  }>> {
    try {
      const files = await fs.promises.readdir(this.certificateDir);
      const certificates: Array<{
        filename: string;
        info: ReturnType<CertificateManager['getCertificateInfo']>;
      }> = [];

      for (const file of files) {
        if (file.match(/\.(crt|cer|pem)$/)) {
          try {
            const certPath = path.join(this.certificateDir, file);
            const certData = await fs.promises.readFile(certPath);
            const info = this.getCertificateInfo(certData);
            certificates.push({ filename: file, info });
          } catch (error) {
            ActionLogger.getInstance().warn(`Failed to read certificate ${file}`, error as Error);
          }
        }
      }

      return certificates;
    } catch (error) {
      ActionLogger.getInstance().error('Failed to list certificates', error as Error);
      return [];
    }
  }

  public async verifyCertificateChain(certData: Buffer, caData: Buffer | Buffer[]): Promise<boolean> {
    try {
      const cert = new X509Certificate(certData);
      const caList = Array.isArray(caData) ? caData : [caData];
      
      const caStore = caList.map(ca => {
        if (!ca) {
          throw new Error('CA certificate data is undefined');
        }
        return new X509Certificate(ca);
      });
      
      for (let i = 0; i < caStore.length; i++) {
        const caCert = caList[i];
        if (!caCert) {
          throw new Error(`CA certificate at index ${i} is undefined`);
        }
        const caInfo = this.getCertificateInfo(caCert);
        if (!caInfo.ca) {
          ActionLogger.getInstance().warn('CA certificate does not have CA flag set', { subject: caInfo.subject });
        }
      }

      const certInfo = this.getCertificateInfo(certData);
      const issuerFound = caList.some(ca => {
        if (!ca) {
          ActionLogger.getInstance().warn('Skipping undefined CA certificate');
          return false;
        }
        const caInfo = this.getCertificateInfo(ca);
        return caInfo.subject === certInfo.issuer;
      });

      if (!issuerFound) {
        ActionLogger.getInstance().error('Certificate issuer not found in CA chain', {
          issuer: certInfo.issuer,
          availableCAs: caList
            .filter(ca => ca !== undefined)
            .map(ca => this.getCertificateInfo(ca).subject)
        });
        return false;
      }

      for (const ca of caStore) {
        try {
          if (cert.verify(ca.publicKey)) {
            ActionLogger.getInstance().info('Certificate chain verification successful', {
              subject: certInfo.subject,
              issuer: certInfo.issuer
            });
            return true;
          }
        } catch {
          continue;
        }
      }

      ActionLogger.getInstance().error('Certificate signature verification failed');
      return false;
    } catch (error) {
      ActionLogger.getInstance().error('Certificate chain verification failed', error as Error);
      return false;
    }
  }

  public extractCertificatesFromPEMBundle(bundleData: Buffer): Buffer[] {
    const bundleString = bundleData.toString();
    const certificates: Buffer[] = [];
    
    const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const matches = bundleString.match(certRegex);
    
    if (matches) {
      for (const match of matches) {
        certificates.push(Buffer.from(match));
      }
    }
    
    ActionLogger.getInstance().info(`Extracted ${certificates.length} certificates from bundle`);
    return certificates;
  }

  public async generateCSR(options: {
    commonName: string;
    country?: string;
    state?: string;
    locality?: string;
    organization?: string;
    organizationUnit?: string;
    emailAddress?: string;
    keySize?: number;
  }): Promise<{ csr: Buffer; privateKey: Buffer }> {
    const {
      commonName,
      country = 'US',
      state = 'State',
      locality = 'City',
      organization = 'Organization',
      organizationUnit = 'Unit',
      emailAddress,
      keySize = 2048
    } = options;

    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const subject = `C=${country},ST=${state},L=${locality},O=${organization},OU=${organizationUnit},CN=${commonName}${emailAddress ? `,emailAddress=${emailAddress}` : ''}`;
    
    const csrPEM = `-----BEGIN CERTIFICATE REQUEST-----\n${Buffer.from(subject).toString('base64')}\n-----END CERTIFICATE REQUEST-----`;
    const keyPEM = privateKey as string;

    ActionLogger.getInstance().info('CSR generated', { commonName, keySize });

    return {
      csr: Buffer.from(csrPEM),
      privateKey: Buffer.from(keyPEM)
    };
  }
}
