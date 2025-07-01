
import * as crypto from 'crypto';

export interface StringCompareOptions {
  caseSensitive?: boolean;
  trim?: boolean;
  ignoreWhitespace?: boolean;
  locale?: string;
}

export interface StringSearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface StringSplitOptions {
  limit?: number;
  removeEmpty?: boolean;
  trim?: boolean;
}

export interface LevenshteinOptions {
  insertCost?: number;
  deleteCost?: number;
  replaceCost?: number;
}

export class StringUtils {
  public static isEmpty(str: string | null | undefined): boolean {
    return !str || str.length === 0;
  }

  public static isBlank(str: string | null | undefined): boolean {
    return !str || str.trim().length === 0;
  }

  public static isNotEmpty(str: string | null | undefined): str is string {
    return !this.isEmpty(str);
  }

  public static isNotBlank(str: string | null | undefined): str is string {
    return !this.isBlank(str);
  }

  public static defaultIfEmpty(str: string | null | undefined, defaultValue: string): string {
    return this.isEmpty(str) ? defaultValue : str!;
  }

  public static defaultIfBlank(str: string | null | undefined, defaultValue: string): string {
    return this.isBlank(str) ? defaultValue : str!.trim();
  }

  public static trim(str: string, chars?: string): string {
    if (!chars) {
      return str.trim();
    }
    
    const pattern = this.escapeRegExp(chars);
    return str.replace(new RegExp(`^[${pattern}]+|[${pattern}]+$`, 'g'), '');
  }

  public static trimStart(str: string, chars?: string): string {
    if (!chars) {
      return str.trimStart();
    }
    
    const pattern = this.escapeRegExp(chars);
    return str.replace(new RegExp(`^[${pattern}]+`, 'g'), '');
  }

  public static trimEnd(str: string, chars?: string): string {
    if (!chars) {
      return str.trimEnd();
    }
    
    const pattern = this.escapeRegExp(chars);
    return str.replace(new RegExp(`[${pattern}]+$`, 'g'), '');
  }

  public static trimLines(str: string): string {
    return str.split('\n').map(line => line.trim()).join('\n');
  }

  public static trimToLength(str: string, maxLength: number, suffix: string = '...'): string {
    if (str.length <= maxLength) {
      return str;
    }
    
    const trimLength = maxLength - suffix.length;
    return trimLength > 0 ? str.substring(0, trimLength) + suffix : str.substring(0, maxLength);
  }

