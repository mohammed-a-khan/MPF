import { 
    ReportTask,
    ScheduleOptions,
    ScheduleResult 
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import { CSReporter } from './CSReporter';
import { FileUtils } from '../../core/utils/FileUtils';

export class ReportScheduler {
    private logger: Logger;
    private tasks: Map<string, ReportTask> = new Map();
    private intervals: Map<string, NodeJS.Timer> = new Map();
    private isRunning: boolean = false;
    private reporter: CSReporter;

    constructor() {
        this.logger = Logger.getInstance('ReportScheduler');
        this.reporter = CSReporter.getInstance();
    }

    public async initialize(): Promise<void> {
        this.isRunning = true;
        this.logger.info('Report scheduler initialized');
    }

    public async scheduleTask(task: ReportTask, options: ScheduleOptions): Promise<ScheduleResult> {
        try {
            if (this.tasks.has(task.taskId)) {
                return {
                    taskId: task.taskId,
                    scheduled: false,
                    error: 'Task already scheduled'
                };
            }

            const interval = this.parseCronExpression(options.cronExpression);
            
            if (interval <= 0) {
                return {
                    taskId: task.taskId,
                    scheduled: false,
                    error: 'Invalid cron expression'
                };
            }

            const timer = setInterval(() => {
                this.executeTask(task);
            }, interval);

            this.tasks.set(task.taskId, task);
            this.intervals.set(task.taskId, timer);

            const nextRun = new Date(Date.now() + interval);

            this.logger.info(`Scheduled task ${task.taskId} with interval ${interval}ms`);

            return {
                taskId: task.taskId,
                scheduled: true,
                nextRun
            };

        } catch (error: any) {
            this.logger.error(`Failed to schedule task ${task.taskId}`, error);
            return {
                taskId: task.taskId,
                scheduled: false,
                error: error.message
            };
        }
    }

    public async cancelTask(taskId: string): Promise<void> {
        const interval = this.intervals.get(taskId);
        if (interval) {
            clearInterval(interval as any);
            this.intervals.delete(taskId);
        }

        this.tasks.delete(taskId);
        this.logger.info(`Cancelled task ${taskId}`);
    }

    public getTasks(): ReportTask[] {
        return Array.from(this.tasks.values());
    }

    public getTask(taskId: string): ReportTask | undefined {
        return this.tasks.get(taskId);
    }

    public async updateTask(taskId: string, updates: Partial<ReportTask>): Promise<void> {
        const task = this.tasks.get(taskId);
        if (task) {
            const updatedTask = { ...task, ...updates };
            this.tasks.set(taskId, updatedTask);
            this.logger.info(`Updated task ${taskId}`);
        }
    }

    public async executeTaskNow(taskId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (task) {
            await this.executeTask(task);
        }
    }

    public pause(): void {
        this.isRunning = false;
        this.logger.info('Scheduler paused');
    }

    public resume(): void {
        this.isRunning = true;
        this.logger.info('Scheduler resumed');
    }

    public async shutdown(): Promise<void> {
        this.isRunning = false;

        for (const interval of this.intervals.values()) {
            clearInterval(interval as any);
        }

        this.intervals.clear();
        this.tasks.clear();

        this.logger.info('Scheduler shutdown complete');
    }

    private async executeTask(task: ReportTask): Promise<void> {
        if (!this.isRunning || !task.enabled) {
            return;
        }

        try {
            this.logger.info(`Executing scheduled task: ${task.taskId} - ${task.name}`);
            
            task.status = 'running';
            task.lastRun = new Date();

            const { source, filters, reportConfig } = task.options;
            
            let executionResult;
            if (source.type === 'file' && source.path) {
                if (await FileUtils.pathExists(source.path)) {
                    executionResult = await FileUtils.readJSON(source.path);
                } else {
                    throw new Error(`Execution result file not found: ${source.path}`);
                }
            } else if (source.type === 'api' && source.endpoint) {
                const response = await fetch(source.endpoint, {
                    method: 'GET',
                    headers: source.headers || {}
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch execution results: ${response.statusText}`);
                }
                
                executionResult = await response.json();
            } else if (source.type === 'database' && source.query) {
                this.logger.warn('Database source not fully implemented, using empty result');
                executionResult = {
                    executionId: `scheduled_${Date.now()}`,
                    startTime: new Date(),
                    endTime: new Date(),
                    status: 'completed',
                    environment: 'scheduled',
                    features: [],
                    scenarios: [],
                    totalFeatures: 0,
                    totalScenarios: 0,
                    totalSteps: 0,
                    passedFeatures: 0,
                    passedScenarios: 0,
                    passedSteps: 0,
                    failedFeatures: 0,
                    failedScenarios: 0,
                    failedSteps: 0,
                    skippedFeatures: 0,
                    skippedScenarios: 0,
                    skippedSteps: 0,
                    duration: 0
                };
            } else {
                throw new Error(`Invalid source configuration: ${JSON.stringify(source)}`);
            }
            
            if (filters && executionResult.scenarios) {
                if (filters.dateRange) {
                    const { start, end } = filters.dateRange;
                    executionResult.scenarios = executionResult.scenarios.filter((s: any) => {
                        const scenarioDate = new Date(s.startTime);
                        return (!start || scenarioDate >= new Date(start)) && 
                               (!end || scenarioDate <= new Date(end));
                    });
                }
                
                if (filters.tags && filters.tags.length > 0) {
                    executionResult.scenarios = executionResult.scenarios.filter((s: any) => 
                        s.tags && filters.tags!.some(tag => s.tags.includes(tag))
                    );
                }
                
                if (filters.status) {
                    executionResult.scenarios = executionResult.scenarios.filter((s: any) => 
                        s.status === filters.status
                    );
                }
                
                executionResult.totalScenarios = executionResult.scenarios.length;
                executionResult.passedScenarios = executionResult.scenarios.filter((s: any) => s.status === 'passed').length;
                executionResult.failedScenarios = executionResult.scenarios.filter((s: any) => s.status === 'failed').length;
                executionResult.skippedScenarios = executionResult.scenarios.filter((s: any) => s.status === 'skipped').length;
            }
            
            await this.reporter.initialize(reportConfig || {});
            const reportResult = await this.reporter.generateReport(executionResult);
            
            if (task.postActions) {
                for (const action of task.postActions) {
                    try {
                        switch (action.type) {
                            case 'email':
                                await this.sendEmailNotification(reportResult, action.config);
                                break;
                            case 'upload':
                                await this.uploadReport(reportResult, action.config);
                                break;
                            case 'webhook':
                                await this.triggerWebhook(reportResult, action.config);
                                break;
                            case 'archive':
                                await this.archiveReport(reportResult, action.config);
                                break;
                            default:
                                this.logger.warn(`Unknown post action type: ${action.type}`);
                        }
                    } catch (actionError) {
                        this.logger.error(`Post action ${action.type} failed`, actionError as Error);
                    }
                }
            }

            task.status = 'completed';
            task.lastResult = {
                reportId: reportResult.reportId,
                reportPath: reportResult.reportPath,
                duration: reportResult.duration,
                success: true
            };
            
            const interval = this.intervals.get(task.taskId);
            if (interval) {
                const cronInterval = this.parseCronExpression(task.schedule);
                task.nextRun = new Date(Date.now() + cronInterval);
            }

            this.logger.info(`Task ${task.taskId} completed successfully`);

        } catch (error: any) {
            this.logger.error(`Task ${task.taskId} failed`, error);
            task.status = 'failed';
        }
    }

    private parseCronExpression(cronExpression: string): number {
        const patterns: { [key: string]: number } = {
            '* * * * *': 60 * 1000,
            '*/5 * * * *': 5 * 60 * 1000,
            '*/15 * * * *': 15 * 60 * 1000,
            '*/30 * * * *': 30 * 60 * 1000,
            '0 * * * *': 60 * 60 * 1000,
            '0 */2 * * *': 2 * 60 * 60 * 1000,
            '0 */6 * * *': 6 * 60 * 60 * 1000,
            '0 0 * * *': 24 * 60 * 60 * 1000,
            '0 0 * * 0': 7 * 24 * 60 * 60 * 1000,
        };

        return patterns[cronExpression] || 60 * 60 * 1000;
    }

    public getStatistics(): {
        totalTasks: number;
        activeTasks: number;
        completedTasks: number;
        failedTasks: number;
        runningTasks: number;
    } {
        const tasks = Array.from(this.tasks.values());
        
        return {
            totalTasks: tasks.length,
            activeTasks: tasks.filter(t => t.enabled).length,
            completedTasks: tasks.filter(t => t.status === 'completed').length,
            failedTasks: tasks.filter(t => t.status === 'failed').length,
            runningTasks: tasks.filter(t => t.status === 'running').length
        };
    }
    
    private async sendEmailNotification(_reportResult: any, config: any): Promise<void> {
        this.logger.info('Sending email notification', {
            recipients: config.recipients,
            subject: config.subject || 'Test Report Generated'
        });
        
        
    }
    
    private async uploadReport(reportResult: any, config: any): Promise<void> {
        this.logger.info('Uploading report', {
            destination: config.destination,
            reportPath: reportResult.reportPath
        });
        
        if (config.destination && config.destinationPath) {
            const destPath = `${config.destinationPath}/${reportResult.reportId}`;
            await FileUtils.createDir(destPath);
            await FileUtils.copyDir(reportResult.reportPath, destPath, {});
        }
    }
    
    private async triggerWebhook(reportResult: any, config: any): Promise<void> {
        this.logger.info('Triggering webhook', {
            url: config.url,
            method: config.method || 'POST'
        });
        
        if (!config.url) {
            throw new Error('Webhook URL is required');
        }
        
        const payload = {
            reportId: reportResult.reportId,
            reportPath: reportResult.reportPath,
            generatedAt: reportResult.generatedAt,
            duration: reportResult.duration,
            ...config.additionalData
        };
        
        const response = await fetch(config.url, {
            method: config.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...config.headers
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Webhook failed: ${response.statusText}`);
        }
    }
    
    private async archiveReport(reportResult: any, config: any): Promise<void> {
        this.logger.info('Archiving report', {
            reportPath: reportResult.reportPath,
            archivePath: config.archivePath
        });
        
        if (config.archivePath) {
            const archiveDest = `${config.archivePath}/${reportResult.reportId}`;
            await FileUtils.createDir(config.archivePath);
            
            if (config.compress) {
                this.logger.info('Compression not implemented, copying files instead');
            }
            
            await FileUtils.copyDir(reportResult.reportPath, archiveDest, {});
            
            if (config.deleteOriginal) {
                await FileUtils.removeDir(reportResult.reportPath);
            }
        }
    }
}
