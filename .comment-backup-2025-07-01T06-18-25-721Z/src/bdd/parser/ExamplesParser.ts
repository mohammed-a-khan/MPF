import { Examples, Scenario, ScenarioOutline, Step } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { dataTableParser } from './DataTableParser';

interface Placeholder {
  name: string;
  positions: Array<{ step: number; start: number; end: number }>;
}

export class ExamplesParser {
  private static instance: ExamplesParser;
  private readonly placeholderPattern = /<([^>]+)>/g;
  private readonly maxExamplesPerScenario = 1000; // Safety limit
  
  private constructor() {}
  
  static getInstance(): ExamplesParser {
    if (!ExamplesParser.instance) {
      ExamplesParser.instance = new ExamplesParser();
    }
    return ExamplesParser.instance;
  }

  /**
   * Parse examples and return scenarios
   */
  parse(examples: Examples): Scenario[] {
    // This method would be used when examples are parsed standalone
    // For practical purposes, return empty array as examples need scenario context
    Logger.getInstance().debug(`Parsed examples table "${examples.name}" with ${examples.rows.length} rows`);
    return [];
  }
  
  parseExamples(lines: string[]): Examples {
    if (lines.length === 0) {
      throw new Error('Examples section cannot be empty');
    }
    
    // First line might be the Examples: keyword with optional description
    let startIndex = 0;
    let name = 'Examples';
    let description = '';
    
    const firstLine = lines[0];
    if (!firstLine) {
      throw new Error('Examples section cannot be empty');
    }
    const trimmedFirstLine = firstLine.trim();
    if (trimmedFirstLine.startsWith('Examples:')) {
      name = trimmedFirstLine.substring('Examples:'.length).trim() || 'Examples';
      startIndex = 1;
      
      // Check for description lines
      while (startIndex < lines.length) {
        const currentLine = lines[startIndex];
        if (!currentLine) {
          startIndex++;
          continue;
        }
        const trimmedLine = currentLine.trim();
        if (trimmedLine.startsWith('|')) {
          break;
        }
        if (trimmedLine) {
          description += trimmedLine + '\n';
        }
        startIndex++;
      }
    }
    
    // Parse the table
    const tableLines = lines.slice(startIndex);
    const dataTable = dataTableParser.parseTable(tableLines);
    
    if (dataTable.rows.length < 2) {
      throw new Error('Examples table must have header row and at least one data row');
    }
    
    const examples: Examples = {
      name: name,
      description: description.trim(),
      tags: [], // Tags will be set by parser
      header: dataTable.rows[0] || [],
      rows: dataTable.rows.slice(1),
      line: 0 // Will be set by parser
    };
    
    this.validateExamples(examples);
    
    return examples;
  }
  
  expandScenarioOutline(outline: ScenarioOutline): Scenario[] {
    const scenarios: Scenario[] = [];
    const allExamples = outline.examples || [];
    
    if (allExamples.length === 0) {
      throw new Error(`Scenario Outline "${outline.name}" has no examples`);
    }
    
    // Find all placeholders in the scenario
    const placeholders = this.findPlaceholders(outline);
    
    // Expand for each examples table
    for (const examples of allExamples) {
      const expandedFromTable = this.expandWithExamples(outline, examples, placeholders);
      scenarios.push(...expandedFromTable);
      
      if (scenarios.length > this.maxExamplesPerScenario) {
        Logger.getInstance().warn(`Scenario Outline "${outline.name}" generates ${scenarios.length} scenarios, which exceeds the safety limit`);
        break;
      }
    }
    
    return scenarios;
  }
  
