/**
 * Utility class to normalize column names and handle variations
 */
export class ColumnNormalizer {
    /**
     * Common column name mappings
     */
    private static readonly COLUMN_MAPPINGS: Record<string, string[]> = {
        // Test identification columns
        testCase: ['testCase', 'testCaseId', 'testId', 'tcId', 'tc', 'test_case'],
        testType: ['testType', 'type', 'test_type', 'scenario_type'],
        
        // Credential columns
        username: ['username', 'user', 'userName', 'user_name', 'login', 'loginId'],
        password: ['password', 'pass', 'pwd', 'passwd'],
        
        // Navigation columns
        module: ['module', 'menu', 'menuItem', 'menu_item', 'section', 'page'],
        
        // Result columns
        expectedResult: ['expectedResult', 'expected', 'expectedMessage', 'expectedWelcomeMessage', 'expected_result'],
        
        // Execution columns
        executeFlag: ['executeFlag', 'execute', 'executeTest', 'executionFlag', 'run', 'active'],
        
        // Environment columns
        environment: ['environment', 'env', 'testEnv', 'test_env'],
        priority: ['priority', 'prio', 'test_priority']
    };
    
    /**
     * Normalize a single column name
     */
    static normalizeColumnName(columnName: string): string {
        // Remove line breaks and trim
        const cleaned = columnName.replace(/[\r\n]/g, '').trim();
        
        // Find if this column matches any known mapping
        for (const [normalized, variations] of Object.entries(this.COLUMN_MAPPINGS)) {
            if (variations.some(v => v.toLowerCase() === cleaned.toLowerCase())) {
                return normalized;
            }
        }
        
        // Return the cleaned version if no mapping found
        return cleaned;
    }
    
    /**
     * Normalize all columns in a data row
     */
    static normalizeRow(row: Record<string, any>): Record<string, any> {
        const normalized: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = this.normalizeColumnName(key);
            normalized[normalizedKey] = value;
        }
        
        return normalized;
    }
    
    /**
     * Normalize all rows in a dataset
     */
    static normalizeData(data: Record<string, any>[]): Record<string, any>[] {
        return data.map(row => this.normalizeRow(row));
    }
    
    /**
     * Get available columns after normalization
     */
    static getAvailableColumns(data: Record<string, any>[]): string[] {
        if (data.length === 0 || !data[0]) return [];
        
        const firstRow = this.normalizeRow(data[0]);
        return Object.keys(firstRow);
    }
    
    /**
     * Check if required columns exist (after normalization)
     */
    static validateRequiredColumns(
        data: Record<string, any>[], 
        requiredColumns: string[]
    ): { valid: boolean; missing: string[] } {
        const available = this.getAvailableColumns(data);
        const missing = requiredColumns.filter(col => !available.includes(col));
        
        return {
            valid: missing.length === 0,
            missing
        };
    }
}