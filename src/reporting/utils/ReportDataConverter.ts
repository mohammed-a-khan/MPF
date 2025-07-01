// src/reporting/utils/ReportDataConverter.ts

import { 
    ReportData, 
    ExecutionResult, 
    FeatureReport,
    TestStatus
} from '../types/reporting.types';
import { ExecutionStatus } from '../../bdd/types/bdd.types';


export class ReportDataConverter {
    
    static toExecutionResult(reportData: ReportData): ExecutionResult {
        const summary = reportData.summary;
        const features = reportData.features || [];
        const scenarios = reportData.scenarios || [];
        
        let status: ExecutionStatus = ExecutionStatus.PASSED;
        if (summary.failedScenarios > 0) {
            status = ExecutionStatus.FAILED;
        } else if (summary.skippedScenarios === summary.totalScenarios) {
            status = ExecutionStatus.ABORTED;
        }
        
        const totalFeatures = summary.totalFeatures || features.length;
        const totalScenarios = summary.totalScenarios || scenarios.length;
        const totalSteps = summary.totalSteps || 0;
        
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
                browser: 'chrome',
                platform: process.platform || 'unknown',
                reportGenerated: new Date().toISOString()
            }
        };
        
        return executionResult;
    }
    
    private static convertFeatures(features: FeatureReport[]): FeatureReport[] {
        return features.map(feature => ({
            ...feature,
            featureId: feature.featureId || `feature-${Date.now()}-${Math.random()}`,
            feature: feature.feature || feature.name || 'Unknown Feature',
            scenarios: feature.scenarios || [],
            status: feature.status || this.determineFeatureStatus(feature),
            startTime: new Date(feature.startTime || Date.now()),
            endTime: new Date(feature.endTime || Date.now()),
            duration: feature.duration || 0,
            tags: feature.tags || []
        }));
    }
    
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
    
    private static countPassedFeatures(features: FeatureReport[]): number {
        return features.filter(f => 
            f.status === 'passed'
        ).length;
    }
    
    private static countFailedFeatures(features: FeatureReport[]): number {
        return features.filter(f => 
            f.status === 'failed'
        ).length;
    }
    
    private static countSkippedFeatures(features: FeatureReport[]): number {
        return features.filter(f => 
            f.status === 'skipped'
        ).length;
    }
    
    private static calculateDuration(reportData: ReportData): number {
        if (reportData.summary?.duration) {
            return reportData.summary.duration;
        }
        
        if (reportData.metadata?.startTime && reportData.metadata?.endTime) {
            const start = new Date(reportData.metadata.startTime).getTime();
            const end = new Date(reportData.metadata.endTime).getTime();
            return end - start;
        }
        
        if (reportData.features && reportData.features.length > 0) {
            return reportData.features.reduce((total, feature) => 
                total + (feature.duration || 0), 0
            );
        }
        
        return 0;
    }
    
    static canConvert(data: any): boolean {
        return data && 
               typeof data === 'object' && 
               (data.metadata || data.summary || data.features);
    }
}
