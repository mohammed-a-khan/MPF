// src/core/ai/healing/HealingReporter.ts

import { HealingHistory, HealingReport, FragileElement, HealingRecommendation } from './HealingHistory';
import { logger } from '../../utils/Logger';
import { FileUtils } from '../../utils/FileUtils';
import { DateUtils } from '../../utils/DateUtils';
import * as path from 'path';
import { BrowserManager } from '../../browser/BrowserManager';

interface ChartData {
    type: string;
    title: string;
    labels: string[] | number[];
    datasets: any[];
    options?: any;
}

interface VisualizationData {
    successRateChart: ChartData;
    strategyPerformanceChart: ChartData;
    healingTrendChart: ChartData;
    elementStabilityChart: ChartData;
    failureDistributionChart: ChartData;
    timeDistributionChart: ChartData;
    healingDurationChart: ChartData;
}

/**
 * Extended healing report with additional analysis
 */
interface EnhancedHealingReport extends HealingReport {
    analysis?: any;
    visualizations?: VisualizationData;
    recommendations?: HealingRecommendation[];
}

/**
 * Generates comprehensive healing reports with visualizations
 * Integrates with main reporting system
 */
class HealingReporter {
    private static instance: HealingReporter;
    private readonly healingHistory: HealingHistory;
    private readonly reportPath: string;
    
    // Brand theme colors
    private readonly theme = {
        primary: '#93186C',
        primaryLight: '#B91C84',
        primaryDark: '#6B1250',
        success: '#28A745',
        warning: '#FFC107',
        danger: '#DC3545',
        info: '#17A2B8',
        background: '#F8F9FA',
        text: '#212529'
    };
    
    private constructor() {
        this.healingHistory = HealingHistory.getInstance();
        this.reportPath = path.join(process.cwd(), 'reports', 'healing');
        this.initialize();
    }
    
    private async initialize(): Promise<void> {
        await FileUtils.ensureDir(this.reportPath);
    }
    
    static getInstance(): HealingReporter {
        if (!HealingReporter.instance) {
            HealingReporter.instance = new HealingReporter();
        }
        return HealingReporter.instance;
    }
    
