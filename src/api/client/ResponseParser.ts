// src/api/client/ResponseParser.ts
import { ParsedResponse } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { gunzip, inflate, brotliDecompress } from 'zlib';
import { promisify } from 'util';

// Production-ready XML parser interface
interface XMLParserOptions {
  explicitArray?: boolean;
  ignoreAttrs?: boolean;
  mergeAttrs?: boolean;
  normalize?: boolean;
  normalizeTags?: boolean;
  trim?: boolean;
}

interface XMLParser {
  parseString(xml: string, callback: (err: Error | null, result: any) => void): void;
}

// Safe XML module loading with fallback
class SafeXMLParser {
  private parser: XMLParser | null = null;
  private available = false;

  constructor(options: XMLParserOptions = {}) {
    try {
      // Dynamic import with proper error handling
      const xml2js = require('xml2js');
      this.parser = new xml2js.Parser(options);
      this.available = true;
    } catch (error) {
      // xml2js not available - graceful fallback
      this.available = false;
      ActionLogger.getInstance().warn('xml2js module not available - XML parsing disabled', { error: (error as Error).message });
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  parseString(xml: string): Promise<any> {
    if (!this.available || !this.parser) {
      return Promise.reject(new Error('XML parsing not available - xml2js module not found'));
    }

    return new Promise((resolve, reject) => {
      this.parser!.parseString(xml, (err: Error | null, result: any) => {
        if (err) {
          reject(new Error(`Invalid XML: ${err.message}`));
        } else {
          resolve(result);
        }
      });
    });
  }
}

// Async compression utilities
const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliDecompressAsync = promisify(brotliDecompress);

export class ResponseParser {
  private xmlParser: SafeXMLParser;
  private readonly supportedEncodings: readonly BufferEncoding[] = [
    'ascii', 'utf8', 'utf16le', 'ucs2', 'base64', 'base64url', 'latin1', 'binary', 'hex'
  ] as const;

  constructor() {
    this.xmlParser = new SafeXMLParser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
      normalize: true,
      normalizeTags: true,
      trim: true
    });
  }

  public async parse(response: ParsedResponse): Promise<ParsedResponse> {
    try {
      // Parse body based on content type
      const contentType = this.getContentType(response.headers);
      response.contentType = contentType;

      if (Buffer.isBuffer(response.body)) {
        response.body = await this.parseBuffer(response.body, contentType, response.encoding);
      }

      ActionLogger.getInstance().debug('Response parsed', {
        contentType,
        size: response.size,
        status: response.status
      });

      return response;
    } catch (error) {
      ActionLogger.getInstance().logError(error as Error, 'Response parsing failed');
      throw new Error(`Failed to parse response: ${(error as Error).message}`);
    }
  }

  private async parseBuffer(buffer: Buffer, contentType: string, encoding: string): Promise<any> {
    // Check if response is compressed and decompress if needed
    const decompressed = await this.decompressIfNeeded(buffer);
    return this.parseBufferContent(decompressed, contentType, encoding);
  }
  
