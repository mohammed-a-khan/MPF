/**
 * CS Test Automation Framework
 * Certificate Authentication Manager
 * Handles client certificate authentication with full validation
 * 
 * @version 4.0.0
 * @author CS Test Automation Team
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { Agent as HttpsAgent } from 'https';
import { createHash, X509Certificate, randomBytes } from 'crypto';
import { performance } from 'perf_hooks';
import { promisify } from 'util';
import { exec } from 'child_process';
import { URL } from 'url';
import * as tls from 'tls';

import {
  CertificateAuthConfig,
  CertificateInfo,
  CertificateValidationResult,
  CertificateStore,
  TrustStore,
  CertificateFormat,
  CertificateError,
  KeyFormat,
  PKCS12Info,
  CertificateMetrics,
  CertificateCache,
  ValidationOptions,
  CertificateUsage,
  RevocationCheckResult,
  OCSPResponse,
  CRLInfo,
  CertificateConstraints,
  PublicKeyInfo,
  ExtendedKeyUsage,
  SubjectAlternativeName
} from './auth.types';

import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { RequestOptions } from '../types/api.types';

const execAsync = promisify(exec);

/**
 * Certificate Manager Implementation
 */
export class CertificateManager {
  private static instance: CertificateManager;
  private readonly logger: Logger;
  private readonly actionLogger: ActionLogger;

  // Certificate stores
  private readonly certificateStore: Map<string, CertificateStore> = new Map();
  private readonly trustStore: Map<string, TrustStore> = new Map();
  private readonly certificateCache: Map<string, CertificateCache> = new Map();
  private readonly agentCache: Map<string, HttpsAgent> = new Map();

  // Revocation caches
  private readonly ocspCache: Map<string, OCSPResponse> = new Map();
  private readonly crlCache: Map<string, CRLInfo> = new Map();

  // Metrics
  private readonly metrics: CertificateMetrics = {
    certificatesLoaded: 0,
    certificatesValidated: 0,
    certificatesFailed: 0,
    revocationChecks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageValidationTime: 0,
    validationErrors: [],
    lastReset: new Date()
  };

  // Configuration
  private readonly config = {
    validateCertificates: true,
    checkRevocation: true,
    allowExpiredCertificates: false,
    allowSelfSignedCertificates: false,
    trustSystemCertificates: true,
    additionalCAPath: ConfigurationManager.get('CERTIFICATE_CA_PATH'),
    certificateStorePath: ConfigurationManager.get('CERTIFICATE_STORE_PATH', './certs'),
    maxCertificateAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    ocspTimeout: 5000,
    crlTimeout: 10000,
    cacheTTL: 3600000, // 1 hour
    enableMetrics: true,
    strictValidation: ConfigurationManager.getBoolean('CERTIFICATE_STRICT_VALIDATION', true),
    supportedFormats: ['pem', 'der', 'pfx', 'p12', 'cer', 'crt'] as CertificateFormat[],
    supportedKeyFormats: ['pem', 'der', 'pkcs8'] as KeyFormat[],
    minKeySize: {
      rsa: 2048,
      dsa: 2048,
      ec: 256
    },
    allowedSignatureAlgorithms: [
      'sha256WithRSAEncryption',
      'sha384WithRSAEncryption',
      'sha512WithRSAEncryption',
      'ecdsa-with-SHA256',
      'ecdsa-with-SHA384',
      'ecdsa-with-SHA512'
    ]
  };

  /**
   * Private constructor for singleton
   */
  private constructor() {
    this.logger = Logger.getInstance();
    this.actionLogger = ActionLogger.getInstance();

    this.initializeTrustStore();
    this.startCleanupTimer();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CertificateManager {
    if (!CertificateManager.instance) {
      CertificateManager.instance = new CertificateManager();
    }
    return CertificateManager.instance;
  }

  /**
   * Apply certificate authentication to request
   */
  public async applyCertificateAuth(
    _request: RequestOptions,
    config: CertificateAuthConfig
  ): Promise<{
    agent: HttpsAgent;
    headers?: Record<string, string> | undefined;
    validUntil: Date;
    subject: string;
    issuer: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    const startTime = performance.now();
    const correlationId = this.generateCorrelationId();

    try {
      this.actionLogger.logAction('certificate_auth', {
        action: 'apply',
        certPath: config.certPath,
        correlationId,
        timestamp: new Date()
      });

      // Load certificate and key
      const certificateInfo = await this.loadCertificate(config);

      // Validate certificate
      if (this.config.validateCertificates) {
        const validationResult = await this.validateCertificate(certificateInfo);
        if (!validationResult.isValid) {
          throw new CertificateError(
            `Certificate validation failed: ${validationResult.errors.join(', ')}`,
            'VALIDATION_FAILED'
          );
        }
      }

      // Create HTTPS agent
      const agent = await this.createHttpsAgent(certificateInfo, config);

      // Store in cache
      const cacheKey = this.generateCacheKey(config);
      this.agentCache.set(cacheKey, agent);

      // Update metrics
      this.updateMetrics(true, performance.now() - startTime);

      // Extract certificate details
      const certDetails = this.extractCertificateDetails(certificateInfo.certificate);

      return {
        agent,
        headers: config.headers || undefined,
        validUntil: certDetails.validTo,
        subject: certDetails.subject,
        issuer: certDetails.issuer,
        serialNumber: certDetails.serialNumber,
        fingerprint: certDetails.fingerprint
      };

    } catch (error) {
      this.updateMetrics(false, performance.now() - startTime);

      this.logger.error('Certificate authentication failed', {
        error: error instanceof Error ? error.message : String(error),
        correlationId
      });

      throw error;
    }
  }

  /**
   * Create HTTPS agent with certificate
   */
  private async createHttpsAgent(
    certificateInfo: CertificateInfo,
    config: CertificateAuthConfig
  ): Promise<HttpsAgent> {
    const agentOptions: tls.ConnectionOptions = {
      cert: certificateInfo.certificate,
      key: certificateInfo.privateKey,
      passphrase: config.passphrase,
      rejectUnauthorized: config.rejectUnauthorized !== false,
      checkServerIdentity: config.checkServerIdentity !== false ? undefined : () => undefined,
      minVersion: config.minVersion,
      ciphers: config.ciphers
    };

    if (certificateInfo.ca) {
      agentOptions.ca = certificateInfo.ca;
    }

    return new HttpsAgent(agentOptions as any);
  }

  /**
   * Extract certificate details
   */
  private extractCertificateDetails(certPem: string): {
    subject: string;
    issuer: string;
    serialNumber: string;
    fingerprint: string;
    validFrom: Date;
    validTo: Date;
  } {
    const x509 = new X509Certificate(certPem);

    return {
      subject: x509.subject,
      issuer: x509.issuer,
      serialNumber: x509.serialNumber,
      fingerprint: x509.fingerprint,
      validFrom: new Date(x509.validFrom),
      validTo: new Date(x509.validTo)
    };
  }

  /**
   * Validate certificate chain
   */
  private async validateCertificateChain(certInfo: CertificateInfo): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;

    try {
      const mainCert = new X509Certificate(certInfo.certificate);

      // Check if we have CA certificates to validate against
      const caCerts = certInfo.ca || [];
      const chainCerts = certInfo.chain || [];
      const allCACerts = [...caCerts, ...chainCerts];

      if (allCACerts.length === 0) {
        warnings.push('No CA certificates provided for chain validation');
        return { isValid: true, errors, warnings };
      }

      // Validate each certificate in the chain
      let currentCert = mainCert;
      let foundRoot = false;

      for (const caCertPem of allCACerts) {
        const caCert = new X509Certificate(caCertPem);

        // Check if this CA cert issued the current cert
        if (currentCert.issuer === caCert.subject) {
          // Validate CA certificate
          const now = new Date();
          const validFrom = new Date(caCert.validFrom);
          const validTo = new Date(caCert.validTo);

          if (now < validFrom || now > validTo) {
            errors.push(`CA certificate expired or not yet valid: ${caCert.subject}`);
            isValid = false;
          }

          // Check if this is a root certificate (self-signed)
          if (caCert.issuer === caCert.subject) {
            foundRoot = true;
            break;
          }

          currentCert = caCert;
        }
      }

      if (!foundRoot && this.config.strictValidation) {
        warnings.push('Certificate chain does not end with a root certificate');
      }

    } catch (error) {
      errors.push(`Chain validation error: ${error instanceof Error ? error.message : String(error)}`);
      isValid = false;
    }

    return { isValid, errors, warnings };
  }

