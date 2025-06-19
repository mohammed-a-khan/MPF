/**
 * TypeScript type definitions for hooks system
 * Provides complete type safety for all hook-related operations
 */

import { ExecutionContext } from '../context/ExecutionContext';
import { BDDContext } from '../context/BDDContext';
import { Step } from '../types/bdd.types';

/**
 * Hook types supported by the framework
 */
export type HookType = 'before' | 'after' | 'beforeStep' | 'afterStep';

/**
 * Hook function signatures
 */
export type BeforeHookFn = (context: ExecutionContext) => Promise<void> | void;
export type AfterHookFn = (context: ExecutionContext) => Promise<void> | void;
export type BeforeStepHookFn = (context: ExecutionContext, step: Step) => Promise<void> | void;
export type AfterStepHookFn = (context: ExecutionContext, step: Step) => Promise<void> | void;

export type HookFn = BeforeHookFn | AfterHookFn | BeforeStepHookFn | AfterStepHookFn;

/**
 * Hook definition interface
 */
export interface Hook {
  /** Hook type */
  type: HookType;
  
  /** Hook name for identification */
  name: string;
  
  /** Hook function */
  fn: HookFn;
  
  /** Execution order (lower numbers execute first) */
  order?: number;
  
  /** Tags to filter hook execution */
  tags?: string[];
  
  /** Timeout in milliseconds */
  timeout?: number;
  
  /** Run even if previous hooks failed */
  alwaysRun?: boolean;
  
  /** Hook metadata */
  metadata?: HookMetadata;
}

/**
 * Hook metadata for tracking and debugging
 */
export interface HookMetadata {
  /** File where hook was defined */
  file?: string;
  
  /** Line number where hook was defined */
  line?: number;
  
  /** Hook description */
  description?: string;
  
  /** Hook author */
  author?: string;
  
  /** Creation timestamp */
  createdAt?: Date;
  
  /** Last modified timestamp */
  modifiedAt?: Date;
  
  /** Custom properties */
  [key: string]: any;
}

/**
 * Hook execution result
 */
export interface HookResult {
  /** Hook that was executed */
  hook: Hook;
  
  /** Execution status */
  status: 'passed' | 'failed' | 'skipped';
  
  /** Execution duration in milliseconds */
  duration: number;
  
  /** Error if hook failed */
  error?: Error;
  
  /** Execution timestamp */
  timestamp?: Date;
  
  /** Any data returned by hook */
  data?: any;
}

/**
 * Hook error class
 */
export class HookError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly hook?: Hook,
    public readonly context?: ExecutionContext
  ) {
    super(message);
    this.name = 'HookError';
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HookError);
    }
  }

  /**
   * Get detailed error information
   */
  getDetails(): HookErrorDetails {
    let feature: string | undefined;
    let scenario: string | undefined;
    let step: string | undefined;

    try {
      // Try to get BDD context information
      const bddContext = BDDContext.getInstance();
      
      // Get feature information
      const featureContext = bddContext.getFeatureContext();
      if (featureContext) {
        feature = featureContext.getFeature()?.name;
      }
      
      // Get scenario information
      const scenarioContext = bddContext.getScenarioContext();
      if (scenarioContext) {
        scenario = scenarioContext.getScenario()?.name;
      }
      
      // Get step information from execution context metadata
      if (this.context) {
        const currentStep = this.context.getMetadata('currentStep');
        if (currentStep) {
          step = currentStep.text || currentStep.keyword + ' ' + (currentStep.name || '');
        }
      }
    } catch (error) {
      // BDD context might not be available, ignore and use defaults
    }

    const context: {
      feature?: string;
      scenario?: string;
      step?: string;
    } = {};
    
    // Only add properties if they have values
    if (feature !== undefined) {
      context.feature = feature;
    }
    if (scenario !== undefined) {
      context.scenario = scenario;
    }
    if (step !== undefined) {
      context.step = step;
    }

    const details: HookErrorDetails = {
      message: this.message,
      context
    };

    // Only add optional properties if they exist
    if (this.hook?.name) {
      details.hookName = this.hook.name;
    }
    if (this.hook?.type) {
      details.hookType = this.hook.type;
    }
    if (this.cause?.message) {
      details.cause = this.cause.message;
    }
    if (this.stack) {
      details.stack = this.stack;
    }

    return details;
  }
}