  private async parseBufferContent(buffer: Buffer, contentType: string, encoding: string): Promise<any> {
    // Handle empty responses
    if (buffer.length === 0) {
      return null;
    }

    const validEncoding = this.validateEncoding(encoding);

    // Parse based on content type
    if (contentType.includes('application/json')) {
      return this.parseJSON(buffer.toString(validEncoding));
    }

    if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      return this.parseXML(buffer.toString(validEncoding));
    }

    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      return buffer.toString(validEncoding);
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      return this.parseFormUrlEncoded(buffer.toString(validEncoding));
    }

    if (contentType.includes('multipart/form-data')) {
      return this.parseMultipart(buffer, contentType);
    }

    if (contentType.includes('text/csv')) {
      return this.parseCSV(buffer.toString(validEncoding));
    }

    if (contentType.includes('application/octet-stream') || contentType.includes('image/')) {
      return buffer; // Return raw buffer for binary data
    }

    // Default to text
    return buffer.toString(validEncoding);
  }
  
  private async decompressIfNeeded(buffer: Buffer): Promise<Buffer> {
    // Auto-detect compression from buffer signatures
    if (buffer.length >= 2) {
      // gzip magic number: 1f 8b
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        try {
          return await gunzipAsync(buffer);
        } catch (error) {
          ActionLogger.getInstance().warn('Failed to decompress gzip data, using original', { error: (error as Error).message });
          return buffer;
        }
      }
      
      // deflate/zlib magic number: 78 (followed by 01, 9c, da, etc.)
      if (buffer[0] === 0x78) {
        try {
          return await inflateAsync(buffer);
        } catch (error) {
          ActionLogger.getInstance().warn('Failed to decompress deflate data, using original', { error: (error as Error).message });
          return buffer;
        }
      }
      
      // Brotli detection is more complex, but we can try
      if (buffer.length >= 6) {
        try {
          return await brotliDecompressAsync(buffer);
        } catch (error) {
          // Brotli failed - this is expected if it's not brotli data
          return buffer;
        }
      }
    }
    
    return buffer;
  }
  
  private validateEncoding(encoding: string): BufferEncoding {
    if (this.supportedEncodings.includes(encoding as BufferEncoding)) {
      return encoding as BufferEncoding;
    }
    
    // Default to utf8 for invalid encodings
    ActionLogger.getInstance().debug('Invalid encoding specified, defaulting to utf8', { providedEncoding: encoding });
    return 'utf8';
  }

  public parseJSON(text: string): any {
    try {
      return JSON.parse(text);
    } catch (error) {
      // Try to fix common JSON issues
      const fixed = this.tryFixJSON(text);
      try {
        return JSON.parse(fixed);
      } catch (secondError) {
        throw new Error(`Invalid JSON: ${(error as Error).message}`);
      }
    }
  }

  private tryFixJSON(text: string): string {
    let fixed = text.trim();

    // Remove BOM if present
    if (fixed.charCodeAt(0) === 0xFEFF) {
      fixed = fixed.slice(1);
    }

    // Handle JSONP
    const jsonpMatch = fixed.match(/^[^(]+\((.+)\)[^)]*$/);
    if (jsonpMatch && jsonpMatch[1]) {
      fixed = jsonpMatch[1];
    }

    // Handle trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // Handle single quotes (convert to double quotes) - be careful with apostrophes
    fixed = fixed.replace(/'/g, '"');

    return fixed;
  }

  public async parseXML(text: string): Promise<any> {
    if (!this.xmlParser.isAvailable()) {
      throw new Error('XML parsing not available - xml2js module not found');
    }
    
    return this.xmlParser.parseString(text);
  }

  private parseFormUrlEncoded(text: string): Record<string, any> {
    const params = new URLSearchParams(text);
    const result: Record<string, any> = {};

    params.forEach((value: string, key: string) => {
      if (result[key]) {
        // Handle multiple values for same key
        if (Array.isArray(result[key])) {
          result[key].push(value);
        } else {
          result[key] = [result[key], value];
        }
      } else {
        result[key] = value;
      }
    });

    return result;
  }

  private parseMultipart(buffer: Buffer, contentType: string): any {
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch || !boundaryMatch[1]) {
      throw new Error('Multipart content missing boundary');
    }

    const boundary = boundaryMatch[1].trim();
    const parts: any[] = [];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

    let start = 0;
    let boundaryIndex = buffer.indexOf(boundaryBuffer, start);

    while (boundaryIndex !== -1) {
      const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
      const endBoundaryIndex = buffer.indexOf(endBoundaryBuffer, boundaryIndex);

      let end = nextBoundaryIndex !== -1 ? nextBoundaryIndex : endBoundaryIndex;
      if (end === -1) {
        end = buffer.length;
      }

      const part = buffer.slice(boundaryIndex + boundaryBuffer.length, end);
      const parsed = this.parseMultipartPart(part);
      if (parsed) {
        parts.push(parsed);
      }

      if (nextBoundaryIndex === -1) {
        break;
      }

      boundaryIndex = nextBoundaryIndex;
    }

    return parts;
  }

  private parseMultipartPart(part: Buffer): any {
    const headerEndIndex = part.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
      return null;
    }

    const headers = part.slice(0, headerEndIndex).toString('utf8');
    const body = part.slice(headerEndIndex + 4);

    const parsedHeaders: Record<string, string> = {};
    headers.split('\r\n').forEach((line: string) => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key && value) {
          parsedHeaders[key.toLowerCase()] = value;
        }
      }
    });

    const contentDisposition = parsedHeaders['content-disposition'] || '';
    const nameMatch = contentDisposition.match(/name="([^"]+)"/);
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);

    const result: any = {
      data: body
    };

    // Only add properties if they exist (exactOptionalPropertyTypes compliance)
    if (nameMatch && nameMatch[1]) {
      result.name = nameMatch[1];
    }
    if (filenameMatch && filenameMatch[1]) {
      result.filename = filenameMatch[1];
    }
    if (parsedHeaders['content-type']) {
      result.contentType = parsedHeaders['content-type'];
    }

    return result;
  }

  private parseCSV(text: string): string[][] {
    const lines = text.split(/\r?\n/);
    const result: string[][] = [];

    for (const line of lines) {
      if (line.trim()) {
        result.push(this.parseCSVLine(line));
      }
    }

    return result;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  private getContentType(headers: Record<string, string | string[]>): string {
    const contentType = headers['content-type'] || headers['Content-Type'];
    
    if (Array.isArray(contentType)) {
      const firstType = contentType[0];
      return firstType || 'text/plain';
    }

    if (typeof contentType === 'string') {
      return contentType;
    }

    return 'text/plain';
  }

  public async decompressBody(body: Buffer, encoding?: string): Promise<Buffer> {
    if (!encoding || typeof encoding !== 'string') {
      return body;
    }

    switch (encoding.toLowerCase()) {
      case 'gzip':
        try {
          return await gunzipAsync(body);
        } catch (error) {
          ActionLogger.getInstance().warn('Failed to decompress gzip body', { error: (error as Error).message });
          return body;
        }

      case 'deflate':
        try {
          return await inflateAsync(body);
        } catch (error) {
          ActionLogger.getInstance().warn('Failed to decompress deflate body', { error: (error as Error).message });
          return body;
        }

      case 'br':
      case 'brotli':
        try {
          return await brotliDecompressAsync(body);
        } catch (error) {
          ActionLogger.getInstance().warn('Failed to decompress brotli body', { error: (error as Error).message });
          return body;
        }

      default:
        return body;
    }
  }

  // Utility method to detect content type from buffer signature
  public detectContentTypeFromBuffer(buffer: Buffer): string {
    if (buffer.length === 0) {
      return 'application/octet-stream';
    }

    // Check for common binary signatures
    const signature = buffer.slice(0, Math.min(buffer.length, 16));
    
    // PNG signature
    if (signature.length >= 8 && 
        signature[0] === 0x89 && signature[1] === 0x50 && 
        signature[2] === 0x4E && signature[3] === 0x47) {
      return 'image/png';
    }

    // JPEG signature
    if (signature.length >= 3 && 
        signature[0] === 0xFF && signature[1] === 0xD8 && signature[2] === 0xFF) {
      return 'image/jpeg';
    }

    // GIF signature
    if (signature.length >= 6 && 
        signature.toString('ascii', 0, 6) === 'GIF87a' || 
        signature.toString('ascii', 0, 6) === 'GIF89a') {
      return 'image/gif';
    }

    // PDF signature
    if (signature.length >= 4 && signature.toString('ascii', 0, 4) === '%PDF') {
      return 'application/pdf';
    }

    // ZIP signature
    if (signature.length >= 4 && 
        signature[0] === 0x50 && signature[1] === 0x4B && 
        (signature[2] === 0x03 || signature[2] === 0x05)) {
      return 'application/zip';
    }

    // Try to detect text content
    try {
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
      
      // Check for XML
      if (text.trim().startsWith('<?xml') || text.trim().startsWith('<')) {
        return 'application/xml';
      }

      // Check for JSON
      if ((text.trim().startsWith('{') && text.trim().endsWith('}')) ||
          (text.trim().startsWith('[') && text.trim().endsWith(']'))) {
        try {
          JSON.parse(text);
          return 'application/json';
        } catch {
          // Not valid JSON
        }
      }

      // Check for HTML
      if (text.toLowerCase().includes('<html') || text.toLowerCase().includes('<!doctype html')) {
        return 'text/html';
      }

      // Default to text if it's printable
      if (/^[\x20-\x7E\s]*$/.test(text)) {
        return 'text/plain';
      }
    } catch {
      // Not text content
    }

    return 'application/octet-stream';
  }
}