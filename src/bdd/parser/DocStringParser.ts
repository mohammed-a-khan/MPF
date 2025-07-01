import { DocString } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';

interface ParseOptions {
  preserveIndent?: boolean;
  trimLines?: boolean;
  processEscapes?: boolean;
}

export class DocStringParser {
  private static instance: DocStringParser;
  private readonly delimiters = ['"""', '```'];
  private readonly contentTypePattern = /^(\w+)\s*$/;
  
  private constructor() {}
  
  static getInstance(): DocStringParser {
    if (!DocStringParser.instance) {
      DocStringParser.instance = new DocStringParser();
    }
    return DocStringParser.instance;
  }
  
  parseDocString(lines: string[], startLine: number = 0, options?: ParseOptions): DocString {
    const opts = {
      preserveIndent: false,
      trimLines: true,
      processEscapes: true,
      ...options
    };
    
    if (lines.length === 0) {
      throw new Error('DocString cannot be empty');
    }
    
    const firstLine = lines[0];
    if (!firstLine) {
      throw new Error('DocString cannot be empty');
    }
    const trimmedFirstLine = firstLine.trim();
    const delimiter = this.delimiters.find(d => trimmedFirstLine.startsWith(d));
    
    if (!delimiter) {
      throw new Error(`DocString must start with one of: ${this.delimiters.join(', ')}`);
    }
    
    let contentType: string | undefined;
    const afterDelimiter = trimmedFirstLine.substring(delimiter.length).trim();
    
    if (afterDelimiter) {
      const match = afterDelimiter.match(this.contentTypePattern);
      if (match && match[1]) {
        contentType = match[1].toLowerCase();
      }
    }
    
    let closingIndex = -1;
    let contentLines: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine) continue;
      