/**
 * Hook error details
 */
export interface HookErrorDetails {
  message: string;
  hookName?: string;
  hookType?: HookType;
  cause?: string;
  stack?: string;
  context: {
    feature?: string;
    scenario?: string;
    step?: string;
  };
}

/**
 * Hook registration options
 */
export interface HookRegistrationOptions {
  /** Override existing hook with same name */
  override?: boolean;
  
  /** Validate hook configuration */
  validate?: boolean;
  
  /** Auto-generate name if not provided */
  autoName?: boolean;
  
  /** Default timeout if not specified */
  defaultTimeout?: number;
}

/**
 * Hook filter options
 */
export interface HookFilterOptions {
  /** Filter by hook type */
  type?: HookType;
  
  /** Filter by tags */
  tags?: string[];
  
  /** Filter by name pattern */
  namePattern?: string | RegExp;
  
  /** Include disabled hooks */
  includeDisabled?: boolean;
}

/**
 * Hook execution options
 */
export interface HookExecutionOptions {
  /** Continue execution on failure */
  continueOnFailure?: boolean;
  
  /** Parallel execution for independent hooks */
  parallel?: boolean;
  
  /** Maximum parallel executions */
  maxParallel?: number;
  
  /** Retry failed hooks */
  retry?: number;
  
  /** Retry delay in milliseconds */
  retryDelay?: number;
  
  /** Dry run without execution */
  dryRun?: boolean;
}

/**
 * Hook statistics
 */
export interface HookStatistics {
  /** Total number of executions */
  totalExecutions: number;
  
  /** Number of successful executions */
  successfulExecutions: number;
  
  /** Number of failed executions */
  failedExecutions: number;
  
  /** Number of skipped executions */
  skippedExecutions: number;
  
  /** Average execution duration */
  averageDuration: number;
  
  /** Minimum execution duration */
  minDuration: number;
  
  /** Maximum execution duration */
  maxDuration: number;
  
  /** Total execution duration */
  totalDuration: number;
  
  /** Last execution timestamp */
  lastExecution?: Date;
  
  /** Failure rate percentage */
  failureRate: number;
}

/**
 * Hook lifecycle events
 */
export interface HookLifecycleEvents {
  /** Called before hook execution */
  onBeforeExecute?: (hook: Hook, context: ExecutionContext) => void;
  
  /** Called after successful execution */
  onSuccess?: (hook: Hook, result: HookResult) => void;
  
  /** Called after failed execution */
  onFailure?: (hook: Hook, error: Error) => void;
  
  /** Called after any execution */
  onAfterExecute?: (hook: Hook, result: HookResult) => void;
  
  /** Called when hook is skipped */
  onSkip?: (hook: Hook, reason: string) => void;
}

/**
 * Hook condition for conditional execution
 */
export interface HookCondition {
  /** Condition name */
  name: string;
  
  /** Condition evaluation function */
  evaluate: (context: ExecutionContext) => boolean | Promise<boolean>;
  
  /** Skip reason if condition fails */
  skipReason?: string;
}

/**
 * Hook group for organizing related hooks
 */
export interface HookGroup {
  /** Group name */
  name: string;
  
  /** Group description */
  description?: string;
  
  /** Hooks in the group */
  hooks: Hook[];
  
  /** Group-level tags */
  tags?: string[];
  
  /** Group-level timeout */
  timeout?: number;
  
  /** Group execution order */
  order?: number;
}

/**
 * Hook configuration
 */
export interface HookConfiguration {
  /** Enable/disable all hooks */
  enabled: boolean;
  
  /** Default timeout for all hooks */
  defaultTimeout: number;
  
  /** Continue on failure by default */
  continueOnFailure: boolean;
  
