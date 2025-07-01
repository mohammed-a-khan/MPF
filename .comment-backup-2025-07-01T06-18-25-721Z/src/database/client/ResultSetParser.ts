// src/database/client/ResultSetParser.ts

import { ResultSet, QueryResult, QueryOptions, ResultMetadata } from '../types/database.types';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import { DateUtils } from '../../core/utils/DateUtils';
import * as XLSX from 'xlsx';

/**
 * Parses and transforms database query results
 */
export class ResultSetParser {
  constructor(_adapter: DatabaseAdapter) {
    // adapter is not used in this implementation
  }

  /**
   * Parse raw query result into ResultSet
   */
  parse<T = any>(rawResult: QueryResult, options?: QueryOptions): ResultSet {
    try {
      const rows = this.extractRows<T>(rawResult);
      const columns = this.extractColumns(rawResult);
      const metadata = this.extractMetadata(rawResult);
      const rowCount = this.extractRowCount(rawResult, rows);

      // Apply transformations if specified
      const transformedRows = options?.transform 
        ? this.applyTransformations(rows, options.transform)
        : rows;

      // Apply pagination if specified
      const paginatedRows = options?.pagination
        ? this.applyPagination(transformedRows, options.pagination)
        : transformedRows;

      const result: ResultSet = {
        rows: paginatedRows,
        fields: rawResult.fields || [],
        rowCount,
        metadata
      };
      
      if (columns) {
        result.columns = columns;
      }
      if (rawResult['executionTime'] !== undefined) {
        result.executionTime = rawResult['executionTime'];
      }
      if (rawResult.affectedRows !== undefined) {
        result.affectedRows = rawResult.affectedRows;
      }
      
      return result;
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Failed to parse result set:', error as Error);
      throw new Error(`Result parsing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Export result set to file
   */
  async export(resultSet: ResultSet, format: 'csv' | 'json' | 'xml' | 'excel' | 'text', filePath: string): Promise<void> {
    try {
      Logger.getInstance().info(`Exporting ${resultSet.rowCount} rows to ${format} format`);

      switch (format) {
        case 'csv':
          await this.exportToCSV(resultSet, filePath);
          break;
        case 'json':
          await this.exportToJSON(resultSet, filePath);
          break;
        case 'xml':
          await this.exportToXML(resultSet, filePath);
          break;
        case 'excel':
          await this.exportToExcel(resultSet, filePath);
          break;
        case 'text':
          await this.exportToText(resultSet, filePath);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      Logger.getInstance().info(`Export completed: ${filePath}`);
    } catch (error) {
      Logger.getInstance().error('Export failed:', error as Error);
      throw new Error(`Failed to export result set: ${(error as Error).message}`);
    }
  }

  /**
   * Import data from file
   */
  async import(filePath: string, format: 'csv' | 'json' | 'xml' | 'excel', options?: any): Promise<any[]> {
    try {
      Logger.getInstance().info(`Importing data from ${format} file: ${filePath}`);

      let data: any[];

      switch (format) {
        case 'csv':
          data = await this.importFromCSV(filePath, options);
          break;
        case 'json':
          data = await this.importFromJSON(filePath);
          break;
        case 'xml':
          data = await this.importFromXML(filePath, options);
          break;
        case 'excel':
          data = await this.importFromExcel(filePath, options);
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      Logger.getInstance().info(`Imported ${data.length} records`);
      return data;
    } catch (error) {
      Logger.getInstance().error('Import failed:', error as Error);
      throw new Error(`Failed to import data: ${(error as Error).message}`);
    }
  }

  /**
   * Convert result set to array of objects
   */
  toObjects<T = any>(resultSet: ResultSet): T[] {
    return resultSet.rows as T[];
  }

  /**
   * Convert result set to 2D array
   */
  toArray(resultSet: ResultSet, includeHeaders: boolean = true): any[][] {
    const result: any[][] = [];
    const columns = resultSet.columns || [];

    if (includeHeaders && columns.length > 0) {
      result.push(columns.map((col: any) => col.name));
    }

    if (columns.length > 0) {
      resultSet.rows.forEach(row => {
        const values = columns.map((col: any) => row[col.name]);
        result.push(values);
      });
    }

    return result;
  }

  /**
   * Convert result set to Map
   */
  toMap<K, V>(resultSet: ResultSet, keyColumn: string, valueColumn?: string): Map<K, V> {
    const map = new Map<K, V>();

    resultSet.rows.forEach(row => {
      const key = row[keyColumn] as K;
      const value = valueColumn ? row[valueColumn] as V : row as V;
      map.set(key, value);
    });

    return map;
  }

  /**
   * Group result set by column
   */
  groupBy<T = any>(resultSet: ResultSet, column: string): Map<any, T[]> {
    const groups = new Map<any, T[]>();

    resultSet.rows.forEach((row: any) => {
      const key = row[column];
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    });

    return groups;
  }

  /**
   * Extract rows from raw result
   */
  private extractRows<T>(rawResult: QueryResult): T[] {
    // Handle different database result formats
    if (Array.isArray(rawResult)) {
      return rawResult as T[];
    } else if (rawResult.rows !== undefined) {
      return rawResult.rows as T[];
    } else if (rawResult['recordset'] !== undefined) {
      // SQL Server format
      return rawResult['recordset'] as T[];
    } else if (rawResult['data'] !== undefined) {
      return rawResult['data'] as T[];
    } else if (typeof rawResult === 'object' && rawResult !== null) {
      // Single row result
      return [rawResult as T];
    }

    return [];
  }

  /**
   * Extract columns from raw result
   */
  private extractColumns(rawResult: QueryResult): ResultMetadata[] {
    const columns: ResultMetadata[] = [];

    // Try to get column metadata from result
    if (rawResult.fields) {
      // PostgreSQL/MySQL format
      rawResult.fields.forEach((field: any) => {
        columns.push({
          name: field.name,
          type: this.mapDataType(field.dataTypeID || field.type),
          nullable: field.allowNull !== false,
          length: field.length || field.characterMaximumLength,
          precision: field.precision,
          scale: field.scale
        });
      });
    } else if (rawResult['columns']) {
      // Generic column format
      (rawResult['columns'] as any[]).forEach((col: any) => {
        columns.push({
          name: col.name || col.column_name,
          type: this.mapDataType(col.type || col.data_type),
          nullable: col.nullable !== false,
          length: col.length || col.max_length,
          precision: col.precision,
          scale: col.scale
        });
      });
    } else if (rawResult['recordset'] && rawResult['recordset']['columns']) {
      // SQL Server format
      Object.entries(rawResult['recordset']['columns'] as Record<string, any>).forEach(([name, col]: [string, any]) => {
        columns.push({
          name,
          type: this.mapDataType(col.type),
          nullable: col.nullable,
          length: col.length,
          precision: col.precision,
          scale: col.scale
        });
      });
    } else if (rawResult.rows && rawResult.rows.length > 0) {
      // Infer from first row
      const firstRow = rawResult.rows[0];
      Object.keys(firstRow).forEach(key => {
        columns.push({
          name: key,
          type: this.inferDataType(firstRow[key]),
          nullable: true
        });
      });
    }

    return columns;
  }

  /**
   * Extract metadata from raw result
   */
  private extractMetadata(rawResult: QueryResult): Record<string, any> {
    const metadata: Record<string, any> = {};

    // Extract common metadata
    if (rawResult['command']) metadata['command'] = rawResult['command'];
    if (rawResult['rowCount'] !== undefined) metadata['rowCount'] = rawResult['rowCount'];
    if (rawResult['duration'] !== undefined) metadata['duration'] = rawResult['duration'];
    if (rawResult['message']) metadata['message'] = rawResult['message'];

    return metadata;
  }

  /**
   * Extract row count from result
   */
  private extractRowCount(rawResult: QueryResult, rows: any[]): number {
    if (rawResult.rowCount !== undefined) {
      return rawResult.rowCount;
    } else if (rawResult.affectedRows !== undefined) {
      return rawResult.affectedRows;
    } else {
      return rows.length;
    }
  }

  /**
   * Map database type to generic type
   */
  private mapDataType(dbType: any): string {
    const typeStr = String(dbType).toLowerCase();

    if (typeStr.includes('int')) return 'integer';
    if (typeStr.includes('num') || typeStr.includes('dec') || typeStr.includes('float') || typeStr.includes('double')) return 'number';
    if (typeStr.includes('char') || typeStr.includes('text') || typeStr.includes('string')) return 'string';
    if (typeStr.includes('bool')) return 'boolean';
    if (typeStr.includes('date') || typeStr.includes('time')) return 'datetime';
    if (typeStr.includes('json')) return 'json';
    if (typeStr.includes('xml')) return 'xml';
    if (typeStr.includes('bin') || typeStr.includes('blob')) return 'binary';

    return typeStr;
  }

  /**
   * Infer data type from value
   */
  private inferDataType(value: any): string {
    if (value === null || value === undefined) return 'unknown';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'datetime';
    if (typeof value === 'object') return 'json';
    return 'string';
  }

  /**
   * Apply transformations to rows
   */
  private applyTransformations(rows: any[], transform: Record<string, (value: any) => any>): any[] {
    return rows.map(row => {
      const transformed = { ...row };
      
      Object.entries(transform).forEach(([column, transformer]) => {
        if (column in transformed) {
          transformed[column] = transformer(transformed[column]);
        }
      });

      return transformed;
    });
  }

  /**
   * Apply pagination to rows
   */
  private applyPagination(rows: any[], pagination: { page: number; pageSize: number }): any[] {
    const { page, pageSize } = pagination;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return rows.slice(start, end);
  }

  /**
   * Export to CSV
   */
  private async exportToCSV(resultSet: ResultSet, filePath: string): Promise<void> {
    const csv: string[] = [];

    // Headers
    const columns = resultSet.columns || [];
    if (columns.length > 0) {
      csv.push(columns.map((col: ResultMetadata) => this.escapeCSV(col.name)).join(','));
    }

    // Data rows
    resultSet.rows.forEach(row => {
      const values = columns.map((col: ResultMetadata) => {
        const value = row[col.name];
        return this.escapeCSV(this.formatValue(value));
      });
      csv.push(values.join(','));
    });

    await FileUtils.writeFile(filePath, csv.join('\n'));
  }

  /**
   * Export to JSON
   */
  private async exportToJSON(resultSet: ResultSet, filePath: string): Promise<void> {
    const data = {
      metadata: {
        columns: resultSet.columns || [],
        rowCount: resultSet.rowCount,
        executionTime: resultSet.executionTime || 0,
        exportedAt: new Date().toISOString()
      },
      data: resultSet.rows
    };

    await FileUtils.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Export to XML
   */
  private async exportToXML(resultSet: ResultSet, filePath: string): Promise<void> {
    const xml: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
    xml.push('<resultset>');
    xml.push('  <metadata>');
    xml.push(`    <rowCount>${resultSet.rowCount}</rowCount>`);
    xml.push(`    <executionTime>${resultSet.executionTime || 0}</executionTime>`);
    xml.push('    <columns>');
    
    const columns = resultSet.columns || [];
    columns.forEach((col: ResultMetadata) => {
      xml.push('      <column>');
      xml.push(`        <name>${this.escapeXML(col.name)}</name>`);
      xml.push(`        <type>${col.type}</type>`);
      xml.push('      </column>');
    });
    
    xml.push('    </columns>');
    xml.push('  </metadata>');
    xml.push('  <data>');

    resultSet.rows.forEach(row => {
      xml.push('    <row>');
      columns.forEach((col: ResultMetadata) => {
        const value = row[col.name];
        xml.push(`      <${col.name}>${this.escapeXML(this.formatValue(value))}</${col.name}>`);
      });
      xml.push('    </row>');
    });

    xml.push('  </data>');
    xml.push('</resultset>');

    await FileUtils.writeFile(filePath, xml.join('\n'));
  }

  /**
   * Export to Excel
   */
  private async exportToExcel(resultSet: ResultSet, filePath: string): Promise<void> {
    const workbook = XLSX.utils.book_new();
    
    // Convert to array format
    const data = this.toArray(resultSet, true);
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Auto-size columns
    const columnWidths: any[] = [];
    const columns = resultSet.columns || [];
    columns.forEach((col: ResultMetadata, index: number) => {
      let maxWidth = col.name.length;
      
      resultSet.rows.forEach(row => {
        const value = String(row[col.name] || '');
        maxWidth = Math.max(maxWidth, value.length);
      });
      
      columnWidths[index] = { wch: Math.min(maxWidth + 2, 50) };
    });
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Query Result');
    
    // Add metadata sheet
    const metadataSheet = XLSX.utils.aoa_to_sheet([
      ['Property', 'Value'],
      ['Row Count', resultSet.rowCount],
      ['Execution Time (ms)', resultSet.executionTime || 0],
      ['Exported At', new Date().toISOString()],
      ['Columns', columns.length]
    ]);
    XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');

    // Write file
    XLSX.writeFile(workbook, filePath);
  }

  /**
   * Export to text (formatted table)
   */
  private async exportToText(resultSet: ResultSet, filePath: string): Promise<void> {
    const lines: string[] = [];
    
    // Calculate column widths
    const columnWidths: number[] = [];
    const columns = resultSet.columns || [];
    columns.forEach((col: ResultMetadata, index: number) => {
      let maxWidth = col.name.length;
      
      resultSet.rows.forEach(row => {
        const value = this.formatValue(row[col.name]);
        maxWidth = Math.max(maxWidth, value.length);
      });
      
      columnWidths[index] = Math.min(maxWidth, 50);
    });

    // Create separator
    const separator = '+' + columnWidths.map((w: number) => '-'.repeat(w + 2)).join('+') + '+';

    // Header
    lines.push(separator);
    lines.push('|' + columns.map((col: ResultMetadata, i: number) => {
      const width = columnWidths[i];
      return width !== undefined ? ` ${col.name.padEnd(width)} ` : ` ${col.name} `;
    }).join('|') + '|');
    lines.push(separator);

    // Data rows
    resultSet.rows.forEach(row => {
      lines.push('|' + columns.map((col: ResultMetadata, i: number) => {
        const value = this.formatValue(row[col.name]);
        const width = columnWidths[i];
        return width !== undefined ? ` ${value.padEnd(width)} ` : ` ${value} `;
      }).join('|') + '|');
    });

    lines.push(separator);
    lines.push(`\nTotal Rows: ${resultSet.rowCount}`);
    if (resultSet.executionTime) {
      lines.push(`Execution Time: ${resultSet.executionTime}ms`);
    }

    await FileUtils.writeFile(filePath, lines.join('\n'));
  }

  /**
   * Import from CSV
   */
  private async importFromCSV(filePath: string, _options?: any): Promise<any[]> {
    const content = await FileUtils.readFile(filePath);
    const lines = (typeof content === 'string' ? content : content.toString()).split('\n').filter((line: string) => line.trim());
    
    if (lines.length === 0) return [];

    const firstLine = lines[0];
    if (!firstLine) return [];
    
    const headers = firstLine.split(',').map((h: string) => h.trim());
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      const values = this.parseCSVLine(line);
      const row: any = {};
      
      if (values) {
        headers.forEach((header: string, index: number) => {
          const value = values[index];
          row[header] = this.parseValue(value !== undefined ? value : '');
        });
        
        data.push(row);
      }
    }

    return data;
  }

  /**
   * Import from JSON
   */
  private async importFromJSON(filePath: string): Promise<any[]> {
    const content = await FileUtils.readFile(filePath);
    const parsed = JSON.parse(typeof content === 'string' ? content : content.toString());
    
    // Support both direct array and wrapped format
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.data && Array.isArray(parsed.data)) {
      return parsed.data;
    } else {
      throw new Error('Invalid JSON format: expected array or object with data property');
    }
  }

  /**
   * Import from XML
   */
  private async importFromXML(filePath: string, _options?: any): Promise<any[]> {
    const content = await FileUtils.readFile(filePath);
    const data: any[] = [];
    
    // Simple XML parsing for row data
    const contentStr = typeof content === 'string' ? content : content.toString();
    const rowMatches = contentStr.match(/<row>([\s\S]*?)<\/row>/g);
    if (!rowMatches) return [];

    rowMatches.forEach((rowXml: string) => {
      const row: any = {};
      
      // Extract field values
      const fieldMatches = rowXml.match(/<(\w+)>(.*?)<\/\1>/g);
      if (fieldMatches) {
        fieldMatches.forEach((fieldXml: string) => {
          const match = fieldXml.match(/<(\w+)>(.*?)<\/\1>/);
          if (match && match[1] && match[2]) {
            row[match[1]] = this.parseValue(match[2]);
          }
        });
      }
      
      data.push(row);
    });

    return data;
  }

  /**
   * Import from Excel
   */
  private async importFromExcel(filePath: string, options?: any): Promise<any[]> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = options?.sheet || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = worksheet ? XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd hh:mm:ss'
    }) : [];

    return data;
  }

  /**
   * Parse CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Parse value to appropriate type
   */
  private parseValue(value: string): any {
    if (!value || value === 'null' || value === 'NULL') return null;
    
    // Try to parse as number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Try to parse as date
    const date = new Date(value);
    if (!isNaN(date.getTime()) && value.includes('-') || value.includes('/')) {
      return date;
    }
    
    return value;
  }

  /**
   * Format value for export
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return DateUtils.format(value, 'yyyy-MM-dd HH:mm:ss');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Escape CSV value
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Escape XML value
   */
  private escapeXML(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}