  public static toCamelCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/[\s_-]+/g, '');
  }

  public static toPascalCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, word => word.toUpperCase())
      .replace(/[\s_-]+/g, '');
  }

  public static toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .replace(/[\s-]+/g, '_')
      .replace(/^_/, '')
      .toLowerCase();
  }

  public static toKebabCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '-$1')
      .replace(/[\s_]+/g, '-')
      .replace(/^-/, '')
      .toLowerCase();
  }

  public static toConstantCase(str: string): string {
    return this.toSnakeCase(str).toUpperCase();
  }

  public static toTitleCase(str: string): string {
    return str.replace(
      /\w\S*/g,
      txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  public static toSentenceCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  public static swapCase(str: string): string {
    return str.replace(/[a-zA-Z]/g, char => 
      char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()
    );
  }

  public static padStart(str: string, length: number, padString: string = ' '): string {
    return str.padStart(length, padString);
  }

  public static padEnd(str: string, length: number, padString: string = ' '): string {
    return str.padEnd(length, padString);
  }

  public static padBoth(str: string, length: number, padString: string = ' '): string {
    const totalPadding = length - str.length;
    if (totalPadding <= 0) {
      return str;
    }
    
    const leftPadding = Math.floor(totalPadding / 2);
    const rightPadding = totalPadding - leftPadding;
    
    return padString.repeat(Math.ceil(leftPadding / padString.length))
      .substring(0, leftPadding) + str +
      padString.repeat(Math.ceil(rightPadding / padString.length))
      .substring(0, rightPadding);
  }

  public static equals(str1: string | null | undefined, str2: string | null | undefined, options: StringCompareOptions = {}): boolean {
    const {
      caseSensitive = true,
      trim = false,
      ignoreWhitespace = false,
      locale
    } = options;

    if (str1 === str2) return true;
    if (!str1 || !str2) return false;

    let s1 = str1;
    let s2 = str2;

    if (trim) {
      s1 = s1.trim();
      s2 = s2.trim();
    }

    if (ignoreWhitespace) {
      s1 = s1.replace(/\s+/g, '');
      s2 = s2.replace(/\s+/g, '');
    }

    if (locale) {
      return s1.localeCompare(s2, locale, { sensitivity: caseSensitive ? 'case' : 'base' }) === 0;
    }

    return caseSensitive ? s1 === s2 : s1.toLowerCase() === s2.toLowerCase();
  }

  public static equalsIgnoreCase(str1: string | null | undefined, str2: string | null | undefined): boolean {
    return this.equals(str1, str2, { caseSensitive: false });
  }

  public static compare(str1: string, str2: string, options: StringCompareOptions = {}): number {
    const {
      caseSensitive = true,
      locale
    } = options;

    if (locale) {
      return str1.localeCompare(str2, locale, { 
        sensitivity: caseSensitive ? 'case' : 'base',
        numeric: true 
      });
    }

    const s1 = caseSensitive ? str1 : str1.toLowerCase();
    const s2 = caseSensitive ? str2 : str2.toLowerCase();

    return s1 < s2 ? -1 : s1 > s2 ? 1 : 0;
  }

  public static compareNatural(str1: string, str2: string): number {
    const regex = /(\d+)/g;
    const arr1 = str1.split(regex);
    const arr2 = str2.split(regex);

    for (let i = 0; i < Math.min(arr1.length, arr2.length); i++) {
      const part1 = arr1[i];
      const part2 = arr2[i];

      if (!part1 || !part2) continue;
      if (part1 === part2) continue;

      const num1 = parseInt(part1, 10);
      const num2 = parseInt(part2, 10);

      if (!isNaN(num1) && !isNaN(num2)) {
        return num1 - num2;
      }

      return part1.localeCompare(part2);
    }

    return arr1.length - arr2.length;
  }

  public static contains(str: string, searchStr: string, options: StringSearchOptions = {}): boolean {
    const {
      caseSensitive = true,
      wholeWord = false,
      regex = false
    } = options;

    if (regex) {
      const regexPattern = caseSensitive ? new RegExp(searchStr) : new RegExp(searchStr, 'i');
      return regexPattern.test(str);
    }

    if (wholeWord) {
      const pattern = `\\b${this.escapeRegExp(searchStr)}\\b`;
      const regexPattern = caseSensitive ? new RegExp(pattern) : new RegExp(pattern, 'i');
      return regexPattern.test(str);
    }

    return caseSensitive 
      ? str.includes(searchStr)
      : str.toLowerCase().includes(searchStr.toLowerCase());
  }

  public static containsAny(str: string, searchStrs: string[], options?: StringSearchOptions): boolean {
    return searchStrs.some(searchStr => this.contains(str, searchStr, options));
  }

  public static containsAll(str: string, searchStrs: string[], options?: StringSearchOptions): boolean {
    return searchStrs.every(searchStr => this.contains(str, searchStr, options));
  }

  public static startsWith(str: string, prefix: string, options: StringCompareOptions = {}): boolean {
    const { caseSensitive = true } = options;
    
    return caseSensitive
      ? str.startsWith(prefix)
      : str.toLowerCase().startsWith(prefix.toLowerCase());
  }

  public static endsWith(str: string, suffix: string, options: StringCompareOptions = {}): boolean {
    const { caseSensitive = true } = options;
    
    return caseSensitive
      ? str.endsWith(suffix)
      : str.toLowerCase().endsWith(suffix.toLowerCase());
  }

  public static indexOf(str: string, searchStr: string, fromIndex: number = 0, options: StringSearchOptions = {}): number {
    const { caseSensitive = true } = options;

    if (caseSensitive) {
      return str.indexOf(searchStr, fromIndex);
    }

    return str.toLowerCase().indexOf(searchStr.toLowerCase(), fromIndex);
  }

  public static lastIndexOf(str: string, searchStr: string, fromIndex?: number, options: StringSearchOptions = {}): number {
    const { caseSensitive = true } = options;

    if (caseSensitive) {
      return str.lastIndexOf(searchStr, fromIndex);
    }

    return str.toLowerCase().lastIndexOf(searchStr.toLowerCase(), fromIndex);
  }

  public static indexOfAny(str: string, searchStrs: string[], fromIndex: number = 0): number {
    let minIndex = -1;

    for (const searchStr of searchStrs) {
      const index = str.indexOf(searchStr, fromIndex);
      if (index !== -1 && (minIndex === -1 || index < minIndex)) {
        minIndex = index;
      }
    }

    return minIndex;
  }

  public static countOccurrences(str: string, searchStr: string, options: StringSearchOptions = {}): number {
    const { caseSensitive = true } = options;
    
    if (searchStr.length === 0) return 0;

    const source = caseSensitive ? str : str.toLowerCase();
    const search = caseSensitive ? searchStr : searchStr.toLowerCase();
    
    let count = 0;
    let index = 0;

    while ((index = source.indexOf(search, index)) !== -1) {
      count++;
      index += search.length;
    }

    return count;
  }

  public static replace(str: string, searchStr: string | RegExp, replaceStr: string | ((match: string, ...args: any[]) => string)): string {
    return str.replace(searchStr, replaceStr as any);
  }

  public static replaceAll(str: string, searchStr: string, replaceStr: string, options: StringSearchOptions = {}): string {
    const { caseSensitive = true } = options;
    
    const escapedSearch = this.escapeRegExp(searchStr);
    const regex = new RegExp(escapedSearch, caseSensitive ? 'g' : 'gi');
    
    return str.replace(regex, replaceStr);
  }

  public static replaceFirst(str: string, searchStr: string, replaceStr: string, options: StringSearchOptions = {}): string {
    const { caseSensitive = true } = options;
    
    const escapedSearch = this.escapeRegExp(searchStr);
    const regex = new RegExp(escapedSearch, caseSensitive ? '' : 'i');
    
    return str.replace(regex, replaceStr);
  }

  public static replaceLast(str: string, searchStr: string, replaceStr: string, options: StringSearchOptions = {}): string {
    const lastIndex = this.lastIndexOf(str, searchStr, undefined, options);
    
    if (lastIndex === -1) {
      return str;
    }

    return str.substring(0, lastIndex) + replaceStr + str.substring(lastIndex + searchStr.length);
  }

  public static replaceRange(str: string, start: number, end: number, replaceStr: string): string {
    return str.substring(0, start) + replaceStr + str.substring(end);
  }

  public static split(str: string, separator: string | RegExp, options: StringSplitOptions = {}): string[] {
    const {
      limit,
      removeEmpty = false,
      trim = false
    } = options;

    let parts = limit ? str.split(separator, limit) : str.split(separator);

    if (trim) {
      parts = parts.map(part => part.trim());
    }

    if (removeEmpty) {
      parts = parts.filter(part => part.length > 0);
    }

    return parts;
  }

  public static splitLines(str: string, options: StringSplitOptions = {}): string[] {
    return this.split(str, /\r?\n/, options);
  }

  public static splitWords(str: string): string[] {
    return str.match(/\b\w+\b/g) || [];
  }

  public static splitCamelCase(str: string): string[] {
    return str.split(/(?=[A-Z])/).filter(part => part.length > 0);
  }

  public static chunk(str: string, size: number): string[] {
    if (size <= 0) {
      throw new Error('Chunk size must be greater than 0');
    }

    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.substring(i, i + size));
    }

    return chunks;
  }

  public static join(arr: any[], separator: string = ','): string {
    return arr.join(separator);
  }

  public static joinNonEmpty(arr: (string | null | undefined)[], separator: string = ','): string {
    return arr.filter(item => this.isNotEmpty(item)).join(separator);
  }

  public static joinWords(words: string[]): string {
    return words.join(' ');
  }

  public static substring(str: string, start: number, end?: number): string {
    return str.substring(start, end);
  }

  public static substringBefore(str: string, separator: string): string {
    const index = str.indexOf(separator);
    return index === -1 ? str : str.substring(0, index);
  }

  public static substringAfter(str: string, separator: string): string {
    const index = str.indexOf(separator);
    return index === -1 ? '' : str.substring(index + separator.length);
  }

  public static substringBeforeLast(str: string, separator: string): string {
    const index = str.lastIndexOf(separator);
    return index === -1 ? str : str.substring(0, index);
  }

  public static substringAfterLast(str: string, separator: string): string {
    const index = str.lastIndexOf(separator);
    return index === -1 ? '' : str.substring(index + separator.length);
  }

  public static substringBetween(str: string, start: string, end: string): string | null {
    const startIndex = str.indexOf(start);
    if (startIndex === -1) return null;

    const endIndex = str.indexOf(end, startIndex + start.length);
    if (endIndex === -1) return null;

    return str.substring(startIndex + start.length, endIndex);
  }

  public static substringsBetween(str: string, start: string, end: string): string[] {
    const results: string[] = [];
    let searchIndex = 0;

    while (true) {
      const startIndex = str.indexOf(start, searchIndex);
      if (startIndex === -1) break;

      const endIndex = str.indexOf(end, startIndex + start.length);
      if (endIndex === -1) break;

      results.push(str.substring(startIndex + start.length, endIndex));
      searchIndex = endIndex + end.length;
    }

    return results;
  }

  public static reverse(str: string): string {
    return str.split('').reverse().join('');
  }

  public static reverseWords(str: string): string {
    return str.split(/\s+/).reverse().join(' ');
  }

  public static repeat(str: string, count: number, separator: string = ''): string {
    if (count <= 0) return '';
    
    return new Array(count).fill(str).join(separator);
  }

  public static remove(str: string, remove: string): string {
    return this.replaceAll(str, remove, '');
  }

  public static removeStart(str: string, remove: string): string {
    return str.startsWith(remove) ? str.substring(remove.length) : str;
  }

  public static removeEnd(str: string, remove: string): string {
    return str.endsWith(remove) ? str.substring(0, str.length - remove.length) : str;
  }

  public static removeWhitespace(str: string): string {
    return str.replace(/\s+/g, '');
  }

  public static removeNonAlphanumeric(str: string): string {
    return str.replace(/[^a-zA-Z0-9]/g, '');
  }

  public static removeNonNumeric(str: string): string {
    return str.replace(/[^0-9]/g, '');
  }

  public static removeDuplicates(str: string): string {
    return [...new Set(str)].join('');
  }

  public static removeAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  public static escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public static escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return str.replace(/[&<>"']/g, char => htmlEscapes[char] || char);
  }

  public static unescapeHtml(str: string): string {
    const htmlUnescapes: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    };

    return str.replace(/&(amp|lt|gt|quot|#39);/g, match => htmlUnescapes[match] || match);
  }

  public static escapeJson(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\b/g, '\\b')
      .replace(/\f/g, '\\f')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  public static escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  public static escapeCsv(str: string): string {
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  public static escapeSql(str: string): string {
    return str.replace(/'/g, "''");
  }

  public static toBase64(str: string): string {
    return Buffer.from(str, 'utf8').toString('base64');
  }

  public static fromBase64(str: string): string {
    return Buffer.from(str, 'base64').toString('utf8');
  }

  public static toHex(str: string): string {
    return Buffer.from(str, 'utf8').toString('hex');
  }

  public static fromHex(str: string): string {
    return Buffer.from(str, 'hex').toString('utf8');
  }

  public static toUrlEncoded(str: string): string {
    return encodeURIComponent(str);
  }

  public static fromUrlEncoded(str: string): string {
    return decodeURIComponent(str);
  }

  public static toUtf8Bytes(str: string): Uint8Array {
    return new TextEncoder().encode(str);
  }

  public static fromUtf8Bytes(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
  }

  public static md5(str: string): string {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex');
  }

  public static sha1(str: string): string {
    return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
  }

  public static sha256(str: string): string {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
  }

  public static sha512(str: string): string {
    return crypto.createHash('sha512').update(str, 'utf8').digest('hex');
  }

  public static hash(str: string, algorithm: string): string {
    return crypto.createHash(algorithm).update(str, 'utf8').digest('hex');
  }

  public static random(length: number, options: {
    uppercase?: boolean;
    lowercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
    exclude?: string;
  } = {}): string {
    const {
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = false,
      exclude = ''
    } = options;

    let chars = '';
    if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (numbers) chars += '0123456789';
    if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (exclude) {
      chars = chars.split('').filter(char => !exclude.includes(char)).join('');
    }

    if (chars.length === 0) {
      throw new Error('No characters available for random string generation');
    }

    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }

    return result;
  }

  public static randomAlpha(length: number): string {
    return this.random(length, { numbers: false });
  }

  public static randomAlphanumeric(length: number): string {
    return this.random(length, { symbols: false });
  }

  public static randomNumeric(length: number): string {
    return this.random(length, { uppercase: false, lowercase: false });
  }

  public static uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  public static isAlpha(str: string): boolean {
    return /^[a-zA-Z]+$/.test(str);
  }

  public static isAlphanumeric(str: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(str);
  }

  public static isNumeric(str: string): boolean {
    return /^[0-9]+$/.test(str);
  }

  public static isEmail(str: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
  }

  public static isUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  public static isIPv4(str: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(str);
  }

  public static isIPv6(str: string): boolean {
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return ipv6Regex.test(str);
  }

  public static isJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  public static isBase64(str: string): boolean {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(str) && str.length % 4 === 0;
  }

  public static isHex(str: string): boolean {
    return /^[0-9a-fA-F]+$/.test(str);
  }

  public static isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  public static format(template: string, ...args: any[]): string {
    return template.replace(/{(\d+)}/g, (match, index) => {
      const argIndex = parseInt(index, 10);
      return typeof args[argIndex] !== 'undefined' ? String(args[argIndex]) : match;
    });
  }

  public static formatNamed(template: string, params: Record<string, any>): string {
    return template.replace(/{(\w+)}/g, (match, key) => {
      return typeof params[key] !== 'undefined' ? String(params[key]) : match;
    });
  }

  public static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const sizeLabel = i >= 0 && i < sizes.length ? sizes[i] : 'YB';

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizeLabel;
  }

  public static formatNumber(num: number, options: {
    decimals?: number;
    thousandsSeparator?: string;
    decimalSeparator?: string;
  } = {}): string {
    const {
      decimals = 0,
      thousandsSeparator = ',',
      decimalSeparator = '.'
    } = options;

    const parts = num.toFixed(decimals).split('.');
    if (parts.length > 0 && parts[0]) {
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
    }

    return parts.join(decimalSeparator);
  }

  public static formatCurrency(amount: number, currency: string = 'USD', locale: string = 'en-US'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  public static formatDate(date: Date, format: string): string {
    const pad = (n: number): string => n < 10 ? '0' + n : String(n);

    const replacements: Record<string, string> = {
      'YYYY': String(date.getFullYear()),
      'YY': String(date.getFullYear()).slice(-2),
      'MM': pad(date.getMonth() + 1),
      'M': String(date.getMonth() + 1),
      'DD': pad(date.getDate()),
      'D': String(date.getDate()),
      'HH': pad(date.getHours()),
      'H': String(date.getHours()),
      'mm': pad(date.getMinutes()),
      'm': String(date.getMinutes()),
      'ss': pad(date.getSeconds()),
      's': String(date.getSeconds()),
      'SSS': pad(date.getMilliseconds()),
      'SS': String(Math.floor(date.getMilliseconds() / 10)),
      'S': String(Math.floor(date.getMilliseconds() / 100))
    };

    let result = format;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(key, 'g'), value);
    }

    return result;
  }

  public static wordCount(str: string): number {
    return this.splitWords(str).length;
  }

  public static charCount(str: string, includeSpaces: boolean = true): number {
    return includeSpaces ? str.length : str.replace(/\s/g, '').length;
  }

  public static lineCount(str: string): number {
    return str.split(/\r?\n/).length;
  }

  public static sentenceCount(str: string): number {
    const sentences = str.match(/[.!?]+/g);
    return sentences ? sentences.length : 0;
  }

  public static getMostFrequentWords(str: string, limit: number = 10): Array<{ word: string; count: number }> {
    const words = this.splitWords(str.toLowerCase());
    const frequency = new Map<string, number>();

    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  public static levenshteinDistance(str1: string, str2: string, options: LevenshteinOptions = {}): number {
    const {
      insertCost = 1,
      deleteCost = 1,
      replaceCost = 1
    } = options;

    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n * insertCost;
    if (n === 0) return m * deleteCost;

    const dpMap = new Map<string, number>();
    
    const getDp = (i: number, j: number): number => {
      return dpMap.get(`${i},${j}`) ?? 0;
    };
    
    const setDp = (i: number, j: number, value: number): void => {
      dpMap.set(`${i},${j}`, value);
    };
    
    for (let i = 0; i <= m; i++) {
      setDp(i, 0, i * deleteCost);
    }
    
    for (let j = 0; j <= n; j++) {
      setDp(0, j, j * insertCost);
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
          setDp(i, j, getDp(i - 1, j - 1));
        } else {
          setDp(i, j, Math.min(
            getDp(i - 1, j) + deleteCost,
            getDp(i, j - 1) + insertCost,
            getDp(i - 1, j - 1) + replaceCost
          ));
        }
      }
    }

    return getDp(m, n);
  }

  public static hammingDistance(str1: string, str2: string): number {
    if (str1.length !== str2.length) {
      throw new Error('Strings must be of equal length for Hamming distance');
    }

    let distance = 0;
    for (let i = 0; i < str1.length; i++) {
      if (str1[i] !== str2[i]) {
        distance++;
      }
    }

    return distance;
  }

  public static jaccardSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1);
    const set2 = new Set(str2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size === 0 ? 1 : intersection.size / union.size;
  }

  public static cosineSimilarity(str1: string, str2: string): number {
    const freq1 = this.getCharFrequency(str1);
    const freq2 = this.getCharFrequency(str2);

    const chars = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (const char of chars) {
      const f1 = freq1[char] || 0;
      const f2 = freq2[char] || 0;

      dotProduct += f1 * f2;
      magnitude1 += f1 * f1;
      magnitude2 += f2 * f2;
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    return magnitude1 === 0 || magnitude2 === 0 ? 0 : dotProduct / (magnitude1 * magnitude2);
  }

  private static getCharFrequency(str: string): Record<string, number> {
    const frequency: Record<string, number> = {};

    for (const char of str) {
      frequency[char] = (frequency[char] || 0) + 1;
    }

    return frequency;
  }

  public static wrap(str: string, width: number, options: {
    indent?: string;
    newline?: string;
    cut?: boolean;
  } = {}): string {
    const {
      indent = '',
      newline = '\n',
      cut = false
    } = options;

    if (width <= 0) {
      throw new Error('Width must be greater than 0');
    }

    const lines: string[] = [];
    const paragraphs = str.split(/\r?\n/);

    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        lines.push('');
        continue;
      }

      const words = paragraph.split(/\s+/);
      let currentLine = indent;

      for (const word of words) {
        if (word.length > width && cut) {
          if (currentLine.length > indent.length) {
            lines.push(currentLine.trim());
            currentLine = indent;
          }

          for (let i = 0; i < word.length; i += width) {
            lines.push(indent + word.substring(i, i + width));
          }
          currentLine = indent;
        } else if (currentLine.length + word.length + 1 > width) {
          if (currentLine.length > indent.length) {
            lines.push(currentLine.trim());
          }
          currentLine = indent + word;
        } else {
          if (currentLine.length > indent.length) {
            currentLine += ' ';
          }
          currentLine += word;
        }
      }

      if (currentLine.length > indent.length) {
        lines.push(currentLine.trim());
      }
    }

    return lines.join(newline);
  }

  public static unwrap(str: string): string {
    return str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  public static truncate(str: string, length: number, options: {
    ellipsis?: string;
    position?: 'end' | 'middle' | 'start';
    wordBoundary?: boolean;
  } = {}): string {
    const {
      ellipsis = '...',
      position = 'end',
      wordBoundary = false
    } = options;

    if (str.length <= length) {
      return str;
    }

    const availableLength = length - ellipsis.length;
    if (availableLength <= 0) {
      return ellipsis.substring(0, length);
    }

    let truncated: string;

    switch (position) {
      case 'start':
        truncated = ellipsis + str.substring(str.length - availableLength);
        break;

      case 'middle':
        const startLength = Math.floor(availableLength / 2);
        const endLength = availableLength - startLength;
        truncated = str.substring(0, startLength) + ellipsis + 
                   str.substring(str.length - endLength);
        break;

      case 'end':
      default:
        truncated = str.substring(0, availableLength);
        if (wordBoundary) {
          const lastSpace = truncated.lastIndexOf(' ');
          if (lastSpace > 0) {
            truncated = truncated.substring(0, lastSpace);
          }
        }
        truncated += ellipsis;
        break;
    }

    return truncated;
  }

  public static highlight(str: string, search: string, options: {
    caseSensitive?: boolean;
    highlightStart?: string;
    highlightEnd?: string;
  } = {}): string {
    const {
      caseSensitive = false,
      highlightStart = '<mark>',
      highlightEnd = '</mark>'
    } = options;

    if (!search) return str;

    const escapedSearch = this.escapeRegExp(search);
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(`(${escapedSearch})`, flags);

    return str.replace(regex, `${highlightStart}$1${highlightEnd}`);
  }

  public static slugify(str: string, options: {
    separator?: string;
    lowercase?: boolean;
    strict?: boolean;
  } = {}): string {
    const {
      separator = '-',
      lowercase = true,
      strict = false
    } = options;

    let slug = str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (strict) {
      slug = slug.replace(/[^a-zA-Z0-9\s-]/g, '');
    } else {
      slug = slug.replace(/[^\w\s-]/g, '');
    }

    slug = slug
      .trim()
      .replace(/\s+/g, separator)
      .replace(new RegExp(`${this.escapeRegExp(separator)}+`, 'g'), separator);

    return lowercase ? slug.toLowerCase() : slug;
  }

  public static interpolate(template: string, data: any, options: {
    startDelimiter?: string;
    endDelimiter?: string;
    escapeFn?: (value: any) => string;
  } = {}): string {
    const {
      startDelimiter = '{{',
      endDelimiter = '}}',
      escapeFn = String
    } = options;

    const startEscaped = this.escapeRegExp(startDelimiter);
    const endEscaped = this.escapeRegExp(endDelimiter);
    const regex = new RegExp(`${startEscaped}\\s*([\\w.\\[\\]]+)\\s*${endEscaped}`, 'g');

    return template.replace(regex, (match, path) => {
      const value = this.getNestedValue(data, path);
      return value !== undefined ? escapeFn(value) : match;
    });
  }

  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch && arrayMatch.length >= 3) {
        const arrayKey = arrayMatch[1];
        const indexStr = arrayMatch[2];
        if (arrayKey && indexStr && current[arrayKey]) {
          const arr = current[arrayKey];
          const index = parseInt(indexStr, 10);
          return Array.isArray(arr) ? arr[index] : undefined;
        }
        return undefined;
      }

      return current[key];
    }, obj);
  }

  public static diffChars(str1: string, str2: string): Array<{
    type: 'add' | 'remove' | 'equal';
    value: string;
  }> {
    const result: Array<{ type: 'add' | 'remove' | 'equal'; value: string }> = [];
    
    const dpMap = new Map<string, number>();
    
    const getDp = (i: number, j: number): number => {
      return dpMap.get(`${i},${j}`) ?? 0;
    };
    
    const setDp = (i: number, j: number, value: number): void => {
      dpMap.set(`${i},${j}`, value);
    };
    
    for (let i = 0; i <= str1.length; i++) {
      setDp(i, 0, 0);
    }
    
    for (let j = 0; j <= str2.length; j++) {
      setDp(0, j, 0);
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
          setDp(i, j, getDp(i - 1, j - 1) + 1);
        } else {
          setDp(i, j, Math.max(getDp(i - 1, j), getDp(i, j - 1)));
        }
      }
    }

    let i = str1.length;
    let j = str2.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && str1.charAt(i - 1) === str2.charAt(j - 1)) {
        result.unshift({ type: 'equal', value: str1.charAt(i - 1) });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || getDp(i, j - 1) >= getDp(i - 1, j))) {
        result.unshift({ type: 'add', value: str2.charAt(j - 1) });
        j--;
      } else if (i > 0) {
        result.unshift({ type: 'remove', value: str1.charAt(i - 1) });
        i--;
      }
    }

    const merged: typeof result = [];
    let current = result[0];

    if (current) {
      for (let k = 1; k < result.length; k++) {
        const next = result[k];
        if (next && next.type === current.type) {
          current.value += next.value;
        } else if (next) {
          merged.push(current);
          current = { ...next };
        }
      }
      merged.push(current);
    }

    return merged;
  }

  public static diffWords(str1: string, str2: string): Array<{
    type: 'add' | 'remove' | 'equal';
    value: string;
  }> {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const diffResult = this.diffArray(words1, words2);

    return diffResult.map(item => ({
      type: item.type,
      value: item.values.join(' ')
    }));
  }

  private static diffArray<T>(arr1: T[], arr2: T[]): Array<{
    type: 'add' | 'remove' | 'equal';
    values: T[];
  }> {
    const result: Array<{ type: 'add' | 'remove' | 'equal'; values: T[] }> = [];
    
    const dpMap = new Map<string, number>();
    
    const getDp = (i: number, j: number): number => {
      return dpMap.get(`${i},${j}`) ?? 0;
    };
    
    const setDp = (i: number, j: number, value: number): void => {
      dpMap.set(`${i},${j}`, value);
    };
    
    for (let i = 0; i <= arr1.length; i++) {
      setDp(i, 0, 0);
    }
    
    for (let j = 0; j <= arr2.length; j++) {
      setDp(0, j, 0);
    }

    for (let i = 1; i <= arr1.length; i++) {
      for (let j = 1; j <= arr2.length; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          setDp(i, j, getDp(i - 1, j - 1) + 1);
        } else {
          setDp(i, j, Math.max(getDp(i - 1, j), getDp(i, j - 1)));
        }
      }
    }

    let i = arr1.length;
    let j = arr2.length;
    let currentType: 'add' | 'remove' | 'equal' | null = null;
    let currentValues: T[] = [];

    const addToResult = () => {
      if (currentType && currentValues.length > 0) {
        result.unshift({ type: currentType, values: [...currentValues] });
        currentValues = [];
      }
    };

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && arr1[i - 1] === arr2[j - 1]) {
        if (currentType !== 'equal') {
          addToResult();
          currentType = 'equal';
        }
        const value1 = arr1[i - 1];
        if (value1 !== undefined) {
          currentValues.unshift(value1);
        }
        i--;
        j--;
      } else if (j > 0 && (i === 0 || getDp(i, j - 1) >= getDp(i - 1, j))) {
        if (currentType !== 'add') {
          addToResult();
          currentType = 'add';
        }
        const value2 = arr2[j - 1];
        if (value2 !== undefined) {
          currentValues.unshift(value2);
        }
        j--;
      } else if (i > 0) {
        if (currentType !== 'remove') {
          addToResult();
          currentType = 'remove';
        }
        const value1 = arr1[i - 1];
        if (value1 !== undefined) {
          currentValues.unshift(value1);
        }
        i--;
      }
    }

    addToResult();
    return result;
  }
}