  private expandWithExamples(
    outline: ScenarioOutline, 
    examples: Examples,
    placeholders: Map<string, Placeholder>
  ): Scenario[] {
    const scenarios: Scenario[] = [];
    
    // Validate all placeholders exist in examples
    this.validatePlaceholders(outline, examples, placeholders);
    
    // Create a scenario for each row
    examples.rows.forEach((row) => {
      const values = new Map<string, string>();
      
      // Map headers to values
      examples.header.forEach((header, colIndex) => {
        values.set(header, row[colIndex] || '');
      });
      
      // Create expanded scenario
      const scenario: Scenario = {
        type: 'scenario',
        name: this.expandText(outline.name, values),
        description: this.expandText(outline.description || '', values),
        tags: [...(outline.tags || []), ...(examples.tags || [])],
        steps: this.expandSteps(outline.steps, values)
      };
      
      if (outline.line !== undefined) {
        scenario.line = outline.line;
      }
      
      scenarios.push(scenario);
    });
    
    return scenarios;
  }
  
  private findPlaceholders(outline: ScenarioOutline): Map<string, Placeholder> {
    const placeholders = new Map<string, Placeholder>();
    
    // Check scenario name
    this.extractPlaceholders(outline.name, -1, placeholders);
    
    // Check steps
    outline.steps.forEach((step, stepIndex) => {
      // Check step text
      this.extractPlaceholders(step.text, stepIndex, placeholders);
      
      // Check data table
      if (step.dataTable) {
        step.dataTable.rows.forEach(row => {
          row.forEach(cell => {
            this.extractPlaceholders(cell, stepIndex, placeholders);
          });
        });
      }
      
      // Check doc string
      if (step.docString) {
        this.extractPlaceholders(step.docString.content, stepIndex, placeholders);
      }
    });
    
    return placeholders;
  }
  
  private extractPlaceholders(
    text: string, 
    stepIndex: number, 
    placeholders: Map<string, Placeholder>
  ): void {
    let match;
    this.placeholderPattern.lastIndex = 0; // Reset regex
    
    while ((match = this.placeholderPattern.exec(text)) !== null) {
      const name = match[1];
      if (!name) continue;
      
      const position = {
        step: stepIndex,
        start: match.index,
        end: match.index + match[0].length
      };
      
      const existing = placeholders.get(name);
      if (existing) {
        existing.positions.push(position);
      } else {
        placeholders.set(name, {
          name: name,
          positions: [position]
        });
      }
    }
  }
  
  private validatePlaceholders(
    outline: ScenarioOutline,
    examples: Examples,
    placeholders: Map<string, Placeholder>
  ): void {
    const missingHeaders: string[] = [];
    
    placeholders.forEach((_placeholder, name) => {
      if (!examples.header.includes(name)) {
        missingHeaders.push(name);
      }
    });
    
    if (missingHeaders.length > 0) {
      throw new Error(
        `Scenario Outline "${outline.name}" has placeholders not found in examples "${examples.name}": <${missingHeaders.join('>, <')}>`
      );
    }
    
    // Warn about unused headers
    const unusedHeaders = examples.header.filter(header => !placeholders.has(header));
    if (unusedHeaders.length > 0) {
      Logger.getInstance().warn(
        `Examples "${examples.name}" has unused headers: ${unusedHeaders.join(', ')}`
      );
    }
  }
  
  private expandText(text: string, values: Map<string, string>): string {
    return text.replace(this.placeholderPattern, (match, placeholder) => {
      if (values.has(placeholder)) {
        return values.get(placeholder)!;
      }
      // Keep original if no value found
      return match;
    });
  }
  
  private expandSteps(steps: Step[], values: Map<string, string>): Step[] {
    return steps.map(step => {
      const expandedStep: Step = {
        ...step,
        text: this.expandText(step.text, values)
      };
      
      // Expand data table
      if (step.dataTable) {
        expandedStep.dataTable = {
          ...step.dataTable,
          rows: step.dataTable.rows.map(row => 
            row.map(cell => this.expandText(cell, values))
          )
        };
      }
      
      // Expand doc string
      if (step.docString) {
        expandedStep.docString = {
          ...step.docString,
          content: this.expandText(step.docString.content, values)
        };
      }
      
      return expandedStep;
    });
  }
  
