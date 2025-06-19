import { DataTable } from '../types/bdd.types';

interface ParseOptions {
  trimCells?: boolean;
  convertTypes?: boolean;
  emptyValue?: string | null;
  delimiter?: string;
}

interface TableTransform {
  (table: DataTable): any;
}

export class DataTableParser {
  private static instance: DataTableParser;
  private readonly defaultOptions: ParseOptions = {
    trimCells: true,
    convertTypes: true,
    emptyValue: '',
    delimiter: '|'
  };
  
  private readonly transforms: Map<string, TableTransform> = new Map();
  
  private constructor() {
    this.registerDefaultTransforms();
  }
  
  static getInstance(): DataTableParser {
    if (!DataTableParser.instance) {
      DataTableParser.instance = new DataTableParser();
    }
    return DataTableParser.instance;
  }
  
  parseTable(lines: string[], options?: ParseOptions): DataTable {
    const opts = { ...this.defaultOptions, ...options };
    const rows: string[][] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      
      const trimmedLine = line.trim();
      const delimiter = opts.delimiter || '|';
      
      if (!trimmedLine || !trimmedLine.includes(delimiter)) {
        continue;
      }
      
      const cells = this.parseLine(trimmedLine, opts);
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    if (rows.length === 0) {
      throw new Error('Data table must have at least one row');
    }
    
    return this.createDataTable(rows);
  }
  
  private parseLine(line: string, options: ParseOptions): string[] {
    const delimiter = options.delimiter || '|';
    const cells: string[] = [];
    
    // Remove leading and trailing delimiters
    let trimmedLine = line.trim();
    if (trimmedLine.startsWith(delimiter)) {
      trimmedLine = trimmedLine.substring(1);
    }
    if (trimmedLine.endsWith(delimiter)) {
      trimmedLine = trimmedLine.substring(0, trimmedLine.length - 1);
    }
    
    // Split by delimiter
    const parts = this.smartSplit(trimmedLine, delimiter);
    
    for (const part of parts) {
      let cell = part;
      
      if (options.trimCells) {
        cell = cell.trim();
      }
      
      // Handle empty cells
      if (cell === '' && options.emptyValue !== undefined) {
        cell = options.emptyValue === null ? '' : options.emptyValue;
      }
      
      // Convert types if requested
      if (options.convertTypes && cell !== '') {
        cell = this.convertType(cell);
      }
      
      cells.push(cell);
    }
    
    return cells;
  }
  
  private smartSplit(text: string, delimiter: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
        continue;
      }
      
      if (char === delimiter && !inQuotes) {
        parts.push(current);
        current = '';
        continue;
      }
      
