// src/steps/database/DatabaseUtilitySteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { DatabaseContext } from '../../database/context/DatabaseContext';
import { CSDatabase } from '../../database/client/CSDatabase';
import { FileUtils } from '../../core/utils/FileUtils';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ResultSet } from '../../database/types/database.types';

export class DatabaseUtilitySteps extends CSBDDBaseStepDefinition {
    private databaseContext: DatabaseContext;

    constructor() {
        super();
        this.databaseContext = new DatabaseContext();
    }

    @CSBDDStepDef('user exports query result to {string}')
    @CSBDDStepDef('user saves query result to {string}')
    async exportQueryResult(filePath: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('export_query_result', '', 0, undefined, { filePath });

        const result = this.getLastResult();
        const interpolatedPath = this.interpolateVariables(filePath);

        const startTime = Date.now();
        try {
            const resolvedPath = this.resolveOutputPath(interpolatedPath);
            const format = this.detectFormat(resolvedPath);

            switch (format) {
                case 'csv':
                    await this.exportToCSV(result, resolvedPath);
                    break;
                case 'json':
                    await this.exportToJSON(result, resolvedPath);
                    break;
                case 'xml':
                    await this.exportToXML(result, resolvedPath);
                    break;
                case 'excel':
                    await this.exportToExcel(result, resolvedPath);
                    break;
                case 'txt':
                    await this.exportToText(result, resolvedPath);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            const logger = ActionLogger.getInstance();
            logger.logDatabase('query_result_exported', '', Date.now() - startTime, result.rowCount, {
                filePath: resolvedPath,
                format,
                fileSize: await FileUtils.getSize(resolvedPath)
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('export_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to export query result: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user exports query result as CSV with delimiter {string}')
    async exportQueryResultAsCSVWithDelimiter(delimiter: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('export_csv_custom_delimiter', '', 0, undefined, { delimiter });

        const result = this.getLastResult();
        const outputPath = this.generateOutputPath('csv');

        try {
            await this.exportToCSV(result, outputPath, delimiter);

            const logger = ActionLogger.getInstance();
            logger.logDatabase('csv_exported_custom', '', 0, result.rowCount, {
                filePath: outputPath,
                delimiter
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('csv_export_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to export CSV: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user logs query execution plan')
    @CSBDDStepDef('user displays query execution plan')
    async logQueryExecutionPlan(): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('log_execution_plan', '', 0, undefined, {});

        const executionPlan = this.databaseContext.getLastExecutionPlan();
        if (!executionPlan) {
            throw new Error('No execution plan available. Use "user profiles query ..." first');
        }

        console.log('\n=== Query Execution Plan ===');
        console.log(executionPlan);
        console.log('===========================\n');

        logger.logDatabase('execution_plan_logged', '', 0, undefined, {
            planLength: executionPlan.length
        });
    }

    @CSBDDStepDef('user logs database statistics')
    async logDatabaseStatistics(): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('log_database_statistics', '', 0, undefined, {});

        try {
            const db = this.getCurrentDatabase();
            const stats = await this.getDatabaseStatistics(db);

            console.log('\n=== Database Statistics ===');
            console.log(`Database: ${stats.databaseName}`);
            console.log(`Version: ${stats.version}`);
            console.log(`Size: ${this.formatBytes(stats.size)}`);
            console.log(`Tables: ${stats.tableCount}`);
            console.log(`Active Connections: ${stats.activeConnections}`);
            console.log(`Uptime: ${this.formatDuration(stats.uptime)}`);
            
            if (stats.additionalInfo) {
                console.log('\nAdditional Information:');
                Object.entries(stats.additionalInfo).forEach(([key, value]) => {
                    console.log(`${key}: ${value}`);
                });
            }
            console.log('==========================\n');

            const logger = ActionLogger.getInstance();
            logger.logDatabase('database_statistics_logged', '', 0, undefined, {
                databaseName: stats.databaseName,
                tableCount: stats.tableCount
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('statistics_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to get database statistics: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user backs up database to {string}')
    async backupDatabase(backupPath: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('backup_database', '', 0, undefined, { backupPath });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedPath = this.interpolateVariables(backupPath);
            const resolvedPath = this.resolveOutputPath(interpolatedPath);

            const startTime = Date.now();
            await this.backupDatabaseToFile(db, resolvedPath);
            const duration = Date.now() - startTime;

            const logger = ActionLogger.getInstance();
            logger.logDatabase('database_backed_up', '', duration, undefined, {
                backupPath: resolvedPath,
                fileSize: await FileUtils.getSize(resolvedPath)
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('backup_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to backup database: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user imports data from {string} into table {string}')
    async importDataIntoTable(filePath: string, tableName: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('import_data', '', 0, undefined, { filePath, tableName });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedPath = this.interpolateVariables(filePath);
            const interpolatedTable = this.interpolateVariables(tableName);
            const resolvedPath = await this.resolveInputPath(interpolatedPath);

            const format = this.detectFormat(resolvedPath);
            let data: any[];

            switch (format) {
                case 'csv':
                    data = await this.parseCSV(resolvedPath);
                    break;
                case 'json':
                    data = await this.parseJSONFile(resolvedPath);
                    break;
                case 'excel':
                    data = await this.parseExcel(resolvedPath);
                    break;
                default:
                    throw new Error(`Unsupported import format: ${format}`);
            }

            const startTime = Date.now();
            const result = await db.bulkInsert(interpolatedTable, data);
            const duration = Date.now() - startTime;

            const logger = ActionLogger.getInstance();
            logger.logDatabase('data_imported', '', duration, result, {
                tableName: interpolatedTable,
                format
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('import_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to import data: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user truncates table {string}')
    async truncateTable(tableName: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('truncate_table', '', 0, undefined, { tableName });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedTable = this.interpolateVariables(tableName);

            await db.execute(`TRUNCATE TABLE ${interpolatedTable}`);

            const logger = ActionLogger.getInstance();
            logger.logDatabase('table_truncated', `TRUNCATE TABLE ${interpolatedTable}`, 0, undefined, {
                tableName: interpolatedTable
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('truncate_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to truncate table '${tableName}': ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user drops table {string} if exists')
    async dropTableIfExists(tableName: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('drop_table_if_exists', '', 0, undefined, { tableName });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedTable = this.interpolateVariables(tableName);

            try {
                await db.execute(`DROP TABLE IF EXISTS ${interpolatedTable}`);
                const logger = ActionLogger.getInstance();
                logger.logDatabase('table_dropped', `DROP TABLE IF EXISTS ${interpolatedTable}`, 0, undefined, {
                    tableName: interpolatedTable
                });
            } catch (e) {
                const logger = ActionLogger.getInstance();
                logger.logDatabase('table_not_exists', '', 0, undefined, {
                    tableName: interpolatedTable
                });
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('drop_table_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to drop table '${tableName}': ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user creates index {string} on table {string} column {string}')
    async createIndex(indexName: string, tableName: string, columnName: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('create_index', '', 0, undefined, { indexName, tableName, columnName });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedIndex = this.interpolateVariables(indexName);
            const interpolatedTable = this.interpolateVariables(tableName);
            const interpolatedColumn = this.interpolateVariables(columnName);

            await db.execute(`CREATE INDEX ${interpolatedIndex} ON ${interpolatedTable} (${interpolatedColumn})`);

            const logger = ActionLogger.getInstance();
            logger.logDatabase('index_created', `CREATE INDEX ${interpolatedIndex} ON ${interpolatedTable} (${interpolatedColumn})`, 0, undefined, {
                indexName: interpolatedIndex,
                tableName: interpolatedTable,
                columnName: interpolatedColumn
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('create_index_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to create index: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user analyzes table {string}')
    async analyzeTable(tableName: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('analyze_table', '', 0, undefined, { tableName });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedTable = this.interpolateVariables(tableName);

            const stats = await this.analyzeTableStats(db, interpolatedTable);

            console.log(`\n=== Table Analysis: ${interpolatedTable} ===`);
            console.log(`Row Count: ${stats.rowCount}`);
            console.log(`Size: ${this.formatBytes(stats.dataSize)}`);
            console.log(`Index Count: ${stats.indexCount}`);
            console.log(`Last Updated: ${stats.lastUpdated}`);
            console.log('=====================================\n');

            const logger = ActionLogger.getInstance();
            logger.logDatabase('table_analyzed', '', 0, stats.rowCount, {
                tableName: interpolatedTable,
                dataSize: stats.dataSize
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = ActionLogger.getInstance();
            logger.logDatabase('analyze_table_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to analyze table '${tableName}': ${errorMsg}`);
        }
    }

    async waitForSeconds(seconds: number): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('wait', '', 0, undefined, { seconds });

        await new Promise(resolve => setTimeout(resolve, seconds * 1000));

        logger.logDatabase('wait_completed', '', seconds * 1000, undefined, { seconds });
    }

    @CSBDDStepDef('user executes query with plan {string}')
    async profileQuery(query: string): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('profile_query', '', 0, undefined, { query });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedQuery = this.interpolateVariables(query);
            
            const startTime = Date.now();
            const result = await db.executeWithPlan(interpolatedQuery);
            const duration = Date.now() - startTime;

            const executionPlan = this.databaseContext.getLastExecutionPlan();

            console.log(`\n=== Query Profile ===`);
            console.log(`Query: ${interpolatedQuery}`);
            console.log(`Execution Time: ${duration}ms`);
            console.log(`Rows Returned: ${result.rowCount}`);
            if (executionPlan) {
                console.log(`\nExecution Plan:`);
                console.log(executionPlan);
            }
            console.log(`===================\n`);

            logger.logDatabase('query_profiled', interpolatedQuery, duration, result.rowCount, {
                executionPlan: executionPlan || 'Not available'
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.logDatabase('profile_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to profile query: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user profiles query {string} with parameters')
    async profileQueryWithParams(query: string, dataTable: any): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.logDatabase('profile_query_params', '', 0, undefined, { query });

        try {
            const db = this.getCurrentDatabase();
            const interpolatedQuery = this.interpolateVariables(query);
            const params = this.parseParameters(dataTable);
            
            const startTime = Date.now();
            const result = await db.executeWithPlan(interpolatedQuery, params);
            const duration = Date.now() - startTime;

            const executionPlan = this.databaseContext.getLastExecutionPlan();

            console.log(`\n=== Query Profile ===`);
            console.log(`Query: ${interpolatedQuery}`);
            console.log(`Parameters: ${JSON.stringify(params)}`);
            console.log(`Execution Time: ${duration}ms`);
            console.log(`Rows Returned: ${result.rowCount}`);
            if (executionPlan) {
                console.log(`\nExecution Plan:`);
                console.log(executionPlan);
            }
            console.log(`===================\n`);

            logger.logDatabase('query_profiled_params', interpolatedQuery, duration, result.rowCount, {
                params,
                executionPlan: executionPlan || 'Not available'
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.logDatabase('profile_params_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to profile query with parameters: ${errorMsg}`);
        }
    }

    private getCurrentDatabase(): CSDatabase {
        const adapter = this.databaseContext.getActiveAdapter();
        if (!adapter) {
            throw new Error('No database connection established. Use "Given user connects to ... database" first');
        }
        return adapter as unknown as CSDatabase;
    }

    private getLastResult(): ResultSet {
        const queryHistory = this.databaseContext.getQueryHistory();
        if (queryHistory.length === 0) {
            throw new Error('No query result available. Execute a query first');
        }
        const lastQuery = queryHistory[queryHistory.length - 1];
        if (!lastQuery || !lastQuery.result) {
            throw new Error('Last query did not produce a result');
        }
        return lastQuery.result;
    }

    private resolveOutputPath(filePath: string): string {
        const dir = './output/database/';
        FileUtils.ensureDirSync(dir);
        
        if (filePath.startsWith('/') || filePath.includes(':')) {
            return filePath;
        }
        
        return `${dir}${filePath}`;
    }

    private async resolveInputPath(filePath: string): Promise<string> {
        const paths = [
            filePath,
            `./test-data/${filePath}`,
            `./resources/${filePath}`,
            `./data/${filePath}`
        ];

        for (const path of paths) {
            if (await FileUtils.exists(path)) {
                return path;
            }
        }

        throw new Error(`Input file not found: ${filePath}`);
    }

    private generateOutputPath(extension: string): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return this.resolveOutputPath(`query_result_${timestamp}.${extension}`);
    }

    private detectFormat(filePath: string): string {
        const extension = filePath.split('.').pop()?.toLowerCase();
        return extension || 'txt';
    }

    private async exportToCSV(result: ResultSet, filePath: string, delimiter: string = ','): Promise<void> {
        const lines: string[] = [];
        
        const headers = (result.columns || []).map(col => this.escapeCSV(col.name, delimiter));
        lines.push(headers.join(delimiter));
        
        for (const row of result.rows) {
            const values = (result.columns || []).map(col => {
                const value = row[col.name];
                return this.escapeCSV(this.formatValue(value), delimiter);
            });
            lines.push(values.join(delimiter));
        }
        
        await FileUtils.writeFile(filePath, lines.join('\n'));
    }

    private async exportToJSON(result: ResultSet, filePath: string): Promise<void> {
        const data = {
            metadata: {
                columns: result.columns,
                rowCount: result.rowCount,
                exportDate: new Date().toISOString()
            },
            data: result.rows
        };
        
        await FileUtils.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    private async exportToXML(result: ResultSet, filePath: string): Promise<void> {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<QueryResult>\n';
        xml += `  <RowCount>${result.rowCount}</RowCount>\n`;
        xml += '  <Data>\n';
        
        for (const row of result.rows) {
            xml += '    <Row>\n';
            for (const col of (result.columns || [])) {
                const value = this.escapeXML(this.formatValue(row[col.name]));
                xml += `      <${col.name}>${value}</${col.name}>\n`;
            }
            xml += '    </Row>\n';
        }
        
        xml += '  </Data>\n';
        xml += '</QueryResult>';
        
        await FileUtils.writeFile(filePath, xml);
    }

    private async exportToExcel(result: ResultSet, filePath: string): Promise<void> {
        await this.exportToCSV(result, filePath.replace('.xlsx', '.csv'));
        console.warn('Excel export currently saves as CSV format');
    }

    private async exportToText(result: ResultSet, filePath: string): Promise<void> {
        const lines: string[] = [];
        
        const widths: number[] = (result.columns || []).map(col => col.name.length);
        
        for (const row of result.rows) {
            (result.columns || []).forEach((col, i) => {
                const value = this.formatValue(row[col.name]);
                widths[i] = Math.max(widths[i] || 0, value.length);
            });
        }
        
        const headerLine = (result.columns || [])
            .map((col, i) => col.name.padEnd(widths[i] || 0))
            .join(' | ');
        lines.push(headerLine);
        lines.push('-'.repeat(headerLine.length));
        
        for (const row of result.rows) {
            const rowLine = (result.columns || [])
                .map((col, i) => this.formatValue(row[col.name]).padEnd(widths[i] || 0))
                .join(' | ');
            lines.push(rowLine);
        }
        
        lines.push('-'.repeat(headerLine.length));
        lines.push(`Total Rows: ${result.rowCount}`);
        
        await FileUtils.writeFile(filePath, lines.join('\n'));
    }

    private async parseCSV(filePath: string): Promise<any[]> {
        const content = await FileUtils.readFile(filePath);
        const contentStr = typeof content === 'string' ? content : content.toString();
        const lines = contentStr.split('\n').filter((line: string) => line.trim());
        
        if (lines.length === 0) {
            return [];
        }
        
        const firstLine = lines[0];
        if (!firstLine) {
            return [];
        }
        const headers = firstLine.split(',').map((h: string) => h.trim());
        const data: any[] = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) {
                continue;
            }
            const values = this.parseCSVLine(line);
            const row: Record<string, any> = {};
            
            headers.forEach((header: string, index: number) => {
                row[header] = this.parseValue(values[index] || '');
            });
            
            data.push(row);
        }
        
        return data;
    }

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

    private async parseJSONFile(filePath: string): Promise<any[]> {
        const content = await FileUtils.readFile(filePath);
        const contentStr = typeof content === 'string' ? content : content.toString();
        const parsed = JSON.parse(contentStr);
        
        if (Array.isArray(parsed)) {
            return parsed;
        } else if (parsed.data && Array.isArray(parsed.data)) {
            return parsed.data;
        } else if (parsed.rows && Array.isArray(parsed.rows)) {
            return parsed.rows;
        } else {
            throw new Error('JSON file does not contain an array of data');
        }
    }

    private async parseExcel(_filePath: string): Promise<any[]> {
        throw new Error('Excel import requires xlsx package. Please use CSV format instead');
    }

    private escapeCSV(value: string, delimiter: string): string {
        if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    private escapeXML(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private formatValue(value: any): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
        }
        return String(value);
    }

    private parseValue(value: string): any {
        if (value === 'NULL' || value === '') {
            return null;
        }
        if (value === 'TRUE') {
            return true;
        }
        if (value === 'FALSE') {
            return false;
        }
        if (/^-?\d+$/.test(value)) {
            return parseInt(value);
        }
        if (/^-?\d+\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            return new Date(value);
        }
        return value;
    }

    private formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    private formatDuration(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    private interpolateVariables(text: string): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_match, variable) => {
            const value = this.context.retrieve(variable);
            if (value === undefined) {
                throw new Error(`Variable '${variable}' is not defined in context`);
            }
            return String(value);
        });
    }

    private async getDatabaseStatistics(db: CSDatabase): Promise<any> {
        const result = await db.execute(`
            SELECT 
                COUNT(DISTINCT table_name) as tableCount,
                DATABASE() as databaseName
            FROM information_schema.tables 
            WHERE table_schema = DATABASE()
        `);
        
        return {
            databaseName: result.rows[0]?.databaseName || 'Unknown',
            version: '1.0.0',
            size: 0,
            tableCount: result.rows[0]?.tableCount || 0,
            activeConnections: 1,
            uptime: Date.now(),
            additionalInfo: {}
        };
    }

    private async backupDatabaseToFile(db: CSDatabase, filePath: string): Promise<void> {
        const tables = await db.execute(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE()
        `);
        
        let backupContent = '-- Database Backup\n';
        backupContent += `-- Generated on ${new Date().toISOString()}\n\n`;
        
        for (const table of tables.rows) {
            const tableName = table.table_name;
            
            const createTable = await db.execute(`SHOW CREATE TABLE ${tableName}`);
            if (createTable.rows.length > 0) {
                backupContent += `\n-- Table: ${tableName}\n`;
                backupContent += createTable.rows[0]['Create Table'] + ';\n\n';
            }
            
            const data = await db.execute(`SELECT * FROM ${tableName}`);
            if (data.rowCount > 0) {
                backupContent += `-- Data for table ${tableName}\n`;
                for (const row of data.rows) {
                    const columns = Object.keys(row).join(', ');
                    const values = Object.values(row)
                        .map(v => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
                        .join(', ');
                    backupContent += `INSERT INTO ${tableName} (${columns}) VALUES (${values});\n`;
                }
                backupContent += '\n';
            }
        }
        
        await FileUtils.writeFile(filePath, backupContent);
    }

    private async analyzeTableStats(db: CSDatabase, tableName: string): Promise<any> {
        const result = await db.execute(`
            SELECT 
                COUNT(*) as rowCount,
                (data_length + index_length) as dataSize,
                COUNT(DISTINCT index_name) as indexCount
            FROM information_schema.tables t
            LEFT JOIN information_schema.statistics s ON t.table_name = s.table_name
            WHERE t.table_schema = DATABASE() 
            AND t.table_name = '${tableName}'
            GROUP BY t.table_name, data_length, index_length
        `);
        
        return {
            rowCount: result.rows[0]?.rowCount || 0,
            dataSize: result.rows[0]?.dataSize || 0,
            indexCount: result.rows[0]?.indexCount || 0,
            lastUpdated: new Date().toISOString()
        };
    }

    private parseParameters(dataTable: any): any[] {
        if (!dataTable || !dataTable.rows) {
            return [];
        }

        if (dataTable.rows.length > 0 && !dataTable.headers) {
            return dataTable.rows.map((row: any) => row[0]);
        }

        const params: any[] = [];
        for (const row of dataTable.rows) {
            if (dataTable.headers && dataTable.headers.length === 2) {
                const value = this.parseValue(row[1]);
                params.push(value);
            } else {
                params.push(...row.map((v: any) => this.parseValue(v)));
            }
        }

        return params;
    }
}