  private validateExamples(examples: Examples): void {
    // Check for duplicate headers
    const headerSet = new Set<string>();
    const duplicates: string[] = [];
    
    examples.header.forEach(header => {
      if (headerSet.has(header)) {
        duplicates.push(header);
      }
      headerSet.add(header);
    });
    
    if (duplicates.length > 0) {
      throw new Error(`Examples table has duplicate headers: ${duplicates.join(', ')}`);
    }
    
    // Check for empty headers
    const emptyHeaders = examples.header.filter(h => !h || h.trim() === '');
    if (emptyHeaders.length > 0) {
      throw new Error('Examples table cannot have empty headers');
    }
    
    // Validate each row has correct number of cells
    examples.rows.forEach((row, index) => {
      if (row.length !== examples.header.length) {
        throw new Error(
          `Examples table row ${index + 2} has ${row.length} cells but expected ${examples.header.length}`
        );
      }
    });
  }
  
  generateExamplesTable(
    headers: string[], 
    rows: string[][], 
    options?: { name?: string; tags?: string[] }
  ): Examples {
    if (headers.length === 0) {
      throw new Error('Examples table must have at least one header');
    }
    
    if (rows.length === 0) {
      throw new Error('Examples table must have at least one data row');
    }
    
    // Validate all rows have same number of cells as headers
    rows.forEach((row, index) => {
      if (row.length !== headers.length) {
        throw new Error(
          `Row ${index + 1} has ${row.length} cells but expected ${headers.length}`
        );
      }
    });
    
    const examples: Examples = {
      name: options?.name || 'Examples',
      description: '',
      tags: options?.tags || [],
      header: headers,
      rows: rows,
      line: 0
    };
    
    return examples;
  }
  
  mergeExamples(examples1: Examples, examples2: Examples): Examples {
    // Merge headers (union)
    const headerSet = new Set([...examples1.header, ...examples2.header]);
    const mergedHeaders = Array.from(headerSet);
    
    // Create index maps
    const indexMap1 = new Map<string, number>();
    const indexMap2 = new Map<string, number>();
    
    examples1.header.forEach((h, i) => indexMap1.set(h, i));
    examples2.header.forEach((h, i) => indexMap2.set(h, i));
    
    // Merge rows
    const mergedRows: string[][] = [];
    
    // Add rows from examples1
    examples1.rows.forEach(row => {
      const newRow: string[] = new Array(mergedHeaders.length).fill('');
      
      row.forEach((cell, index) => {
        const header = examples1.header[index];
        if (!header) return;
        const newIndex = mergedHeaders.indexOf(header);
        newRow[newIndex] = cell;
      });
      
      mergedRows.push(newRow);
    });
    
    // Add rows from examples2
    examples2.rows.forEach(row => {
      const newRow: string[] = new Array(mergedHeaders.length).fill('');
      
      row.forEach((cell, index) => {
        const header = examples2.header[index];
        if (!header) return;
        const newIndex = mergedHeaders.indexOf(header);
        newRow[newIndex] = cell;
      });
      
      mergedRows.push(newRow);
    });
    
    const merged: Examples = {
      name: `${examples1.name} + ${examples2.name}`,
      description: [examples1.description, examples2.description].filter(d => d).join('\n'),
      tags: Array.from(new Set([...examples1.tags, ...examples2.tags])),
      header: mergedHeaders,
      rows: mergedRows
    };
    
    if (examples1.line !== undefined) {
      merged.line = examples1.line;
    }
    
    return merged;
  }
  
  filterExamples(examples: Examples, predicate: (row: any) => boolean): Examples {
    const allRows = [examples.header, ...examples.rows];
    const dataTable = dataTableParser.parseTable(
      allRows.map(row => '| ' + row.join(' | ') + ' |')
    );
    
    const objects = dataTableParser.tableToObjects(dataTable);
    const filteredObjects = objects.filter(predicate);
    
    if (filteredObjects.length === 0) {
      Logger.getInstance().warn('Filter resulted in empty examples table');
    }
    
    // Convert back to table format
    const filteredRows = filteredObjects.map(obj => {
      return examples.header.map(header => String(obj[header] ?? ''));
    });
    
    return {
      ...examples,
      rows: filteredRows
    };
  }
}

// Export singleton instance
export const examplesParser = ExamplesParser.getInstance();