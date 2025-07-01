// src/bdd/runner/test-scheduler.types.ts

import { Scenario } from '../types/bdd.types';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export type ResourceRequirement = 'database' | 'api' | 'memory' | 'cpu' | 'network' | 'external';

export interface TestGroup {
    id: string;
    
    scenarios: Scenario[];
    
    parallel: boolean;
    
    maxWorkers: number;
    
    priority: PriorityLevel;
    
    resourceRequirements: ResourceRequirement[];
    
    estimatedDuration?: number;
}

export interface SchedulerExecutionPlan {
    id: string;
    
    createdAt: Date;
    
    groups: TestGroup[];
    
    estimates: {
        totalDuration: number;
        parallelDuration?: number;
        groups?: Array<{
            groupId: string;
            duration: number;
        }>;
    };
    
    metadata: {
        schedulingTime: number;
        strategy: string;
        parallelGroups: number;
    };
}
