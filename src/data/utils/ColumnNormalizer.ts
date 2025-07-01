export class ColumnNormalizer {
    private static readonly COLUMN_MAPPINGS: Record<string, string[]> = {
        testCase: ['testCase', 'testCaseId', 'testId', 'tcId', 'tc', 'test_case'],
        testType: ['testType', 'type', 'test_type', 'scenario_type'],
        
        username: ['username', 'user', 'userName', 'user_name', 'login', 'loginId'],
        password: ['password', 'pass', 'pwd', 'passwd'],
        
        module: ['module', 'menu', 'menuItem', 'menu_item', 'section', 'page'],
        
        expectedResult: ['expectedResult', 'expected', 'expectedMessage', 'expectedWelcomeMessage', 'expected_result'],
        
        executeFlag: ['executeFlag', 'execute', 'executeTest', 'executionFlag', 'run', 'active'],
        
        environment: ['environment', 'env', 'testEnv', 'test_env'],
        priority: ['priority', 'prio', 'test_priority']
    };
    
    static normalizeColumnName(columnName: string): string {
        const cleaned = columnName.replace(/[\r\n]/g, '').trim();
        
        for (const [normalized, variations] of Object.entries(this.COLUMN_MAPPINGS)) {
            if (variations.some(v => v.toLowerCase() === cleaned.toLowerCase())) {
                return normalized;
            }
        }
        
        return cleaned;
    }
    
    static normalizeRow(row: Record<string, any>): Record<string, any> {
        const normalized: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = this.normalizeColumnName(key);
            normalized[normalizedKey] = value;
        }
        
        return normalized;
    }
    
    static normalizeData(data: Record<string, any>[]): Record<string, any>[] {
        return data.map(row => this.normalizeRow(row));
    }
    
    static getAvailableColumns(data: Record<string, any>[]): string[] {
        if (data.length === 0 || !data[0]) return [];
        
        const firstRow = this.normalizeRow(data[0]);
        return Object.keys(firstRow);
    }
    
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
