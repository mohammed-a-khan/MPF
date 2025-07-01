#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * Safe Comment Removal Utility
 * Removes single-line comments starting with // while preserving code integrity
 */

class CommentRemover {
    constructor() {
        this.processedFiles = 0;
        this.totalComments = 0;
        this.errors = [];
        this.backupDir = '.comment-backup';
        
        // Patterns to exclude from processing
        this.excludePatterns = [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**',
            '**/coverage/**',
            '**/reports/**',
            '**/*.min.js',
            '**/*.map',
            '**/remove-comments-utility.js',
            '**/.comment-backup/**'
        ];

        // File extensions to process
        this.includeExtensions = ['.ts', '.js', '.tsx', '.jsx'];
    }

    /**
     * Main execution method
     */
    async run(options = {}) {
        console.log('🧹 Comment Removal Utility');
        console.log('=' .repeat(50));

        const { 
            dryRun = false, 
            backup = true, 
            paths = ['src', 'test'],
            restore = false 
        } = options;

        if (restore) {
            await this.restoreFromBackup();
            return;
        }

        // Create backup directory
        if (backup && !dryRun) {
            await this.createBackupDirectory();
        }

        // Find all files to process
        const files = await this.findFiles(paths);
        console.log(`📁 Found ${files.length} files to process\n`);

        if (dryRun) {
            console.log('🔍 DRY RUN MODE - No files will be modified\n');
        }

        // Process each file
        for (const file of files) {
            await this.processFile(file, { dryRun, backup });
        }

        // Summary
        console.log('\n' + '=' .repeat(50));
        console.log('📊 Summary:');
        console.log(`   Files processed: ${this.processedFiles}`);
        console.log(`   Comments removed: ${this.totalComments}`);
        console.log(`   Errors: ${this.errors.length}`);

        if (this.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.errors.forEach(err => console.log(`   - ${err}`));
        }

        if (backup && !dryRun) {
            console.log(`\n💾 Backup saved to: ${this.backupDir}`);
            console.log('   Run with --restore to revert changes');
        }
    }

    /**
     * Find all files matching criteria
     */
    async findFiles(paths) {
        const files = [];
        
        for (const searchPath of paths) {
            // Check if it's a specific file
            if (searchPath.endsWith('.ts') || searchPath.endsWith('.js') || 
                searchPath.endsWith('.tsx') || searchPath.endsWith('.jsx')) {
                // It's a single file
                if (fs.existsSync(searchPath)) {
                    files.push(searchPath);
                }
            } else {
                // It's a directory pattern
                const pattern = `${searchPath}/**/*`;
                const matches = await glob(pattern, {
                    ignore: this.excludePatterns,
                    nodir: true
                });
                
                // Filter by extension
                const validFiles = matches.filter(file => 
                    this.includeExtensions.some(ext => file.endsWith(ext))
                );
                
                files.push(...validFiles);
            }
        }
        
        return [...new Set(files)]; // Remove duplicates
    }

    /**
     * Process a single file
     */
    async processFile(filePath, options) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const processed = this.removeComments(content, filePath);
            