      current += char;
    }
    
    if (current || parts.length > 0) {
      parts.push(current);
    }
    
    return parts;
  }
  
  private convertType(value: string): string {
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.substring(1, value.length - 1);
    }
    
    // Check for special values
    const trimmed = value.trim();
    
    // Boolean
    if (trimmed.toLowerCase() === 'true' || trimmed.toLowerCase() === 'false') {
      return trimmed.toLowerCase();
    }
    
    // Null
    if (trimmed.toLowerCase() === 'null' || trimmed === '') {
      return '';
    }
    
    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    
    // Date (ISO format)
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(trimmed)) {
      return trimmed;
    }
    
    return value;
  }
  
  private createDataTable(rowData: string[][]): DataTable {
    const dataTable: DataTable = {
      rows: rowData,
      
      hashes(): Record<string, string>[] {
        if (rowData.length < 2) {
          return [];
        }
        
        const headers = rowData[0];
        if (!headers) {
          return [];
        }
        
        const objects: Record<string, string>[] = [];
        
        for (let i = 1; i < rowData.length; i++) {
          const row = rowData[i];
          if (!row) continue;
          
          const obj: Record<string, string> = {};
          
          for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            if (!header) continue;
            
            const cellValue = row[j];
            obj[header] = (cellValue !== undefined && cellValue !== null) ? cellValue : '';
          }
          
          objects.push(obj);
        }
        
        return objects;
      },
      
      raw(): string[][] {
        return rowData;
      },
      
      rowsHash(): Record<string, string> {
        const hash: Record<string, string> = {};
        
        for (const row of rowData) {
          if (row && row.length >= 2 && row[0] !== undefined && row[1] !== undefined) {
            hash[row[0]] = row[1];
          }
        }
        
        return hash;
      },
      
      rowsWithoutHeader(): string[][] {
        return rowData.slice(1);
      }
    };
    
    return dataTable;
  }
  
  tableToObjects(table: DataTable): any[] {
    const rawRows = table.raw();
    
    if (rawRows.length < 2) {
      throw new Error('Table must have at least header row and one data row to convert to objects');
    }
    
    const headers = rawRows[0];
    if (!headers) {
      throw new Error('Table must have header row');
    }
    
    const objects: any[] = [];
    
    // Validate headers
    const headerSet = new Set<string>();
    for (const header of headers) {
      if (!header) {
        throw new Error('Empty header found');
      }
      if (headerSet.has(header)) {
        throw new Error(`Duplicate header found: ${header}`);
      }
      headerSet.add(header);
    }
    
    // Convert rows to objects
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row) continue;
      
      const obj: any = {};
      
      if (row.length !== headers.length) {
        throw new Error(`Row ${i} has ${row.length} cells but expected ${headers.length}`);
      }
      
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const value = row[j];
        
        if (!header) continue;
        
        // Handle nested properties
        if (header.includes('.')) {
          this.setNestedProperty(obj, header, value !== undefined ? value : '');
        } else {
          obj[header] = this.parseValue(value !== undefined ? value : '');
        }
      }
      
      objects.push(obj);
    }
    
    return objects;
  }
  
  tableToMap(table: DataTable): Map<string, string> {
    const map = new Map<string, string>();
    const rawRows = table.raw();
    
    for (const row of rawRows) {
      if (!row || row.length !== 2) {
        throw new Error('Table must have exactly 2 columns to convert to map');
      }
      
      const key = row[0];
      const value = row[1];
      
      if (key === undefined || key === null) {
        throw new Error('Key cannot be null or undefined');
      }
      
      if (map.has(key)) {
        throw new Error(`Duplicate key found: ${key}`);
      }
      
      map.set(key, value !== undefined && value !== null ? value : '');
    }
    
    return map;
  }
  
  tableToArrays(table: DataTable): string[][] {
    return table.raw();
  }
  
  transpose(table: DataTable): DataTable {
    const rawRows = table.raw();
    
    if (rawRows.length === 0) {
      return table;
    }
    
    const firstRow = rawRows[0];
    if (!firstRow) {
      return table;
    }
    
    const columnCount = firstRow.length;
    const transposedRows: string[][] = [];
    
    for (let col = 0; col < columnCount; col++) {
      const cells: string[] = [];
      
      for (let row = 0; row < rawRows.length; row++) {
        const currentRow = rawRows[row];
        if (!currentRow || currentRow.length <= col || currentRow[col] === undefined) {
          cells.push('');
        } else {
          const cellValue = currentRow[col];
          cells.push(cellValue !== undefined ? cellValue : '');
        }
      }
      
      transposedRows.push(cells);
    }
    
    return this.createDataTable(transposedRows);
  }
  
  private setNestedProperty(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      
      if (!current[part]) {
        current[part] = {};
      }
      
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = this.parseValue(value);
    }
  }
  
  private parseValue(value: string): any {
    if (value === '' || value === 'null') {
      return null;
    }
    
    if (value === 'true') {
      return true;
    }
    
    if (value === 'false') {
      return false;
    }
    
    // Number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // Array
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value);
      } catch {
        // If JSON parse fails, treat as string
      }
    }
    
    // Object
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        return JSON.parse(value);
      } catch {
        // If JSON parse fails, treat as string
      }
    }
    
    return value;
  }
  
  registerTransform(name: string, transform: TableTransform): void {
    this.transforms.set(name, transform);
  }
  
  applyTransform(table: DataTable, transformName: string): any {
    const transform = this.transforms.get(transformName);
    
    if (!transform) {
      throw new Error(`Unknown table transform: ${transformName}`);
    }
    
    return transform(table);
  }
  
  private registerDefaultTransforms(): void {
    // Objects transform
    this.registerTransform('objects', (table) => this.tableToObjects(table));
    
    // Map transform
    this.registerTransform('map', (table) => this.tableToMap(table));
    
    // Arrays transform
    this.registerTransform('arrays', (table) => this.tableToArrays(table));
    
    // Transpose transform
    this.registerTransform('transpose', (table) => this.transpose(table));
    
    // Vertical map transform (first column as keys)
    this.registerTransform('verticalMap', (table) => {
      const map = new Map<string, any>();
      const rawRows = table.raw();
      
      for (const row of rawRows) {
        if (row && row.length >= 2) {
          const key = row[0];
          if (key === undefined || key === null) {
            continue;
          }
          const values = row.slice(1);
          
          map.set(key, values.length === 1 ? values[0] : values);
        }
      }
      
      return map;
    });
    
    // Horizontal map transform (headers as keys)
    this.registerTransform('horizontalMap', (table) => {
      const rawRows = table.raw();
      
      if (rawRows.length !== 2) {
        throw new Error('Horizontal map requires exactly 2 rows');
      }
      
      const keys = rawRows[0];
      const values = rawRows[1];
      
      if (!keys || !values) {
        throw new Error('Invalid table structure for horizontal map');
      }
      
      const map = new Map<string, string>();
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === undefined || key === null) {
          continue;
        }
        const value = values[i];
        map.set(key, value !== undefined && value !== null ? value : '');
      }
      
      return map;
    });
  }
  
  validateTable(table: DataTable): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const rawRows = table.raw();
    
    if (!rawRows || rawRows.length === 0) {
      errors.push('Table must have at least one row');
    }
    
    // Check consistent column count
    let columnCount: number | null = null;
    
    rawRows.forEach((row, index) => {
      if (columnCount === null) {
        columnCount = row.length;
      } else if (row.length !== columnCount) {
        errors.push(`Row ${index + 1} has ${row.length} columns but expected ${columnCount}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  formatTable(table: DataTable, options?: { padding?: number; alignments?: string[] }): string {
    const padding = options?.padding || 1;
    const alignments = options?.alignments || [];
    const rawRows = table.raw();
    
    // Calculate column widths
    const columnWidths: number[] = [];
    
    rawRows.forEach(row => {
      if (!row) return;
      row.forEach((cell, index) => {
        if (cell === undefined || cell === null) return;
        const cellLength = cell.length;
        if (!columnWidths[index] || cellLength > columnWidths[index]) {
          columnWidths[index] = cellLength;
        }
      });
    });
    
    // Format rows
    const formattedRows: string[] = [];
    
    rawRows.forEach(row => {
      if (!row) return;
      const cells = row.map((cell, index) => {
        const width = columnWidths[index] || 0;
        const alignment = alignments[index] || 'left';
        const cellValue = cell !== undefined && cell !== null ? cell : '';
        
        return this.padCell(cellValue, width, alignment, padding);
      });
      
      formattedRows.push(`| ${cells.join(' | ')} |`);
    });
    
    return formattedRows.join('\n');
  }
  
  private padCell(text: string, width: number, alignment: string, padding: number): string {
    const totalWidth = width + (padding * 2);
    const paddedText = ' '.repeat(padding) + text + ' '.repeat(padding);
    
    if (alignment === 'right') {
      return paddedText.padStart(totalWidth);
    } else if (alignment === 'center') {
      const leftPad = Math.floor((totalWidth - text.length) / 2);
      const rightPad = totalWidth - text.length - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    } else {
      return paddedText.padEnd(totalWidth);
    }
  }
}

// Export singleton instance
export const dataTableParser = DataTableParser.getInstance();