  /** Enable hook statistics */
  enableStatistics: boolean;
  
  /** Enable hook lifecycle events */
  enableLifecycleEvents: boolean;
  
  /** Maximum retry attempts */
  maxRetries: number;
  
  /** Retry delay */
  retryDelay: number;
  
  /** Hook execution order strategy */
  orderStrategy: 'sequential' | 'parallel' | 'smart';
}

/**
 * Hook validation result
 */
export interface HookValidationResult {
  /** Validation status */
  valid: boolean;
  
  /** Validation errors */
  errors: HookValidationError[];
  
  /** Validation warnings */
  warnings: HookValidationWarning[];
}

/**
 * Hook validation error
 */
export interface HookValidationError {
  /** Error code */
  code: string;
  
  /** Error message */
  message: string;
  
  /** Hook that caused the error */
  hook: Hook;
  
  /** Error severity */
  severity: 'error' | 'critical';
}

/**
 * Hook validation warning
 */
export interface HookValidationWarning {
  /** Warning code */
  code: string;
  
  /** Warning message */
  message: string;
  
  /** Hook that caused the warning */
  hook: Hook;
  
  /** Warning type */
  type: 'performance' | 'compatibility' | 'best-practice';
}

/**
 * Hook execution context
 */
export interface HookExecutionContext {
  /** Current hook being executed */
  currentHook: Hook;
  
  /** Execution start time */
  startTime: number;
  
  /** Execution attempt number */
  attempt: number;
  
  /** Maximum attempts */
  maxAttempts: number;
  
  /** Previous execution results */
  previousResults: HookResult[];
  
  /** Execution metadata */
  metadata: Record<string, any>;
}

/**
 * Hook registry events
 */
export interface HookRegistryEvents {
  /** Called when hook is registered */
  onRegister?: (hook: Hook) => void;
  
  /** Called when hook is unregistered */
  onUnregister?: (hook: Hook) => void;
  
  /** Called when registry is cleared */
  onClear?: () => void;
  
  /** Called when registry is exported */
  onExport?: () => void;
}

/**
 * Hook execution policy
 */
export interface HookExecutionPolicy {
  /** Policy name */
  name: string;
  
  /** Check if hook should be executed */
  shouldExecute: (hook: Hook, context: ExecutionContext) => boolean;
  
  /** Get execution timeout */
  getTimeout: (hook: Hook) => number;
  
  /** Get retry configuration */
  getRetryConfig: (hook: Hook) => { maxRetries: number; delay: number };
  
  /** Handle execution failure */
  handleFailure: (hook: Hook, error: Error) => 'retry' | 'skip' | 'fail';
}

/**
 * Type guards for hook types
 */
export const HookTypeGuards = {
  isBeforeHook: (hook: Hook): hook is Hook & { fn: BeforeHookFn } => {
    return hook.type === 'before';
  },
  
  isAfterHook: (hook: Hook): hook is Hook & { fn: AfterHookFn } => {
    return hook.type === 'after';
  },
  
  isBeforeStepHook: (hook: Hook): hook is Hook & { fn: BeforeStepHookFn } => {
    return hook.type === 'beforeStep';
  },
  
  isAfterStepHook: (hook: Hook): hook is Hook & { fn: AfterStepHookFn } => {
    return hook.type === 'afterStep';
  }
};

/**
 * Hook priority levels
 */
export enum HookPriority {
  CRITICAL = 1,
  HIGH = 10,
  NORMAL = 50,
  LOW = 100,
  CLEANUP = 200
}

/**
 * Hook execution phases
 */
export enum HookPhase {
  INITIALIZATION = 'initialization',
  SETUP = 'setup',
  EXECUTION = 'execution',
  VALIDATION = 'validation',
  CLEANUP = 'cleanup',
  FINALIZATION = 'finalization'
}

/**
 * Hook status codes
 */
export enum HookStatusCode {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  TIMEOUT = 'TIMEOUT',
  SKIPPED = 'SKIPPED',
  RETRY = 'RETRY',
  CANCELLED = 'CANCELLED'
}