            if (processed.content !== content) {
                this.processedFiles++;
                this.totalComments += processed.removedCount;
                
                if (!options.dryRun) {
                    // Backup original file
                    if (options.backup) {
                        await this.backupFile(filePath);
                    }
                    
                    // Write processed content
                    await fs.promises.writeFile(filePath, processed.content, 'utf8');
                    console.log(`✅ ${filePath} - Removed ${processed.removedCount} comments`);
                } else {
                    console.log(`📝 ${filePath} - Would remove ${processed.removedCount} comments`);
                }
            }
        } catch (error) {
            this.errors.push(`${filePath}: ${error.message}`);
            console.error(`❌ Error processing ${filePath}: ${error.message}`);
        }
    }

    /**
     * Remove comments from content
     */
    removeComments(content, filePath) {
        const lines = content.split('\n');
        const processedLines = [];
        let removedCount = 0;
        let inMultiLineString = false;
        let inMultiLineComment = false;
        let stringDelimiter = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let processedLine = line;
            let shouldKeepLine = true;

            // Check if we're in a multi-line comment
            if (inMultiLineComment) {
                if (line.includes('*/')) {
                    inMultiLineComment = false;
                    // Keep the part after */
                    const endIndex = line.indexOf('*/') + 2;
                    processedLine = line.substring(endIndex);
                    if (processedLine.trim() === '') {
                        shouldKeepLine = false;
                        removedCount++;
                    }
                } else {
                    shouldKeepLine = false;
                    removedCount++;
                }
            } else {
                // Check for multi-line comment start
                if (line.includes('/*') && !this.isInString(line, line.indexOf('/*'))) {
                    const startIndex = line.indexOf('/*');
                    if (line.includes('*/', startIndex)) {
                        // Single line block comment
                        const endIndex = line.indexOf('*/', startIndex) + 2;
                        processedLine = line.substring(0, startIndex) + line.substring(endIndex);
                        if (processedLine.trim() === '') {
                            shouldKeepLine = false;
                            removedCount++;
                        }
                    } else {
                        // Multi-line comment starts
                        inMultiLineComment = true;
                        processedLine = line.substring(0, startIndex);
                        if (processedLine.trim() === '') {
                            shouldKeepLine = false;
                            removedCount++;
                        }
                    }
                } else {
                    // Check for single-line comments
                    const commentIndex = this.findCommentStart(line);
                    if (commentIndex !== -1) {
                        // Check if it's a special comment we should keep
                        const commentContent = line.substring(commentIndex);
                        if (this.shouldKeepComment(commentContent, filePath)) {
                            // Keep special comments
                        } else {
                            processedLine = line.substring(0, commentIndex).trimEnd();
                            if (processedLine.trim() === '') {
                                shouldKeepLine = false;
                                removedCount++;
                            }
                        }
                    }
                }
            }

            if (shouldKeepLine) {
                processedLines.push(processedLine);
            }
        }

        // Remove trailing empty lines
        while (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() === '') {
            processedLines.pop();
        }

        return {
            content: processedLines.join('\n') + '\n',
            removedCount
        };
    }

    /**
     * Find the start of a // comment, considering strings
     */
    findCommentStart(line) {
        let inString = false;
        let stringChar = null;
        let escaped = false;

        for (let i = 0; i < line.length - 1; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            // Handle escape sequences
            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            // Handle strings
            if (!inString && (char === '"' || char === "'" || char === '`')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar) {
                inString = false;
                stringChar = null;
            }

            // Check for comment
            if (!inString && char === '/' && nextChar === '/') {
                return i;
            }
        }

        return -1;
    }

    /**
     * Check if position is inside a string
     */
    isInString(line, position) {
        let inString = false;
        let stringChar = null;
        let escaped = false;

        for (let i = 0; i < position; i++) {
            const char = line[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (!inString && (char === '"' || char === "'" || char === '`')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar) {
                inString = false;
                stringChar = null;
            }
        }

        return inString;
    }

    /**
     * Determine if a comment should be kept
     */
    shouldKeepComment(comment, filePath) {
        // Keep special comments
        const keepPatterns = [
            /^\/\/\s*@/,           // Decorators
            /^\/\/\s*#/,           // Directives
            /^\/\/\s*eslint/,      // ESLint
            /^\/\/\s*tslint/,      // TSLint
            /^\/\/\s*@ts-/,        // TypeScript directives
            /^\/\/\s*TODO/i,       // TODO comments
            /^\/\/\s*FIXME/i,      // FIXME comments
            /^\/\/\s*HACK/i,       // HACK comments
            /^\/\/\s*NOTE/i,       // NOTE comments
            /^\/\/\s*IMPORTANT/i,  // IMPORTANT comments
            /^\/\/\s*WARNING/i,    // WARNING comments
            /^\/\/\s*CRITICAL/i,   // CRITICAL comments
            /^\/\/\s*!/,           // Shebang
            /^\/\/#!/,             // Shebang variant
            /^\/\/\s*<reference/,  // TypeScript references
            /^\/\/\s*\/\s*<reference/ // TypeScript references with extra slash
        ];

        // Keep URLs in comments
        if (comment.includes('http://') || comment.includes('https://')) {
            return true;
        }

        // Keep file path comments at the start of files
        if (filePath && comment.includes(path.basename(filePath))) {
            const lineContent = comment.trim();
            // Check if it's a file path comment like // src/some/path.ts
            if (lineContent.match(/^\/\/\s*(src|test|lib|app)\//)) {
                return true;
            }
        }

        // Keep copyright and license comments
        if (comment.match(/copyright|license|©/i)) {
            return true;
        }

        return keepPatterns.some(pattern => pattern.test(comment));
    }

    /**
     * Create backup directory
     */
    async createBackupDirectory() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.backupDir = `.comment-backup-${timestamp}`;
        await fs.promises.mkdir(this.backupDir, { recursive: true });
    }

    /**
     * Backup a file
     */
    async backupFile(filePath) {
        const backupPath = path.join(this.backupDir, filePath);
        const backupDir = path.dirname(backupPath);
        
        await fs.promises.mkdir(backupDir, { recursive: true });
        await fs.promises.copyFile(filePath, backupPath);
    }

    /**
     * Restore from backup
     */
    async restoreFromBackup() {
        // Find latest backup
        const backups = await glob('.comment-backup-*');
        
        if (backups.length === 0) {
            console.log('❌ No backup found');
            return;
        }

        const latestBackup = backups.sort().pop();
        console.log(`📂 Restoring from backup: ${latestBackup}`);

        const files = await glob(`${latestBackup}/**/*`, { nodir: true });
        
        for (const backupFile of files) {
            const originalFile = backupFile.replace(`${latestBackup}/`, '');
            await fs.promises.copyFile(backupFile, originalFile);
            console.log(`✅ Restored: ${originalFile}`);
        }

        console.log(`\n✅ Restored ${files.length} files from backup`);
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        dryRun: args.includes('--dry-run'),
        backup: !args.includes('--no-backup'),
        restore: args.includes('--restore'),
        paths: []
    };

    // Extract paths
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--path' && args[i + 1]) {
            options.paths.push(args[i + 1]);
            i++;
        }
    }

    // Default paths
    if (options.paths.length === 0) {
        options.paths = ['src', 'test'];
    }

    // Show help
    if (args.includes('--help')) {
        console.log(`
Comment Removal Utility

USAGE:
  node remove-comments-utility.js [options]

OPTIONS:
  --dry-run         Show what would be done without modifying files
  --no-backup       Don't create backup (not recommended)
  --restore         Restore from latest backup
  --path <path>     Specify path to process (can be used multiple times)
  --help            Show this help

EXAMPLES:
  # Dry run to see what would be removed
  node remove-comments-utility.js --dry-run

  # Remove comments from src directory only
  node remove-comments-utility.js --path src

  # Remove comments from multiple directories
  node remove-comments-utility.js --path src --path test

  # Restore from backup
  node remove-comments-utility.js --restore
        `);
        process.exit(0);
    }

    // Run utility
    const remover = new CommentRemover();
    remover.run(options).catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { CommentRemover };