      if (currentLine.trim() === delimiter) {
        closingIndex = i;
        break;
      }
      contentLines.push(currentLine);
    }
    
    if (closingIndex === -1) {
      throw new Error(`Unclosed DocString starting at line ${startLine}`);
    }
    
    let content = this.processContent(contentLines, opts);
    
    if (contentType) {
      content = this.processContentType(content, contentType);
    }
    
    const docString: DocString = {
      content: content,
      line: startLine
    };
    
    if (contentType) {
      docString.contentType = contentType;
    }
    
    return docString;
  }
  
  private processContent(lines: string[], options: ParseOptions): string {
    if (lines.length === 0) {
      return '';
    }
    
    let processedLines = [...lines];
    
    if (!options.preserveIndent) {
      const commonIndent = this.calculateCommonIndent(lines);
      processedLines = lines.map(line => {
        if (line.length >= commonIndent) {
          return line.substring(commonIndent);
        }
        return line;
      });
    }
    
    if (options.trimLines) {
      processedLines = processedLines.map(line => line.trimEnd());
    }
    
    if (options.processEscapes) {
      processedLines = processedLines.map(line => this.processEscapeSequences(line));
    }
    
    let content = processedLines.join('\n');
    
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');
    
    return content;
  }
  
  private calculateCommonIndent(lines: string[]): number {
    let minIndent = Infinity;
    
    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      
      const indent = line.length - line.trimStart().length;
      minIndent = Math.min(minIndent, indent);
    }
    
    return minIndent === Infinity ? 0 : minIndent;
  }
  
  private processEscapeSequences(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
  
  private processContentType(content: string, contentType: string): string {
    switch (contentType) {
      case 'json':
        return this.formatJSON(content);
      
      case 'xml':
        return this.formatXML(content);
      
      case 'html':
        return this.formatHTML(content);
      
      case 'sql':
        return this.formatSQL(content);
      
      case 'csv':
        return this.formatCSV(content);
      
      default:
        return content;
    }
  }
  
  private formatJSON(content: string): string {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      Logger.getInstance().warn(`Invalid JSON in DocString: ${error instanceof Error ? error.message : String(error)}`);
      return content;
    }
  }
  
  private formatXML(content: string): string {
    try {
      let formatted = content.replace(/>\s+</g, '><');
      
      let indent = 0;
      formatted = formatted.replace(/(<[^>]+>)/g, (match) => {
        if (match.startsWith('</')) {
          indent = Math.max(0, indent - 1);
        }
        
        const line = '\n' + '  '.repeat(indent) + match;
        
        if (!match.startsWith('</') && !match.endsWith('/>') && !match.includes('</')) {
          indent++;
        }
        
        return line;
      });
      
      return formatted.trim();
    } catch (error) {
      return content;
    }
  }
  
  private formatHTML(content: string): string {
    
    try {
      let formatted = content;
      
      formatted = formatted.replace(/<(div|p|h[1-6]|ul|ol|li|table|tr|td|th)[^>]*>/gi, '\n$&');
      formatted = formatted.replace(/<\/(div|p|h[1-6]|ul|ol|li|table|tr|td|th)>/gi, '$&\n');
      
      formatted = formatted.replace(/\n{3,}/g, '\n\n');
      
      return formatted.trim();
    } catch (error) {
      return content;
    }
  }
  
  private formatSQL(content: string): string {
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 
      'GROUP BY', 'HAVING', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 
      'INNER JOIN', 'ON', 'INSERT INTO', 'VALUES', 'UPDATE', 
      'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE'
    ];
    
    let formatted = content;
    
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      formatted = formatted.replace(regex, `\n${keyword}`);
    });
    
    formatted = formatted.replace(/\n{2,}/g, '\n');
    
    return formatted.trim();
  }
  
  private formatCSV(content: string): string {
    const lines = content.split('\n');
    const formatted: string[] = [];
    
    for (const line of lines) {
      if (line.trim()) {
        const cells = this.parseCSVLine(line);
        const formattedLine = cells.map(cell => {
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(',');
        
        formatted.push(formattedLine);
      }
    }
    
    return formatted.join('\n');
  }
  
  private parseCSVLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    cells.push(current);
    return cells;
  }
  
  detectContentType(content: string): string | undefined {
    const trimmed = content.trim();
    
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
      }
    }
    
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      if (trimmed.includes('<!DOCTYPE html') || trimmed.includes('<html')) {
        return 'html';
      }
      return 'xml';
    }
    
    const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP'];
    const upperContent = trimmed.toUpperCase();
    if (sqlKeywords.some(keyword => upperContent.startsWith(keyword))) {
      return 'sql';
    }
    
    const lines = trimmed.split('\n');
    if (lines.length > 1) {
      const firstLine = lines[0];
      if (!firstLine) return undefined;
      
      const firstLineCells = firstLine.split(',').length;
      if (firstLineCells > 1 && lines.every(line => 
        line.split(',').length === firstLineCells || line.trim() === ''
      )) {
        return 'csv';
      }
    }
    
    return undefined;
  }
  
  createDocString(content: string, contentType?: string): DocString {
    const docString: DocString = {
      content: content,
      line: 0
    };
    
    if (contentType) {
      docString.contentType = contentType;
    }
    
    return docString;
  }
  
  formatDocString(docString: DocString, delimiter: string = '"""'): string {
    const lines: string[] = [];
    
    if (docString.contentType) {
      lines.push(`${delimiter} ${docString.contentType}`);
    } else {
      lines.push(delimiter);
    }
    
    if (docString.content) {
      lines.push(...docString.content.split('\n'));
    }
    
    lines.push(delimiter);
    
    return lines.join('\n');
  }
  
  validateDocString(docString: DocString): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (docString.content === undefined || docString.content === null) {
      errors.push('DocString content cannot be null or undefined');
    }
    
    if (docString.contentType) {
      switch (docString.contentType) {
        case 'json':
          try {
            JSON.parse(docString.content);
          } catch (error) {
            errors.push(`Invalid JSON content: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
          
        case 'xml':
          const openTags = (docString.content.match(/<[^\/][^>]*>/g) || []).length;
          const closeTags = (docString.content.match(/<\/[^>]+>/g) || []).length;
          if (openTags !== closeTags) {
            errors.push('XML content has mismatched tags');
          }
          break;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const docStringParser = DocStringParser.getInstance();
