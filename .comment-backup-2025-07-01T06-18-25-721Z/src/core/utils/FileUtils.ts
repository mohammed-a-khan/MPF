/**
 * CS Test Automation Framework - File Utilities
 * 
 * Comprehensive file operations with async/sync methods, streaming,
 * watching, and advanced file manipulation capabilities
 * 
 * FULL PRODUCTION IMPLEMENTATION - NO EXTERNAL DEPENDENCIES
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as readline from 'readline';
import { Readable, Writable, Transform, pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

export interface FileStats {
  [key: string]: any; // Allow additional properties
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
  mode: number;
  uid: number;
  gid: number;
}

export interface CopyOptions {
  [key: string]: any; // Allow additional properties
  overwrite?: boolean;
  preserveTimestamps?: boolean;
  filter?: (src: string, dest: string) => boolean | Promise<boolean>;
  dereference?: boolean;
  errorOnExist?: boolean;
  recursive?: boolean;
}

export interface WalkOptions {
  [key: string]: any; // Allow additional properties
  maxDepth?: number;
  followSymlinks?: boolean;
  filter?: (path: string, stats: FileStats) => boolean;
  exclude?: string | RegExp | Array<string | RegExp>;
}

export interface WatchOptions {
  [key: string]: any; // Allow additional properties
  persistent?: boolean;
  recursive?: boolean;
  encoding?: BufferEncoding;
  signal?: AbortSignal;
  delay?: number;
}

export interface CompareOptions {
  [key: string]: any; // Allow additional properties
  checksum?: boolean;
  metadata?: boolean;
  content?: boolean;
}

export interface TarHeader {
  [key: string]: any; // Allow additional properties
  name: string;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  mtime: number;
  checksum: number;
  type: string;
  linkname: string;
  magic: string;
  version: string;
  uname: string;
  gname: string;
  devmajor: number;
  devminor: number;
  prefix: string;
}

export class FileUtils {
  // File existence checks
  public static async exists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  public static existsSync(filePath: string): boolean {
    try {
      fs.accessSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Read operations
  public static async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    return encoding
      ? await fsp.readFile(filePath, encoding)
      : await fsp.readFile(filePath);
  }

  public static readFileSync(filePath: string, encoding?: BufferEncoding): string | Buffer {
    return encoding
      ? fs.readFileSync(filePath, encoding)
      : fs.readFileSync(filePath);
  }

  public static async readJSON<T = any>(filePath: string): Promise<T> {
    const content = await this.readFile(filePath, 'utf8');
    try {
      return JSON.parse(content as string) as T;
    } catch (error: any) {
      throw new Error(`Failed to parse JSON from ${filePath}: ${error.message}`);
    }
  }

  public static readJSONSync<T = any>(filePath: string): T {
    const content = this.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(content as string) as T;
    } catch (error: any) {
      throw new Error(`Failed to parse JSON from ${filePath}: ${error.message}`);
    }
  }

  public static async readLines(filePath: string): Promise<string[]> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const lines: string[] = [];
    for await (const line of rl) {
      lines.push(line);
    }

    return lines;
  }

  public static async *readLinesStream(filePath: string): AsyncGenerator<string> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      yield line;
    }
  }

  // Write operations
  public static async writeFile(
    filePath: string,
    data: string | Buffer | Uint8Array,
    options?: fs.WriteFileOptions
  ): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    await fsp.writeFile(filePath, data, options);
  }

  public static writeFileSync(
    filePath: string,
    data: string | Buffer | Uint8Array,
    options?: fs.WriteFileOptions
  ): void {
    this.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, data, options);
  }

  public static async writeJSON(
    filePath: string,
    data: any,
    indent: number = 2
  ): Promise<void> {
    const json = JSON.stringify(data, null, indent);
    await this.writeFile(filePath, json, 'utf8');
  }

  public static writeJSONSync(
    filePath: string,
    data: any,
    indent: number = 2
  ): void {
    const json = JSON.stringify(data, null, indent);
    this.writeFileSync(filePath, json, 'utf8');
  }

  public static async appendFile(
    filePath: string,
    data: string | Buffer,
    options?: fs.WriteFileOptions
  ): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    await fsp.appendFile(filePath, data, options);
  }

  public static appendFileSync(
    filePath: string,
    data: string | Buffer,
    options?: fs.WriteFileOptions
  ): void {
    this.ensureDirSync(path.dirname(filePath));
    fs.appendFileSync(filePath, data, options);
  }

  // Directory operations
  public static async createDir(dirPath: string): Promise<void> {
    await fsp.mkdir(dirPath, { recursive: true });
  }

  public static createDirSync(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  public static async ensureDir(dirPath: string): Promise<void> {
    if (!await this.exists(dirPath)) {
      await this.createDir(dirPath);
    }
  }

  public static ensureDirSync(dirPath: string): void {
    if (!this.existsSync(dirPath)) {
      this.createDirSync(dirPath);
    }
  }

  public static async readDir(dirPath: string): Promise<string[]> {
    return await fsp.readdir(dirPath);
  }

  public static readDirSync(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }

  public static async readDirWithStats(dirPath: string): Promise<Array<{ name: string; stats: FileStats }>> {
    const entries = await fsp.readdir(dirPath);
    const results = await Promise.all(
      entries.map(async (name) => ({
        name,
        stats: await this.getStats(path.join(dirPath, name))
      }))
    );
    return results;
  }

  // Copy operations
  public static async copy(src: string, dest: string, options: CopyOptions = {}): Promise<void> {
    const {
      overwrite = true,
      filter,
      dereference = false,
      errorOnExist = false,
      recursive = true
    } = options;

    // Check filter
    if (filter && !await filter(src, dest)) {
      return;
    }

    const srcStats = await this.getStats(src, { followSymlinks: dereference });

    // Handle existing destination
    if (await this.exists(dest)) {
      if (errorOnExist) {
        throw new Error(`Destination already exists: ${dest}`);
      }
      if (!overwrite) {
        return;
      }
    }

    if (srcStats.isDirectory) {
      if (!recursive) {
        throw new Error(`Cannot copy directory without recursive option: ${src}`);
      }
      await this.copyDir(src, dest, options);
    } else if (srcStats.isFile) {
      await this.copyFile(src, dest, options);
    } else if (srcStats.isSymbolicLink && !dereference) {
      await this.copySymlink(src, dest);
    }
  }

  private static async copyFile(src: string, dest: string, options: CopyOptions): Promise<void> {
    await this.ensureDir(path.dirname(dest));

    // Use streams for large files
    const srcStats = await fsp.stat(src);
    if (srcStats.size > 64 * 1024 * 1024) { // 64MB
      await this.copyFileStream(src, dest);
    } else {
      await fsp.copyFile(src, dest);
    }

    if (options.preserveTimestamps) {
      await fsp.utimes(dest, srcStats.atime, srcStats.mtime);
    }
  }

  private static async copyFileStream(src: string, dest: string): Promise<void> {
    const readStream = fs.createReadStream(src);
    const writeStream = fs.createWriteStream(dest);

    return new Promise((resolve, reject) => {
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      readStream.pipe(writeStream);
    });
  }

  public static async copyDir(src: string, dest: string, options: CopyOptions): Promise<void> {
    await this.ensureDir(dest);

    const entries = await fsp.readdir(src);
    await Promise.all(
      entries.map(entry =>
        this.copy(
          path.join(src, entry),
          path.join(dest, entry),
          options
        )
      )
    );

    if (options.preserveTimestamps) {
      const srcStats = await fsp.stat(src);
      await fsp.utimes(dest, srcStats.atime, srcStats.mtime);
    }
  }

  private static async copySymlink(src: string, dest: string): Promise<void> {
    const linkTarget = await fsp.readlink(src);
    await this.ensureDir(path.dirname(dest));
    await fsp.symlink(linkTarget, dest);
  }

  // Move operations
  public static async move(src: string, dest: string, options: { overwrite?: boolean } = {}): Promise<void> {
    const { overwrite = true } = options;

    if (await this.exists(dest)) {
      if (!overwrite) {
        throw new Error(`Destination already exists: ${dest}`);
      }
      await this.remove(dest);
    }

    await this.ensureDir(path.dirname(dest));

    try {
      // Try rename first (fastest)
      await fsp.rename(src, dest);
    } catch (error: any) {
      // If rename fails (e.g, across devices), copy then delete
      if (error.code === 'EXDEV') {
        await this.copy(src, dest);
        await this.remove(src);
      } else {
        throw error;
      }
    }
  }

  // Delete operations
  public static async remove(pathToRemove: string): Promise<void> {
    if (!await this.exists(pathToRemove)) {
      return;
    }

    const stats = await this.getStats(pathToRemove);
    if (stats.isDirectory) {
      await fsp.rm(pathToRemove, { recursive: true, force: true });
    } else {
      await fsp.unlink(pathToRemove);
    }
  }

  public static removeSync(pathToRemove: string): void {
    if (!this.existsSync(pathToRemove)) {
      return;
    }

    const stats = this.getStatsSync(pathToRemove);
    if (stats.isDirectory) {
      fs.rmSync(pathToRemove, { recursive: true, force: true });
    } else {
      fs.unlinkSync(pathToRemove);
    }
  }

  public static async emptyDir(dirPath: string): Promise<void> {
    if (!await this.exists(dirPath)) {
      await this.createDir(dirPath);
      return;
    }

    const entries = await fsp.readdir(dirPath);
    await Promise.all(
      entries.map(entry => this.remove(path.join(dirPath, entry)))
    );
  }

  // Stats operations
  public static async getStats(filePath: string, options?: { followSymlinks?: boolean }): Promise<FileStats> {
    const stats = options?.followSymlinks
      ? await fsp.stat(filePath)
      : await fsp.lstat(filePath);

    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      accessedAt: stats.atime,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid
    };
  }

  public static getStatsSync(filePath: string, options?: { followSymlinks?: boolean }): FileStats {
    const stats = options?.followSymlinks
      ? fs.statSync(filePath)
      : fs.lstatSync(filePath);

    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      accessedAt: stats.atime,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid
    };
  }

  // File comparison
  public static async compare(file1: string, file2: string, options: CompareOptions = {}): Promise<boolean> {
    const {
      checksum = true,
      metadata = false,
      content = true
    } = options;

    // Check existence
    const [exists1, exists2] = await Promise.all([
      this.exists(file1),
      this.exists(file2)
    ]);

    if (!exists1 || !exists2) {
      return false;
    }

    // Check stats
    const [stats1, stats2] = await Promise.all([
      this.getStats(file1),
      this.getStats(file2)
    ]);

    // Quick size check
    if (stats1.size !== stats2.size) {
      return false;
    }

    // Metadata comparison
    if (metadata) {
      if (stats1.mode !== stats2.mode ||
          stats1.uid !== stats2.uid ||
          stats1.gid !== stats2.gid) {
        return false;
      }
    }

    // Content comparison
    if (content) {
      if (checksum) {
        const [hash1, hash2] = await Promise.all([
          this.getChecksum(file1),
          this.getChecksum(file2)
        ]);
        return hash1 === hash2;
      } else {
        return await this.compareContent(file1, file2);
      }
    }

    return true;
  }

  private static async compareContent(file1: string, file2: string): Promise<boolean> {
    const stream1 = fs.createReadStream(file1);
    const stream2 = fs.createReadStream(file2);

    return new Promise((resolve, reject) => {
      let isDifferent = false;

      stream1.on('error', reject);
      stream2.on('error', reject);

      stream1.on('data', (chunk1: string | Buffer) => {
        const chunk1Buffer = typeof chunk1 === 'string' ? Buffer.from(chunk1) : chunk1;
        const chunk2 = stream2.read(chunk1Buffer.length);
        if (!chunk2 || !chunk1Buffer.equals(chunk2)) {
          isDifferent = true;
          stream1.destroy();
          stream2.destroy();
          resolve(false);
        }
      });

      stream1.on('end', () => {
        stream2.on('readable', () => {
          if (stream2.read() !== null) {
            isDifferent = true;
            resolve(false);
          }
        });

        stream2.on('end', () => {
          resolve(!isDifferent);
        });
      });

      stream2.resume();
    });
  }

  // Checksum operations
  public static async getChecksum(filePath: string, algorithm: string = 'sha256'): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  public static async verifyChecksum(
    filePath: string,
    expectedChecksum: string,
    algorithm: string = 'sha256'
  ): Promise<boolean> {
    const actualChecksum = await this.getChecksum(filePath, algorithm);
    return actualChecksum === expectedChecksum;
  }

  // Walk directory tree
  public static async *walk(
    dirPath: string,
    options: WalkOptions = {}
  ): AsyncGenerator<{
    path: string;
    stats: FileStats;
    depth: number;
  }> {
    const {
      maxDepth = Infinity,
      followSymlinks = false,
      filter,
      exclude = []
    } = options;

    async function* walkRecursive(currentPath: string, depth: number): AsyncGenerator<any> {
      if (depth > maxDepth) return;

      const entries = await fsp.readdir(currentPath);

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry);

        // Check exclusions
        if (Array.isArray(exclude)) {
          const shouldExclude = exclude.some(pattern => {
            if (typeof pattern === 'string') {
              return fullPath.includes(pattern);
            } else if (pattern instanceof RegExp) {
              return pattern.test(fullPath);
            }
            return false;
          });
          if (shouldExclude) continue;
        } else if (exclude) {
          const excludePattern = exclude as string | RegExp;
          if (typeof excludePattern === 'string') {
            if (fullPath.includes(excludePattern)) continue;
          } else if (excludePattern instanceof RegExp) {
            if (excludePattern.test(fullPath)) continue;
          }
        }

        try {
          const stats = await FileUtils.getStats(fullPath, { followSymlinks });

          // Apply filter
          if (filter && !filter(fullPath, stats)) {
            continue;
          }

          yield { path: fullPath, stats, depth };

          // Recurse into directories
          if (stats.isDirectory) {
            yield* walkRecursive(fullPath, depth + 1);
          }
        } catch (error: any) {
          // Skip inaccessible files
          console.warn(`Cannot access ${fullPath}: ${error.message}`);
        }
      }
    }

    yield* walkRecursive(dirPath, 0);
  }

  // Find files
  public static async find(
    dirPath: string,
    pattern: string | RegExp,
    options: WalkOptions = {}
  ): Promise<string[]> {
    const matches: string[] = [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for await (const { path: filePath, stats } of this.walk(dirPath, options)) {
      if (stats.isFile && regex.test(filePath)) {
        matches.push(filePath);
      }
    }

    return matches;
  }

  // Watch operations
  public static watch(
    pathToWatch: string,
    callback: (event: 'add' | 'change' | 'delete', filePath: string) => void,
    options: WatchOptions = {}
  ): fs.FSWatcher {
    const {
      persistent = true,
      recursive = false,
      encoding = 'utf8',
      delay = 100
    } = options;

    const watcher = fs.watch(pathToWatch, {
      persistent,
      recursive,
      encoding: encoding as BufferEncoding
    });

    const timeouts = new Map<string, NodeJS.Timeout>();

    watcher.on('change', (eventType, filename) => {
      if (!filename) return;

      const fullPath = path.join(pathToWatch, filename as string);

      // Debounce events
      if (timeouts.has(fullPath)) {
        clearTimeout(timeouts.get(fullPath)!);
      }

      timeouts.set(fullPath, setTimeout(() => {
        timeouts.delete(fullPath);

        // Determine actual event
        fs.access(fullPath, (err) => {
          if (err) {
            callback('delete', fullPath);
          } else {
            callback(eventType === 'rename' ? 'add' : 'change', fullPath);
          }
        });
      }, delay));
    });

    return watcher;
  }

  // Compression operations
  public static async compress(
    source: string,
    destination: string,
    options: { level?: number; format?: 'gzip' | 'deflate' | 'brotli' } = {}
  ): Promise<void> {
    const { level = 6, format = 'gzip' } = options;

    let compressor: Transform;
    switch (format) {
      case 'gzip':
        compressor = zlib.createGzip({ level });
        break;
      case 'deflate':
        compressor = zlib.createDeflate({ level });
        break;
      case 'brotli':
        compressor = zlib.createBrotliCompress({
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: level }
        });
        break;
    }

    const source$ = fs.createReadStream(source);
    const destination$ = fs.createWriteStream(destination);

    await pipelineAsync(source$, compressor, destination$);
  }

  public static async decompress(
    source: string,
    destination: string,
    options: { format?: 'gzip' | 'deflate' | 'brotli' | 'auto' } = {}
  ): Promise<void> {
    const { format = 'auto' } = options;

    let decompressor: Transform;

    if (format === 'auto') {
      // Detect format from file extension
      const ext = path.extname(source).toLowerCase();
      switch (ext) {
        case '.gz':
        case '.gzip':
          decompressor = zlib.createGunzip();
          break;
        case '.deflate':
          decompressor = zlib.createInflate();
          break;
        case '.br':
        case '.brotli':
          decompressor = zlib.createBrotliDecompress();
          break;
        default:
          throw new Error(`Cannot detect compression format from extension: ${ext}`);
      }
    } else {
      switch (format) {
        case 'gzip':
          decompressor = zlib.createGunzip();
          break;
        case 'deflate':
          decompressor = zlib.createInflate();
          break;
        case 'brotli':
          decompressor = zlib.createBrotliDecompress();
          break;
        default:
          throw new Error(`Unsupported compression format: ${format}`);
      }
    }

    const source$ = fs.createReadStream(source);
    const destination$ = fs.createWriteStream(destination);

    await pipelineAsync(source$, decompressor, destination$);
  }

  // TAR Archive operations - FULL IMPLEMENTATION
  public static async createTarArchive(
    sourceDir: string,
    archivePath: string,
    options: { compress?: boolean; format?: 'tar' | 'tar.gz' } = {}
  ): Promise<void> {
    const { compress = false, format = compress ? 'tar.gz' : 'tar' } = options;

    // Create TAR file
    const tarPath = format === 'tar.gz' ? archivePath.replace(/\.gz$/, '') : archivePath;
    const output = fs.createWriteStream(tarPath);

    // Collect all files
    const files: Array<{ path: string; stats: FileStats; relativePath: string }> = [];
    
    for await (const { path: filePath, stats } of this.walk(sourceDir)) {
      if (stats.isFile) {
        files.push({
          path: filePath,
          stats,
          relativePath: path.relative(sourceDir, filePath).replace(/\\/g, '/')
        });
      }
    }

    // Write TAR archive
    for (const file of files) {
      await this.writeTarEntry(output, file.path, file.relativePath, file.stats);
    }

    // Write end-of-archive marker (two 512-byte blocks of zeros)
    const endMarker = Buffer.alloc(1024);
    output.write(endMarker);
    
    await new Promise<void>((resolve, reject) => {
      output.on('finish', () => resolve());
      output.on('error', reject);
      output.end();
    });

    // Compress if requested
    if (compress || format === 'tar.gz') {
      await this.compress(tarPath, archivePath, { format: 'gzip' });
      await this.remove(tarPath);
    }
  }

  private static async writeTarEntry(
    output: fs.WriteStream,
    filePath: string,
    entryName: string,
    stats: FileStats
  ): Promise<void> {
    // Create TAR header (512 bytes)
    const header = Buffer.alloc(512);
    
    // name (100 bytes)
    header.write(entryName.slice(0, 100), 0, 100);
    
    // mode (8 bytes)
    header.write(this.padOctal(stats.mode & 0o7777, 8), 100, 8);
    
    // uid (8 bytes)
    header.write(this.padOctal(stats.uid, 8), 108, 8);
    
    // gid (8 bytes)
    header.write(this.padOctal(stats.gid, 8), 116, 8);
    
    // size (12 bytes)
    header.write(this.padOctal(stats.size, 12), 124, 12);
    
    // mtime (12 bytes)
    header.write(this.padOctal(Math.floor(stats.modifiedAt.getTime() / 1000), 12), 136, 12);
    
    // checksum placeholder (8 bytes)
    header.write('        ', 148, 8);
    
    // typeflag (1 byte) - '0' for regular file
    header.write('0', 156, 1);
    
    // linkname (100 bytes) - empty for regular files
    
    // magic (6 bytes)
    header.write('ustar', 257, 5);
    
    // version (2 bytes)
    header.write('00', 263, 2);
    
    // uname (32 bytes)
    header.write('root', 265, 32);
    
    // gname (32 bytes)
    header.write('root', 297, 32);
    
    // devmajor (8 bytes)
    header.write(this.padOctal(0, 8), 329, 8);
    
    // devminor (8 bytes)
    header.write(this.padOctal(0, 8), 337, 8);
    
    // prefix (155 bytes) - for long filenames
    if (entryName.length > 100) {
      const prefix = entryName.slice(0, 155);
      header.write(prefix, 345, 155);
    }
    
    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      const byte = header[i];
      if (byte !== undefined) {
        checksum += byte;
      }
    }
    
    // Write checksum
    header.write(this.padOctal(checksum, 7) + '\0', 148, 8);
    
    // Write header
    output.write(header);
    
    // Write file content
    const fileContent = await this.readFile(filePath);
    output.write(fileContent);
    
    // Pad to 512-byte boundary
    const padding = 512 - (stats.size % 512);
    if (padding < 512) {
      output.write(Buffer.alloc(padding));
    }
  }

  private static padOctal(num: number, length: number): string {
    return num.toString(8).padStart(length - 1, '0') + ' ';
  }

  public static async extractTarArchive(
    archivePath: string,
    destinationDir: string,
    options: { decompress?: boolean } = {}
  ): Promise<void> {
    const { decompress = archivePath.endsWith('.gz') } = options;

    let tarPath = archivePath;
    
    // Decompress if needed
    if (decompress) {
      tarPath = archivePath.replace(/\.gz$/, '');
      await this.decompress(archivePath, tarPath);
    }

    // Read TAR file
    const tarContent = await this.readFile(tarPath);
    if (typeof tarContent === 'string') {
      throw new Error('TAR content must be a Buffer');
    }
    
    let offset = 0;

    while (offset < tarContent.length - 1024) {
      // Read header
      const header = tarContent.slice(offset, offset + 512);
      
      // Check for end-of-archive
      if (header.every((byte: number) => byte === 0)) {
        break;
      }

      // Parse header
      const name = this.parseString(header, 0, 100);
      const mode = this.parseOctal(header, 100, 8);
      const size = this.parseOctal(header, 124, 12);
      const type = header[156] !== undefined ? String.fromCharCode(header[156]) : '0';

      if (!name) break;

      // Skip to file content
      offset += 512;

      if (type === '0' || type === '\0') {
        // Regular file
        const filePath = path.join(destinationDir, name);
        const fileContent = tarContent.slice(offset, offset + size);
        
        await this.ensureDir(path.dirname(filePath));
        await this.writeFile(filePath, fileContent);
        
        // Set permissions
        if (mode) {
          await this.chmod(filePath, mode);
        }
      }

      // Move to next entry (align to 512-byte boundary)
      offset += Math.ceil(size / 512) * 512;
    }

    // Clean up temporary file
    if (decompress && tarPath !== archivePath) {
      await this.remove(tarPath);
    }
  }

  private static parseString(buffer: Buffer, start: number, length: number): string {
    const slice = buffer.slice(start, start + length);
    const nullIndex = slice.indexOf(0);
    return slice.slice(0, nullIndex > -1 ? nullIndex : length).toString('utf8').trim();
  }

  private static parseOctal(buffer: Buffer, start: number, length: number): number {
    const str = this.parseString(buffer, start, length);
    return parseInt(str, 8) || 0;
  }

  // ZIP Archive operations - FULL IMPLEMENTATION
  public static async createZipArchive(
    sourceDir: string,
    archivePath: string,
    options: { compressionLevel?: number } = {}
  ): Promise<void> {
    const { compressionLevel = 6 } = options;

    const files: Array<{
      path: string;
      stats: FileStats;
      relativePath: string;
    }> = [];

    // Collect all files
    for await (const { path: filePath, stats } of this.walk(sourceDir)) {
      if (stats.isFile) {
        files.push({
          path: filePath,
          stats,
          relativePath: path.relative(sourceDir, filePath).replace(/\\/g, '/')
        });
      }
    }

    const output = fs.createWriteStream(archivePath);
    const centralDirectory: Buffer[] = [];
    let offset = 0;

    // Write file entries
    for (const file of files) {
      const result = await this.writeZipEntry(
        output,
        file.path,
        file.relativePath,
        file.stats,
        offset,
        compressionLevel
      );
      
      centralDirectory.push(result.centralDirEntry);
      offset = result.nextOffset;
    }

    // Write central directory
    const centralDirStart = offset;
    for (const entry of centralDirectory) {
      output.write(entry);
      offset += entry.length;
    }

    // Write end of central directory
    const endRecord = this.createEndOfCentralDirectory(
      centralDirectory.length,
      offset - centralDirStart,
      centralDirStart
    );
    output.write(endRecord);

    await new Promise<void>((resolve, reject) => {
      output.on('finish', () => resolve());
      output.on('error', reject);
      output.end();
    });
  }

  private static async writeZipEntry(
    output: fs.WriteStream,
    filePath: string,
    entryName: string,
    stats: FileStats,
    offset: number,
    compressionLevel: number
  ): Promise<{ centralDirEntry: Buffer; nextOffset: number }> {
    const fileContent = await this.readFile(filePath);
    const compressed = await this.compressBuffer(fileContent as Buffer, compressionLevel);
    
    const useCompression = compressed.length < (fileContent as Buffer).length;
    const data = useCompression ? compressed : fileContent;
    const method = useCompression ? 8 : 0; // 8 = deflate, 0 = store

    // Local file header
    const header = Buffer.alloc(30 + entryName.length);
    let pos = 0;

    // Signature
    header.writeUInt32LE(0x04034b50, pos); pos += 4;
    
    // Version needed
    header.writeUInt16LE(20, pos); pos += 2;
    
    // Flags
    header.writeUInt16LE(0, pos); pos += 2;
    
    // Compression method
    header.writeUInt16LE(method, pos); pos += 2;
    
    // Modification time/date
    const dosTime = this.toDosTime(stats.modifiedAt);
    header.writeUInt16LE(dosTime.time, pos); pos += 2;
    header.writeUInt16LE(dosTime.date, pos); pos += 2;
    
    // CRC32
    const crc = this.crc32(fileContent as Buffer);
    header.writeUInt32LE(crc, pos); pos += 4;
    
    // Compressed size
    header.writeUInt32LE(data.length, pos); pos += 4;
    
    // Uncompressed size
    header.writeUInt32LE((fileContent as Buffer).length, pos); pos += 4;
    
    // Filename length
    header.writeUInt16LE(entryName.length, pos); pos += 2;
    
    // Extra field length
    header.writeUInt16LE(0, pos); pos += 2;
    
    // Filename
    header.write(entryName, pos);

    // Write local header and data
    output.write(header);
    output.write(data);

    // Create central directory entry
    const centralDirEntry = this.createCentralDirectoryEntry(
      entryName,
      method,
      dosTime,
      crc,
      data.length,
      (fileContent as Buffer).length,
      offset,
      stats.mode
    );

    return {
      centralDirEntry,
      nextOffset: offset + header.length + data.length
    };
  }

  private static createCentralDirectoryEntry(
    filename: string,
    method: number,
    dosTime: { time: number; date: number },
    crc: number,
    compressedSize: number,
    uncompressedSize: number,
    offset: number,
    mode: number
  ): Buffer {
    const entry = Buffer.alloc(46 + filename.length);
    let pos = 0;

    // Signature
    entry.writeUInt32LE(0x02014b50, pos); pos += 4;
    
    // Version made by
    entry.writeUInt16LE(0x031e, pos); pos += 2; // Unix, version 3.0
    
    // Version needed
    entry.writeUInt16LE(20, pos); pos += 2;
    
    // Flags
    entry.writeUInt16LE(0, pos); pos += 2;
    
    // Method
    entry.writeUInt16LE(method, pos); pos += 2;
    
    // Time/date
    entry.writeUInt16LE(dosTime.time, pos); pos += 2;
    entry.writeUInt16LE(dosTime.date, pos); pos += 2;
    
    // CRC
    entry.writeUInt32LE(crc, pos); pos += 4;
    
    // Sizes
    entry.writeUInt32LE(compressedSize, pos); pos += 4;
    entry.writeUInt32LE(uncompressedSize, pos); pos += 4;
    
    // Filename length
    entry.writeUInt16LE(filename.length, pos); pos += 2;
    
    // Extra/comment lengths
    entry.writeUInt16LE(0, pos); pos += 2; // Extra
    entry.writeUInt16LE(0, pos); pos += 2; // Comment
    
    // Disk number
    entry.writeUInt16LE(0, pos); pos += 2;
    
    // Internal attributes
    entry.writeUInt16LE(0, pos); pos += 2;
    
    // External attributes (Unix mode)
    entry.writeUInt32LE((mode & 0xffff) << 16, pos); pos += 4;
    
    // Offset
    entry.writeUInt32LE(offset, pos); pos += 4;
    
    // Filename
    entry.write(filename, pos);

    return entry;
  }

  private static createEndOfCentralDirectory(
    entryCount: number,
    centralDirSize: number,
    centralDirOffset: number
  ): Buffer {
    const record = Buffer.alloc(22);
    let pos = 0;

    // Signature
    record.writeUInt32LE(0x06054b50, pos); pos += 4;
    
    // Disk numbers
    record.writeUInt16LE(0, pos); pos += 2; // This disk
    record.writeUInt16LE(0, pos); pos += 2; // Central dir disk
    
    // Entry counts
    record.writeUInt16LE(entryCount, pos); pos += 2; // Entries on disk
    record.writeUInt16LE(entryCount, pos); pos += 2; // Total entries
    
    // Central directory size and offset
    record.writeUInt32LE(centralDirSize, pos); pos += 4;
    record.writeUInt32LE(centralDirOffset, pos); pos += 4;
    
    // Comment length
    record.writeUInt16LE(0, pos);

    return record;
  }

  private static async compressBuffer(buffer: Buffer, level: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.deflate(buffer, { level }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private static toDosTime(date: Date): { time: number; date: number } {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    const dosTime = (hours << 11) | (minutes << 5) | seconds;

    return { time: dosTime, date: dosDate };
  }

  private static crc32(buffer: Buffer): number {
    const table = this.getCRC32Table();
    let crc = 0xffffffff;

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte !== undefined) {
        const tableIndex = (crc ^ byte) & 0xff;
        const tableValue = table[tableIndex];
        if (tableValue !== undefined) {
          crc = (crc >>> 8) ^ tableValue;
        }
      }
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  private static crc32Table: Uint32Array | null = null;

  private static getCRC32Table(): Uint32Array {
    if (!this.crc32Table) {
      this.crc32Table = new Uint32Array(256);
      
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        this.crc32Table[i] = c;
      }
    }

    return this.crc32Table;
  }

  public static async extractZipArchive(
    archivePath: string,
    destinationDir: string
  ): Promise<void> {
    const zipContent = await this.readFile(archivePath);
    const entries = this.parseZipCentralDirectory(zipContent as Buffer);

    for (const entry of entries) {
      if (entry.filename.endsWith('/')) {
        // Directory
        await this.ensureDir(path.join(destinationDir, entry.filename));
      } else {
        // File
        const filePath = path.join(destinationDir, entry.filename);
        await this.ensureDir(path.dirname(filePath));

        // Read local header
        const localHeader = this.readZipLocalHeader(zipContent as Buffer, entry.offset);
        const dataStart = entry.offset + 30 + localHeader.filenameLength + localHeader.extraLength;
        const data = (zipContent as Buffer).slice(dataStart, dataStart + entry.compressedSize);

        // Decompress if needed
        let content: Buffer;
        if (entry.method === 8) {
          content = await new Promise((resolve, reject) => {
            zlib.inflateRaw(data, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
        } else {
          content = data;
        }

        await this.writeFile(filePath, content);

        // Set permissions if available
        if (entry.externalAttributes) {
          const mode = (entry.externalAttributes >> 16) & 0xffff;
          if (mode) {
            await this.chmod(filePath, mode);
          }
        }
      }
    }
  }

  private static parseZipCentralDirectory(buffer: Buffer): Array<{
    filename: string;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    offset: number;
    externalAttributes: number;
  }> {
    const entries = [];
    
    // Find end of central directory
    let endOffset = buffer.length - 22;
    while (endOffset >= 0) {
      if (buffer.readUInt32LE(endOffset) === 0x06054b50) {
        break;
      }
      endOffset--;
    }

    if (endOffset < 0) {
      throw new Error('Invalid ZIP file: End of central directory not found');
    }

    // Read end of central directory
    const centralDirOffset = buffer.readUInt32LE(endOffset + 16);
    let offset = centralDirOffset;

    // Parse central directory entries
    while (offset < endOffset) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) {
        break;
      }

      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const filenameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const externalAttributes = buffer.readUInt32LE(offset + 38);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const filename = buffer.slice(offset + 46, offset + 46 + filenameLength).toString('utf8');

      entries.push({
        filename,
        method,
        compressedSize,
        uncompressedSize,
        offset: localHeaderOffset,
        externalAttributes
      });

      offset += 46 + filenameLength + extraLength + commentLength;
    }

    return entries;
  }

  private static readZipLocalHeader(buffer: Buffer, offset: number): {
    filenameLength: number;
    extraLength: number;
  } {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      throw new Error('Invalid ZIP local header');
    }

    return {
      filenameLength: buffer.readUInt16LE(offset + 26),
      extraLength: buffer.readUInt16LE(offset + 28)
    };
  }

  // Permission operations
  public static async chmod(filePath: string, mode: number | string): Promise<void> {
    const numericMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    await fsp.chmod(filePath, numericMode);
  }

  public static chmodSync(filePath: string, mode: number | string): void {
    const numericMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    fs.chmodSync(filePath, numericMode);
  }

  public static async chown(filePath: string, uid: number, gid: number): Promise<void> {
    await fsp.chown(filePath, uid, gid);
  }

  public static chownSync(filePath: string, uid: number, gid: number): void {
    fs.chownSync(filePath, uid, gid);
  }

  // Link operations
  public static async createSymlink(target: string, linkPath: string, type?: 'file' | 'dir' | 'junction'): Promise<void> {
    await this.ensureDir(path.dirname(linkPath));
    await fsp.symlink(target, linkPath, type);
  }

  public static createSymlinkSync(target: string, linkPath: string, type?: 'file' | 'dir' | 'junction'): void {
    this.ensureDirSync(path.dirname(linkPath));
    fs.symlinkSync(target, linkPath, type);
  }

  public static async createHardLink(existingPath: string, newPath: string): Promise<void> {
    await this.ensureDir(path.dirname(newPath));
    await fsp.link(existingPath, newPath);
  }

  public static createHardLinkSync(existingPath: string, newPath: string): void {
    this.ensureDirSync(path.dirname(newPath));
    fs.linkSync(existingPath, newPath);
  }

  public static async readLink(linkPath: string): Promise<string> {
    return await fsp.readlink(linkPath);
  }

  public static readLinkSync(linkPath: string): string {
    return fs.readlinkSync(linkPath);
  }

  public static async realpath(filePath: string): Promise<string> {
    return await fsp.realpath(filePath);
  }

  public static realpathSync(filePath: string): string {
    return fs.realpathSync(filePath);
  }

  // Temporary file operations
  public static async createTempFile(prefix: string = 'tmp', extension: string = ''): Promise<string> {
    const tmpDir = require('os').tmpdir();
    const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filePath = path.join(tmpDir, filename);
    
    await this.writeFile(filePath, '');
    return filePath;
  }

  public static async createTempDir(prefix: string = 'tmp'): Promise<string> {
    const tmpDir = require('os').tmpdir();
    const dirname = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dirPath = path.join(tmpDir, dirname);
    
    await this.createDir(dirPath);
    return dirPath;
  }

  public static async withTempFile<T>(
    callback: (filePath: string) => Promise<T>,
    options: { prefix?: string; extension?: string; cleanup?: boolean } = {}
  ): Promise<T> {
    const { prefix = 'tmp', extension = '', cleanup = true } = options;
    const tempFile = await this.createTempFile(prefix, extension);

    try {
      return await callback(tempFile);
    } finally {
      if (cleanup && await this.exists(tempFile)) {
        await this.remove(tempFile);
      }
    }
  }

  public static async withTempDir<T>(
    callback: (dirPath: string) => Promise<T>,
    options: { prefix?: string; cleanup?: boolean } = {}
  ): Promise<T> {
    const { prefix = 'tmp', cleanup = true } = options;
    const tempDir = await this.createTempDir(prefix);

    try {
      return await callback(tempDir);
    } finally {
      if (cleanup && await this.exists(tempDir)) {
        await this.remove(tempDir);
      }
    }
  }

  // File locking (advisory locks using lock files)
  private static locks = new Map<string, { pid: number; acquired: Date }>();

  public static async lockFile(filePath: string, options: { timeout?: number; retryInterval?: number } = {}): Promise<() => Promise<void>> {
    const { timeout = 60000, retryInterval = 100 } = options;
    const lockPath = `${filePath}.lock`;
    const startTime = Date.now();

    while (true) {
      try {
        // Try to create lock file exclusively
        const fd = await new Promise<number>((resolve, reject) => {
          fs.open(lockPath, 'wx', (err, fd) => {
            if (err) reject(err);
            else resolve(fd);
          });
        });

        // Write lock info
        const lockInfo = {
          pid: process.pid,
          acquired: new Date().toISOString(),
          host: require('os').hostname()
        };

        await new Promise<void>((resolve, reject) => {
          fs.write(fd, JSON.stringify(lockInfo), (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        await new Promise<void>((resolve, reject) => {
          fs.close(fd, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        this.locks.set(filePath, { pid: process.pid, acquired: new Date() });

        // Return unlock function
        return async () => {
          this.locks.delete(filePath);
          try {
            await this.remove(lockPath);
          } catch {
            // Ignore errors during unlock
          }
        };

      } catch (error: any) {
        if (error.code !== 'EEXIST') {
          throw error;
        }

        // Check if lock is stale
        try {
          const lockContent = await this.readFile(lockPath, 'utf8');
          const lockInfo = JSON.parse(lockContent as string) as any;
          
          // Check if process is still running
          try {
            process.kill(lockInfo.pid, 0);
          } catch {
            // Process doesn't exist, remove stale lock
            await this.remove(lockPath);
            continue;
          }
        } catch {
          // Can't read lock file, try to remove it
          try {
            await this.remove(lockPath);
          } catch {
            // Ignore
          }
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(`Failed to acquire lock on ${filePath} within ${timeout}ms`);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
  }

  public static isLocked(filePath: string): boolean {
    return this.locks.has(filePath) || this.existsSync(`${filePath}.lock`);
  }

  // Stream utilities
  public static createReadStream(filePath: string, options?: Parameters<typeof fs.createReadStream>[1]): fs.ReadStream {
    return fs.createReadStream(filePath, options);
  }

  public static createWriteStream(filePath: string, options?: Parameters<typeof fs.createWriteStream>[1]): fs.WriteStream {
    this.ensureDirSync(path.dirname(filePath));
    return fs.createWriteStream(filePath, options);
  }

  public static async pipeStreams(
    source: Readable,
    destination: Writable,
    options?: { transform?: Transform }
  ): Promise<void> {
    if (options?.transform) {
      await pipelineAsync(source, options.transform, destination);
    } else {
      await pipelineAsync(source, destination);
    }
  }

  // Size utilities
  public static async getSize(filePath: string): Promise<number> {
    const stats = await this.getStats(filePath);
    
    if (stats.isFile) {
      return stats.size;
    } else if (stats.isDirectory) {
      let totalSize = 0;
      
      for await (const { stats: fileStats } of this.walk(filePath)) {
        if (fileStats.isFile) {
          totalSize += fileStats.size;
        }
      }

      return totalSize;
    }

    return 0;
  }

  public static formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  // Path utilities
  public static normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  public static isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  public static resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  public static relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  public static join(...paths: string[]): string {
    return path.join(...paths);
  }

  public static dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  public static basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  public static extname(filePath: string): string {
    return path.extname(filePath);
  }

  public static parse(filePath: string): path.ParsedPath {
    return path.parse(filePath);
  }

  public static format(pathObject: path.FormatInputPathObject): string {
    return path.format(pathObject);
  }

  // Alias methods for backward compatibility
  public static async pathExists(filePath: string): Promise<boolean> {
    return this.exists(filePath);
  }

  public static pathExistsSync(filePath: string): boolean {
    return this.existsSync(filePath);
  }

  public static async removeDir(dirPath: string): Promise<void> {
    return this.remove(dirPath);
  }

  public static removeDirSync(dirPath: string): void {
    return this.removeSync(dirPath);
  }
}