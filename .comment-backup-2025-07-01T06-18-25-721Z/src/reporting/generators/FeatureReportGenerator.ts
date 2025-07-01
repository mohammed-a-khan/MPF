// src/reporting/generators/FeatureReportGenerator.ts

import { 
  FeatureReport, 
  ScenarioSummary, 
  StepReport,
  TestStatus,
  ReportTheme,
  STATUS_COLORS,
  STATUS_ICONS,
  BackgroundReport,
  ErrorDetails,
  ActionLog,
  DataTableRow,
  DocString,
  Embedding
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';

/**
 * Feature Report Generator - Creates Detailed Feature-Level Reports
 * 
 * Generates comprehensive feature reports with:
 * - Feature overview and statistics
 * - Scenario details with steps
 * - Error analysis
 * - Visual evidence
 * - Execution timeline
 * - Historical trends
 * 
 * Production-ready implementation with zero dependencies.
 */
export class FeatureReportGenerator {
  private readonly logger = Logger.getInstance();
  
  /**
   * Generate feature reports HTML
   */
  async generateFeatureReports(features: FeatureReport[], theme: ReportTheme): Promise<string> {
    this.logger.info(`Generating feature reports for ${features.length} features`);
    
    return `
<div class="feature-reports">
    ${this.generateFeatureNavigation(features)}
    <div class="feature-content">
        ${features.map(feature => this.generateFeatureReport(feature, theme)).join('')}
    </div>
</div>
${this.generateFeatureStyles(theme)}
${this.generateFeatureScripts()}`;
  }

  /**
   * Generate feature navigation sidebar
   */
  private generateFeatureNavigation(features: FeatureReport[]): string {
    return `
<nav class="feature-navigation">
    <div class="nav-header">
        <h3>Features</h3>
        <input type="text" class="nav-search" placeholder="Search features...">
    </div>
    <div class="nav-stats">
        <div class="nav-stat">
            <span class="stat-value">${features.length}</span>
            <span class="stat-label">Total</span>
        </div>
        <div class="nav-stat passed">
            <span class="stat-value">${features.filter(f => f.status === TestStatus.PASSED).length}</span>
            <span class="stat-label">Passed</span>
        </div>
        <div class="nav-stat failed">
            <span class="stat-value">${features.filter(f => f.status === TestStatus.FAILED).length}</span>
            <span class="stat-label">Failed</span>
        </div>
    </div>
    <ul class="nav-list">
        ${features.map((feature) => `
        <li class="nav-item ${feature.status}" data-feature-id="${feature.featureId}">
            <div class="nav-item-header">
                <span class="nav-status-icon">${STATUS_ICONS[feature.status]}</span>
                <span class="nav-feature-name">${this.truncateText(feature.feature, 30)}</span>
            </div>
            <div class="nav-item-stats">
                <span class="nav-scenarios">${feature.scenarios.length} scenarios</span>
                <span class="nav-duration">${this.formatDuration(feature.duration)}</span>
            </div>
            <div class="nav-item-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${this.calculatePassRate(feature)}%; background: ${this.getProgressColor(feature)}"></div>
                </div>
            </div>
        </li>
        `).join('')}
    </ul>
</nav>`;
  }

  /**
   * Generate individual feature report
   */
  private generateFeatureReport(feature: FeatureReport, theme: ReportTheme): string {
    const passRate = this.calculatePassRate(feature);
    
    return `
<article class="feature-report" id="feature-${feature.featureId}" data-status="${feature.status}">
    ${this.generateFeatureHeader(feature, passRate, theme)}
    ${this.generateFeatureStats(feature)}
    ${this.generateFeatureTags(feature.tags)}
    ${feature.background ? this.generateBackground(feature.background) : ''}
    ${this.generateScenarios(feature.scenarios)}
    ${this.generateFeatureTimeline(feature)}
    ${this.generateFeatureErrors(feature)}
</article>`;
  }

  /**
   * Generate feature header
   */
  private generateFeatureHeader(feature: FeatureReport, passRate: number, theme: ReportTheme): string {
    return `
<header class="feature-header ${feature.status}">
    <div class="feature-status-badge">
        <span class="status-icon">${STATUS_ICONS[feature.status]}</span>
        <span class="status-text">${feature.status.toUpperCase()}</span>
    </div>
    
    <div class="feature-info">
        <h2 class="feature-title">${feature.feature}</h2>
        ${feature.description ? `<p class="feature-description">${feature.description}</p>` : ''}
        
        <div class="feature-metadata">
            <div class="metadata-item">
                <svg class="metadata-icon" viewBox="0 0 24 24">
                    <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
                </svg>
                <span>${this.formatDate(feature.startTime)}</span>
            </div>
            
            <div class="metadata-item">
                <svg class="metadata-icon" viewBox="0 0 24 24">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                </svg>
                <span>${this.formatDuration(feature.duration)}</span>
            </div>
            
            <div class="metadata-item">
                <svg class="metadata-icon" viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                </svg>
                <span>${feature.uri}</span>
            </div>
        </div>
    </div>
    
    <div class="feature-gauge">
        ${this.generateGaugeChart(passRate, theme)}
        <div class="gauge-label">Pass Rate</div>
    </div>
</header>`;
  }

  /**
   * Generate feature statistics
   */
  private generateFeatureStats(feature: FeatureReport): string {
    const stats = feature.statistics;
    
    return `
<section class="feature-stats">
    <h3 class="section-title">Statistics</h3>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-icon scenarios">
                <svg viewBox="0 0 24 24">
                    <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${stats.totalScenarios}</div>
                <div class="stat-label">Total Scenarios</div>
                <div class="stat-breakdown">
                    <span class="passed">${stats.passedScenarios} passed</span>
                    <span class="failed">${stats.failedScenarios} failed</span>
                    <span class="skipped">${stats.skippedScenarios} skipped</span>
                </div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon steps">
                <svg viewBox="0 0 24 24">
                    <path d="M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39L6.6 1.86 2 5.71l1.29 1.53 4.59-3.85zM12.5 8H11v6l4.75 2.85.75-1.23-4-2.37V8zM12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${stats.totalSteps}</div>
                <div class="stat-label">Total Steps</div>
                <div class="stat-breakdown">
                    <span class="passed">${stats.passedSteps} passed</span>
                    <span class="failed">${stats.failedSteps} failed</span>
                    <span class="skipped">${stats.skippedSteps} skipped</span>
                </div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon duration">
                <svg viewBox="0 0 24 24">
                    <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.formatDuration(stats.avgScenarioDuration)}</div>
                <div class="stat-label">Avg Scenario Duration</div>
                <div class="stat-breakdown">
                    <span>Min: ${this.formatDuration(stats.minScenarioDuration)}</span>
                    <span>Max: ${this.formatDuration(stats.maxScenarioDuration)}</span>
                </div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon performance">
                <svg viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.calculatePassRate(feature).toFixed(1)}%</div>
                <div class="stat-label">Pass Rate</div>
                <div class="stat-mini-chart" data-feature-id="${feature.featureId}">
                    ${this.generateMiniBarChart(stats)}
                </div>
            </div>
        </div>
    </div>
</section>`;
  }

  /**
   * Generate feature tags
   */
  private generateFeatureTags(tags: string[]): string {
    if (!tags || tags.length === 0) return '';
    
    return `
<section class="feature-tags">
    <h3 class="section-title">Tags</h3>
    <div class="tags-container">
        ${tags.map(tag => `
        <span class="tag" data-tag="${tag}">
            <svg class="tag-icon" viewBox="0 0 24 24">
                <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
            </svg>
            ${tag}
        </span>
        `).join('')}
    </div>
</section>`;
  }

  /**
   * Generate background section
   */
  private generateBackground(background: BackgroundReport): string {
    return `
<section class="feature-background">
    <h3 class="section-title">
        <svg class="section-icon" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        Background
    </h3>
    <div class="background-content">
        <div class="background-header">
            <span class="background-keyword">${background.keyword}</span>
            <span class="background-name">${background.name}</span>
            <span class="background-status ${background.status}">${STATUS_ICONS[background.status]}</span>
        </div>
        ${background.description ? `<p class="background-description">${background.description}</p>` : ''}
        <div class="background-steps">
            ${background.steps.map(step => this.generateStep(step, false)).join('')}
        </div>
    </div>
</section>`;
  }

  /**
   * Generate scenarios section
   */
  private generateScenarios(scenarios: ScenarioSummary[]): string {
    return `
<section class="feature-scenarios">
    <h3 class="section-title">
        <svg class="section-icon" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
        </svg>
        Scenarios (${scenarios.length})
    </h3>
    
    <div class="scenarios-filter">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="passed">Passed</button>
        <button class="filter-btn" data-filter="failed">Failed</button>
        <button class="filter-btn" data-filter="skipped">Skipped</button>
    </div>
    
    <div class="scenarios-container">
        ${scenarios.map((scenario) => this.generateScenario(scenario)).join('')}
    </div>
</section>`;
  }

  /**
   * Generate individual scenario
   */
  private generateScenario(scenario: ScenarioSummary): string {
    const hasEvidence = false; // ScenarioSummary doesn't have evidence details
    
    return `
<div class="scenario ${scenario.status}" data-scenario-id="${scenario.scenarioId}" data-status="${scenario.status}">
    <div class="scenario-header" onclick="toggleScenario('${scenario.scenarioId}')">
        <div class="scenario-status">
            <span class="status-icon">${STATUS_ICONS[scenario.status]}</span>
        </div>
        
        <div class="scenario-info">
            <h4 class="scenario-title">
                <span class="scenario-keyword">${scenario.keyword || 'Scenario'}:</span>
                ${scenario.name}
            </h4>
            ${scenario.description ? `<p class="scenario-description">${scenario.description}</p>` : ''}
            
            <div class="scenario-metadata">
                <span class="metadata-item">
                    <svg viewBox="0 0 16 16">
                        <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
                        <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
                    </svg>
                    ${this.formatDuration(scenario.duration)}
                </span>
                
                ${scenario.retryCount > 0 ? `
                <span class="metadata-item retry">
                    <svg viewBox="0 0 16 16">
                        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                        <path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
                    </svg>
                    Retry ${scenario.retryCount}
                </span>
                ` : ''}
                
                ${scenario.parameters && Object.keys(scenario.parameters).length > 0 ? `
                <span class="metadata-item dataset">
                    <svg viewBox="0 0 16 16">
                        <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                        <path d="M8.646 6.646a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L10.293 9 8.646 7.354a.5.5 0 0 1 0-.708zm-1.292 0a.5.5 0 0 0-.708 0l-2 2a.5.5 0 0 0 0 .708l2 2a.5.5 0 0 0 .708-.708L5.707 9l1.647-1.646a.5.5 0 0 0 0-.708z"/>
                    </svg>
                    Data Set
                </span>
                ` : ''}
                
                ${hasEvidence ? `
                <span class="metadata-item evidence">
                    <svg viewBox="0 0 16 16">
                        <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                        <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/>
                    </svg>
                    Evidence
                </span>
                ` : ''}
            </div>
        </div>
        
        <div class="scenario-actions">
            <!-- Tags not available in ScenarioSummary -->
            <button class="scenario-toggle">
                <svg viewBox="0 0 24 24">
                    <path d="M7 10l5 5 5-5z"/>
                </svg>
            </button>
        </div>
    </div>
    
    <div class="scenario-content" id="scenario-content-${scenario.scenarioId}">
        <div class="scenario-summary">
            <p>Status: ${scenario.status}</p>
            <p>Duration: ${this.formatDuration(scenario.duration)}</p>
            ${scenario.retryCount > 0 ? `<p>Retries: ${scenario.retryCount}</p>` : ''}
        </div>
        
        ${scenario.steps && scenario.steps.length > 0 ? `
        <div class="scenario-steps">
            <h5>Steps</h5>
            ${scenario.steps.map((step) => this.generateSimpleStep(step)).join('')}
        </div>
        ` : ''}
        
        ${scenario.error ? this.generateSimpleError(scenario.error, scenario.errorStack) : ''}
        
        ${(scenario.screenshots && scenario.screenshots.length > 0) || 
          (scenario.videos && scenario.videos.length > 0) || 
          (scenario.logs && scenario.logs.length > 0) ? 
          this.generateSimpleEvidence(scenario) : ''}
    </div>
</div>`;
  }

  /**
   * Generate step
   */
  private generateStep(step: StepReport, includeActions: boolean): string {
    const hasAttachments = step.embeddings.length > 0 || 
                          step.rows || 
                          step.docString ||
                          (includeActions && step.actions.length > 0);
    
    return `
<div class="step ${step.status}" data-step-id="${step.stepId}">
    <div class="step-header">
        <span class="step-status">${STATUS_ICONS[step.status]}</span>
        <span class="step-keyword">${step.keyword}</span>
        <span class="step-text">${this.highlightParameters(step.text)}</span>
        <span class="step-duration">${step.duration}ms</span>
    </div>
    
    ${hasAttachments ? `
    <div class="step-attachments">
        ${step.rows ? this.generateDataTable(step.rows) : ''}
        ${step.docString ? this.generateDocString(step.docString) : ''}
        ${includeActions && step.actions.length > 0 ? this.generateActions(step.actions) : ''}
        ${step.embeddings.length > 0 ? this.generateEmbeddings(step.embeddings) : ''}
        ${step.result.error ? this.generateStepError(step.result.error) : ''}
    </div>
    ` : ''}
</div>`;
  }

  /**
   * Generate simple step for ScenarioSummary
   */
  private generateSimpleStep(step: any): string {
    return `
    <div class="step ${step.status}">
        <span class="step-keyword">${step.keyword}</span>
        <span class="step-text">${step.text}</span>
        <span class="step-status">${STATUS_ICONS[step.status as TestStatus]}</span>
        ${step.duration ? `<span class="step-duration">${step.duration}ms</span>` : ''}
        ${step.error ? `<div class="step-error">${step.error}</div>` : ''}
    </div>`;
  }

  /**
   * Generate simple error for ScenarioSummary
   */
  private generateSimpleError(error: string, errorStack?: string): string {
    return `
    <div class="scenario-error">
        <h5 class="error-title">Error Details</h5>
        <div class="error-message">${error}</div>
        ${errorStack ? `
        <details class="error-stack-container">
            <summary>Stack Trace</summary>
            <pre class="error-stack">${errorStack}</pre>
        </details>
        ` : ''}
    </div>`;
  }

  /**
   * Generate simple evidence for ScenarioSummary
   */
  private generateSimpleEvidence(scenario: ScenarioSummary): string {
    return `
    <div class="scenario-evidence">
        <h5 class="evidence-title">Evidence</h5>
        
        ${scenario.screenshots && scenario.screenshots.length > 0 ? `
        <div class="evidence-section screenshots">
            <h6>Screenshots (${scenario.screenshots.length})</h6>
            <div class="screenshot-gallery">
                ${scenario.screenshots.map((screenshot, index) => `
                <div class="screenshot-item">
                    <img src="${screenshot.path}" 
                         alt="${screenshot.name || `Screenshot ${index + 1}`}" 
                         onclick="openImageModal(this.src)">
                    <span class="screenshot-label">${screenshot.name || `Screenshot ${index + 1}`}</span>
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        ${scenario.videos && scenario.videos.length > 0 ? `
        <div class="evidence-section videos">
            <h6>Videos (${scenario.videos.length})</h6>
            <div class="video-list">
                ${scenario.videos.map((video, index) => `
                <div class="video-item">
                    <a href="${video.path}" target="_blank">
                        ${video.name || `Video ${index + 1}`}
                    </a>
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        ${scenario.logs && scenario.logs.length > 0 ? `
        <div class="evidence-section logs">
            <h6>Console Logs</h6>
            <div class="console-logs">
                ${scenario.logs.slice(0, 10).map(log => `
                <div class="log-entry ${log.level}">
                    <span class="log-timestamp">${this.formatTime(log.timestamp)}</span>
                    <span class="log-level">[${log.level}]</span>
                    <span class="log-message">${log.message}</span>
                </div>
                `).join('')}
                ${scenario.logs.length > 10 ? `<div class="logs-truncated">... and ${scenario.logs.length - 10} more logs</div>` : ''}
            </div>
        </div>
        ` : ''}
    </div>`;
  }


  /**
   * Generate data table
   */
  private generateDataTable(rows: DataTableRow[]): string {
    if (!rows || rows.length === 0) return '';
    
    return `
<div class="data-table-container">
    <table class="data-table">
        ${rows.map((row, index) => `
        <tr class="${index === 0 ? 'header-row' : ''}">
            ${row.cells.map((cell: string) => `
            <${index === 0 ? 'th' : 'td'}>${cell}</${index === 0 ? 'th' : 'td'}>
            `).join('')}
        </tr>
        `).join('')}
    </table>
</div>`;
  }

  /**
   * Generate doc string
   */
  private generateDocString(docString: DocString): string {
    return `
<div class="doc-string">
    <div class="doc-string-header">
        <span class="doc-string-type">${docString.contentType || 'text/plain'}</span>
    </div>
    <pre class="doc-string-content">${this.escapeHtml(docString.content)}</pre>
</div>`;
  }

  /**
   * Generate actions timeline
   */
  private generateActions(actions: ActionLog[]): string {
    return `
<div class="actions-timeline">
    <h6 class="actions-title">Actions Timeline</h6>
    <div class="actions-list">
        ${actions.map(action => `
        <div class="action-item ${action.success ? 'success' : 'failed'}">
            <div class="action-marker"></div>
            <div class="action-content">
                <div class="action-header">
                    <span class="action-type">${action.type}</span>
                    <span class="action-target">${action.target}</span>
                    <span class="action-duration">${action.duration}ms</span>
                </div>
                <div class="action-details">
                    <span class="action-name">${action.action}</span>
                    ${action.parameters.length > 0 ? `
                    <span class="action-params">(${action.parameters.map(p => JSON.stringify(p)).join(', ')})</span>
                    ` : ''}
                </div>
                ${action.error ? `<div class="action-error">${action.error}</div>` : ''}
                ${action.screenshot ? `
                <div class="action-screenshot">
                    <img src="${action.screenshot}" alt="Action screenshot" onclick="openImageModal(this.src)">
                </div>
                ` : ''}
            </div>
        </div>
        `).join('')}
    </div>
</div>`;
  }

  /**
   * Generate embeddings
   */
  private generateEmbeddings(embeddings: Embedding[]): string {
    return `
<div class="embeddings">
    ${embeddings.map((embed) => {
      if (embed.mimeType.startsWith('image/')) {
        return `
        <div class="embedding image-embedding">
            <img src="data:${embed.mimeType};base64,${embed.data}" 
                 alt="${embed.name || 'Screenshot'}" 
                 onclick="openImageModal(this.src)">
        </div>`;
      } else if (embed.mimeType === 'text/plain') {
        return `
        <div class="embedding text-embedding">
            <pre>${atob(embed.data)}</pre>
        </div>`;
      } else if (embed.mimeType === 'application/json') {
        return `
        <div class="embedding json-embedding">
            <pre>${JSON.stringify(JSON.parse(atob(embed.data)), null, 2)}</pre>
        </div>`;
      }
      return '';
    }).join('')}
</div>`;
  }


  /**
   * Generate step error
   */
  private generateStepError(error: ErrorDetails): string {
    return `
<div class="step-error">
    <div class="step-error-message">${error.message}</div>
    ${error.stack ? `
    <details class="step-error-details">
        <summary>Details</summary>
        <pre class="step-error-stack">${this.formatStackTrace(error.stack)}</pre>
    </details>
    ` : ''}
</div>`;
  }



  /**
   * Generate feature timeline
   */
  private generateFeatureTimeline(feature: FeatureReport): string {
    const scenarios = feature.scenarios;
    const totalDuration = feature.endTime.getTime() - feature.startTime.getTime();
    
    return `
<section class="feature-timeline">
    <h3 class="section-title">Execution Timeline</h3>
    <div class="timeline-container">
        <div class="timeline-header">
            <span class="timeline-start">${this.formatTime(feature.startTime)}</span>
            <span class="timeline-duration">${this.formatDuration(totalDuration)}</span>
            <span class="timeline-end">${this.formatTime(feature.endTime)}</span>
        </div>
        
        <div class="timeline-chart">
            ${scenarios.map(scenario => {
              if (!scenario.startTime || !scenario.endTime) {
                return ''; // Skip scenarios without timing info
              }
              const startOffset = ((scenario.startTime.getTime() - feature.startTime.getTime()) / totalDuration) * 100;
              const width = ((scenario.endTime.getTime() - scenario.startTime.getTime()) / totalDuration) * 100;
              
              return `
              <div class="timeline-item ${scenario.status}" 
                   style="left: ${startOffset}%; width: ${width}%"
                   title="${scenario.name} - ${this.formatDuration(scenario.duration)}">
                <div class="timeline-bar"></div>
                <div class="timeline-label">${this.truncateText(scenario.name, 20)}</div>
              </div>`;
            }).join('')}
        </div>
        
        <div class="timeline-scale">
            ${Array.from({length: 11}, (_, i) => `
            <div class="scale-marker" style="left: ${i * 10}%">
                <div class="scale-line"></div>
                <div class="scale-label">${i * 10}%</div>
            </div>
            `).join('')}
        </div>
    </div>
</section>`;
  }

  /**
   * Generate feature errors section
   */
  private generateFeatureErrors(feature: FeatureReport): string {
    const failedScenarios = feature.scenarios.filter(s => s.status === TestStatus.FAILED);
    if (failedScenarios.length === 0) return '';
    
    const errors = failedScenarios
      .filter(s => s.error)
      .map(s => ({ 
        scenario: s.name, 
        error: {
          type: 'Error',
          message: s.error!,
          similar: [] as string[]
        }
      }));
    
    return `
<section class="feature-errors">
    <h3 class="section-title">
        <svg class="section-icon" viewBox="0 0 24 24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
        </svg>
        Error Summary (${errors.length})
    </h3>
    
    <div class="errors-list">
        ${errors.map(({ scenario, error }) => `
        <div class="error-item">
            <div class="error-scenario">${scenario}</div>
            <div class="error-type">${error.type}</div>
            <div class="error-message">${error.message}</div>
            ${error.similar && error.similar.length > 0 ? `
            <div class="similar-errors">
                <span class="similar-label">Similar errors in:</span>
                ${error.similar.map((s: string) => `<span class="similar-item">${s}</span>`).join('')}
            </div>
            ` : ''}
        </div>
        `).join('')}
    </div>
</section>`;
  }

  /**
   * Generate gauge chart SVG
   */
  private generateGaugeChart(value: number, theme: ReportTheme): string {
    const radius = 60;
    const strokeWidth = 10;
    const normalizedRadius = radius - strokeWidth * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (value / 100) * circumference;
    
    const color = value >= 90 ? theme.successColor : 
                  value >= 70 ? theme.warningColor : 
                  theme.failureColor;
    
    return `
<svg class="gauge-svg" width="140" height="140" viewBox="0 0 140 140">
    <circle
        stroke="#2a2a4a"
        fill="transparent"
        stroke-width="${strokeWidth}"
        r="${normalizedRadius}"
        cx="70"
        cy="70"
    />
    <circle
        stroke="${color}"
        fill="transparent"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${circumference} ${circumference}"
        style="stroke-dashoffset: ${strokeDashoffset}; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 1s ease"
        r="${normalizedRadius}"
        cx="70"
        cy="70"
    />
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" class="gauge-value">${value.toFixed(1)}%</text>
</svg>`;
  }

  /**
   * Generate mini bar chart SVG
   */
  private generateMiniBarChart(stats: FeatureReport['statistics']): string {
    const passed = stats.passedScenarios;
    const failed = stats.failedScenarios;
    const skipped = stats.skippedScenarios;
    const total = passed + failed + skipped;
    
    if (total === 0) return '';
    
    const passedWidth = (passed / total) * 100;
    const failedWidth = (failed / total) * 100;
    const skippedWidth = (skipped / total) * 100;
    
    return `
<svg class="mini-bar-chart" width="100%" height="20">
    <rect x="0" y="0" width="${passedWidth}%" height="20" fill="${STATUS_COLORS.passed}" />
    <rect x="${passedWidth}%" y="0" width="${failedWidth}%" height="20" fill="${STATUS_COLORS.failed}" />
    <rect x="${passedWidth + failedWidth}%" y="0" width="${skippedWidth}%" height="20" fill="${STATUS_COLORS.skipped}" />
</svg>`;
  }

  /**
   * Generate feature styles
   */
  private generateFeatureStyles(theme: ReportTheme): string {
    return `
<style>
/* ========================================
   FEATURE REPORT STYLES - PRODUCTION READY
   ======================================== */

/* Feature Reports Container */
.feature-reports {
    display: flex;
    gap: 30px;
    position: relative;
}

/* Feature Navigation */
.feature-navigation {
    width: 300px;
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 20px;
    position: sticky;
    top: 20px;
    height: calc(100vh - 40px);
    overflow-y: auto;
}

.nav-header {
    margin-bottom: 20px;
}

.nav-header h3 {
    color: #fff;
    font-size: 1.3rem;
    margin-bottom: 15px;
}

.nav-search {
    width: 100%;
    padding: 10px 15px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 14px;
}

.nav-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 20px;
}

.nav-stat {
    text-align: center;
    padding: 10px;
    background: #0f0f23;
    border-radius: 8px;
    border: 1px solid #2a2a4a;
}

.nav-stat.passed {
    border-color: ${theme.successColor};
}

.nav-stat.failed {
    border-color: ${theme.failureColor};
}

.stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
}

.stat-label {
    display: block;
    font-size: 0.8rem;
    color: #a0a0a0;
    text-transform: uppercase;
}

.nav-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.nav-item {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.nav-item:hover {
    transform: translateX(5px);
    border-color: ${theme.primaryColor};
}

.nav-item.active {
    background: ${theme.primaryColor}20;
    border-color: ${theme.primaryColor};
}

.nav-item.passed {
    border-left: 4px solid ${theme.successColor};
}

.nav-item.failed {
    border-left: 4px solid ${theme.failureColor};
}

.nav-item.skipped {
    border-left: 4px solid #6c757d;
}

.nav-item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.nav-status-icon {
    font-size: 1.2rem;
}

.nav-feature-name {
    flex: 1;
    font-weight: 600;
    color: #fff;
}

.nav-item-stats {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #a0a0a0;
    margin-bottom: 8px;
}

.nav-item-progress {
    margin-top: 8px;
}

.progress-bar {
    height: 4px;
    background: #0f0f23;
    border-radius: 2px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    transition: width 0.5s ease;
}

/* Feature Content */
.feature-content {
    flex: 1;
    min-width: 0;
}

/* Feature Report */
.feature-report {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    margin-bottom: 30px;
    overflow: hidden;
    animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Feature Header */
.feature-header {
    padding: 30px;
    background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
    border-bottom: 1px solid #2a2a4a;
    display: flex;
    gap: 30px;
    align-items: center;
}

.feature-header.passed {
    background: linear-gradient(135deg, ${theme.successColor}10 0%, #0f0f23 100%);
}

.feature-header.failed {
    background: linear-gradient(135deg, ${theme.failureColor}10 0%, #0f0f23 100%);
}

.feature-status-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 15px;
}

.status-icon {
    font-size: 3rem;
    margin-bottom: 5px;
}

.status-text {
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.feature-info {
    flex: 1;
}

.feature-title {
    font-size: 2rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 10px;
}

.feature-description {
    color: #a0a0a0;
    margin-bottom: 20px;
    font-size: 1.1rem;
}

.feature-metadata {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
}

.metadata-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #a0a0a0;
}

.metadata-icon {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

.feature-gauge {
    text-align: center;
}

.gauge-svg {
    margin-bottom: 10px;
}

.gauge-value {
    font-size: 24px;
    font-weight: 700;
    fill: #fff;
}

.gauge-label {
    font-size: 0.9rem;
    color: #a0a0a0;
}

/* Feature Stats */
.feature-stats {
    padding: 30px;
    border-bottom: 1px solid #2a2a4a;
}

.section-title {
    font-size: 1.3rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.section-icon {
    width: 24px;
    height: 24px;
    fill: ${theme.primaryColor};
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
}

.stat-card {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    gap: 15px;
    transition: all 0.3s ease;
}

.stat-card:hover {
    transform: translateY(-2px);
    border-color: ${theme.primaryColor};
}

.stat-icon {
    width: 50px;
    height: 50px;
    background: ${theme.primaryColor}20;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.stat-icon svg {
    width: 24px;
    height: 24px;
    fill: ${theme.primaryColor};
}

.stat-content {
    flex: 1;
}

.stat-value {
    font-size: 1.8rem;
    font-weight: 700;
    color: #fff;
    line-height: 1;
}

.stat-label {
    font-size: 0.9rem;
    color: #a0a0a0;
    margin-top: 5px;
}

.stat-breakdown {
    display: flex;
    gap: 10px;
    margin-top: 10px;
    font-size: 0.85rem;
}

.stat-breakdown span {
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
}

.stat-breakdown .passed {
    color: ${theme.successColor};
}

.stat-breakdown .failed {
    color: ${theme.failureColor};
}

.stat-breakdown .skipped {
    color: #6c757d;
}

.stat-mini-chart {
    margin-top: 10px;
}

/* Feature Tags */
.feature-tags {
    padding: 20px 30px;
    border-bottom: 1px solid #2a2a4a;
}

.tags-container {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    background: ${theme.primaryColor}20;
    border: 1px solid ${theme.primaryColor}40;
    border-radius: 20px;
    color: ${theme.primaryColor};
    font-size: 0.85rem;
    transition: all 0.3s ease;
    cursor: pointer;
}

.tag:hover {
    background: ${theme.primaryColor}30;
    transform: translateY(-2px);
}

.tag-icon {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

/* Background Section */
.feature-background {
    padding: 30px;
    border-bottom: 1px solid #2a2a4a;
    background: rgba(147, 24, 108, 0.05);
}

.background-content {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 10px;
    padding: 20px;
}

.background-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
}

.background-keyword {
    font-weight: 600;
    color: ${theme.primaryColor};
}

.background-name {
    flex: 1;
    color: #fff;
}

.background-status {
    font-size: 1.2rem;
}

.background-description {
    color: #a0a0a0;
    margin-bottom: 15px;
}

/* Scenarios Section */
.feature-scenarios {
    padding: 30px;
}

.scenarios-filter {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.filter-btn {
    padding: 8px 16px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    color: #a0a0a0;
    cursor: pointer;
    transition: all 0.3s ease;
}

.filter-btn:hover {
    border-color: ${theme.primaryColor};
    color: #fff;
}

.filter-btn.active {
    background: ${theme.primaryColor};
    border-color: ${theme.primaryColor};
    color: #fff;
}

/* Scenario */
.scenario {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 12px;
    margin-bottom: 20px;
    overflow: hidden;
    transition: all 0.3s ease;
}

.scenario.passed {
    border-left: 4px solid ${theme.successColor};
}

.scenario.failed {
    border-left: 4px solid ${theme.failureColor};
}

.scenario.skipped {
    border-left: 4px solid #6c757d;
}

.scenario-header {
    padding: 20px;
    display: flex;
    gap: 15px;
    cursor: pointer;
    user-select: none;
}

.scenario-header:hover {
    background: rgba(147, 24, 108, 0.05);
}

.scenario-status {
    font-size: 1.5rem;
    line-height: 1;
}

.scenario-info {
    flex: 1;
}

.scenario-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 5px;
}

.scenario-keyword {
    color: ${theme.primaryColor};
    margin-right: 5px;
}

.scenario-description {
    color: #a0a0a0;
    margin-bottom: 10px;
}

.scenario-metadata {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    font-size: 0.85rem;
    color: #a0a0a0;
}

.scenario-metadata .metadata-item {
    display: flex;
    align-items: center;
    gap: 5px;
}

.scenario-metadata svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

.scenario-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.scenario-tag {
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    font-size: 0.75rem;
    color: #a0a0a0;
}

.scenario-toggle {
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s ease;
}

.scenario-toggle svg {
    width: 24px;
    height: 24px;
    fill: #a0a0a0;
}

.scenario.expanded .scenario-toggle svg {
    transform: rotate(180deg);
}

.scenario-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
}

.scenario.expanded .scenario-content {
    max-height: none;
}

/* Steps */
.scenario-steps {
    padding: 0 20px 20px;
}

.step {
    margin-bottom: 10px;
    padding: 12px 15px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    transition: all 0.3s ease;
}

.step:hover {
    background: rgba(255, 255, 255, 0.05);
}

.step.passed {
    border-left: 3px solid ${theme.successColor};
}

.step.failed {
    border-left: 3px solid ${theme.failureColor};
    background: rgba(220, 53, 69, 0.05);
}

.step.skipped {
    border-left: 3px solid #6c757d;
    opacity: 0.6;
}

.step-header {
    display: flex;
    align-items: center;
    gap: 10px;
}

.step-status {
    font-size: 1.1rem;
}

.step-keyword {
    font-weight: 600;
    color: ${theme.primaryColor};
}

.step-text {
    flex: 1;
    color: #e0e0e0;
}

.step-text .step-parameter {
    color: ${theme.warningColor};
    font-weight: 600;
}

.step-duration {
    font-size: 0.85rem;
    color: #a0a0a0;
}

.step-attachments {
    margin-top: 15px;
}

/* Data Table */
.data-table-container {
    margin-top: 10px;
    overflow-x: auto;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
}

.data-table th,
.data-table td {
    padding: 8px 12px;
    border: 1px solid #2a2a4a;
    text-align: left;
}

.data-table th {
    background: rgba(147, 24, 108, 0.1);
    font-weight: 600;
    color: #fff;
}

.data-table td {
    background: #0f0f23;
    color: #e0e0e0;
}

/* Doc String */
.doc-string {
    margin-top: 10px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    overflow: hidden;
}

.doc-string-header {
    padding: 8px 12px;
    background: rgba(147, 24, 108, 0.1);
    border-bottom: 1px solid #2a2a4a;
    font-size: 0.85rem;
    color: #a0a0a0;
}

.doc-string-content {
    padding: 12px;
    margin: 0;
    color: #e0e0e0;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.9rem;
    white-space: pre-wrap;
}

/* Actions Timeline */
.actions-timeline {
    margin-top: 15px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 15px;
}

.actions-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 15px;
}

.actions-list {
    position: relative;
    padding-left: 20px;
}

.actions-list::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #2a2a4a;
}

.action-item {
    position: relative;
    margin-bottom: 15px;
}

.action-marker {
    position: absolute;
    left: -14px;
    top: 8px;
    width: 10px;
    height: 10px;
    background: ${theme.primaryColor};
    border: 2px solid #0f0f23;
    border-radius: 50%;
}

.action-item.failed .action-marker {
    background: ${theme.failureColor};
}

.action-content {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 10px;
}

.action-header {
    display: flex;
    gap: 10px;
    margin-bottom: 5px;
    font-size: 0.85rem;
}

.action-type {
    font-weight: 600;
    color: ${theme.primaryColor};
}

.action-target {
    color: #a0a0a0;
}

.action-duration {
    margin-left: auto;
    color: #6c757d;
}

.action-details {
    font-size: 0.85rem;
    color: #e0e0e0;
}

.action-params {
    color: #a0a0a0;
}

.action-error {
    margin-top: 5px;
    padding: 5px 8px;
    background: rgba(220, 53, 69, 0.1);
    border-radius: 4px;
    color: ${theme.failureColor};
    font-size: 0.85rem;
}

.action-screenshot {
    margin-top: 10px;
}

.action-screenshot img {
    max-width: 200px;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.3s ease;
}

.action-screenshot img:hover {
    transform: scale(1.05);
}

/* Embeddings */
.embeddings {
    margin-top: 15px;
}

.embedding {
    margin-bottom: 10px;
}

.image-embedding img {
    max-width: 100%;
    border-radius: 8px;
    cursor: pointer;
}

.text-embedding pre,
.json-embedding pre {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 12px;
    margin: 0;
    color: #e0e0e0;
    font-size: 0.85rem;
    overflow-x: auto;
}

/* Errors */
.scenario-error,
.step-error {
    margin-top: 15px;
}

.error-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1rem;
    font-weight: 600;
    color: ${theme.failureColor};
    margin-bottom: 15px;
}

.error-icon {
    width: 24px;
    height: 24px;
    fill: currentColor;
}

.error-content {
    background: rgba(220, 53, 69, 0.05);
    border: 1px solid rgba(220, 53, 69, 0.2);
    border-radius: 8px;
    padding: 20px;
}

.error-type {
    font-size: 0.85rem;
    font-weight: 600;
    color: ${theme.failureColor};
    text-transform: uppercase;
    margin-bottom: 5px;
}

.error-message {
    font-size: 1rem;
    color: #fff;
    margin-bottom: 15px;
}

.error-stack-container {
    margin-top: 15px;
}

.error-stack-container summary {
    cursor: pointer;
    color: #a0a0a0;
    font-size: 0.9rem;
    margin-bottom: 10px;
}

.error-stack {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 15px;
    margin: 0;
    color: #e0e0e0;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.85rem;
    overflow-x: auto;
}

.error-stack .stack-file {
    color: ${theme.infoColor};
}

.error-stack .stack-function {
    color: ${theme.warningColor};
}

.error-context {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #2a2a4a;
}

.context-item {
    display: flex;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 0.9rem;
}

.context-label {
    font-weight: 600;
    color: #a0a0a0;
    min-width: 100px;
}

.context-value {
    color: #e0e0e0;
}

.error-screenshot {
    margin-top: 20px;
}

.error-screenshot h6 {
    font-size: 0.95rem;
    color: #a0a0a0;
    margin-bottom: 10px;
}

.error-screenshot img {
    max-width: 100%;
    border-radius: 8px;
    cursor: pointer;
}

.step-error {
    margin-top: 10px;
}

.step-error-message {
    padding: 8px 12px;
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.2);
    border-radius: 6px;
    color: ${theme.failureColor};
    font-size: 0.9rem;
}

.step-error-details {
    margin-top: 10px;
}

.step-error-details summary {
    cursor: pointer;
    color: #a0a0a0;
    font-size: 0.85rem;
}

.step-error-stack {
    margin-top: 10px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 10px;
    font-family: monospace;
    font-size: 0.8rem;
    color: #e0e0e0;
}

/* Evidence Section */
.scenario-evidence {
    padding: 20px;
    background: rgba(23, 162, 184, 0.05);
    border-top: 1px solid #2a2a4a;
}

.evidence-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 20px;
}

.evidence-section {
    margin-bottom: 25px;
}

.evidence-section h6 {
    font-size: 0.95rem;
    color: #a0a0a0;
    margin-bottom: 15px;
}

.screenshot-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
}

.screenshot-item {
    position: relative;
}

.screenshot-item img {
    width: 100%;
    height: 100px;
    object-fit: cover;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.3s ease;
}

.screenshot-item:hover img {
    transform: scale(1.05);
}

.screenshot-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 0.75rem;
    text-align: center;
    border-radius: 0 0 8px 8px;
}

.evidence-video {
    width: 100%;
    max-width: 600px;
    border-radius: 8px;
}

.trace-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: ${theme.primaryColor};
    color: #fff;
    text-decoration: none;
    border-radius: 8px;
    transition: all 0.3s ease;
}

.trace-link:hover {
    background: ${theme.primaryColor}dd;
    transform: translateY(-2px);
}

.trace-link svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

.network-har-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    color: #e0e0e0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.network-har-btn:hover {
    background: #2a2a4a;
    transform: translateY(-2px);
}

.network-har-btn svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
}

.console-log-viewer {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 15px;
    max-height: 300px;
    overflow-y: auto;
}

.console-log-entry {
    display: flex;
    gap: 10px;
    padding: 5px 0;
    font-family: monospace;
    font-size: 0.85rem;
    border-bottom: 1px solid #2a2a4a;
}

.console-log-entry:last-child {
    border-bottom: none;
}

.console-log-entry.error {
    color: ${theme.failureColor};
}

.console-log-entry.warning {
    color: ${theme.warningColor};
}

.console-log-entry.info {
    color: ${theme.infoColor};
}

.log-timestamp {
    color: #6c757d;
    min-width: 80px;
}

.log-level {
    font-weight: 600;
    text-transform: uppercase;
    min-width: 60px;
}

.log-message {
    flex: 1;
}

.log-source {
    color: #6c757d;
    font-size: 0.8rem;
}

/* AI Healing Info */
.ai-healing-info {
    padding: 20px;
    background: rgba(147, 24, 108, 0.05);
    border-top: 1px solid #2a2a4a;
}

.healing-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.1rem;
    font-weight: 600;
    color: ${theme.primaryColor};
    margin-bottom: 20px;
}

.healing-icon {
    width: 24px;
    height: 24px;
    fill: currentColor;
}

.healing-attempt {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
}

.healing-attempt.success {
    border-color: ${theme.successColor}40;
}

.healing-attempt.failed {
    border-color: ${theme.failureColor}40;
}

.attempt-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
}

.attempt-element {
    font-weight: 600;
    color: #fff;
}

.attempt-confidence {
    color: ${theme.primaryColor};
    font-size: 0.9rem;
}

.attempt-details {
    margin-top: 10px;
}

.locator-change {
    display: grid;
    gap: 10px;
}

.locator {
    display: flex;
    gap: 10px;
    align-items: center;
}

.locator-label {
    min-width: 80px;
    font-size: 0.85rem;
    color: #a0a0a0;
}

.locator code {
    flex: 1;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.85rem;
    color: #e0e0e0;
}

.attempt-metadata {
    display: flex;
    gap: 20px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #2a2a4a;
    font-size: 0.85rem;
    color: #a0a0a0;
}

/* Feature Timeline */
.feature-timeline {
    padding: 30px;
    border-bottom: 1px solid #2a2a4a;
}

.timeline-container {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 10px;
    padding: 20px;
}

.timeline-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
    font-size: 0.9rem;
    color: #a0a0a0;
}

.timeline-chart {
    position: relative;
    height: 100px;
    margin-bottom: 30px;
    background: repeating-linear-gradient(
        90deg,
        #2a2a4a,
        #2a2a4a 1px,
        transparent 1px,
        transparent 10%
    );
}

.timeline-item {
    position: absolute;
    height: 40px;
    top: 30px;
    background: ${theme.primaryColor};
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
}

.timeline-item:hover {
    transform: scaleY(1.1);
    z-index: 10;
}

.timeline-item.passed {
    background: ${theme.successColor};
}

.timeline-item.failed {
    background: ${theme.failureColor};
}

.timeline-item.skipped {
    background: #6c757d;
}

.timeline-bar {
    height: 100%;
    background: rgba(255, 255, 255, 0.1);
}

.timeline-label {
    position: absolute;
    bottom: -20px;
    left: 0;
    font-size: 0.75rem;
    color: #a0a0a0;
    white-space: nowrap;
}

.timeline-scale {
    position: relative;
    height: 20px;
}

.scale-marker {
    position: absolute;
    width: 1px;
}

.scale-line {
    width: 1px;
    height: 10px;
    background: #2a2a4a;
}

.scale-label {
    position: absolute;
    top: 12px;
    transform: translateX(-50%);
    font-size: 0.75rem;
    color: #6c757d;
}

/* Feature Errors */
.feature-errors {
    padding: 30px;
}

.errors-list {
    display: grid;
    gap: 15px;
}

.error-item {
    background: rgba(220, 53, 69, 0.05);
    border: 1px solid rgba(220, 53, 69, 0.2);
    border-radius: 8px;
    padding: 15px;
}

.error-scenario {
    font-weight: 600;
    color: #fff;
    margin-bottom: 5px;
}

.error-type {
    font-size: 0.85rem;
    color: ${theme.failureColor};
    text-transform: uppercase;
    margin-bottom: 5px;
}

.error-message {
    color: #e0e0e0;
    margin-bottom: 10px;
}

.similar-errors {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.85rem;
}

.similar-label {
    color: #a0a0a0;
}

.similar-item {
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #e0e0e0;
}

/* Hooks Section */
.hooks-section {
    margin-bottom: 15px;
    padding: 10px;
    background: rgba(147, 24, 108, 0.05);
    border-radius: 8px;
}

.hooks-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #a0a0a0;
    margin-bottom: 10px;
}

.hooks-list {
    display: grid;
    gap: 8px;
}

.hook {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    font-size: 0.85rem;
}

.hook.failed {
    border-color: ${theme.failureColor}40;
}

.hook-type {
    font-weight: 600;
    color: ${theme.primaryColor};
}

.hook-status {
    font-size: 1rem;
}

.hook-duration {
    margin-left: auto;
    color: #6c757d;
}

.hook-error {
    flex: 1;
    margin-left: 10px;
    color: ${theme.failureColor};
}

/* Image Modal */
.image-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: pointer;
}

.image-modal.active {
    display: flex;
}

.modal-image {
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
}

.modal-close {
    position: absolute;
    top: 20px;
    right: 40px;
    font-size: 3rem;
    color: #fff;
    cursor: pointer;
    transition: color 0.3s ease;
}

.modal-close:hover {
    color: ${theme.primaryColor};
}

/* Responsive Design */
@media (max-width: 1200px) {
    .feature-reports {
        flex-direction: column;
    }
    
    .feature-navigation {
        width: 100%;
        position: static;
        height: auto;
        margin-bottom: 30px;
    }
    
    .feature-header {
        flex-direction: column;
        text-align: center;
    }
    
    .stats-grid {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
}

@media (max-width: 768px) {
    .feature-title {
        font-size: 1.5rem;
    }
    
    .scenario-header {
        flex-direction: column;
        gap: 10px;
    }
    
    .scenario-metadata {
        flex-direction: column;
        gap: 5px;
    }
    
    .screenshot-gallery {
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    }
}

/* Print Styles */
@media print {
    .feature-navigation {
        display: none;
    }
    
    .scenario-toggle,
    .filter-btn,
    .trace-link,
    .network-har-btn {
        display: none;
    }
    
    .scenario-content {
        max-height: none !important;
    }
    
    .feature-report {
        break-inside: avoid;
    }
}
</style>`;
  }

  /**
   * Generate feature scripts
   */
  private generateFeatureScripts(): string {
    return `
<script>
// ========================================
// FEATURE REPORT SCRIPTS - PRODUCTION READY
// ========================================

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    initializeFeatureReports();
});

/**
 * Initialize feature reports
 */
function initializeFeatureReports() {
    setupNavigation();
    setupFilters();
    setupScenarioToggles();
    setupImageModal();
    setupSearch();
    highlightActiveFeature();
    setupTagFiltering();
}

/**
 * Setup navigation
 */
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const featureId = this.getAttribute('data-feature-id');
            const featureElement = document.getElementById('feature-' + featureId);
            
            if (featureElement) {
                // Remove active class from all items
                navItems.forEach(item => item.classList.remove('active'));
                
                // Add active class to clicked item
                this.classList.add('active');
                
                // Scroll to feature with offset for sticky header
                const offset = 100;
                const elementPosition = featureElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Setup search functionality
 */
function setupSearch() {
    const searchInput = document.querySelector('.nav-search');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const navItems = document.querySelectorAll('.nav-item');
            
            navItems.forEach(item => {
                const featureName = item.querySelector('.nav-feature-name').textContent.toLowerCase();
                const isVisible = featureName.includes(searchTerm);
                
                item.style.display = isVisible ? 'block' : 'none';
            });
        });
    }
}

/**
 * Setup scenario filters
 */
function setupFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const scenarios = document.querySelectorAll('.scenario');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Filter scenarios
            scenarios.forEach(scenario => {
                const status = scenario.getAttribute('data-status');
                const shouldShow = filter === 'all' || status === filter;
                
                scenario.style.display = shouldShow ? 'block' : 'none';
            });
        });
    });
}

/**
 * Setup scenario toggles
 */
function setupScenarioToggles() {
    const scenarios = document.querySelectorAll('.scenario');
    
    scenarios.forEach(scenario => {
        const header = scenario.querySelector('.scenario-header');
        const content = scenario.querySelector('.scenario-content');
        
        if (header && content) {
            // Set initial state
            content.style.maxHeight = '0px';
            
            header.addEventListener('click', function() {
                const isExpanded = scenario.classList.contains('expanded');
                
                if (isExpanded) {
                    // Collapse
                    scenario.classList.remove('expanded');
                    content.style.maxHeight = '0px';
                } else {
                    // Expand
                    scenario.classList.add('expanded');
                    content.style.maxHeight = content.scrollHeight + 'px';
                    
                    // Update max-height if content changes
                    setTimeout(() => {
                        if (scenario.classList.contains('expanded')) {
                            content.style.maxHeight = content.scrollHeight + 'px';
                        }
                    }, 300);
                }
            });
        }
    });
}

/**
 * Toggle scenario manually
 */
function toggleScenario(scenarioId) {
    const scenario = document.querySelector('[data-scenario-id="' + scenarioId + '"]');
    if (scenario) {
        const header = scenario.querySelector('.scenario-header');
        if (header) {
            header.click();
        }
    }
}

/**
 * Setup image modal
 */
function setupImageModal() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.className = 'image-modal';
        modal.innerHTML = '<span class="modal-close">&times;</span><img class="modal-image" src="" alt="Screenshot">';
        document.body.appendChild(modal);
        
        // Close modal on click
        modal.addEventListener('click', function(e) {
            if (e.target === modal || e.target.className === 'modal-close') {
                closeImageModal();
            }
        });
        
        // Close on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeImageModal();
            }
        });
    }
}

/**
 * Open image modal
 */
function openImageModal(src) {
    const modal = document.getElementById('image-modal');
    const modalImage = modal.querySelector('.modal-image');
    
    modalImage.src = src;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Close image modal
 */
function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * Download HAR file
 */
function downloadHAR(harData) {
    const blob = new Blob([harData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = 'network-' + new Date().getTime() + '.har';
    link.click();
    
    URL.revokeObjectURL(url);
}

/**
 * Highlight active feature based on scroll
 */
function highlightActiveFeature() {
    const features = document.querySelectorAll('.feature-report');
    const navItems = document.querySelectorAll('.nav-item');
    
    // Create intersection observer
    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const featureId = entry.target.id.replace('feature-', '');
                
                // Update navigation
                navItems.forEach(item => {
                    if (item.getAttribute('data-feature-id') === featureId) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });
            }
        });
    }, observerOptions);
    
    // Observe all features
    features.forEach(feature => {
        observer.observe(feature);
    });
}

/**
 * Setup tag filtering
 */
function setupTagFiltering() {
    const tags = document.querySelectorAll('.tag');
    
    tags.forEach(tag => {
        tag.addEventListener('click', function() {
            const tagName = this.getAttribute('data-tag');
            filterByTag(tagName);
        });
    });
}

/**
 * Filter scenarios by tag
 */
function filterByTag(tagName) {
    const scenarios = document.querySelectorAll('.scenario');
    
    scenarios.forEach(scenario => {
        const scenarioTags = Array.from(scenario.querySelectorAll('.scenario-tag'))
            .map(tag => tag.textContent);
        
        const hasTag = scenarioTags.includes(tagName);
        scenario.style.display = hasTag ? 'block' : 'none';
    });
    
    // Update filter button
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => btn.classList.remove('active'));
    
    // Show filter info
    showFilterInfo('Filtered by tag: ' + tagName);
}

/**
 * Show filter information
 */
function showFilterInfo(message) {
    // Remove existing info
    const existingInfo = document.querySelector('.filter-info');
    if (existingInfo) {
        existingInfo.remove();
    }
    
    // Create new info
    const info = document.createElement('div');
    info.className = 'filter-info';
    info.innerHTML = '<span>' + message + '</span><button onclick="clearFilters()">Clear Filter</button>';
    
    const filterSection = document.querySelector('.scenarios-filter');
    if (filterSection) {
        filterSection.appendChild(info);
    }
}

/**
 * Clear all filters
 */
function clearFilters() {
    // Show all scenarios
    const scenarios = document.querySelectorAll('.scenario');
    scenarios.forEach(scenario => {
        scenario.style.display = 'block';
    });
    
    // Reset filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        if (btn.getAttribute('data-filter') === 'all') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Remove filter info
    const filterInfo = document.querySelector('.filter-info');
    if (filterInfo) {
        filterInfo.remove();
    }
}

/**
 * Expand all scenarios
 */
function expandAllScenarios() {
    const scenarios = document.querySelectorAll('.scenario');
    
    scenarios.forEach(scenario => {
        if (!scenario.classList.contains('expanded')) {
            const header = scenario.querySelector('.scenario-header');
            if (header) {
                header.click();
            }
        }
    });
}

/**
 * Collapse all scenarios
 */
function collapseAllScenarios() {
    const scenarios = document.querySelectorAll('.scenario');
    
    scenarios.forEach(scenario => {
        if (scenario.classList.contains('expanded')) {
            const header = scenario.querySelector('.scenario-header');
            if (header) {
                header.click();
            }
        }
    });
}

/**
 * Copy error details to clipboard
 */
function copyErrorDetails(errorElement) {
    const errorMessage = errorElement.querySelector('.error-message').textContent;
    const errorType = errorElement.querySelector('.error-type').textContent;
    const errorStack = errorElement.querySelector('.error-stack')?.textContent || '';
    
    const text = 'Error Type: ' + errorType + '\\nMessage: ' + errorMessage + '\\n\\nStack Trace:\\n' + errorStack;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Error details copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * Show toast notification
 */
function showToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #93186C; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; animation: slideUp 0.3s ease;';
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Export feature report
 */
function exportFeatureReport(featureId) {
    const feature = document.getElementById('feature-' + featureId);
    if (!feature) return;
    
    // Clone feature for export
    const clone = feature.cloneNode(true);
    
    // Remove interactive elements
    clone.querySelectorAll('.scenario-toggle, .filter-btn').forEach(el => el.remove());
    
    // Expand all scenarios in clone
    clone.querySelectorAll('.scenario-content').forEach(content => {
        content.style.maxHeight = 'none';
    });
    
    // Create export HTML
    const styles = document.querySelector('style').textContent;
    const exportHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Feature Report Export</title><style>' + styles + '.feature-navigation { display: none; }.scenario-content { max-height: none !important; }</style></head><body><div class="feature-reports"><div class="feature-content">' + clone.outerHTML + '</div></div></body></html>';
    
    // Download file
    const blob = new Blob([exportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = 'feature-report-' + featureId + '.html';
    link.click();
    
    URL.revokeObjectURL(url);
}

/**
 * Print feature report
 */
function printFeatureReport(featureId) {
    const feature = document.getElementById('feature-' + featureId);
    if (!feature) return;
    
    // Expand all scenarios before printing
    const scenarios = feature.querySelectorAll('.scenario');
    const expandedScenarios = [];
    
    scenarios.forEach(scenario => {
        if (!scenario.classList.contains('expanded')) {
            expandedScenarios.push(scenario);
            scenario.classList.add('expanded');
            const content = scenario.querySelector('.scenario-content');
            if (content) {
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        }
    });
    
    // Print
    window.print();
    
    // Restore collapsed scenarios
    setTimeout(() => {
        expandedScenarios.forEach(scenario => {
            scenario.classList.remove('expanded');
            const content = scenario.querySelector('.scenario-content');
            if (content) {
                content.style.maxHeight = '0px';
            }
        });
    }, 100);
}

/**
 * Keyboard shortcuts
 */
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + F - Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('.nav-search');
        if (searchInput) {
            searchInput.focus();
        }
    }
    
    // Ctrl/Cmd + E - Expand all
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        expandAllScenarios();
    }
    
    // Ctrl/Cmd + Shift + E - Collapse all
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        collapseAllScenarios();
    }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = '@keyframes slideUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } } @keyframes slideDown { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, 20px); } } .filter-info { display: inline-flex; align-items: center; gap: 10px; padding: 8px 16px; background: rgba(147, 24, 108, 0.1); border: 1px solid rgba(147, 24, 108, 0.3); border-radius: 8px; margin-left: auto; } .filter-info button { padding: 4px 12px; background: none; border: 1px solid currentColor; border-radius: 4px; color: #93186C; cursor: pointer; font-size: 0.85rem; } .filter-info button:hover { background: rgba(147, 24, 108, 0.1); }';
document.head.appendChild(style);

</script>`;
  }

  /**
   * Calculate pass rate for a feature
   */
  private calculatePassRate(feature: FeatureReport): number {
    const total = feature.statistics.totalScenarios;
    if (total === 0) return 0;
    
    const passed = feature.statistics.passedScenarios;
    return (passed / total) * 100;
  }

  /**
   * Get progress bar color based on feature status
   */
  private getProgressColor(feature: FeatureReport): string {
    const passRate = this.calculatePassRate(feature);
    
    if (passRate >= 90) return STATUS_COLORS.passed;
    if (passRate >= 70) return STATUS_COLORS.pending;
    return STATUS_COLORS.failed;
  }

  /**
   * Format duration for display
   */
  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
      return `${seconds}s`;
    } else {
      return `${milliseconds}ms`;
    }
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  /**
   * Format time for display
   */
  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(date));
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Highlight parameters in step text
   */
  private highlightParameters(text: string): string {
    // Highlight quoted strings
    text = text.replace(/"([^"]*)"/g, '<span class="step-parameter">"$1"</span>');
    
    // Highlight numbers
    text = text.replace(/\b(\d+)\b/g, '<span class="step-parameter">$1</span>');
    
    return text;
  }

  /**
   * Format stack trace for display
   */
  private formatStackTrace(stack: string): string {
    // Split by newline and format each line
    const lines = stack.split('\n');
    
    return lines.map(line => {
      // Highlight file paths
      line = line.replace(/([a-zA-Z0-9_\-./]+\.(js|ts|jsx|tsx):\d+:\d+)/g, 
        '<span class="stack-file">$1</span>');
      
      // Highlight function names
      line = line.replace(/at\s+([a-zA-Z0-9_$.]+)/g, 
        'at <span class="stack-function">$1</span>');
      
      return line;
    }).join('\n');
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const element = document.createElement('div');
    element.textContent = text;
    return element.innerHTML;
  }
}