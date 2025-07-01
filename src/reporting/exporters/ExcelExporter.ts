// src/reporting/exporters/ExcelExporter.ts

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { 
  ExportResult, 
  ExportOptions, 
  ExecutionResult, 
  ExportFormat,
  TestStatus
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

interface ExcelExportOptions extends ExportOptions {
  format: ExportFormat;
  includeCharts?: boolean;
  includeMetrics?: boolean;
  includeScreenshots?: boolean;
  includeLogs?: boolean;
  autoFilter?: boolean;
  freezePanes?: boolean;
  conditionalFormatting?: boolean;
  chartType?: 'bar' | 'line' | 'pie' | 'doughnut' | 'area';
  theme?: 'default' | 'colorful' | 'professional' | 'dark';
  maxRowsPerSheet?: number;
  compression?: boolean;
}

export class ExcelExporter {
  private logger = Logger.getInstance('ExcelExporter');
  private workbook: XLSX.WorkBook | null = null;
  private readonly brandColor = '#93186C';
  private readonly maxCellLength = 32767;
  
  async export(
    result: ExecutionResult,
    outputPath: string,
    options: ExcelExportOptions = { format: ExportFormat.EXCEL }
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting Excel export', { outputPath, options });

      this.workbook = XLSX.utils.book_new();
      this.workbook.Props = {
        Title: 'CS Test Automation Report',
        Subject: 'Test Execution Results',
        Author: 'CS Test Framework',
        Manager: result.environment,
        Company: 'CS',
        Category: 'Test Report',
        Keywords: 'automation,test,report',
        Comments: `Generated on ${new Date().toISOString()}`,
        LastAuthor: 'CS Test Framework',
        CreatedDate: new Date()
      };

      await this.addSummarySheet(result, options);
      await this.addDetailedResultsSheet(result, options);
      await this.addFeatureResultsSheet(result, options);
      await this.addStepDetailsSheet(result, options);
      
      if (options.includeMetrics) {
        await this.addMetricsSheet(result, options);
        await this.addPerformanceSheet(result, options);
      }
      
      if (options.includeLogs) {
        await this.addLogsSheet(result, options);
      }
      
      if (options.includeScreenshots) {
        await this.addScreenshotsSheet(result, options);
      }

      if (options.includeCharts) {
        await this.addChartsSheet(result, options);
      }

      const buffer = XLSX.write(this.workbook, {
        bookType: 'xlsx',
        bookSST: true,
        type: 'buffer',
        compression: options.compression !== false,
        Props: this.workbook.Props
      });

      await FileUtils.ensureDir(path.dirname(outputPath));
      
      await fs.promises.writeFile(outputPath, buffer);

      const fileStats = await fs.promises.stat(outputPath);
      
      this.logger.info('Excel export completed', { 
        exportTime: Date.now() - startTime,
        fileSize: fileStats.size,
        sheets: Object.keys(this.workbook.Sheets).length
      });

      return {
        success: true,
        filePath: outputPath,
        format: ExportFormat.EXCEL,
        size: fileStats.size
      };

    } catch (error) {
      this.logger.error('Excel export failed', error as Error);
      return {
        success: false,
        format: ExportFormat.EXCEL,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async addSummarySheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const ws = XLSX.utils.aoa_to_sheet([]);
    const data: any[][] = [];
    
    data.push(['CS Test Automation Report']);
    data.push(['']);
    data.push(['Test Execution Summary']);
    data.push(['']);

    data.push(['Execution Overview']);
    data.push(['Metric', 'Value']);
    data.push(['Execution ID', result.executionId]);
    data.push(['Environment', result.environment]);
    data.push(['Start Time', this.formatDateTime(result.startTime)]);
    data.push(['End Time', this.formatDateTime(result.endTime)]);
    data.push(['Duration', this.formatDuration(result.duration)]);
    data.push(['Total Features', result.totalFeatures]);
    data.push(['Total Scenarios', result.totalScenarios]);
    data.push(['Total Steps', result.totalSteps]);
    data.push(['']);

    data.push(['Test Results']);
    data.push(['Status', 'Count', 'Percentage']);
    const total = result.totalScenarios || 1;
    data.push(['Passed', result.passedScenarios, result.passedScenarios / total]);
    data.push(['Failed', result.failedScenarios, result.failedScenarios / total]);
    data.push(['Skipped', result.skippedScenarios, result.skippedScenarios / total]);
    data.push(['']);

    data.push(['Overall Pass Rate', '', result.passedScenarios / total]);
    data.push(['']);

    if (result.tags && result.tags.length > 0) {
      data.push(['Tag Summary']);
      data.push(['Tag', 'Count', 'Pass Rate']);
      result.tags.forEach(tag => {
        data.push([tag, '', '']);
      });
    }

    XLSX.utils.sheet_add_aoa(ws, data);

    this.applySummaryFormatting(ws, data.length, options, data);

    ws['!cols'] = [
      { wch: 30 },
      { wch: 20 },
      { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Summary');
  }

  private applySummaryFormatting(ws: XLSX.WorkSheet, _rowCount: number, options: ExcelExportOptions, data: any[][]): void {
    this.setCellStyle(ws, 'A1', {
      font: { bold: true, sz: 18, color: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    this.mergeCells(ws, 'A1:C1');

    this.setCellStyle(ws, 'A3', {
      font: { bold: true, sz: 16, color: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center' }
    });
    this.mergeCells(ws, 'A3:C3');

    ['A5', 'A16'].forEach(cell => {
      if (ws[cell]) {
        this.setCellStyle(ws, cell, {
          font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: this.brandColor.substring(1) } },
          alignment: { horizontal: 'left' }
        });
        
        const row = parseInt(cell.substring(1));
        this.mergeCells(ws, `A${row}:C${row}`);
      }
    });

    this.setRangeStyle(ws, 'A6:B6', {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E0E0E0' } },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    });

    this.setRangeStyle(ws, 'A17:C17', {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E0E0E0' } },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    });


    for (let i = 18; i <= 20; i++) {
      const cell = ws[`C${i}`];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '0.00%';
      }
    }

    const passRateRow = data.findIndex((row: any[]) => row[0] === 'Overall Pass Rate') + 1;
    if (passRateRow > 0) {
      this.setCellStyle(ws, `A${passRateRow}`, {
        font: { bold: true, sz: 12 }
      });
      this.mergeCells(ws, `A${passRateRow}:B${passRateRow}`);
      
      const passRateCell = ws[`C${passRateRow}`];
      if (passRateCell) {
        passRateCell.t = 'n';
        passRateCell.z = '0.00%';
        
        const passRate = passRateCell.v as number;
        if (passRate >= 0.95) {
          this.setCellStyle(ws, `C${passRateRow}`, {
            font: { bold: true, color: { rgb: '008000' } },
            fill: { fgColor: { rgb: 'E8F5E9' } }
          });
        } else if (passRate >= 0.80) {
          this.setCellStyle(ws, `C${passRateRow}`, {
            font: { bold: true, color: { rgb: 'FFA500' } },
            fill: { fgColor: { rgb: 'FFF3E0' } }
          });
        } else {
          this.setCellStyle(ws, `C${passRateRow}`, {
            font: { bold: true, color: { rgb: 'FF0000' } },
            fill: { fgColor: { rgb: 'FFEBEE' } }
          });
        }
      }
    }

    for (let row = 7; row <= 14; row++) {
      for (let col = 0; col < 2; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        if (ws[cellAddr]) {
          this.addBorder(ws, cellAddr);
        }
      }
    }

    for (let row = 18; row <= 20; row++) {
      for (let col = 0; col < 3; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        if (ws[cellAddr]) {
          this.addBorder(ws, cellAddr);
        }
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: 'A17:C20' };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 6, topLeftCell: 'A7' };
    }
  }

  private async addDetailedResultsSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const headers = ['Feature', 'Scenario', 'Status', 'Duration', 'Start Time', 'End Time', 'Tags', 'Error Message'];
    const data: any[][] = [headers];

    result.features.forEach(feature => {
      feature.scenarios.forEach(scenario => {
        data.push([
          feature.feature,
          scenario.name,
          scenario.status.toUpperCase(),
          this.formatDuration(scenario.duration),
          '',
          '',
          '',
          ''
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    this.applyDetailedResultsFormatting(ws, data.length, options);

    ws['!cols'] = [
      { wch: 40 },
      { wch: 40 },
      { wch: 10 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
      { wch: 50 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Detailed Results');
  }

  private applyDetailedResultsFormatting(ws: XLSX.WorkSheet, rowCount: number, options: ExcelExportOptions): void {
    this.setRangeStyle(ws, 'A1:H1', {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    });

    for (let row = 2; row <= rowCount; row++) {
      const statusCell = ws[`C${row}`];
      if (statusCell) {
        const status = statusCell.v as string;
        let style: any = {};
        
        switch (status.toUpperCase()) {
          case 'PASSED':
            style = {
              font: { bold: true, color: { rgb: '008000' } },
              fill: { fgColor: { rgb: 'E8F5E9' } }
            };
            break;
          case 'FAILED':
            style = {
              font: { bold: true, color: { rgb: 'FF0000' } },
              fill: { fgColor: { rgb: 'FFEBEE' } }
            };
            break;
          case 'SKIPPED':
            style = {
              font: { bold: true, color: { rgb: 'FFA500' } },
              fill: { fgColor: { rgb: 'FFF3E0' } }
            };
            break;
        }
        
        this.setCellStyle(ws, `C${row}`, style);
      }


      for (let col = 0; col < 8; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        this.addBorder(ws, cellAddr);
      }

      const errorCell = ws[`H${row}`];
      if (errorCell) {
        this.setCellStyle(ws, `H${row}`, {
          alignment: { wrapText: true, vertical: 'top' }
        });
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: `A1:H${rowCount}` };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    }

    ws['!rows'] = [];
    for (let i = 0; i < rowCount; i++) {
      ws['!rows'][i] = { hpt: i === 0 ? 25 : 20 };
    }
  }

  private async addFeatureResultsSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const headers = ['Feature', 'Total Scenarios', 'Passed', 'Failed', 'Skipped', 'Pass Rate', 'Avg Duration', 'Total Duration'];
    const data: any[][] = [headers];

    result.features.forEach(feature => {
      const total = feature.scenarios.length;
      const passed = feature.scenarios.filter(s => s.status === 'passed').length;
      const failed = feature.scenarios.filter(s => s.status === 'failed').length;
      const skipped = feature.scenarios.filter(s => s.status === 'skipped').length;
      const passRate = total > 0 ? passed / total : 0;
      const totalDuration = feature.scenarios.reduce((sum, s) => sum + s.duration, 0);
      const avgDuration = total > 0 ? totalDuration / total : 0;

      data.push([
        feature.feature,
        total,
        passed,
        failed,
        skipped,
        passRate,
        this.formatDuration(avgDuration),
        this.formatDuration(totalDuration)
      ]);
    });

    const totalScenarios = result.totalScenarios;
    const totalPassed = result.passedScenarios;
    const totalFailed = result.failedScenarios;
    const totalSkipped = result.skippedScenarios;
    const overallPassRate = totalScenarios > 0 ? totalPassed / totalScenarios : 0;
    
    data.push([
      'TOTAL',
      totalScenarios,
      totalPassed,
      totalFailed,
      totalSkipped,
      overallPassRate,
      '',
      this.formatDuration(result.duration)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    this.applyFeatureResultsFormatting(ws, data.length, options);

    ws['!cols'] = [
      { wch: 50 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Feature Results');
  }

  private applyFeatureResultsFormatting(ws: XLSX.WorkSheet, rowCount: number, options: ExcelExportOptions): void {
    this.setRangeStyle(ws, 'A1:H1', {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    });

    for (let row = 2; row < rowCount; row++) {
      const passRateCell = ws[`F${row}`];
      if (passRateCell && typeof passRateCell.v === 'number') {
        passRateCell.t = 'n';
        passRateCell.z = '0.00%';
        
        const rate = passRateCell.v as number;
        if (rate >= 0.95) {
          this.setCellStyle(ws, `F${row}`, {
            font: { color: { rgb: '008000' } },
            fill: { fgColor: { rgb: 'E8F5E9' } }
          });
        } else if (rate >= 0.80) {
          this.setCellStyle(ws, `F${row}`, {
            font: { color: { rgb: 'FFA500' } },
            fill: { fgColor: { rgb: 'FFF3E0' } }
          });
        } else {
          this.setCellStyle(ws, `F${row}`, {
            font: { color: { rgb: 'FF0000' } },
            fill: { fgColor: { rgb: 'FFEBEE' } }
          });
        }
      }

      ['B', 'C', 'D', 'E'].forEach(col => {
        this.setCellStyle(ws, `${col}${row}`, {
          alignment: { horizontal: 'center' }
        });
      });

      for (let col = 0; col < 8; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        this.addBorder(ws, cellAddr);
      }
    }

    const totalRow = rowCount;
    this.setRangeStyle(ws, `A${totalRow}:H${totalRow}`, {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E0E0E0' } },
      border: {
        top: { style: 'double', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    });

    const totalPassRateCell = ws[`F${totalRow}`];
    if (totalPassRateCell) {
      totalPassRateCell.t = 'n';
      totalPassRateCell.z = '0.00%';
    }

    if (options.conditionalFormatting) {
      for (let row = 2; row < rowCount; row++) {
        const passedCell = ws[`C${row}`];
        const failedCell = ws[`D${row}`];
        const skippedCell = ws[`E${row}`];
        
        if (passedCell && passedCell.v > 0) {
          this.setCellStyle(ws, `C${row}`, {
            font: { color: { rgb: '008000' } }
          });
        }
        
        if (failedCell && failedCell.v > 0) {
          this.setCellStyle(ws, `D${row}`, {
            font: { color: { rgb: 'FF0000' } }
          });
        }
        
        if (skippedCell && skippedCell.v > 0) {
          this.setCellStyle(ws, `E${row}`, {
            font: { color: { rgb: 'FFA500' } }
          });
        }
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: `A1:H${rowCount - 1}` };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    }
  }

  private async addStepDetailsSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const headers = ['Feature', 'Scenario', 'Step #', 'Keyword', 'Step Text', 'Status', 'Duration', 'Error'];
    const data: any[][] = [headers];
    let currentRow = 2;

    const scenarios = result.scenarios || [];
    for (const scenario of scenarios) {
      if (scenario.steps && scenario.steps.length > 0) {
        const feature = result.features.find(f => f.featureId === scenario.featureId);
        const featureName = feature?.feature || scenario.feature || 'Unknown Feature';
        
        scenario.steps.forEach((step, index) => {
          data.push([
            featureName,
            scenario.scenario,
            index + 1,
            step.keyword,
            step.text,
            step.status.toUpperCase(),
            this.formatDuration(step.duration),
            step.result?.error?.message || ''
          ]);
          currentRow++;
          
          if (options.maxRowsPerSheet && currentRow > options.maxRowsPerSheet) {
            this.createStepDetailsContinuation(data, currentRow);
            data.length = 1;
            data[0] = headers;
            currentRow = 2;
          }
        });
      }
    }

    if (data.length === 1) {
      data.push(['No step details available', '', '', '', '', '', '', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyStepDetailsFormatting(ws, data.length, options);

    ws['!cols'] = [
      { wch: 40 },
      { wch: 40 },
      { wch: 8 },
      { wch: 10 },
      { wch: 60 },
      { wch: 10 },
      { wch: 12 },
      { wch: 50 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Step Details');
  }

  private createStepDetailsContinuation(data: any[][], lastRow: number): void {
    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyStepDetailsFormatting(ws, lastRow, { format: ExportFormat.EXCEL, autoFilter: false, freezePanes: false });
    
    const sheetCount = Object.keys(this.workbook!.Sheets).filter(name => 
      name.startsWith('Step Details')
    ).length;
    
    XLSX.utils.book_append_sheet(this.workbook!, ws, `Step Details ${sheetCount + 1}`);
  }

  private applyStepDetailsFormatting(ws: XLSX.WorkSheet, rowCount: number, options: ExcelExportOptions): void {
    this.setRangeStyle(ws, 'A1:H1', {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
    });

    for (let row = 2; row <= rowCount; row++) {
      const statusCell = ws[`F${row}`];
      if (statusCell) {
        const status = statusCell.v as string;
        let style: any = {};
        
        switch (status.toUpperCase()) {
          case 'PASSED':
            style = {
              font: { bold: true, color: { rgb: '008000' } },
              fill: { fgColor: { rgb: 'E8F5E9' } }
            };
            break;
          case 'FAILED':
            style = {
              font: { bold: true, color: { rgb: 'FF0000' } },
              fill: { fgColor: { rgb: 'FFEBEE' } }
            };
            break;
          case 'SKIPPED':
            style = {
              font: { bold: true, color: { rgb: 'FFA500' } },
              fill: { fgColor: { rgb: 'FFF3E0' } }
            };
            break;
          case 'PENDING':
            style = {
              font: { bold: true, color: { rgb: '0000FF' } },
              fill: { fgColor: { rgb: 'E3F2FD' } }
            };
            break;
        }
        
        this.setCellStyle(ws, `F${row}`, style);
      }

      this.setCellStyle(ws, `C${row}`, {
        alignment: { horizontal: 'center' }
      });

      const keywordCell = ws[`D${row}`];
      if (keywordCell) {
        this.setCellStyle(ws, `D${row}`, {
          font: { bold: true, color: { rgb: '4A148C' } }
        });
      }

      ['E', 'H'].forEach(col => {
        this.setCellStyle(ws, `${col}${row}`, {
          alignment: { wrapText: true, vertical: 'top' }
        });
      });

      for (let col = 0; col < 8; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        this.addBorder(ws, cellAddr);
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: `A1:H${rowCount}` };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    }

    ws['!rows'] = [];
    ws['!rows'][0] = { hpt: 25 };
    for (let i = 1; i < rowCount; i++) {
      ws['!rows'][i] = { hpt: 30 };
    }
  }

  private async addMetricsSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const data: any[][] = [];
    
    data.push(['Performance Metrics Analysis']);
    data.push([]);
    
    data.push(['Execution Metrics']);
    data.push(['Metric', 'Value']);
    data.push(['Total Duration (ms)', result.duration]);
    data.push(['Total Features', result.totalFeatures]);
    data.push(['Total Scenarios', result.totalScenarios]);
    data.push(['Total Steps', result.totalSteps]);
    data.push(['Average Scenario Duration (ms)', result.totalScenarios > 0 ? Math.round(result.duration / result.totalScenarios) : 0]);
    data.push(['Average Step Duration (ms)', result.totalSteps > 0 ? Math.round(result.duration / result.totalSteps) : 0]);
    data.push([]);
    
    data.push(['Success Metrics']);
    data.push(['Metric', 'Count', 'Percentage']);
    data.push(['Passed Features', result.passedFeatures, result.totalFeatures > 0 ? (result.passedFeatures / result.totalFeatures * 100).toFixed(2) + '%' : '0%']);
    data.push(['Passed Scenarios', result.passedScenarios, result.totalScenarios > 0 ? (result.passedScenarios / result.totalScenarios * 100).toFixed(2) + '%' : '0%']);
    data.push(['Passed Steps', result.passedSteps, result.totalSteps > 0 ? (result.passedSteps / result.totalSteps * 100).toFixed(2) + '%' : '0%']);
    data.push([]);
    
    data.push(['Failure Analysis']);
    data.push(['Metric', 'Count', 'Percentage']);
    data.push(['Failed Features', result.failedFeatures, result.totalFeatures > 0 ? (result.failedFeatures / result.totalFeatures * 100).toFixed(2) + '%' : '0%']);
    data.push(['Failed Scenarios', result.failedScenarios, result.totalScenarios > 0 ? (result.failedScenarios / result.totalScenarios * 100).toFixed(2) + '%' : '0%']);
    data.push(['Failed Steps', result.failedSteps, result.totalSteps > 0 ? (result.failedSteps / result.totalSteps * 100).toFixed(2) + '%' : '0%']);
    data.push(['Skipped Features', result.skippedFeatures, result.totalFeatures > 0 ? (result.skippedFeatures / result.totalFeatures * 100).toFixed(2) + '%' : '0%']);
    data.push(['Skipped Scenarios', result.skippedScenarios, result.totalScenarios > 0 ? (result.skippedScenarios / result.totalScenarios * 100).toFixed(2) + '%' : '0%']);
    data.push(['Skipped Steps', result.skippedSteps, result.totalSteps > 0 ? (result.skippedSteps / result.totalSteps * 100).toFixed(2) + '%' : '0%']);
    data.push([]);
    
    if (result.metadata) {
      data.push(['Environment Information']);
      data.push(['Property', 'Value']);
      data.push(['Environment', result.environment]);
      data.push(['Execution ID', result.executionId]);
      data.push(['Start Time', this.formatDateTime(result.startTime)]);
      data.push(['End Time', this.formatDateTime(result.endTime)]);
      
      Object.entries(result.metadata).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          data.push([key, value]);
        }
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyMetricsFormatting(ws, data, options);

    ws['!cols'] = [
      { wch: 30 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, 
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Metrics');
  }

  private applyMetricsFormatting(ws: XLSX.WorkSheet, data: any[][], _options: ExcelExportOptions): void {
    
    this.setCellStyle(ws, 'A1', {
      font: { bold: true, sz: 16, color: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center' }
    });
    this.mergeCells(ws, 'A1:H1');
    
    data.forEach((row, index) => {
      if (row.length === 1 && row[0] && index > 0) {
        const cellAddr = `A${index + 1}`;
        this.setCellStyle(ws, cellAddr, {
          font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: this.brandColor.substring(1) } },
          alignment: { horizontal: 'left' }
        });
        this.mergeCells(ws, `A${index + 1}:H${index + 1}`);
      } else if (row[0] === 'Metric' && row.length > 2) {
        const rowNum = index + 1;
        this.setRangeStyle(ws, `A${rowNum}:H${rowNum}`, {
          font: { bold: true },
          fill: { fgColor: { rgb: 'E0E0E0' } },
          border: {
            bottom: { style: 'thin', color: { rgb: '000000' } }
          }
        });
      } else if (row.length > 1 && typeof row[1] === 'number') {
        for (let col = 1; col < row.length; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r: index, c: col });
          if (ws[cellAddr] && typeof ws[cellAddr].v === 'number') {
            ws[cellAddr].t = 'n';
            ws[cellAddr].z = '#,##0.00';
            
            if (row[0].includes('Page Load Time') || row[0].includes('FCP') || row[0].includes('LCP')) {
              const value = ws[cellAddr].v as number;
              if (value > 3000) {
                this.setCellStyle(ws, cellAddr, {
                  font: { color: { rgb: 'FF0000' } }
                });
              } else if (value > 1000) {
                this.setCellStyle(ws, cellAddr, {
                  font: { color: { rgb: 'FFA500' } }
                });
              } else {
                this.setCellStyle(ws, cellAddr, {
                  font: { color: { rgb: '008000' } }
                });
              }
            }
          }
        }
      }
    });
  }

  private async addPerformanceSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const headers = ['Scenario', 'Feature', 'Duration (ms)', 'Status', 'Pass Rate', 'Retry Count', 'Tags', 'Error Count', 'Performance'];
    const data: any[][] = [headers];

    const scenarios = result.scenarios || [];
    
    for (const scenario of scenarios) {
      const feature = result.features.find(f => f.featureId === scenario.featureId);
      const featureName = feature?.feature || scenario.feature || 'Unknown';
      
      let errorCount = 0;
      let passRate = 0;
      
      if (scenario.steps && scenario.steps.length > 0) {
        const passedSteps = scenario.steps.filter(s => s.status === TestStatus.PASSED).length;
        passRate = (passedSteps / scenario.steps.length) * 100;
        errorCount = scenario.steps.filter(s => s.status === TestStatus.FAILED).length;
      }
      
      let performance = 'Good';
      if (scenario.duration > 10000) performance = 'Slow';
      else if (scenario.duration > 5000) performance = 'Average';
      else if (scenario.duration < 1000) performance = 'Excellent';
      
      data.push([
        scenario.scenario,
        featureName,
        scenario.duration,
        scenario.status.toUpperCase(),
        passRate.toFixed(2) + '%',
        scenario.retryCount || 0,
        scenario.tags?.join(', ') || '',
        errorCount,
        performance
      ]);
    }

    if (data.length === 1 && result.features.length > 0) {
      result.features.forEach(feature => {
        feature.scenarios.forEach(scenario => {
          data.push([
            scenario.name,
            feature.feature,
            scenario.duration,
            scenario.status.toUpperCase(),
            '0%',
            scenario.retryCount || 0,
            '',
            0,
            scenario.duration > 10000 ? 'Slow' : scenario.duration > 5000 ? 'Average' : scenario.duration < 1000 ? 'Excellent' : 'Good'
          ]);
        });
      });
    }

    if (data.length === 1) {
      data.push(['No performance data available', '', '', '', '', '', '', '', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyPerformanceFormatting(ws, data.length, options);

    ws['!cols'] = [
      { wch: 40 },
      { wch: 30 },
      { wch: 15 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Performance');
  }


  private applyPerformanceFormatting(ws: XLSX.WorkSheet, rowCount: number, options: ExcelExportOptions): void {
    this.setRangeStyle(ws, 'A1:I1', {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } }
      }
    });

    for (let row = 2; row <= rowCount; row++) {
      const durationCell = ws[`C${row}`];
      if (durationCell && typeof durationCell.v === 'number') {
        durationCell.t = 'n';
        durationCell.z = '#,##0';
        
        const duration = durationCell.v as number;
        let color = '008000';
        if (duration > 10000) color = 'FF0000';
        else if (duration > 5000) color = 'FFA500';
        
        this.setCellStyle(ws, `C${row}`, {
          font: { color: { rgb: color } }
        });
      }
      
      const statusCell = ws[`D${row}`];
      if (statusCell) {
        const status = statusCell.v as string;
        let style: any = {
          font: { bold: true },
          alignment: { horizontal: 'center' }
        };
        
        switch (status) {
          case 'PASSED':
            style.font.color = { rgb: '008000' };
            style.fill = { fgColor: { rgb: 'E8F5E9' } };
            break;
          case 'FAILED':
            style.font.color = { rgb: 'FF0000' };
            style.fill = { fgColor: { rgb: 'FFEBEE' } };
            break;
          case 'SKIPPED':
            style.font.color = { rgb: 'FFA500' };
            style.fill = { fgColor: { rgb: 'FFF3E0' } };
            break;
        }
        
        this.setCellStyle(ws, `D${row}`, style);
      }
      
      const passRateCell = ws[`E${row}`];
      if (passRateCell) {
        this.setCellStyle(ws, `E${row}`, {
          alignment: { horizontal: 'center' }
        });
      }
      
      const perfCell = ws[`I${row}`];
      if (perfCell) {
        const perf = perfCell.v as string;
        let style: any = {
          font: { bold: true },
          alignment: { horizontal: 'center' }
        };
        
        switch (perf) {
          case 'Excellent':
            style.font.color = { rgb: '008000' };
            style.fill = { fgColor: { rgb: 'E8F5E9' } };
            break;
          case 'Good':
            style.font.color = { rgb: '4CAF50' };
            break;
          case 'Average':
            style.font.color = { rgb: 'FFA500' };
            style.fill = { fgColor: { rgb: 'FFF3E0' } };
            break;
          case 'Slow':
            style.font.color = { rgb: 'FF0000' };
            style.fill = { fgColor: { rgb: 'FFEBEE' } };
            break;
        }
        
        this.setCellStyle(ws, `I${row}`, style);
      }
      
      for (let col = 0; col < 9; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        this.addBorder(ws, cellAddr);
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: `A1:I${rowCount}` };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    }
  }

  private async addLogsSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const headers = ['Timestamp', 'Level', 'Source', 'Category', 'Message'];
    const data: any[][] = [headers];
    
    const scenarios = result.scenarios || [];
    const maxLogs = options.maxRowsPerSheet || 50000;
    let logCount = 0;
    
    for (const scenario of scenarios) {
      if (scenario.status === TestStatus.FAILED && scenario.error) {
        data.push([
          this.formatDateTime(scenario.startTime),
          'ERROR',
          `Scenario: ${scenario.scenario}`,
          'Test Execution',
          this.truncateText(scenario.error.message, this.maxCellLength)
        ]);
        logCount++;
        
        if (logCount >= maxLogs) break;
      }
      
      if (scenario.steps) {
        for (const step of scenario.steps) {
          if (step.status === TestStatus.FAILED && step.result?.error) {
            data.push([
              this.formatDateTime(step.startTime),
              'ERROR',
              `Step: ${step.keyword} ${step.text}`,
              'Step Execution',
              this.truncateText(step.result.error.message, this.maxCellLength)
            ]);
            logCount++;
            
            if (logCount >= maxLogs) break;
          }
        }
      }
      
      if (logCount >= maxLogs) break;
    }
    
    data.push([
      this.formatDateTime(result.startTime),
      'INFO',
      'Test Framework',
      'Execution',
      `Test execution started: ${result.totalScenarios} scenarios, ${result.totalSteps} steps`
    ]);
    
    data.push([
      this.formatDateTime(result.endTime),
      'INFO',
      'Test Framework',
      'Execution',
      `Test execution completed: ${result.passedScenarios} passed, ${result.failedScenarios} failed, ${result.skippedScenarios} skipped`
    ]);
    
    if (data.length === 1) {
      data.push([this.formatDateTime(new Date()), 'INFO', 'System', 'No Data', 'No error logs available for this execution']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyLogsFormatting(ws, data.length, options);

    ws['!cols'] = [
      { wch: 20 },
      { wch: 10 },
      { wch: 25 },
      { wch: 20 },
      { wch: 100 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Logs');
  }

  private applyLogsFormatting(ws: XLSX.WorkSheet, rowCount: number, options: ExcelExportOptions): void {
    this.setRangeStyle(ws, 'A1:E1', {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '000000' } },
        bottom: { style: 'medium', color: { rgb: '000000' } }
      }
    });

    for (let row = 2; row <= rowCount; row++) {
      
      const levelCell = ws[`B${row}`];
      if (levelCell) {
        const level = levelCell.v as string;
        let style: any = {
          font: { bold: true },
          alignment: { horizontal: 'center' }
        };
        
        switch (level.toUpperCase()) {
          case 'ERROR':
            style.font.color = { rgb: 'FF0000' };
            style.fill = { fgColor: { rgb: 'FFEBEE' } };
            break;
          case 'WARN':
          case 'WARNING':
            style.font.color = { rgb: 'FFA500' };
            style.fill = { fgColor: { rgb: 'FFF3E0' } };
            break;
          case 'INFO':
            style.font.color = { rgb: '0000FF' };
            break;
          case 'DEBUG':
            style.font.color = { rgb: '666666' };
            break;
        }
        
        this.setCellStyle(ws, `B${row}`, style);
      }
      
      this.setCellStyle(ws, `E${row}`, {
        alignment: { wrapText: true, vertical: 'top' }
      });
      
      for (let col = 0; col < 5; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        this.addBorder(ws, cellAddr);
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: `A1:E${rowCount}` };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    }

    ws['!rows'] = [];
    ws['!rows'][0] = { hpt: 25 };
    for (let i = 1; i < rowCount; i++) {
      ws['!rows'][i] = { hpt: 40 };
    }
  }

  private async addScreenshotsSheet(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<void> {
    const headers = ['Feature', 'Scenario', 'Step', 'Type', 'Status', 'Timestamp', 'File Path', 'Description'];
    const data: any[][] = [headers];

    const scenarios = result.scenarios || [];
    const screenshotDir = ConfigurationManager.get('SCREENSHOT_PATH', './evidence/screenshots');
    
    for (const scenario of scenarios) {
      const feature = result.features.find(f => f.featureId === scenario.featureId);
      const featureName = feature?.feature || scenario.feature || 'Unknown';
      
      if (scenario.status === TestStatus.FAILED) {
        const screenshotPath = path.join(screenshotDir, result.executionId, `${scenario.scenarioId}_failure.png`);
        data.push([
          featureName,
          scenario.scenario,
          'Scenario',
          'failure',
          scenario.status.toUpperCase(),
          this.formatDateTime(scenario.endTime),
          screenshotPath,
          `Failure screenshot for scenario: ${scenario.scenario}`
        ]);
      }
      
      if (scenario.steps) {
        scenario.steps.forEach((step, stepIndex) => {
          if (step.status === TestStatus.FAILED) {
            const stepScreenshotPath = path.join(screenshotDir, result.executionId, `${scenario.scenarioId}_step${stepIndex + 1}_failure.png`);
            data.push([
              featureName,
              scenario.scenario,
              `Step ${stepIndex + 1}: ${this.truncateText(step.text, 50)}`,
              'failure',
              step.status.toUpperCase(),
              this.formatDateTime(step.endTime),
              stepScreenshotPath,
              `Failure screenshot for step: ${step.keyword} ${step.text}`
            ]);
          }
          
          if (step.embeddings && step.embeddings.length > 0) {
            step.embeddings.forEach((embedding, embIndex) => {
              if (embedding.mimeType && embedding.mimeType.startsWith('image/')) {
                const embeddingPath = path.join(screenshotDir, result.executionId, `${scenario.scenarioId}_step${stepIndex + 1}_embed${embIndex + 1}.png`);
                data.push([
                  featureName,
                  scenario.scenario,
                  `Step ${stepIndex + 1}: ${this.truncateText(step.text, 50)}`,
                  'embedded',
                  step.status.toUpperCase(),
                  this.formatDateTime(step.endTime),
                  embeddingPath,
                  embedding.name || 'Embedded screenshot'
                ]);
              }
            });
          }
        });
      }
    }
    
    if (data.length === 1 && result.features.length > 0) {
      result.features.forEach(feature => {
        feature.scenarios.forEach(scenario => {
          if (scenario.status === 'failed') {
            const screenshotPath = path.join(screenshotDir, result.executionId, `${scenario.scenarioId}_failure.png`);
            data.push([
              feature.feature,
              scenario.name,
              'Scenario',
              'failure',
              scenario.status.toUpperCase(),
              '',
              screenshotPath,
              `Potential failure screenshot for scenario: ${scenario.name}`
            ]);
          }
        });
      });
    }

    if (data.length === 1) {
      data.push(['No screenshots captured', '', '', '', '', '', '', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyScreenshotsFormatting(ws, data.length, options);

    ws['!cols'] = [
      { wch: 40 },
      { wch: 40 },
      { wch: 50 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 80 },
      { wch: 50 }
    ];

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Screenshots');
  }

  private applyScreenshotsFormatting(ws: XLSX.WorkSheet, rowCount: number, options: ExcelExportOptions): void {
    this.setRangeStyle(ws, 'A1:H1', {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: this.brandColor.substring(1) } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });

    for (let row = 2; row <= rowCount; row++) {
      
      const statusCell = ws[`E${row}`];
      if (statusCell) {
        const status = statusCell.v as string;
        let style: any = {
          font: { bold: true },
          alignment: { horizontal: 'center' }
        };
        
        switch (status.toLowerCase()) {
          case 'passed':
            style.font.color = { rgb: '008000' };
            break;
          case 'failed':
            style.font.color = { rgb: 'FF0000' };
            break;
          case 'skipped':
            style.font.color = { rgb: 'FFA500' };
            break;
        }
        
        this.setCellStyle(ws, `E${row}`, style);
      }
      
      const pathCell = ws[`G${row}`];
      if (pathCell && pathCell.v && typeof pathCell.v === 'string') {
        ws[`G${row}`] = {
          v: pathCell.v,
          l: { Target: `file:///${pathCell.v.replace(/\\/g, '/')}` },
          s: {
            font: { color: { rgb: '0000FF' }, underline: true }
          }
        };
      }
      
      for (let col = 0; col < 8; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row - 1, c: col });
        this.addBorder(ws, cellAddr);
      }
    }

    if (options.autoFilter) {
      ws['!autofilter'] = { ref: `A1:H${rowCount}` };
    }

    if (options.freezePanes) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    }
  }

  private async addChartsSheet(
    result: ExecutionResult,
    _options: ExcelExportOptions
  ): Promise<void> {
    const data: any[][] = [];
    
    data.push(['Test Results Summary']);
    data.push(['Status', 'Count']);
    data.push(['Passed', result.passedScenarios]);
    data.push(['Failed', result.failedScenarios]);
    data.push(['Skipped', result.skippedScenarios]);
    data.push([]);
    
    data.push(['Feature Pass Rates']);
    data.push(['Feature', 'Pass Rate']);
    result.features.forEach(feature => {
      const total = feature.scenarios.length;
      const passed = feature.scenarios.filter(s => s.status === 'passed').length;
      const passRate = total > 0 ? passed / total : 0;
      data.push([feature.feature, passRate]);
    });
    data.push([]);
    
    data.push(['Execution Time by Feature']);
    data.push(['Feature', 'Duration (seconds)']);
    result.features.forEach(feature => {
      const totalDuration = feature.scenarios.reduce((sum, s) => sum + s.duration, 0);
      data.push([feature.feature, totalDuration / 1000]);
    });
    data.push([]);
    
    data.push(['Test Execution Timeline']);
    data.push(['Time Period', 'Tests Run', 'Pass Rate']);
    
    const scenarios = result.scenarios || [];
    if (scenarios.length > 0) {
      const hourlyData = new Map<number, { total: number; passed: number }>();
      
      scenarios.forEach(scenario => {
        try {
          const hour = new Date(scenario.startTime).getHours();
          const existing = hourlyData.get(hour) || { total: 0, passed: 0 };
          existing.total++;
          if (scenario.status === TestStatus.PASSED) existing.passed++;
          hourlyData.set(hour, existing);
        } catch (error) {
          this.logger.warn(`Failed to process scenario time: ${error}`);
        }
      });
      
      Array.from(hourlyData.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([hour, stats]) => {
          const passRate = stats.total > 0 ? stats.passed / stats.total : 0;
          data.push([`${hour}:00-${hour + 1}:00`, stats.total, passRate]);
        });
    } else {
      try {
        const startHour = new Date(result.startTime).getHours();
        const endHour = new Date(result.endTime).getHours();
        const passRate = result.totalScenarios > 0 ? result.passedScenarios / result.totalScenarios : 0;
        data.push([`${startHour}:00-${endHour}:00`, result.totalScenarios, passRate]);
      } catch (error) {
        this.logger.warn(`Failed to process timeline: ${error}`);
        data.push(['All Time', result.totalScenarios, result.totalScenarios > 0 ? result.passedScenarios / result.totalScenarios : 0]);
      }
    }
    data.push([]);
    
    data.push(['Top 10 Slowest Scenarios']);
    data.push(['Scenario', 'Duration (seconds)']);
    
    const allScenarios: Array<{ name: string; duration: number }> = [];
    result.features.forEach(feature => {
      feature.scenarios.forEach(scenario => {
        allScenarios.push({ name: scenario.name, duration: scenario.duration });
      });
    });
    
    allScenarios
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .forEach(scenario => {
        data.push([this.truncateText(scenario.name, 40), scenario.duration / 1000]);
      });

    const ws = XLSX.utils.aoa_to_sheet(data);
    this.applyChartsFormatting(ws, data);

    ws['!cols'] = [
      { wch: 40 },
      { wch: 20 },
      { wch: 20 }
    ];

    const instructions = 'To create charts: 1) Select data range 2) Insert > Charts 3) Choose chart type';
    ws['!margins'] = { footer: 0.5 };
    ws['!footer'] = { left: instructions };

    XLSX.utils.book_append_sheet(this.workbook!, ws, 'Chart Data');
  }

  private applyChartsFormatting(ws: XLSX.WorkSheet, data: any[][]): void {
    
    data.forEach((row, index) => {
      if (row.length === 1) {
        const cellAddr = `A${index + 1}`;
        this.setCellStyle(ws, cellAddr, {
          font: { bold: true, sz: 14, color: { rgb: this.brandColor.substring(1) } }
        });
        this.mergeCells(ws, `A${index + 1}:B${index + 1}`);
      } else if (row[0] === 'Status' || row[0] === 'Feature' || row[0] === 'Metric') {
        const rowNum = index + 1;
        this.setRangeStyle(ws, `A${rowNum}:B${rowNum}`, {
          font: { bold: true },
          fill: { fgColor: { rgb: 'E0E0E0' } },
          border: {
            bottom: { style: 'thin', color: { rgb: '000000' } }
          }
        });
      } else if (row.length === 2 && typeof row[1] === 'number') {
        const cellAddr = `B${index + 1}`;
        const cell = ws[cellAddr];
        if (cell) {
          if (row[0].includes('Rate') && cell.v <= 1) {
            cell.t = 'n';
            cell.z = '0.00%';
          } else {
            cell.t = 'n';
            cell.z = '#,##0.00';
          }
        }
      }
    });
  }

  private setCellStyle(ws: XLSX.WorkSheet, cellAddr: string, style: any): void {
    if (!ws[cellAddr]) {
      ws[cellAddr] = { v: '' };
    }
    
    ws[cellAddr].s = {
      font: {
        name: style.font?.name || 'Calibri',
        sz: style.font?.sz || 11,
        bold: style.font?.bold || false,
        italic: style.font?.italic || false,
        color: style.font?.color || { rgb: '000000' }
      },
      fill: style.fill ? {
        patternType: 'solid',
        fgColor: style.fill.fgColor || { rgb: 'FFFFFF' }
      } : undefined,
      alignment: {
        horizontal: style.alignment?.horizontal || 'general',
        vertical: style.alignment?.vertical || 'bottom',
        wrapText: style.alignment?.wrapText || false,
        textRotation: style.alignment?.textRotation || 0
      },
      border: style.border || {},
      numFmt: style.numFmt
    };
  }

  private setRangeStyle(ws: XLSX.WorkSheet, range: string, style: any): void {
    const rangeObj = XLSX.utils.decode_range(range);
    for (let R = rangeObj.s.r; R <= rangeObj.e.r; ++R) {
      for (let C = rangeObj.s.c; C <= rangeObj.e.c; ++C) {
        const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
        this.setCellStyle(ws, cellAddr, style);
      }
    }
  }

  private mergeCells(ws: XLSX.WorkSheet, range: string): void {
    if (!ws['!merges']) {
      ws['!merges'] = [];
    }
    ws['!merges'].push(XLSX.utils.decode_range(range));
  }

  private addBorder(ws: XLSX.WorkSheet, cellAddr: string): void {
    if (!ws[cellAddr]) {
      ws[cellAddr] = { v: '' };
    }
    
    if (!ws[cellAddr].s) {
      ws[cellAddr].s = {};
    }
    
    ws[cellAddr].s.border = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    };
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else if (ms < 3600000) {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private formatDateTime(date: Date | string | number): string {
    if (!date) return '';
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      
      if (isNaN(dateObj.getTime())) {
        return String(date);
      }
      
      return dateObj.toISOString().replace('T', ' ').substring(0, 19);
    } catch (error) {
      this.logger.warn(`Failed to format date: ${date}`, error as Error);
      return String(date);
    }
  }

  async exportStream(
    result: ExecutionResult,
    options: ExcelExportOptions = { format: ExportFormat.EXCEL }
  ): Promise<Readable> {
    const buffer = await this.generateBuffer(result, options);
    
    const stream = new Readable({
      read() {}
    });
    
    stream.push(buffer);
    stream.push(null);
    
    return stream;
  }

  private async generateBuffer(
    result: ExecutionResult,
    options: ExcelExportOptions
  ): Promise<Buffer> {
    this.workbook = XLSX.utils.book_new();
    this.workbook.Props = {
      Title: 'CS Test Automation Report',
      Subject: 'Test Execution Results',
      Author: 'CS Test Framework',
      Manager: result.environment,
      Company: 'CS',
      Category: 'Test Report',
      Keywords: 'automation,test,report',
      Comments: `Generated on ${new Date().toISOString()}`,
      LastAuthor: 'CS Test Framework',
      CreatedDate: new Date()
    };

    await this.addSummarySheet(result, options);
    await this.addDetailedResultsSheet(result, options);
    await this.addFeatureResultsSheet(result, options);
    await this.addStepDetailsSheet(result, options);
    
    if (options.includeMetrics) {
      await this.addMetricsSheet(result, options);
      await this.addPerformanceSheet(result, options);
    }
    
    if (options.includeLogs) {
      await this.addLogsSheet(result, options);
    }
    
    if (options.includeScreenshots) {
      await this.addScreenshotsSheet(result, options);
    }

    if (options.includeCharts) {
      await this.addChartsSheet(result, options);
    }

    const buffer = XLSX.write(this.workbook, {
      bookType: 'xlsx',
      bookSST: true,
      type: 'buffer',
      compression: options.compression !== false,
      Props: this.workbook.Props
    });

    return Buffer.from(buffer);
  }

  async exportPartial(
    result: ExecutionResult,
    outputPath: string,
    sheetNames: string[],
    options: ExcelExportOptions = { format: ExportFormat.EXCEL }
  ): Promise<ExportResult> {
    
    try {
      this.logger.info('Starting partial Excel export', { outputPath, sheets: sheetNames });

      this.workbook = XLSX.utils.book_new();
      this.workbook.Props = {
        Title: 'CS Test Automation Report (Partial)',
        Subject: 'Test Execution Results',
        Author: 'CS Test Framework',
        CreatedDate: new Date()
      };

      for (const sheetName of sheetNames) {
        switch (sheetName.toLowerCase()) {
          case 'summary':
            await this.addSummarySheet(result, options);
            break;
          case 'detailed results':
            await this.addDetailedResultsSheet(result, options);
            break;
          case 'feature results':
            await this.addFeatureResultsSheet(result, options);
            break;
          case 'step details':
            await this.addStepDetailsSheet(result, options);
            break;
          case 'metrics':
            if (options.includeMetrics) {
              await this.addMetricsSheet(result, options);
            }
            break;
          case 'performance':
            if (options.includeMetrics) {
              await this.addPerformanceSheet(result, options);
            }
            break;
          case 'logs':
            if (options.includeLogs) {
              await this.addLogsSheet(result, options);
            }
            break;
          case 'screenshots':
            if (options.includeScreenshots) {
              await this.addScreenshotsSheet(result, options);
            }
            break;
          case 'chart data':
            if (options.includeCharts) {
              await this.addChartsSheet(result, options);
            }
            break;
          default:
            this.logger.warn(`Unknown sheet name: ${sheetName}`);
        }
      }

      const buffer = XLSX.write(this.workbook, {
        bookType: 'xlsx',
        bookSST: true,
        type: 'buffer',
        compression: options.compression !== false
      });

      await fs.promises.writeFile(outputPath, buffer);
      const fileStats = await fs.promises.stat(outputPath);

      return {
        success: true,
        filePath: outputPath,
        format: ExportFormat.EXCEL,
        size: fileStats.size
      };

    } catch (error) {
      this.logger.error('Partial Excel export failed', error as Error);
      return {
        success: false,
        format: ExportFormat.EXCEL,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
