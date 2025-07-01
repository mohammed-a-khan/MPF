// src/core/ai/healing/HealingHistory.ts

import { logger } from '../../utils/Logger';
import { ActionLogger } from '../../logging/ActionLogger';
import { FileUtils } from '../../utils/FileUtils';
import * as path from 'path';
import * as crypto from 'crypto';

export class HealingHistory {
    private static instance: HealingHistory;
    private history: Map<string, HealingRecord[]> = new Map();
    private strategyStats: Map<string, StrategyStatistics> = new Map();
    private elementStats: Map<string, ElementStatistics> = new Map();
    private sessionId: string;
    private persistencePath: string;
    private isDirty: boolean = false;
    private autoSaveInterval: NodeJS.Timeout | null = null;
    
    private readonly maxHistoryPerElement = 100;
    private readonly autoSaveIntervalMs = 30000;
    private readonly historyRetentionDays = 30;
    
    private constructor() {
        this.sessionId = this.generateSessionId();
        this.persistencePath = path.join(process.cwd(), '.healing-history');
        this.initialize();
    }
    
    static getInstance(): HealingHistory {
        if (!HealingHistory.instance) {
            HealingHistory.instance = new HealingHistory();
        }
        return HealingHistory.instance;
    }
    
    private async initialize(): Promise<void> {
        try {
            await this.loadHistory();
            
            this.cleanOldRecords();
            
            this.startAutoSave();
            
            logger.info('HealingHistory initialized successfully');
            
        } catch (error) {
            logger.error(`Failed to initialize HealingHistory: ${(error as Error).message}`);
        }
    }
    
    async recordAttempt(
        elementId: string,
        strategy: string,
        success: boolean,
        details?: HealingDetails
    ): Promise<void> {
        try {
            const record: HealingRecord = {
                id: this.generateRecordId(),
                elementId,
                strategy,
                success,
                timestamp: new Date(),
                sessionId: this.sessionId,
                duration: details?.duration || 0,
                confidence: details?.confidence || 0
            };
            
            if (details?.errorMessage !== undefined) {
                record.errorMessage = details.errorMessage;
            }
            if (details?.oldLocator !== undefined) {
                record.oldLocator = details.oldLocator;
            }
            if (details?.newLocator !== undefined) {
                record.newLocator = details.newLocator;
            }
            if (details?.elementType !== undefined) {
                record.elementType = details.elementType;
            }
            if (details?.pageUrl !== undefined) {
                record.pageUrl = details.pageUrl;
            }
            
            if (!this.history.has(elementId)) {
                this.history.set(elementId, []);
            }
            
            const elementHistory = this.history.get(elementId)!;
            elementHistory.push(record);
            
            if (elementHistory.length > this.maxHistoryPerElement) {
                elementHistory.shift();
            }
            
            this.updateStrategyStats(strategy, success, details?.duration);
            this.updateElementStats(elementId, success, strategy);
            
            this.isDirty = true;
            
            ActionLogger.getInstance().logAction('Element Healing', {
                elementId: record.elementId,
                strategy: record.strategy,
                success: record.success,
                duration: record.duration,
                confidence: record.confidence,
                oldLocator: record.oldLocator,
                newLocator: record.newLocator,
                errorMessage: record.errorMessage,
                elementType: record.elementType,
                pageUrl: record.pageUrl
            }, {
                type: 'healing',
                sessionId: record.sessionId,
                timestamp: record.timestamp.getTime()
            }).catch(error => {
                logger.error(`Failed to log healing record: ${(error as Error).message}`);
            });
            
        } catch (error) {
            logger.error(`Failed to record healing attempt: ${(error as Error).message}`);
        }
    }
    
    getElementHistory(elementId: string): HealingRecord[] {
        return this.history.get(elementId) || [];
    }
    
    getAllHistory(): HealingRecord[] {
        const allRecords: HealingRecord[] = [];
        
        for (const records of this.history.values()) {
            allRecords.push(...records);
        }
        
        return allRecords.sort((a, b) => 
            b.timestamp.getTime() - a.timestamp.getTime()
        );
    }
    
    getSuccessRate(strategy: string): number {
        const stats = this.strategyStats.get(strategy);
        
        if (!stats || stats.totalAttempts === 0) {
            return 0;
        }
        
        return stats.successCount / stats.totalAttempts;
    }
    
