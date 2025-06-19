import { 
    ExecutionResult, 
    EvidenceCollection, 
    AggregatedData, 
    ExecutionSummary,
    ReportMetrics,
    TrendData,
    ExecutionStatistics,
    TestStatus,
    ExecutionHistory,
    HookType
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';

/**
 * Aggregates test execution results for reporting
 */
export class ReportAggregator {
    private logger: Logger;
    private aggregationCache: Map<string, any> = new Map();

    constructor() {
        this.logger = Logger.getInstance('ReportAggregator');
    }

    /**
     * Initialize the aggregator
     */
    public async initialize(): Promise<void> {
        this.aggregationCache.clear();
        this.logger.info('Report aggregator initialized');
    }

    /**
     * Aggregate execution results and evidence
     */
    public async aggregate(executionResult: ExecutionResult, evidence: EvidenceCollection): Promise<AggregatedData> {
        try {
            this.logger.info('Starting result aggregation');
            const startTime = Date.now();

            // Create execution summary
            const executionSummary = await this.createExecutionSummary(executionResult);
            
            // Create report metrics
            const reportMetrics = await this.createReportMetrics(executionResult, evidence);

            // Calculate trends if historical data available
            const trends = await this.calculateTrends(executionResult);

            // Build aggregated data according to the interface
            const aggregatedData: AggregatedData = {
                executionResult,
                evidence,
                summary: executionSummary,
                metrics: reportMetrics,
                ...(trends && { trends }),
                metadata: {
                    aggregationDuration: Date.now() - startTime,
                    aggregationTimestamp: new Date().toISOString()
                }
            };

            // Cache the aggregated data
            this.aggregationCache.set(executionResult.executionId, aggregatedData);

            this.logger.info(`Aggregation completed in ${Date.now() - startTime}ms`);
            return aggregatedData;

        } catch (error: any) {
            this.logger.error('Aggregation failed', error);
            throw error;
        }
    }

    /**
     * Create execution summary
     */
    private async createExecutionSummary(executionResult: ExecutionResult): Promise<ExecutionSummary> {
        // Count scenarios from the executionResult directly
        const totalScenarios = executionResult.totalScenarios;
        const passedScenarios = executionResult.passedScenarios;
        const failedScenarios = executionResult.failedScenarios;
        const skippedScenarios = executionResult.skippedScenarios;
        const totalSteps = executionResult.totalSteps;
        const passedSteps = executionResult.passedSteps;
        const failedSteps = executionResult.failedSteps;
        const skippedSteps = executionResult.skippedSteps;
        const totalDuration = executionResult.duration;
        
        // Calculate metrics from scenarios
        let pendingSteps = 0;
        let totalRetries = 0;
        let scenariosWithRetries = 0;
        let setupDuration = 0;
        let teardownDuration = 0;
        
        for (const scenario of executionResult.scenarios) {
            // Count pending steps
            for (const step of scenario.steps) {
                if (step.status === TestStatus.PENDING) pendingSteps++;
            }
            
            // Count retries
            if (scenario.retryCount > 0) {
                totalRetries += scenario.retryCount;
                scenariosWithRetries++;
            }
            
            // Calculate hook durations
            if (scenario.hooks) {
                for (const hook of scenario.hooks) {
                    if (hook.type === HookType.BEFORE || hook.type === HookType.BEFORE_STEP) {
                        setupDuration += hook.duration || 0;
                    } else if (hook.type === HookType.AFTER || hook.type === HookType.AFTER_STEP) {
                        teardownDuration += hook.duration || 0;
                    }
                }
            }
        }

        const passRate = totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0;
        const failureRate = totalScenarios > 0 ? (failedScenarios / totalScenarios) * 100 : 0;

        // Create execution statistics
        const statistics: ExecutionStatistics = {
            avgScenarioDuration: totalScenarios > 0 ? totalDuration / totalScenarios : 0,
            avgStepDuration: totalSteps > 0 ? totalDuration / totalSteps : 0,
            fastestScenario: { scenarioId: '', name: '', duration: 0, feature: '' },
            slowestScenario: { scenarioId: '', name: '', duration: 0, feature: '' },
            mostFailedFeature: '',
            mostStableFeature: '',
            flakyTests: []
        };

        // Find fastest and slowest scenarios
        let fastestDuration = Infinity;
        let slowestDuration = 0;
        for (const scenario of executionResult.scenarios) {
            if (scenario.duration < fastestDuration) {
                fastestDuration = scenario.duration;
                statistics.fastestScenario = {
                    scenarioId: scenario.scenarioId,
                    name: scenario.scenario,
                    duration: scenario.duration,
                    feature: scenario.feature
                };
            }
            if (scenario.duration > slowestDuration) {
                slowestDuration = scenario.duration;
                statistics.slowestScenario = {
                    scenarioId: scenario.scenarioId,
                    name: scenario.scenario,
                    duration: scenario.duration,
                    feature: scenario.feature
                };
            }
        }

        // Find most failed and most stable features
        const featureStats = new Map<string, { passed: number; failed: number; total: number }>();
        for (const scenario of executionResult.scenarios) {
            const stats = featureStats.get(scenario.feature) || { passed: 0, failed: 0, total: 0 };
            stats.total++;
            if (scenario.status === TestStatus.PASSED) stats.passed++;
            else if (scenario.status === TestStatus.FAILED) stats.failed++;
            featureStats.set(scenario.feature, stats);
        }

        let mostFailures = 0;
        let mostStable = 100;
        featureStats.forEach((stats, feature) => {
            const failureRate = (stats.failed / stats.total) * 100;
            if (stats.failed > mostFailures) {
                mostFailures = stats.failed;
                statistics.mostFailedFeature = feature;
            }
            if (failureRate < mostStable && stats.total > 1) {
                mostStable = failureRate;
                statistics.mostStableFeature = feature;
            }
        });

        return {
            totalFeatures: executionResult.totalFeatures,
            passedFeatures: executionResult.passedFeatures,
            failedFeatures: executionResult.failedFeatures,
            skippedFeatures: executionResult.skippedFeatures,
            totalScenarios,
            passedScenarios,
            failedScenarios,
            skippedScenarios,
            totalSteps,
            passedSteps,
            failedSteps,
            skippedSteps,
            pendingSteps,
            executionTime: totalDuration,
            parallelWorkers: executionResult.metadata && executionResult.metadata['workers'] ? executionResult.metadata['workers'] : 1,
            retryCount: totalRetries,
            passRate,
            failureRate,
            status: executionResult.status,
            trends: { // Will be filled by calculateTrends
                passRateTrend: 0,
                executionTimeTrend: 0,
                failureRateTrend: 0,
                lastExecutions: []
            },
            statistics,
            scenarios: executionResult.scenarios.map(scenario => ({
                scenarioId: scenario.scenarioId,
                name: scenario.scenario,
                status: scenario.status,
                duration: scenario.duration || 0,
                retryCount: scenario.retryCount || 0,
                feature: scenario.feature,
                tags: scenario.tags || [],
                stepCount: scenario.steps?.length || 0,
                passedSteps: scenario.steps?.filter(s => s.status === 'passed').length || 0,
                failedSteps: scenario.steps?.filter(s => s.status === 'failed').length || 0
            })),
            features: [],
            environment: executionResult.metadata?.['environment'] || 'default'
        };
    }

    /**
     * Create report metrics
     */
    private async createReportMetrics(executionResult: ExecutionResult, evidence: EvidenceCollection): Promise<ReportMetrics> {
        // Calculate hook durations and other metrics
        let setupDuration = 0;
        let teardownDuration = 0;
        let totalRetries = 0;
        let scenariosWithRetries = 0;
        let firstFailureTime: number | undefined;
        let firstFailureFound = false;
        
        for (const scenario of executionResult.scenarios) {
            // Calculate hook durations
            if (scenario.hooks) {
                for (const hook of scenario.hooks) {
                    if (hook.type === HookType.BEFORE || hook.type === HookType.BEFORE_STEP) {
                        setupDuration += hook.duration || 0;
                    } else if (hook.type === HookType.AFTER || hook.type === HookType.AFTER_STEP) {
                        teardownDuration += hook.duration || 0;
                    }
                }
            }
            
            // Count retries
            if (scenario.retryCount > 0) {
                totalRetries += scenario.retryCount;
                scenariosWithRetries++;
            }
            
            // Find time to first failure
            if (!firstFailureFound && scenario.status === TestStatus.FAILED) {
                firstFailureFound = true;
                const scenarioElapsedTime = scenario.endTime.getTime() - executionResult.startTime.getTime();
                firstFailureTime = scenarioElapsedTime;
            }
        }
        
        // Calculate parallel efficiency based on execution time vs theoretical sequential time
        const theoreticalSequentialTime = executionResult.scenarios.reduce((sum, s) => sum + s.duration, 0);
        const parallelWorkers = executionResult.metadata?.['workers'] || 1;
        const theoreticalParallelTime = theoreticalSequentialTime / parallelWorkers;
        const parallelEfficiency = theoreticalParallelTime > 0 ? 
            Math.min(1.0, theoreticalParallelTime / executionResult.duration) : 1.0;
        
        const retryRate = executionResult.totalScenarios > 0 ? 
            (scenariosWithRetries / executionResult.totalScenarios) * 100 : 0;
        
        // Calculate execution metrics
        const executionMetrics = {
            totalDuration: executionResult.duration,
            setupDuration,
            testDuration: executionResult.duration - setupDuration - teardownDuration,
            teardownDuration,
            avgScenarioDuration: executionResult.totalScenarios > 0 ? executionResult.duration / executionResult.totalScenarios : 0,
            avgStepDuration: executionResult.totalSteps > 0 ? executionResult.duration / executionResult.totalSteps : 0,
            parallelEfficiency,
            queueTime: 0,
            retryRate,
            timeToFirstFailure: firstFailureTime
        };

        // Calculate browser metrics
        const browserMetrics = {
            pageLoadTime: 0,
            domContentLoaded: 0,
            firstPaint: 0,
            firstContentfulPaint: 0,
            largestContentfulPaint: 0,
            firstInputDelay: 0,
            timeToInteractive: 0,
            totalBlockingTime: 0,
            cumulativeLayoutShift: 0,
            memoryUsage: {
                usedJSHeapSize: 0,
                totalJSHeapSize: 0,
                jsHeapSizeLimit: 0
            },
            consoleErrors: 0,
            consoleWarnings: 0
        };

        // Calculate network metrics from evidence
        let totalRequests = 0;
        let failedRequests = 0;
        let totalDataTransferred = 0;
        let avgResponseTime = 0;

        if (evidence.networkLogs) {
            totalRequests = evidence.networkLogs.length;
            failedRequests = evidence.networkLogs.filter(log => log.status >= 400).length;
            
            const responseTimes = evidence.networkLogs.map(log => log.duration);
            if (responseTimes.length > 0) {
                avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            }
            
            totalDataTransferred = evidence.networkLogs.reduce((sum, log) => sum + log.responseSize + log.requestSize, 0);
        }

        const networkMetrics = {
            totalRequests,
            failedRequests,
            cachedRequests: 0,
            avgResponseTime,
            totalDataTransferred,
            totalDataSent: 0,
            totalDataReceived: totalDataTransferred,
            slowestRequest: {
                requestId: '',
                url: '',
                method: 'GET',
                status: 0,
                responseTime: 0,
                size: 0,
                type: '',
                startTime: new Date(),
                endTime: new Date(),
                headers: {},
                timing: {
                    dns: 0,
                    connect: 0,
                    ssl: 0,
                    send: 0,
                    wait: 0,
                    receive: 0,
                    total: 0
                }
            },
            cacheHitRate: 0,
            requestsByType: {},
            requestsByDomain: {},
            // Additional required properties
            successfulRequests: totalRequests - failedRequests,
            totalBytesTransferred: totalDataTransferred,
            totalTime: avgResponseTime * totalRequests,
            averageResponseTime: avgResponseTime,
            thirdPartyRequests: 0,
            resourceTypes: {},
            protocols: {},
            domains: {},
            thirdPartyCategories: {},
            pageUrl: ''
        };

        // Calculate system metrics
        const systemMetrics = {
            cpuUsage: 0,
            memoryUsage: 0,
            diskIO: 0,
            networkLatency: 0,
            processCount: 1
        };

        const executionMetricsResult: any = {
            totalDuration: executionMetrics.totalDuration,
            setupDuration: executionMetrics.setupDuration,
            testDuration: executionMetrics.testDuration,
            teardownDuration: executionMetrics.teardownDuration,
            avgScenarioDuration: executionMetrics.avgScenarioDuration,
            avgStepDuration: executionMetrics.avgStepDuration,
            parallelEfficiency: executionMetrics.parallelEfficiency,
            queueTime: executionMetrics.queueTime,
            retryRate: executionMetrics.retryRate
        };
        
        if (executionMetrics.timeToFirstFailure !== undefined) {
            executionMetricsResult.timeToFirstFailure = executionMetrics.timeToFirstFailure;
        }

        return {
            execution: executionMetricsResult,
            browser: browserMetrics,
            network: networkMetrics,
            system: systemMetrics
        };
    }

    /**
     * Calculate trends from historical data
     */
    private async calculateTrends(executionResult: ExecutionResult): Promise<TrendData | undefined> {
        try {
            // Get historical data from cache or storage
            const historicalData = await this.getHistoricalData(executionResult.executionId);
            
            if (!historicalData || historicalData.length < 2) {
                // Not enough data for trends
                return {
                    passRateTrend: 0,
                    executionTimeTrend: 0,
                    failureRateTrend: 0,
                    lastExecutions: historicalData || []
                };
            }
            
            // Get current metrics
            const currentPassRate = executionResult.totalScenarios > 0 ? 
                (executionResult.passedScenarios / executionResult.totalScenarios) * 100 : 0;
            const currentFailureRate = executionResult.totalScenarios > 0 ? 
                (executionResult.failedScenarios / executionResult.totalScenarios) * 100 : 0;
            const currentExecutionTime = executionResult.duration;
            
            // Calculate trends from last n executions
            const recentExecutions = historicalData.slice(-5); // Last 5 executions
            const avgPassRate = recentExecutions.reduce((sum, exec) => sum + exec.passRate, 0) / recentExecutions.length;
            const avgFailureRate = recentExecutions.reduce((sum, exec) => sum + exec.failureRate, 0) / recentExecutions.length;
            const avgExecutionTime = recentExecutions.reduce((sum, exec) => sum + exec.duration, 0) / recentExecutions.length;
            
            // Calculate percentage changes
            const passRateTrend = avgPassRate > 0 ? ((currentPassRate - avgPassRate) / avgPassRate) * 100 : 0;
            const failureRateTrend = avgFailureRate > 0 ? ((currentFailureRate - avgFailureRate) / avgFailureRate) * 100 : 0;
            const executionTimeTrend = avgExecutionTime > 0 ? ((currentExecutionTime - avgExecutionTime) / avgExecutionTime) * 100 : 0;
            
            // Add current execution to history
            const currentExecution: ExecutionHistory = {
                executionId: executionResult.executionId,
                date: executionResult.endTime,
                passRate: currentPassRate,
                failureRate: currentFailureRate,
                duration: currentExecutionTime,
                totalTests: executionResult.totalScenarios,
                environment: executionResult.environment
            };
            
            return {
                passRateTrend: {
                    data: recentExecutions.map(e => e.passRate).concat(currentPassRate),
                    change: passRateTrend,
                    direction: passRateTrend > 0 ? 'up' : passRateTrend < 0 ? 'down' : 'stable'
                },
                executionTimeTrend: {
                    data: recentExecutions.map(e => e.duration).concat(currentExecutionTime),
                    change: executionTimeTrend,
                    direction: executionTimeTrend > 0 ? 'up' : executionTimeTrend < 0 ? 'down' : 'stable'
                },
                failureRateTrend: {
                    data: recentExecutions.map(e => e.failureRate).concat(currentFailureRate),
                    change: failureRateTrend,
                    direction: failureRateTrend > 0 ? 'up' : failureRateTrend < 0 ? 'down' : 'stable'
                },
                lastExecutions: [...historicalData, currentExecution].slice(-10), // Keep last 10
                stabilityTrend: {
                    data: recentExecutions.map(e => 100 - e.failureRate).concat(100 - currentFailureRate),
                    change: -failureRateTrend, // Inverse of failure rate trend
                    direction: failureRateTrend < 0 ? 'up' : failureRateTrend > 0 ? 'down' : 'stable'
                },
                historicalComparison: this.createHistoricalComparison(currentExecution, recentExecutions[recentExecutions.length - 1])
            };
        } catch (error) {
            this.logger.warn('Failed to calculate trends', error as Error);
            return {
                passRateTrend: 0,
                executionTimeTrend: 0,
                failureRateTrend: 0,
                lastExecutions: []
            };
        }
    }
    
    /**
     * Get historical execution data
     */
    private async getHistoricalData(currentExecutionId: string): Promise<ExecutionHistory[]> {
        // Check cache first
        const cacheKey = `historical_data_${currentExecutionId}`;
        const cached = this.aggregationCache.get(cacheKey);
        if (cached) {
            return cached as ExecutionHistory[];
        }
        
        // In a real implementation, this would fetch from a database or file storage
        // For now, we'll simulate with some data
        const historicalData: ExecutionHistory[] = [];
        
        // Store in cache
        this.aggregationCache.set(cacheKey, historicalData);
        
        return historicalData;
    }
    
    /**
     * Create historical comparison data
     */
    private createHistoricalComparison(current: ExecutionHistory, previous?: ExecutionHistory): Array<{
        metric: string;
        current: string;
        previous: string;
        change: number;
    }> {
        if (!previous) {
            return [];
        }
        
        return [
            {
                metric: 'Pass Rate',
                current: `${current.passRate.toFixed(1)}%`,
                previous: `${previous.passRate.toFixed(1)}%`,
                change: current.passRate - previous.passRate
            },
            {
                metric: 'Execution Time',
                current: this.formatDuration(current.duration),
                previous: this.formatDuration(previous.duration),
                change: ((current.duration - previous.duration) / previous.duration) * 100
            },
            {
                metric: 'Total Tests',
                current: current.totalTests.toString(),
                previous: previous.totalTests.toString(),
                change: ((current.totalTests - previous.totalTests) / previous.totalTests) * 100
            },
            {
                metric: 'Failure Rate',
                current: `${current.failureRate.toFixed(1)}%`,
                previous: `${previous.failureRate.toFixed(1)}%`,
                change: current.failureRate - previous.failureRate
            }
        ];
    }
    
    /**
     * Format duration for display
     */
    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Get cached aggregation
     */
    public getCachedAggregation(executionId: string): AggregatedData | undefined {
        return this.aggregationCache.get(executionId);
    }

    /**
     * Clear cache
     */
    public clearCache(): void {
        this.aggregationCache.clear();
        this.logger.info('Aggregation cache cleared');
    }
}