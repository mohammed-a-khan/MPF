// src/bdd/base/StepContext.ts

import { Step, StepResult, StepStatus, ExecutionError } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Step-level execution context
 * Provides information about the currently executing step
 */
export class StepContext {
  private readonly step: Step;
  private readonly scenarioId: string;
  private readonly featureName: string;
  private readonly startTime: Date;
  private endTime?: Date;
  private status: StepStatus = StepStatus.PENDING;
  private error?: Error;
  private attachments: Map<string, any>;
  private logs: string[];
  private metadata: Map<string, any>;
  private readonly logger: Logger;
  private readonly id: string;

  constructor(
    step: Step,
    scenarioId: string,
    featureName: string
  ) {
    this.step = step;
    this.scenarioId = scenarioId;
    this.featureName = featureName;
    this.startTime = new Date();
    this.attachments = new Map();
    this.logs = [];
    this.metadata = new Map();
    this.logger = Logger.getInstance('StepContext');
    this.id = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get step information
   */
  public getStep(): Step {
    return this.step;
  }

  /**
   * Get step text
   */
  public getStepText(): string {
    return this.step.text;
  }

  /**
   * Get step keyword
   */
  public getKeyword(): string {
    return this.step.keyword;
  }

  /**
   * Get scenario ID
   */
  public getScenarioId(): string {
    return this.scenarioId;
  }

  /**
   * Get feature name
   */
  public getFeatureName(): string {
    return this.featureName;
  }

  /**
   * Get step location
   */
  public getLocation(): string {
    return `${this.featureName}:${this.step.line}`;
  }

  /**
   * Get start time
   */
  public getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Get end time
   */
  public getEndTime(): Date | undefined {
    return this.endTime;
  }

  /**
   * Get duration in milliseconds
   */
  public getDuration(): number {
    if (!this.endTime) {
      return Date.now() - this.startTime.getTime();
    }
    return this.endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Get status
   */
  public getStatus(): StepStatus {
    return this.status;
  }

  /**
   * Get error
   */
  public getError(): Error | undefined {
    return this.error;
  }

  /**
   * Mark step as started
   */
  public markStarted(): void {
    this.status = StepStatus.RUNNING;
    ActionLogger.logStepStart(this.getStepText(), this.getLocation());
  }

  /**
   * Mark step as passed
   */
  public markPassed(): void {
    this.endTime = new Date();
    this.status = StepStatus.PASSED;
    
    ActionLogger.logStepPass(
      this.getStepText(),
      this.getDuration()
    );
  }

  /**
   * Mark step as failed
   */
  public markFailed(error: Error): void {
    this.endTime = new Date();
    this.status = StepStatus.FAILED;
    this.error = error;
    
    ActionLogger.logStepFail(
      this.getStepText(),
      error,
      this.getDuration()
    );
  }

  /**
   * Mark step as skipped
   */
  public markSkipped(): void {
    this.endTime = new Date();
    this.status = StepStatus.SKIPPED;
    
    ActionLogger.logStepSkip(this.getStepText());
  }

  /**
   * Mark step as pending
   */
  public markPending(): void {
    this.endTime = new Date();
    this.status = StepStatus.PENDING;
    
    ActionLogger.logStepPending(this.getStepText());
  }

  /**
   * Add attachment
   */
  public attach(
    data: any,
    mediaType: string,
    name?: string
  ): void {
    const attachmentName = name || `attachment_${this.attachments.size + 1}`;
    
    this.attachments.set(attachmentName, {
      data,
      mediaType,
      timestamp: new Date()
    });

    ActionLogger.logAttachment(attachmentName, mediaType);
    this.logger.debug(`Attached ${mediaType} as ${attachmentName}`);
  }

  /**
   * Attach screenshot
   */
  public attachScreenshot(
    screenshot: Buffer,
    name?: string
  ): void {
    this.attach(
      screenshot.toString('base64'),
      'image/png',
      name || 'screenshot'
    );
  }

  /**
   * Attach text
   */
  public attachText(
    text: string,
    name?: string
  ): void {
    this.attach(text, 'text/plain', name || 'text');
  }

  /**
   * Attach JSON
   */
  public attachJSON(
    json: any,
    name?: string
  ): void {
    this.attach(
      JSON.stringify(json, null, 2),
      'application/json',
      name || 'json'
    );
  }

  /**
   * Add log entry
   */
  public log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);
  }

  /**
   * Get all logs
   */
  public getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Get attachments
   */
  public getAttachments(): Map<string, any> {
    return new Map(this.attachments);
  }

  /**
   * Set metadata
   */
  public setMetadata(key: string, value: any): void {
    this.metadata.set(key, value);
  }

  /**
   * Get metadata
   */
  public getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  /**
   * Get all metadata
   */
  public getAllMetadata(): Map<string, any> {
    return new Map(this.metadata);
  }

  /**
   * Get step result
   */
  public getResult(): StepResult {
    const result: StepResult = {
      id: this.id,
      status: this.status,
      duration: this.getDuration()
    };

    if (this.error) {
      const error: ExecutionError = {
        type: 'execution',
        message: this.error.message,
        timestamp: new Date(),
        context: {
          feature: this.featureName,
          scenario: this.scenarioId,
          step: this.step.text
        }
      };
      
      // Only add stack if it exists
      if (this.error.stack) {
        error.stack = this.error.stack;
      }
      
      result.error = error;
      result.errorMessage = this.error.message;
      if (this.error.stack) {
        result.stackTrace = this.error.stack;
      }
    }

    if (this.attachments.size > 0) {
      result.attachments = Array.from(this.attachments.entries()).map(([name, attachment]) => ({
        data: attachment.data,
        mimeType: attachment.mediaType,
        name
      }));
    }

    return result;
  }

  /**
   * Clone context for retry
   */
  public clone(): StepContext {
    const cloned = new StepContext(
      this.step,
      this.scenarioId,
      this.featureName
    );

    // Copy metadata
    for (const [key, value] of this.metadata) {
      cloned.setMetadata(key, value);
    }

    return cloned;
  }

  /**
   * Export context for debugging
   */
  public export(): any {
    return {
      step: {
        keyword: this.step.keyword,
        text: this.step.text,
        line: this.step.line
      },
      scenarioId: this.scenarioId,
      featureName: this.featureName,
      status: this.status.toLowerCase(),
      duration: this.getDuration(),
      error: this.error ? {
        message: this.error.message,
        stack: this.error.stack
      } : undefined,
      attachments: this.attachments.size,
      logs: this.logs.length,
      metadata: Object.fromEntries(this.metadata)
    };
  }
}