    getStrategyStatistics(): Map<string, StrategyStatistics> {
        return new Map(this.strategyStats);
    }
    
    getMostSuccessfulStrategy(elementType: string): string | null {
        const strategies = this.getStrategiesForElementType(elementType);
        
        if (strategies.length === 0) {
            return null;
        }
        
        strategies.sort((a, b) => {
            const rateA = this.getSuccessRate(a.strategy);
            const rateB = this.getSuccessRate(b.strategy);
            return rateB - rateA;
        });
        
        return strategies[0]?.strategy || null;
    }
    
    getElementStability(elementId: string): number {
        const stats = this.elementStats.get(elementId);
        
        if (!stats || stats.totalHealingAttempts === 0) {
            return 1;
        }
        
        const healingFrequency = stats.totalHealingAttempts / Math.max(1, stats.daysTracked);
        const successRate = stats.successfulHealings / stats.totalHealingAttempts;
        
        const frequencyScore = Math.exp(-healingFrequency / 5);
        const successScore = successRate;
        
        return (frequencyScore * 0.7) + (successScore * 0.3);
    }
    
    getFragileElements(threshold: number = 0.5): FragileElement[] {
        const fragileElements: FragileElement[] = [];
        
        for (const [elementId, stats] of this.elementStats) {
            const stability = this.getElementStability(elementId);
            
            if (stability < threshold) {
                const recentHistory = this.getElementHistory(elementId)
                    .slice(-10);
                
                fragileElements.push({
                    elementId,
                    stability,
                    totalAttempts: stats.totalHealingAttempts,
                    successRate: stats.successfulHealings / stats.totalHealingAttempts,
                    lastFailure: stats.lastFailure,
                    mostSuccessfulStrategy: this.getMostSuccessfulStrategyForElement(elementId),
                    recentHistory
                });
            }
        }
        
        return fragileElements.sort((a, b) => a.stability - b.stability);
    }
    
    getHealingTrends(days: number = 7): HealingTrend[] {
        const trends: Map<string, HealingTrend> = new Map();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        for (const records of this.history.values()) {
            for (const record of records) {
                if (record.timestamp < cutoffDate) continue;
                
                const dateKey = this.getDateKey(record.timestamp);
                
                if (!trends.has(dateKey)) {
                    trends.set(dateKey, {
                        date: dateKey,
                        totalAttempts: 0,
                        successfulAttempts: 0,
                        failedAttempts: 0,
                        averageDuration: 0,
                        strategiesUsed: new Set(),
                        elementsHealed: new Set()
                    });
                }
                
                const trend = trends.get(dateKey)!;
                trend.totalAttempts++;
                
                if (record.success) {
                    trend.successfulAttempts++;
                } else {
                    trend.failedAttempts++;
                }
                
                trend.averageDuration = 
                    (trend.averageDuration * (trend.totalAttempts - 1) + record.duration) / 
                    trend.totalAttempts;
                
                trend.strategiesUsed.add(record.strategy);
                trend.elementsHealed.add(record.elementId);
            }
        }
        
        return Array.from(trends.values())
            .sort((a, b) => a.date.localeCompare(b.date));
    }
    
    async exportHistory(format: 'json' | 'html' = 'json'): Promise<string> {
        try {
            const report: HealingReport = {
                generatedAt: new Date(),
                sessionId: this.sessionId,
                summary: {
                    totalElements: this.history.size,
                    totalAttempts: this.getTotalAttempts(),
                    overallSuccessRate: this.getOverallSuccessRate(),
                    mostSuccessfulStrategy: this.getMostSuccessfulStrategyOverall(),
                    mostFragileElements: this.getFragileElements(0.3).slice(0, 10)
                },
                strategyStatistics: Array.from(this.strategyStats.entries()).map(([, stats]) => ({
                    ...stats,
                    successRate: stats.totalAttempts > 0 ? stats.successCount / stats.totalAttempts : 0
                })),
                elementStatistics: Array.from(this.elementStats.entries()).map(([elementId, stats]) => ({
                    ...stats,
                    stability: this.getElementStability(elementId)
                })),
                trends: this.getHealingTrends(30),
                recentFailures: this.getRecentFailures(20)
            };
            
            if (format === 'json') {
                return JSON.stringify(report, null, 2);
            } else {
                return this.generateHTMLReport(report);
            }
            
        } catch (error) {
            logger.error(`Failed to export healing history: ${(error as Error).message}`);
            throw error;
        }
    }
    
