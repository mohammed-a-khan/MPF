// src/reporting/utils/ReportDataConverter.ts

import { 
    ReportData, 
    ExecutionResult, 
    FeatureReport,
    TestStatus
} from '../types/reporting.types';
import { ExecutionStatus } from '../../bdd/types/bdd.types';


/**
 * Utility class to convert between different report data formats
 */
export class ReportDataConverter {
    
    /**
     * Convert ReportData to ExecutionResult format expected by ExcelExporter
     */
    static toExecutionResult(reportData: ReportData): ExecutionResult {
        const summary = reportData.summary;
        const features = reportData.features || [];
        const scenarios = reportData.scenarios || [];
        
        // Determine overall execution status
        let status: ExecutionStatus = ExecutionStatus.PASSED;
        if (summary.failedScenarios > 0) {
            status = ExecutionStatus.FAILED;
        } else if (summary.skippedScenarios === summary.totalScenarios) {
            status = ExecutionStatus.ABORTED;
        }
        
        // Calculate total counts from features if not in summary
        const totalFeatures = summary.totalFeatures || features.length;
        const totalScenarios = summary.totalScenarios || scenarios.length;
        const totalSteps = summary.totalSteps || 0;
        
        // Build ExecutionResult
        const executionResult: ExecutionResult = {
            executionId: reportData.metadata?.executionId || `exec-${Date.now()}`,
            startTime: new Date(reportData.metadata?.startTime || reportData.metadata?.executionDate || Date.now()),
            endTime: new Date(reportData.metadata?.endTime || Date.now()),
            status: status,
            environment: reportData.environment || reportData.metadata?.environment || 'unknown',
            features: this.convertFeatures(features),
            scenarios: scenarios,
            totalFeatures: totalFeatures,
            totalScenarios: totalScenarios,
            totalSteps: totalSteps,
            passedFeatures: summary.passedFeatures || this.countPassedFeatures(features),
            passedScenarios: summary.passedScenarios || 0,
            passedSteps: summary.passedSteps || 0,
            failedFeatures: summary.failedFeatures || this.countFailedFeatures(features),
            failedScenarios: summary.failedScenarios || 0,
            failedSteps: summary.failedSteps || 0,
            skippedFeatures: summary.skippedFeatures || this.countSkippedFeatures(features),
            skippedScenarios: summary.skippedScenarios || 0,
            skippedSteps: summary.skippedSteps || 0,
            duration: summary.duration || this.calculateDuration(reportData),
            tags: reportData.tags || [],
            metadata: {
                ...reportData.metadata,
                browser: 'chrome', // Default browser since ReportConfiguration doesn't include browser info
                platform: process.platform || 'unknown',
                reportGenerated: new Date().toISOString()
            }
        };
        
        return executionResult;
    }
    
    /**
     * Convert features to ensure they have the required structure
     */
    private static convertFeatures(features: FeatureReport[]): FeatureReport[] {
        return features.map(feature => ({
            ...feature,
            // Ensure all required fields are present
            featureId: feature.featureId || `feature-${Date.now()}-${Math.random()}`,
            feature: feature.feature || feature.name || 'Unknown Feature',
            scenarios: feature.scenarios || [],
            status: feature.status || this.determineFeatureStatus(feature),
            startTime: feature.startTime || Date.now(),
            endTime: feature.endTime || Date.now(),
            duration: feature.duration || 0,
            tags: feature.tags || []
        }));
    }
    
    /**
     * Determine feature status from its scenarios
     */
    private static determineFeatureStatus(feature: FeatureReport): TestStatus {
        if (!feature.scenarios || feature.scenarios.length === 0) {
            return TestStatus.SKIPPED;
        }
        
        const hasFailedScenario = feature.scenarios.some(s => 
            s.status === 'failed'
        );
        
        if (hasFailedScenario) {
            return TestStatus.FAILED;
        }
        
        const allPassed = feature.scenarios.every(s => 
            s.status === 'passed'
        );
        
        if (allPassed) {
            return TestStatus.PASSED;
        }
        
        return TestStatus.SKIPPED;
    }
    
    /**
     * Count passed features
     */
    private static countPassedFeatures(features: FeatureReport[]): number {
        return features.filter(f => 
            f.status === 'passed'
        ).length;
    }
    
    /**
     * Count failed features
     */
    private static countFailedFeatures(features: FeatureReport[]): number {
        return features.filter(f => 
            f.status === 'failed'
        ).length;
    }
    
    /**
     * Count skipped features
     */
    private static countSkippedFeatures(features: FeatureReport[]): number {
        return features.filter(f => 
            f.status === 'skipped'
        ).length;
    }
    
    /**
     * Calculate total duration from report data
     */
    private static calculateDuration(reportData: ReportData): number {
        // Try to get duration from different sources
        if (reportData.summary?.duration) {
            return reportData.summary.duration;
        }
        
        if (reportData.metadata?.startTime && reportData.metadata?.endTime) {
            const start = new Date(reportData.metadata.startTime).getTime();
            const end = new Date(reportData.metadata.endTime).getTime();
            return end - start;
        }
        
        // Calculate from features
        if (reportData.features && reportData.features.length > 0) {
            return reportData.features.reduce((total, feature) => 
                total + (feature.duration || 0), 0
            );
        }
        
        return 0;
    }
    
    /**
     * Validate if data can be converted
     */
    static canConvert(data: any): boolean {
        return data && 
               typeof data === 'object' && 
               (data.metadata || data.summary || data.features);
    }
}