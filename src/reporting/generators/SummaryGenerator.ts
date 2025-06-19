// src/reporting/generators/SummaryGenerator.ts

import { 
  ExecutionSummary, 
  SummaryStats, 
  HighlightItem,
  RecommendationItem,
  ReportTheme,
  ScenarioSummary
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import { DateUtils } from '../../core/utils/DateUtils';

export class SummaryGenerator {
  private static readonly logger = Logger.getInstance(SummaryGenerator.name);
  private theme: ReportTheme;

  constructor(theme: ReportTheme) {
    this.theme = theme;
  }

  /**
   * Generate executive summary
   */
  async generateSummary(data: ExecutionSummary): Promise<string> {
    SummaryGenerator.logger.info('Generating executive summary');

    const stats = this.calculateSummaryStats(data);
    const highlights = this.identifyHighlights(data);
    const recommendations = this.generateRecommendations(data);
    const executiveSummary = this.generateExecutiveSummary(data, stats);

    const html = this.generateSummaryHTML(executiveSummary, stats, highlights, recommendations);
    const css = this.generateSummaryCSS();
    const js = this.generateSummaryJS();

    return `
      <div id="executive-summary" class="cs-executive-summary">
        <style>${css}</style>
        ${html}
        <script>${js}</script>
      </div>
    `;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummaryStats(data: ExecutionSummary): SummaryStats {
    const totalScenarios = data.scenarios.length;
    const passedScenarios = data.scenarios.filter((s: ScenarioSummary) => s.status === 'passed').length;
    const failedScenarios = data.scenarios.filter((s: ScenarioSummary) => s.status === 'failed').length;
    const skippedScenarios = data.scenarios.filter((s: ScenarioSummary) => s.status === 'skipped').length;

    const totalSteps = data.scenarios.reduce((sum: number, s: ScenarioSummary) => sum + (s.steps?.length || 0), 0);
    const passedSteps = data.scenarios.reduce((sum: number, s: ScenarioSummary) => 
      sum + (s.steps?.filter(step => step.status === 'passed').length || 0), 0
    );
    const failedSteps = data.scenarios.reduce((sum: number, s: ScenarioSummary) => 
      sum + (s.steps?.filter(step => step.status === 'failed').length || 0), 0
    );

    const passRate = (passedScenarios / totalScenarios) * 100;
    const avgDuration = data.scenarios.reduce((sum: number, s: ScenarioSummary) => sum + s.duration, 0) / totalScenarios;

    // Calculate improvement metrics
    const previousPassRate = data.previousRun?.passRate || passRate - 5;
    const previousAvgDuration = data.previousRun?.avgDuration || avgDuration * 1.1;
    const passRateImprovement = passRate - previousPassRate;
    const durationImprovement = ((previousAvgDuration - avgDuration) / previousAvgDuration) * 100;

    // Risk assessment
    const criticalFailures = data.scenarios.filter((s: ScenarioSummary) => 
      s.status === 'failed' && s.tags?.includes('@critical')
    ).length;
    const riskLevel = this.calculateRiskLevel(failedScenarios, criticalFailures, totalScenarios);

    return {
      totalFeatures: data.features.length,
      totalScenarios,
      totalSteps,
      passedScenarios,
      failedScenarios,
      skippedScenarios,
      passedSteps,
      failedSteps,
      passRate,
      avgDuration,
      totalDuration: (data.endTime ? new Date(data.endTime).getTime() : Date.now()) - (data.startTime ? new Date(data.startTime).getTime() : Date.now()),
      passRateImprovement,
      durationImprovement,
      criticalFailures,
      riskLevel,
      executionEnvironment: data.environment || 'unknown',
      parallelExecution: (data.parallelWorkers || 1) > 1,
      parallelWorkers: data.parallelWorkers || 1,
      retryStats: {
        totalRetries: data.scenarios.reduce((sum: number, s: ScenarioSummary) => sum + (s.retryCount || 0), 0),
        scenariosWithRetries: data.scenarios.filter((s: ScenarioSummary) => (s.retryCount || 0) > 0).length
      }
    };
  }

  /**
   * Identify key highlights
   */
  private identifyHighlights(data: ExecutionSummary): HighlightItem[] {
    const highlights: HighlightItem[] = [];

    // Pass rate achievement
    const passRate = (data.scenarios.filter((s: ScenarioSummary) => s.status === 'passed').length / data.scenarios.length) * 100;
    if (passRate >= 95) {
      highlights.push({
        type: 'success',
        title: 'Excellent Pass Rate',
        description: `Achieved ${passRate.toFixed(1)}% pass rate across all test scenarios`,
        icon: this.getHighlightIcon('success')
      });
    }

    // Performance improvement
    if (data.previousRun) {
      const currentAvg = data.scenarios.reduce((sum: number, s: ScenarioSummary) => sum + s.duration, 0) / data.scenarios.length;
      const previousAvg = data.previousRun.avgDuration;
      const improvement = ((previousAvg - currentAvg) / previousAvg) * 100;
      
      if (improvement > 10) {
        highlights.push({
          type: 'improvement',
          title: 'Performance Improvement',
          description: `Test execution ${improvement.toFixed(1)}% faster than previous run`,
          icon: this.getHighlightIcon('improvement')
        });
      }
    }

    // Critical failures
    const criticalFailures = data.scenarios.filter((s: ScenarioSummary) => 
      s.status === 'failed' && s.tags?.includes('@critical')
    );
    if (criticalFailures.length > 0) {
      highlights.push({
        type: 'warning',
        title: 'Critical Test Failures',
        description: `${criticalFailures.length} critical test${criticalFailures.length > 1 ? 's' : ''} failed requiring immediate attention`,
        icon: this.getHighlightIcon('warning')
      });
    }

    // New failures
    const newFailures = this.identifyNewFailures(data);
    if (newFailures.length > 0) {
      highlights.push({
        type: 'alert',
        title: 'New Test Failures',
        description: `${newFailures.length} test${newFailures.length > 1 ? 's' : ''} that previously passed are now failing`,
        icon: this.getHighlightIcon('alert')
      });
    }

    // Flaky tests
    const flakyTests = this.identifyFlakyTests(data);
    if (flakyTests.length > 5) {
      highlights.push({
        type: 'info',
        title: 'Test Stability Issues',
        description: `${flakyTests.length} tests showing flaky behavior across recent runs`,
        icon: this.getHighlightIcon('info')
      });
    }

    // Parallel execution efficiency
    if (data.parallelWorkers > 1) {
      const efficiency = this.calculateParallelEfficiency(data);
      if (efficiency > 80) {
        highlights.push({
          type: 'success',
          title: 'Efficient Parallel Execution',
          description: `Achieved ${efficiency.toFixed(0)}% efficiency with ${data.parallelWorkers} parallel workers`,
          icon: this.getHighlightIcon('success')
        });
      }
    }

    return highlights;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(data: ExecutionSummary): RecommendationItem[] {
    const recommendations: RecommendationItem[] = [];

    // Failed test recommendations
    const failedScenarios = data.scenarios.filter((s: ScenarioSummary) => s.status === 'failed');
    if (failedScenarios.length > 0) {
      const errorTypes = this.analyzeErrorTypes(failedScenarios);
      
      if ((errorTypes['elementNotFound'] || 0) > 5) {
        recommendations.push({
          priority: 'high',
          category: 'stability',
          title: 'Review Element Locators',
          description: `${errorTypes['elementNotFound']} failures due to element not found. Consider enabling AI self-healing or updating locators.`,
          action: 'Review and update element locators for failed tests',
          impact: 'Reduce test failures by up to 30%',
          effort: 'medium'
        });
      }

      if ((errorTypes['timeout'] || 0) > 3) {
        recommendations.push({
          priority: 'medium',
          category: 'performance',
          title: 'Optimize Wait Strategies',
          description: `${errorTypes['timeout']} timeout failures detected. Review wait conditions and timeout values.`,
          action: 'Increase timeouts or optimize application performance',
          impact: 'Improve test reliability',
          effort: 'low'
        });
      }
    }

    // Performance recommendations
    const slowScenarios = data.scenarios.filter((s: ScenarioSummary) => s.duration > 30000); // > 30 seconds
    if (slowScenarios.length > 10) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        title: 'Optimize Slow Tests',
        description: `${slowScenarios.length} tests take longer than 30 seconds to execute.`,
        action: 'Review and optimize slow-running test scenarios',
        impact: 'Reduce overall execution time by up to 20%',
        effort: 'medium'
      });
    }

    // Retry recommendations
    const retriedScenarios = data.scenarios.filter((s: ScenarioSummary) => (s.retryCount || 0) > 0);
    if (retriedScenarios.length > data.scenarios.length * 0.1) {
      recommendations.push({
        priority: 'high',
        category: 'stability',
        title: 'Investigate Test Flakiness',
        description: `${retriedScenarios.length} tests required retries (${(retriedScenarios.length / data.scenarios.length * 100).toFixed(0)}% of total).`,
        action: 'Identify and fix root causes of test flakiness',
        impact: 'Improve test reliability and reduce execution time',
        effort: 'high'
      });
    }

    // Parallel execution recommendations
    if (data.parallelWorkers === 1 && data.scenarios.length > 50) {
      recommendations.push({
        priority: 'low',
        category: 'performance',
        title: 'Enable Parallel Execution',
        description: 'Tests are running sequentially. Enable parallel execution to reduce total execution time.',
        action: 'Configure parallel execution with 4-8 workers',
        impact: 'Reduce execution time by up to 75%',
        effort: 'low'
      });
    }

    // Coverage recommendations
    const tagCoverage = this.analyzeTagCoverage(data);
    if ((tagCoverage['smoke'] || 0) < 10) {
      recommendations.push({
        priority: 'medium',
        category: 'coverage',
        title: 'Increase Smoke Test Coverage',
        description: 'Only ' + tagCoverage['smoke'] + ' smoke tests identified. Consider marking more critical tests as smoke tests.',
        action: 'Review and tag critical user journeys as @smoke tests',
        impact: 'Faster feedback on critical functionality',
        effort: 'low'
      });
    }

    // Test organization recommendations
    const averageScenariosPerFeature = data.scenarios.length / data.features.length;
    if (averageScenariosPerFeature > 20) {
      recommendations.push({
        priority: 'low',
        category: 'maintainability',
        title: 'Refactor Large Feature Files',
        description: `Average of ${averageScenariosPerFeature.toFixed(0)} scenarios per feature. Consider splitting large features.`,
        action: 'Break down large feature files into smaller, focused features',
        impact: 'Improve test maintainability and readability',
        effort: 'medium'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (priorityOrder[a.priority as string] || 0) - (priorityOrder[b.priority as string] || 0);
    });
  }

  /**
   * Generate executive summary text
   */
  private generateExecutiveSummary(data: ExecutionSummary, stats: SummaryStats): string {
    const passRateStatus = stats.passRate >= 95 ? 'excellent' : stats.passRate >= 80 ? 'good' : 'needs improvement';
    const trend = stats.passRateImprovement > 0 ? 'improving' : stats.passRateImprovement < 0 ? 'declining' : 'stable';
    
    let summary = `Test execution completed with ${passRateStatus} results, achieving a ${stats.passRate.toFixed(1)}% pass rate across ${stats.totalScenarios} test scenarios. `;
    
    if (data.previousRun) {
      summary += `The pass rate is ${trend} with a ${Math.abs(stats.passRateImprovement).toFixed(1)}% ${stats.passRateImprovement > 0 ? 'improvement' : 'decrease'} from the previous run. `;
    }
    
    summary += `Total execution time was ${this.formatDuration(stats.totalDuration)}`;
    
    if (stats.parallelExecution) {
      summary += ` using ${stats.parallelWorkers} parallel workers`;
    }
    
    summary += `. `;
    
    if (stats.criticalFailures > 0) {
      summary += `${stats.criticalFailures} critical test${stats.criticalFailures > 1 ? 's' : ''} failed, requiring immediate attention. `;
    }
    
    if (stats.durationImprovement > 5) {
      summary += `Performance improved by ${stats.durationImprovement.toFixed(1)}% compared to the previous run. `;
    }
    
    return summary;
  }

  /**
   * Generate summary HTML
   */
  private generateSummaryHTML(
    executiveSummary: string,
    stats: SummaryStats,
    highlights: HighlightItem[],
    recommendations: RecommendationItem[]
  ): string {
    return `
      <div class="summary-header">
        <div class="header-content">
          <h1>Test Execution Summary</h1>
          <div class="execution-info">
            <span class="info-item">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
                <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
              </svg>
              ${DateUtils.formatDateTime(new Date())}
            </span>
            <span class="info-item">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4.5 5.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z"/>
              </svg>
              ${stats.executionEnvironment.toUpperCase()}
            </span>
            <span class="info-item">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2zm6.5 4.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5a.5.5 0 0 1 1 0z"/>
              </svg>
              Duration: ${this.formatDuration(stats.totalDuration)}
            </span>
          </div>
        </div>
        <div class="risk-indicator ${stats.riskLevel}">
          <span class="risk-label">Risk Level</span>
          <span class="risk-value">${stats.riskLevel.toUpperCase()}</span>
        </div>
      </div>

      <div class="executive-summary">
        <p>${executiveSummary}</p>
      </div>

      <!-- Key Metrics -->
      <div class="key-metrics">
        <div class="metric-card primary">
          <div class="metric-value">${stats.passRate.toFixed(1)}%</div>
          <div class="metric-label">Pass Rate</div>
          <div class="metric-change ${stats.passRateImprovement >= 0 ? 'positive' : 'negative'}">
            ${stats.passRateImprovement >= 0 ? '↑' : '↓'} ${Math.abs(stats.passRateImprovement).toFixed(1)}%
          </div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value">${stats.totalScenarios}</div>
          <div class="metric-label">Total Tests</div>
          <div class="metric-breakdown">
            <span class="passed">${stats.passedScenarios}</span>
            <span class="failed">${stats.failedScenarios}</span>
            <span class="skipped">${stats.skippedScenarios}</span>
          </div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value">${this.formatDuration(stats.avgDuration)}</div>
          <div class="metric-label">Avg Duration</div>
          <div class="metric-change ${stats.durationImprovement >= 0 ? 'positive' : 'negative'}">
            ${stats.durationImprovement >= 0 ? '↓' : '↑'} ${Math.abs(stats.durationImprovement).toFixed(1)}%
          </div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value">${stats.totalFeatures}</div>
          <div class="metric-label">Features</div>
          <div class="metric-subtext">
            ${stats.parallelExecution ? `${stats.parallelWorkers} workers` : 'Sequential'}
          </div>
        </div>
      </div>

      <!-- Test Distribution Chart -->
      <div class="distribution-section">
        <h3>Test Execution Distribution</h3>
        <div class="distribution-chart">
          <div class="donut-chart" id="distributionChart">
            <canvas id="distributionCanvas"></canvas>
            <div class="chart-center">
              <div class="center-value">${stats.totalScenarios}</div>
              <div class="center-label">Total</div>
            </div>
          </div>
          <div class="chart-legend">
            <div class="legend-item passed">
              <span class="legend-color"></span>
              <span class="legend-label">Passed</span>
              <span class="legend-value">${stats.passedScenarios}</span>
              <span class="legend-percent">${((stats.passedScenarios / stats.totalScenarios) * 100).toFixed(0)}%</span>
            </div>
            <div class="legend-item failed">
              <span class="legend-color"></span>
              <span class="legend-label">Failed</span>
              <span class="legend-value">${stats.failedScenarios}</span>
              <span class="legend-percent">${((stats.failedScenarios / stats.totalScenarios) * 100).toFixed(0)}%</span>
            </div>
            <div class="legend-item skipped">
              <span class="legend-color"></span>
              <span class="legend-label">Skipped</span>
              <span class="legend-value">${stats.skippedScenarios}</span>
              <span class="legend-percent">${((stats.skippedScenarios / stats.totalScenarios) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Highlights -->
      ${highlights.length > 0 ? `
        <div class="highlights-section">
          <h3>Key Highlights</h3>
          <div class="highlights-grid">
            ${highlights.map(highlight => `
              <div class="highlight-card ${highlight.type}">
                <div class="highlight-icon">${highlight.icon}</div>
                <div class="highlight-content">
                  <h4>${highlight.title}</h4>
                  <p>${highlight.description}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Recommendations -->
      ${recommendations.length > 0 ? `
        <div class="recommendations-section">
          <h3>Recommendations</h3>
          <div class="recommendations-list">
            ${recommendations.map((rec, index) => `
              <div class="recommendation-item priority-${rec.priority}">
                <div class="rec-number">${index + 1}</div>
                <div class="rec-content">
                  <div class="rec-header">
                    <h4>${rec.title}</h4>
                    <span class="rec-priority">${rec.priority.toUpperCase()}</span>
                  </div>
                  <p class="rec-description">${rec.description}</p>
                  <div class="rec-details">
                    <div class="rec-action">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                      </svg>
                      <span>${rec.action}</span>
                    </div>
                    <div class="rec-impact">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm5-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2z"/>
                      </svg>
                      <span>${rec.impact}</span>
                    </div>
                    <div class="rec-effort">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                        <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                      </svg>
                      <span>Effort: ${rec.effort}</span>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Quick Stats -->
      <div class="quick-stats">
        <h3>Execution Details</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Total Steps</span>
            <span class="stat-value">${stats.totalSteps}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Steps Passed</span>
            <span class="stat-value">${stats.passedSteps}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Steps Failed</span>
            <span class="stat-value">${stats.failedSteps}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Critical Failures</span>
            <span class="stat-value ${stats.criticalFailures > 0 ? 'critical' : ''}">${stats.criticalFailures}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Retries</span>
            <span class="stat-value">${stats.retryStats.totalRetries}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Flaky Tests</span>
            <span class="stat-value">${stats.retryStats.scenariosWithRetries}</span>
          </div>
        </div>
      </div>

      <script>
        window.summaryData = ${JSON.stringify({ stats, highlights, recommendations })};
      </script>
    `;
  }

  /**
   * Generate summary CSS
   */
  private generateSummaryCSS(): string {
    const colors = this.theme.colors || {} as any;
    const primary = colors.primary || '#93186C';
    const success = colors.success || '#28A745';
    const error = colors.error || '#DC3545';
    const warning = colors.warning || '#FFC107';
    const info = colors.info || '#17A2B8';
    const background = colors.background || { primary: '#FFFFFF', secondary: '#F8F9FA' };
    const text = colors.text || { primary: '#212529', secondary: '#6C757D', tertiary: '#ADB5BD' };
    const border = colors.border || '#DEE2E6';
    
    return `
      .cs-executive-summary {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        padding: 0;
        margin-bottom: 24px;
        overflow: hidden;
      }

      /* Header */
      .summary-header {
        background: linear-gradient(135deg, ${primary} 0%, ${primary}DD 100%);
        color: white;
        padding: 32px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .header-content h1 {
        font-size: 28px;
        font-weight: 600;
        margin: 0 0 12px 0;
      }

      .execution-info {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
      }

      .info-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        opacity: 0.9;
      }

      .info-item svg {
        opacity: 0.8;
      }

      .risk-indicator {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 16px 24px;
        text-align: center;
        min-width: 120px;
      }

      .risk-label {
        display: block;
        font-size: 12px;
        opacity: 0.8;
        margin-bottom: 4px;
      }

      .risk-value {
        display: block;
        font-size: 20px;
        font-weight: 600;
      }

      .risk-indicator.low {
        background: ${success}40;
      }

      .risk-indicator.medium {
        background: ${warning}40;
      }

      .risk-indicator.high {
        background: ${error}40;
      }

      /* Executive Summary */
      .executive-summary {
        padding: 24px 32px;
        background: ${background.secondary};
        border-bottom: 1px solid ${border};
      }

      .executive-summary p {
        font-size: 15px;
        line-height: 1.6;
        color: ${text.primary};
        margin: 0;
      }

      /* Key Metrics */
      .key-metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        padding: 32px;
      }

      .metric-card {
        background: ${background.secondary};
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        transition: all 0.2s;
      }

      .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .metric-card.primary {
        background: ${primary}10;
        border: 2px solid ${primary}20;
      }

      .metric-value {
        font-size: 32px;
        font-weight: 700;
        color: ${text.primary};
        line-height: 1;
        margin-bottom: 8px;
      }

      .metric-label {
        font-size: 13px;
        color: ${text.secondary};
        margin-bottom: 8px;
      }

      .metric-change {
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      .metric-change.positive {
        color: ${success};
      }

      .metric-change.negative {
        color: ${error};
      }

      .metric-breakdown {
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-top: 8px;
      }

      .metric-breakdown span {
        font-size: 13px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
      }

      .metric-breakdown .passed {
        background: ${success}20;
        color: ${success};
      }

      .metric-breakdown .failed {
        background: ${error}20;
        color: ${error};
      }

      .metric-breakdown .skipped {
        background: ${warning}20;
        color: ${warning};
      }

      .metric-subtext {
        font-size: 12px;
        color: ${text.tertiary};
        margin-top: 4px;
      }

      /* Distribution Chart */
      .distribution-section {
        padding: 0 32px 32px;
      }

      .distribution-section h3 {
        font-size: 18px;
        font-weight: 600;
        color: ${text.primary};
        margin-bottom: 20px;
      }

      .distribution-chart {
        display: flex;
        align-items: center;
        gap: 40px;
        background: ${background.secondary};
        border-radius: 8px;
        padding: 24px;
      }

      .donut-chart {
        position: relative;
        width: 200px;
        height: 200px;
        flex-shrink: 0;
      }

      .donut-chart canvas {
        width: 100%;
        height: 100%;
      }

      .chart-center {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      }

      .center-value {
        font-size: 32px;
        font-weight: 700;
        color: ${text.primary};
      }

      .center-label {
        font-size: 13px;
        color: ${text.secondary};
      }

      .chart-legend {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: ${background.primary};
        border-radius: 6px;
      }

      .legend-color {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .legend-item.passed .legend-color {
        background: ${success};
      }

      .legend-item.failed .legend-color {
        background: ${error};
      }

      .legend-item.skipped .legend-color {
        background: ${warning};
      }

      .legend-label {
        flex: 1;
        font-size: 14px;
        color: ${text.primary};
      }

      .legend-value {
        font-size: 16px;
        font-weight: 600;
        color: ${text.primary};
      }

      .legend-percent {
        font-size: 13px;
        color: ${text.secondary};
        margin-left: 8px;
      }

      /* Highlights */
      .highlights-section {
        padding: 0 32px 32px;
      }

      .highlights-section h3 {
        font-size: 18px;
        font-weight: 600;
        color: ${text.primary};
        margin-bottom: 20px;
      }

      .highlights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 16px;
      }

      .highlight-card {
        display: flex;
        gap: 16px;
        padding: 20px;
        background: ${background.secondary};
        border-radius: 8px;
        border-left: 4px solid;
        transition: all 0.2s;
      }

      .highlight-card:hover {
        transform: translateX(4px);
      }

      .highlight-card.success {
        border-left-color: ${success};
        background: ${success}05;
      }

      .highlight-card.improvement {
        border-left-color: ${info};
        background: ${info}05;
      }

      .highlight-card.warning {
        border-left-color: ${warning};
        background: ${warning}05;
      }

      .highlight-card.alert {
        border-left-color: ${error};
        background: ${error}05;
      }

      .highlight-card.info {
        border-left-color: ${primary};
        background: ${primary}05;
      }

      .highlight-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
      }

      .highlight-card.success .highlight-icon {
        background: ${success}20;
        color: ${success};
      }

      .highlight-card.improvement .highlight-icon {
        background: ${info}20;
        color: ${info};
      }

      .highlight-card.warning .highlight-icon {
        background: ${warning}20;
        color: ${warning};
      }

      .highlight-card.alert .highlight-icon {
        background: ${error}20;
        color: ${error};
      }

      .highlight-card.info .highlight-icon {
        background: ${primary}20;
        color: ${primary};
      }

      .highlight-content h4 {
        font-size: 15px;
        font-weight: 600;
        color: ${text.primary};
        margin: 0 0 4px 0;
      }

      .highlight-content p {
        font-size: 13px;
        color: ${text.secondary};
        margin: 0;
        line-height: 1.5;
      }

      /* Recommendations */
      .recommendations-section {
        background: ${background.secondary};
        padding: 32px;
      }

      .recommendations-section h3 {
        font-size: 18px;
        font-weight: 600;
        color: ${text.primary};
        margin-bottom: 20px;
      }

      .recommendations-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .recommendation-item {
        display: flex;
        gap: 16px;
        padding: 20px;
        background: white;
        border-radius: 8px;
        border-left: 4px solid;
        transition: all 0.2s;
      }

      .recommendation-item:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .recommendation-item.priority-high {
        border-left-color: ${error};
      }

      .recommendation-item.priority-medium {
        border-left-color: ${warning};
      }

      .recommendation-item.priority-low {
        border-left-color: ${info};
      }

      .rec-number {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        background: ${primary};
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
      }

      .rec-content {
        flex: 1;
      }

      .rec-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .rec-header h4 {
        font-size: 16px;
        font-weight: 600;
        color: ${text.primary};
        margin: 0;
      }

      .rec-priority {
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 4px;
        text-transform: uppercase;
      }

      .priority-high .rec-priority {
        background: ${error}20;
        color: ${error};
      }

      .priority-medium .rec-priority {
        background: ${warning}20;
        color: ${warning};
      }

      .priority-low .rec-priority {
        background: ${info}20;
        color: ${info};
      }

      .rec-description {
        font-size: 14px;
        color: ${text.secondary};
        margin: 0 0 12px 0;
        line-height: 1.5;
      }

      .rec-details {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
      }

      .rec-action,
      .rec-impact,
      .rec-effort {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: ${text.secondary};
      }

      .rec-action svg,
      .rec-impact svg,
      .rec-effort svg {
        color: ${primary};
      }

      /* Quick Stats */
      .quick-stats {
        padding: 32px;
        border-top: 1px solid ${border};
      }

      .quick-stats h3 {
        font-size: 18px;
        font-weight: 600;
        color: ${text.primary};
        margin-bottom: 20px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
      }

      .stat-item {
        background: ${background.secondary};
        border-radius: 6px;
        padding: 16px;
        text-align: center;
      }

      .stat-label {
        display: block;
        font-size: 12px;
        color: ${text.secondary};
        margin-bottom: 8px;
      }

      .stat-value {
        display: block;
        font-size: 24px;
        font-weight: 600;
        color: ${text.primary};
      }

      .stat-value.critical {
        color: ${error};
      }

      /* Responsive */
      @media (max-width: 768px) {
        .summary-header {
          flex-direction: column;
          gap: 16px;
        }

        .execution-info {
          justify-content: center;
        }

        .key-metrics {
          grid-template-columns: repeat(2, 1fr);
        }

        .distribution-chart {
          flex-direction: column;
        }

        .highlights-grid {
          grid-template-columns: 1fr;
        }

        .rec-details {
          flex-direction: column;
          gap: 8px;
        }

        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;
  }

  /**
   * Generate summary JavaScript
   */
  private generateSummaryJS(): string {
    const colors = this.theme.colors || {} as any;
    const success = colors.success || '#28A745';
    const error = colors.error || '#DC3545';
    const warning = colors.warning || '#FFC107';
    
    return `
      (function() {
        const summaryData = window.summaryData;
        const stats = summaryData.stats;
        
        // Draw distribution chart
        function drawDistributionChart() {
          const canvas = document.getElementById('distributionCanvas');
          if (!canvas) return;
          
          const ctx = canvas.getContext('2d');
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
          
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          const outerRadius = Math.min(centerX, centerY) - 10;
          const innerRadius = outerRadius * 0.6;
          
          const data = [
            { value: stats.passedScenarios, color: '${success}' },
            { value: stats.failedScenarios, color: '${error}' },
            { value: stats.skippedScenarios, color: '${warning}' }
          ];
          
          const total = data.reduce((sum, item) => sum + item.value, 0);
          let currentAngle = -Math.PI / 2;
          
          // Draw segments
          data.forEach((segment, index) => {
            if (segment.value === 0) return;
            
            const angle = (segment.value / total) * 2 * Math.PI;
            
            // Draw segment
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + angle);
            ctx.arc(centerX, centerY, innerRadius, currentAngle + angle, currentAngle, true);
            ctx.closePath();
            
            ctx.fillStyle = segment.color;
            ctx.fill();
            
            // Add separator
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            currentAngle += angle;
          });
          
          // Clear center
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(centerX, centerY, innerRadius - 2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        
        // Animate metrics on scroll
        function animateMetrics() {
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                
                // Animate numbers
                const valueElement = entry.target.querySelector('.metric-value');
                if (valueElement) {
                  const finalValue = valueElement.textContent;
                  const isPercentage = finalValue.includes('%');
                  const numericValue = parseFloat(finalValue);
                  
                  if (!isNaN(numericValue)) {
                    animateNumber(valueElement, 0, numericValue, 1000, isPercentage);
                  }
                }
                
                observer.unobserve(entry.target);
              }
            });
          });
          
          document.querySelectorAll('.metric-card').forEach(card => {
            observer.observe(card);
          });
        }
        
        // Animate number
        function animateNumber(element, start, end, duration, isPercentage) {
          const startTime = performance.now();
          
          function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const value = start + (end - start) * easeOutCubic(progress);
            element.textContent = value.toFixed(1) + (isPercentage ? '%' : '');
            
            if (progress < 1) {
              requestAnimationFrame(update);
            }
          }
          
          requestAnimationFrame(update);
        }
        
        // Easing function
        function easeOutCubic(t) {
          return 1 - Math.pow(1 - t, 3);
        }
        
        // Highlight cards interaction
        function setupHighlightInteractions() {
          document.querySelectorAll('.highlight-card').forEach(card => {
            card.addEventListener('click', () => {
              // Could expand to show more details
              card.classList.toggle('expanded');
            });
          });
        }
        
        // Recommendation interactions
        function setupRecommendationInteractions() {
          document.querySelectorAll('.recommendation-item').forEach((item, index) => {
            item.addEventListener('click', () => {
              // Track recommendation clicks
              console.log('Recommendation clicked:', summaryData.recommendations[index]);
            });
          });
        }
        
        // Print functionality
        window.printSummary = function() {
          window.print();
        };
        
        // Export summary data
        window.exportSummaryData = function() {
          const dataStr = JSON.stringify(summaryData, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'test-execution-summary.json';
          link.click();
          URL.revokeObjectURL(url);
        };
        
        // Initialize
        drawDistributionChart();
        animateMetrics();
        setupHighlightInteractions();
        setupRecommendationInteractions();
        
        // Redraw on resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            drawDistributionChart();
          }, 250);
        });
      })();
    `;
  }

  /**
   * Helper methods
   */
  private calculateRiskLevel(failed: number, critical: number, total: number): string {
    if (critical > 0) return 'high';
    if (failed / total > 0.2) return 'high';
    if (failed / total > 0.1) return 'medium';
    return 'low';
  }

  private getHighlightIcon(type: string): string {
    const icons: Record<string, string> = {
      success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
      improvement: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>',
      warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
      alert: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
      info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
    };
    return icons[type] || icons['info'] || '';
  }

  private identifyNewFailures(data: ExecutionSummary): any[] {
    // In a real implementation, this would compare with previous run data
    if (!data.previousRun) return [];
    
    return data.scenarios.filter((s: ScenarioSummary) => 
      s.status === 'failed' && 
      data.previousRun!.failedScenarios?.indexOf(s.name || '') === -1
    );
  }

  private identifyFlakyTests(data: ExecutionSummary): any[] {
    // Identify tests that have inconsistent results
    const testResults = new Map<string, number>();
    
    data.scenarios.forEach((scenario: ScenarioSummary) => {
      if (scenario.retryCount && scenario.retryCount > 0) {
        testResults.set(scenario.name, (testResults.get(scenario.name) || 0) + 1);
      }
    });
    
    return Array.from(testResults.entries())
      .map(([name, count]) => ({ name, flakyRate: (count / 3) * 100 }))
      .filter(test => test.flakyRate > 30);
  }

  private calculateParallelEfficiency(data: ExecutionSummary): number {
    if (data.parallelWorkers <= 1) return 100;
    
    const totalDuration = (data.endTime ? new Date(data.endTime).getTime() : Date.now()) - (data.startTime ? new Date(data.startTime).getTime() : Date.now());
    const sequentialDuration = data.scenarios.reduce((sum: number, s: ScenarioSummary) => sum + s.duration, 0);
    const theoreticalParallelDuration = sequentialDuration / data.parallelWorkers;
    
    return Math.min(100, (theoreticalParallelDuration / totalDuration) * 100);
  }

  private analyzeErrorTypes(failedScenarios: any[]): Record<string, number> {
    const errorTypes: Record<string, number> = {
      elementNotFound: 0,
      timeout: 0,
      assertion: 0,
      api: 0,
      other: 0
    };
    
    failedScenarios.forEach(scenario => {
      const failedStep = scenario.steps?.find((s: any) => s.status === 'failed');
      if (failedStep && failedStep.error) {
        const errorMessage = failedStep.error.message.toLowerCase();
        
        if (errorMessage.includes('element not found') || errorMessage.includes('no element found')) {
          errorTypes['elementNotFound'] = (errorTypes['elementNotFound'] || 0) + 1;
        } else if (errorMessage.includes('timeout')) {
          errorTypes['timeout'] = (errorTypes['timeout'] || 0) + 1;
        } else if (errorMessage.includes('assertion') || errorMessage.includes('expected')) {
          errorTypes['assertion'] = (errorTypes['assertion'] || 0) + 1;
        } else if (errorMessage.includes('api') || errorMessage.includes('request')) {
          errorTypes['api'] = (errorTypes['api'] || 0) + 1;
        } else {
          errorTypes['other'] = (errorTypes['other'] || 0) + 1;
        }
      }
    });
    
    return errorTypes;
  }

  private analyzeTagCoverage(data: ExecutionSummary): Record<string, number> {
    const tagCounts: Record<string, number> = {
      smoke: 0,
      regression: 0,
      critical: 0,
      e2e: 0
    };
    
    data.scenarios.forEach((scenario: ScenarioSummary) => {
      (scenario.tags || []).forEach((tag: string) => {
        const cleanTag = tag.replace('@', '').toLowerCase();
        if (tagCounts.hasOwnProperty(cleanTag)) {
          tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
        }
      });
    });
    
    return tagCounts;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
}