    async clearHistory(): Promise<void> {
        this.history.clear();
        this.strategyStats.clear();
        this.elementStats.clear();
        this.isDirty = true;
        
        await this.saveHistory();
        
        logger.info('Healing history cleared');
    }
    
    getRecommendations(): HealingRecommendation[] {
        const recommendations: HealingRecommendation[] = [];
        
        const fragileElements = this.getFragileElements(0.5);
        
        for (const element of fragileElements) {
            const history = this.getElementHistory(element.elementId);
            const recentHistory = history.slice(-20);
            
            const failurePatterns = this.analyzeFailurePatterns(recentHistory);
            
            if (failurePatterns.sameLocatorFailures > 0.5) {
                recommendations.push({
                    elementId: element.elementId,
                    severity: 'high',
                    type: 'locator_update',
                    message: 'Element locator is consistently failing. Consider updating to a more stable locator.',
                    suggestedAction: 'Use data-testid or aria-label attributes for more stable identification.'
                });
            }
            
            if (failurePatterns.strategyFailures.size >= 3) {
                recommendations.push({
                    elementId: element.elementId,
                    severity: 'medium',
                    type: 'multiple_strategy_failures',
                    message: `Multiple healing strategies are failing (${Array.from(failurePatterns.strategyFailures).join(', ')}).`,
                    suggestedAction: 'Element structure may have changed significantly. Review and update element definition.'
                });
            }
            
            if (element.stability < 0.3) {
                recommendations.push({
                    elementId: element.elementId,
                    severity: 'high',
                    type: 'highly_unstable',
                    message: `Element has very low stability score (${(element.stability * 100).toFixed(1)}%).`,
                    suggestedAction: 'Consider using AI identification or implementing custom healing logic.'
                });
            }
        }
        
        for (const [strategy, stats] of this.strategyStats) {
            const successRate = this.getSuccessRate(strategy);
            
            if (successRate < 0.3 && stats.totalAttempts > 10) {
                recommendations.push({
                    elementId: null,
                    severity: 'low',
                    type: 'strategy_performance',
                    message: `${strategy} strategy has low success rate (${(successRate * 100).toFixed(1)}%).`,
                    suggestedAction: 'Consider adjusting strategy parameters or disabling for certain element types.'
                });
            }
        }
        
        return recommendations.sort((a, b) => {
            const severityOrder = { high: 0, medium: 1, low: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }
    
    
    private updateStrategyStats(strategy: string, success: boolean, duration?: number): void {
        if (!this.strategyStats.has(strategy)) {
            this.strategyStats.set(strategy, {
                strategy,
                totalAttempts: 0,
                successCount: 0,
                failureCount: 0,
                averageDuration: 0,
                lastUsed: new Date()
            });
        }
        
        const stats = this.strategyStats.get(strategy)!;
        stats.totalAttempts++;
        
        if (success) {
            stats.successCount++;
        } else {
            stats.failureCount++;
        }
        
        if (duration !== undefined) {
            stats.averageDuration = 
                (stats.averageDuration * (stats.totalAttempts - 1) + duration) / 
                stats.totalAttempts;
        }
        
        stats.lastUsed = new Date();
    }
    
    private updateElementStats(elementId: string, success: boolean, strategy: string): void {
        if (!this.elementStats.has(elementId)) {
            this.elementStats.set(elementId, {
                elementId,
                totalHealingAttempts: 0,
                successfulHealings: 0,
                failedHealings: 0,
                strategiesUsed: new Set(),
                firstSeen: new Date(),
                lastHealed: new Date(),
                lastFailure: null,
                daysTracked: 1
            });
        }
        
        const stats = this.elementStats.get(elementId)!;
        stats.totalHealingAttempts++;
        
        if (success) {
            stats.successfulHealings++;
            stats.lastHealed = new Date();
        } else {
            stats.failedHealings++;
            stats.lastFailure = new Date();
        }
        
        stats.strategiesUsed.add(strategy);
        
        const daysSinceFirst = Math.ceil(
            (new Date().getTime() - stats.firstSeen.getTime()) / 
            (1000 * 60 * 60 * 24)
        );
        stats.daysTracked = Math.max(1, daysSinceFirst);
    }
    
    private getStrategiesForElementType(elementType: string): Array<{strategy: string; count: number}> {
        const strategyCounts = new Map<string, number>();
        
        for (const records of this.history.values()) {
            for (const record of records) {
                if (record.elementType === elementType && record.success) {
                    const count = strategyCounts.get(record.strategy) || 0;
                    strategyCounts.set(record.strategy, count + 1);
                }
            }
        }
        
        return Array.from(strategyCounts.entries())
            .map(([strategy, count]) => ({ strategy, count }));
    }
    
    private getMostSuccessfulStrategyForElement(elementId: string): string | null {
        const history = this.getElementHistory(elementId);
        const strategySuccess = new Map<string, {success: number; total: number}>();
        
        for (const record of history) {
            if (!strategySuccess.has(record.strategy)) {
                strategySuccess.set(record.strategy, { success: 0, total: 0 });
            }
            
            const stats = strategySuccess.get(record.strategy)!;
            stats.total++;
            if (record.success) stats.success++;
        }
        
        let bestStrategy: string | null = null;
        let bestRate = 0;
        
        for (const [strategy, stats] of strategySuccess) {
            const rate = stats.success / stats.total;
            if (rate > bestRate) {
                bestRate = rate;
                bestStrategy = strategy;
            }
        }
        
        return bestStrategy;
    }
    
    private getMostSuccessfulStrategyOverall(): string | null {
        let bestStrategy: string | null = null;
        let bestRate = 0;
        
        for (const [strategy] of this.strategyStats) {
            const rate = this.getSuccessRate(strategy);
            if (rate > bestRate) {
                bestRate = rate;
                bestStrategy = strategy;
            }
        }
        
        return bestStrategy;
    }
    
    private getTotalAttempts(): number {
        let total = 0;
        for (const stats of this.strategyStats.values()) {
            total += stats.totalAttempts;
        }
        return total;
    }
    
    private getOverallSuccessRate(): number {
        let totalAttempts = 0;
        let totalSuccess = 0;
        
        for (const stats of this.strategyStats.values()) {
            totalAttempts += stats.totalAttempts;
            totalSuccess += stats.successCount;
        }
        
        return totalAttempts > 0 ? totalSuccess / totalAttempts : 0;
    }
    
    private getRecentFailures(limit: number): HealingRecord[] {
        const failures: HealingRecord[] = [];
        
        for (const records of this.history.values()) {
            for (const record of records) {
                if (!record.success) {
                    failures.push(record);
                }
            }
        }
        
        return failures
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }
    
    private analyzeFailurePatterns(history: HealingRecord[]): FailurePattern {
        const failures = history.filter(r => !r.success);
        const locatorFailures = new Map<string, number>();
        const strategyFailures = new Set<string>();
        
        for (const failure of failures) {
            if (failure.oldLocator) {
                const count = locatorFailures.get(failure.oldLocator) || 0;
                locatorFailures.set(failure.oldLocator, count + 1);
            }
            strategyFailures.add(failure.strategy);
        }
        
        const maxLocatorFailures = Math.max(...locatorFailures.values(), 0);
        const sameLocatorFailureRate = failures.length > 0 ? maxLocatorFailures / failures.length : 0;
        
        return {
            sameLocatorFailures: sameLocatorFailureRate,
            strategyFailures
        };
    }
    
    private generateHTMLReport(report: HealingReport): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Healing History Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #93186C; color: white; padding: 20px; }
        .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; }
        .section { margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #93186C; color: white; }
        .stable { color: green; }
        .unstable { color: red; }
        .warning { color: orange; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Healing History Report</h1>
        <p>Generated: ${report.generatedAt.toLocaleString()}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Elements: ${report.summary.totalElements}</p>
        <p>Total Healing Attempts: ${report.summary.totalAttempts}</p>
        <p>Overall Success Rate: ${(report.summary.overallSuccessRate * 100).toFixed(1)}%</p>
        <p>Most Successful Strategy: ${report.summary.mostSuccessfulStrategy || 'N/A'}</p>
    </div>
    
    <div class="section">
        <h2>Strategy Performance</h2>
        <table>
            <tr>
                <th>Strategy</th>
                <th>Attempts</th>
                <th>Success Rate</th>
                <th>Avg Duration (ms)</th>
            </tr>
            ${report.strategyStatistics.map(s => `
                <tr>
                    <td>${s.strategy}</td>
                    <td>${s.totalAttempts}</td>
                    <td>${(s.successRate * 100).toFixed(1)}%</td>
                    <td>${s.averageDuration.toFixed(0)}</td>
                </tr>
            `).join('')}
        </table>
    </div>
    
    <div class="section">
        <h2>Most Fragile Elements</h2>
        <table>
            <tr>
                <th>Element ID</th>
                <th>Stability</th>
                <th>Success Rate</th>
                <th>Total Attempts</th>
            </tr>
            ${report.summary.mostFragileElements.map(e => `
                <tr>
                    <td>${e.elementId}</td>
                    <td class="${e.stability < 0.3 ? 'unstable' : e.stability < 0.7 ? 'warning' : 'stable'}">
                        ${(e.stability * 100).toFixed(1)}%
                    </td>
                    <td>${(e.successRate * 100).toFixed(1)}%</td>
                    <td>${e.totalAttempts}</td>
                </tr>
            `).join('')}
        </table>
    </div>
</body>
</html>`;
    }
    
    private generateSessionId(): string {
        return crypto.randomBytes(16).toString('hex');
    }
    
    private generateRecordId(): string {
        return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    }
    
    private getDateKey(date: Date): string {
        return date.toISOString().split('T')[0] || '';
    }
    
    private cleanOldRecords(): void {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.historyRetentionDays);
        
        let removedCount = 0;
        
        for (const [elementId, records] of this.history) {
            const filtered = records.filter(r => r.timestamp >= cutoffDate);
            
            if (filtered.length < records.length) {
                removedCount += records.length - filtered.length;
                this.history.set(elementId, filtered);
            }
            
            if (filtered.length === 0) {
                this.history.delete(elementId);
                this.elementStats.delete(elementId);
            }
        }
        
        if (removedCount > 0) {
            logger.info(`Cleaned ${removedCount} old healing records`);
            this.isDirty = true;
        }
    }
    
    private startAutoSave(): void {
        this.autoSaveInterval = setInterval(async () => {
            if (this.isDirty) {
                await this.saveHistory();
            }
        }, this.autoSaveIntervalMs);
    }
    
    private async saveHistory(): Promise<void> {
        try {
            const data = {
                version: '1.0',
                savedAt: new Date(),
                history: Array.from(this.history.entries()),
                strategyStats: Array.from(this.strategyStats.entries()),
                elementStats: Array.from(this.elementStats.entries())
            };
            
            await FileUtils.ensureDir(path.dirname(this.persistencePath));
            await FileUtils.writeJSON(this.persistencePath, data);
            
            this.isDirty = false;
            
            logger.debug('Healing history saved');
            
        } catch (error) {
            logger.error(`Failed to save healing history: ${(error as Error).message}`);
        }
    }
    
    private async loadHistory(): Promise<void> {
        try {
            if (!await FileUtils.exists(this.persistencePath)) {
                logger.debug('No existing healing history found');
                return;
            }
            
            const data = await FileUtils.readJSON(this.persistencePath);
            
            this.history = new Map(data.history);
            this.strategyStats = new Map(data.strategyStats);
            this.elementStats = new Map(data.elementStats);
            
            for (const records of this.history.values()) {
                for (const record of records) {
                    record.timestamp = new Date(record.timestamp);
                }
            }
            
            for (const stats of this.strategyStats.values()) {
                stats.lastUsed = new Date(stats.lastUsed);
            }
            
            for (const stats of this.elementStats.values()) {
                stats.firstSeen = new Date(stats.firstSeen);
                stats.lastHealed = new Date(stats.lastHealed);
                if (stats.lastFailure) {
                    stats.lastFailure = new Date(stats.lastFailure);
                }
            }
            
            logger.info(`Loaded healing history with ${this.history.size} elements`);
            
        } catch (error) {
            logger.error(`Failed to load healing history: ${(error as Error).message}`);
        }
    }
    
    async shutdown(): Promise<void> {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
        
        if (this.isDirty) {
            await this.saveHistory();
        }
        
        logger.info('HealingHistory shutdown complete');
    }

    exportHistoryData(): HealingRecord[] {
        const allRecords: HealingRecord[] = [];
        
        this.history.forEach((records) => {
            allRecords.push(...records);
        });
        
        allRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        return allRecords;
    }

    clear(): void {
        this.history.clear();
        this.strategyStats.clear();
        this.elementStats.clear();
        this.isDirty = true;
        ActionLogger.logInfo('Healing history cleared');
    }

    importHistory(data: HealingRecord[]): void {
        if (!Array.isArray(data)) {
            throw new Error('Import data must be an array of HealingRecord objects');
        }

        this.history.clear();
        this.strategyStats.clear();
        this.elementStats.clear();

        const recordsByElement = new Map<string, HealingRecord[]>();
        
        data.forEach(record => {
            if (!record.elementId || !record.strategy) {
                ActionLogger.logWarn('Skipping invalid healing record during import', { record });
                return;
            }

            if (typeof record.timestamp === 'string') {
                record.timestamp = new Date(record.timestamp);
            }

            if (!recordsByElement.has(record.elementId)) {
                recordsByElement.set(record.elementId, []);
            }
            recordsByElement.get(record.elementId)!.push(record);

            this.updateStrategyStats(record.strategy, record.success, record.duration);
            
            this.updateElementStats(record.elementId, record.success, record.strategy);
        });

        recordsByElement.forEach((records, elementId) => {
            records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            this.history.set(elementId, records);
        });

        this.isDirty = true;
        ActionLogger.logInfo('Healing history imported', {
            recordCount: data.length,
            elementCount: this.history.size,
            totalAttempts: data.length
        });
    }
}

interface HealingRecord {
    id: string;
    elementId: string;
    strategy: string;
    success: boolean;
    timestamp: Date;
    sessionId: string;
    duration: number;
    confidence: number;
    errorMessage?: string;
    oldLocator?: string;
    newLocator?: string;
    elementType?: string;
    pageUrl?: string;
}

interface HealingDetails {
    duration?: number | undefined;
    confidence?: number | undefined;
    errorMessage?: string | undefined;
    oldLocator?: string | undefined;
    newLocator?: string | undefined;
    elementType?: string | undefined;
    pageUrl?: string | undefined;
}

interface StrategyStatistics {
    strategy: string;
    totalAttempts: number;
    successCount: number;
    failureCount: number;
    averageDuration: number;
    lastUsed: Date;
}

interface ElementStatistics {
    elementId: string;
    totalHealingAttempts: number;
    successfulHealings: number;
    failedHealings: number;
    strategiesUsed: Set<string>;
    firstSeen: Date;
    lastHealed: Date;
    lastFailure: Date | null;
    daysTracked: number;
}

interface FragileElement {
    elementId: string;
    stability: number;
    totalAttempts: number;
    successRate: number;
    lastFailure: Date | null;
    mostSuccessfulStrategy: string | null;
    recentHistory: HealingRecord[];
}

interface HealingTrend {
    date: string;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    averageDuration: number;
    strategiesUsed: Set<string>;
    elementsHealed: Set<string>;
}

interface HealingReport {
    generatedAt: Date;
    sessionId: string;
    summary: {
        totalElements: number;
        totalAttempts: number;
        overallSuccessRate: number;
        mostSuccessfulStrategy: string | null;
        mostFragileElements: FragileElement[];
    };
    strategyStatistics: Array<StrategyStatistics & { successRate: number }>;
    elementStatistics: Array<ElementStatistics & { stability: number }>;
    trends: HealingTrend[];
    recentFailures: HealingRecord[];
}

interface HealingRecommendation {
    elementId: string | null;
    severity: 'high' | 'medium' | 'low';
    type: string;
    message: string;
    suggestedAction: string;
}

interface FailurePattern {
    sameLocatorFailures: number;
    strategyFailures: Set<string>;
}

export { 
    HealingRecord, 
    HealingDetails, 
    FragileElement, 
    HealingReport, 
    HealingRecommendation,
    StrategyStatistics,
    ElementStatistics
};
