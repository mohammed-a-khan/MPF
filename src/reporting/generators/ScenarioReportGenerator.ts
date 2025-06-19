// src/reporting/generators/ScenarioReportGenerator.ts

import {
  ScenarioReport,
  StepReport,
  TestStatus,
  ReportTheme,
  STATUS_COLORS,
  STATUS_ICONS,
  ActionLog,
  ErrorDetails,
  HookReport,
  DataSetInfo,
  AIHealingAttempt,
  Screenshot,
  ScreenshotType,
  ConsoleLog,
  NetworkLog,
  ElementInfo,
  ActionType,
  DataTableRow,
  DocString,
  Embedding,
  MimeType
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';

/**
 * Scenario Report Generator - Creates Detailed Scenario-Level Reports
 * 
 * Generates comprehensive scenario reports with:
 * - Step-by-step execution details
 * - Rich action timeline
 * - Visual evidence gallery
 * - Network activity analysis
 * - Performance metrics
 * - Error diagnostics
 * - AI healing insights
 * 
 * Production-ready implementation with zero dependencies.
 */

interface ScenarioPerformanceMetrics {
  totalDuration: number;
  stepCount: number;
  avgStepDuration: number;
  actionCount: number;
  networkRequests: number;
  successRate: number;
}
export class ScenarioReportGenerator {
  private readonly logger = Logger.getInstance();
  
  /**
   * Generate scenario reports HTML
   */
  async generateScenarioReports(scenarios: ScenarioReport[], theme: ReportTheme): Promise<string> {
    this.logger.info(`Generating scenario reports for ${scenarios.length} scenarios`);
    
    return `
<div class="scenario-reports">
    ${this.generateScenarioFilters(scenarios)}
    <div class="scenarios-container">
        ${scenarios.map((scenario, index) => 
          this.generateDetailedScenarioReport(scenario, index, theme)
        ).join('')}
    </div>
</div>
${this.generateScenarioStyles(theme)}
${this.generateScenarioScripts()}`;
  }

  /**
   * Generate scenario filters
   */
  private generateScenarioFilters(scenarios: ScenarioReport[]): string {
    const features = [...new Set(scenarios.map((s: ScenarioReport) => s.feature))];
    const tags = [...new Set(scenarios.flatMap((s: ScenarioReport) => s.tags))];
    
    return `
<div class="scenario-filters">
    <div class="filter-section">
        <h3 class="filter-title">Filter Scenarios</h3>
        
        <div class="filter-group">
            <label>Status</label>
            <div class="filter-options">
                <label class="filter-option">
                    <input type="checkbox" name="status" value="all" checked>
                    <span>All (${scenarios.length})</span>
                </label>
                <label class="filter-option">
                    <input type="checkbox" name="status" value="passed">
                    <span>Passed (${scenarios.filter(s => s.status === TestStatus.PASSED).length})</span>
                </label>
                <label class="filter-option">
                    <input type="checkbox" name="status" value="failed">
                    <span>Failed (${scenarios.filter(s => s.status === TestStatus.FAILED).length})</span>
                </label>
                <label class="filter-option">
                    <input type="checkbox" name="status" value="skipped">
                    <span>Skipped (${scenarios.filter(s => s.status === TestStatus.SKIPPED).length})</span>
                </label>
            </div>
        </div>
        
        <div class="filter-group">
            <label>Features</label>
            <select class="filter-select" id="feature-filter" multiple>
                <option value="">All Features</option>
                ${features.map((feature: string) => 
                  `<option value="${feature}">${feature}</option>`
                ).join('')}
            </select>
        </div>
        
        <div class="filter-group">
            <label>Tags</label>
            <select class="filter-select" id="tag-filter" multiple>
                <option value="">All Tags</option>
                ${tags.map((tag: string) => 
                  `<option value="${tag}">${tag}</option>`
                ).join('')}
            </select>
        </div>
        
        <div class="filter-group">
            <label>Duration</label>
            <div class="duration-filter">
                <input type="range" id="duration-min" min="0" max="60000" value="0">
                <span id="duration-min-label">0s</span>
                <span>to</span>
                <input type="range" id="duration-max" min="0" max="60000" value="60000">
                <span id="duration-max-label">60s</span>
            </div>
        </div>
        
        <div class="filter-actions">
            <button class="btn-apply-filters">Apply Filters</button>
            <button class="btn-reset-filters">Reset</button>
        </div>
    </div>
    
    <div class="scenario-stats">
        <div class="stat-card mini">
            <div class="stat-value" id="visible-scenarios">${scenarios.length}</div>
            <div class="stat-label">Visible</div>
        </div>
        <div class="stat-card mini">
            <div class="stat-value" id="total-duration">${this.formatTotalDuration(scenarios)}</div>
            <div class="stat-label">Total Time</div>
        </div>
        <div class="stat-card mini">
            <div class="stat-value" id="avg-duration">${this.formatAvgDuration(scenarios)}</div>
            <div class="stat-label">Avg Time</div>
        </div>
    </div>
</div>`;
  }

  /**
   * Generate detailed scenario report
   */
  private generateDetailedScenarioReport(scenario: ScenarioReport, index: number, theme: ReportTheme): string {
    const hasDataSet = scenario.dataSet !== undefined;
    const hasRetries = scenario.retryCount > 0;
    const hasAIHealing = scenario.aiHealing && scenario.aiHealing.length > 0;
    
    return `
<article class="scenario-report ${scenario.status}" 
         data-scenario-index="${index}"
         data-scenario-id="${scenario.scenarioId}"
         data-status="${scenario.status}"
         data-feature="${scenario.feature}"
         data-tags="${scenario.tags.join(',')}"
         data-duration="${scenario.duration}">
    
    ${this.generateScenarioHeader(scenario, theme)}
    
    <div class="scenario-body">
        ${this.generateScenarioMetadata(scenario)}
        ${hasDataSet ? this.generateDataSetInfo(scenario.dataSet!) : ''}
        ${hasRetries ? this.generateRetryInfo(scenario) : ''}
        ${this.generateExecutionTimeline(scenario)}
        ${this.generateStepsSection(scenario)}
        ${this.generateActionTimeline(scenario)}
        ${this.generatePerformanceMetrics(scenario)}
        ${this.generateNetworkActivity(scenario)}
        ${this.generateEvidenceGallery(scenario)}
        ${scenario.error ? this.generateErrorDiagnostics(scenario.error) : ''}
        ${hasAIHealing ? this.generateAIHealingSection(scenario.aiHealing!) : ''}
        ${this.generateConsoleLogs(scenario)}
    </div>
    
    <div class="scenario-footer">
        ${this.generateScenarioActions(scenario)}
    </div>
</article>`;
  }

  /**
   * Generate scenario header
   */
  private generateScenarioHeader(scenario: ScenarioReport, theme: ReportTheme): string {
    const statusColor = STATUS_COLORS[scenario.status] || theme.primaryColor;
    
    return `
<header class="scenario-header ${scenario.status}">
    <div class="scenario-status-indicator" style="background: ${statusColor}">
        <span class="status-icon">${STATUS_ICONS[scenario.status]}</span>
        <span class="status-text">${scenario.status.toUpperCase()}</span>
    </div>
    
    <div class="scenario-title-section">
        <h2 class="scenario-title">
            <span class="scenario-keyword">${scenario.keyword}:</span>
            ${scenario.scenario}
        </h2>
        ${scenario.description ? `
        <p class="scenario-description">${scenario.description}</p>
        ` : ''}
        
        <div class="scenario-breadcrumb">
            <span class="breadcrumb-feature">${scenario.feature}</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-file">${scenario.uri}:${scenario.line}</span>
        </div>
    </div>
    
    <div class="scenario-quick-stats">
        <div class="quick-stat">
            <svg class="stat-icon" viewBox="0 0 24 24">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
            </svg>
            <span>${this.formatDuration(scenario.duration)}</span>
        </div>
        
        <div class="quick-stat">
            <svg class="stat-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>${scenario.steps.filter(s => s.status === TestStatus.PASSED).length}/${scenario.steps.length} steps</span>
        </div>
    </div>
</header>`;
  }

  /**
   * Generate scenario metadata
   */
  private generateScenarioMetadata(scenario: ScenarioReport): string {
    return `
<section class="scenario-metadata">
    <h3 class="section-title">Execution Details</h3>
    
    <div class="metadata-grid">
        <div class="metadata-item">
            <span class="metadata-label">Start Time</span>
            <span class="metadata-value">${this.formatDateTime(scenario.startTime)}</span>
        </div>
        
        <div class="metadata-item">
            <span class="metadata-label">End Time</span>
            <span class="metadata-value">${this.formatDateTime(scenario.endTime)}</span>
        </div>
        
        <div class="metadata-item">
            <span class="metadata-label">Duration</span>
            <span class="metadata-value highlight">${this.formatDuration(scenario.duration)}</span>
        </div>
        
        <div class="metadata-item">
            <span class="metadata-label">Tags</span>
            <span class="metadata-value">
                ${scenario.tags.map((tag: string) => 
                  `<span class="tag-badge">${tag}</span>`
                ).join('')}
            </span>
        </div>
        
        ${scenario.hooks.length > 0 ? `
        <div class="metadata-item">
            <span class="metadata-label">Hooks</span>
            <span class="metadata-value">
                ${scenario.hooks.filter(h => h.type === 'before').length} before, 
                ${scenario.hooks.filter(h => h.type === 'after').length} after
            </span>
        </div>
        ` : ''}
        
        <div class="metadata-item">
            <span class="metadata-label">Evidence</span>
            <span class="metadata-value">
                ${this.getEvidenceCount(scenario)} items
            </span>
        </div>
    </div>
</section>`;
  }

  /**
   * Generate data set information
   */
  private generateDataSetInfo(dataSet: DataSetInfo): string {
    return `
<section class="data-set-info">
    <h3 class="section-title">Data Set Information</h3>
    
    <div class="data-set-content">
        <div class="data-set-header">
            <span class="data-set-name">${dataSet.name}</span>
            <span class="data-set-index">Row ${dataSet.index + 1}</span>
            <span class="data-set-source">${dataSet.source}</span>
        </div>
        
        <div class="data-set-parameters">
            <h4>Parameters</h4>
            <table class="parameters-table">
                ${Object.entries(dataSet.parameters).map(([key, value]: [string, any]) => `
                <tr>
                    <td class="param-key">${key}</td>
                    <td class="param-value">${this.formatParameterValue(value)}</td>
                </tr>
                `).join('')}
            </table>
        </div>
    </div>
</section>`;
  }

  /**
   * Generate retry information
   */
  private generateRetryInfo(scenario: ScenarioReport): string {
    return `
<section class="retry-info">
    <div class="retry-badge">
        <svg class="retry-icon" viewBox="0 0 24 24">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        <span>Retry ${scenario.retryCount}</span>
    </div>
    <p class="retry-message">This scenario was retried ${scenario.retryCount} time${scenario.retryCount > 1 ? 's' : ''} before ${scenario.status === TestStatus.PASSED ? 'passing' : 'failing'}.</p>
</section>`;
  }

  /**
   * Generate execution timeline
   */
  private generateExecutionTimeline(scenario: ScenarioReport): string {
    const totalDuration = scenario.endTime.getTime() - scenario.startTime.getTime();
    const steps = scenario.steps;
    
    return `
<section class="execution-timeline">
    <h3 class="section-title">Execution Timeline</h3>
    
    <div class="timeline-visualization">
        <div class="timeline-track">
            ${scenario.hooks.filter((h: HookReport) => h.type === 'before').map((hook: HookReport) => 
              this.generateTimelineSegment(hook, 'hook before', scenario.startTime, totalDuration)
            ).join('')}
            
            ${steps.map((step: StepReport) => 
              this.generateTimelineSegment(step, 'step', scenario.startTime, totalDuration)
            ).join('')}
            
            ${scenario.hooks.filter((h: HookReport) => h.type === 'after').map((hook: HookReport) => 
              this.generateTimelineSegment(hook, 'hook after', scenario.startTime, totalDuration)
            ).join('')}
        </div>
        
        <div class="timeline-axis">
            <span class="timeline-start">0ms</span>
            <span class="timeline-middle">${Math.round(totalDuration / 2)}ms</span>
            <span class="timeline-end">${totalDuration}ms</span>
        </div>
    </div>
    
    <div class="timeline-legend">
        <div class="legend-item">
            <span class="legend-color passed"></span>
            <span>Passed</span>
        </div>
        <div class="legend-item">
            <span class="legend-color failed"></span>
            <span>Failed</span>
        </div>
        <div class="legend-item">
            <span class="legend-color skipped"></span>
            <span>Skipped</span>
        </div>
        <div class="legend-item">
            <span class="legend-color hook"></span>
            <span>Hook</span>
        </div>
    </div>
</section>`;
  }

  /**
   * Generate timeline segment
   */
  private generateTimelineSegment(item: any, type: string, startTime: Date, totalDuration: number): string {
    const itemStart = item.startTime ? new Date(item.startTime).getTime() : 0;
    const itemEnd = item.endTime ? new Date(item.endTime).getTime() : itemStart + item.duration;
    const startOffset = ((itemStart - startTime.getTime()) / totalDuration) * 100;
    const width = ((itemEnd - itemStart) / totalDuration) * 100;
    
    return `
<div class="timeline-segment ${type} ${item.status}" 
     style="left: ${startOffset}%; width: ${width}%"
     title="${type === 'step' ? item.text : type} - ${item.duration}ms">
    <div class="segment-fill"></div>
</div>`;
  }

  /**
   * Generate steps section
   */
  private generateStepsSection(scenario: ScenarioReport): string {
    return `
<section class="steps-section">
    <h3 class="section-title">Steps Execution</h3>
    
    ${scenario.hooks.filter(h => h.type === 'before').length > 0 ? `
    <div class="hooks-container before-hooks">
        <h4 class="hooks-label">Before Hooks</h4>
        ${scenario.hooks.filter((h: HookReport) => h.type === 'before').map((hook: HookReport) => 
          this.generateHook(hook)
        ).join('')}
    </div>
    ` : ''}
    
    <div class="steps-container">
        ${scenario.steps.map((step: StepReport, index: number) => 
          this.generateDetailedStep(step, index)
        ).join('')}
    </div>
    
    ${scenario.hooks.filter(h => h.type === 'after').length > 0 ? `
    <div class="hooks-container after-hooks">
        <h4 class="hooks-label">After Hooks</h4>
        ${scenario.hooks.filter((h: HookReport) => h.type === 'after').map((hook: HookReport) => 
          this.generateHook(hook)
        ).join('')}
    </div>
    ` : ''}
</section>`;
  }

  /**
   * Generate hook
   */
  private generateHook(hook: HookReport): string {
    return `
<div class="hook ${hook.status}">
    <div class="hook-header">
        <span class="hook-type">${hook.type}</span>
        <span class="hook-status">${STATUS_ICONS[hook.status]}</span>
        <span class="hook-duration">${hook.duration}ms</span>
    </div>
    ${hook.error ? `
    <div class="hook-error">
        <div class="error-message">${hook.error.message}</div>
        ${hook.error.stack ? `
        <details class="error-stack-details">
            <summary>Stack Trace</summary>
            <pre class="error-stack">${this.formatStackTrace(hook.error.stack)}</pre>
        </details>
        ` : ''}
    </div>
    ` : ''}
</div>`;
  }

  /**
   * Generate detailed step
   */
  private generateDetailedStep(step: StepReport, index: number): string {
    const hasAttachments = step.embeddings.length > 0 || 
                          step.rows || 
                          step.docString ||
                          step.actions.length > 0;
    
    return `
<div class="step-container ${step.status}" data-step-index="${index}">
    <div class="step-header">
        <div class="step-number">${index + 1}</div>
        
        <div class="step-content">
            <div class="step-main">
                <span class="step-status-icon">${STATUS_ICONS[step.status]}</span>
                <span class="step-keyword">${step.keyword}</span>
                <span class="step-text">${this.highlightStepParameters(step.text, step.match)}</span>
            </div>
            
            <div class="step-metadata">
                <span class="step-duration">
                    <svg viewBox="0 0 16 16">
                        <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
                        <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
                    </svg>
                    ${step.duration}ms
                </span>
                
                ${step.match ? `
                <span class="step-location" title="${step.match.location}">
                    <svg viewBox="0 0 16 16">
                        <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                    </svg>
                    ${this.formatStepLocation(step.match.location)}
                </span>
                ` : ''}
                
                ${step.aiIdentification ? `
                <span class="step-ai-badge" title="AI confidence: ${(step.aiIdentification.confidence * 100).toFixed(1)}%">
                    <svg viewBox="0 0 16 16">
                        <path d="M8 0l1.669.864 1.858.282.842 1.68 1.337 1.195L13.4 6l.306 1.879-1.337 1.195-.842 1.68-1.858.282L8 12l-1.669-.864-1.858-.282-.842-1.68-1.337-1.195L2.6 6l-.306-1.879 1.337-1.195.842-1.68 1.858-.282L8 0z"/>
                    </svg>
                    AI
                </span>
                ` : ''}
            </div>
        </div>
        
        ${hasAttachments ? `
        <button class="step-toggle" onclick="toggleStepDetails(${index})">
            <svg viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z"/>
            </svg>
        </button>
        ` : ''}
    </div>
    
    ${hasAttachments ? `
    <div class="step-details" id="step-details-${index}">
        ${step.rows ? this.generateStepDataTable(step.rows) : ''}
        ${step.docString ? this.generateStepDocString(step.docString) : ''}
        ${step.actions.length > 0 ? this.generateStepActions(step.actions) : ''}
        ${step.embeddings.length > 0 ? this.generateStepEmbeddings(step.embeddings) : ''}
        ${step.result.error ? this.generateStepError(step.result.error) : ''}
        ${step.result.screenshot ? this.generateStepScreenshot(step.result.screenshot) : ''}
    </div>
    ` : ''}
    
    ${step.result.error && !hasAttachments ? `
    <div class="step-inline-error">
        ${step.result.error.message}
    </div>
    ` : ''}
</div>`;
  }

  /**
   * Generate step data table
   */
  private generateStepDataTable(rows: DataTableRow[]): string {
    return `
<div class="step-data-table">
    <h5>Data Table</h5>
    <table class="data-table">
        ${rows.map((row: DataTableRow, index: number) => `
        <tr class="${index === 0 ? 'header-row' : 'data-row'}">
            ${row.cells.map((cell: string) => `
            <${index === 0 ? 'th' : 'td'}>${cell}</${index === 0 ? 'th' : 'td'}>
            `).join('')}
        </tr>
        `).join('')}
    </table>
</div>`;
  }

  /**
   * Generate step doc string
   */
  private generateStepDocString(docString: DocString): string {
    return `
<div class="step-doc-string">
    <h5>Doc String ${docString.contentType ? `(${docString.contentType})` : ''}</h5>
    <pre class="doc-string-content">${this.escapeHtml(docString.content)}</pre>
</div>`;
  }

  /**
   * Generate step actions
   */
  private generateStepActions(actions: ActionLog[]): string {
    return `
<div class="step-actions">
    <h5>Actions (${actions.length})</h5>
    <div class="actions-timeline">
        ${actions.map((action: ActionLog, index: number) => `
        <div class="action-entry ${action.success ? 'success' : 'failed'}">
            <div class="action-connector"></div>
            
            <div class="action-card">
                <div class="action-header">
                    <span class="action-index">${index + 1}</span>
                    <span class="action-type ${action.type}">${this.getActionTypeLabel(action.type)}</span>
                    <span class="action-duration">${action.duration}ms</span>
                </div>
                
                <div class="action-details">
                    <div class="action-target">${action.target}</div>
                    <div class="action-description">${action.action}</div>
                    
                    ${action.parameters.length > 0 ? `
                    <div class="action-parameters">
                        Parameters: ${action.parameters.map((p: any) => 
                          `<code>${JSON.stringify(p)}</code>`
                        ).join(', ')}
                    </div>
                    ` : ''}
                    
                    ${action.elementInfo ? this.generateElementInfo(action.elementInfo) : ''}
                    
                    ${action.error ? `
                    <div class="action-error">
                        <span class="error-label">Error:</span>
                        <span class="error-text">${action.error}</span>
                    </div>
                    ` : ''}
                    
                    ${action.screenshot ? `
                    <div class="action-screenshot">
                        <img src="${action.screenshot}" 
                             alt="Action screenshot" 
                             onclick="openImageModal(this.src)">
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `).join('')}
    </div>
</div>`;
  }

  /**
   * Generate element info
   */
  private generateElementInfo(elementInfo: ElementInfo): string {
    return `
<div class="element-info">
    <details class="element-details">
        <summary>Element Details</summary>
        <div class="element-properties">
            <div class="property">
                <span class="property-label">Selector:</span>
                <code>${elementInfo.selector}</code>
            </div>
            <div class="property">
                <span class="property-label">Tag:</span>
                <code>${elementInfo.tag}</code>
            </div>
            ${elementInfo.text ? `
            <div class="property">
                <span class="property-label">Text:</span>
                <span>${elementInfo.text}</span>
            </div>
            ` : ''}
            <div class="property">
                <span class="property-label">State:</span>
                <span class="element-state">
                    ${elementInfo.visible ? '✓ Visible' : '✗ Hidden'}
                    ${elementInfo.enabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </div>
            <div class="property">
                <span class="property-label">Position:</span>
                <span>x: ${elementInfo.position.x}, y: ${elementInfo.position.y} (${elementInfo.position.width}×${elementInfo.position.height})</span>
            </div>
            ${Object.keys(elementInfo.attributes).length > 0 ? `
            <div class="property">
                <span class="property-label">Attributes:</span>
                <div class="attributes-list">
                    ${Object.entries(elementInfo.attributes).map(([key, value]: [string, string]) => 
                      `<div class="attribute">
                        <code>${key}="${value}"</code>
                      </div>`
                    ).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    </details>
</div>`;
  }

  /**
   * Generate step embeddings
   */
  private generateStepEmbeddings(embeddings: Embedding[]): string {
    return `
<div class="step-embeddings">
    <h5>Attachments (${embeddings.length})</h5>
    <div class="embeddings-grid">
        ${embeddings.map((embed: Embedding, index: number) => {
          if (embed.mimeType.startsWith('image/')) {
            return `
            <div class="embedding-item image">
                <img src="data:${embed.mimeType};base64,${embed.data}" 
                     alt="${embed.name || `Attachment ${index + 1}`}"
                     onclick="openImageModal(this.src)">
                <span class="embedding-name">${embed.name || `Image ${index + 1}`}</span>
            </div>`;
          } else if (embed.mimeType === MimeType.TEXT) {
            const text = atob(embed.data);
            return `
            <div class="embedding-item text">
                <pre class="text-content">${this.escapeHtml(text)}</pre>
                <span class="embedding-name">${embed.name || `Text ${index + 1}`}</span>
            </div>`;
          } else if (embed.mimeType === MimeType.JSON) {
            const json = JSON.parse(atob(embed.data));
            return `
            <div class="embedding-item json">
                <pre class="json-content">${JSON.stringify(json, null, 2)}</pre>
                <span class="embedding-name">${embed.name || `JSON ${index + 1}`}</span>
            </div>`;
          } else if (embed.mimeType === MimeType.HTML) {
            return `
            <div class="embedding-item html">
                <iframe srcdoc="${atob(embed.data)}" class="html-content"></iframe>
                <span class="embedding-name">${embed.name || `HTML ${index + 1}`}</span>
            </div>`;
          }
          return '';
        }).join('')}
    </div>
</div>`;
  }

  /**
   * Generate step error
   */
  private generateStepError(error: ErrorDetails): string {
    return `
<div class="step-error-details">
    <h5>Error Details</h5>
    <div class="error-content">
        <div class="error-type">${error.type}</div>
        <div class="error-message">${error.message}</div>
        
        ${error.stack ? `
        <details class="error-stack-container">
            <summary>Stack Trace</summary>
            <pre class="error-stack">${this.formatStackTrace(error.stack)}</pre>
        </details>
        ` : ''}
        
        ${error.context ? `
        <div class="error-context">
            ${Object.entries(error.context).map(([key, value]: [string, any]) => 
              `<div class="context-item">
                <span class="context-key">${key}:</span>
                <span class="context-value">${value}</span>
              </div>`
            ).join('')}
        </div>
        ` : ''}
    </div>
</div>`;
  }

  /**
   * Generate step screenshot
   */
  private generateStepScreenshot(screenshot: string): string {
    return `
<div class="step-screenshot">
    <h5>Screenshot at Step Completion</h5>
    <img src="${screenshot}" 
         alt="Step screenshot" 
         onclick="openImageModal(this.src)">
</div>`;
  }

  /**
   * Generate action timeline
   */
  private generateActionTimeline(scenario: ScenarioReport): string {
    const allActions = scenario.steps.flatMap(step => step.actions);
    if (allActions.length === 0) return '';
    
    return `
<section class="action-timeline-section">
    <h3 class="section-title">Complete Action Timeline</h3>
    
    <div class="timeline-stats">
        <div class="stat">
            <span class="stat-value">${allActions.length}</span>
            <span class="stat-label">Total Actions</span>
        </div>
        <div class="stat">
            <span class="stat-value">${allActions.filter(a => a.success).length}</span>
            <span class="stat-label">Successful</span>
        </div>
        <div class="stat">
            <span class="stat-value">${allActions.filter(a => !a.success).length}</span>
            <span class="stat-label">Failed</span>
        </div>
        <div class="stat">
            <span class="stat-value">${this.calculateAvgActionDuration(allActions)}ms</span>
            <span class="stat-label">Avg Duration</span>
        </div>
    </div>
    
    <div class="action-type-breakdown">
        ${this.generateActionTypeBreakdown(allActions)}
    </div>
    
    <div class="timeline-visualization">
        ${this.generateActionTimelineVisualization(allActions, scenario)}
    </div>
</section>`;
  }

  /**
   * Generate action type breakdown
   */
  private generateActionTypeBreakdown(actions: ActionLog[]): string {
    const typeCount: Record<string, number> = {};
    actions.forEach((action: ActionLog) => {
      typeCount[action.type] = (typeCount[action.type] || 0) + 1;
    });
    
    return `
<div class="action-types">
    ${Object.entries(typeCount).map(([type, count]) => {
      const percentage = (count / actions.length) * 100;
      return `
      <div class="action-type-stat">
        <div class="type-header">
          <span class="type-name">${this.getActionTypeLabel(type as ActionType)}</span>
          <span class="type-count">${count}</span>
        </div>
        <div class="type-bar">
          <div class="type-fill" style="width: ${percentage}%; background: ${this.getActionTypeColor(type as ActionType)}"></div>
        </div>
      </div>`;
    }).join('')}
</div>`;
  }

  /**
   * Generate action timeline visualization
   */
  private generateActionTimelineVisualization(actions: ActionLog[], scenario: ScenarioReport): string {
    if (actions.length === 0) return '';
    
    const startTime = scenario.startTime.getTime();
    const endTime = scenario.endTime.getTime();
    const duration = endTime - startTime;
    
    return `
<div class="action-timeline-viz">
    <div class="timeline-track">
        ${actions.map((action: ActionLog) => {
          const actionStart = action.timestamp.getTime();
          const offset = ((actionStart - startTime) / duration) * 100;
          const width = (action.duration / duration) * 100;
          
          return `
          <div class="action-marker ${action.type} ${action.success ? 'success' : 'failed'}"
               style="left: ${offset}%; width: ${Math.max(width, 0.5)}%"
               title="${action.action} - ${action.duration}ms">
          </div>`;
        }).join('')}
    </div>
</div>`;
  }

  /**
   * Generate performance metrics
   */
  private generatePerformanceMetrics(scenario: ScenarioReport): string {
    const metrics = this.calculatePerformanceMetrics(scenario);
    
    return `
<section class="performance-metrics">
    <h3 class="section-title">Performance Metrics</h3>
    
    <div class="metrics-grid">
        <div class="metric-card">
            <div class="metric-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M13 2.05v3.03c3.39.49 6 3.39 6 6.92 0 .9-.18 1.75-.48 2.54l2.6 1.53c.56-1.24.88-2.62.88-4.07 0-5.18-3.95-9.45-9-9.95zM12 19c-3.87 0-7-3.13-7-7 0-3.53 2.61-6.43 6-6.92V2.05c-5.06.5-9 4.76-9 9.95 0 5.52 4.47 10 9.99 10 3.31 0 6.24-1.61 8.06-4.09l-2.6-1.53C16.17 17.98 14.21 19 12 19z"/>
                </svg>
            </div>
            <div class="metric-content">
                <div class="metric-value">${metrics.totalDuration}ms</div>
                <div class="metric-label">Total Duration</div>
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
                </svg>
            </div>
            <div class="metric-content">
                <div class="metric-value">${metrics.stepCount}</div>
                <div class="metric-label">Total Steps</div>
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                </svg>
            </div>
            <div class="metric-content">
                <div class="metric-value">${metrics.avgStepDuration}ms</div>
                <div class="metric-label">Avg Step Duration</div>
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
            </div>
            <div class="metric-content">
                <div class="metric-value">${metrics.actionCount}</div>
                <div class="metric-label">Total Actions</div>
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M16.5 3c-1.79 0-3.29 1.23-3.7 2.88A2.988 2.988 0 0 0 10 4.5c-1.38 0-2.5 1.12-2.5 2.5 0 .19.03.37.07.55A2.997 2.997 0 0 0 5 10.5c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3s-1.34-3-3-3h-.5v-1c0-1.38-1.12-2.5-2.5-2.5z"/>
                </svg>
            </div>
            <div class="metric-content">
                <div class="metric-value">${metrics.networkRequests}</div>
                <div class="metric-label">Network Requests</div>
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            </div>
            <div class="metric-content">
                <div class="metric-value">${metrics.successRate}%</div>
                <div class="metric-label">Success Rate</div>
            </div>
        </div>
    </div>
    
    <div class="performance-insights">
        <h4>Performance Insights</h4>
        <ul class="insights-list">
            ${this.generatePerformanceInsights(metrics, scenario)}
        </ul>
    </div>
</section>`;
  }

  /**
   * Generate network activity section
   */
  private generateNetworkActivity(scenario: ScenarioReport): string {
    const networkLogs = scenario.networkLogs || [];
    if (networkLogs.length === 0) return '';
    
    return `
<section class="network-activity">
    <h3 class="section-title">Network Activity</h3>
    
    <div class="network-summary">
        <div class="summary-stat">
            <span class="stat-value">${networkLogs.length}</span>
            <span class="stat-label">Total Requests</span>
        </div>
        <div class="summary-stat">
            <span class="stat-value">${this.calculateTotalDataTransferred(networkLogs)}</span>
            <span class="stat-label">Data Transferred</span>
        </div>
        <div class="summary-stat">
            <span class="stat-value">${this.calculateAvgResponseTime(networkLogs)}ms</span>
            <span class="stat-label">Avg Response Time</span>
        </div>
        <div class="summary-stat">
            <span class="stat-value">${networkLogs.filter(n => n.status >= 400).length}</span>
            <span class="stat-label">Failed Requests</span>
        </div>
    </div>
    
    <div class="network-timeline">
        <div class="timeline-header">
            <span>URL</span>
            <span>Method</span>
            <span>Status</span>
            <span>Type</span>
            <span>Size</span>
            <span>Time</span>
            <span>Timeline</span>
        </div>
        
        ${networkLogs.map((log, index) => this.generateNetworkLogEntry(log, index, scenario)).join('')}
    </div>
    
    <div class="network-breakdown">
        ${this.generateNetworkBreakdown(networkLogs)}
    </div>
</section>`;
  }

  /**
   * Generate network log entry
   */
  private generateNetworkLogEntry(log: NetworkLog, index: number, scenario: ScenarioReport): string {
    const startOffset = log.startTime ? log.startTime.getTime() - scenario.startTime.getTime() : 0;
    const duration = log.endTime && log.startTime ? log.endTime.getTime() - log.startTime.getTime() : 0;
    const totalDuration = scenario.endTime.getTime() - scenario.startTime.getTime();
    
    return `
<div class="network-entry ${log.status >= 400 ? 'failed' : ''}" onclick="toggleNetworkDetails(${index})">
    <div class="entry-main">
        <span class="network-url" title="${log.url}">${this.truncateUrl(log.url)}</span>
        <span class="network-method ${log.method.toLowerCase()}">${log.method}</span>
        <span class="network-status status-${Math.floor(log.status / 100)}xx">${log.status}</span>
        <span class="network-type">${log.resourceType}</span>
        <span class="network-size">${this.formatBytes(log.size || 0)}</span>
        <span class="network-time">${duration}ms</span>
        <div class="network-bar">
            <div class="bar-track">
                <div class="bar-fill" 
                     style="left: ${(startOffset / totalDuration) * 100}%; 
                            width: ${(duration / totalDuration) * 100}%">
                </div>
            </div>
        </div>
    </div>
    
    <div class="network-details" id="network-details-${index}">
        <div class="details-section">
            <h5>Request Headers</h5>
            <div class="headers-list">
                ${Object.entries(log.headers).map(([key, value]) => 
                  `<div class="header-item">
                    <span class="header-key">${key}:</span>
                    <span class="header-value">${value}</span>
                  </div>`
                ).join('')}
            </div>
        </div>
        
        ${log.responseHeaders ? `
        <div class="details-section">
            <h5>Response Headers</h5>
            <div class="headers-list">
                ${Object.entries(log.responseHeaders).map(([key, value]) => 
                  `<div class="header-item">
                    <span class="header-key">${key}:</span>
                    <span class="header-value">${value}</span>
                  </div>`
                ).join('')}
            </div>
        </div>
        ` : ''}
        
        ${log.requestBody ? `
        <div class="details-section">
            <h5>Request Body</h5>
            <pre class="body-content">${this.formatRequestBody(log.requestBody)}</pre>
        </div>
        ` : ''}
        
        ${log.responseBody ? `
        <div class="details-section">
            <h5>Response Body</h5>
            <pre class="body-content">${this.formatResponseBody(log.responseBody, log.responseHeaders?.['content-type'])}</pre>
        </div>
        ` : ''}
    </div>
</div>`;
  }

  /**
   * Generate network breakdown
   */
  private generateNetworkBreakdown(networkLogs: NetworkLog[]): string {
    const byType: Record<string, { count: number; size: number }> = {};
    const byStatus: Record<string, number> = {};
    
    networkLogs.forEach((log: NetworkLog) => {
      // By type
      const resourceType = log.resourceType || 'unknown';
      if (!byType[resourceType]) {
        byType[resourceType] = { count: 0, size: 0 };
      }
      byType[resourceType].count++;
      byType[resourceType].size += log.size || 0;
      
      // By status
      const statusGroup = `${Math.floor(log.status / 100)}xx`;
      byStatus[statusGroup] = (byStatus[statusGroup] || 0) + 1;
    });
    
    return `
<div class="breakdown-container">
    <div class="breakdown-section">
        <h4>By Resource Type</h4>
        <div class="breakdown-chart">
            ${Object.entries(byType).map(([type, data]: [string, { count: number; size: number }]) => {
              const percentage = (data.count / networkLogs.length) * 100;
              return `
              <div class="breakdown-item">
                <div class="breakdown-label">
                  <span>${type}</span>
                  <span>${data.count} (${this.formatBytes(data.size)})</span>
                </div>
                <div class="breakdown-bar">
                  <div class="bar-fill" style="width: ${percentage}%"></div>
                </div>
              </div>`;
            }).join('')}
        </div>
    </div>
    
    <div class="breakdown-section">
        <h4>By Status Code</h4>
        <div class="breakdown-chart">
            ${Object.entries(byStatus).map(([status, count]: [string, number]) => {
              const percentage = (count / networkLogs.length) * 100;
              return `
              <div class="breakdown-item">
                <div class="breakdown-label">
                  <span class="status-${status}">${status}</span>
                  <span>${count} requests</span>
                </div>
                <div class="breakdown-bar">
                  <div class="bar-fill status-${status}" style="width: ${percentage}%"></div>
                </div>
              </div>`;
            }).join('')}
        </div>
    </div>
</div>`;
  }

  /**
   * Generate evidence gallery
   */
  private generateEvidenceGallery(scenario: ScenarioReport): string {
    const screenshots = this.collectAllScreenshots(scenario);
    const videos = scenario.videos || [];
    
    if (screenshots.length === 0 && videos.length === 0) return '';
    
    return `
<section class="evidence-gallery">
    <h3 class="section-title">Evidence Gallery</h3>
    
    ${screenshots.length > 0 ? `
    <div class="screenshots-section">
        <h4>Screenshots (${screenshots.length})</h4>
        <div class="screenshots-grid">
            ${screenshots.map((screenshot: Screenshot) => `
            <div class="screenshot-item" onclick="openImageModal('${screenshot.path}')">
                <img src="${screenshot.path}" alt="${screenshot.description}">
                <div class="screenshot-info">
                    <span class="screenshot-name">${screenshot.description}</span>
                    <span class="screenshot-timestamp">${this.formatTime(screenshot.timestamp)}</span>
                </div>
            </div>
            `).join('')}
        </div>
    </div>
    ` : ''}
    
    ${videos.length > 0 ? `
    <div class="videos-section">
        <h4>Videos (${videos.length})</h4>
        <div class="videos-grid">
            ${videos.map((video: { name?: string; path: string }, index: number) => `
            <div class="video-item">
                <video controls>
                    <source src="${video.path}" type="video/webm">
                    Your browser does not support the video tag.
                </video>
                <span class="video-name">Recording ${index + 1}</span>
            </div>
            `).join('')}
        </div>
    </div>
    ` : ''}
</section>`;
  }

  /**
   * Generate error diagnostics
   */
  private generateErrorDiagnostics(error: ErrorDetails): string {
    return `
<section class="error-diagnostics">
    <h3 class="section-title">Error Diagnostics</h3>
    
    <div class="error-summary">
        <div class="error-icon">
            <svg viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
        </div>
        
        <div class="error-main">
            <h4 class="error-type">${error.type}</h4>
            <p class="error-message">${error.message}</p>
        </div>
    </div>
    
    ${error.stack ? `
    <div class="error-stack-section">
        <h4>Stack Trace</h4>
        <pre class="error-stack">${this.formatStackTrace(error.stack)}</pre>
        
        <div class="stack-analysis">
            ${this.analyzeStackTrace(error.stack)}
        </div>
    </div>
    ` : ''}
    
    ${error.context ? `
    <div class="error-context-section">
        <h4>Error Context</h4>
        <div class="context-grid">
            ${Object.entries(error.context).map(([key, value]: [string, any]) => `
            <div class="context-item">
                <span class="context-key">${key}</span>
                <span class="context-value">${this.formatContextValue(value)}</span>
            </div>
            `).join('')}
        </div>
    </div>
    ` : ''}
    
    <div class="error-suggestions">
        <h4>Possible Solutions</h4>
        <ul class="suggestions-list">
            ${this.generateErrorSuggestions(error)}
        </ul>
    </div>
</section>`;
  }

  /**
   * Generate AI healing section
   */
  private generateAIHealingSection(healingAttempts: AIHealingAttempt[]): string {
    return `
<section class="ai-healing-section">
    <h3 class="section-title">AI Self-Healing</h3>
    
    <div class="healing-summary">
        <div class="summary-stat">
            <span class="stat-value">${healingAttempts.length}</span>
            <span class="stat-label">Healing Attempts</span>
        </div>
        <div class="summary-stat">
            <span class="stat-value">${healingAttempts.filter(a => a.success).length}</span>
            <span class="stat-label">Successful</span>
        </div>
        <div class="summary-stat">
            <span class="stat-value">${this.calculateAvgConfidence(healingAttempts)}%</span>
            <span class="stat-label">Avg Confidence</span>
        </div>
    </div>
    
    <div class="healing-attempts">
        ${healingAttempts.map((attempt: AIHealingAttempt, index: number) => `
        <div class="healing-attempt ${attempt.success ? 'success' : 'failed'}">
            <div class="attempt-header">
                <span class="attempt-number">#${index + 1}</span>
                <span class="attempt-element">${attempt.elementDescription}</span>
                <span class="attempt-status">${attempt.success ? '✓ Healed' : '✗ Failed'}</span>
            </div>
            
            <div class="attempt-details">
                <div class="detail-row">
                    <span class="detail-label">Original Locator:</span>
                    <code>${attempt.originalLocator}</code>
                </div>
                
                ${attempt.success ? `
                <div class="detail-row">
                    <span class="detail-label">New Locator:</span>
                    <code>${attempt.healedLocator}</code>
                </div>
                ` : ''}
                
                <div class="detail-row">
                    <span class="detail-label">Strategy:</span>
                    <span>${attempt.strategy}</span>
                </div>
                
                <div class="detail-row">
                    <span class="detail-label">Confidence:</span>
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: ${attempt.confidence * 100}%"></div>
                        <span class="confidence-text">${(attempt.confidence * 100).toFixed(1)}%</span>
                    </div>
                </div>
                
                ${attempt.recommendation ? `
                <div class="detail-row">
                    <span class="detail-label">Reasoning:</span>
                    <p class="reasoning-text">${attempt.recommendation}</p>
                </div>
                ` : ''}
                
                <div class="detail-row">
                    <span class="detail-label">Duration:</span>
                    <span>${attempt.duration}ms</span>
                </div>
            </div>
        </div>
        `).join('')}
    </div>
    
    <div class="healing-recommendations">
        <h4>Recommendations</h4>
        <ul class="recommendations-list">
            ${this.generateHealingRecommendations(healingAttempts)}
        </ul>
    </div>
</section>`;
  }

  /**
   * Generate console logs section
   */
  private generateConsoleLogs(scenario: ScenarioReport): string {
    const consoleLogs = scenario.consoleLogs || [];
    if (consoleLogs.length === 0) return '';
    
    const logsByLevel: Record<string, ConsoleLog[]> = {
      error: [],
      warning: [],
      info: [],
      debug: []
    };
    
    consoleLogs.forEach((log: ConsoleLog) => {
      const level = log.level as keyof typeof logsByLevel;
      if (level in logsByLevel) {
        logsByLevel[level]?.push(log);
      }
    });
    
    return `
<section class="console-logs-section">
    <h3 class="section-title">Console Logs</h3>
    
    <div class="logs-filter">
        <label class="log-filter-option">
            <input type="checkbox" name="log-level" value="error" checked>
            <span class="log-badge error">Error (${logsByLevel['error']?.length || 0})</span>
        </label>
        <label class="log-filter-option">
            <input type="checkbox" name="log-level" value="warning" checked>
            <span class="log-badge warning">Warning (${logsByLevel['warning']?.length || 0})</span>
        </label>
        <label class="log-filter-option">
            <input type="checkbox" name="log-level" value="info" checked>
            <span class="log-badge info">Info (${logsByLevel['info']?.length || 0})</span>
        </label>
        <label class="log-filter-option">
            <input type="checkbox" name="log-level" value="debug">
            <span class="log-badge debug">Debug (${logsByLevel['debug']?.length || 0})</span>
        </label>
    </div>
    
    <div class="logs-container">
        ${consoleLogs.map((log: ConsoleLog) => `
        <div class="console-log ${log.level}" data-log-level="${log.level}">
            <span class="log-timestamp">${this.formatTime(log.timestamp)}</span>
            <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
            <span class="log-source">${log.source}</span>
            <div class="log-message">${this.formatLogMessage(log.message)}</div>
            ${log.stackTrace ? `
            <details class="log-stack">
                <summary>Stack Trace</summary>
                <pre>${log.stackTrace}</pre>
            </details>
            ` : ''}
        </div>
        `).join('')}
    </div>
</section>`;
  }

  /**
   * Generate scenario actions
   */
  private generateScenarioActions(scenario: ScenarioReport): string {
    return `
<div class="scenario-actions">
    <button class="action-btn" onclick="rerunScenario('${scenario.scenarioId}')">
        <svg viewBox="0 0 24 24">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        Rerun
    </button>
    
    <button class="action-btn" onclick="exportScenario('${scenario.scenarioId}')">
        <svg viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        Export
    </button>
    
    <button class="action-btn" onclick="shareScenario('${scenario.scenarioId}')">
        <svg viewBox="0 0 24 24">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
        </svg>
        Share
    </button>
    
    <button class="action-btn toggle-details" onclick="toggleAllScenarioDetails(this)">
        <svg viewBox="0 0 24 24">
            <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
        </svg>
        Collapse All
    </button>
</div>`;
  }

  // ========== Helper Methods ==========

  /**
   * Format duration
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Format date time
   */
  private formatDateTime(date: Date): string {
    const dateStr = date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${dateStr}.${milliseconds}`;
  }

  /**
   * Format time only
   */
  private formatTime(date: Date): string {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${milliseconds}`;
  }

  /**
   * Format total duration
   */
  private formatTotalDuration(scenarios: ScenarioReport[]): string {
    const total = scenarios.reduce((sum, s) => sum + s.duration, 0);
    return this.formatDuration(total);
  }

  /**
   * Format average duration
   */
  private formatAvgDuration(scenarios: ScenarioReport[]): string {
    if (scenarios.length === 0) return '0ms';
    const avg = scenarios.reduce((sum, s) => sum + s.duration, 0) / scenarios.length;
    return this.formatDuration(Math.round(avg));
  }

  /**
   * Get evidence count
   */
  private getEvidenceCount(scenario: ScenarioReport): number {
    let count = 0;
    
    // Screenshots
    scenario.steps.forEach(step => {
      if (step.result.screenshot) count++;
      step.actions.forEach(action => {
        if (action.screenshot) count++;
      });
      count += step.embeddings.filter(e => e.mimeType.startsWith('image/')).length;
    });
    
    // Videos
    count += (scenario.videos || []).length;
    
    // Network logs
    count += (scenario.networkLogs || []).length;
    
    return count;
  }

  /**
   * Format parameter value
   */
  private formatParameterValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  /**
   * Highlight step parameters
   */
  private highlightStepParameters(text: string, match?: any): string {
    if (!match || !match.arguments) return this.escapeHtml(text);
    
    let highlightedText = this.escapeHtml(text);
    const args = match.arguments.sort((a: any, b: any) => b.offset - a.offset);
    
    args.forEach((arg: any) => {
      const before = highlightedText.substring(0, arg.offset);
      const param = highlightedText.substring(arg.offset, arg.offset + arg.value.length);
      const after = highlightedText.substring(arg.offset + arg.value.length);
      highlightedText = `${before}<span class="step-parameter">${param}</span>${after}`;
    });
    
    return highlightedText;
  }

  /**
   * Format step location
   */
  private formatStepLocation(location: string | undefined): string {
    if (!location) return '';
    const parts = location.split(':');
    if (parts.length >= 2 && parts[0]) {
      const file = parts[0].split('/').pop() || parts[0];
      return `${file}:${parts[1]}`;
    }
    return location;
  }

  /**
   * Get action type label
   */
  private getActionTypeLabel(type: ActionType): string {
    const labels: Record<ActionType, string> = {
      [ActionType.NAVIGATION]: 'Navigation',
      [ActionType.CLICK]: 'Click',
      [ActionType.TYPE]: 'Type',
      [ActionType.SELECT]: 'Select',
      [ActionType.WAIT]: 'Wait',
      [ActionType.ASSERTION]: 'Assertion',
      [ActionType.API_CALL]: 'API Call',
      [ActionType.DB_QUERY]: 'Database',
      [ActionType.SCREENSHOT]: 'Screenshot',
      [ActionType.CUSTOM]: 'Custom'
    };
    return labels[type] || type;
  }

  /**
   * Get action type color
   */
  private getActionTypeColor(type: ActionType): string {
    const colors: Record<ActionType, string> = {
      [ActionType.NAVIGATION]: '#4CAF50',
      [ActionType.CLICK]: '#2196F3',
      [ActionType.TYPE]: '#9C27B0',
      [ActionType.SELECT]: '#673AB7',
      [ActionType.WAIT]: '#795548',
      [ActionType.ASSERTION]: '#FF9800',
      [ActionType.API_CALL]: '#F44336',
      [ActionType.DB_QUERY]: '#3F51B5',
      [ActionType.SCREENSHOT]: '#00BCD4',
      [ActionType.CUSTOM]: '#607D8B'
    };
    return colors[type] || '#757575';
  }

  /**
   * Calculate average action duration
   */
  private calculateAvgActionDuration(actions: ActionLog[]): number {
    if (actions.length === 0) return 0;
    const total = actions.reduce((sum, action) => sum + action.duration, 0);
    return Math.round(total / actions.length);
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(scenario: ScenarioReport): ScenarioPerformanceMetrics {
    const allActions = scenario.steps.flatMap(step => step.actions);
    
    return {
      totalDuration: scenario.duration,
      stepCount: scenario.steps.length,
      avgStepDuration: Math.round(scenario.duration / scenario.steps.length),
      actionCount: allActions.length,
      networkRequests: (scenario.networkLogs || []).length,
      successRate: Math.round((scenario.steps.filter(s => s.status === TestStatus.PASSED).length / scenario.steps.length) * 100)
    };
  }

  /**
   * Generate performance insights
   */
  private generatePerformanceInsights(metrics: ScenarioPerformanceMetrics, scenario: ScenarioReport): string {
    const insights: string[] = [];
    
    // Duration insights
    if (metrics.totalDuration > 60000) {
      insights.push(`<li class="insight warning">Scenario took ${this.formatDuration(metrics.totalDuration)}, consider optimization</li>`);
    } else if (metrics.totalDuration < 5000) {
      insights.push(`<li class="insight success">Excellent performance - completed in ${this.formatDuration(metrics.totalDuration)}</li>`);
    }
    
    // Step insights
    if (metrics.avgStepDuration > 5000) {
      insights.push(`<li class="insight warning">Average step duration is high (${metrics.avgStepDuration}ms)</li>`);
    }
    
    // Network insights
    if (metrics.networkRequests > 50) {
      insights.push(`<li class="insight info">High network activity detected (${metrics.networkRequests} requests)</li>`);
    }
    
    // Find slowest step
    const slowestStep = scenario.steps.reduce((prev, current) => 
      prev.duration > current.duration ? prev : current
    );
    insights.push(`<li class="insight info">Slowest step: "${slowestStep.text}" (${slowestStep.duration}ms)</li>`);
    
    // Success rate
    if (metrics.successRate === 100) {
      insights.push(`<li class="insight success">All steps passed successfully</li>`);
    } else if (metrics.successRate < 50) {
      insights.push(`<li class="insight error">Low success rate: ${metrics.successRate}%</li>`);
    }
    
    return insights.join('');
  }

  /**
   * Calculate total data transferred
   */
  private calculateTotalDataTransferred(networkLogs: NetworkLog[]): string {
    const total = networkLogs.reduce((sum, log) => sum + (log.size || 0), 0);
    return this.formatBytes(total);
  }

  /**
   * Calculate average response time
   */
  private calculateAvgResponseTime(networkLogs: NetworkLog[]): number {
    if (networkLogs.length === 0) return 0;
    const total = networkLogs.reduce((sum, log) => {
      const duration = (log.endTime?.getTime() || 0) - (log.startTime?.getTime() || 0);
      return sum + duration;
    }, 0);
    return Math.round(total / networkLogs.length);
  }

  /**
   * Format bytes
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Truncate URL
   */
  private truncateUrl(url: string): string {
    if (url.length <= 50) return url;
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    if (path.length > 30) {
      return urlObj.hostname + path.substring(0, 27) + '...';
    }
    return urlObj.hostname + path;
  }

  /**
   * Format request body
   */
  private formatRequestBody(body: any): string {
    if (typeof body === 'string') {
      try {
        const json = JSON.parse(body);
        return JSON.stringify(json, null, 2);
      } catch {
        return body;
      }
    }
    return JSON.stringify(body, null, 2);
  }

  /**
   * Format response body
   */
  private formatResponseBody(body: any, contentType?: string): string {
    if (!contentType) return String(body);
    
    if (contentType.includes('application/json')) {
      try {
        const json = typeof body === 'string' ? JSON.parse(body) : body;
        return JSON.stringify(json, null, 2);
      } catch {
        return String(body);
      }
    }
    
    if (contentType.includes('text/html')) {
      return this.escapeHtml(String(body));
    }
    
    return String(body);
  }

  /**
   * Collect all screenshots
   */
  private collectAllScreenshots(scenario: ScenarioReport): Screenshot[] {
    const screenshots: Screenshot[] = [];
    
    scenario.steps.forEach((step: StepReport, stepIndex: number) => {
      // Step screenshots
      if (step.result.screenshot) {
        screenshots.push({
          id: `step-${stepIndex}`,
          filename: `step-${stepIndex}.png`,
          path: step.result.screenshot,
          scenarioId: scenario.scenarioId,
          stepId: step.stepId,
          type: ScreenshotType.STEP,
          timestamp: step.endTime,
          description: `Step ${stepIndex + 1} - ${step.text}`,
          size: 0,
          dimensions: { width: 0, height: 0 }
        } as Screenshot);
      }
      
      // Action screenshots
      step.actions.forEach((action: ActionLog, actionIndex: number) => {
        if (action.screenshot) {
          screenshots.push({
            id: `action-${stepIndex}-${actionIndex}`,
            filename: `action-${stepIndex}-${actionIndex}.png`,
            path: action.screenshot,
            scenarioId: scenario.scenarioId,
            stepId: step.stepId,
            type: ScreenshotType.DEBUG,
            timestamp: action.timestamp,
            description: `Action - ${action.action}`,
            size: 0,
            dimensions: { width: 0, height: 0 }
          } as Screenshot);
        }
      });
      
      // Embedded screenshots
      step.embeddings.forEach((embed: Embedding, embedIndex: number) => {
        if (embed.mimeType.startsWith('image/')) {
          screenshots.push({
            id: `embed-${stepIndex}-${embedIndex}`,
            filename: embed.name || `embed-${stepIndex}-${embedIndex}.png`,
            path: `data:${embed.mimeType};base64,${embed.data}`,
            base64: embed.data,
            scenarioId: scenario.scenarioId,
            stepId: step.stepId,
            type: ScreenshotType.STEP,
            timestamp: step.endTime,
            description: embed.name || `Embedded Image ${embedIndex + 1}`,
            size: 0,
            dimensions: { width: 0, height: 0 }
          } as Screenshot);
        }
      });
    });
    
    return screenshots;
  }

  /**
   * Format stack trace
   */
  private formatStackTrace(stack: string): string {
    return stack
      .split('\n')
      .map((line: string) => {
        // Highlight file paths
        return line.replace(/(\S+\.(ts|js):\d+:\d+)/g, '<span class="stack-file">$1</span>');
      })
      .join('\n');
  }

  /**
   * Analyze stack trace
   */
  private analyzeStackTrace(stack: string): string {
    const lines = stack.split('\n');
    const userCode = lines.find(line => 
      !line.includes('node_modules') && 
      (line.includes('.ts') || line.includes('.js'))
    );
    
    if (userCode) {
      const match = userCode.match(/(\S+\.(ts|js)):(\d+):(\d+)/);
      if (match) {
        return `
        <div class="stack-analysis-result">
          <span class="analysis-label">Error Location:</span>
          <span class="analysis-file">${match[1]}</span>
          <span class="analysis-position">Line ${match[3]}, Column ${match[4]}</span>
        </div>`;
      }
    }
    
    return '<div class="stack-analysis-result">Unable to determine exact error location</div>';
  }

  /**
   * Format context value
   */
  private formatContextValue(value: any): string {
    if (typeof value === 'object') {
      return `<pre>${JSON.stringify(value, null, 2)}</pre>`;
    }
    return String(value);
  }

  /**
   * Generate error suggestions
   */
  private generateErrorSuggestions(error: ErrorDetails): string {
    const suggestions: string[] = [];
    
    // Element not found errors
    if (error.message.toLowerCase().includes('element not found') || 
        error.message.toLowerCase().includes('no element')) {
      suggestions.push('Verify the element selector is correct');
      suggestions.push('Check if the element is visible on the page');
      suggestions.push('Add explicit wait before interacting with the element');
      suggestions.push('Enable AI healing for automatic element recovery');
    }
    
    // Timeout errors
    if (error.message.toLowerCase().includes('timeout')) {
      suggestions.push('Increase the timeout value in configuration');
      suggestions.push('Check if the page is loading correctly');
      suggestions.push('Verify network connectivity');
      suggestions.push('Check for JavaScript errors blocking page load');
    }
    
    // Click interception errors
    if (error.message.toLowerCase().includes('intercept')) {
      suggestions.push('Wait for overlapping elements to disappear');
      suggestions.push('Scroll element into view before clicking');
      suggestions.push('Use force click option if appropriate');
      suggestions.push('Check for modal dialogs or overlays');
    }
    
    // Network errors
    if (error.message.toLowerCase().includes('network') || 
        error.message.toLowerCase().includes('fetch')) {
      suggestions.push('Verify API endpoint is correct');
      suggestions.push('Check authentication credentials');
      suggestions.push('Verify network connectivity');
      suggestions.push('Check CORS configuration if applicable');
    }
    
    return suggestions.map(s => `<li>${s}</li>`).join('');
  }

  /**
   * Calculate average confidence
   */
  private calculateAvgConfidence(attempts: AIHealingAttempt[]): number {
    if (attempts.length === 0) return 0;
    const total = attempts.reduce((sum: number, attempt: AIHealingAttempt) => sum + attempt.confidence, 0);
    return Math.round((total / attempts.length) * 100);
  }

  /**
   * Generate healing recommendations
   */
  private generateHealingRecommendations(attempts: AIHealingAttempt[]): string {
    const recommendations: string[] = [];
    
    // Low confidence healing
    const lowConfidence = attempts.filter(a => a.confidence < 0.7);
    if (lowConfidence.length > 0) {
      recommendations.push('Some elements were healed with low confidence - consider updating locators manually');
    }
    
    // Frequently healed elements
    const elementCounts: Record<string, number> = {};
    attempts.forEach(attempt => {
      elementCounts[attempt.elementDescription] = (elementCounts[attempt.elementDescription] || 0) + 1;
    });
    
    Object.entries(elementCounts).forEach(([element, count]) => {
      if (count >= 2) {
        recommendations.push(`"${element}" required healing ${count} times - update its locator`);
      }
    });
    
    // Strategy effectiveness
    const strategySuccess: Record<string, { total: number; success: number }> = {};
    attempts.forEach(attempt => {
      const strategy = attempt.strategy;
      if (!strategySuccess[strategy]) {
        strategySuccess[strategy] = { total: 0, success: 0 };
      }
      strategySuccess[strategy].total++;
      if (attempt.success) {
        strategySuccess[strategy].success++;
      }
    });
    
    Object.entries(strategySuccess).forEach(([strategy, stats]) => {
      const successRate = (stats.success / stats.total) * 100;
      if (successRate < 50) {
        recommendations.push(`${strategy} strategy has low success rate (${successRate.toFixed(0)}%)`);
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push('AI healing is working effectively - no immediate action required');
    }
    
    return recommendations.map(r => `<li>${r}</li>`).join('');
  }

  /**
   * Format log message
   */
  private formatLogMessage(message: string): string {
    // Format JSON in log messages
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0]);
        const formatted = JSON.stringify(json, null, 2);
        return message.replace(jsonMatch[0], `<pre class="log-json">${formatted}</pre>`);
      } catch {
        // Not valid JSON, continue
      }
    }
    
    // Highlight URLs
    return message.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" class="log-url">$1</a>'
    );
  }

  /**
   * Escape HTML
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Generate scenario styles
   */
  private generateScenarioStyles(theme: ReportTheme): string {
    const primaryDark = theme.colors?.primaryDark || theme.primaryColor;
    return `
<style>
/* Scenario Reports Styles */
.scenario-reports {
    display: flex;
    gap: 30px;
    margin-top: 30px;
}

.scenario-filters {
    flex: 0 0 280px;
    position: sticky;
    top: 20px;
    height: fit-content;
}

.filter-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.filter-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;
    color: #1a1a1a;
}

.filter-group {
    margin-bottom: 20px;
}

.filter-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #666;
    margin-bottom: 8px;
}

.filter-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.filter-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #333;
}

.filter-option input[type="checkbox"] {
    cursor: pointer;
}

.filter-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    min-height: 100px;
}

.duration-filter {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
}

.duration-filter input[type="range"] {
    flex: 1;
}

.filter-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.btn-apply-filters,
.btn-reset-filters {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-apply-filters {
    background: ${theme.primaryColor};
    color: white;
}

.btn-apply-filters:hover {
    background: ${primaryDark};
}

.btn-reset-filters {
    background: #f5f5f5;
    color: #666;
}

.btn-reset-filters:hover {
    background: #e0e0e0;
}

.scenario-stats {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.stat-card.mini {
    flex: 1;
    padding: 12px;
}

.scenarios-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* Scenario Report Card */
.scenario-report {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    overflow: hidden;
    transition: all 0.3s ease;
}

.scenario-report.hidden {
    display: none;
}

.scenario-report:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

/* Scenario Header */
.scenario-header {
    display: flex;
    align-items: center;
    padding: 24px;
    gap: 20px;
    border-bottom: 1px solid #f0f0f0;
}

.scenario-header.passed {
    background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
}

.scenario-header.failed {
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
}

.scenario-header.skipped {
    background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
}

.scenario-status-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: 12px;
    color: white;
    font-weight: bold;
    flex-shrink: 0;
}

.status-icon {
    font-size: 32px;
    margin-bottom: 4px;
}

.status-text {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.scenario-title-section {
    flex: 1;
}

.scenario-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #1a1a1a;
}

.scenario-keyword {
    color: ${theme.primaryColor};
    font-weight: 500;
}

.scenario-description {
    font-size: 14px;
    color: #666;
    margin: 0 0 12px 0;
    line-height: 1.5;
}

.scenario-breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #999;
}

.breadcrumb-separator {
    color: #ddd;
}

.scenario-quick-stats {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.quick-stat {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #666;
}

.stat-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

/* Scenario Body */
.scenario-body {
    padding: 0;
}

.scenario-body > section {
    padding: 24px;
    border-bottom: 1px solid #f0f0f0;
}

.scenario-body > section:last-child {
    border-bottom: none;
}

.section-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: #1a1a1a;
}

/* Metadata Grid */
.metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
}

.metadata-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.metadata-label {
    font-size: 12px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.metadata-value {
    font-size: 14px;
    color: #333;
}

.metadata-value.highlight {
    color: ${theme.primaryColor};
    font-weight: 600;
}

.tag-badge {
    display: inline-block;
    padding: 4px 8px;
    background: #f0f0f0;
    border-radius: 4px;
    font-size: 12px;
    margin-right: 4px;
}

/* Data Set Info */
.data-set-info {
    background: #f9fafb;
}

.data-set-content {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
}

.data-set-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #f0f0f0;
}

.data-set-name {
    font-weight: 600;
    color: #1a1a1a;
}

.data-set-index {
    padding: 4px 8px;
    background: ${theme.primaryColor};
    color: white;
    border-radius: 4px;
    font-size: 12px;
}

.data-set-source {
    color: #666;
    font-size: 14px;
}

.parameters-table {
    width: 100%;
    border-collapse: collapse;
}

.parameters-table td {
    padding: 8px;
    border-bottom: 1px solid #f0f0f0;
}

.param-key {
    font-weight: 500;
    color: #666;
    width: 30%;
}

.param-value {
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
}

/* Retry Info */
.retry-info {
    background: #fef3c7;
    display: flex;
    align-items: center;
    gap: 16px;
}

.retry-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #f59e0b;
    color: white;
    border-radius: 6px;
    font-weight: 500;
}

.retry-icon {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

.retry-message {
    flex: 1;
    color: #92400e;
    font-size: 14px;
}

/* Execution Timeline */
.timeline-visualization {
    background: #f9fafb;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}

.timeline-track {
    position: relative;
    height: 40px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.timeline-segment {
    position: absolute;
    height: 100%;
    transition: opacity 0.2s ease;
}

.timeline-segment:hover {
    opacity: 0.8;
}

.segment-fill {
    height: 100%;
    border-radius: 2px;
}

.timeline-segment.step.passed .segment-fill {
    background: #10b981;
}

.timeline-segment.step.failed .segment-fill {
    background: #ef4444;
}

.timeline-segment.step.skipped .segment-fill {
    background: #9ca3af;
}

.timeline-segment.hook .segment-fill {
    background: #6366f1;
}

.timeline-axis {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 12px;
    color: #666;
}

.timeline-legend {
    display: flex;
    gap: 16px;
    justify-content: center;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #666;
}

.legend-color {
    width: 16px;
    height: 16px;
    border-radius: 2px;
}

.legend-color.passed {
    background: #10b981;
}

.legend-color.failed {
    background: #ef4444;
}

.legend-color.skipped {
    background: #9ca3af;
}

.legend-color.hook {
    background: #6366f1;
}

/* Steps Section */
.hooks-container {
    margin-bottom: 16px;
}

.hooks-label {
    font-size: 14px;
    font-weight: 500;
    color: #666;
    margin-bottom: 8px;
}

.hook {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
}

.hook.failed {
    background: #fef2f2;
    border-color: #fecaca;
}

.hook-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.hook-type {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    color: #6366f1;
}

.hook-status {
    font-size: 16px;
}

.hook-duration {
    margin-left: auto;
    font-size: 12px;
    color: #666;
}

.hook-error {
    margin-top: 12px;
    padding: 12px;
    background: white;
    border-radius: 4px;
}

/* Step Container */
.step-container {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: all 0.2s ease;
}

.step-container:hover {
    border-color: #d1d5db;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.step-container.passed {
    border-left: 4px solid #10b981;
}

.step-container.failed {
    border-left: 4px solid #ef4444;
}

.step-container.skipped {
    border-left: 4px solid #9ca3af;
}

.step-header {
    display: flex;
    align-items: center;
    padding: 16px;
    gap: 16px;
}

.step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #f3f4f6;
    border-radius: 50%;
    font-size: 14px;
    font-weight: 600;
    color: #666;
    flex-shrink: 0;
}

.step-content {
    flex: 1;
}

.step-main {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.step-status-icon {
    font-size: 18px;
}

.step-keyword {
    font-weight: 600;
    color: ${theme.primaryColor};
}

.step-text {
    color: #333;
    font-size: 15px;
}

.step-parameter {
    background: #fef3c7;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
}

.step-metadata {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    color: #666;
}

.step-metadata svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

.step-location {
    display: flex;
    align-items: center;
    gap: 4px;
}

.step-ai-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: ${theme.primaryColor};
    color: white;
    border-radius: 4px;
    font-weight: 500;
}

.step-toggle {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #666;
    transition: all 0.2s ease;
}

.step-toggle:hover {
    color: #333;
}

.step-toggle svg {
    width: 24px;
    height: 24px;
    transition: transform 0.2s ease;
}

.step-toggle.expanded svg {
    transform: rotate(180deg);
}

/* Step Details */
.step-details {
    display: none;
    padding: 0 16px 16px 64px;
}

.step-details.show {
    display: block;
}

.step-data-table,
.step-doc-string,
.step-actions,
.step-embeddings,
.step-error-details,
.step-screenshot {
    margin-bottom: 16px;
}

.step-details h5 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #666;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.data-table th,
.data-table td {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid #e5e7eb;
}

.data-table th {
    background: #f9fafb;
    font-weight: 600;
}

.doc-string-content {
    background: #f9fafb;
    padding: 12px;
    border-radius: 4px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 13px;
    overflow-x: auto;
}

/* Actions Timeline */
.actions-timeline {
    position: relative;
    padding-left: 20px;
}

.action-entry {
    position: relative;
    margin-bottom: 16px;
}

.action-connector {
    position: absolute;
    left: -16px;
    top: 0;
    bottom: -16px;
    width: 2px;
    background: #e5e7eb;
}

.action-entry:last-child .action-connector {
    display: none;
}

.action-entry::before {
    content: '';
    position: absolute;
    left: -20px;
    top: 12px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5e7eb;
    border: 2px solid white;
}

.action-entry.success::before {
    background: #10b981;
}

.action-entry.failed::before {
    background: #ef4444;
}

.action-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
}

.action-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.action-index {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 600;
    color: #666;
}

.action-type {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: white;
}

.action-type.navigation {
    background: #4CAF50;
}

.action-type.click {
    background: #2196F3;
}

.action-type.input {
    background: #9C27B0;
}

.action-type.validation {
    background: #FF9800;
}

.action-type.wait {
    background: #795548;
}

.action-type.screenshot {
    background: #00BCD4;
}

.action-type.api {
    background: #F44336;
}

.action-type.database {
    background: #3F51B5;
}

.action-type.custom {
    background: #607D8B;
}

.action-duration {
    margin-left: auto;
    font-size: 12px;
    color: #666;
}

.action-details {
    font-size: 13px;
}

.action-target {
    font-weight: 500;
    color: #333;
    margin-bottom: 4px;
}

.action-description {
    color: #666;
    margin-bottom: 8px;
}

.action-parameters {
    margin-bottom: 8px;
}

.action-parameters code {
    background: #e5e7eb;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
}

.action-error {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    font-size: 12px;
}

.error-label {
    font-weight: 600;
    color: #991b1b;
}

.error-text {
    color: #dc2626;
}

.action-screenshot {
    margin-top: 8px;
}

.action-screenshot img {
    max-width: 200px;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.2s ease;
}

.action-screenshot img:hover {
    transform: scale(1.05);
}

/* Element Info */
.element-info {
    margin-top: 8px;
}

.element-details {
    font-size: 12px;
}

.element-details summary {
    cursor: pointer;
    font-weight: 500;
    color: #666;
    margin-bottom: 8px;
}

.element-properties {
    background: white;
    padding: 8px;
    border-radius: 4px;
}

.property {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
}

.property-label {
    font-weight: 500;
    color: #666;
    min-width: 80px;
}

.property code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
}

.element-state {
    display: flex;
    gap: 12px;
}

.attributes-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

/* Embeddings */
.embeddings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
}

.embedding-item {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
}

.embedding-item.image img {
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 8px;
}

.embedding-item.text pre,
.embedding-item.json pre {
    max-height: 150px;
    overflow: auto;
    text-align: left;
    font-size: 11px;
    margin-bottom: 8px;
}

.embedding-item.html iframe {
    width: 100%;
    height: 150px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    margin-bottom: 8px;
}

.embedding-name {
    font-size: 12px;
    color: #666;
}

/* Step Error */
.step-error-details {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    padding: 12px;
}

.error-content {
    font-size: 13px;
}

.error-type {
    font-weight: 600;
    color: #991b1b;
    margin-bottom: 4px;
}

.error-message {
    color: #dc2626;
    margin-bottom: 8px;
}

.error-stack-container summary {
    cursor: pointer;
    font-size: 12px;
    color: #666;
}

.error-stack {
    margin-top: 8px;
    padding: 8px;
    background: white;
    border-radius: 4px;
    font-size: 11px;
    overflow-x: auto;
}

.stack-file {
    color: #2563eb;
    font-weight: 500;
}

.error-context {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #fecaca;
}

.context-item {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 12px;
}

.context-key {
    font-weight: 500;
    color: #666;
}

.context-value {
    color: #333;
}

/* Step Screenshot */
.step-screenshot img {
    max-width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
}

/* Inline Error */
.step-inline-error {
    padding: 8px 16px 8px 64px;
    background: #fef2f2;
    color: #dc2626;
    font-size: 14px;
    border-top: 1px solid #fecaca;
}

/* Action Timeline Section */
.action-timeline-section {
    background: #f9fafb;
}

.timeline-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
}

.timeline-stats .stat {
    text-align: center;
}

.stat-value {
    display: block;
    font-size: 24px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 4px;
}

.stat-label {
    font-size: 12px;
    color: #666;
}

.action-type-breakdown {
    margin-bottom: 20px;
}

.action-types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
}

.action-type-stat {
    background: white;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
}

.type-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.type-name {
    font-size: 13px;
    font-weight: 500;
    color: #333;
}

.type-count {
    font-size: 13px;
    color: #666;
}

.type-bar {
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
}

.type-fill {
    height: 100%;
    transition: width 0.3s ease;
}

.action-timeline-viz {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
}

.action-marker {
    position: absolute;
    height: 20px;
    min-width: 2px;
    border-radius: 2px;
    transition: opacity 0.2s ease;
}

.action-marker:hover {
    opacity: 0.8;
}

.action-marker.success {
    opacity: 0.7;
}

.action-marker.failed {
    opacity: 1;
}

/* Performance Metrics */
.metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
}

.metric-card {
    display: flex;
    align-items: center;
    gap: 16px;
    background: white;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
}

.metric-icon {
    width: 48px;
    height: 48px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.metric-icon svg {
    width: 24px;
    height: 24px;
    fill: ${theme.primaryColor};
}

.metric-content {
    flex: 1;
}

.metric-value {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
}

.metric-label {
    font-size: 12px;
    color: #666;
}

.performance-insights {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
}

.performance-insights h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #333;
}

.insights-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.insight {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    font-size: 13px;
    border-bottom: 1px solid #f0f0f0;
}

.insight:last-child {
    border-bottom: none;
}

.insight.success {
    color: #065f46;
}

.insight.warning {
    color: #92400e;
}

.insight.error {
    color: #991b1b;
}

.insight.info {
    color: #1e40af;
}

.insight::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.insight.success::before {
    background: #10b981;
}

.insight.warning::before {
    background: #f59e0b;
}

.insight.error::before {
    background: #ef4444;
}

.insight.info::before {
    background: #3b82f6;
}

/* Network Activity */
.network-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
}

.summary-stat {
    text-align: center;
    padding: 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
}

.network-timeline {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 20px;
}

.timeline-header {
    display: grid;
    grid-template-columns: 3fr 80px 80px 100px 80px 80px 200px;
    gap: 8px;
    padding: 12px 16px;
    background: #f9fafb;
    font-size: 12px;
    font-weight: 600;
    color: #666;
    border-bottom: 1px solid #e5e7eb;
}

.network-entry {
    cursor: pointer;
    transition: background 0.2s ease;
}

.network-entry:hover {
    background: #f9fafb;
}

.network-entry.failed {
    background: #fef2f2;
}

.network-entry.failed:hover {
    background: #fee2e2;
}

.entry-main {
    display: grid;
    grid-template-columns: 3fr 80px 80px 100px 80px 80px 200px;
    gap: 8px;
    padding: 12px 16px;
    align-items: center;
    font-size: 13px;
}

.network-url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #333;
}

.network-method {
    font-weight: 500;
    text-transform: uppercase;
    font-size: 11px;
}

.network-method.get {
    color: #10b981;
}

.network-method.post {
    color: #3b82f6;
}

.network-method.put {
    color: #f59e0b;
}

.network-method.delete {
    color: #ef4444;
}

.network-status {
    font-weight: 500;
}

.status-2xx {
    color: #10b981;
}

.status-3xx {
    color: #3b82f6;
}

.status-4xx {
    color: #f59e0b;
}

.status-5xx {
    color: #ef4444;
}

.network-type {
    color: #666;
    font-size: 12px;
}

.network-size {
    color: #666;
    font-size: 12px;
}

.network-time {
    color: #666;
    font-size: 12px;
}

.network-bar {
    height: 20px;
    padding: 4px 0;
}

.bar-track {
    position: relative;
    height: 100%;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
}

.bar-fill {
    position: absolute;
    height: 100%;
    background: ${theme.primaryColor};
    opacity: 0.6;
}

.network-details {
    display: none;
    padding: 16px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
}

.network-details.show {
    display: block;
}

.details-section {
    margin-bottom: 16px;
}

.details-section:last-child {
    margin-bottom: 0;
}

.details-section h5 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #333;
}

.headers-list {
    font-size: 12px;
}

.header-item {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid #e5e7eb;
}

.header-item:last-child {
    border-bottom: none;
}

.header-key {
    font-weight: 500;
    color: #666;
    min-width: 150px;
}

.header-value {
    color: #333;
    word-break: break-all;
}

.body-content {
    background: white;
    padding: 12px;
    border-radius: 4px;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 12px;
    overflow-x: auto;
    max-height: 300px;
}

.breakdown-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.breakdown-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
}

.breakdown-section h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #333;
}

.breakdown-chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.breakdown-item {
    font-size: 12px;
}

.breakdown-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}

.breakdown-bar {
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
}

.breakdown-bar .bar-fill {
    height: 100%;
    background: ${theme.primaryColor};
    transition: width 0.3s ease;
}

.status-2xx .bar-fill {
    background: #10b981;
}

.status-3xx .bar-fill {
    background: #3b82f6;
}

.status-4xx .bar-fill {
    background: #f59e0b;
}

.status-5xx .bar-fill {
    background: #ef4444;
}

/* Evidence Gallery */
.screenshots-section,
.videos-section {
    margin-bottom: 20px;
}

.screenshots-section h4,
.videos-section h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #333;
}

.screenshots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
}

.screenshot-item {
    position: relative;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s ease;
}

.screenshot-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.screenshot-item img {
    width: 100%;
    height: 150px;
    object-fit: cover;
}

.screenshot-info {
    padding: 8px;
    background: white;
}

.screenshot-name {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #333;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.screenshot-timestamp {
    font-size: 11px;
    color: #666;
}

.videos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
}

.video-item {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px;
}

.video-item video {
    width: 100%;
    border-radius: 4px;
    margin-bottom: 8px;
}

.video-name {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #333;
    text-align: center;
}

/* Error Diagnostics */
.error-summary {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    padding: 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
}

.error-icon {
    width: 48px;
    height: 48px;
    background: #ef4444;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.error-icon svg {
    width: 24px;
    height: 24px;
    fill: white;
}

.error-main h4 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #991b1b;
}

.error-main p {
    font-size: 14px;
    color: #dc2626;
    margin: 0;
}

.error-stack-section,
.error-context-section,
.error-suggestions {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 16px;
}

.error-stack-section h4,
.error-context-section h4,
.error-suggestions h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #333;
}

.stack-analysis {
    margin-top: 12px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 4px;
}

.stack-analysis-result {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

.analysis-label {
    font-weight: 500;
    color: #666;
}

.analysis-file {
    color: #2563eb;
    font-weight: 500;
}

.analysis-position {
    color: #666;
}

.context-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
}

.context-grid .context-item {
    padding: 8px;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 13px;
}

.context-grid .context-key {
    display: block;
    font-weight: 500;
    color: #666;
    margin-bottom: 4px;
}

.context-grid .context-value {
    color: #333;
}

.context-value pre {
    margin: 0;
    font-size: 12px;
    overflow-x: auto;
}

.suggestions-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.suggestions-list li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 0;
    font-size: 13px;
    color: #333;
    border-bottom: 1px solid #f0f0f0;
}

.suggestions-list li:last-child {
    border-bottom: none;
}

.suggestions-list li::before {
    content: '→';
    color: ${theme.primaryColor};
    font-weight: 600;
    flex-shrink: 0;
}

/* AI Healing Section */
.healing-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 20px;
}

.healing-attempts {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
}

.healing-attempt {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
}

.healing-attempt.success {
    border-color: #10b981;
}

.healing-attempt.failed {
    border-color: #ef4444;
}

.attempt-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
}

.attempt-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 600;
    color: #666;
}

.attempt-element {
    flex: 1;
    font-weight: 500;
    color: #333;
}

.attempt-status {
    font-size: 13px;
    font-weight: 500;
}

.healing-attempt.success .attempt-status {
    color: #10b981;
}

.healing-attempt.failed .attempt-status {
    color: #ef4444;
}

.attempt-details {
    padding: 16px;
}

.detail-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 13px;
}

.detail-row:last-child {
    margin-bottom: 0;
}

.detail-label {
    font-weight: 500;
    color: #666;
    min-width: 120px;
}

.detail-row code {
    background: #f3f4f6;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
}

.confidence-bar {
    position: relative;
    flex: 1;
    height: 20px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.confidence-fill {
    position: absolute;
    height: 100%;
    background: ${theme.primaryColor};
    transition: width 0.3s ease;
}

.confidence-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 11px;
    font-weight: 500;
    color: #333;
}

.reasoning-text {
    margin: 0;
    color: #333;
    line-height: 1.5;
}

.healing-recommendations {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 16px;
}

.healing-recommendations h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #065f46;
}

.recommendations-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.recommendations-list li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    font-size: 13px;
    color: #047857;
}

.recommendations-list li::before {
    content: '✓';
    font-weight: 600;
    flex-shrink: 0;
}

/* Console Logs Section */
.logs-filter {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
}

.log-filter-option {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
}

.log-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.log-badge.error {
    background: #fef2f2;
    color: #991b1b;
}

.log-badge.warning {
    background: #fef3c7;
    color: #92400e;
}

.log-badge.info {
    background: #dbeafe;
    color: #1e40af;
}

.log-badge.debug {
    background: #f3f4f6;
    color: #4b5563;
}

.logs-container {
    max-height: 400px;
    overflow-y: auto;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
}

.console-log {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 12px;
}

.console-log:last-child {
    border-bottom: none;
}

.console-log.error {
    background: #fef2f2;
}

.console-log.warning {
    background: #fef3c7;
}

.console-log.info {
    background: #dbeafe;
}

.console-log.debug {
    background: #f9fafb;
}

.console-log.hidden {
    display: none;
}

.log-timestamp {
    color: #666;
    font-family: 'Monaco', 'Consolas', monospace;
}

.log-level {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
}

.log-level.error {
    background: #dc2626;
    color: white;
}

.log-level.warning {
    background: #f59e0b;
    color: white;
}

.log-level.info {
    background: #3b82f6;
    color: white;
}

.log-level.debug {
    background: #6b7280;
    color: white;
}

.log-source {
    color: #666;
    font-style: italic;
}

.log-message {
    flex: 1;
    color: #333;
    word-break: break-word;
}

.log-json {
    display: block;
    margin-top: 4px;
    padding: 8px;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 11px;
    overflow-x: auto;
}

.log-url {
    color: #2563eb;
    text-decoration: underline;
}

.log-stack {
    margin-top: 8px;
}

.log-stack summary {
    cursor: pointer;
    font-size: 11px;
    color: #666;
}

.log-stack pre {
    margin-top: 4px;
    padding: 8px;
    background: #f9fafb;
    border-radius: 4px;
    font-size: 11px;
    overflow-x: auto;
}

/* Scenario Footer */
.scenario-footer {
    display: flex;
    justify-content: flex-end;
    padding: 16px 24px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
}

.scenario-actions {
    display: flex;
    gap: 8px;
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #333;
    cursor: pointer;
    transition: all 0.2s ease;
}

.action-btn:hover {
    background: #f9fafb;
    border-color: #d1d5db;
}

.action-btn svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

.toggle-details svg {
    transition: transform 0.2s ease;
}

.toggle-details.expanded svg {
    transform: rotate(180deg);
}

/* Responsive Design */
@media (max-width: 1200px) {
    .scenario-reports {
        flex-direction: column;
    }
    
    .scenario-filters {
        position: static;
        flex: none;
        width: 100%;
    }
    
    .filter-section {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
    }
    
    .filter-group {
        flex: 1;
        min-width: 200px;
    }
}

@media (max-width: 768px) {
    .scenario-header {
        flex-direction: column;
        align-items: flex-start;
    }
    
    .scenario-status-indicator {
        width: 60px;
        height: 60px;
    }
    
    .metadata-grid,
    .metrics-grid,
    .timeline-stats,
    .network-summary {
        grid-template-columns: 1fr;
    }
    
    .timeline-header,
    .entry-main {
        display: block;
    }
    
    .breakdown-container {
        grid-template-columns: 1fr;
    }
}

/* Print Styles */
@media print {
    .scenario-filters,
    .scenario-actions,
    .filter-actions,
    .step-toggle {
        display: none !important;
    }
    
    .step-details {
        display: block !important;
    }
    
    .scenario-report {
        page-break-inside: avoid;
    }
    
    .network-details {
        display: block !important;
    }
}
</style>`;
  }

  /**
   * Generate scenario scripts
   */
  private generateScenarioScripts(): string {
    return `
<script>
// Scenario report interactions
(function() {
    'use strict';
    
    // Toggle step details
    window.toggleStepDetails = function(stepIndex) {
        const details = document.getElementById('step-details-' + stepIndex);
        const button = event.currentTarget;
        
        if (details) {
            const isShowing = details.classList.contains('show');
            details.classList.toggle('show');
            button.classList.toggle('expanded', !isShowing);
        }
    };
    
    // Toggle network details
    window.toggleNetworkDetails = function(index) {
        const details = document.getElementById('network-details-' + index);
        if (details) {
            details.classList.toggle('show');
        }
    };
    
    // Toggle all scenario details
    window.toggleAllScenarioDetails = function(button) {
        const allDetails = document.querySelectorAll('.step-details, .network-details');
        const isExpanded = button.classList.contains('expanded');
        
        allDetails.forEach(detail => {
            detail.classList.toggle('show', !isExpanded);
        });
        
        document.querySelectorAll('.step-toggle').forEach(toggle => {
            toggle.classList.toggle('expanded', !isExpanded);
        });
        
        button.classList.toggle('expanded');
        button.querySelector('svg').style.transform = isExpanded ? '' : 'rotate(180deg)';
        button.lastChild.textContent = isExpanded ? ' Collapse All' : ' Expand All';
    };
    
    // Image modal
    window.openImageModal = function(src) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = \`
            <div class="modal-overlay" onclick="closeImageModal()"></div>
            <div class="modal-content">
                <img src="\${src}" alt="Full size image">
                <button class="modal-close" onclick="closeImageModal()">×</button>
            </div>
        \`;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
    };
    
    window.closeImageModal = function() {
        const modal = document.querySelector('.image-modal');
        if (modal) {
            modal.remove();
            document.body.style.overflow = '';
        }
    };
    
    // Scenario filtering
    function initializeFiltering() {
        const applyButton = document.querySelector('.btn-apply-filters');
        const resetButton = document.querySelector('.btn-reset-filters');
        
        if (applyButton) {
            applyButton.addEventListener('click', applyFilters);
        }
        
        if (resetButton) {
            resetButton.addEventListener('click', resetFilters);
        }
        
        // Initialize duration sliders
        const durationMin = document.getElementById('duration-min');
        const durationMax = document.getElementById('duration-max');
        const durationMinLabel = document.getElementById('duration-min-label');
        const durationMaxLabel = document.getElementById('duration-max-label');
        
        if (durationMin) {
            durationMin.addEventListener('input', function() {
                durationMinLabel.textContent = formatDuration(parseInt(this.value));
            });
        }
        
        if (durationMax) {
            durationMax.addEventListener('input', function() {
                durationMaxLabel.textContent = formatDuration(parseInt(this.value));
            });
        }
        
        // Initialize multi-select
        const selects = document.querySelectorAll('.filter-select');
        selects.forEach(select => {
            select.addEventListener('change', function() {
                const selectedCount = this.selectedOptions.length;
                if (selectedCount > 0) {
                    this.style.height = Math.min(selectedCount * 25 + 10, 200) + 'px';
                }
            });
        });
    }
    
    function applyFilters() {
        const scenarios = document.querySelectorAll('.scenario-report');
        const statusFilters = Array.from(document.querySelectorAll('input[name="status"]:checked'))
            .map(cb => cb.value);
        const featureFilter = document.getElementById('feature-filter').value;
        const tagFilter = document.getElementById('tag-filter').value;
        const durationMin = parseInt(document.getElementById('duration-min').value);
        const durationMax = parseInt(document.getElementById('duration-max').value);
        
        let visibleCount = 0;
        let totalDuration = 0;
        
        scenarios.forEach(scenario => {
            const status = scenario.dataset.status;
            const feature = scenario.dataset.feature;
            const tags = scenario.dataset.tags.split(',');
            const duration = parseInt(scenario.dataset.duration);
            
            let show = true;
            
            // Status filter
            if (statusFilters.length > 0 && !statusFilters.includes('all')) {
                show = show && statusFilters.includes(status);
            }
            
            // Feature filter
            if (featureFilter && feature !== featureFilter) {
                show = false;
            }
            
            // Tag filter
            if (tagFilter && !tags.includes(tagFilter)) {
                show = false;
            }
            
            // Duration filter
            if (duration < durationMin || duration > durationMax) {
                show = false;
            }
            
            scenario.classList.toggle('hidden', !show);
            
            if (show) {
                visibleCount++;
                totalDuration += duration;
            }
        });
        
        // Update stats
        document.getElementById('visible-scenarios').textContent = visibleCount;
        document.getElementById('total-duration').textContent = formatDuration(totalDuration);
        document.getElementById('avg-duration').textContent = 
            visibleCount > 0 ? formatDuration(Math.round(totalDuration / visibleCount)) : '0ms';
    }
    
    function resetFilters() {
        // Reset checkboxes
        document.querySelectorAll('input[name="status"]').forEach(cb => {
            cb.checked = cb.value === 'all';
        });
        
        // Reset selects
        document.getElementById('feature-filter').value = '';
        document.getElementById('tag-filter').value = '';
        
        // Reset sliders
        document.getElementById('duration-min').value = '0';
        document.getElementById('duration-max').value = '60000';
        document.getElementById('duration-min-label').textContent = '0s';
        document.getElementById('duration-max-label').textContent = '60s';
        
        // Show all scenarios
        document.querySelectorAll('.scenario-report').forEach(scenario => {
            scenario.classList.remove('hidden');
        });
        
        // Reset stats
        const totalScenarios = document.querySelectorAll('.scenario-report').length;
        document.getElementById('visible-scenarios').textContent = totalScenarios;
    }
    
    function formatDuration(ms) {
        if (ms < 1000) return ms + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return minutes + 'm ' + seconds + 's';
    }
    
    // Console log filtering
    function initializeLogFiltering() {
        const logFilters = document.querySelectorAll('input[name="log-level"]');
        
        logFilters.forEach(filter => {
            filter.addEventListener('change', function() {
                const level = this.value;
                const logs = document.querySelectorAll(\`.console-log[data-log-level="\${level}"]\`);
                
                logs.forEach(log => {
                    log.classList.toggle('hidden', !this.checked);
                });
            });
        });
    }
    
    // Scenario actions
    window.rerunScenario = function(scenarioId) {
        console.log('Rerun scenario:', scenarioId);
        // Implement rerun logic
        alert('Rerun functionality would be implemented here');
    };
    
    window.exportScenario = function(scenarioId) {
        const scenario = document.querySelector(\`[data-scenario-id="\${scenarioId}"]\`);
        if (scenario) {
            // Create a temporary container
            const container = document.createElement('div');
            container.innerHTML = \`
                <html>
                <head>
                    <title>Scenario Report - \${scenarioId}</title>
                    <style>\${document.querySelector('style').textContent}</style>
                </head>
                <body>
                    \${scenario.outerHTML}
                </body>
                </html>
            \`;
            
            // Create blob and download
            const blob = new Blob([container.innerHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`scenario-\${scenarioId}.html\`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };
    
    window.shareScenario = function(scenarioId) {
        const url = window.location.href + '#' + scenarioId;
        
        if (navigator.share) {
            navigator.share({
                title: 'Scenario Report',
                text: 'Check out this scenario report',
                url: url
            });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                alert('Link copied to clipboard!');
            });
        } else {
            prompt('Copy this link:', url);
        }
    };
    
    // Smooth scroll to scenario
    function scrollToScenario() {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const scenario = document.querySelector(\`[data-scenario-id="\${hash}"]\`);
            if (scenario) {
                scenario.scrollIntoView({ behavior: 'smooth', block: 'start' });
                scenario.style.animation = 'highlight 2s ease';
            }
        }
    }
    
    // Initialize on load
    document.addEventListener('DOMContentLoaded', function() {
        initializeFiltering();
        initializeLogFiltering();
        scrollToScenario();
    });
    
    // Handle hash changes
    window.addEventListener('hashchange', scrollToScenario);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + F to focus filter
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.querySelector('.filter-section input')?.focus();
        }
        
        // Escape to close image modal
        if (e.key === 'Escape') {
            closeImageModal();
        }
    });
})();

// Add highlight animation
const style = document.createElement('style');
style.textContent = \`
@keyframes highlight {
    0% { box-shadow: 0 0 0 0 rgba(147, 24, 108, 0.4); }
    50% { box-shadow: 0 0 0 20px rgba(147, 24, 108, 0); }
    100% { box-shadow: 0 0 0 0 rgba(147, 24, 108, 0); }
}

.image-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
}

.modal-content {
    position: relative;
    max-width: 90%;
    max-height: 90%;
    z-index: 1;
}

.modal-content img {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
}

.modal-close {
    position: absolute;
    top: -40px;
    right: 0;
    width: 40px;
    height: 40px;
    background: white;
    border: none;
    border-radius: 50%;
    font-size: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-close:hover {
    background: #f3f4f6;
}
\`;
document.head.appendChild(style);
</script>`;
  }
}