    /**
     * Generate comprehensive healing report
     */
    async generateHealingReport(): Promise<EnhancedHealingReport> {
        try {
            logger.info('Generating healing report...');
            
            // Get all data from healing history
            const report = await this.healingHistory.exportHistory('json');
            const healingData: EnhancedHealingReport = JSON.parse(report);
            
            // Enhance report with additional analysis
            healingData.analysis = this.performDetailedAnalysis(healingData);
            healingData.visualizations = this.generateVisualizationData(healingData);
            healingData.recommendations = this.healingHistory.getRecommendations();
            
            // Save report files
            await this.saveReportFiles(healingData);
            
            logger.info('Healing report generated successfully');
            
            return healingData;
            
        } catch (error) {
            logger.error(`Failed to generate healing report: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Identify fragile elements that need attention
     */
    identifyFragileElements(): FragileElement[] {
        return this.healingHistory.getFragileElements(0.5);
    }
    
    /**
     * Suggest locator improvements
     */
    suggestLocatorImprovements(): LocatorSuggestion[] {
        const suggestions: LocatorSuggestion[] = [];
        const fragileElements = this.identifyFragileElements();
        
        for (const element of fragileElements) {
            const history = this.healingHistory.getElementHistory(element.elementId);
            const recentFailures = history.filter(h => !h.success).slice(-10);
            
            // Analyze failure patterns
            const locatorTypes = new Map<string, number>();
            
            for (const failure of recentFailures) {
                if (failure.oldLocator) {
                    const type = this.identifyLocatorType(failure.oldLocator);
                    locatorTypes.set(type, (locatorTypes.get(type) || 0) + 1);
                }
            }
            
            // Generate suggestions based on failure patterns
            for (const [type, count] of locatorTypes) {
                if (count > 3) {
                    suggestions.push(this.generateLocatorSuggestion(element, type, count));
                }
            }
        }
        
        return suggestions.sort((a, b) => b.priority - a.priority);
    }
    
    /**
     * Export report to HTML format
     */
    async exportToHTML(): Promise<string> {
        const healingData = await this.generateHealingReport();
        const html = this.generateHTMLReport(healingData);
        const filePath = path.join(this.reportPath, `healing-report-${DateUtils.toTimestamp(new Date())}.html`);
        await FileUtils.writeFile(filePath, html);
        return filePath;
    }
    
    /**
     * Export report to PDF format
     */
    async exportToPDF(): Promise<string> {
        const html = await this.exportToHTML();
        const pdfPath = html.replace('.html', '.pdf');
        
        // Use existing browser instead of launching new one
        const browserManager = BrowserManager.getInstance();
        const browser = await browserManager.getBrowser();
        const context = await browser.newContext();
        
        const page = await context.newPage();
        
        try {
            await page.goto(`file://${html}`, { waitUntil: 'networkidle' });
            await page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
            });
            
            await context.close();
            logger.info(`PDF report generated: ${pdfPath}`);
            return pdfPath;
            
        } catch (error) {
            await context.close();
            throw error;
        }
    }
    
    /**
     * Get healing effectiveness metrics
     */
    getHealingEffectiveness(): HealingEffectiveness {
        const stats = this.healingHistory.getStrategyStatistics();
        const trends = this.healingHistory.getHealingTrends(30);
        
        // Calculate overall effectiveness
        let totalAttempts = 0;
        let totalSuccess = 0;
        let totalDuration = 0;
        
        for (const stat of stats.values()) {
            totalAttempts += stat.totalAttempts;
            totalSuccess += stat.successCount;
            totalDuration += stat.averageDuration * stat.totalAttempts;
        }
        
        const overallSuccessRate = totalAttempts > 0 ? totalSuccess / totalAttempts : 0;
        const averageDuration = totalAttempts > 0 ? totalDuration / totalAttempts : 0;
        
        // Calculate trend
        const recentTrends = trends.slice(-7);
        const trendDirection = this.calculateTrendDirection(recentTrends);
        
        // Identify best and worst strategies
        const strategies = Array.from(stats.entries())
            .map(([name, stat]) => ({
                name,
                successRate: stat.totalAttempts > 0 ? stat.successCount / stat.totalAttempts : 0,
                usage: stat.totalAttempts
            }))
            .sort((a, b) => b.successRate - a.successRate);
        
        return {
            overallSuccessRate,
            averageHealingDuration: averageDuration,
            totalHealingAttempts: totalAttempts,
            successfulHealings: totalSuccess,
            failedHealings: totalAttempts - totalSuccess,
            trendDirection,
            bestStrategy: strategies[0]?.name || 'None',
            worstStrategy: strategies[strategies.length - 1]?.name || 'None',
            strategiesRanked: strategies,
            healingLoad: this.calculateHealingLoad(trends),
            stabilityImprovement: this.calculateStabilityImprovement(trends)
        };
    }
    
    // Private helper methods
    
    private async saveReportFiles(data: EnhancedHealingReport): Promise<void> {
        const timestamp = DateUtils.toTimestamp(new Date());
        
        // Save JSON report
        const jsonPath = path.join(this.reportPath, `healing-report-${timestamp}.json`);
        await FileUtils.writeJSON(jsonPath, data);
        
        // Save HTML report
        const htmlPath = path.join(this.reportPath, `healing-report-${timestamp}.html`);
        await FileUtils.writeFile(htmlPath, this.generateHTMLReport(data));
        
        // Save visualization data
        const vizPath = path.join(this.reportPath, `healing-viz-${timestamp}.json`);
        await FileUtils.writeJSON(vizPath, data.visualizations);
    }
    
    private performDetailedAnalysis(data: EnhancedHealingReport): DetailedAnalysis {
        // Time-based analysis
        const timeAnalysis = this.analyzeTimePatterns(data.trends || []);
        
        // Strategy effectiveness analysis
        const strategyAnalysis = this.analyzeStrategyEffectiveness(data.strategyStatistics || []);
        
        // Element stability analysis
        const stabilityAnalysis = this.analyzeElementStability(data.elementStatistics || []);
        
        // Failure root cause analysis
        const failureAnalysis = this.analyzeFailureRootCauses(data.recentFailures || []);
        
        return {
            timePatterns: timeAnalysis,
            strategyEffectiveness: strategyAnalysis,
            elementStability: stabilityAnalysis,
            failureRootCauses: failureAnalysis,
            overallHealth: this.calculateOverallHealth(data)
        };
    }
    
    private analyzeTimePatterns(trends: any[]): TimePatternAnalysis {
        const dayOfWeekStats = new Map<string, { attempts: number; success: number }>();
        const hourOfDayStats = new Map<number, { attempts: number; success: number }>();
        
        // Aggregate by day of week and hour
        for (const trend of trends) {
            const date = new Date(trend.date);
            const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
            const hour = date.getHours();
            
            // Day of week
            if (!dayOfWeekStats.has(dayOfWeek)) {
                dayOfWeekStats.set(dayOfWeek, { attempts: 0, success: 0 });
            }
            const dowStats = dayOfWeekStats.get(dayOfWeek)!;
            dowStats.attempts += trend.totalAttempts || 0;
            dowStats.success += trend.successfulAttempts || 0;
            
            // Hour of day
            if (!hourOfDayStats.has(hour)) {
                hourOfDayStats.set(hour, { attempts: 0, success: 0 });
            }
            const hodStats = hourOfDayStats.get(hour)!;
            hodStats.attempts += trend.totalAttempts || 0;
            hodStats.success += trend.successfulAttempts || 0;
        }
        
        // Find peak healing times
        const peakDay = Array.from(dayOfWeekStats.entries())
            .sort((a, b) => b[1].attempts - a[1].attempts)[0];
        
        const peakHour = Array.from(hourOfDayStats.entries())
            .sort((a, b) => b[1].attempts - a[1].attempts)[0];
        
        return {
            peakHealingDay: peakDay?.[0] || 'Unknown',
            peakHealingHour: peakHour?.[0] || 0,
            dayOfWeekDistribution: Object.fromEntries(dayOfWeekStats),
            hourlyDistribution: Object.fromEntries(hourOfDayStats),
            healingFrequencyTrend: this.calculateFrequencyTrend(trends)
        };
    }
    
    private analyzeStrategyEffectiveness(strategies: any[]): StrategyEffectivenessAnalysis {
        const analysis: StrategyEffectivenessAnalysis = {
            mostEffective: '',
            leastEffective: '',
            averageSuccessRate: 0,
            strategyComparison: [],
            recommendedStrategies: [],
            deprecatedStrategies: []
        };
        
        if (strategies.length === 0) return analysis;
        
        // Sort by success rate
        const sorted = strategies.sort((a, b) => 
            (b.successRate || 0) - (a.successRate || 0)
        );
        
        analysis.mostEffective = sorted[0].strategy;
        analysis.leastEffective = sorted[sorted.length - 1].strategy;
        
        // Calculate average
        const totalRate = strategies.reduce((sum, s) => sum + (s.successRate || 0), 0);
        analysis.averageSuccessRate = totalRate / strategies.length;
        
        // Categorize strategies
        for (const strategy of strategies) {
            const successRate = strategy.successRate || 0;
            const totalAttempts = strategy.totalAttempts || 0;
            
            analysis.strategyComparison.push({
                name: strategy.strategy,
                successRate: successRate,
                usage: totalAttempts,
                performance: this.categorizePerformance(successRate)
            });
            
            if (successRate > 0.7 && totalAttempts > 10) {
                analysis.recommendedStrategies.push(strategy.strategy);
            } else if (successRate < 0.3 && totalAttempts > 10) {
                analysis.deprecatedStrategies.push(strategy.strategy);
            }
        }
        
        return analysis;
    }
    
    private analyzeElementStability(elements: any[]): ElementStabilityAnalysis {
        const stableElements = elements.filter(e => (e.stability || 0) > 0.7).length;
        const unstableElements = elements.filter(e => (e.stability || 0) < 0.3).length;
        const moderateElements = elements.length - stableElements - unstableElements;
        
        // Group by stability categories
        const stabilityGroups = {
            high: elements.filter(e => (e.stability || 0) > 0.7),
            medium: elements.filter(e => (e.stability || 0) >= 0.3 && (e.stability || 0) <= 0.7),
            low: elements.filter(e => (e.stability || 0) < 0.3)
        };
        
        // Calculate average healing frequency
        const avgHealingFrequency = elements.reduce((sum, e) => 
            sum + ((e.totalHealingAttempts || 0) / Math.max(1, e.daysTracked || 1)), 0
        ) / Math.max(1, elements.length);
        
        return {
            totalElements: elements.length,
            stableElements,
            moderateElements,
            unstableElements,
            averageStability: elements.reduce((sum, e) => sum + (e.stability || 0), 0) / Math.max(1, elements.length),
            stabilityDistribution: stabilityGroups,
            criticalElements: stabilityGroups.low.slice(0, 10),
            averageHealingFrequency: avgHealingFrequency
        };
    }
    
    private analyzeFailureRootCauses(failures: any[]): FailureRootCauseAnalysis {
        const rootCauses = new Map<string, number>();
        const errorPatterns = new Map<string, number>();
        
        for (const failure of failures) {
            // Categorize by error message
            if (failure.errorMessage) {
                const rootCause = this.categorizeError(failure.errorMessage);
                rootCauses.set(rootCause, (rootCauses.get(rootCause) || 0) + 1);
                
                // Extract error patterns
                const pattern = this.extractErrorPattern(failure.errorMessage);
                errorPatterns.set(pattern, (errorPatterns.get(pattern) || 0) + 1);
            }
        }
        
        // Sort by frequency
        const topCauses = Array.from(rootCauses.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cause, count]) => ({ 
                cause, 
                count, 
                percentage: failures.length > 0 ? count / failures.length : 0 
            }));
        
        const commonPatterns = Array.from(errorPatterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([pattern, count]) => ({ pattern, count }));
        
        // Calculate average time to failure
        let totalTimeToFailure = 0;
        let failureCount = 0;
        
        for (const failure of failures) {
            if (failure.timestamp && failure.previousSuccessTimestamp) {
                const timeDiff = new Date(failure.timestamp).getTime() - 
                                new Date(failure.previousSuccessTimestamp).getTime();
                totalTimeToFailure += timeDiff;
                failureCount++;
            }
        }
        
        const averageTimeToFailure = failureCount > 0 ? totalTimeToFailure / failureCount : 0;
        
        return {
            topRootCauses: topCauses,
            commonErrorPatterns: commonPatterns,
            failureRate: failures.length > 0 ? failures.length / (failures.length + 100) : 0, // Assume 100 successful for rate
            averageTimeToFailure
        };
    }
    
    private generateVisualizationData(data: EnhancedHealingReport): VisualizationData {
        return {
            successRateChart: this.generateSuccessRateChartData(data),
            strategyPerformanceChart: this.generateStrategyPerformanceChartData(data),
            healingTrendChart: this.generateHealingTrendChartData(data),
            elementStabilityChart: this.generateElementStabilityChartData(data),
            failureDistributionChart: this.generateFailureDistributionChartData(data),
            timeDistributionChart: this.generateTimeDistributionChartData(data),
            healingDurationChart: this.generateHealingDurationChartData(data)
        };
    }
    
    private generateSuccessRateChartData(data: EnhancedHealingReport): ChartData {
        const trends = data.trends || [];
        const labels = trends.map(t => new Date(t.date).toLocaleDateString());
        const successRates = trends.map(t => 
            t.totalAttempts > 0 ? (t.successfulAttempts / t.totalAttempts) * 100 : 0
        );
        
        return {
            type: 'line',
            title: 'Healing Success Rate Over Time',
            labels,
            datasets: [{
                label: 'Success Rate (%)',
                data: successRates,
                borderColor: this.theme.primary,
                backgroundColor: this.theme.primaryLight + '20',
                tension: 0.4
            }],
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: (value: any) => value + '%'
                        }
                    }
                }
            }
        };
    }
    
    private generateStrategyPerformanceChartData(data: EnhancedHealingReport): ChartData {
        const strategies = (data.strategyStatistics || [])
            .sort((a, b) => (b.successRate || 0) - (a.successRate || 0));
        
        return {
            type: 'bar',
            title: 'Strategy Performance Comparison',
            labels: strategies.map(s => s.strategy),
            datasets: [{
                label: 'Success Rate (%)',
                data: strategies.map(s => (s.successRate || 0) * 100),
                backgroundColor: strategies.map(s => {
                    const rate = s.successRate || 0;
                    if (rate > 0.7) return this.theme.success;
                    if (rate > 0.4) return this.theme.warning;
                    return this.theme.danger;
                })
            }],
            options: {
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: (value: any) => value + '%'
                        }
                    }
                }
            }
        };
    }
    
    private generateHealingTrendChartData(data: EnhancedHealingReport): ChartData {
        const trends = data.trends || [];
        const labels = trends.map(t => new Date(t.date).toLocaleDateString());
        
        return {
            type: 'area',
            title: 'Healing Activity Trend',
            labels,
            datasets: [
                {
                    label: 'Successful Healings',
                    data: trends.map(t => t.successfulAttempts || 0),
                    backgroundColor: this.theme.success + '40',
                    borderColor: this.theme.success,
                    fill: true
                },
                {
                    label: 'Failed Healings',
                    data: trends.map(t => t.failedAttempts || 0),
                    backgroundColor: this.theme.danger + '40',
                    borderColor: this.theme.danger,
                    fill: true
                }
            ],
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true
                    }
                }
            }
        };
    }
    
    private generateElementStabilityChartData(data: EnhancedHealingReport): ChartData {
        const elements = data.elementStatistics || [];
        const stabilityBuckets = {
            'High (>70%)': 0,
            'Medium (30-70%)': 0,
            'Low (<30%)': 0
        };
        
        for (const element of elements) {
            const stability = element.stability || 0;
            if (stability > 0.7) stabilityBuckets['High (>70%)']++;
            else if (stability >= 0.3) stabilityBuckets['Medium (30-70%)']++;
            else stabilityBuckets['Low (<30%)']++;
        }
        
        return {
            type: 'doughnut',
            title: 'Element Stability Distribution',
            labels: Object.keys(stabilityBuckets),
            datasets: [{
                data: Object.values(stabilityBuckets),
                backgroundColor: [this.theme.success, this.theme.warning, this.theme.danger],
                borderWidth: 2,
                borderColor: '#fff'
            }],
            options: {
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        };
    }
    
    private generateFailureDistributionChartData(data: EnhancedHealingReport): ChartData {
        const failures = data.recentFailures || [];
        const failuresByStrategy = new Map<string, number>();
        
        for (const failure of failures) {
            const strategy = failure.strategy || 'Unknown';
            failuresByStrategy.set(strategy, (failuresByStrategy.get(strategy) || 0) + 1);
        }
        
        const sorted = Array.from(failuresByStrategy.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return {
            type: 'pie',
            title: 'Recent Failures by Strategy',
            labels: sorted.map(([strategy]) => strategy),
            datasets: [{
                data: sorted.map(([, count]) => count),
                backgroundColor: [
                    this.theme.primary,
                    this.theme.primaryLight,
                    this.theme.info,
                    this.theme.warning,
                    this.theme.danger
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }],
            options: {
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        };
    }
    
    private generateTimeDistributionChartData(data: EnhancedHealingReport): ChartData {
        const trends = data.trends || [];
        const hourlyData = new Array(24).fill(0);
        
        for (const trend of trends) {
            const hour = new Date(trend.date).getHours();
            hourlyData[hour] += trend.totalAttempts || 0;
        }
        
        return {
            type: 'radar',
            title: 'Healing Activity by Hour of Day',
            labels: Array.from({ length: 24 }, (_, i) => i + ':00'),
            datasets: [{
                label: 'Healing Attempts',
                data: hourlyData,
                backgroundColor: this.theme.primary + '40',
                borderColor: this.theme.primary,
                pointBackgroundColor: this.theme.primary,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: this.theme.primary
            }],
            options: {
                scales: {
                    r: {
                        beginAtZero: true
                    }
                }
            }
        };
    }
    
    private generateHealingDurationChartData(data: EnhancedHealingReport): ChartData {
        const strategies = data.strategyStatistics || [];
        
        return {
            type: 'boxplot',
            title: 'Healing Duration by Strategy',
            labels: strategies.map(s => s.strategy),
            datasets: [{
                label: 'Duration (ms)',
                data: strategies.map(s => s.averageDuration || 0),
                backgroundColor: this.theme.primaryLight + '40',
                borderColor: this.theme.primary,
                borderWidth: 1
            }]
        };
    }
    
    private generateHTMLReport(data: EnhancedHealingReport): string {
        const effectiveness = this.getHealingEffectiveness();
        const recommendations = data.recommendations || [];
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CS Test Automation - Healing Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: ${this.theme.background};
            color: ${this.theme.text};
            line-height: 1.6;
        }
        
        .header {
            background: linear-gradient(135deg, ${this.theme.primary} 0%, ${this.theme.primaryDark} 100%);
            color: white;
            padding: 3rem 2rem;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            font-weight: 300;
        }
        
        .header .subtitle {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }
        
        .summary-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }
        
        .summary-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        
        .summary-card .value {
            font-size: 2rem;
            font-weight: 600;
            color: ${this.theme.primary};
            margin-bottom: 0.5rem;
        }
        
        .summary-card .label {
            color: #6c757d;
            font-size: 0.9rem;
        }
        
        .section {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }
        
        .section h2 {
            color: ${this.theme.primary};
            margin-bottom: 1.5rem;
            font-weight: 400;
            font-size: 1.8rem;
        }
        
        .section h3 {
            color: ${this.theme.primaryDark};
            margin-top: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 500;
            font-size: 1.3rem;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        
        th {
            background: ${this.theme.primary};
            color: white;
            padding: 1rem;
            text-align: left;
            font-weight: 500;
        }
        
        td {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #e9ecef;
        }
        
        tr:hover {
            background: ${this.theme.background};
        }
        
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }
        
        .badge-success {
            background: ${this.theme.success}20;
            color: ${this.theme.success};
        }
        
        .badge-warning {
            background: ${this.theme.warning}20;
            color: ${this.theme.warning};
        }
        
        .badge-danger {
            background: ${this.theme.danger}20;
            color: ${this.theme.danger};
        }
        
        .badge-info {
            background: ${this.theme.info}20;
            color: ${this.theme.info};
        }
        
        .recommendation {
            background: ${this.theme.info}10;
            border-left: 4px solid ${this.theme.info};
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 4px;
        }
        
        .recommendation .title {
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .recommendation .message {
            margin-bottom: 0.5rem;
        }
        
        .recommendation .action {
            margin-top: 0.5rem;
            font-weight: 500;
            color: ${this.theme.info};
        }
        
        .chart-container {
            margin: 2rem 0;
            padding: 1rem;
            background: ${this.theme.background};
            border-radius: 8px;
            min-height: 300px;
        }
        
        .chart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
            margin: 2rem 0;
        }
        
        .trend-indicator {
            display: inline-flex;
            align-items: center;
            margin-left: 0.5rem;
            font-size: 1.2rem;
        }
        
        .trend-up { color: ${this.theme.success}; }
        .trend-down { color: ${this.theme.danger}; }
        .trend-stable { color: ${this.theme.warning}; }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 0.5rem;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, ${this.theme.primary}, ${this.theme.primaryLight});
            transition: width 0.3s ease;
        }
        
        .metric-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem;
            background: ${this.theme.background};
            border-radius: 8px;
            margin-bottom: 1rem;
        }
        
        .metric-card .metric-label {
            font-weight: 500;
        }
        
        .metric-card .metric-value {
            font-size: 1.2rem;
            font-weight: 600;
            color: ${this.theme.primary};
        }
        
        @media (max-width: 768px) {
            .header h1 { font-size: 2rem; }
            .summary-grid { grid-template-columns: 1fr; }
            .chart-grid { grid-template-columns: 1fr; }
            .container { padding: 1rem; }
        }
        
        @media print {
            .header {
                background: none;
                color: ${this.theme.text};
                border-bottom: 2px solid ${this.theme.primary};
            }
            
            .section {
                box-shadow: none;
                border: 1px solid #dee2e6;
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Healing Report</h1>
        <div class="subtitle">
            Generated on ${new Date(data.generatedAt).toLocaleString()} | 
            Session: ${data.sessionId.substring(0, 8)}...
        </div>
    </div>
    
    <div class="container">
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value">${(effectiveness.overallSuccessRate * 100).toFixed(1)}%</div>
                <div class="label">Overall Success Rate</div>
            </div>
            <div class="summary-card">
                <div class="value">${effectiveness.totalHealingAttempts}</div>
                <div class="label">Total Healing Attempts</div>
            </div>
            <div class="summary-card">
                <div class="value">${effectiveness.averageHealingDuration.toFixed(0)}ms</div>
                <div class="label">Average Healing Time</div>
            </div>
            <div class="summary-card">
                <div class="value">
                    ${effectiveness.healingLoad.toFixed(1)}
                    <span class="trend-indicator ${this.getTrendClass(effectiveness.trendDirection)}">
                        ${this.getTrendIcon(effectiveness.trendDirection)}
                    </span>
                </div>
                <div class="label">Daily Healing Load</div>
            </div>
        </div>
        
        <div class="section">
            <h2>Overall Health Score</h2>
            <div class="metric-card">
                <span class="metric-label">System Health</span>
                <span class="metric-value">${data.analysis?.overallHealth.score || 'N/A'}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${data.analysis?.overallHealth.score || 0}%"></div>
            </div>
            <p style="margin-top: 1rem; color: #6c757d;">
                ${this.getHealthDescription(data.analysis?.overallHealth.score || 0)}
            </p>
        </div>
        
        <div class="section">
            <h2>Strategy Performance</h2>
            <table>
                <thead>
                    <tr>
                        <th>Strategy</th>
                        <th>Success Rate</th>
                        <th>Usage</th>
                        <th>Avg Duration</th>
                        <th>Performance</th>
                    </tr>
                </thead>
                <tbody>
                    ${effectiveness.strategiesRanked.map(strategy => `
                        <tr>
                            <td>${strategy.name}</td>
                            <td>${(strategy.successRate * 100).toFixed(1)}%</td>
                            <td>${strategy.usage}</td>
                            <td>${this.getAverageDuration(strategy.name, data)}ms</td>
                            <td>
                                <span class="badge ${this.getPerformanceBadgeClass(strategy.successRate)}">
                                    ${this.getPerformanceLabel(strategy.successRate)}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="section">
            <h2>Most Fragile Elements</h2>
            <table>
                <thead>
                    <tr>
                        <th>Element ID</th>
                        <th>Stability</th>
                        <th>Success Rate</th>
                        <th>Healing Attempts</th>
                        <th>Best Strategy</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.summary.mostFragileElements.slice(0, 10).map(element => `
                        <tr>
                            <td title="${element.elementId}">${this.truncateElementId(element.elementId)}</td>
                            <td>
                                <span class="badge ${this.getStabilityBadgeClass(element.stability)}">
                                    ${(element.stability * 100).toFixed(1)}%
                                </span>
                            </td>
                            <td>${(element.successRate * 100).toFixed(1)}%</td>
                            <td>${element.totalAttempts}</td>
                            <td>${element.mostSuccessfulStrategy || 'None'}</td>
                            <td>
                                <span class="badge badge-info">Review</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="section">
            <h2>Healing Trends</h2>
            <div class="chart-grid">
                <div class="chart-container">
                    <canvas id="successRateChart"></canvas>
                </div>
                <div class="chart-container">
                    <canvas id="healingTrendChart"></canvas>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Strategy Analysis</h2>
            <div class="chart-grid">
                <div class="chart-container">
                    <canvas id="strategyPerformanceChart"></canvas>
                </div>
                <div class="chart-container">
                    <canvas id="elementStabilityChart"></canvas>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Time Analysis</h2>
            ${data.analysis?.timePatterns ? `
                <div class="metric-card">
                    <span class="metric-label">Peak Healing Day</span>
                    <span class="metric-value">${data.analysis.timePatterns.peakHealingDay}</span>
                </div>
                <div class="metric-card">
                    <span class="metric-label">Peak Healing Hour</span>
                    <span class="metric-value">${data.analysis.timePatterns.peakHealingHour}:00</span>
                </div>
                <div class="chart-container">
                    <canvas id="timeDistributionChart"></canvas>
                </div>
            ` : '<p>No time analysis data available.</p>'}
        </div>
        
        <div class="section">
            <h2>Recommendations</h2>
            ${recommendations.length > 0 ? recommendations.map((rec: any) => `
                <div class="recommendation">
                    <div class="title">
                        ${rec.elementId ? `Element: ${this.truncateElementId(rec.elementId)}` : 'General'} 
                        - ${this.formatRecommendationType(rec.type)}
                    </div>
                    <div class="message">${rec.message}</div>
                    <div class="action">
                        <strong>Action:</strong> ${rec.suggestedAction}
                    </div>
                    ${rec.priority ? `
                        <div style="margin-top: 0.5rem;">
                            <span class="badge ${this.getPriorityBadgeClass(rec.priority)}">
                                Priority: ${rec.priority}
                            </span>
                        </div>
                    ` : ''}
                </div>
            `).join('') : '<p>No recommendations at this time. The system is performing well!</p>'}
        </div>
        
        <div class="section">
            <h2>Failure Analysis</h2>
            ${data.analysis?.failureRootCauses ? `
                <h3>Top Root Causes</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Root Cause</th>
                            <th>Occurrences</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.analysis.failureRootCauses.topRootCauses.map((cause: { cause: string; count: number; percentage: number }) => `
                            <tr>
                                <td>${cause.cause}</td>
                                <td>${cause.count}</td>
                                <td>${(cause.percentage * 100).toFixed(1)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <h3>Common Error Patterns</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Error Pattern</th>
                            <th>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.analysis.failureRootCauses.commonErrorPatterns.map((pattern: { pattern: string; count: number }) => `
                            <tr>
                                <td><code>${pattern.pattern}</code></td>
                                <td>${pattern.count}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<p>No failure analysis data available.</p>'}
        </div>
        
        <div class="section">
            <h2>Recent Healing Activity</h2>
            <table>
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Element</th>
                        <th>Strategy</th>
                        <th>Duration</th>
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.recentFailures || []).slice(0, 10).map(activity => `
                        <tr>
                            <td>${new Date(activity.timestamp).toLocaleString()}</td>
                            <td title="${activity.elementId}">${this.truncateElementId(activity.elementId)}</td>
                            <td>${activity.strategy}</td>
                            <td>${activity.duration}ms</td>
                            <td>
                                <span class="badge badge-danger">Failed</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
    <script>
        // Chart.js configuration
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        Chart.defaults.color = '${this.theme.text}';
        
        // Render charts
        const vizData = ${JSON.stringify(data.visualizations || {})};
        
        // Success Rate Chart
        if (vizData.successRateChart && document.getElementById('successRateChart')) {
            new Chart(document.getElementById('successRateChart'), {
                type: vizData.successRateChart.type,
                data: vizData.successRateChart,
                options: vizData.successRateChart.options || {}
            });
        }
        
        // Healing Trend Chart
        if (vizData.healingTrendChart && document.getElementById('healingTrendChart')) {
            new Chart(document.getElementById('healingTrendChart'), {
                type: vizData.healingTrendChart.type,
                data: vizData.healingTrendChart,
                options: vizData.healingTrendChart.options || {}
            });
        }
        
        // Strategy Performance Chart
        if (vizData.strategyPerformanceChart && document.getElementById('strategyPerformanceChart')) {
            new Chart(document.getElementById('strategyPerformanceChart'), {
                type: vizData.strategyPerformanceChart.type,
                data: vizData.strategyPerformanceChart,
                options: vizData.strategyPerformanceChart.options || {}
            });
        }
        
        // Element Stability Chart
        if (vizData.elementStabilityChart && document.getElementById('elementStabilityChart')) {
            new Chart(document.getElementById('elementStabilityChart'), {
                type: vizData.elementStabilityChart.type,
                data: vizData.elementStabilityChart,
                options: vizData.elementStabilityChart.options || {}
            });
        }
        
        // Time Distribution Chart
        if (vizData.timeDistributionChart && document.getElementById('timeDistributionChart')) {
            new Chart(document.getElementById('timeDistributionChart'), {
                type: vizData.timeDistributionChart.type,
                data: vizData.timeDistributionChart,
                options: vizData.timeDistributionChart.options || {}
            });
        }
    </script>
</body>
</html>`;
    }
    
    // Helper methods
    
    private identifyLocatorType(locator: string): string {
        if (locator.startsWith('#')) return 'id';
        if (locator.startsWith('.')) return 'class';
        if (locator.startsWith('//') || locator.startsWith('xpath=')) return 'xpath';
        if (locator.includes('=')) {
            const [type] = locator.split('=');
            return type || 'css';
        }
        return 'css';
    }
    
    private generateLocatorSuggestion(element: FragileElement, failingType: string, failureCount: number): LocatorSuggestion {
        const suggestions: Record<string, LocatorSuggestion> = {
            'xpath': {
                elementId: element.elementId,
                currentLocator: element.elementId,
                suggestedLocator: 'Use data-testid or stable CSS selector instead of XPath',
                reason: `XPath locator failed ${failureCount} times. XPath is fragile to DOM changes.`,
                priority: 9,
                expectedImprovement: 0.4
            },
            'class': {
                elementId: element.elementId,
                currentLocator: element.elementId,
                suggestedLocator: 'Add data-testid attribute to element',
                reason: `Class-based locator failed ${failureCount} times. Classes may change with styling updates.`,
                priority: 7,
                expectedImprovement: 0.3
            },
            'css': {
                elementId: element.elementId,
                currentLocator: element.elementId,
                suggestedLocator: 'Use more specific CSS selector or add data-testid',
                reason: `CSS selector failed ${failureCount} times. Consider using more stable attributes.`,
                priority: 6,
                expectedImprovement: 0.25
            },
            'id': {
                elementId: element.elementId,
                currentLocator: element.elementId,
                suggestedLocator: 'Verify ID is not dynamically generated',
                reason: `ID-based locator failed ${failureCount} times. ID might be dynamic.`,
                priority: 8,
                expectedImprovement: 0.35
            }
        };
        
        return suggestions[failingType] || {
            elementId: element.elementId,
            currentLocator: element.elementId,
            suggestedLocator: 'Review and update locator strategy',
            reason: `Locator failed ${failureCount} times`,
            priority: 5,
            expectedImprovement: 0.2
        };
    }
    
    private categorizeError(errorMessage: string): string {
        const lowerError = errorMessage.toLowerCase();
        
        if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
            return 'Timeout';
        }
        if (lowerError.includes('not found') || lowerError.includes('no element')) {
            return 'Element Not Found';
        }
        if (lowerError.includes('not visible') || lowerError.includes('hidden')) {
            return 'Element Not Visible';
        }
        if (lowerError.includes('not clickable') || lowerError.includes('intercepted')) {
            return 'Element Not Interactable';
        }
        if (lowerError.includes('stale') || lowerError.includes('detached')) {
            return 'Stale Element';
        }
        if (lowerError.includes('attribute') || lowerError.includes('property')) {
            return 'Attribute Changed';
        }
        
        return 'Other';
    }
    
    private extractErrorPattern(errorMessage: string): string {
        // Extract the core error pattern
        const patterns = [
            /timeout.*waiting for .*(selector|locator)/i,
            /element.*not found/i,
            /element.*not visible/i,
            /element.*not clickable/i,
            /stale element reference/i,
            /element.*detached from/i,
            /attribute.*not found/i
        ];
        
        for (const pattern of patterns) {
            if (pattern.test(errorMessage)) {
                return pattern.source;
            }
        }
        
        // Return first 50 chars as pattern if no match
        return errorMessage.substring(0, 50) + '...';
    }
    
    private calculateTrendDirection(trends: any[]): 'improving' | 'degrading' | 'stable' {
        if (trends.length < 2) return 'stable';
        
        // Calculate linear regression
        const n = trends.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        trends.forEach((trend, i) => {
            const x = i;
            const y = trend.successRate || 0;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        
        if (slope > 0.01) return 'improving';
        if (slope < -0.01) return 'degrading';
        return 'stable';
    }
    
    private calculateHealingLoad(trends: any[]): number {
        if (trends.length === 0) return 0;
        
        const recentTrends = trends.slice(-7);
        const totalAttempts = recentTrends.reduce((sum, t) => sum + (t.totalAttempts || 0), 0);
        
        return totalAttempts / recentTrends.length;
    }
    
    private calculateStabilityImprovement(trends: any[]): number {
        if (trends.length < 7) return 0;
        
        const oldTrends = trends.slice(0, 7);
        const newTrends = trends.slice(-7);
        
        const oldSuccessRate = oldTrends.reduce((sum, t) => sum + (t.successRate || 0), 0) / oldTrends.length;
        const newSuccessRate = newTrends.reduce((sum, t) => sum + (t.successRate || 0), 0) / newTrends.length;
        
        return newSuccessRate - oldSuccessRate;
    }
    
    private calculateFrequencyTrend(trends: any[]): 'increasing' | 'decreasing' | 'stable' {
        if (trends.length < 7) return 'stable';
        
        const recentAvg = trends.slice(-3).reduce((sum, t) => sum + (t.totalAttempts || 0), 0) / 3;
        const olderAvg = trends.slice(-7, -3).reduce((sum, t) => sum + (t.totalAttempts || 0), 0) / 4;
        
        const change = (recentAvg - olderAvg) / olderAvg;
        
        if (change > 0.2) return 'increasing';
        if (change < -0.2) return 'decreasing';
        return 'stable';
    }
    
    private categorizePerformance(successRate: number): 'excellent' | 'good' | 'fair' | 'poor' {
        if (successRate >= 0.9) return 'excellent';
        if (successRate >= 0.7) return 'good';
        if (successRate >= 0.5) return 'fair';
        return 'poor';
    }
    
    private calculateOverallHealth(_data: HealingReport): OverallHealth {
        const effectiveness = this.getHealingEffectiveness();
        const fragileElements = this.identifyFragileElements();
        
        // Calculate health score (0-100)
        let score = 100;
        
        // Deduct for low success rate
        score -= (1 - effectiveness.overallSuccessRate) * 30;
        
        // Deduct for fragile elements
        score -= Math.min(fragileElements.length * 2, 20);
        
        // Deduct for high healing load
        if (effectiveness.healingLoad > 50) score -= 10;
        if (effectiveness.healingLoad > 100) score -= 10;
        
        // Deduct for degrading trend
        if (effectiveness.trendDirection === 'degrading') score -= 15;
        
        // Ensure score is within bounds
        score = Math.max(0, Math.min(100, score));
        
        return {
            score: Math.round(score),
            status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
            factors: {
                successRate: effectiveness.overallSuccessRate,
                fragileElements: fragileElements.length,
                healingLoad: effectiveness.healingLoad,
                trend: effectiveness.trendDirection
            }
        };
    }
    
    private getTrendClass(trend: string): string {
        switch (trend) {
            case 'improving': return 'trend-up';
            case 'degrading': return 'trend-down';
            default: return 'trend-stable';
        }
    }
    
    private getTrendIcon(trend: string): string {
        switch (trend) {
            case 'improving': return '↑';
            case 'degrading': return '↓';
            default: return '→';
        }
    }
    
    private getPerformanceBadgeClass(successRate: number): string {
        if (successRate >= 0.9) return 'badge-success';
        if (successRate >= 0.7) return 'badge-info';
        if (successRate >= 0.5) return 'badge-warning';
        return 'badge-danger';
    }
    
    private getPerformanceLabel(successRate: number): string {
        if (successRate >= 0.9) return 'Excellent';
        if (successRate >= 0.7) return 'Good';
        if (successRate >= 0.5) return 'Fair';
        return 'Poor';
    }
    
    private getStabilityBadgeClass(stability: number): string {
        if (stability >= 0.7) return 'badge-success';
        if (stability >= 0.3) return 'badge-warning';
        return 'badge-danger';
    }
    
    private getPriorityBadgeClass(priority: string): string {
        switch (priority.toLowerCase()) {
            case 'critical':
            case 'high':
                return 'badge-danger';
            case 'medium':
                return 'badge-warning';
            case 'low':
                return 'badge-info';
            default:
                return 'badge-secondary';
        }
    }
    
    private truncateElementId(elementId: string): string {
        if (elementId.length <= 30) return elementId;
        return elementId.substring(0, 27) + '...';
    }
    
    private formatRecommendationType(type: string): string {
        return type.replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    
    private getHealthDescription(score: number): string {
        if (score >= 80) {
            return 'The healing system is performing excellently with high success rates and stable elements.';
        }
        if (score >= 60) {
            return 'The healing system is performing adequately but there are areas for improvement.';
        }
        return 'The healing system requires attention. Multiple elements are unstable and success rates are low.';
    }
    
    private getAverageDuration(strategyName: string, data: HealingReport): number {
        const strategy = (data.strategyStatistics || [])
            .find(s => s.strategy === strategyName);
        return strategy?.averageDuration || 0;
    }
}

// Type definitions
interface LocatorSuggestion {
    elementId: string;
    currentLocator: string;
    suggestedLocator: string;
    reason: string;
    priority: number;
    expectedImprovement: number;
}

interface HealingEffectiveness {
    overallSuccessRate: number;
    averageHealingDuration: number;
    totalHealingAttempts: number;
    successfulHealings: number;
    failedHealings: number;
    trendDirection: 'improving' | 'degrading' | 'stable';
    bestStrategy: string;
    worstStrategy: string;
    strategiesRanked: Array<{
        name: string;
        successRate: number;
        usage: number;
    }>;
    healingLoad: number;
    stabilityImprovement: number;
}

interface DetailedAnalysis {
    timePatterns: TimePatternAnalysis;
    strategyEffectiveness: StrategyEffectivenessAnalysis;
    elementStability: ElementStabilityAnalysis;
    failureRootCauses: FailureRootCauseAnalysis;
    overallHealth: OverallHealth;
}

interface TimePatternAnalysis {
    peakHealingDay: string;
    peakHealingHour: number;
    dayOfWeekDistribution: Record<string, { attempts: number; success: number }>;
    hourlyDistribution: Record<number, { attempts: number; success: number }>;
    healingFrequencyTrend: 'increasing' | 'decreasing' | 'stable';
}

interface StrategyEffectivenessAnalysis {
    mostEffective: string;
    leastEffective: string;
    averageSuccessRate: number;
    strategyComparison: Array<{
        name: string;
        successRate: number;
        usage: number;
        performance: string;
    }>;
    recommendedStrategies: string[];
    deprecatedStrategies: string[];
}

interface ElementStabilityAnalysis {
    totalElements: number;
    stableElements: number;
    moderateElements: number;
    unstableElements: number;
    averageStability: number;
    stabilityDistribution: {
        high: any[];
        medium: any[];
        low: any[];
    };
    criticalElements: any[];
    averageHealingFrequency: number;
}

interface FailureRootCauseAnalysis {
    topRootCauses: Array<{
        cause: string;
        count: number;
        percentage: number;
    }>;
    commonErrorPatterns: Array<{
        pattern: string;
        count: number;
    }>;
    failureRate: number;
    averageTimeToFailure: number;
}

interface OverallHealth {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    factors: {
        successRate: number;
        fragileElements: number;
        healingLoad: number;
        trend: string;
    };
}

export { HealingReporter };