  /**
   * Check certificate revocation status
   */
  private async checkRevocationStatus(cert: X509Certificate): Promise<RevocationCheckResult> {
    try {
      // Try OCSP first
      const ocspResult = await this.checkOCSP(cert);
      if (ocspResult.checked) {
        return ocspResult;
      }

      // Fall back to CRL
      const crlResult = await this.checkCRL(cert);
      return crlResult;

    } catch (error) {
      return {
        checked: false,
        isRevoked: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate hostname against certificate
   */
  private validateHostname(
    hostname: string,
    subject: string,
    san?: SubjectAlternativeName[]
  ): boolean {
    // Check Subject Alternative Names first
    if (san && san.length > 0) {
      for (const altName of san) {
        if (altName.type === 'dns' && this.matchesHostname(hostname, altName.value)) {
          return true;
        }
        if (altName.type === 'ip' && hostname === altName.value) {
          return true;
        }
      }
    }

    // Check Common Name in subject
    const cnMatch = subject.match(/CN=([^,]+)/);
    if (cnMatch && cnMatch[1]) {
      return this.matchesHostname(hostname, cnMatch[1]);
    }

    return false;
  }

  /**
   * Check if hostname matches pattern (with wildcard support)
   */
  private matchesHostname(hostname: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      // Wildcard certificate
      const domain = pattern.substring(2);
      const hostParts = hostname.split('.');
      const patternParts = domain.split('.');

      if (hostParts.length !== patternParts.length + 1) {
        return false;
      }

      return hostname.endsWith(domain);
    }

    return hostname.toLowerCase() === pattern.toLowerCase();
  }

  /**
   * Extract certificate constraints
   */
  private extractCertificateConstraints(_x509: X509Certificate): CertificateConstraints {
    // This is a simplified implementation
    // In a real implementation, you would parse the certificate extensions
    return {
      ca: false, // Would need to check basicConstraints extension
      pathLength: undefined,
      keyUsage: [],
      extendedKeyUsage: []
    };
  }

  /**
   * Load certificate from file or content
   */
  private async loadCertificate(config: CertificateAuthConfig): Promise<CertificateInfo> {
    let certContent: Buffer;
    let keyContent: Buffer;
    let caContent: Buffer | undefined;

    // Load certificate
    if (config.cert) {
      certContent = Buffer.from(config.cert);
    } else if (config.certPath) {
      const certPath = resolve(config.certPath);
      if (!existsSync(certPath)) {
        throw new CertificateError(`Certificate file not found: ${certPath}`, 'FILE_NOT_FOUND');
      }
      certContent = readFileSync(certPath);
    } else {
      throw new CertificateError('Certificate path or content is required', 'MISSING_CERTIFICATE');
    }

    // Detect certificate format
    const certFormat = this.detectCertificateFormat(certContent, config.certPath);

    // Handle different formats
    if (certFormat === 'pfx' || certFormat === 'p12') {
      // PKCS#12 format contains both cert and key
      const pkcs12Info = await this.parsePKCS12(certContent, config.passphrase);
      return {
        certificate: pkcs12Info.certificate,
        privateKey: pkcs12Info.privateKey,
        ca: pkcs12Info.ca || undefined,
        format: certFormat,
        raw: certContent
      };
    }

    // Load private key for other formats
    if (config.key) {
      keyContent = Buffer.from(config.key);
    } else if (config.keyPath) {
      const keyPath = resolve(config.keyPath);
      if (!existsSync(keyPath)) {
        throw new CertificateError(`Private key file not found: ${keyPath}`, 'FILE_NOT_FOUND');
      }
      keyContent = readFileSync(keyPath);
    } else {
      throw new CertificateError('Private key path or content is required', 'MISSING_KEY');
    }

    // Load CA certificate if provided
    if (config.ca) {
      caContent = Buffer.from(config.ca);
    } else if (config.caPath) {
      const caPath = resolve(config.caPath);
      if (existsSync(caPath)) {
        caContent = readFileSync(caPath);
      }
    }

    // Parse certificate based on format
    let certificateInfo: CertificateInfo;

    switch (certFormat) {
      case 'pem':
        certificateInfo = await this.parsePEM(certContent, keyContent, caContent, config.passphrase);
        break;

      case 'der':
      case 'cer':
      case 'crt':
        certificateInfo = await this.parseDER(certContent, keyContent, caContent, config.passphrase);
        break;

      default:
        throw new CertificateError(`Unsupported certificate format: ${certFormat}`, 'UNSUPPORTED_FORMAT');
    }

    // Store in certificate store
    const storeId = this.generateStoreId(certificateInfo);
    this.certificateStore.set(storeId, {
      id: storeId,
      info: certificateInfo,
      loadedAt: new Date(),
      lastUsed: new Date(),
      usageCount: 0
    });

    this.metrics.certificatesLoaded++;

    return certificateInfo;
  }

  /**
   * Detect certificate format
   */
  private detectCertificateFormat(content: Buffer, filePath?: string): CertificateFormat {
    // Check file extension first
    if (filePath) {
      const ext = extname(filePath).toLowerCase().substring(1);
      if (this.config.supportedFormats.includes(ext as CertificateFormat)) {
        return ext as CertificateFormat;
      }
    }

    // Check content markers
    const contentStr = content.toString('utf8', 0, Math.min(content.length, 1000));

    if (contentStr.includes('-----BEGIN CERTIFICATE-----') ||
      contentStr.includes('-----BEGIN RSA PRIVATE KEY-----') ||
      contentStr.includes('-----BEGIN PRIVATE KEY-----')) {
      return 'pem';
    }

    // Check for PKCS#12 magic bytes
    if (content.length >= 4) {
      const magic = content.readUInt32BE(0);
      if (magic === 0x3082 || magic === 0x3080) {
        // Might be PKCS#12
        if (content.length >= 40) {
          // Further check for PKCS#12 structure
          const possibleOID = content.slice(4, 15).toString('hex');
          if (possibleOID.includes('2a864886f70d010c')) {
            return 'pfx';
          }
        }
      }
    }

    // Default to DER for binary content
    return 'der';
  }

  /**
   * Parse PEM format certificate
   */
  private async parsePEM(
    certContent: Buffer,
    keyContent: Buffer,
    caContent?: Buffer,
    passphrase?: string
  ): Promise<CertificateInfo> {
    const certPem = certContent.toString('utf8');
    const keyPem = keyContent.toString('utf8');
    const caPem = caContent?.toString('utf8');

    // Extract certificate blocks
    const certificates = this.extractPEMBlocks(certPem, 'CERTIFICATE');
    if (certificates.length === 0) {
      throw new CertificateError('No certificate found in PEM content', 'INVALID_PEM');
    }

    // Extract private key
    let privateKey = this.extractPEMBlocks(keyPem, 'PRIVATE KEY')[0] ||
      this.extractPEMBlocks(keyPem, 'RSA PRIVATE KEY')[0] ||
      this.extractPEMBlocks(keyPem, 'EC PRIVATE KEY')[0];

    if (!privateKey) {
      throw new CertificateError('No private key found in PEM content', 'INVALID_PEM');
    }

    // Decrypt private key if encrypted
    if (this.isEncryptedPEM(privateKey)) {
      if (!passphrase) {
        throw new CertificateError('Passphrase required for encrypted private key', 'PASSPHRASE_REQUIRED');
      }
      privateKey = await this.decryptPrivateKey(privateKey, passphrase);
    }

    // Extract CA certificates
    let caCertificates: string[] = [];
    if (caPem) {
      caCertificates = this.extractPEMBlocks(caPem, 'CERTIFICATE');
    }

    const firstCertificate = certificates[0];
    if (!firstCertificate) {
      throw new CertificateError('No valid certificate found', 'INVALID_PEM');
    }

    return {
      certificate: firstCertificate,
      privateKey,
      ca: caCertificates.length > 0 ? caCertificates : undefined,
      format: 'pem',
      raw: certContent,
      chain: certificates.length > 1 ? certificates.slice(1) : undefined
    };
  }

  /**
   * Parse DER format certificate
   */
  private async parseDER(
    certContent: Buffer,
    keyContent: Buffer,
    caContent?: Buffer,
    _passphrase?: string
  ): Promise<CertificateInfo> {
    // Convert DER to PEM
    const certPem = this.derToPem(certContent, 'CERTIFICATE');
    const keyDer = keyContent;

    // Detect key format and convert
    let keyPem: string;
    try {
      // Try as PKCS#8 first
      keyPem = this.derToPem(keyDer, 'PRIVATE KEY');
    } catch {
      // Try as traditional RSA key
      keyPem = this.derToPem(keyDer, 'RSA PRIVATE KEY');
    }

    // Convert CA if provided
    let caPem: string[] | undefined;
    if (caContent) {
      caPem = [this.derToPem(caContent, 'CERTIFICATE')];
    }

    return {
      certificate: certPem,
      privateKey: keyPem,
      ca: caPem || undefined,
      format: 'der',
      raw: certContent
    };
  }

  /**
   * Parse PKCS#12 format
   */
  private async parsePKCS12(content: Buffer, passphrase?: string): Promise<PKCS12Info> {
    // Use OpenSSL to parse PKCS#12
    const tempDir = await FileUtils.createTempDir();
    const p12Path = `${tempDir}/cert.p12`;
    const certPath = `${tempDir}/cert.pem`;
    const keyPath = `${tempDir}/key.pem`;
    const caPath = `${tempDir}/ca.pem`;

    try {
      // Write P12 file
      await FileUtils.writeFile(p12Path, content);

      // Extract certificate
      const certCmd = `openssl pkcs12 -in "${p12Path}" -out "${certPath}" -nokeys -clcerts ${passphrase ? `-passin pass:${passphrase}` : '-nodes'}`;
      await execAsync(certCmd);

      // Extract private key
      const keyCmd = `openssl pkcs12 -in "${p12Path}" -out "${keyPath}" -nocerts -nodes ${passphrase ? `-passin pass:${passphrase}` : ''}`;
      await execAsync(keyCmd);

      // Extract CA certificates
      const caCmd = `openssl pkcs12 -in "${p12Path}" -out "${caPath}" -nokeys -cacerts ${passphrase ? `-passin pass:${passphrase}` : '-nodes'}`;
      await execAsync(caCmd);

      // Read extracted files
      const certificate = await FileUtils.readFile(certPath, 'utf8') as string;
      const privateKey = await FileUtils.readFile(keyPath, 'utf8') as string;

      let ca: string[] | undefined;
      if (existsSync(caPath)) {
        const caContent = await FileUtils.readFile(caPath, 'utf8') as string;
        ca = this.extractPEMBlocks(caContent, 'CERTIFICATE');
      }

      const certBlock = this.extractPEMBlocks(certificate, 'CERTIFICATE')[0];
      const keyBlock = this.extractPEMBlocks(privateKey, 'PRIVATE KEY')[0] ||
        this.extractPEMBlocks(privateKey, 'RSA PRIVATE KEY')[0];

      return {
        certificate: certBlock || '',
        privateKey: keyBlock || '',
        ca,
        friendlyName: await this.extractPKCS12FriendlyName(p12Path, passphrase)
      };

    } finally {
      // Cleanup temp files
      await FileUtils.remove(tempDir);
    }
  }

  /**
   * Extract PEM blocks
   */
  private extractPEMBlocks(pem: string, type: string): string[] {
    const blocks: string[] = [];
    const regex = new RegExp(`-----BEGIN ${type}-----([\\s\\S]*?)-----END ${type}-----`, 'g');
    let match;

    while ((match = regex.exec(pem)) !== null) {
      const block = match[0];
      if (block) {
        blocks.push(block);
      }
    }

    return blocks;
  }

  /**
   * Check if PEM is encrypted
   */
  private isEncryptedPEM(pem: string): boolean {
    return pem.includes('ENCRYPTED') ||
      pem.includes('Proc-Type: 4,ENCRYPTED') ||
      pem.includes('DEK-Info:');
  }

  /**
   * Decrypt private key
   */
  private async decryptPrivateKey(encryptedPem: string, passphrase: string): Promise<string> {
    const tempDir = await FileUtils.createTempDir();
    const encryptedPath = `${tempDir}/encrypted.key`;
    const decryptedPath = `${tempDir}/decrypted.key`;

    try {
      await FileUtils.writeFile(encryptedPath, encryptedPem);

      const cmd = `openssl rsa -in "${encryptedPath}" -out "${decryptedPath}" -passin pass:${passphrase}`;
      await execAsync(cmd);

      return await FileUtils.readFile(decryptedPath, 'utf8') as string;
    } finally {
      await FileUtils.remove(tempDir);
    }
  }

  /**
   * Convert DER to PEM
   */
  private derToPem(der: Buffer, type: string): string {
    const base64 = der.toString('base64');
    const formatted = base64.match(/.{1,64}/g)?.join('\n') || base64;
    return `-----BEGIN ${type}-----\n${formatted}\n-----END ${type}-----`;
  }

  /**
   * Extract PKCS#12 friendly name
   */
  private async extractPKCS12FriendlyName(p12Path: string, passphrase?: string): Promise<string | undefined> {
    try {
      const cmd = `openssl pkcs12 -in "${p12Path}" -info -nokeys -nocerts ${passphrase ? `-passin pass:${passphrase}` : '-nodes'} 2>/dev/null | grep friendlyName`;
      const { stdout } = await execAsync(cmd);

      const match = stdout.match(/friendlyName:\s*(.+)/);
      // Fix: Add check for match[1] before accessing
      return match && match[1] ? match[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Validate certificate
   */
  public async validateCertificate(
    certificateInfo: CertificateInfo | CertificateAuthConfig,
    options?: ValidationOptions
  ): Promise<CertificateValidationResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Load certificate if config provided
      let certInfo: CertificateInfo;
      if ('certificate' in certificateInfo) {
        certInfo = certificateInfo;
      } else {
        certInfo = await this.loadCertificate(certificateInfo);
      }

      // Parse X509 certificate
      const x509 = new X509Certificate(certInfo.certificate);

      // 1. Check validity period
      const now = new Date();
      const validFrom = new Date(x509.validFrom);
      const validTo = new Date(x509.validTo);

      if (now < validFrom) {
        errors.push(`Certificate not yet valid. Valid from: ${validFrom.toISOString()}`);
      }

      if (now > validTo) {
        if (this.config.allowExpiredCertificates) {
          warnings.push(`Certificate expired on: ${validTo.toISOString()}`);
        } else {
          errors.push(`Certificate expired on: ${validTo.toISOString()}`);
        }
      }

      // 2. Check key usage
      const keyUsage = this.extractKeyUsage(x509);
      if (keyUsage && !keyUsage.digitalSignature && !keyUsage.keyAgreement) {
        warnings.push('Certificate lacks digital signature or key agreement usage');
      }

      // 3. Check extended key usage
      const extKeyUsage = this.extractExtendedKeyUsage(x509);
      if (extKeyUsage && !extKeyUsage.clientAuth) {
        errors.push('Certificate not valid for client authentication');
      }

      // 4. Validate certificate chain
      if (certInfo.chain || certInfo.ca) {
        const chainResult = await this.validateCertificateChain(certInfo);
        if (!chainResult.isValid) {
          errors.push(...chainResult.errors);
        }
        warnings.push(...chainResult.warnings);
      }

      // 5. Check self-signed
      if (x509.issuer === x509.subject) {
        if (this.config.allowSelfSignedCertificates) {
          warnings.push('Certificate is self-signed');
        } else {
          errors.push('Self-signed certificates are not allowed');
        }
      }

      // 6. Validate signature algorithm
      const signatureAlgorithm = this.extractSignatureAlgorithm(x509);
      if (!this.config.allowedSignatureAlgorithms.includes(signatureAlgorithm)) {
        errors.push(`Unsupported signature algorithm: ${signatureAlgorithm}`);
      }

      // 7. Check key size
      const keyInfo = this.extractPublicKeyInfo(x509);
      if (keyInfo && keyInfo.algorithm) {
        const minKeySize = this.config.minKeySize[keyInfo.algorithm as keyof typeof this.config.minKeySize];
        if (minKeySize && keyInfo.size < minKeySize) {
          errors.push(`Key size ${keyInfo.size} is below minimum ${minKeySize} for ${keyInfo.algorithm}`);
        }
      }

      // 8. Check revocation status
      if (this.config.checkRevocation && (!options || options.checkRevocation !== false)) {
        const revocationResult = await this.checkRevocationStatus(x509);
        if (revocationResult.isRevoked) {
          errors.push(`Certificate is revoked: ${revocationResult.reason}`);
        }
        if (revocationResult.error) {
          warnings.push(`Revocation check failed: ${revocationResult.error}`);
        }
      }

      // 9. Validate subject alternative names
      const san = this.extractSubjectAlternativeNames(x509);
      if (options?.hostname) {
        if (!this.validateHostname(options.hostname, x509.subject, san)) {
          errors.push(`Certificate not valid for hostname: ${options.hostname}`);
        }
      }

      // 10. Check certificate constraints
      const constraints = this.extractCertificateConstraints(x509);
      if (constraints.ca && !options?.allowCA) {
        errors.push('CA certificates not allowed for client authentication');
      }

      this.metrics.certificatesValidated++;

      const isValid = errors.length === 0;
      if (!isValid) {
        this.metrics.certificatesFailed++;
        this.metrics.validationErrors.push(...errors);
      }

      return {
        isValid,
        errors,
        warnings,
        certificate: {
          subject: x509.subject,
          issuer: x509.issuer,
          serialNumber: x509.serialNumber,
          validFrom,
          validTo,
          fingerprint: x509.fingerprint,
          signatureAlgorithm,
          keyUsage: keyUsage || undefined,
          extendedKeyUsage: extKeyUsage || undefined,
          subjectAlternativeNames: san.length > 0 ? san : undefined
        },
        validationTime: performance.now() - startTime
      };

    } catch (error) {
      this.metrics.certificatesFailed++;

      return {
        isValid: false,
        errors: [`Certificate validation error: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        validationTime: performance.now() - startTime
      };
    }
  }

  /**
   * Extract key usage from X509 certificate
   */
  private extractKeyUsage(x509: X509Certificate): CertificateUsage | undefined {
    try {
      // Parse the raw certificate to extract extensions
      const certPem = x509.toString();
      const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''), 'base64');

      // ASN.1 parsing for X.509 v3 extensions
      let offset = 0;
      const tbsCertificate = this.parseASN1Sequence(certDer, offset);

      // Navigate to extensions (tbsCertificate.extensions)
      // Extensions are in the optional [3] field of TBSCertificate
      const extensions = this.findExtensions(tbsCertificate);

      if (!extensions) return undefined;

      // Find key usage extension (OID: 2.5.29.15)
      const keyUsageExt = this.findExtension(extensions, '2.5.29.15');
      if (!keyUsageExt) return undefined;

      // Parse key usage bit string
      const keyUsageBits = this.parseBitString(keyUsageExt.value);

      return {
        digitalSignature: !!(keyUsageBits & 0x80),
        nonRepudiation: !!(keyUsageBits & 0x40),
        keyEncipherment: !!(keyUsageBits & 0x20),
        dataEncipherment: !!(keyUsageBits & 0x10),
        keyAgreement: !!(keyUsageBits & 0x08),
        keyCertSign: !!(keyUsageBits & 0x04),
        cRLSign: !!(keyUsageBits & 0x02),
        encipherOnly: !!(keyUsageBits & 0x01),
        decipherOnly: !!(keyUsageBits & 0x8000)
      };
    } catch (error) {
      this.logger.warn('Failed to extract key usage', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  /**
   * Extract extended key usage from certificate
   */
  private extractExtendedKeyUsage(x509: X509Certificate): ExtendedKeyUsage | undefined {
    try {
      const certPem = x509.toString();
      const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''), 'base64');

      const tbsCertificate = this.parseASN1Sequence(certDer, 0);
      const extensions = this.findExtensions(tbsCertificate);

      if (!extensions) return undefined;

      // Find extended key usage extension (OID: 2.5.29.37)
      const extKeyUsageExt = this.findExtension(extensions, '2.5.29.37');
      if (!extKeyUsageExt) return undefined;

      // Parse the sequence of OIDs
      const oids = this.parseOIDSequence(extKeyUsageExt.value);

      return {
        serverAuth: oids.includes('1.3.6.1.5.5.7.3.1'),
        clientAuth: oids.includes('1.3.6.1.5.5.7.3.2'),
        codeSigning: oids.includes('1.3.6.1.5.5.7.3.3'),
        emailProtection: oids.includes('1.3.6.1.5.5.7.3.4'),
        timeStamping: oids.includes('1.3.6.1.5.5.7.3.8'),
        ocspSigning: oids.includes('1.3.6.1.5.5.7.3.9')
      };
    } catch (error) {
      this.logger.warn('Failed to extract extended key usage', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  /**
   * Extract signature algorithm
   */
  private extractSignatureAlgorithm(x509: X509Certificate): string {
    try {
      const certPem = x509.toString();
      const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''), 'base64');

      // Parse certificate structure
      const cert = this.parseASN1Sequence(certDer, 0);

      // Signature algorithm is the second element
      const sigAlgSeq = cert.elements[1];
      const sigAlgOid = this.parseOID(sigAlgSeq.elements[0].value);

      // Map OID to algorithm name
      const algorithms: Record<string, string> = {
        '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
        '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
        '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
        '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
        '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
        '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
        '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512'
      };

      return algorithms[sigAlgOid] || sigAlgOid;
    } catch (error) {
      this.logger.warn('Failed to extract signature algorithm', { error: error instanceof Error ? error.message : String(error) });
      return 'unknown';
    }
  }

  /**
   * Extract public key information
   */
  private extractPublicKeyInfo(x509: X509Certificate): PublicKeyInfo | undefined {
    try {
      const certPem = x509.toString();
      const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''), 'base64');

      const tbsCertificate = this.parseASN1Sequence(certDer, 0).elements[0];

      // SubjectPublicKeyInfo is the 7th element (index 6) in TBSCertificate
      const subjectPublicKeyInfo = tbsCertificate.elements[6];
      const algorithm = this.parseOID(subjectPublicKeyInfo.elements[0].elements[0].value);

      let keyInfo: PublicKeyInfo | undefined;

      if (algorithm === '1.2.840.113549.1.1.1') { // RSA
        const publicKeyBits = subjectPublicKeyInfo.elements[1].value;
        const publicKeyBuffer = publicKeyBits.slice(1);
        const rsaKey = this.parseASN1Sequence(publicKeyBuffer, 0);

        // Extract modulus and exponent
        const modulusBuffer = rsaKey.elements[0].value;
        const exponentBuffer = rsaKey.elements[1].value;

        // Convert exponent buffer to number
        let exponent = 0;
        for (let i = 0; i < exponentBuffer.length; i++) {
          exponent = (exponent << 8) | exponentBuffer[i];
        }

        keyInfo = {
          algorithm: 'rsa',
          size: modulusBuffer.length * 8, // modulus bit length
          exponent: exponent,
          modulus: modulusBuffer.toString('hex')
        };
      } else if (algorithm.startsWith('1.2.840.10045')) { // EC
        keyInfo = {
          algorithm: 'ec',
          size: 256, // Would need to determine from curve
          curve: 'P-256' // Would need to extract from parameters
        };
      }

      return keyInfo;
    } catch (error) {
      this.logger.warn('Failed to extract public key info', { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  /**
   * Extract subject alternative names
   */
  private extractSubjectAlternativeNames(x509: X509Certificate): SubjectAlternativeName[] {
    try {
      const certPem = x509.toString();
      const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''), 'base64');

      const tbsCertificate = this.parseASN1Sequence(certDer, 0).elements[0];
      const extensions = this.findExtensions(tbsCertificate);

      if (!extensions) return [];

      // Find SAN extension (OID: 2.5.29.17)
      const sanExt = this.findExtension(extensions, '2.5.29.17');
      if (!sanExt) return [];

      const sans: SubjectAlternativeName[] = [];
      const sanSequence = this.parseASN1Sequence(sanExt.value, 0);

      for (const san of sanSequence.elements) {
        const tag = san.tag;
        const value = san.value;

        switch (tag) {
          case 0x82: // dNSName [2]
            sans.push({ type: 'dns', value: value.toString('utf8') });
            break;
          case 0x87: // iPAddress [7]
            if (value.length === 4) {
              sans.push({
                type: 'ip',
                value: `${value[0]}.${value[1]}.${value[2]}.${value[3]}`
              });
            } else if (value.length === 16) {
              // IPv6
              const hex = value.toString('hex');
              const ipv6 = hex.match(/.{1,4}/g)!.join(':');
              sans.push({ type: 'ip', value: ipv6 });
            }
            break;
          case 0x81: // rfc822Name [1]
            sans.push({ type: 'email', value: value.toString('utf8') });
            break;
          case 0x86: // uniformResourceIdentifier [6]
            sans.push({ type: 'uri', value: value.toString('utf8') });
            break;
        }
      }

      return sans;
    } catch (error) {
      this.logger.warn('Failed to extract SANs', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  /**
   * Check OCSP status - REAL IMPLEMENTATION
   */
  private async checkOCSP(cert: X509Certificate): Promise<RevocationCheckResult> {
    const startTime = performance.now();

    try {
      // Check cache first
      const cacheKey = `ocsp:${cert.fingerprint}`;
      const cached = this.ocspCache.get(cacheKey);

      if (cached && cached.validUntil > new Date()) {
        this.metrics.cacheHits++;
        return {
          checked: true,
          isRevoked: cached.status === 'revoked',
          reason: cached.revocationReason || undefined,
          revocationTime: cached.revocationTime || undefined,
          checkTime: 0
        };
      }

      // Extract OCSP responder URL from certificate
      const ocspUrls = await this.extractOCSPUrls(cert);
      if (ocspUrls.length === 0) {
        return {
          checked: false,
          isRevoked: false,
          error: 'No OCSP responder URL found in certificate'
        };
      }

      // Get issuer certificate
      const issuerCert = await this.findIssuerCertificate(cert);
      if (!issuerCert) {
        return {
          checked: false,
          isRevoked: false,
          error: 'Cannot find issuer certificate for OCSP check'
        };
      }

      // Build OCSP request
      const ocspRequest = await this.buildOCSPRequest(cert, issuerCert);

      // Try each OCSP responder
      for (const ocspUrl of ocspUrls) {
        try {
          const response = await this.sendOCSPRequest(ocspUrl, ocspRequest);
          const result = await this.parseOCSPResponse(response, cert);

          // Cache the result
          this.ocspCache.set(cacheKey, {
            status: result.status,
            revocationReason: result.reason || undefined,
            revocationTime: result.revocationTime || undefined,
            validUntil: new Date(Date.now() + this.config.cacheTTL),
            responseTime: new Date()
          });

          return {
            checked: true,
            isRevoked: result.status === 'revoked',
            reason: result.reason || undefined,
            revocationTime: result.revocationTime || undefined,
            checkTime: performance.now() - startTime
          };
        } catch (error) {
          this.logger.warn(`OCSP check failed for ${ocspUrl}`, { error: error instanceof Error ? error.message : String(error) });
          continue;
        }
      }

      return {
        checked: false,
        isRevoked: false,
        error: 'All OCSP responders failed',
        checkTime: performance.now() - startTime
      };

    } catch (error) {
      return {
        checked: false,
        isRevoked: false,
        error: error instanceof Error ? error.message : String(error),
        checkTime: performance.now() - startTime
      };
    }
  }

  /**
   * Extract OCSP URLs from certificate
   */
  private async extractOCSPUrls(cert: X509Certificate): Promise<string[]> {
    const certPem = cert.toString();
    const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, ''), 'base64');

    const tbsCertificate = this.parseASN1Sequence(certDer, 0).elements[0];
    const extensions = this.findExtensions(tbsCertificate);

    if (!extensions) return [];

    // Find Authority Information Access extension (OID: 1.3.6.1.5.5.7.1.1)
    const aiaExt = this.findExtension(extensions, '1.3.6.1.5.5.7.1.1');
    if (!aiaExt) return [];

    const urls: string[] = [];
    const aiaSequence = this.parseASN1Sequence(aiaExt.value, 0);

    for (const accessDesc of aiaSequence.elements) {
      const methodOid = this.parseOID(accessDesc.elements[0].value);

      // OCSP OID: 1.3.6.1.5.5.7.48.1
      if (methodOid === '1.3.6.1.5.5.7.48.1') {
        const accessLocation = accessDesc.elements[1];
        if (accessLocation.tag === 0x86) { // uniformResourceIdentifier
          urls.push(accessLocation.value.toString('utf8'));
        }
      }
    }

    return urls;
  }

  /**
   * Build OCSP request
   */
  private async buildOCSPRequest(cert: X509Certificate, issuerCert: X509Certificate): Promise<Buffer> {
    const crypto = require('crypto');

    // Calculate certificate ID
    const issuerNameHash = crypto.createHash('sha1')
      .update(this.getIssuerNameDER(issuerCert))
      .digest();

    const issuerKeyHash = crypto.createHash('sha1')
      .update(this.getPublicKeyDER(issuerCert))
      .digest();

    const serialNumber = Buffer.from(cert.serialNumber.replace(/:/g, ''), 'hex');

    // Build OCSP request structure
    const certId = this.buildASN1Sequence([
      this.buildASN1Sequence([ // hashAlgorithm
        this.buildASN1ObjectIdentifier('1.3.14.3.2.26'), // SHA1
        this.buildASN1Null()
      ]),
      this.buildASN1OctetString(issuerNameHash),
      this.buildASN1OctetString(issuerKeyHash),
      this.buildASN1Integer(serialNumber)
    ]);

    const request = this.buildASN1Sequence([
      certId,
      // No single request extensions
    ]);

    const requestList = this.buildASN1Sequence([request]);

    const tbsRequest = this.buildASN1Sequence([
      // Version not included for v1
      requestList
      // No request extensions
    ]);

    const ocspRequest = this.buildASN1Sequence([
      tbsRequest
      // No optional signature
    ]);

    return ocspRequest;
  }

  /**
   * Send OCSP request
   */
  private async sendOCSPRequest(url: string, request: Buffer): Promise<Buffer> {
    const https = require('https');
    const http = require('http');
    const urlObj = new URL(url);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/ocsp-request',
          'Content-Length': request.length
        },
        timeout: this.config.ocspTimeout
      };

      const protocol = urlObj.protocol === 'https:' ? https : http;

      const req = protocol.request(options, (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`OCSP server returned ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: any) => chunks.push(chunk));
        res.on('end', () => {
          const response = Buffer.concat(chunks);
          resolve(response);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('OCSP request timeout'));
      });

      req.write(request);
      req.end();
    });
  }

  /**
   * Parse OCSP response
   */
  private async parseOCSPResponse(response: Buffer, cert: X509Certificate): Promise<{
    status: 'good' | 'revoked' | 'unknown';
    reason?: string;
    revocationTime?: Date;
  }> {
    try {
      const ocspResponse = this.parseASN1Sequence(response, 0);

      // Check response status
      const responseStatus = ocspResponse.elements[0].value[0];
      if (responseStatus !== 0) { // 0 = successful
        throw new Error(`OCSP response status: ${responseStatus}`);
      }

      // Parse response bytes
      const responseBytes = ocspResponse.elements[1].elements[0];
      const responseType = this.parseOID(responseBytes.elements[0].value);

      if (responseType !== '1.3.6.1.5.5.7.48.1.1') { // basic OCSP response
        throw new Error('Unsupported OCSP response type');
      }

      const basicResponse = this.parseASN1Sequence(
        this.parseASN1OctetString(responseBytes.elements[1].value),
        0
      );

      const tbsResponseData = basicResponse.elements[0];
      const responses = tbsResponseData.elements[2]; // or could be at different index

      // Find response for our certificate
      for (const singleResponse of responses.elements) {
        const certId = singleResponse.elements[0];
        const certStatus = singleResponse.elements[1];

        // Compare certificate ID (simplified - should properly compare)
        if (this.matchesCertificateId(certId, cert)) {
          if (certStatus.tag === 0x80) { // [0] IMPLICIT NULL - good
            return { status: 'good' };
          } else if (certStatus.tag === 0xA1) { // [1] IMPLICIT RevokedInfo
            const revokedInfo = certStatus.elements[0];
            const revocationTime = this.parseASN1Time(revokedInfo.elements[0]);

            let reason = 'unspecified';
            if (revokedInfo.elements.length > 1) {
              const reasonCode = revokedInfo.elements[1].value[0];
              reason = this.getRevocationReason(reasonCode);
            }

            return {
              status: 'revoked',
              reason,
              revocationTime
            };
          } else if (certStatus.tag === 0x82) { // [2] IMPLICIT UnknownInfo
            return { status: 'unknown' };
          }
        }
      }

      return { status: 'unknown' };

    } catch (error) {
      throw new Error(`Failed to parse OCSP response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check CRL status - REAL IMPLEMENTATION
   */
  private async checkCRL(cert: X509Certificate): Promise<RevocationCheckResult> {
    const startTime = performance.now();

    try {
      // Extract CRL distribution points
      const crlUrls = await this.extractCRLUrls(cert);
      if (crlUrls.length === 0) {
        return {
          checked: false,
          isRevoked: false,
          error: 'No CRL distribution points found in certificate'
        };
      }

      // Check each CRL
      for (const crlUrl of crlUrls) {
        try {
          // Check cache first
          const cacheKey = `crl:${crlUrl}`;
          let crlInfo = this.crlCache.get(cacheKey);

          if (!crlInfo || crlInfo.nextUpdate < new Date()) {
            // Download and parse CRL
            const crlData = await this.downloadCRL(crlUrl);
            crlInfo = await this.parseCRL(crlData);

            // Cache the CRL
            this.crlCache.set(cacheKey, crlInfo);
          }

          // Check if certificate is revoked
          const revoked = crlInfo.revokedCertificates.find(
            (rc: any) => rc.serialNumber.toLowerCase() === cert.serialNumber.toLowerCase().replace(/:/g, '')
          );

          return {
            checked: true,
            isRevoked: !!revoked,
            reason: revoked?.reason || undefined,
            revocationTime: revoked?.revocationDate || undefined,
            checkTime: performance.now() - startTime
          };

        } catch (error) {
          this.logger.warn(`CRL check failed for ${crlUrl}`, { error: error instanceof Error ? error.message : String(error) });
          continue;
        }
      }

      return {
        checked: false,
        isRevoked: false,
        error: 'All CRL checks failed',
        checkTime: performance.now() - startTime
      };

    } catch (error) {
      return {
        checked: false,
        isRevoked: false,
        error: error instanceof Error ? error.message : String(error),
        checkTime: performance.now() - startTime
      };
    }
  }

  /**
   * Extract CRL URLs from certificate
   */
  private async extractCRLUrls(cert: X509Certificate): Promise<string[]> {
    const certPem = cert.toString();
    const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, ''), 'base64');

    const tbsCertificate = this.parseASN1Sequence(certDer, 0).elements[0];
    const extensions = this.findExtensions(tbsCertificate);

    if (!extensions) return [];

    // Find CRL Distribution Points extension (OID: 2.5.29.31)
    const crlExt = this.findExtension(extensions, '2.5.29.31');
    if (!crlExt) return [];

    const urls: string[] = [];
    const crlDistPoints = this.parseASN1Sequence(crlExt.value, 0);

    for (const distPoint of crlDistPoints.elements) {
      // DistributionPoint ::= SEQUENCE {
      //   distributionPoint [0] DistributionPointName OPTIONAL,
      //   reasons [1] ReasonFlags OPTIONAL,
      //   cRLIssuer [2] GeneralNames OPTIONAL
      // }

      if (distPoint.elements[0] && distPoint.elements[0].tag === 0xA0) {
        const dpName = distPoint.elements[0];

        // fullName [0]
        if (dpName.elements[0] && dpName.elements[0].tag === 0xA0) {
          const generalNames = dpName.elements[0];

          for (const gn of generalNames.elements) {
            if (gn.tag === 0x86) { // uniformResourceIdentifier
              urls.push(gn.value.toString('utf8'));
            }
          }
        }
      }
    }

    return urls;
  }

  /**
   * Download CRL
   */
  private async downloadCRL(url: string): Promise<Buffer> {
    const https = require('https');
    const http = require('http');
    const urlObj = new URL(url);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: this.config.crlTimeout
      };

      const protocol = urlObj.protocol === 'https:' ? https : http;

      const req = protocol.request(options, (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`CRL server returned ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: any) => chunks.push(chunk));
        res.on('end', () => {
          const crl = Buffer.concat(chunks);
          resolve(crl);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('CRL download timeout'));
      });

      req.end();
    });
  }

  /**
   * Parse CRL
   */
  private async parseCRL(crlData: Buffer): Promise<CRLInfo> {
    try {
      // Check if PEM format
      let crlDer: Buffer;
      const crlStr = crlData.toString('utf8', 0, Math.min(crlData.length, 100));

      if (crlStr.includes('-----BEGIN X509 CRL-----')) {
        // Convert PEM to DER
        const pemContent = crlData.toString('utf8')
          .replace(/-----BEGIN X509 CRL-----/, '')
          .replace(/-----END X509 CRL-----/, '')
          .replace(/\s/g, '');
        crlDer = Buffer.from(pemContent, 'base64');
      } else {
        crlDer = crlData;
      }

      // Parse CRL structure
      const crl = this.parseASN1Sequence(crlDer, 0);
      const tbsCertList = crl.elements[0];

      // Extract fields
      let version = 1; // default v1
      let offset = 0;

      // Check for version
      if (tbsCertList.elements[0].tag === 0x02 && tbsCertList.elements[0].value.length === 1) {
        version = tbsCertList.elements[0].value[0] + 1;
        offset = 1;
      }

      const signature = tbsCertList.elements[offset];
      const issuer = tbsCertList.elements[offset + 1];
      const thisUpdate = this.parseASN1Time(tbsCertList.elements[offset + 2]);
      const nextUpdate = this.parseASN1Time(tbsCertList.elements[offset + 3]);

      const revokedCertificates: Array<{
        serialNumber: string;
        revocationDate: Date;
        reason?: string | undefined;
      }> = [];

      // Check for revoked certificates
      if (tbsCertList.elements[offset + 4] && tbsCertList.elements[offset + 4].tag === 0x30) {
        const revokedCerts = tbsCertList.elements[offset + 4];

        for (const cert of revokedCerts.elements) {
          const serialNumber = cert.elements[0].value.toString('hex');
          const revocationDate = this.parseASN1Time(cert.elements[1]);

          let reason: string | undefined;

          // Check for CRL entry extensions
          if (cert.elements.length > 2) {
            const extensions = cert.elements[2];

            // Find reason code extension (OID: 2.5.29.21)
            for (const ext of extensions.elements) {
              const oid = this.parseOID(ext.elements[0].value);
              if (oid === '2.5.29.21') {
                const reasonCode = ext.elements[1].value[0];
                reason = this.getRevocationReason(reasonCode);
                break;
              }
            }
          }

          if (revokedCertificates.length < 1000000) { // Prevent infinite loops
            revokedCertificates.push({
              serialNumber,
              revocationDate,
              reason: reason || undefined
            });
          }
        }
      }

      return {
        version,
        issuer: this.parseDN(issuer),
        thisUpdate,
        nextUpdate,
        revokedCertificates,
        signatureAlgorithm: this.parseOID(signature.elements[0].value)
      };

    } catch (error) {
      throw new Error(`Failed to parse CRL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ASN.1 parsing utilities
   */
  private parseASN1Sequence(buffer: Buffer, offset: number): any {
    const tag = buffer[offset];
    const lenByte = buffer[offset + 1];

    let length: number;
    let contentOffset: number;

    if (lenByte !== undefined && lenByte & 0x80) {
      const numLenBytes = lenByte & 0x7F;
      length = 0;
      for (let i = 0; i < numLenBytes; i++) {
        const byte = buffer[offset + 2 + i];
        if (byte !== undefined) {
          length = (length << 8) | byte;
        }
      }
      contentOffset = offset + 2 + numLenBytes;
    } else if (lenByte !== undefined) {
      length = lenByte;
      contentOffset = offset + 2;
    } else {
      throw new Error('Invalid ASN.1 sequence');
    }

    const elements: any[] = [];
    let currentOffset = contentOffset;

    while (currentOffset < contentOffset + length) {
      const element = this.parseASN1Element(buffer, currentOffset);
      elements.push(element);
      currentOffset = element.nextOffset;
    }

    return {
      tag,
      length,
      elements,
      value: buffer.slice(contentOffset, contentOffset + length),
      nextOffset: contentOffset + length
    };
  }

  private parseASN1Element(buffer: Buffer, offset: number): any {
    const tag = buffer[offset];
    const lenByte = buffer[offset + 1];

    if (tag === undefined || lenByte === undefined) {
      throw new Error('Invalid ASN.1 element');
    }

    let length: number;
    let contentOffset: number;

    if (lenByte & 0x80) {
      const numLenBytes = lenByte & 0x7F;
      length = 0;
      for (let i = 0; i < numLenBytes; i++) {
        const byte = buffer[offset + 2 + i];
        if (byte !== undefined) {
          length = (length << 8) | byte;
        }
      }
      contentOffset = offset + 2 + numLenBytes;
    } else {
      length = lenByte;
      contentOffset = offset + 2;
    }

    const value = buffer.slice(contentOffset, contentOffset + length);

    // Parse constructed types
    if (tag & 0x20) { // Constructed
      const elements: any[] = [];
      let currentOffset = contentOffset;

      while (currentOffset < contentOffset + length) {
        const element = this.parseASN1Element(buffer, currentOffset);
        elements.push(element);
        currentOffset = element.nextOffset;
      }

      return {
        tag,
        length,
        elements,
        value,
        nextOffset: contentOffset + length
      };
    }

    return {
      tag,
      length,
      value,
      nextOffset: contentOffset + length
    };
  }

  private parseOID(buffer: Buffer): string {
    const values: number[] = [];

    // First byte encodes first two values
    const firstByte = buffer[0];
    if (firstByte !== undefined) {
      values.push(Math.floor(firstByte / 40));
      values.push(firstByte % 40);
    }

    // Parse remaining values
    let value = 0;
    for (let i = 1; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte !== undefined) {
        value = (value << 7) | (byte & 0x7F);

        if (!(byte & 0x80)) {
          values.push(value);
          value = 0;
        }
      }
    }

    return values.join('.');
  }

  private parseASN1Time(element: any): Date {
    const value = element.value.toString('ascii');

    if (element.tag === 0x17) { // UTCTime
      // YYMMDDHHMMSSZ
      const year = parseInt(value.substr(0, 2));
      const fullYear = year >= 50 ? 1900 + year : 2000 + year;

      return new Date(Date.UTC(
        fullYear,
        parseInt(value.substr(2, 2)) - 1,
        parseInt(value.substr(4, 2)),
        parseInt(value.substr(6, 2)),
        parseInt(value.substr(8, 2)),
        parseInt(value.substr(10, 2))
      ));
    } else if (element.tag === 0x18) { // GeneralizedTime
      // YYYYMMDDHHMMSSZ
      return new Date(Date.UTC(
        parseInt(value.substr(0, 4)),
        parseInt(value.substr(4, 2)) - 1,
        parseInt(value.substr(6, 2)),
        parseInt(value.substr(8, 2)),
        parseInt(value.substr(10, 2)),
        parseInt(value.substr(12, 2))
      ));
    }

    throw new Error('Unknown time format');
  }

  private parseDN(dnSequence: any): string {
    const components: string[] = [];

    for (const rdn of dnSequence.elements) {
      for (const attr of rdn.elements) {
        const oid = this.parseOID(attr.elements[0].value);
        const value = attr.elements[1].value.toString('utf8');

        const oidMap: Record<string, string> = {
          '2.5.4.3': 'CN',
          '2.5.4.6': 'C',
          '2.5.4.7': 'L',
          '2.5.4.8': 'ST',
          '2.5.4.10': 'O',
          '2.5.4.11': 'OU'
        };

        const name = oidMap[oid] || oid;
        components.push(`${name}=${value}`);
      }
    }

    return components.join(', ');
  }

  private getRevocationReason(code: number): string {
    const reasons = [
      'unspecified',
      'keyCompromise',
      'cACompromise',
      'affiliationChanged',
      'superseded',
      'cessationOfOperation',
      'certificateHold',
      'removeFromCRL',
      'privilegeWithdrawn',
      'aACompromise'
    ];

    return reasons[code] || 'unknown';
  }

  private findExtensions(tbsCertificate: any): any | undefined {
    // Extensions are in [3] EXPLICIT tag
    for (const element of tbsCertificate.elements) {
      if (element.tag === 0xA3) {
        return element.elements[0]; // SEQUENCE of extensions
      }
    }
    return undefined;
  }

  private findExtension(extensions: any, oid: string): any | undefined {
    for (const ext of extensions.elements) {
      const extOid = this.parseOID(ext.elements[0].value);
      if (extOid === oid) {
        // Check if critical
        let valueIndex = 1;
        if (ext.elements[1].tag === 0x01) { // BOOLEAN
          valueIndex = 2;
        }

        return {
          oid: extOid,
          critical: valueIndex === 2,
          value: this.parseASN1OctetString(ext.elements[valueIndex].value)
        };
      }
    }
    return undefined;
  }

  private parseBitString(buffer: Buffer): number {
    const unusedBits = buffer[0];
    const bits = buffer.slice(1);

    // Convert to number (simplified for key usage)
    let value = 0;
    for (let i = 0; i < Math.min(bits.length, 2); i++) {
      const byte = bits[i];
      if (byte !== undefined) {
        value = (value << 8) | byte;
      }
    }

    return unusedBits !== undefined ? value >> unusedBits : value;
  }

  private parseASN1OctetString(buffer: Buffer): Buffer {
    // OCTET STRING content is just the raw bytes
    return buffer;
  }

  private parseOIDSequence(buffer: Buffer): string[] {
    const sequence = this.parseASN1Sequence(buffer, 0);
    const oids: string[] = [];

    for (const element of sequence.elements) {
      if (element.tag === 0x06) { // OBJECT IDENTIFIER
        oids.push(this.parseOID(element.value));
      }
    }

    return oids;
  }

  private buildASN1Sequence(elements: Buffer[]): Buffer {
    const content = Buffer.concat(elements);
    return this.buildASN1Element(0x30, content);
  }

  private buildASN1Element(tag: number, content: Buffer): Buffer {
    const length = content.length;

    if (length < 128) {
      return Buffer.concat([
        Buffer.from([tag, length]),
        content
      ]);
    } else {
      // Long form
      const lengthBytes: number[] = [];
      let len = length;

      while (len > 0) {
        lengthBytes.unshift(len & 0xFF);
        len >>= 8;
      }

      return Buffer.concat([
        Buffer.from([tag, 0x80 | lengthBytes.length]),
        Buffer.from(lengthBytes),
        content
      ]);
    }
  }

  private buildASN1ObjectIdentifier(oid: string): Buffer {
    const parts = oid.split('.').map(n => parseInt(n));
    const bytes: number[] = [];

    // First two components
    if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
      bytes.push(parts[0] * 40 + parts[1]);
    }

    // Remaining components
    for (let i = 2; i < parts.length; i++) {
      const part = parts[i];
      if (part !== undefined) {
        let value = part;
        const valueBytes: number[] = [];

        // Convert to base 128
        if (value === 0) {
          valueBytes.push(0);
        } else {
          while (value > 0) {
            valueBytes.unshift(value & 0x7F);
            value >>= 7;
          }
        }

        // Set high bit on all but last byte
        if (valueBytes.length > 0) {
          for (let j = 0; j < valueBytes.length - 1; j++) {
            const byte = valueBytes[j];
            // Fix: Add explicit check for undefined
            if (byte !== undefined) {
              valueBytes[j] = byte | 0x80;
            }
          }
        }

        bytes.push(...valueBytes);
      }
    }

    return this.buildASN1Element(0x06, Buffer.from(bytes));
  }

  private buildASN1OctetString(data: Buffer): Buffer {
    return this.buildASN1Element(0x04, data);
  }

  private buildASN1Integer(data: Buffer | number): Buffer {
    let buffer: Buffer;
    if (typeof data === 'number') {
      // Convert number to buffer
      const bytes = [];
      let num = data;
      if (num === 0) {
        bytes.push(0);
      } else {
        while (num > 0) {
          bytes.unshift(num & 0xFF);
          num = num >>> 8;
        }
      }
      buffer = Buffer.from(bytes);
    } else {
      buffer = data;
    }

    // Add leading zero if high bit is set (to ensure positive)
    if (buffer[0] && buffer[0] & 0x80) {
      buffer = Buffer.concat([Buffer.from([0]), buffer]);
    }
    return this.buildASN1Element(0x02, buffer);
  }

  private buildASN1Null(): Buffer {
    return Buffer.from([0x05, 0x00]);
  }

  private getIssuerNameDER(cert: X509Certificate): Buffer {
    // Extract issuer name in DER format
    const certPem = cert.toString();
    const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, ''), 'base64');

    const tbsCertificate = this.parseASN1Sequence(certDer, 0).elements[0];

    // Issuer is typically the 4th element (after version, serial, signature)
    let issuerIndex = 3;
    if (tbsCertificate.elements[0].tag === 0xA0) { // version present
      issuerIndex = 4;
    }

    return tbsCertificate.elements[issuerIndex].value;
  }

  private getPublicKeyDER(cert: X509Certificate): Buffer {
    // Extract subject public key info
    const certPem = cert.toString();
    const certDer = Buffer.from(certPem.replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, ''), 'base64');

    const tbsCertificate = this.parseASN1Sequence(certDer, 0).elements[0];

    // SubjectPublicKeyInfo is typically the 7th element
    let spkiIndex = 6;
    if (tbsCertificate.elements[0].tag === 0xA0) { // version present
      spkiIndex = 7;
    }

    const spki = tbsCertificate.elements[spkiIndex];

    // Extract the BIT STRING content (skip unused bits byte)
    return spki.elements[1].value.slice(1);
  }

  private matchesCertificateId(certId: any, cert: X509Certificate): boolean {
    // Simplified comparison - in reality would need to reconstruct
    // the certificate ID and compare all fields
    const serialNumber = certId.elements[3].value.toString('hex');
    return serialNumber === cert.serialNumber.toLowerCase().replace(/:/g, '');
  }

  private async findIssuerCertificate(cert: X509Certificate): Promise<X509Certificate | undefined> {
    // Check trust store
    for (const [_, trustEntry] of this.trustStore) {
      if (trustEntry.subject === cert.issuer) {
        return new X509Certificate(trustEntry.certificate);
      }
    }

    // Check certificate store
    for (const [_, storeEntry] of this.certificateStore) {
      const storeCert = new X509Certificate(storeEntry.info.certificate);
      if (storeCert.subject === cert.issuer) {
        return storeCert;
      }
    }

    return undefined;
  }

  /**
   * Initialize trust store with system certificates
   */
  private initializeTrustStore(): void {
    try {
      // Common system certificate locations
      const systemPaths = [
        '/etc/ssl/certs/ca-certificates.crt', // Debian/Ubuntu
        '/etc/pki/tls/certs/ca-bundle.crt', // RHEL/CentOS
        '/etc/ssl/ca-bundle.pem', // OpenSUSE
        '/etc/ssl/cert.pem', // macOS/BSD
        'C:\\Windows\\System32\\curl-ca-bundle.crt' // Windows
      ];

      for (const path of systemPaths) {
        if (existsSync(path)) {
          const certs = readFileSync(path, 'utf8');
          const certBlocks = this.extractPEMBlocks(certs, 'CERTIFICATE');

          for (const certPem of certBlocks) {
            try {
              const x509 = new X509Certificate(certPem);
              this.trustStore.set(x509.fingerprint, {
                certificate: certPem,
                subject: x509.subject,
                issuer: x509.issuer,
                validFrom: new Date(x509.validFrom),
                validTo: new Date(x509.validTo),
                trusted: true,
                source: 'system'
              });
            } catch (error) {
              // Skip invalid certificates
            }
          }

          this.logger.info(`Loaded ${certBlocks.length} system certificates from ${path}`);
          break;
        }
      }

      // Load additional CA certificates
      if (this.config.additionalCAPath && existsSync(this.config.additionalCAPath)) {
        const certs = readFileSync(this.config.additionalCAPath, 'utf8');
        const certBlocks = this.extractPEMBlocks(certs, 'CERTIFICATE');

        for (const certPem of certBlocks) {
          try {
            const x509 = new X509Certificate(certPem);
            this.trustStore.set(x509.fingerprint, {
              certificate: certPem,
              subject: x509.subject,
              issuer: x509.issuer,
              validFrom: new Date(x509.validFrom),
              validTo: new Date(x509.validTo),
              trusted: true,
              source: 'additional'
            });
          } catch (error) {
            // Skip invalid certificates
          }
        }

        this.logger.info(`Loaded ${certBlocks.length} additional CA certificates`);
      }
    } catch (error) {
      this.logger.warn('Failed to initialize trust store', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Generate cache key for certificate
   */
  private generateCacheKey(config: CertificateAuthConfig): string {
    const parts = [];

    if (config.certPath) {
      parts.push(`cert:${config.certPath}`);
    } else if (config.cert) {
      parts.push(`cert:${createHash('sha256').update(config.cert).digest('hex').substring(0, 16)}`);
    }

    if (config.keyPath) {
      parts.push(`key:${config.keyPath}`);
    } else if (config.key) {
      parts.push(`key:${createHash('sha256').update(config.key).digest('hex').substring(0, 16)}`);
    }

    if (config.passphrase) {
      parts.push(`pass:${createHash('sha256').update(config.passphrase).digest('hex').substring(0, 8)}`);
    }

    return parts.join(':');
  }

  /**
   * Generate store ID for certificate
   */
  private generateStoreId(certInfo: CertificateInfo): string {
    const hash = createHash('sha256');
    hash.update(certInfo.certificate);
    hash.update(certInfo.privateKey);
    return hash.digest('hex');
  }

  /**
   * Update metrics
   */
  private updateMetrics(success: boolean, duration: number): void {
    if (!this.config.enableMetrics) return;

    if (success) {
      this.metrics.certificatesValidated++;
    } else {
      this.metrics.certificatesFailed++;
    }

    // Update average validation time
    const totalTime = this.metrics.averageValidationTime *
      (this.metrics.certificatesValidated + this.metrics.certificatesFailed - 1) + duration;
    this.metrics.averageValidationTime = totalTime /
      (this.metrics.certificatesValidated + this.metrics.certificatesFailed);
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean up expired cache entries every hour
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 3600000);

    // Reset metrics daily
    setInterval(() => {
      this.resetMetrics();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = new Date();

    // Clean OCSP cache
    const expiredOcsp: string[] = [];
    this.ocspCache.forEach((entry, key) => {
      if (entry.validUntil < now) {
        expiredOcsp.push(key);
      }
    });
    expiredOcsp.forEach(key => this.ocspCache.delete(key));

    // Clean CRL cache
    const expiredCrl: string[] = [];
    this.crlCache.forEach((entry, key) => {
      if (entry.nextUpdate < now) {
        expiredCrl.push(key);
      }
    });
    expiredCrl.forEach(key => this.crlCache.delete(key));

    // Clean certificate cache
    const expiredCerts: string[] = [];
    this.certificateCache.forEach((entry, key) => {
      if (now.getTime() - entry.lastAccessed.getTime() > this.config.cacheTTL) {
        expiredCerts.push(key);
      }
    });
    expiredCerts.forEach(key => this.certificateCache.delete(key));

    if (expiredOcsp.length + expiredCrl.length + expiredCerts.length > 0) {
      this.logger.debug('Cleaned up expired cache entries', {
        ocsp: expiredOcsp.length,
        crl: expiredCrl.length,
        certificates: expiredCerts.length
      });
    }
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.metrics.certificatesLoaded = 0;
    this.metrics.certificatesValidated = 0;
    this.metrics.certificatesFailed = 0;
    this.metrics.revocationChecks = 0;
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    this.metrics.averageValidationTime = 0;
    this.metrics.validationErrors = [];
    this.metrics.lastReset = new Date();
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `cert-${Date.now()}-${randomBytes(8).toString('hex')}`;
  }

  /**
   * Get metrics
   */
  public getMetrics(): CertificateMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear all caches
   */
  public clearCaches(): void {
    this.certificateCache.clear();
    this.agentCache.clear();
    this.ocspCache.clear();
    this.crlCache.clear();
    this.logger.info('All certificate caches cleared');
  }

  /**
   * Export trust store
   */
  public exportTrustStore(): TrustStore[] {
    return Array.from(this.trustStore.values());
  }

  /**
   * Import trust store
   */
  public importTrustStore(entries: TrustStore[]): void {
    for (const entry of entries) {
      try {
        const x509 = new X509Certificate(entry.certificate);
        this.trustStore.set(x509.fingerprint, entry);
      } catch (error) {
        this.logger.warn(`Failed to import trust store entry: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Add certificate to trust store
   */
  public addTrustedCertificate(certificate: string, source?: string): void {
    try {
      const x509 = new X509Certificate(certificate);
      this.trustStore.set(x509.fingerprint, {
        certificate,
        subject: x509.subject,
        issuer: x509.issuer,
        validFrom: new Date(x509.validFrom),
        validTo: new Date(x509.validTo),
        trusted: true,
        source: source || 'manual'
      });

      this.logger.info(`Added certificate to trust store: ${x509.subject}`);
    } catch (error) {
      throw new CertificateError(`Failed to add certificate to trust store: ${error instanceof Error ? error.message : String(error)}`, 'TRUST_STORE_ERROR');
    }
  }

  /**
   * Remove certificate from trust store
   */
  public removeTrustedCertificate(fingerprint: string): boolean {
    const removed = this.trustStore.delete(fingerprint);
    if (removed) {
      this.logger.info(`Removed certificate from trust store: ${fingerprint}`);
    }
    return removed;
  }

  /**
   * Test certificate configuration
   */
  public async testCertificate(config: CertificateAuthConfig): Promise<{
    success: boolean;
    error?: string | undefined;
    details?: any;
  }> {
    try {
      const certInfo = await this.loadCertificate(config);
      const validationResult = await this.validateCertificate(certInfo);

      return {
        success: validationResult.isValid,
        error: validationResult.errors.length > 0 ? validationResult.errors.join('; ') : undefined,
        details: {
          certificate: validationResult.certificate || undefined,
          warnings: validationResult.warnings,
          validationTime: validationResult.validationTime
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {
          code: error instanceof CertificateError ? error.code : 'UNKNOWN_ERROR',
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }
}