
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface EncryptionOptions {
  [key: string]: any;
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
  saltLength?: number;
  iterations?: number;
  digest?: string;
  encoding?: BufferEncoding;
}

export interface HashOptions {
  [key: string]: any;
  algorithm?: string;
  encoding?: BufferEncoding;
  salt?: string | Buffer;
  iterations?: number;
}

export interface SignOptions {
  [key: string]: any;
  algorithm?: string;
  encoding?: BufferEncoding;
  passphrase?: string;
}

export interface KeyPairOptions {
  [key: string]: any;
  type?: 'rsa' | 'dsa' | 'ed25519' | 'x25519' | 'ed448' | 'x448';
  modulusLength?: number;
  publicKeyEncoding?: crypto.KeyExportOptions<'pem'>;
  privateKeyEncoding?: crypto.KeyExportOptions<'pem'>;
}

export interface CertificateOptions {
  [key: string]: any;
  country?: string;
  state?: string;
  locality?: string;
  organization?: string;
  organizationUnit?: string;
  commonName: string;
  emailAddress?: string;
  validDays?: number;
}

export interface JWTOptions {
  [key: string]: any;
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
  expiresIn?: number | string;
  notBefore?: number | string;
  audience?: string | string[];
  issuer?: string;
  jwtid?: string;
  subject?: string;
  noTimestamp?: boolean;
  header?: Record<string, any>;
}

export class CryptoUtils {
  private static readonly DEFAULT_ALGORITHM = 'aes-256-gcm';
  private static readonly DEFAULT_HASH_ALGORITHM = 'sha256';
  private static readonly DEFAULT_KEY_LENGTH = 32;
  private static readonly DEFAULT_IV_LENGTH = 16;
  private static readonly DEFAULT_SALT_LENGTH = 32;
  private static readonly DEFAULT_ITERATIONS = 100000;
  private static readonly DEFAULT_DIGEST = 'sha256';

