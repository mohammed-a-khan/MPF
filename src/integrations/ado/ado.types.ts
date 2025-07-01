// src/integrations/ado/ado.types.ts

export interface TestPoint {
    id: number;
    url: string;
    testCaseId: string;
    testCase: {
        id: string;
    };
    assignedTo?: {
        displayName: string;
        id: string;
    };
    automated: boolean;
    configuration?: {
        id: string;
        name: string;
    };
    lastTestRun?: {
        id: string;
    };
    lastResult?: {
        id: string;
    };
    outcome?: string;
    state?: string;
    lastResultState?: string;
    workItemProperties?: Array<{
        workItem: {
            key: string;
            value: string | null;
        };
    }>;
    lastResultDetails?: {
        duration?: number;
        dateCompleted?: string;
        runBy?: {
            displayName: string;
            id: string;
        };
    };
    lastRunBuildNumber?: string;
}

export interface ADOMetadata {
    testPlanId?: number;
    testSuiteId?: number;
    testCaseId?: string;
}

export interface TestRun {
    id: number;
    name: string;
    url: string;
    buildConfiguration: {
        id: number;
        number: string;
        platform: string;
    };
    startedDate: string;
    completedDate: string;
    state: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    notApplicableTests: number;
}

export interface TestResult {
    id: number;
    testRun: {
        id: number;
    };
    testCase: {
        id: number;
    };
    testPoint: {
        id: number;
    };
    outcome: string;
    state: string;
    startedDate: string;
    completedDate: string;
    duration: number;
    errorMessage?: string;
    stackTrace?: string;
    failureType?: string;
    testCaseTitle: string;
    priority: number;
    configuration: {
        id: string;
        name: string;
    };
}

export interface TestCaseResult {
    id: number;
    testCase: {
        id: number;
    };
    testRun: {
        id: number;
    };
    testPoint: {
        id: number;
    };
    outcome: string;
    state: string;
    comment: string;
    failureType: string;
    error: string;
    stackTrace: string;
    startedDate: string;
    completedDate: string;
    duration: number;
    associatedBugs: Array<{
        id: number;
        url: string;
    }>;
    attachments: Array<{
        id: string;
        url: string;
        name: string;
    }>;
}

export interface TestAttachment {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
    createdDate: string;
    modifiedDate: string;
    comment: string;
} 
