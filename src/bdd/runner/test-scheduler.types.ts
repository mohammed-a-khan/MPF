// src/bdd/runner/test-scheduler.types.ts

import { Scenario } from '../types/bdd.types';

/**
 * Test execution priority levels
 */
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Resource requirements for test execution
 */
export type ResourceRequirement = 'database' | 'api' | 'memory' | 'cpu' | 'network' | 'external';

/**
 * Test group for execution
 */
export interface TestGroup {
    /** Group ID */
    id: string;
    
    /** Scenarios in this group */
    scenarios: Scenario[];
    
    /** Whether to run in parallel */
    parallel: boolean;
    
    /** Maximum workers for this group */
    maxWorkers: number;
    
    /** Group priority */
    priority: PriorityLevel;
    
    /** Resource requirements */
    resourceRequirements: ResourceRequirement[];
    
    /** Estimated duration */
    estimatedDuration?: number;
}

/**
 * Extended execution plan with scheduler-specific properties
 */
export interface SchedulerExecutionPlan {
    /** Plan ID */
    id: string;
    
    /** Creation timestamp */
    createdAt: Date;
    
    /** Test groups */
    groups: TestGroup[];
    
    /** Estimates */
    estimates: {
        totalDuration: number;
        parallelDuration?: number;
        groups?: Array<{
            groupId: string;
            duration: number;
        }>;
    };
    
    /** Scheduling metadata */
    metadata: {
        schedulingTime: number;
        strategy: string;
        parallelGroups: number;
    };
}