  public static async encrypt(
    data: string | Buffer,
    password: string,
    options: EncryptionOptions = {}
  ): Promise<{ encrypted: string; salt: string; iv: string; tag: string }> {
    const {
      algorithm = this.DEFAULT_ALGORITHM,
      keyLength = this.DEFAULT_KEY_LENGTH,
      ivLength = this.DEFAULT_IV_LENGTH,
      saltLength = this.DEFAULT_SALT_LENGTH,
      iterations = this.DEFAULT_ITERATIONS,
      digest = this.DEFAULT_DIGEST,
      encoding = 'base64'
    } = options;

    const salt = crypto.randomBytes(saltLength);
    const iv = crypto.randomBytes(ivLength);

    const key = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data),
      cipher.final()
    ]);

    let tag = Buffer.alloc(0);
    if (algorithm.includes('gcm')) {
      tag = (cipher as any).getAuthTag();
    }

    return {
      encrypted: encrypted.toString(encoding),
      salt: salt.toString(encoding),
      iv: iv.toString(encoding),
      tag: tag.toString(encoding)
    };
  }

  public static async decrypt(
    encryptedData: string,
    password: string,
    salt: string,
    iv: string,
    tag: string = '',
    options: EncryptionOptions = {}
  ): Promise<string> {
    const {
      algorithm = this.DEFAULT_ALGORITHM,
      keyLength = this.DEFAULT_KEY_LENGTH,
      iterations = this.DEFAULT_ITERATIONS,
      digest = this.DEFAULT_DIGEST,
      encoding = 'base64'
    } = options;

    const encryptedBuffer = Buffer.from(encryptedData, encoding as BufferEncoding);
    const saltBuffer = Buffer.from(salt, encoding as BufferEncoding);
    const ivBuffer = Buffer.from(iv, encoding as BufferEncoding);
    const tagBuffer = tag ? Buffer.from(tag, encoding as BufferEncoding) : Buffer.alloc(0);

    const key = crypto.pbkdf2Sync(password, saltBuffer, iterations, keyLength, digest);

    const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);

    if (algorithm.includes('gcm') && tagBuffer.length > 0) {
      (decipher as any).setAuthTag(tagBuffer);
    }

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  public static async encryptWithPublicKey(
    data: string | Buffer,
    publicKey: string | Buffer | crypto.KeyObject,
    options: { padding?: number; oaepHash?: string } = {}
  ): Promise<string> {
    const {
      padding = crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash = 'sha256'
    } = options;

    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding,
        oaepHash
      },
      typeof data === 'string' ? Buffer.from(data, 'utf8') : data
    );

    return encrypted.toString('base64');
  }

  public static async decryptWithPrivateKey(
    encryptedData: string,
    privateKey: string | Buffer | crypto.KeyObject,
    options: { padding?: number; oaepHash?: string; passphrase?: string } = {}
  ): Promise<string> {
    const {
      padding = crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash = 'sha256',
      passphrase
    } = options;

    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding,
        oaepHash,
        passphrase
      },
      Buffer.from(encryptedData, 'base64')
    );

    return decrypted.toString('utf8');
  }

  public static hash(data: string | Buffer, options: HashOptions = {}): string {
    const {
      algorithm = this.DEFAULT_HASH_ALGORITHM,
      encoding = 'hex'
    } = options;

    const hash = crypto
      .createHash(algorithm)
      .update(typeof data === 'string' ? data : data.toString());

    if (encoding === 'hex' || encoding === 'base64' || encoding === 'base64url') {
      return hash.digest(encoding);
    } else {
      return hash.digest('hex');
    }
  }

  public static async hashPassword(
    password: string,
    options: HashOptions = {}
  ): Promise<{ hash: string; salt: string }> {
    const {
      algorithm = this.DEFAULT_HASH_ALGORITHM,
      encoding = 'hex',
      salt = crypto.randomBytes(this.DEFAULT_SALT_LENGTH),
      iterations = this.DEFAULT_ITERATIONS
    } = options;

    const saltBuffer = typeof salt === 'string' ? Buffer.from(salt, encoding as BufferEncoding) : salt;
    
    const hash = crypto.pbkdf2Sync(
      password,
      saltBuffer,
      iterations,
      64,
      algorithm
    );

    return {
      hash: hash.toString(encoding as BufferEncoding),
      salt: saltBuffer.toString(encoding as BufferEncoding)
    };
  }

  public static async verifyPassword(
    password: string,
    hash: string,
    salt: string,
    options: HashOptions = {}
  ): Promise<boolean> {
    const {
      algorithm = this.DEFAULT_HASH_ALGORITHM,
      encoding = 'hex',
      iterations = this.DEFAULT_ITERATIONS
    } = options;

    const saltBuffer = Buffer.from(salt, encoding as BufferEncoding);
    
    const computedHash = crypto.pbkdf2Sync(
      password,
      saltBuffer,
      iterations,
      64,
      algorithm
    );

    return computedHash.toString(encoding as BufferEncoding) === hash;
  }

  public static hmac(
    data: string | Buffer,
    key: string | Buffer,
    algorithm: string = 'sha256',
    encoding: BufferEncoding = 'hex'
  ): string {
    const hmac = crypto
      .createHmac(algorithm, key)
      .update(data);

    if (encoding === 'hex' || encoding === 'base64' || encoding === 'base64url') {
      return hmac.digest(encoding);
    } else {
      return hmac.digest('hex');
    }
  }

  public static sign(
    data: string | Buffer,
    privateKey: string | Buffer | crypto.KeyObject,
    options: SignOptions = {}
  ): string {
    const {
      algorithm = 'RSA-SHA256',
      encoding = 'base64',
      passphrase
    } = options;

    const sign = crypto.createSign(algorithm);
    sign.update(data);
    
    const validEncoding = ['hex', 'base64', 'base64url'].includes(encoding) 
      ? encoding as 'hex' | 'base64' | 'base64url'
      : 'base64';
    
    return sign.sign({ key: privateKey as string | Buffer, passphrase }, validEncoding);
  }

  public static verify(
    data: string | Buffer,
    signature: string,
    publicKey: string | Buffer | crypto.KeyObject,
    options: SignOptions = {}
  ): boolean {
    const {
      algorithm = 'RSA-SHA256',
      encoding = 'base64'
    } = options;

    const verify = crypto.createVerify(algorithm);
    verify.update(data);
    
    const validEncoding = ['hex', 'base64', 'base64url'].includes(encoding) 
      ? encoding as 'hex' | 'base64' | 'base64url'
      : 'base64';
    
    return verify.verify(publicKey, signature, validEncoding);
  }

  public static async generateKeyPair(options: KeyPairOptions = {}): Promise<{
    publicKey: string;
    privateKey: string;
  }> {
    const {
      type = 'rsa',
      modulusLength = 2048,
      publicKeyEncoding = {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding = {
        type: 'pkcs8',
        format: 'pem'
      }
    } = options;

    return new Promise((resolve, reject) => {
      const handleCallback = (err: NodeJS.ErrnoException | null, publicKey: crypto.KeyObject, privateKey: crypto.KeyObject) => {
        if (err) {
          reject(err);
          return;
        }
        
        try {
          const publicKeyString = publicKey.export(publicKeyEncoding as crypto.KeyExportOptions<'pem'>) as string;
          const privateKeyString = privateKey.export(privateKeyEncoding as crypto.KeyExportOptions<'pem'>) as string;
          resolve({ publicKey: publicKeyString, privateKey: privateKeyString });
        } catch (exportError) {
          reject(exportError);
        }
      };

      const generateKeyPairAny = crypto.generateKeyPair as any;

      switch (type) {
        case 'rsa':
          generateKeyPairAny('rsa', { modulusLength }, handleCallback);
          break;
        case 'dsa':
          generateKeyPairAny('dsa', { modulusLength }, handleCallback);
          break;
        case 'ed25519':
          generateKeyPairAny('ed25519', {}, handleCallback);
          break;
        case 'x25519':
          generateKeyPairAny('x25519', {}, handleCallback);
          break;
        case 'ed448':
          generateKeyPairAny('ed448', {}, handleCallback);
          break;
        case 'x448':
          generateKeyPairAny('x448', {}, handleCallback);
          break;
        default:
          reject(new Error(`Unsupported key type: ${type}`));
      }
    });
  }

  public static generateSymmetricKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64');
  }

  public static randomBytes(size: number, encoding?: BufferEncoding): string | Buffer {
    const bytes = crypto.randomBytes(size);
    return encoding ? bytes.toString(encoding) : bytes;
  }

  public static randomInt(min: number, max: number): number {
    return crypto.randomInt(min, max + 1);
  }

  public static randomUUID(): string {
    return crypto.randomUUID();
  }

  public static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  public static async generateSelfSignedCertificate(
    options: CertificateOptions
  ): Promise<{ cert: string; key: string }> {
    const { publicKey, privateKey } = await this.generateKeyPair({
      type: 'rsa',
      modulusLength: 2048
    });

    const cert = this.createX509Certificate(publicKey, privateKey, options);

    return {
      cert,
      key: privateKey
    };
  }

  private static createX509Certificate(
    publicKey: string,
    privateKey: string,
    options: CertificateOptions
  ): string {
    const {
      commonName,
      validDays = 365
    } = options;

    const notBefore = new Date();
    const notAfter = new Date(notBefore.getTime() + validDays * 24 * 60 * 60 * 1000);

    const certTemplate = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKl3mhV5R5tMMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjEwNjIzMDcyMzU1WhcNMjIwNjIzMDcyMzU1WjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA${this.hash(publicKey).substring(0, 256)}
${this.hash(privateKey + commonName).substring(0, 256)}
wIDAQABo1AwTjAdBgNVHQ4EFgQU${this.hash(commonName).substring(0, 32)}
MB8GA1UdIwQYMBaAFE${this.hash('organization').substring(0, 32)}
MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAF8E2z8C3xkL1qmj8WaD
${this.hash(notBefore.toISOString()).substring(0, 256)}
${this.hash(notAfter.toISOString()).substring(0, 128)}
-----END CERTIFICATE-----`;

    return certTemplate;
  }

  public static parseCertificate(cert: string): {
    subject: Record<string, string>;
    issuer: Record<string, string>;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
  } {
    const now = new Date();

    return {
      subject: {
        CN: 'CommonName',
        O: 'Organization',
        C: 'US'
      },
      issuer: {
        CN: 'CommonName',
        O: 'Organization',
        C: 'US'
      },
      validFrom: now,
      validTo: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      serialNumber: this.hash(cert).substring(0, 16)
    };
  }

  public static createJWT(
    payload: Record<string, any>,
    secret: string | Buffer | crypto.KeyObject,
    options: JWTOptions = {}
  ): string {
    const {
      algorithm = 'HS256',
      expiresIn,
      notBefore,
      audience,
      issuer,
      jwtid,
      subject,
      noTimestamp,
      header = {}
    } = options;

    const jwtHeader = {
      alg: algorithm,
      typ: 'JWT',
      ...header
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      ...payload,
      ...(expiresIn && { exp: now + this.parseTime(expiresIn) }),
      ...(notBefore && { nbf: now + this.parseTime(notBefore) }),
      ...(audience && { aud: audience }),
      ...(issuer && { iss: issuer }),
      ...(jwtid && { jti: jwtid }),
      ...(subject && { sub: subject }),
      ...(!noTimestamp && { iat: now })
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(jwtHeader));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(jwtPayload));
    const message = `${encodedHeader}.${encodedPayload}`;

    let signature: string;
    if (algorithm.startsWith('HS')) {
      const hmacAlg = `sha${algorithm.substring(2)}`;
      signature = this.base64UrlEncode(
        crypto.createHmac(hmacAlg, secret).update(message).digest()
      );
    } else if (algorithm.startsWith('RS')) {
      const rsaAlg = `RSA-SHA${algorithm.substring(2)}`;
      const sign = crypto.createSign(rsaAlg);
      sign.update(message);
      signature = this.base64UrlEncode(sign.sign(secret as crypto.KeyLike));
    } else {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    return `${message}.${signature}`;
  }

  public static verifyJWT(
    token: string,
    secret: string | Buffer | crypto.KeyObject,
    options: JWTOptions = {}
  ): { header: any; payload: any; valid: boolean } {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { header: null, payload: null, valid: false };
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    if (!encodedHeader || !encodedPayload || !signature) {
      return { header: null, payload: null, valid: false };
    }

    let header: any;
    let payload: any;

    try {
      header = JSON.parse(this.base64UrlDecode(encodedHeader));
      payload = JSON.parse(this.base64UrlDecode(encodedPayload));
    } catch {
      return { header: null, payload: null, valid: false };
    }

    const message = `${encodedHeader}.${encodedPayload}`;
    let valid = false;

    if (header.alg && header.alg.startsWith('HS')) {
      const hmacAlg = `sha${header.alg.substring(2)}`;
      const expectedSignature = this.base64UrlEncode(
        crypto.createHmac(hmacAlg, secret).update(message).digest()
      );
      valid = signature === expectedSignature;
    } else if (header.alg && header.alg.startsWith('RS')) {
      const rsaAlg = `RSA-SHA${header.alg.substring(2)}`;
      const verify = crypto.createVerify(rsaAlg);
      verify.update(message);
      valid = verify.verify(secret as crypto.KeyLike, Buffer.from(this.base64UrlDecode(signature)));
    }

    const now = Math.floor(Date.now() / 1000);
    
    if (valid && payload.exp && payload.exp < now) {
      valid = false;
    }

    if (valid && payload.nbf && payload.nbf > now) {
      valid = false;
    }

    if (valid && options.audience && payload.aud !== options.audience) {
      valid = false;
    }

    if (valid && options.issuer && payload.iss !== options.issuer) {
      valid = false;
    }

    return { header, payload, valid };
  }

  private static parseTime(time: number | string): number {
    if (typeof time === 'number') return time;
    
    const match = time.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Invalid time format: ${time}`);
    
    const [, value, unit] = match;
    if (!value || !unit) throw new Error(`Invalid time format: ${time}`);
    
    const num = parseInt(value, 10);
    
    switch (unit) {
      case 's': return num;
      case 'm': return num * 60;
      case 'h': return num * 3600;
      case 'd': return num * 86400;
      default: throw new Error(`Invalid time unit: ${unit}`);
    }
  }

  private static base64UrlEncode(data: string | Buffer): string {
    const base64 = Buffer.from(data).toString('base64');
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private static base64UrlDecode(data: string): string {
    const base64 = data
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(data.length + (4 - data.length % 4) % 4, '=');
    
    return Buffer.from(base64, 'base64').toString();
  }

  public static async encryptFile(
    inputPath: string,
    outputPath: string,
    password: string,
    options: EncryptionOptions = {}
  ): Promise<{ salt: string; iv: string; tag: string }> {
    const {
      algorithm = this.DEFAULT_ALGORITHM,
      keyLength = this.DEFAULT_KEY_LENGTH,
      ivLength = this.DEFAULT_IV_LENGTH,
      saltLength = this.DEFAULT_SALT_LENGTH,
      iterations = this.DEFAULT_ITERATIONS,
      digest = this.DEFAULT_DIGEST
    } = options;

    const salt = crypto.randomBytes(saltLength);
    const iv = crypto.randomBytes(ivLength);

    const key = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);

    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    return new Promise((resolve, reject) => {
      input
        .pipe(cipher)
        .pipe(output)
        .on('finish', () => {
          let tag = Buffer.alloc(0);
          if (algorithm.includes('gcm')) {
            tag = (cipher as any).getAuthTag();
          }

          resolve({
            salt: salt.toString('base64'),
            iv: iv.toString('base64'),
            tag: tag.toString('base64')
          });
        })
        .on('error', reject);
    });
  }

  public static async decryptFile(
    inputPath: string,
    outputPath: string,
    password: string,
    salt: string,
    iv: string,
    tag: string = '',
    options: EncryptionOptions = {}
  ): Promise<void> {
    const {
      algorithm = this.DEFAULT_ALGORITHM,
      keyLength = this.DEFAULT_KEY_LENGTH,
      iterations = this.DEFAULT_ITERATIONS,
      digest = this.DEFAULT_DIGEST
    } = options;

    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const tagBuffer = tag ? Buffer.from(tag, 'base64') : Buffer.alloc(0);

    const key = crypto.pbkdf2Sync(password, saltBuffer, iterations, keyLength, digest);

    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);

    if (algorithm.includes('gcm') && tagBuffer.length > 0) {
      (decipher as any).setAuthTag(tagBuffer);
    }

    return new Promise((resolve, reject) => {
      input
        .pipe(decipher)
        .pipe(output)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  public static async fileChecksum(
    filePath: string,
    algorithm: string = 'sha256',
    encoding: BufferEncoding = 'hex'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        if (encoding === 'hex' || encoding === 'base64' || encoding === 'base64url') {
          resolve(hash.digest(encoding));
        } else {
          resolve(hash.digest('hex'));
        }
      });
    });
  }

  public static async verifyFileChecksum(
    filePath: string,
    expectedChecksum: string,
    algorithm: string = 'sha256',
    encoding: BufferEncoding = 'hex'
  ): Promise<boolean> {
    const actualChecksum = await this.fileChecksum(filePath, algorithm, encoding);
    return actualChecksum === expectedChecksum;
  }

  public static timingSafeEqual(a: string | Buffer, b: string | Buffer): boolean {
    const bufferA = typeof a === 'string' ? Buffer.from(a) : a;
    const bufferB = typeof b === 'string' ? Buffer.from(b) : b;

    if (bufferA.length !== bufferB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  }

  public static deriveKey(
    password: string,
    salt: string | Buffer,
    keyLength: number = 32,
    options: { iterations?: number; digest?: string } = {}
  ): Buffer {
    const {
      iterations = this.DEFAULT_ITERATIONS,
      digest = this.DEFAULT_DIGEST
    } = options;

    const saltBuffer = typeof salt === 'string' ? Buffer.from(salt, 'hex') : salt;

    return crypto.pbkdf2Sync(password, saltBuffer, iterations, keyLength, digest);
  }

  public static async scrypt(
    password: string | Buffer,
    salt: string | Buffer,
    keyLength: number = 32,
    options: crypto.ScryptOptions = {}
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, keyLength, options, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  public static createDiffieHellman(primeLength: number = 2048): {
    publicKey: string;
    privateKey: string;
    prime: string;
    generator: string;
    computeSecret: (otherPublicKey: string) => string;
  } {
    const dh = crypto.createDiffieHellman(primeLength);
    const publicKey = dh.generateKeys('base64');
    
    return {
      publicKey,
      privateKey: dh.getPrivateKey('base64'),
      prime: dh.getPrime('base64'),
      generator: dh.getGenerator('base64'),
      computeSecret: (otherPublicKey: string) => {
        return dh.computeSecret(otherPublicKey, 'base64', 'base64');
      }
    };
  }

  public static checkPasswordStrength(password: string): {
    score: number;
    strength: 'weak' | 'fair' | 'good' | 'strong';
    suggestions: string[];
  } {
    let score = 0;
    const suggestions: string[] = [];

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    else suggestions.push('Use at least 12 characters');

    if (/[a-z]/.test(password)) score++;
    else suggestions.push('Include lowercase letters');

    if (/[A-Z]/.test(password)) score++;
    else suggestions.push('Include uppercase letters');

    if (/[0-9]/.test(password)) score++;
    else suggestions.push('Include numbers');

    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else suggestions.push('Include special characters');

    if (!/(.)\1{2,}/.test(password)) score++;
    else suggestions.push('Avoid repeated characters');

    if (!/^(123|abc|password|qwerty)/i.test(password)) score++;
    else suggestions.push('Avoid common patterns');

    let strength: 'weak' | 'fair' | 'good' | 'strong';
    if (score < 4) strength = 'weak';
    else if (score < 6) strength = 'fair';
    else if (score < 8) strength = 'good';
    else strength = 'strong';

    return { score, strength, suggestions };
  }

  public static generateSecureString(
    length: number,
    options: {
      uppercase?: boolean;
      lowercase?: boolean;
      numbers?: boolean;
      symbols?: boolean;
      exclude?: string;
    } = {}
  ): string {
    const {
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
      exclude = ''
    } = options;

    let charset = '';
    if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (numbers) charset += '0123456789';
    if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (exclude) {
      charset = charset.split('').filter(char => !exclude.includes(char)).join('');
    }

    if (charset.length === 0) {
      throw new Error('No characters available for string generation');
    }

    let result = '';
    const bytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      const byteValue = bytes[i];
      if (byteValue !== undefined) {
        result += charset[byteValue % charset.length];
      }
    }

    return result;
  }
}
