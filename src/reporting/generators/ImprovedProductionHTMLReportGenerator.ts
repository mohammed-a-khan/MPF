import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
    ReportData, 
    ReportTheme, 
    ChartType,
    TestStatus,
    PieChartData
} from '../types/reporting.types';
import { ReportConfig } from '../../core/configuration/types/config.types';
import { Logger } from '../../core/utils/Logger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ChartGenerator } from './ChartGenerator';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';

export class ImprovedProductionHTMLReportGenerator {
    private logger: Logger;
    private theme: ReportTheme;
    private chartGenerator: ChartGenerator;
    private reportTitle: string;
    private teamName: string;
    private screenshotMode: string;
    private executionHistory: any[] = [];

    constructor() {
        this.logger = Logger.getInstance('ImprovedProductionHTMLReportGenerator');
        
        // Default theme configuration
        this.theme = {
            primaryColor: '#93186C',
            secondaryColor: '#FFFFFF',
            successColor: '#28A745',
            failureColor: '#DC3545',
            warningColor: '#FFC107',
            infoColor: '#17A2B8',
            backgroundColor: '#f5f7fa',
            textColor: '#333333',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            fontSize: '14px'
        };
        
        // Initialize chart generator
        this.chartGenerator = new ChartGenerator();
        
        // Configurable report title and team name
        try {
            this.reportTitle = ConfigurationManager.get('REPORT_TITLE', 'Test Execution Report');
            this.teamName = ConfigurationManager.get('TEAM_NAME', 'CS Test Automation Team');
            this.screenshotMode = ConfigurationManager.get('SCREENSHOT_MODE', 'on-failure');
        } catch {
            this.reportTitle = 'Test Execution Report';
            this.teamName = 'CS Test Automation Team';
            this.screenshotMode = 'on-failure';
        }
        
        // Load execution history if available
        this.loadExecutionHistory();
    }

    private loadExecutionHistory(): void {
        try {
            const historyPath = path.join(process.cwd(), 'reports', 'execution-history.json');
            if (fs.existsSync(historyPath)) {
                const data = fs.readFileSync(historyPath, 'utf8');
                this.executionHistory = JSON.parse(data);
            }
        } catch (error) {
            this.logger.debug('No execution history found');
        }
    }

    private saveExecutionHistory(reportData: ReportData): void {
        try {
            const historyEntry = {
                date: new Date().toISOString(),
                passRate: reportData.summary?.passRate || 0,
                executionTime: reportData.summary?.executionTime || 0,
                totalScenarios: reportData.summary?.totalScenarios || 0,
                passedScenarios: reportData.summary?.passedScenarios || 0,
                failedScenarios: reportData.summary?.failedScenarios || 0
            };
            
            this.executionHistory.push(historyEntry);
            
            // Keep only last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            this.executionHistory = this.executionHistory.filter(entry => 
                new Date(entry.date) > thirtyDaysAgo
            );
            
            const historyPath = path.join(process.cwd(), 'reports', 'execution-history.json');
            fs.writeFileSync(historyPath, JSON.stringify(this.executionHistory, null, 2));
        } catch (error) {
            this.logger.debug('Failed to save execution history');
        }
    }

    public async initialize(config: ReportConfig): Promise<void> {
        if (config.themePrimaryColor) {
            this.theme.primaryColor = config.themePrimaryColor;
        }
        if (config.themeSecondaryColor) {
            this.theme.secondaryColor = config.themeSecondaryColor;
        }
        
        const extendedConfig = config as any;
        if (extendedConfig.reportTitle) {
            this.reportTitle = extendedConfig.reportTitle;
        }
        if (extendedConfig.teamName) {
            this.teamName = extendedConfig.teamName;
        }
        
        this.logger.info('Improved production HTML report generator initialized');
    }

    public async generate(reportData: ReportData): Promise<string> {
        try {
            this.logger.info('Generating improved production HTML report');
            const startTime = Date.now();
            
            // Save execution history for trend analysis
            this.saveExecutionHistory(reportData);
            
            const html = await this.buildCompleteReport(reportData);
            
            const duration = Date.now() - startTime;
            this.logger.info(`Improved production HTML report generated in ${duration}ms`);
            
            return html;
        } catch (error) {
            this.logger.error('Failed to generate improved production HTML report', error as Error);
            throw error;
        }
    }

    private async buildCompleteReport(reportData: ReportData): Promise<string> {
        const metadata = reportData.metadata || {};
        const summary = reportData.summary || {};
        
        // Get ALL console logs
        const logs = await this.getCompleteLogs();
        
        // Get enhanced environment details
        const environment = this.getEnhancedEnvironment(metadata);
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.reportTitle}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    ${this.generateImprovedCSS()}
</head>
<body>
    ${this.generateHeader(summary)}
    ${this.generateNavigation()}
    
    <main class="main-content">
        ${await this.generateImprovedDashboardTab(reportData)}
        ${await this.generateEnhancedFeaturesTab(reportData)}
        ${await this.generateImprovedScenariosTab(reportData)}
        ${await this.generateImprovedScreenshotsTab(reportData)}
        ${await this.generateImprovedPerformanceTab(reportData)}
        ${this.generateImprovedLogsTab(logs)}
        ${this.generateImprovedEnvironmentTab(environment)}
    </main>
    
    ${this.generateFooter(metadata)}
    ${this.generateImprovedJavaScript()}
</body>
</html>`;
    }

    private generateImprovedCSS(): string {
        return `
    <style>
        :root {
            --primary-color: ${this.theme.primaryColor};
            --secondary-color: ${this.theme.secondaryColor};
            --success-color: ${this.theme.successColor};
            --error-color: ${this.theme.failureColor};
            --warning-color: ${this.theme.warningColor};
            --info-color: ${this.theme.infoColor};
            --bg-color: ${this.theme.backgroundColor};
            --text-color: ${this.theme.textColor};
            --font-family: ${this.theme.fontFamily};
            --font-size: ${this.theme.fontSize};
            --shadow: 0 2px 8px rgba(0,0,0,0.1);
            --shadow-hover: 0 4px 16px rgba(0,0,0,0.15);
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--font-family);
            font-size: var(--font-size);
            color: var(--text-color);
            background: var(--bg-color);
            line-height: 1.6;
        }
        
        /* Header Styles */
        .header {
            background: linear-gradient(135deg, var(--primary-color) 0%, #6B1352 100%);
            color: white;
            padding: 2rem 0;
            box-shadow: var(--shadow);
        }
        
        .header-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 2rem;
        }
        
        .logo {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .logo-icon {
            font-size: 3rem;
            opacity: 0.9;
        }
        
        .logo-text h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
        }
        
        .logo-text p {
            font-size: 0.875rem;
            opacity: 0.9;
        }
        
        .header-stats {
            display: flex;
            gap: 3rem;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
        }
        
        .stat-label {
            font-size: 0.875rem;
            opacity: 0.9;
        }
        
        /* Navigation */
        .navigation {
            background: white;
            border-bottom: 1px solid #e0e0e0;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .nav-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            gap: 2rem;
            overflow-x: auto;
        }
        
        .nav-tab {
            padding: 1rem 1.5rem;
            cursor: pointer;
            transition: all 0.3s ease;
            border-bottom: 3px solid transparent;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            white-space: nowrap;
        }
        
        .nav-tab:hover {
            background: var(--bg-color);
        }
        
        .nav-tab.active {
            color: var(--primary-color);
            border-bottom-color: var(--primary-color);
        }
        
        /* Main Content */
        .main-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .tab-content {
            display: none;
            animation: fadeIn 0.3s ease-in-out;
        }
        
        .tab-content.active {
            display: block;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* Cards */
        .card {
            background: white;
            border-radius: 8px;
            box-shadow: var(--shadow);
            overflow: hidden;
            transition: all 0.3s ease;
        }
        
        .card:hover {
            box-shadow: var(--shadow-hover);
        }
        
        .card-header {
            padding: 1.5rem;
            border-bottom: 1px solid #e0e0e0;
            background: #fafafa;
        }
        
        .card-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--text-color);
        }
        
        .card-body {
            padding: 1.5rem;
        }
        
        /* Grid Layouts */
        .grid {
            display: grid;
            gap: 1.5rem;
        }
        
        .grid-2 {
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
        }
        
        .grid-3 {
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        }
        
        .grid-4 {
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        }
        
        /* Status badges */
        .status-passed { color: var(--success-color); font-weight: 600; }
        .status-failed { color: var(--error-color); font-weight: 600; }
        .status-skipped { color: var(--warning-color); font-weight: 600; }
        .status-pending { color: var(--info-color); font-weight: 600; }
        
        /* Enhanced Chart Container */
        .chart-wrapper {
            position: relative;
            width: 100%;
            height: 300px;
            margin: 1rem 0;
        }
        
        .chart-container {
            width: 100%;
            height: 100%;
        }
        
        .custom-chart {
            width: 100%;
            height: 100%;
        }
        
        .chart-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            margin-top: 1rem;
            padding: 0.5rem;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
        }
        
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
        }
        
        /* Feature Statistics Table */
        .stats-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        
        .stats-table th,
        .stats-table td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .stats-table th {
            background: #f5f5f5;
            font-weight: 600;
            color: var(--text-color);
            position: sticky;
            top: 0;
        }
        
        .stats-table tr:hover {
            background: #f9f9f9;
        }
        
        .stats-table .number {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        
        /* Step Details */
        .step-item {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 1rem;
            margin: 0.5rem 0;
            border: 2px solid transparent;
            transition: all 0.2s ease;
        }
        
        .step-item.passed {
            border-left: 4px solid var(--success-color);
        }
        
        .step-item.failed {
            border-left: 4px solid var(--error-color);
            background: #fff5f5;
        }
        
        .step-item.skipped {
            border-left: 4px solid var(--warning-color);
            opacity: 0.7;
        }
        
        .step-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 0.5rem;
        }
        
        .step-text {
            font-weight: 500;
            flex: 1;
        }
        
        .step-duration {
            color: #666;
            font-size: 0.875rem;
        }
        
        .step-action-details {
            background: white;
            border-radius: 4px;
            padding: 0.75rem;
            margin-top: 0.5rem;
            border: 1px solid #e0e0e0;
        }
        
        .step-error {
            background: rgba(220, 53, 69, 0.1);
            border: 1px solid var(--error-color);
            border-radius: 4px;
            padding: 0.75rem;
            margin-top: 0.5rem;
            color: var(--error-color);
        }
        
        .step-error-message {
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .step-error-message i {
            margin-right: 0.5rem;
        }
        
        .step-error-stack {
            background: rgba(0,0,0,0.05);
            padding: 0.75rem;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.75rem;
            overflow-x: auto;
            margin-top: 0.5rem;
        }
        
        .action-row {
            display: flex;
            gap: 1rem;
            margin: 0.25rem 0;
            font-size: 0.875rem;
        }
        
        .action-label {
            font-weight: 600;
            color: #666;
            min-width: 80px;
        }
        
        .action-value {
            color: var(--text-color);
            font-family: monospace;
            word-break: break-all;
        }
        
        .step-error {
            background: #fee;
            border: 1px solid #fcc;
            border-radius: 4px;
            padding: 1rem;
            margin-top: 0.5rem;
        }
        
        .step-error-message {
            color: var(--error-color);
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .step-error-stack {
            font-family: monospace;
            font-size: 0.875rem;
            color: #666;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
            background: white;
            padding: 0.5rem;
            border-radius: 4px;
            margin-top: 0.5rem;
        }
        
        /* Screenshot Gallery */
        .screenshot-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
        }
        
        .screenshot-group {
            margin-bottom: 2rem;
        }
        
        .screenshot-group-header {
            background: #f5f5f5;
            padding: 0.75rem 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        
        .screenshot-item {
            position: relative;
            cursor: pointer;
            overflow: hidden;
            border-radius: 4px;
            box-shadow: var(--shadow);
            transition: all 0.3s ease;
        }
        
        .screenshot-item:hover {
            transform: scale(1.05);
            box-shadow: var(--shadow-hover);
        }
        
        .screenshot-thumbnail {
            width: 100%;
            height: 150px;
            object-fit: cover;
        }
        
        .screenshot-label {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 0.5rem;
            font-size: 0.75rem;
        }
        
        /* Logs Section */
        .log-container {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 1.5rem;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.875rem;
            max-height: 800px;
            overflow-y: auto;
        }
        
        .log-context-inline {
            color: #888;
            font-size: 0.8rem;
            font-style: italic;
        }
        
        .log-filters {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
            flex-wrap: wrap;
        }
        
        .log-filter-btn {
            padding: 0.5rem 1rem;
            border: 1px solid #ddd;
            background: white;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .log-filter-btn:hover {
            background: #f5f5f5;
        }
        
        .log-filter-btn.active {
            background: var(--primary-color);
            color: white;
            border-color: var(--primary-color);
        }
        
        .log-entry {
            padding: 0.5rem 0;
            border-bottom: 1px solid #333;
            line-height: 1.4;
        }
        
        .log-timestamp {
            color: #9cdcfe;
        }
        
        .log-level-info { color: #4ec9b0; }
        .log-level-warn { color: #dcdcaa; }
        .log-level-error { color: #f48771; }
        .log-level-debug { color: #c586c0; }
        
        .log-message {
            margin-left: 1rem;
        }
        
        .log-context {
            margin-left: 2rem;
            color: #808080;
            font-size: 0.8rem;
        }
        
        /* Environment Details */
        .env-category {
            margin-bottom: 2.5rem;
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .env-category-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--primary-color);
            margin-bottom: 1.5rem;
            padding-bottom: 0.75rem;
            border-bottom: 2px solid var(--primary-color);
        }
        
        .env-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1rem;
        }
        
        .env-item {
            background: #f8f9fa;
            padding: 1rem 1.25rem;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid #e9ecef;
            transition: all 0.2s;
        }
        
        .env-item:hover {
            background: #e9ecef;
            transform: translateX(2px);
        }
        
        .env-label {
            font-weight: 600;
            color: #495057;
            font-size: 0.875rem;
        }
        
        .env-value {
            color: var(--text-color);
            font-family: monospace;
            font-size: 0.875rem;
            text-align: right;
            max-width: 60%;
            word-break: break-word;
        }
        
        /* Enhanced metric cards with different colors */
        .metric-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
            position: relative;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            transition: all 0.3s;
        }
        
        .metric-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        }
        
        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
        }
        
        .metric-card.success::before {
            background: var(--success-color);
        }
        
        .metric-card.danger::before {
            background: var(--error-color);
        }
        
        .metric-card.warning::before {
            background: var(--warning-color);
        }
        
        .metric-card.info::before {
            background: var(--info-color);
        }
        
        .metric-card.primary::before {
            background: var(--primary-color);
        }
        
        .metric-icon {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            opacity: 0.8;
        }
        
        .metric-card.success .metric-icon {
            color: var(--success-color);
        }
        
        .metric-card.danger .metric-icon {
            color: var(--error-color);
        }
        
        .metric-card.warning .metric-icon {
            color: var(--warning-color);
        }
        
        .metric-card.info .metric-icon {
            color: var(--info-color);
        }
        
        .metric-card.primary .metric-icon {
            color: var(--primary-color);
        }
        
        .metric-value {
            font-size: 2rem;
            font-weight: bold;
            color: var(--text-color);
            margin: 0.5rem 0;
        }
        
        .metric-label {
            color: #666;
            font-size: 0.875rem;
        }
        
        /* Performance metrics */
        .performance-metric {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .performance-metric-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .performance-metric-title {
            font-weight: 600;
            color: var(--text-color);
        }
        
        .performance-metric-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--primary-color);
        }
        
        .performance-bar {
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .performance-bar-fill {
            height: 100%;
            transition: width 0.5s ease;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .header-content {
                flex-direction: column;
                text-align: center;
            }
            
            .header-stats {
                flex-wrap: wrap;
                justify-content: center;
            }
            
            .grid-2, .grid-3, .grid-4 {
                grid-template-columns: 1fr;
            }
            
            .nav-content {
                padding: 0 1rem;
            }
            
            .stats-table {
                font-size: 0.875rem;
            }
            
            .env-grid {
                grid-template-columns: 1fr;
            }
        }
        
        /* Features tab styles */
        .features-list {
            display: grid;
            gap: 1.5rem;
        }
        
        .feature-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .feature-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        }
        
        .feature-header {
            background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
            padding: 1.5rem;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .feature-header.passed {
            background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
        }
        
        .feature-header.failed {
            background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
        }
        
        .feature-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
            color: #333;
        }
        
        .feature-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        
        .feature-stat {
            text-align: center;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 8px;
            transition: background 0.3s ease;
        }
        
        .feature-stat:hover {
            background: #e9ecef;
        }
        
        .feature-stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.25rem;
        }
        
        .feature-stat-label {
            color: #6c757d;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .feature-scenarios {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1rem;
            margin-top: 1rem;
        }
        
        .feature-scenario-item {
            padding: 0.75rem 1rem;
            background: white;
            margin-bottom: 0.5rem;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s ease;
        }
        
        .feature-scenario-item:hover {
            background: #f8f9fa;
            transform: translateX(5px);
        }
        
        .feature-scenario-item:last-child {
            margin-bottom: 0;
        }
        
        /* Collapsible Scenarios */
        .scenario-card {
            overflow: hidden;
        }
        
        .scenario-header {
            cursor: pointer;
            position: relative;
            padding-right: 2rem;
        }
        
        .scenario-header::after {
            content: '\\25BC';
            position: absolute;
            right: 1rem;
            top: 50%;
            transform: translateY(-50%);
            transition: transform 0.3s ease;
        }
        
        .scenario-header.collapsed::after {
            transform: translateY(-50%) rotate(-90deg);
        }
        
        .scenario-content {
            max-height: 2000px;
            overflow: hidden;
            transition: max-height 0.3s ease, padding 0.3s ease;
        }
        
        .scenario-content.collapsed {
            max-height: 0;
            padding: 0 !important;
        }
        
        /* Lightbox */
        .lightbox {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }
        
        .lightbox.active {
            display: flex;
        }
        
        .lightbox-content {
            max-width: 90%;
            max-height: 90%;
        }
        
        .lightbox-close {
            position: absolute;
            top: 20px;
            right: 40px;
            color: white;
            font-size: 2rem;
            cursor: pointer;
        }
        
        /* Footer */
        footer {
            background: #2d3748;
            color: white;
            padding: 2rem;
            text-align: center;
            margin-top: 4rem;
        }
        
        .footer-content {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        /* Additional utility classes */
        .text-success { color: var(--success-color); }
        .text-danger { color: var(--error-color); }
        .text-warning { color: var(--warning-color); }
        .text-info { color: var(--info-color); }
        .text-muted { color: #6c757d; }
        
        .mt-1 { margin-top: 0.5rem; }
        .mt-2 { margin-top: 1rem; }
        .mt-3 { margin-top: 1.5rem; }
        .mt-4 { margin-top: 2rem; }
        
        .mb-1 { margin-bottom: 0.5rem; }
        .mb-2 { margin-bottom: 1rem; }
        .mb-3 { margin-bottom: 1.5rem; }
        .mb-4 { margin-bottom: 2rem; }
        
        /* Info tooltip */
        .info-tooltip {
            position: relative;
            display: inline-block;
            margin-left: 0.5rem;
            color: var(--info-color);
            cursor: help;
        }
        
        .info-tooltip .tooltip-text {
            visibility: hidden;
            position: absolute;
            width: 200px;
            background-color: rgba(0,0,0,0.8);
            color: white;
            text-align: center;
            padding: 0.5rem;
            border-radius: 4px;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.875rem;
            font-weight: normal;
        }
        
        .info-tooltip:hover .tooltip-text {
            visibility: visible;
        }
    </style>`;
    }

    private generateHeader(summary: any): string {
        const passRate = Math.round(summary.passRate || 0);
        const totalScenarios = summary.totalScenarios || 0;
        const totalSteps = summary.totalSteps || 0;
        const executionTime = this.formatDuration(summary.executionTime || summary.totalDuration || 0);

        return `
    <header class="header">
        <div class="header-content">
            <div class="logo">
                <i class="fas fa-vial logo-icon"></i>
                <div class="logo-text">
                    <h1>CS Test Automation Framework</h1>
                    <p>${this.reportTitle}</p>
                </div>
            </div>
            <div class="header-stats">
                <div class="stat">
                    <div class="stat-value ${passRate >= 80 ? 'text-success' : passRate >= 60 ? 'text-warning' : 'text-danger'}">${passRate}%</div>
                    <div class="stat-label">Pass Rate</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${totalScenarios}</div>
                    <div class="stat-label">Scenarios</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${totalSteps}</div>
                    <div class="stat-label">Steps</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${executionTime}</div>
                    <div class="stat-label">Duration</div>
                </div>
            </div>
        </div>
    </header>`;
    }

    private generateNavigation(): string {
        return `
    <nav class="navigation">
        <div class="nav-content">
            <div class="nav-tab active" onclick="showTab('dashboard')">
                <i class="fas fa-chart-line"></i>
                Dashboard
            </div>
            <div class="nav-tab" onclick="showTab('features')">
                <i class="fas fa-cubes"></i>
                Features
            </div>
            <div class="nav-tab" onclick="showTab('scenarios')">
                <i class="fas fa-list-check"></i>
                Scenarios
            </div>
            <div class="nav-tab" onclick="showTab('screenshots')">
                <i class="fas fa-camera"></i>
                Screenshots
            </div>
            <div class="nav-tab" onclick="showTab('performance')">
                <i class="fas fa-tachometer-alt"></i>
                Performance
            </div>
            <div class="nav-tab" onclick="showTab('logs')">
                <i class="fas fa-terminal"></i>
                Logs
            </div>
            <div class="nav-tab" onclick="showTab('environment')">
                <i class="fas fa-server"></i>
                Environment
            </div>
        </div>
    </nav>`;
    }

    private async generateImprovedDashboardTab(reportData: ReportData): Promise<string> {
        const summary = reportData.summary || {};
        const features = reportData.features || [];
        const scenarios = reportData.scenarios || [];
        
        // Calculate additional metrics
        const avgDuration = scenarios.length > 0 
            ? scenarios.reduce((sum, s) => sum + (s.duration || 0), 0) / scenarios.length 
            : 0;
        
        const stabilityScore = scenarios.length > 0
            ? Math.round((scenarios.filter(s => s.status === TestStatus.PASSED).length / scenarios.length) * 100)
            : 0;
        
        // Generate metric cards with different colors
        const metricCards = `
        <div class="grid grid-4 mb-4">
            <div class="metric-card success">
                <i class="fas fa-check-circle metric-icon"></i>
                <div class="metric-value">${summary.passedScenarios || 0}</div>
                <div class="metric-label">Passed</div>
            </div>
            <div class="metric-card danger">
                <i class="fas fa-times-circle metric-icon"></i>
                <div class="metric-value">${summary.failedScenarios || 0}</div>
                <div class="metric-label">Failed</div>
            </div>
            <div class="metric-card warning">
                <i class="fas fa-forward metric-icon"></i>
                <div class="metric-value">${summary.skippedScenarios || 0}</div>
                <div class="metric-label">Skipped</div>
            </div>
            <div class="metric-card info">
                <i class="fas fa-clock metric-icon"></i>
                <div class="metric-value">${this.formatDuration(summary.executionTime || 0)}</div>
                <div class="metric-label">Total Time</div>
            </div>
            <div class="metric-card primary">
                <i class="fas fa-chart-bar metric-icon"></i>
                <div class="metric-value">${this.formatDuration(avgDuration)}</div>
                <div class="metric-label">Avg Duration</div>
            </div>
            <div class="metric-card ${stabilityScore >= 80 ? 'success' : stabilityScore >= 60 ? 'warning' : 'danger'}">
                <i class="fas fa-shield-alt metric-icon"></i>
                <div class="metric-value">${stabilityScore}%</div>
                <div class="metric-label">Stability Score</div>
            </div>
            <div class="metric-card info">
                <i class="fas fa-cubes metric-icon"></i>
                <div class="metric-value">${summary.totalFeatures || 0}</div>
                <div class="metric-label">Features</div>
            </div>
            <div class="metric-card ${(summary.passRate || 0) >= 80 ? 'success' : (summary.passRate || 0) >= 60 ? 'warning' : 'danger'}">
                <i class="fas fa-percentage metric-icon"></i>
                <div class="metric-value">${Math.round(summary.passRate || 0)}%</div>
                <div class="metric-label">Pass Rate</div>
            </div>
        </div>`;
        
        // Generate status chart with correct colors and structure
        const statusChartData: PieChartData = {
            type: ChartType.PIE,
            title: 'Execution Status',
            labels: ['Passed', 'Failed', 'Skipped'],
            values: [
                summary.passedScenarios || 0,
                summary.failedScenarios || 0,
                summary.skippedScenarios || 0
            ],
            colors: [
                this.theme.successColor,
                this.theme.failureColor,
                this.theme.warningColor
            ],
            data: {},
            options: {
                responsive: true,
                maintainAspectRatio: false,
                legend: true
            }
        };
        
        const statusChartHtml = await this.chartGenerator.generateChart(
            ChartType.PIE,
            statusChartData,
            {
                width: 300,
                height: 300,
                showLegend: true,
                animations: true
            },
            this.theme
        );
        
        // Feature performance chart with correct structure
        const featureChartData: any = {
            type: ChartType.BAR,
            title: 'Feature Performance',
            data: {},
            options: {},
            labels: features.map(f => this.truncateText(f.name || 'Unknown', 20)),
            datasets: [{
                label: 'Pass Rate %',
                data: features.map(f => f.statistics?.passRate || 0),
                color: this.theme.primaryColor
            }]
        };
        
        const featureChartHtml = await this.chartGenerator.generateChart(
            ChartType.BAR,
            featureChartData,
            {
                width: 600,
                height: 300,
                showLegend: false,
                animations: true,
                colors: [this.theme.primaryColor]
            },
            this.theme
        );
        
        // Real execution trend from history
        const trendData = this.generateRealTrendData(reportData);
        let trendChart = '';
        try {
            trendChart = await this.chartGenerator.generateChart(
                ChartType.LINE,
                trendData as any,
                {
                    width: 600,
                    height: 300,
                    showLegend: true,
                    animations: true
                },
                this.theme
            );
        } catch (e) {
            trendChart = '<div style="text-align: center; padding: 2rem; color: #666;">Historical trend data will be available after multiple test runs</div>';
        }
        
        // Tag distribution
        const tagData = this.generateTagDistribution(reportData);
        let tagChart = '';
        try {
            tagChart = await this.chartGenerator.generateChart(
                ChartType.PIE,
                tagData as any,
                {
                    width: 300,
                    height: 300,
                    showLegend: false,
                    animations: true
                },
                this.theme
            );
        } catch (e) {
            tagChart = await this.chartGenerator.generateChart(
                ChartType.DOUGHNUT,
                tagData as any,
                {
                    width: 300,
                    height: 300,
                    showLegend: false,
                    animations: true
                },
                this.theme
            );
        }

        return `
    <div id="dashboard" class="tab-content active">
        <h2>Test Execution Dashboard</h2>
        
        <!-- Metrics Section -->
        ${metricCards}
        
        <!-- Charts Section -->
        <div class="grid grid-2 mb-4">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        Execution Status
                        <span class="info-tooltip">
                            <i class="fas fa-info-circle"></i>
                            <span class="tooltip-text">Shows the distribution of test scenarios by their execution status</span>
                        </span>
                    </h3>
                </div>
                <div class="card-body">
                    <div class="chart-wrapper">
                        ${statusChartHtml}
                        <div class="chart-legend">
                            <div class="legend-item">
                                <div class="legend-color" style="background: ${this.theme.successColor}"></div>
                                <span>Passed (${summary.passedScenarios || 0})</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: ${this.theme.failureColor}"></div>
                                <span>Failed (${summary.failedScenarios || 0})</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: ${this.theme.warningColor}"></div>
                                <span>Skipped (${summary.skippedScenarios || 0})</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        Feature Performance
                        <span class="info-tooltip">
                            <i class="fas fa-info-circle"></i>
                            <span class="tooltip-text">Pass rate percentage for each feature</span>
                        </span>
                    </h3>
                </div>
                <div class="card-body">
                    <div class="chart-wrapper">
                        ${featureChartHtml}
                        <div class="chart-legend">
                            <div class="legend-item">
                                <div class="legend-color" style="background: ${this.theme.primaryColor}"></div>
                                <span>Pass Rate %</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="grid grid-2">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        Execution Trend
                        <span class="info-tooltip">
                            <i class="fas fa-info-circle"></i>
                            <span class="tooltip-text">Historical view of test execution performance over time</span>
                        </span>
                    </h3>
                </div>
                <div class="card-body">
                    <div class="chart-wrapper">
                        ${trendChart}
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        Tag Distribution
                        <span class="info-tooltip">
                            <i class="fas fa-info-circle"></i>
                            <span class="tooltip-text">Distribution of test scenarios by their tags</span>
                        </span>
                    </h3>
                </div>
                <div class="card-body">
                    <div class="chart-wrapper">
                        ${tagChart}
                        <div class="chart-legend">
                            ${tagData.labels.map((label: string, i: number) => `
                            <div class="legend-item">
                                <div class="legend-color" style="background: ${tagData.colors[i]}"></div>
                                <span>${label} (${tagData.values[i]})</span>
                            </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    }

    private async generateEnhancedFeaturesTab(reportData: ReportData): Promise<string> {
        const features = reportData.features || [];
        
        if (features.length === 0) {
            return `
    <div id="features" class="tab-content">
        <h2>Feature Details</h2>
        <div class="card">
            <div class="card-body text-center">
                <i class="fas fa-cubes" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <p>No features found in the test execution.</p>
            </div>
        </div>
    </div>`;
        }
        
        // Generate detailed statistics table
        const statsTable = `
        <div class="card mb-4">
            <div class="card-header">
                <h3 class="card-title">Feature Statistics Overview</h3>
            </div>
            <div class="card-body">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Feature</th>
                            <th class="number">Total</th>
                            <th class="number">Passed</th>
                            <th class="number">Failed</th>
                            <th class="number">Skipped</th>
                            <th class="number">Pass Rate</th>
                            <th class="number">Duration</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${features.map(feature => {
                            const stats = feature.statistics || {};
                            const total = stats.totalScenarios || 0;
                            const passed = stats.passedScenarios || 0;
                            const failed = stats.failedScenarios || 0;
                            const skipped = stats.skippedScenarios || 0;
                            const passRate = Math.round(stats.passRate || 0);
                            const status = feature.status || 'unknown';
                            
                            // Calculate feature duration from scenarios if not available
                            const featureScenarios = (reportData.scenarios || []).filter(s => 
                                s.featureId === (feature as any).id || s.feature === feature.name
                            );
                            const calculatedDuration = featureScenarios.reduce((sum, s) => sum + (s.duration || 0), 0);
                            const duration = feature.duration || calculatedDuration || 0;
                            
                            return `
                            <tr>
                                <td>${feature.name || 'Unknown Feature'}</td>
                                <td class="number">${total}</td>
                                <td class="number text-success">${passed}</td>
                                <td class="number text-danger">${failed}</td>
                                <td class="number text-warning">${skipped}</td>
                                <td class="number">
                                    <span class="${passRate >= 80 ? 'text-success' : passRate >= 50 ? 'text-warning' : 'text-danger'}">
                                        ${passRate}%
                                    </span>
                                </td>
                                <td class="number">${this.formatDuration(duration)}</td>
                                <td><span class="status-${status.toLowerCase()}">${status.toUpperCase()}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight: 600; background: #f5f5f5;">
                            <td>Total</td>
                            <td class="number">${reportData.summary?.totalScenarios || 0}</td>
                            <td class="number text-success">${reportData.summary?.passedScenarios || 0}</td>
                            <td class="number text-danger">${reportData.summary?.failedScenarios || 0}</td>
                            <td class="number text-warning">${reportData.summary?.skippedScenarios || 0}</td>
                            <td class="number">${Math.round(reportData.summary?.passRate || 0)}%</td>
                            <td class="number">${this.formatDuration(reportData.summary?.executionTime || 0)}</td>
                            <td>-</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>`;
        
        // Generate detailed feature cards
        const featureCards = features.map(feature => {
            const stats = feature.statistics || {};
            const scenarios = (reportData.scenarios || []).filter(s => s.featureId === (feature as any).id || s.feature === feature.name);
            
            return `
            <div class="feature-card">
                <div class="feature-header ${stats.failedScenarios > 0 ? 'failed' : stats.passedScenarios === stats.totalScenarios ? 'passed' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="feature-title">${feature.name || 'Unknown Feature'}</h3>
                        <span class="status-${(feature.status || 'unknown').toLowerCase()}">${(feature.status || 'UNKNOWN').toUpperCase()}</span>
                    </div>
                    ${feature.description ? `<p class="mb-0 mt-2" style="opacity: 0.8;">${feature.description}</p>` : ''}
                </div>
                <div class="card-body">
                    <div class="feature-stats">
                        <div class="feature-stat">
                            <div class="feature-stat-value">${stats.totalScenarios || 0}</div>
                            <div class="feature-stat-label">Scenarios</div>
                        </div>
                        <div class="feature-stat">
                            <div class="feature-stat-value" style="color: var(--success-color);">${stats.passedScenarios || 0}</div>
                            <div class="feature-stat-label">Passed</div>
                        </div>
                        <div class="feature-stat">
                            <div class="feature-stat-value" style="color: var(--error-color);">${stats.failedScenarios || 0}</div>
                            <div class="feature-stat-label">Failed</div>
                        </div>
                        <div class="feature-stat">
                            <div class="feature-stat-value" style="color: ${stats.passRate >= 80 ? 'var(--success-color)' : stats.passRate >= 60 ? 'var(--warning-color)' : 'var(--error-color)'}">${Math.round(stats.passRate || 0)}%</div>
                            <div class="feature-stat-label">Pass Rate</div>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <i class="fas fa-clock"></i> Execution Time: <strong>${this.formatDuration(feature.duration || scenarios.reduce((sum, s) => sum + (s.duration || 0), 0) || 0)}</strong>
                    </div>
                    
                    ${scenarios.length > 0 ? `
                    <div class="feature-scenarios">
                        <h4 class="mb-3" style="font-size: 1rem; font-weight: 600;">Scenarios (${scenarios.length})</h4>
                        <div class="scenario-list">
                            ${scenarios.map(scenario => `
                            <div class="feature-scenario-item">
                                <div>
                                    <span class="status-${scenario.status.toLowerCase()}">●</span>
                                    <span style="margin-left: 0.5rem;">${scenario.scenario || 'Unknown Scenario'}</span>
                                </div>
                                <div>
                                    <span class="text-muted">${this.formatDuration(scenario.duration || 0)}</span>
                                </div>
                            </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>`;
        }).join('');
        
        return `
    <div id="features" class="tab-content">
        <h2>Feature Details</h2>
        ${statsTable}
        <div class="features-list">
            ${featureCards}
        </div>
    </div>`;
    }

    private async generateImprovedScenariosTab(reportData: ReportData): Promise<string> {
        const scenarios = reportData.scenarios || [];
        
        if (scenarios.length === 0) {
            return `
    <div id="scenarios" class="tab-content">
        <h2>Scenario Details</h2>
        <div class="card">
            <div class="card-body text-center">
                <i class="fas fa-list-check" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <p>No scenarios found in the test execution.</p>
            </div>
        </div>
    </div>`;
        }
        
        const scenarioCards = scenarios.map(scenario => {
            const status = scenario.status || TestStatus.SKIPPED;
            const steps = scenario.steps || [];
            const name = (scenario as any).name || scenario.scenario || 'Unknown Scenario';
            
            const scenarioId = `scenario-${scenario.scenarioId || Math.random().toString(36).substr(2, 9)}`;
            
            return `
            <div class="card scenario-card mb-3">
                <div class="card-header scenario-header collapsed" onclick="toggleScenario('${scenarioId}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="card-title">${name}</h3>
                        <span class="status-${status.toLowerCase()}">${status.toUpperCase()}</span>
                    </div>
                </div>
                <div class="card-body scenario-content collapsed" id="${scenarioId}">
                    <div class="scenario-meta mb-3">
                        <span><i class="fas fa-clock"></i> Duration: ${this.formatDuration(scenario.duration || 0)}</span>
                        <span class="ms-3"><i class="fas fa-tag"></i> Tags: ${(scenario.tags || []).join(', ') || 'None'}</span>
                        <span class="ms-3"><i class="fas fa-cubes"></i> Feature: ${scenario.feature || 'Unknown'}</span>
                    </div>
                    
                    <div class="steps-container">
                        <h4 class="mb-2">Steps:</h4>
                        ${steps.map((step) => {
                            const stepStatus = step.status || 'skipped';
                            const stepDetails = (step as any).actionDetails;
                            
                            return `
                            <div class="step-item ${stepStatus}">
                                <div class="step-header">
                                    <div class="step-text">
                                        <span class="status-${stepStatus}">●</span>
                                        <strong>${step.keyword}</strong> ${step.text}
                                    </div>
                                    <span class="step-duration">${this.formatDuration(step.duration || 0)}</span>
                                </div>
                                
                                ${stepDetails || step.status === 'failed' ? `
                                <div class="step-action-details">
                                    ${stepDetails ? `
                                    <div class="action-row">
                                        <span class="action-label">Action:</span>
                                        <span class="action-value">${stepDetails.action || 'Step Execution'}</span>
                                    </div>
                                    ${stepDetails.target ? `
                                    <div class="action-row">
                                        <span class="action-label">Target:</span>
                                        <span class="action-value">${stepDetails.target}</span>
                                    </div>
                                    ` : ''}
                                    ${stepDetails.value ? `
                                    <div class="action-row">
                                        <span class="action-label">Value:</span>
                                        <span class="action-value">${stepDetails.value}</span>
                                    </div>
                                    ` : ''}
                                    ${stepDetails.description ? `
                                    <div class="action-row">
                                        <span class="action-label">Details:</span>
                                        <span class="action-value">${stepDetails.description}</span>
                                    </div>
                                    ` : ''}
                                    ` : `
                                    <div class="action-row">
                                        <span class="action-label">Action:</span>
                                        <span class="action-value">Awaiting action details capture</span>
                                    </div>
                                    `}
                                </div>
                                ` : ''}
                                
                                ${step.status === 'failed' ? `
                                <div class="step-error">
                                    <div class="step-error-message">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        Error: ${(step as any).errorMessage || (step as any).error?.message || 'Test assertion failed'}
                                    </div>
                                    ${(step as any).stackTrace || (step as any).error?.stack ? `
                                    <details>
                                        <summary>Stack Trace (click to expand)</summary>
                                        <div class="step-error-stack">${((step as any).stackTrace || (step as any).error?.stack || '').replace(/\\n/g, '<br>')}</div>
                                    </details>
                                    ` : ''}
                                </div>
                                ` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                    
                    ${scenario.error ? `
                    <div class="mt-3 step-error">
                        <div class="step-error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            Scenario Error: ${scenario.error.message}
                        </div>
                        ${scenario.error.stack ? `
                        <details>
                            <summary>Stack Trace</summary>
                            <div class="step-error-stack">${scenario.error.stack}</div>
                        </details>
                        ` : ''}
                    </div>
                    ` : ''}
                </div>
            </div>`;
        }).join('');
        
        return `
    <div id="scenarios" class="tab-content">
        <h2>Scenario Details</h2>
        <div class="scenarios-list">
            ${scenarioCards}
        </div>
    </div>`;
    }

    private async generateImprovedScreenshotsTab(reportData: ReportData): Promise<string> {
        // Get screenshots from all possible sources
        const screenshots = await this.collectAllScreenshots(reportData);
        
        if (screenshots.length === 0) {
            // Check if evidence directory exists
            const evidenceExists = await this.checkEvidenceDirectory();
            
            return `
    <div id="screenshots" class="tab-content">
        <h2>Screenshots</h2>
        <div class="card">
            <div class="card-body text-center">
                <i class="fas fa-camera" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <p>No screenshots found in the report data.</p>
                ${evidenceExists ? `
                <p class="text-muted mt-2">
                    <i class="fas fa-info-circle"></i> 
                    Screenshots may exist in the evidence directory but are not linked to test results.
                    <br>Mode: ${this.screenshotMode}
                </p>
                ` : `
                <p class="text-muted mt-2">Mode: ${this.screenshotMode}</p>
                ${this.screenshotMode === 'on-failure' ? '<p class="text-muted">Screenshots are only captured for failed scenarios.</p>' : ''}
                `}
            </div>
        </div>
    </div>`;
        }
        
        // Filter screenshots based on mode and test results
        let filteredScreenshots = screenshots;
        if (this.screenshotMode === 'on-failure') {
            // Only show screenshots from failed scenarios
            const failedScenarioIds = new Set(
                (reportData.scenarios || [])
                    .filter(s => s.status === TestStatus.FAILED || (s as any).status === 'failed')
                    .map(s => s.scenarioId)
            );
            
            filteredScreenshots = screenshots.filter(s => 
                failedScenarioIds.has(s.scenarioId) ||
                s.status === 'failed' || 
                s.status === TestStatus.FAILED ||
                (s.path && (s.path.includes('failed') || s.path.includes('failure')))
            );
        }
        
        // Group screenshots by feature and scenario
        const groupedScreenshots = this.groupScreenshotsByFeatureAndScenario(filteredScreenshots);
        
        const screenshotGroups = Object.entries(groupedScreenshots).map(([featureName, scenarios]) => `
            <div class="screenshot-group">
                <div class="screenshot-group-header">
                    <i class="fas fa-cubes"></i> ${featureName}
                </div>
                ${Object.entries(scenarios as any).map(([scenarioName, shots]) => {
                    // Group screenshots by step
                    const stepGroups: Record<string, any[]> = {};
                    (shots as any[]).forEach(screenshot => {
                        const stepKey = screenshot.label || 'General';
                        if (!stepGroups[stepKey]) {
                            stepGroups[stepKey] = [];
                        }
                        stepGroups[stepKey].push(screenshot);
                    });
                    
                    return `
                    <div class="mb-3">
                        <h4 class="mb-2"><i class="fas fa-list-check"></i> ${scenarioName}</h4>
                        ${Object.entries(stepGroups).map(([stepName, stepShots]) => `
                            <div class="mb-2">
                                <h5 class="text-muted" style="font-size: 0.9rem; margin-bottom: 0.5rem;">
                                    <i class="fas fa-step-forward"></i> ${stepName}
                                </h5>
                                <div class="screenshot-gallery">
                                    ${stepShots.map(screenshot => {
                                // Convert absolute path to relative path for web display
                                let imagePath = screenshot.path || '';
                                // const originalPath = imagePath;
                                
                                // Handle different path formats
                                if (imagePath.includes('/reports/')) {
                                    // Extract the relative path from reports folder
                                    const parts = imagePath.split('/reports/');
                                    if (parts.length > 1) {
                                        // Get the report folder name and path after it
                                        const afterReports = parts[1];
                                        const reportFolderMatch = afterReports.match(/^(report-[^/]+)\/(.*)/);                                        
                                        if (reportFolderMatch) {
                                            // We're in a report subfolder, need to go up appropriately
                                            imagePath = '../' + reportFolderMatch[2];
                                        } else {
                                            imagePath = '../' + afterReports;
                                        }
                                    }
                                } else if (imagePath.includes('\\reports\\')) {
                                    // Windows path
                                    const parts = imagePath.split('\\reports\\');
                                    if (parts.length > 1) {
                                        const afterReports = parts[1].replace(/\\/g, '/');
                                        const reportFolderMatch = afterReports.match(/^(report-[^/]+)\/(.*)/);                                        
                                        if (reportFolderMatch) {
                                            imagePath = '../' + reportFolderMatch[2];
                                        } else {
                                            imagePath = '../' + afterReports;
                                        }
                                    }
                                } else if (imagePath.includes('/screenshots/')) {
                                    // Direct screenshots folder reference
                                    imagePath = '../../screenshots/' + imagePath.split('/screenshots/').pop();
                                } else if (imagePath.includes('\\screenshots\\')) {
                                    imagePath = '../../screenshots/' + imagePath.split('\\screenshots\\').pop()?.replace(/\\/g, '/');
                                }
                                
                                // Ensure proper path format for display
                                const displayPath = imagePath;
                                
                                // Create a data attribute for the actual image path
                                const dataPath = imagePath.replace(/"/g, '&quot;');
                                
                                return `
                                <div class="screenshot-item" data-image-path="${dataPath}" onclick="openLightbox(this)">
                                    <img src="${displayPath}" class="screenshot-thumbnail" 
                                         alt="${screenshot.label || 'Screenshot'}"
                                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'250\\' height=\\'150\\' viewBox=\\'0 0 250 150\\'%3E%3Crect width=\\'250\\' height=\\'150\\' fill=\\'%23ddd\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23999\\' font-family=\\'Arial\\' font-size=\\'14\\'%3EImage not found%3C/text%3E%3C/svg%3E'">
                                    <div class="screenshot-label">${screenshot.label || 'Screenshot'}</div>
                                </div>
                                `;
                                    }).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}).join('')}
            </div>
        `).join('');
        
        return `
    <div id="screenshots" class="tab-content">
        <h2>Screenshots</h2>
        <div class="mb-3">
            <span class="badge bg-info">Mode: ${this.screenshotMode}</span>
            <span class="badge bg-secondary ms-2">Total: ${screenshots.length}</span>
        </div>
        ${screenshotGroups}
        
        <!-- Lightbox -->
        <div id="lightbox" class="lightbox" onclick="closeLightbox()">
            <span class="lightbox-close">&times;</span>
            <img class="lightbox-content" id="lightbox-img">
        </div>
    </div>`;
    }

    private async generateImprovedPerformanceTab(reportData: ReportData): Promise<string> {
        // const metrics = reportData.metrics || {};
        const scenarios = reportData.scenarios || [];
        
        // Get actual performance data from scenarios and steps
        const performanceData = await this.calculateRealPerformanceMetrics(reportData);
        
        // Find slowest and fastest scenarios
        const sortedScenarios = [...scenarios].sort((a, b) => (a.duration || 0) - (b.duration || 0));
        const fastestScenarios = sortedScenarios.slice(0, 5);
        const slowestScenarios = sortedScenarios.slice(-5).reverse();
        
        return `
    <div id="performance" class="tab-content">
        <h2>Performance Metrics</h2>
        
        <div class="grid grid-3 mb-4">
            <div class="performance-metric">
                <div class="performance-metric-header">
                    <span class="performance-metric-title">Page Load Time</span>
                    <span class="performance-metric-value">${performanceData.pageLoadTime}ms</span>
                </div>
                <div class="performance-bar">
                    <div class="performance-bar-fill" style="width: ${Math.min(100, (2000 - performanceData.pageLoadTime) / 20)}%; background: ${performanceData.pageLoadTime < 1000 ? 'var(--success-color)' : performanceData.pageLoadTime < 2000 ? 'var(--warning-color)' : 'var(--error-color)'};"></div>
                </div>
                <small class="text-muted">Target: < 1000ms</small>
            </div>
            
            <div class="performance-metric">
                <div class="performance-metric-header">
                    <span class="performance-metric-title">Response Time</span>
                    <span class="performance-metric-value">${performanceData.responseTime}ms</span>
                </div>
                <div class="performance-bar">
                    <div class="performance-bar-fill" style="width: ${Math.min(100, (500 - performanceData.responseTime) / 5)}%; background: ${performanceData.responseTime < 200 ? 'var(--success-color)' : performanceData.responseTime < 500 ? 'var(--warning-color)' : 'var(--error-color)'};"></div>
                </div>
                <small class="text-muted">Target: < 200ms</small>
            </div>
            
            <div class="performance-metric">
                <div class="performance-metric-header">
                    <span class="performance-metric-title">Network Latency</span>
                    <span class="performance-metric-value">${performanceData.networkLatency}ms</span>
                </div>
                <div class="performance-bar">
                    <div class="performance-bar-fill" style="width: ${Math.min(100, (100 - performanceData.networkLatency))}%; background: ${performanceData.networkLatency < 50 ? 'var(--success-color)' : performanceData.networkLatency < 100 ? 'var(--warning-color)' : 'var(--error-color)'};"></div>
                </div>
                <small class="text-muted">Target: < 50ms</small>
            </div>
        </div>
        
        <div class="grid grid-2">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Fastest Scenarios</h3>
                </div>
                <div class="card-body">
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Scenario</th>
                                <th class="number">Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fastestScenarios.map(s => `
                            <tr>
                                <td>${s.scenario || 'Unknown'}</td>
                                <td class="number text-success">${this.formatDuration(s.duration || 0)}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Slowest Scenarios</h3>
                </div>
                <div class="card-body">
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Scenario</th>
                                <th class="number">Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${slowestScenarios.map(s => `
                            <tr>
                                <td>${s.scenario || 'Unknown'}</td>
                                <td class="number text-danger">${this.formatDuration(s.duration || 0)}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="card mt-4">
            <div class="card-header">
                <h3 class="card-title">Performance Summary</h3>
            </div>
            <div class="card-body">
                <div class="grid grid-4">
                    <div class="text-center">
                        <div style="font-size: 1.25rem; font-weight: bold;">${this.formatDuration(performanceData.avgScenarioDuration)}</div>
                        <div class="text-muted">Avg Scenario Time</div>
                    </div>
                    <div class="text-center">
                        <div style="font-size: 1.25rem; font-weight: bold;">${this.formatDuration(performanceData.avgStepDuration)}</div>
                        <div class="text-muted">Avg Step Time</div>
                    </div>
                    <div class="text-center">
                        <div style="font-size: 1.25rem; font-weight: bold;">${performanceData.totalSteps}</div>
                        <div class="text-muted">Total Steps</div>
                    </div>
                    <div class="text-center">
                        <div style="font-size: 1.25rem; font-weight: bold;">${performanceData.stepsPerSecond.toFixed(2)}</div>
                        <div class="text-muted">Steps/Second</div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    }

    private generateImprovedLogsTab(logs: any[]): string {
        // Group logs by level
        const groupedLogs = logs.reduce((acc, log) => {
            const level = log.level || 'info';
            if (!acc[level]) acc[level] = [];
            acc[level].push(log);
            return acc;
        }, {} as Record<string, any[]>);
        
        return `
    <div id="logs" class="tab-content">
        <h2>Execution Logs</h2>
        
        <div class="log-filters mb-3">
            <button class="log-filter-btn active" onclick="filterLogs('all')">
                All (${logs.length})
            </button>
            <button class="log-filter-btn" onclick="filterLogs('info')">
                <i class="fas fa-info-circle"></i> Info (${groupedLogs.info?.length || 0})
            </button>
            <button class="log-filter-btn" onclick="filterLogs('warn')">
                <i class="fas fa-exclamation-triangle"></i> Warn (${groupedLogs.warn?.length || 0})
            </button>
            <button class="log-filter-btn" onclick="filterLogs('error')">
                <i class="fas fa-times-circle"></i> Error (${groupedLogs.error?.length || 0})
            </button>
            <button class="log-filter-btn" onclick="filterLogs('debug')">
                <i class="fas fa-bug"></i> Debug (${groupedLogs.debug?.length || 0})
            </button>
        </div>
        
        <div class="card">
            <div class="card-body">
                <div class="log-container" id="log-container">
                    ${logs.map(log => {
                        // Clean up log message
                        let message = log.message || '';
                        if (message === 'No message') {
                            message = ''; // Skip "No message" logs
                        }
                        
                        // Extract meaningful context
                        let contextStr = '';
                        if (log.context && typeof log.context === 'object') {
                            // Filter out repetitive context values
                            const filteredContext = Object.entries(log.context)
                                .filter(([key, value]) => 
                                    key !== 'environment' && 
                                    key !== 'version' && 
                                    key !== 'service' &&
                                    value !== undefined &&
                                    value !== null &&
                                    value !== ''
                                );
                            
                            if (filteredContext.length > 0) {
                                contextStr = filteredContext
                                    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                                    .join(', ');
                            }
                        }
                        
                        // Skip logs with no meaningful content
                        if (!message && !contextStr) {
                            return '';
                        }
                        
                        return `
                        <div class="log-entry log-${log.level}" data-level="${log.level}">
                            <span class="log-timestamp">[${log.timestamp}]</span>
                            <span class="log-level-${log.level}">[${(log.level || 'info').toUpperCase()}]</span>
                            <span class="log-message">${this.escapeHtml(message)}</span>
                            ${contextStr ? `<span class="log-context-inline"> | ${contextStr}</span>` : ''}
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    </div>`;
    }

    private generateImprovedEnvironmentTab(environment: any): string {
        // Categorize environment details
        const categories = {
            'System Information': {
                'Operating System': environment['Operating System'],
                'OS Version': environment['OS Version'],
                'Platform': environment['Platform'],
                'CPU Architecture': environment['CPU Architecture'],
                'CPU Model': environment['CPU Model'],
                'CPU Cores': environment['CPU Cores'],
                'Total Memory': environment['Total Memory'],
                'Free Memory': environment['Free Memory']
            },
            'Test Configuration': {
                'Test Environment': environment['Test Environment'],
                'Base URL': environment['Base URL'],
                'API Base URL': environment['API Base URL'],
                'Browser': environment['Browser'],
                'Browser Version': environment['Browser Version'],
                'Headless Mode': environment['Headless Mode'],
                'Screenshot Mode': environment['Screenshot Mode'],
                'Video Recording': environment['Video Recording']
            },
            'Execution Settings': {
                'Parallel Execution': environment['Parallel Execution'],
                'Max Workers': environment['Max Workers'],
                'Test Timeout': environment['Test Timeout'],
                'Network Recording': environment['Network Recording']
            },
            'Runtime Information': {
                'Node Version': environment['Node Version'],
                'Playwright Version': environment['Playwright Version'],
                'Hostname': environment['Hostname'],
                'User': environment['User'],
                'Home Directory': environment['Home Directory'],
                'Report Generated': environment['Report Generated'],
                'Time Zone': environment['Time Zone']
            }
        };
        
        return `
    <div id="environment" class="tab-content">
        <h2>Environment Details</h2>
        
        ${Object.entries(categories).map(([category, items]) => `
        <div class="env-category">
            <h3 class="env-category-title">${category}</h3>
            <div class="env-grid">
                ${Object.entries(items).map(([key, value]) => `
                <div class="env-item">
                    <span class="env-label">${key}:</span>
                    <span class="env-value">${value || 'N/A'}</span>
                </div>
                `).join('')}
            </div>
        </div>
        `).join('')}
    </div>`;
    }

    private generateFooter(metadata: any): string {
        return `
    <footer>
        <div class="footer-content">
            <p>${this.teamName} - ${this.reportTitle}</p>
            <p>Generated on ${new Date().toLocaleString()} | Framework v${metadata.frameworkVersion || '1.0.0'}</p>
        </div>
    </footer>`;
    }

    private generateImprovedJavaScript(): string {
        return `
    <script>
        // Tab navigation
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Remove active class from all nav tabs
            document.querySelectorAll('.nav-tab').forEach(navTab => {
                navTab.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            
            // Add active class to clicked nav tab
            event.target.closest('.nav-tab').classList.add('active');
        }
        
        // Collapsible scenarios
        function toggleScenario(scenarioId) {
            const content = document.getElementById(scenarioId);
            const header = content.previousElementSibling;
            
            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                header.classList.remove('collapsed');
            } else {
                content.classList.add('collapsed');
                header.classList.add('collapsed');
            }
        }
        
        // Lightbox functionality
        function openLightbox(element) {
            const lightbox = document.getElementById('lightbox');
            const img = document.getElementById('lightbox-img');
            
            // Get the image path from data attribute
            const imagePath = element.getAttribute('data-image-path');
            
            // For relative paths, try to resolve them properly
            let resolvedPath = imagePath;
            
            // If it's a relative path, try to make it absolute based on the current location
            if (imagePath.startsWith('../')) {
                // Get the current location path
                const currentPath = window.location.pathname;
                const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
                
                // Resolve the relative path
                let relativeParts = imagePath.split('/');
                let pathParts = currentDir.split('/');
                
                for (let part of relativeParts) {
                    if (part === '..') {
                        pathParts.pop();
                    } else if (part !== '.') {
                        pathParts.push(part);
                    }
                }
                
                resolvedPath = pathParts.join('/');
            }
            
            img.src = resolvedPath;
            img.onerror = function() {
                // Try the original path if resolved path fails
                if (resolvedPath !== imagePath) {
                    this.src = imagePath;
                    this.onerror = function() {
                        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"%3E%3Crect width="400" height="300" fill="%23f0f0f0"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="20"%3EImage not found%3C/text%3E%3C/svg%3E';
                    };
                } else {
                    this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"%3E%3Crect width="400" height="300" fill="%23f0f0f0"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="20"%3EImage not found%3C/text%3E%3C/svg%3E';
                }
            };
            lightbox.classList.add('active');
        }
        
        function closeLightbox() {
            document.getElementById('lightbox').classList.remove('active');
        }
        
        // Log filtering
        function filterLogs(level) {
            const logEntries = document.querySelectorAll('.log-entry');
            logEntries.forEach(entry => {
                if (level === 'all' || entry.dataset.level === level) {
                    entry.style.display = 'block';
                } else {
                    entry.style.display = 'none';
                }
            });
            
            // Update button states
            document.querySelectorAll('.log-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            // Add keyboard navigation
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && document.getElementById('lightbox').classList.contains('active')) {
                    closeLightbox();
                }
            });
            
            // Make tables sortable
            document.querySelectorAll('.stats-table').forEach(table => {
                const headers = table.querySelectorAll('th');
                headers.forEach((header, index) => {
                    header.style.cursor = 'pointer';
                    header.addEventListener('click', () => sortTable(table, index));
                });
            });
        });
        
        // Table sorting
        function sortTable(table, columnIndex) {
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            const isNumeric = rows.every(row => {
                const cell = row.cells[columnIndex];
                return !isNaN(parseFloat(cell.textContent.replace(/[^0-9.-]/g, '')));
            });
            
            rows.sort((a, b) => {
                const aValue = a.cells[columnIndex].textContent;
                const bValue = b.cells[columnIndex].textContent;
                
                if (isNumeric) {
                    return parseFloat(aValue.replace(/[^0-9.-]/g, '')) - parseFloat(bValue.replace(/[^0-9.-]/g, ''));
                }
                return aValue.localeCompare(bValue);
            });
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
        }

        document.addEventListener('DOMContentLoaded', function() {
            // Initialize charts
            initializeCharts();
        });

        function initializeCharts() {
            // Status Chart
            const statusChartEl = document.getElementById('execution-pie-chart');
            if (statusChartEl) {
                const statusChart = new ChartGenerator();
                statusChart.generateChart(
                    ChartType.PIE,
                    statusChartData,
                    {
                        width: statusChartEl.clientWidth,
                        height: statusChartEl.clientHeight,
                        showLegend: true,
                        animations: true
                    },
                    {
                        dataColors: [
                            theme.successColor,
                            theme.failureColor,
                            theme.warningColor
                        ],
                        textColor: '#333',
                        gridColor: '#ddd'
                    }
                );
            }

            // Tag Distribution Chart
            const tagChartEl = document.getElementById('tag-distribution-chart');
            if (tagChartEl) {
                const tagChart = new ChartGenerator();
                tagChart.generateChart(
                    ChartType.PIE,
                    tagData,
                    {
                        width: tagChartEl.clientWidth,
                        height: tagChartEl.clientHeight,
                        showLegend: true,
                        animations: true
                    },
                    {
                        dataColors: [
                            theme.primaryColor,
                            theme.successColor,
                            theme.warningColor,
                            theme.infoColor,
                            '#FF6B6B',
                            '#4ECDC4',
                            '#45B7D1',
                            '#96CEB4'
                        ],
                        textColor: '#333',
                        gridColor: '#ddd'
                    }
                );
            }
        }
    </script>`;
    }

    // Helper methods
    private async getCompleteLogs(): Promise<any[]> {
        const actionLogger = ActionLogger.getInstance();
        const logs: any[] = [];
        const processedTimestamps = new Set<string>();
        
        try {
            // Get ALL logs from ActionLogger
            const allLogs = actionLogger.getAllLogs();
            
            // Process all logs
            allLogs.forEach(log => {
                // Skip logs without valid timestamps
                if (!log.timestamp || (typeof log.timestamp === 'string' && isNaN(Date.parse(log.timestamp)))) {
                    return;
                }
                
                // Skip logs with generic messages that are likely type names
                const messageStr = log.message?.toString().toLowerCase();
                if (messageStr && ['general', 'action', 'error', 'debug', 'info', 'warn'].includes(messageStr)) {
                    return;
                }
                
                const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit'
                }) + '.' + new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0');
                
                const key = `${timestamp}-${log.message}`;
                if (!processedTimestamps.has(key)) {
                    processedTimestamps.add(key);
                    logs.push({
                        timestamp,
                        level: log.level || 'info',
                        message: log.message || '',
                        context: log.context || (log as any).details
                    });
                }
            });
            
            // Also get any buffered logs
            const recentLogs = actionLogger.getRecentLogs(100000); // Get up to 100k logs
            recentLogs.forEach(log => {
                // Skip logs without valid timestamps
                if (!log.timestamp || (typeof log.timestamp === 'string' && isNaN(Date.parse(log.timestamp)))) {
                    return;
                }
                
                // Skip logs with generic messages that are likely type names
                const messageStr = log.message?.toString().toLowerCase();
                if (messageStr && ['general', 'action', 'error', 'debug', 'info', 'warn'].includes(messageStr)) {
                    return;
                }
                
                const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit'
                }) + '.' + new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0');
                
                const key = `${timestamp}-${log.message}`;
                if (!processedTimestamps.has(key)) {
                    processedTimestamps.add(key);
                    logs.push({
                        timestamp,
                        level: log.level || 'info',
                        message: log.message || '',
                        context: log.context || (log as any).details
                    });
                }
            });
            
            // Also try to read execution logs from files to merge with in-memory logs
            try {
                // Read logs from log files
                const fileLogs = await this.readLogFiles();
                
                // Process file logs
                fileLogs.forEach(log => {
                    let timestamp: string;
                    if (log.timestamp && (typeof log.timestamp === 'string' && !isNaN(Date.parse(log.timestamp)))) {
                        const date = new Date(log.timestamp);
                        timestamp = date.toLocaleTimeString('en-US', { 
                            hour12: false, 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit'
                        }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
                    } else {
                        // Skip logs without valid timestamps
                        return;
                    }
                    
                    // Skip logs with generic messages that are likely type names
                    const messageStr = log.message?.toString().toLowerCase();
                    if (messageStr && ['general', 'action', 'error', 'debug', 'info', 'warn'].includes(messageStr)) {
                        return;
                    }
                    
                    const key = `${timestamp}-${log.message || ''}`;
                    if (!processedTimestamps.has(key)) {
                        processedTimestamps.add(key);
                        
                        // Skip logs that are just context without message
                        if (!log.message && log.context) {
                            return;
                        }
                        
                        logs.push({
                            timestamp,
                            level: log.level || 'info',
                            message: log.message || '',
                            context: log.context || log.details || {}
                        });
                    }
                });
            } catch (error) {
                this.logger.debug('Could not read log files', error as Error);
            }
            
            // Also read console logs
            try {
                const consoleLogs = await this.readConsoleLogs();
                consoleLogs.forEach(log => {
                    let timestamp: string;
                    
                    // Check if timestamp is a valid ISO string
                    if (log.timestamp && (typeof log.timestamp === 'string' && !isNaN(Date.parse(log.timestamp)))) {
                        const date = new Date(log.timestamp);
                        timestamp = date.toLocaleTimeString('en-US', { 
                            hour12: false, 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit'
                        }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
                    } else {
                        // Use timestamp as is if it's already formatted
                        timestamp = log.timestamp || new Date().toLocaleTimeString();
                    }
                    
                    const key = `${timestamp}-console-${log.message}`;
                    if (!processedTimestamps.has(key)) {
                        processedTimestamps.add(key);
                        logs.push({
                            timestamp,
                            level: log.level || 'info',
                            message: log.message.startsWith('[Console]') ? log.message : `[Console] ${log.message}`,
                            context: log.metadata || {}
                        });
                    }
                });
            } catch (error) {
                this.logger.debug('Could not read console logs', error as Error);
            }
            
        } catch (error) {
            this.logger.debug('Error getting logs', error as Error);
            // Fallback message if no logs found
            if (logs.length === 0) {
                logs.push({
                    timestamp: new Date().toLocaleTimeString(),
                    level: 'info',
                    message: 'No logs available. Logs may have been written to file but not captured in memory.',
                    context: {}
                });
            }
        }
        
        // Sort logs by timestamp
        logs.sort((a, b) => {
            return a.timestamp.localeCompare(b.timestamp);
        });
        
        return logs;
    }

    private getEnhancedEnvironment(metadata: any): any {
        const platform = os.platform();
        const osName = this.getOSName(platform);
        let environment = 'unknown';
        try {
            environment = ConfigurationManager.getEnvironmentName();
        } catch {
            environment = metadata.environment || 'development';
        }
        
        return {
            'Test Environment': environment !== 'unknown' ? environment : 'Development',
            'Operating System': osName,
            'OS Version': os.release(),
            'Node Version': process.version,
            'CPU Architecture': os.arch(),
            'Total Memory': `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
            'Free Memory': `${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`,
            'CPU Cores': os.cpus().length,
            'CPU Model': (() => {
                const cpus = os.cpus();
                return cpus.length > 0 && cpus[0] ? cpus[0].model : 'Unknown';
            })(),
            'Hostname': os.hostname(),
            'User': os.userInfo().username,
            'Home Directory': os.homedir(),
            'Platform': platform,
            'Playwright Version': metadata.playwrightVersion || 'Unknown',
            'Browser': metadata.browser || 'Chromium',
            'Browser Version': metadata.browserVersion || 'Unknown',
            'Base URL': (() => { try { return ConfigurationManager.get('BASE_URL', 'Not configured'); } catch { return 'Not configured'; } })(),
            'API Base URL': (() => { try { return ConfigurationManager.get('API_BASE_URL', 'Not configured'); } catch { return 'Not configured'; } })(),
            'Parallel Execution': (() => { try { return ConfigurationManager.getBoolean('PARALLEL_EXECUTION', false) ? 'Enabled' : 'Disabled'; } catch { return 'Disabled'; } })(),
            'Max Workers': (() => { try { return ConfigurationManager.getInt('MAX_PARALLEL_WORKERS', 1); } catch { return 1; } })(),
            'Headless Mode': (() => { try { return ConfigurationManager.getBoolean('HEADLESS_MODE', false) ? 'Yes' : 'No'; } catch { return metadata.executionOptions?.headless ? 'Yes' : 'No'; } })(),
            'Screenshot Mode': this.screenshotMode,
            'Video Recording': (() => { try { return ConfigurationManager.getBoolean('VIDEO_RECORDING', false) ? 'Enabled' : 'Disabled'; } catch { return 'Disabled'; } })(),
            'Network Recording': (() => { try { return ConfigurationManager.getBoolean('RECORD_HAR', false) ? 'Enabled' : 'Disabled'; } catch { return 'Disabled'; } })(),
            'Test Timeout': (() => { try { return `${ConfigurationManager.getInt('DEFAULT_TIMEOUT', 30000) / 1000}s`; } catch { return '30s'; } })(),
            'Report Generated': new Date().toLocaleString(),
            'Time Zone': Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }

    private async collectAllScreenshots(reportData: ReportData): Promise<any[]> {
        const screenshots: any[] = [];
        const addedPaths = new Set<string>(); // Track added screenshots to avoid duplicates
        
        try {
            // 1. Get screenshots from scenarios and steps
            const scenarios = reportData.scenarios || [];
        for (const scenario of scenarios) {
            // Check if we should include screenshots based on mode
            if (this.screenshotMode === 'never') continue;
            if (this.screenshotMode === 'on-failure' && scenario.status !== TestStatus.FAILED) continue;
            
            // Get screenshots from steps
            const steps = scenario.steps || [];
            for (const step of steps) {
                if ((step as any).attachments) {
                    for (const attachment of (step as any).attachments) {
                        if (attachment.mimeType?.startsWith('image/')) {
                            const screenshotPath = attachment.path || attachment.data;
                            if (!addedPaths.has(screenshotPath)) {
                                addedPaths.add(screenshotPath);
                                
                                // Use metadata if available, otherwise fallback to default values
                                const metadata = attachment.metadata || {};
                                screenshots.push({
                                    path: screenshotPath,
                                    label: metadata.stepLabel || `${step.keyword} ${step.text}`,
                                    scenarioId: scenario.scenarioId,
                                    scenarioName: metadata.scenarioName || scenario.scenario,
                                    featureId: scenario.featureId,
                                    featureName: metadata.featureName || scenario.feature,
                                    status: metadata.status || step.status
                                });
                            }
                        }
                    }
                }
            }
            
            // Get screenshots from scenario evidence
            if (scenario.evidence?.screenshots) {
                for (const screenshot of scenario.evidence.screenshots) {
                    const screenshotPath = (screenshot as any).path || screenshot;
                    if (!addedPaths.has(screenshotPath)) {
                        addedPaths.add(screenshotPath);
                        screenshots.push({
                            path: screenshotPath,
                            label: (screenshot as any).name || 'Scenario Screenshot',
                            scenarioId: scenario.scenarioId,
                            scenarioName: scenario.scenario,
                            featureId: scenario.featureId,
                            featureName: scenario.feature,
                            status: scenario.status
                        });
                    }
                }
            }
        }
        
        // If we have screenshots from scenarios/steps but need to verify they exist in evidence directory
        if (screenshots.length > 0 && this.screenshotMode !== 'never') {
            // Get the current report folder name
            const reportFolderName = this.getReportFolderName();
            
            // Check if we're running inside the report directory
            const cwd = process.cwd();
            const evidencePath = cwd.includes(reportFolderName) 
                ? path.join(cwd, 'evidence', 'screenshots')
                : path.join(cwd, 'reports', reportFolderName, 'evidence', 'screenshots');
            
            // Update screenshot paths to point to evidence directory
            for (const screenshot of screenshots) {
                const filename = path.basename(screenshot.path);
                const evidenceFilePath = path.join(evidencePath, filename);
                
                // Check if file exists in evidence directory
                if (await FileUtils.pathExists(evidenceFilePath)) {
                    // Update path to evidence directory location
                    screenshot.path = evidenceFilePath;
                    this.logger.debug(`Found screenshot in evidence: ${filename}`);
                }
            }
            
            this.logger.debug(`Collected ${screenshots.length} screenshots with metadata from scenarios/steps`);
        } else if (screenshots.length === 0) {
            // Only collect from evidence directory if no screenshots found in scenarios
            this.logger.debug('No screenshots found in scenarios, checking evidence directory');
            
            const reportFolderName = this.getReportFolderName();
            const cwd = process.cwd();
            const evidencePath = cwd.includes(reportFolderName) 
                ? path.join(cwd, 'evidence', 'screenshots')
                : path.join(cwd, 'reports', reportFolderName, 'evidence', 'screenshots');
                
            if (await FileUtils.pathExists(evidencePath)) {
                this.logger.debug(`Collecting screenshots from evidence directory: ${evidencePath}`);
                await this.collectScreenshotsFromDirectory(evidencePath, screenshots, scenarios, addedPaths);
            }
        }
        } catch (error) {
            this.logger.debug('Error collecting screenshots from evidence directory', error as Error);
        }
        
        return screenshots;
    }

    private async collectScreenshotsFromDirectory(dir: string, screenshots: any[], scenarios: any[], addedPaths?: Set<string>): Promise<void> {
        try {
            const files = await FileUtils.readDir(dir);
            const pathSet = addedPaths || new Set<string>();
            
            for (const file of files) {
                if (file.match(/\.(png|jpg|jpeg|gif)$/i)) {
                    const filePath = path.join(dir, file);
                    
                    // Skip if already added
                    if (pathSet.has(filePath)) continue;
                    
                    // Only add screenshots from failed scenarios in on-failure mode
                    if (this.screenshotMode === 'on-failure') {
                        // First check if this is a failure screenshot
                        const isFailureScreenshot = file.toLowerCase().includes('fail') || 
                                                  file.toLowerCase().includes('error');
                        
                        if (isFailureScreenshot) {
                            // Try to match screenshot to a failed scenario
                            let matched = false;
                            for (const scenario of scenarios) {
                                if (scenario.status === TestStatus.FAILED &&
                                    (file.toLowerCase().includes(scenario.scenarioId?.toLowerCase()) ||
                                     file.toLowerCase().includes(scenario.scenario?.toLowerCase().replace(/\s+/g, '-')))) {
                                    pathSet.add(filePath);
                                    screenshots.push({
                                        path: filePath,
                                        label: file,
                                        scenarioId: scenario.scenarioId,
                                        scenarioName: scenario.scenario,
                                        featureId: scenario.featureId,
                                        featureName: scenario.feature,
                                        status: scenario.status
                                    });
                                    matched = true;
                                    break;
                                }
                            }
                            
                            // If it's a failure screenshot but couldn't match to specific scenario,
                            // add it as general failure evidence
                            if (!matched) {
                                // Try to extract more context from the filename
                                let label = file;
                                let scenarioName = 'Failed Tests';
                                let featureName = 'Test Failures';
                                
                                // Try to parse failure screenshots with scenario names
                                // Pattern: failure-<scenario_name>_<timestamp>-<date>.png
                                const failureMatch = file.match(/failure-(.+?)_\d+-.+\.png$/);
                                if (failureMatch) {
                                    scenarioName = failureMatch[1]?.replace(/_/g, ' ') || 'Unknown Scenario';
                                    label = `Failure: ${scenarioName}`;
                                }
                                
                                pathSet.add(filePath);
                                screenshots.push({
                                    path: filePath,
                                    label: label,
                                    scenarioId: 'failure-evidence',
                                    scenarioName: scenarioName,
                                    featureId: 'failures',
                                    featureName: featureName,
                                    status: TestStatus.FAILED
                                });
                            }
                        }
                    } else if (this.screenshotMode === 'always') {
                        // In always mode, add all screenshots
                        let matched = false;
                        for (const scenario of scenarios) {
                            if (file.toLowerCase().includes(scenario.scenarioId?.toLowerCase()) ||
                                file.toLowerCase().includes(scenario.scenario?.toLowerCase().replace(/\s+/g, '-'))) {
                                pathSet.add(filePath);
                                screenshots.push({
                                    path: filePath,
                                    label: file,
                                    scenarioId: scenario.scenarioId,
                                    scenarioName: scenario.scenario,
                                    featureId: scenario.featureId,
                                    featureName: scenario.feature,
                                    status: scenario.status
                                });
                                matched = true;
                                break;
                            }
                        }
                        
                        // If not matched to a scenario, add as general evidence
                        if (!matched) {
                            pathSet.add(filePath);
                            screenshots.push({
                                path: filePath,
                                label: file,
                                scenarioId: 'evidence',
                                scenarioName: 'Evidence',
                                featureId: 'evidence',
                                featureName: 'Evidence Screenshots',
                                status: 'unknown'
                            });
                        }
                    }
                }
            }
            
            // Recursively check subdirectories
            for (const file of files) {
                const subPath = path.join(dir, file);
                const stat = await FileUtils.getStats(subPath);
                if (stat && stat.isDirectory) {
                    await this.collectScreenshotsFromDirectory(subPath, screenshots, scenarios, pathSet);
                }
            }
        } catch (error) {
            this.logger.debug('Error reading directory', error as Error);
        }
    }

    private async checkEvidenceDirectory(): Promise<boolean> {
        try {
            const evidencePaths = [
                path.join(process.cwd(), 'reports', 'evidence'),
                path.join(process.cwd(), 'screenshots')
            ];
            
            for (const evidenceDir of evidencePaths) {
                if (await FileUtils.pathExists(evidenceDir)) {
                    const files = await FileUtils.readDir(evidenceDir);
                    if (files.some(f => f.match(/\.(png|jpg|jpeg|gif)$/i))) {
                        return true;
                    }
                }
            }
        } catch {
            // Ignore errors
        }
        
        return false;
    }

    /* Commented out as it's only used in commented code
    private parseContext(contextStr: string): any {
        try {
            // Try to parse as JSON first
            if (contextStr.startsWith('{') || contextStr.startsWith('[')) {
                return JSON.parse(contextStr);
            }
            
            // Otherwise parse key-value pairs
            const context: any = {};
            const pairs = contextStr.split(',');
            for (const pair of pairs) {
                const [key, value] = pair.split(':').map(s => s.trim());
                if (key && value) {
                    context[key] = value;
                }
            }
            return context;
        } catch {
            return { raw: contextStr };
        }
    }
    */

    private groupScreenshotsByFeatureAndScenario(screenshots: any[]): Record<string, Record<string, any[]>> {
        const grouped: Record<string, Record<string, any[]>> = {};
        
        screenshots.forEach(screenshot => {
            const featureName = screenshot.featureName || 'Unknown Feature';
            const scenarioName = screenshot.scenarioName || 'Unknown Scenario';
            
            if (!grouped[featureName]) {
                grouped[featureName] = {};
            }
            
            if (!grouped[featureName][scenarioName]) {
                grouped[featureName][scenarioName] = [];
            }
            
            // Group by step if available
            if (screenshot.label && screenshot.label.includes(' ')) {
                // Extract step info from label
                const existingStep = grouped[featureName][scenarioName].find(
                    s => s.label === screenshot.label
                );
                if (!existingStep) {
                    grouped[featureName][scenarioName].push(screenshot);
                }
            } else {
                grouped[featureName][scenarioName].push(screenshot);
            }
        });
        
        // Sort screenshots within each scenario by label/step
        Object.values(grouped).forEach(scenarios => {
            Object.values(scenarios).forEach(screenshots => {
                screenshots.sort((a, b) => {
                    // Sort by step order if available
                    const aStep = a.label?.match(/^(Given|When|Then|And|But)/);
                    const bStep = b.label?.match(/^(Given|When|Then|And|But)/);
                    if (aStep && bStep) {
                        const stepOrder = ['Given', 'When', 'Then', 'And', 'But'];
                        return stepOrder.indexOf(aStep[0]) - stepOrder.indexOf(bStep[0]);
                    }
                    return 0;
                });
            });
        });
        
        return grouped;
    }

    private async readLogFiles(): Promise<any[]> {
        const logs: any[] = [];
        try {
            // Skip console-logs.json as it's handled by readConsoleLogs
            const possibleLogPaths = [
                // Only check for execution-logs.json
                path.join(process.cwd(), 'evidence', 'execution-logs.json'),
                path.join(process.cwd(), '..', 'evidence', 'execution-logs.json'),
                path.join(process.cwd(), 'reports', this.getReportFolderName(), 'evidence', 'execution-logs.json')
            ];
            
            let evidenceLogPath = '';
            for (const logPath of possibleLogPaths) {
                if (await FileUtils.pathExists(logPath)) {
                    evidenceLogPath = logPath;
                    break;
                }
            }
            
            if (evidenceLogPath) {
                try {
                    const content = await FileUtils.readFile(evidenceLogPath, 'utf8');
                    const logsData = JSON.parse(content as string);
                    
                    // Handle console-logs.json format
                    if (evidenceLogPath.includes('console-logs.json')) {
                        // console-logs.json is an array of log entries
                        if (Array.isArray(logsData)) {
                            logsData.forEach((log: any) => {
                                const timestamp = log.timestamp ? 
                                    new Date(log.timestamp).toLocaleTimeString('en-US', {
                                        hour12: false,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                    }) + '.' + new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0')
                                    : new Date().toLocaleTimeString();
                                
                                logs.push({
                                    timestamp: timestamp,
                                    level: log.level || 'info',
                                    message: log.message || '',
                                    context: log.args ? JSON.stringify(log.args) : (log.location ? `url: ${log.location.url}, lineNumber: ${log.location.lineNumber}, columnNumber: ${log.location.columnNumber}` : '')
                                });
                            });
                            this.logger.debug(`Loaded ${logsData.length} console logs from ${evidenceLogPath}`);
                        }
                    } else if (Array.isArray(logsData)) {
                        // Handle execution-logs.json format
                        logsData.forEach(log => {
                            logs.push({
                                timestamp: new Date(log.timestamp).toLocaleTimeString('en-US', {
                                    hour12: false,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                }) + '.' + new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0'),
                                level: log.level || 'info',
                                message: log.message || 'No message',
                                context: log.context
                            });
                        });
                    }
                } catch (error) {
                    this.logger.debug(`Failed to read ${evidenceLogPath}`, error as Error);
                }
            }
            
            // Skip reading txt files from evidence folder as they contain formatted output
            // The console-logs.json is our primary source
            
            /* Commented out to avoid duplicate/malformed logs
            const consoleLogTxtPaths = [
                path.join(process.cwd(), 'evidence', 'console-logs.txt'),
                path.join(process.cwd(), '..', 'evidence', 'console-logs.txt')
            ];
            
            for (const txtPath of consoleLogTxtPaths) {
                if (await FileUtils.pathExists(txtPath)) {
                    try {
                        const content = await FileUtils.readFile(txtPath, 'utf8');
                        const lines = (content as string).split('\n');
                        lines.forEach((line: string) => {
                            if (line.trim()) {
                                // Parse console log format: [HH:MM:SS.mmm] [LEVEL] Message | Context
                                const match = line.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*\[(\w+)\]\s*([^|]+)(?:\|\s*(.+))?$/);
                                if (match) {
                                    logs.push({
                                        timestamp: match[1],
                                        level: match[2]?.toLowerCase() || 'info',
                                        message: match[3]?.trim() || '',
                                        context: match[4] ? this.parseContext(match[4]) : undefined
                                    });
                                } else {
                                    // Skip header lines and non-log content
                                    const skipPatterns = [
                                        /^CS Test Automation Framework/,
                                        /^={5,}/,
                                        /^Session ID:/,
                                        /^Time Range:/,
                                        /^Total Entries:/,
                                        /^Log Level Summary:/,
                                        /^Log Type Summary:/,
                                        /^\s*\w+:\s*\d+\s*$/,  // Summary counts like "INFO: 0"
                                        /^Errors \(\d+\):/,
                                        /^$/  // Empty lines
                                    ];
                                    
                                    // Check if line should be skipped
                                    const shouldSkip = skipPatterns.some(pattern => pattern.test(line));
                                    if (shouldSkip) {
                                        return; // Skip this line
                                    }
                                    
                                    // Only add as fallback if it looks like a log message
                                    if (line.length > 0) {
                                        logs.push({
                                            timestamp: new Date().toLocaleTimeString('en-US', {
                                                hour12: false,
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            }) + '.000',
                                            level: 'info',
                                            message: line
                                        });
                                    }
                                }
                            }
                        });
                        this.logger.debug(`Loaded ${lines.length} console log entries from ${txtPath}`);
                    } catch (error) {
                        this.logger.debug('Failed to read console-logs.txt', error as Error);
                    }
                }
            }
            */
            
            // Check multiple possible log locations
            const logPaths = [
                path.join(process.cwd(), '..', '..', '..', 'logs'),  // Go up to project root
                path.join(process.cwd(), 'logs'),
                path.join(process.cwd(), 'reports', 'evidence'),
                path.join(process.cwd(), 'reports', this.getReportFolderName(), 'evidence')
            ];
            
            for (const logPath of logPaths) {
                if (await FileUtils.pathExists(logPath)) {
                    const files = await FileUtils.readDir(logPath);
                    for (const file of files) {
                        if (file.endsWith('.log')) {
                            try {
                                const content = await FileUtils.readFile(path.join(logPath, file), 'utf8');
                                const lines = (content as string).split('\n');
                                lines.forEach((line: string) => {
                                    if (line.trim()) {
                                        try {
                                            // Try to parse as JSON first
                                            const logEntry = JSON.parse(line);
                                            logs.push({
                                                timestamp: new Date(logEntry.timestamp).toLocaleTimeString('en-US', {
                                                    hour12: false,
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit'
                                                }) + '.' + new Date(logEntry.timestamp).getMilliseconds().toString().padStart(3, '0'),
                                                level: logEntry.level || 'info',
                                                message: logEntry.message || logEntry.type || 'Test execution log',
                                                context: logEntry.context
                                            });
                                        } catch {
                                            // Fall back to text parsing
                                            const match = line.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*\[(\w+)\]\s*(.+)/);
                                            if (match) {
                                                logs.push({
                                                    timestamp: match[1],
                                                    level: match[2]?.toLowerCase() || 'info',
                                                    message: match[3] || ''
                                                });
                                            } else {
                                                logs.push({
                                                    timestamp: new Date().toLocaleTimeString(),
                                                    level: 'info',
                                                    message: line
                                                });
                                            }
                                        }
                                    }
                                });
                            } catch (error) {
                                this.logger.debug(`Failed to read log file ${file}`, error as Error);
                            }
                        } 
                        /* Skip .txt files as they contain formatted output with headers
                        else if (file.endsWith('.txt')) {
                            try {
                                const content = await FileUtils.readFile(path.join(logPath, file), 'utf8');
                                const lines = (content as string).split('\n');
                                lines.forEach((line: string) => {
                                    if (line.trim() && !line.includes('====') && !line.includes('Summary:')) {
                                        logs.push({
                                            timestamp: new Date().toLocaleTimeString(),
                                            level: 'info',
                                            message: line.trim()
                                        });
                                    }
                                });
                            } catch (error) {
                                this.logger.debug(`Failed to read text file ${file}`, error as Error);
                            }
                        }
                        */
                    }
                }
            }
        } catch (error) {
            this.logger.debug('Error reading log files', error as Error);
        }
        return logs;
    }
    
    private async readConsoleLogs(): Promise<any[]> {
        const logs: any[] = [];
        try {
            // Check for console-logs.json in evidence directory
            const reportFolderName = this.getReportFolderName();
            const possiblePaths = [
                // Check current report's evidence directory
                path.join(process.cwd(), 'evidence', 'console-logs.json'),
                path.join(process.cwd(), '..', 'evidence', 'console-logs.json'),
                // Check reports directory
                path.join(process.cwd(), 'reports', reportFolderName, 'evidence', 'console-logs.json'),
                path.join(process.cwd(), '..', 'reports', reportFolderName, 'evidence', 'console-logs.json')
            ];
            
            // Find the first existing console-logs.json file
            let consoleLogPath = '';
            for (const filePath of possiblePaths) {
                if (await FileUtils.pathExists(filePath)) {
                    consoleLogPath = filePath;
                    break;
                }
            }
            
            if (consoleLogPath) {
                try {
                    this.logger.debug(`Reading console logs from: ${consoleLogPath}`);
                    const content = await FileUtils.readFile(consoleLogPath, 'utf8');
                    const consoleData = JSON.parse(content as string);
                    
                    // console-logs.json is an array of log entries
                    if (Array.isArray(consoleData)) {
                        for (const entry of consoleData) {
                            // Return the log entry with its original timestamp
                            // The timestamp will be formatted later in getCompleteLogs
                            logs.push({
                                timestamp: entry.timestamp, // Keep ISO timestamp for proper parsing
                                level: entry.level || 'info',
                                message: entry.message || '',
                                metadata: entry.args || entry.location || {}
                            });
                        }
                        this.logger.debug(`Loaded ${consoleData.length} console logs from ${consoleLogPath}`);
                    }
                } catch (error) {
                    this.logger.debug(`Failed to read console logs from ${consoleLogPath}`, error as Error);
                }
            }
        } catch (error) {
            this.logger.debug('Error reading console logs', error as Error);
        }
        return logs;
    }
    
    private getReportFolderName(): string {
        // Extract report folder name from current working directory
        const cwd = process.cwd();
        
        // First check if we're inside a report folder
        let match = cwd.match(/report-\d{8}-\d{6}-\w+/);
        if (match) {
            return match[0];
        }
        
        // If not, try to get it from CURRENT_REPORT_DIR configuration
        try {
            const currentReportDir = ConfigurationManager.get('CURRENT_REPORT_DIR', '');
            if (currentReportDir) {
                match = currentReportDir.match(/report-\d{8}-\d{6}-\w+/);
                if (match) {
                    return match[0];
                }
            }
        } catch {
            // ConfigurationManager might not be initialized
        }
        
        // If still not found, try to find the most recent report folder
        try {
            const reportsDir = path.join(process.cwd(), 'reports');
            if (fs.existsSync(reportsDir)) {
                const folders = fs.readdirSync(reportsDir)
                    .filter(f => f.match(/report-\d{8}-\d{6}-\w+/))
                    .sort((a, b) => b.localeCompare(a));
                if (folders.length > 0 && folders[0]) {
                    return folders[0];
                }
            }
        } catch {
            // Ignore errors
        }
        
        return '';
    }

    private generateRealTrendData(reportData: ReportData): any {
        const dates: string[] = [];
        const passRates: number[] = [];
        const executionTimes: number[] = [];
        
        // Use real historical data
        const recentHistory = this.executionHistory.slice(-7); // Last 7 entries
        
        recentHistory.forEach(entry => {
            const date = new Date(entry.date);
            dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            passRates.push(Math.round(entry.passRate));
            executionTimes.push(Math.round(entry.executionTime / 60000)); // Convert to minutes
        });
        
        // Add current execution
        dates.push('Today');
        passRates.push(Math.round(reportData.summary?.passRate || 0));
        executionTimes.push(Math.round((reportData.summary?.executionTime || 0) / 60000));
        
        return {
            labels: dates,
            datasets: [
                {
                    label: 'Pass Rate %',
                    data: passRates,
                    color: this.theme.successColor
                },
                {
                    label: 'Execution Time (min)',
                    data: executionTimes,
                    color: this.theme.primaryColor
                }
            ]
        };
    }

    private generateTagDistribution(reportData: ReportData): PieChartData {
        const tagCounts: Record<string, number> = {};
        
        // Count tags from scenarios
        const scenarios = reportData.scenarios || [];
        scenarios.forEach(scenario => {
            (scenario.tags || []).forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
        
        // If no tags, create default distribution
        if (Object.keys(tagCounts).length === 0) {
            tagCounts['@untagged'] = scenarios.length;
        }
        
        const labels = Object.keys(tagCounts);
        const values = Object.values(tagCounts);
        const colors = [
            this.theme.primaryColor,
            this.theme.successColor,
            this.theme.warningColor,
            this.theme.infoColor,
            '#FF6B6B',
            '#4ECDC4',
            '#45B7D1'
        ];
        
        return {
            type: ChartType.PIE,
            title: 'Tag Distribution',
            labels,
            values,
            colors: colors.slice(0, labels.length),
            data: {},
            options: {
                responsive: true,
                maintainAspectRatio: false,
                legend: true
            }
        };
    }

    private async calculateRealPerformanceMetrics(reportData: ReportData): Promise<any> {
        const scenarios = reportData.scenarios || [];
        const steps = scenarios.flatMap(s => s.steps || []);
        
        // Extract performance data from action logs if available
        let pageLoadTime = 0;
        let responseTime = 0;
        let networkLatency = 0;
        
        try {
            const actionLogger = ActionLogger.getInstance();
            const logs = actionLogger.getRecentLogs(10000);
            
            // Look for performance metrics in logs
            logs.forEach(log => {
                if (log.message?.includes('Page load time:')) {
                    const match = log.message.match(/Page load time: (\d+)ms/);
                    if (match && match[1]) pageLoadTime = parseInt(match[1]);
                }
                if (log.message?.includes('Response time:')) {
                    const match = log.message.match(/Response time: (\d+)ms/);
                    if (match && match[1]) responseTime = parseInt(match[1]);
                }
                if (log.message?.includes('Network latency:')) {
                    const match = log.message.match(/Network latency: (\d+)ms/);
                    if (match && match[1]) networkLatency = parseInt(match[1]);
                }
            });
        } catch {
            // Use defaults if logs not available
        }
        
        // Calculate average durations
        const avgScenarioDuration = scenarios.length > 0
            ? scenarios.reduce((sum, s) => sum + (s.duration || 0), 0) / scenarios.length
            : 0;
            
        const avgStepDuration = steps.length > 0
            ? steps.reduce((sum, s) => sum + (s.duration || 0), 0) / steps.length
            : 0;
        
        const totalDuration = reportData.summary?.executionTime || scenarios.reduce((sum, s) => sum + (s.duration || 0), 0);
        const stepsPerSecond = totalDuration > 0 ? (steps.length / (totalDuration / 1000)) : 0;
        
        // Use actual metrics from reportData if available
        const metrics = reportData.metrics || {};
        
        return {
            pageLoadTime: pageLoadTime || (metrics.performance as any)?.avgPageLoadTime || 
                          Math.round(avgStepDuration * 0.4), // Estimate if not available
            responseTime: responseTime || (metrics.performance as any)?.avgResponseTime || 
                          Math.round(avgStepDuration * 0.2),
            networkLatency: networkLatency || (metrics.performance as any)?.avgNetworkLatency || 
                            Math.round(avgStepDuration * 0.1),
            avgScenarioDuration,
            avgStepDuration,
            totalSteps: steps.length,
            stepsPerSecond
        };
    }

    private getOSName(platform: string): string {
        const osMap: Record<string, string> = {
            'win32': 'Windows',
            'darwin': 'macOS',
            'linux': 'Linux',
            'freebsd': 'FreeBSD',
            'sunos': 'SunOS',
            'aix': 'AIX'
        };
        
        const osName = osMap[platform] || platform;
        
        // Try to get more specific Windows version
        if (platform === 'win32') {
            const release = os.release();
            const version = release.split('.').map(Number);
            
            if (version[0] === 10 && version[2] && version[2] >= 22000) return 'Windows 11';
            if (version[0] === 10) return 'Windows 10';
            if (version[0] === 6 && version[1] === 3) return 'Windows 8.1';
            if (version[0] === 6 && version[1] === 2) return 'Windows 8';
            if (version[0] === 6 && version[1] === 1) return 'Windows 7';
        }
        
        return osName;
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m] || m);
    }

    public async saveReport(html: string, outputPath: string): Promise<void> {
        try {
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            await fs.promises.writeFile(outputPath, html, 'utf8');
            this.logger.info(`Report saved to: ${outputPath}`);
        } catch (error) {
            this.logger.error('Failed to save report', error as Error);
            throw error;
        }
    }
}