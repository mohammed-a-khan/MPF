// src/reporting/generators/DashboardGenerator.ts

import { 
  CSReport,
  ExecutionSummary,
  ChartDataCollection,
  ChartType,
  PieChartData,
  BarChartData,
  LineChartData,
  HistogramData,
  RadarChartData,
  WaterfallChartData,
  GanttChartData,
  HeatmapData,
  ErrorAnalysis,
  AIHealingReport,
  ReportTheme,
  TestStatus,
  TrendData,
  ExecutionHistory
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';

const STATUS_COLORS: Record<TestStatus, string> = {
  [TestStatus.PASSED]: '#28A745',
  [TestStatus.FAILED]: '#DC3545',
  [TestStatus.SKIPPED]: '#FFC107',
  [TestStatus.PENDING]: '#17A2B8',
  [TestStatus.UNDEFINED]: '#6C757D',
  [TestStatus.AMBIGUOUS]: '#E83E8C'
};

export class DashboardGenerator {
  private readonly logger = Logger.getInstance();
  
  async generateDashboard(report: CSReport): Promise<string> {
    this.logger.info('Generating interactive dashboard');
    
    const theme = report.configuration.theme;
    const charts = this.prepareChartData(report);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${report.metadata.reportName} - Executive Dashboard</title>
    ${this.generateDashboardStyles(theme)}
</head>
<body>
    <div class="dashboard-container">
        ${this.generateHeader(report)}
        ${this.generateKPISection(report.summary)}
        ${this.generateChartsGrid(charts, theme)}
        ${this.generateMetricsSection(report)}
        ${this.generateTrendsSection(report)}
        ${this.generateErrorInsights(report.errors)}
        ${this.generateAIInsights(report.aiHealing)}
        ${this.generatePerformanceSection(report)}
        ${this.generateQuickActions(report)}
    </div>
    ${this.generateDashboardScripts(charts)}
</body>
</html>`;
  }

  private generateDashboardStyles(theme: ReportTheme): string {
    return `
<style>

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: ${theme.fontFamily};
    font-size: ${theme.fontSize};
    background: #0f0f23;
    color: #e0e0e0;
    line-height: 1.6;
    overflow-x: hidden;
}

.dashboard-container {
    max-width: 1920px;
    margin: 0 auto;
    padding: 20px;
    background: #0a0a1a;
    min-height: 100vh;
}

.dashboard-header {
    background: linear-gradient(135deg, ${theme.primaryColor} 0%, #1a1a3a 100%);
    padding: 40px;
    border-radius: 20px;
    margin-bottom: 30px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(147, 24, 108, 0.3);
}

.dashboard-header::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
    animation: pulse 4s ease-in-out infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 0.3; }
}

.header-content {
    position: relative;
    z-index: 1;
}

.dashboard-title {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: 10px;
    background: linear-gradient(90deg, #fff 0%, #e0e0e0 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 20px rgba(255,255,255,0.2);
}

.dashboard-subtitle {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.9);
    margin-bottom: 20px;
}

.execution-info {
    display: flex;
    gap: 30px;
    flex-wrap: wrap;
    color: rgba(255,255,255,0.8);
}

.info-item {
    display: flex;
    align-items: center;
    gap: 8px;
}

.info-icon {
    width: 20px;
    height: 20px;
    fill: rgba(255,255,255,0.7);
}

.kpi-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.kpi-card {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 25px;
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    cursor: pointer;
}

.kpi-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(147, 24, 108, 0.2);
    border-color: ${theme.primaryColor};
}

.kpi-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: var(--kpi-color, ${theme.primaryColor});
    transition: height 0.3s ease;
}

.kpi-card:hover::before {
    height: 100%;
    opacity: 0.1;
}

.kpi-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.kpi-title {
    font-size: 0.9rem;
    color: #a0a0a0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.kpi-icon {
    width: 40px;
    height: 40px;
    background: var(--kpi-color, ${theme.primaryColor});
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
}

.kpi-value {
    font-size: 2.5rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 5px;
    position: relative;
    z-index: 1;
}

.kpi-change {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.9rem;
}

.kpi-change.positive {
    color: ${theme.successColor};
}

.kpi-change.negative {
    color: ${theme.failureColor};
}

.kpi-change-icon {
    width: 16px;
    height: 16px;
}

.kpi-mini-chart {
    margin-top: 15px;
    height: 40px;
    position: relative;
}

.charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
    gap: 25px;
    margin-bottom: 30px;
}

.chart-card {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 25px;
    position: relative;
}

.chart-card.full-width {
    grid-column: 1 / -1;
}

.chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.chart-title {
    font-size: 1.3rem;
    font-weight: 600;
    color: #fff;
}

.chart-actions {
    display: flex;
    gap: 10px;
}

.chart-action {
    width: 35px;
    height: 35px;
    background: #2a2a4a;
    border: 1px solid #3a3a5a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
}

.chart-action:hover {
    background: ${theme.primaryColor};
    transform: scale(1.1);
}

.chart-container {
    width: 100%;
    height: 350px;
    position: relative;
}

.custom-chart {
    width: 100%;
    height: 100%;
    position: relative;
}

.chart-svg {
    width: 100%;
    height: 100%;
}

.gauge-chart {
    text-align: center;
}

.gauge-value {
    font-size: 3rem;
    font-weight: 700;
    color: var(--gauge-color, ${theme.primaryColor});
}

.gauge-label {
    font-size: 1.1rem;
    color: #a0a0a0;
    margin-top: 10px;
}

.progress-ring {
    width: 120px;
    height: 120px;
    margin: 0 auto;
}

.progress-ring-circle {
    transition: stroke-dashoffset 1s ease;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
}

.sparkline {
    width: 100%;
    height: 40px;
}

.sparkline-path {
    fill: none;
    stroke: var(--sparkline-color, ${theme.primaryColor});
    stroke-width: 2;
    opacity: 0.8;
}

.sparkline-area {
    fill: var(--sparkline-color, ${theme.primaryColor});
    opacity: 0.2;
}

.metrics-section {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 30px;
    margin-bottom: 30px;
}

.section-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 20px;
}

.metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 30px;
}

.metric-item {
    text-align: center;
    padding: 20px;
    background: #0f0f23;
    border-radius: 10px;
    border: 1px solid #2a2a4a;
    transition: all 0.3s ease;
}

.metric-item:hover {
    transform: scale(1.05);
    border-color: ${theme.primaryColor};
}

.metric-label {
    font-size: 0.9rem;
    color: #a0a0a0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 10px;
}

.metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: #fff;
}

.metric-unit {
    font-size: 0.9rem;
    color: #a0a0a0;
    margin-left: 5px;
}

.trends-section {
    margin-bottom: 30px;
}

.trend-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.trend-card {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 25px;
    position: relative;
}

.trend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.trend-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
}

.trend-indicator {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    background: rgba(0,0,0,0.3);
    border-radius: 20px;
}

.trend-indicator.positive {
    color: ${theme.successColor};
}

.trend-indicator.negative {
    color: ${theme.failureColor};
}

.trend-chart {
    height: 150px;
    position: relative;
}

.error-insights {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 30px;
    margin-bottom: 30px;
}

.error-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.error-stat {
    text-align: center;
    padding: 20px;
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 10px;
}

.error-patterns {
    margin-top: 20px;
}

.error-pattern {
    background: #0f0f23;
    border: 1px solid #2a2a4a;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.pattern-info {
    flex: 1;
}

.pattern-name {
    font-weight: 600;
    color: #fff;
    margin-bottom: 5px;
}

.pattern-description {
    font-size: 0.9rem;
    color: #a0a0a0;
}

.pattern-count {
    font-size: 1.5rem;
    font-weight: 700;
    color: ${theme.failureColor};
}

.ai-insights {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 30px;
    margin-bottom: 30px;
}

.ai-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.ai-stat {
    text-align: center;
    padding: 20px;
    background: rgba(147, 24, 108, 0.1);
    border: 1px solid rgba(147, 24, 108, 0.3);
    border-radius: 10px;
}

.healing-chart {
    height: 250px;
    position: relative;
}

.performance-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 25px;
    margin-bottom: 30px;
}

.performance-card {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 15px;
    padding: 25px;
}

.card-title {
    font-size: 1.2rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 20px;
}

.performance-metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 0;
    border-bottom: 1px solid #2a2a4a;
}

.performance-metric:last-child {
    border-bottom: none;
}

.metric-name {
    font-weight: 500;
    color: #e0e0e0;
}

.metric-bar {
    flex: 1;
    height: 20px;
    background: #0f0f23;
    border-radius: 10px;
    margin: 0 20px;
    position: relative;
    overflow: hidden;
}

.metric-fill {
    height: 100%;
    background: linear-gradient(90deg, ${theme.primaryColor} 0%, ${theme.successColor} 100%);
    border-radius: 10px;
    transition: width 1s ease;
    position: relative;
}

.metric-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
    animation: shimmer 2s infinite;
}

@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.quick-actions {
    position: fixed;
    bottom: 30px;
    right: 30px;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.action-button {
    width: 60px;
    height: 60px;
    background: ${theme.primaryColor};
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 5px 15px rgba(147, 24, 108, 0.3);
    transition: all 0.3s ease;
    position: relative;
}

.action-button:hover {
    transform: scale(1.1);
    box-shadow: 0 8px 25px rgba(147, 24, 108, 0.5);
}

.action-button svg {
    width: 24px;
    height: 24px;
    fill: white;
}

.action-tooltip {
    position: absolute;
    right: 70px;
    top: 50%;
    transform: translateY(-50%);
    background: #2a2a4a;
    color: #fff;
    padding: 8px 15px;
    border-radius: 8px;
    white-space: nowrap;
    font-size: 0.9rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
}

.action-button:hover .action-tooltip {
    opacity: 1;
}

.interactive {
    cursor: pointer;
    transition: all 0.3s ease;
}

.interactive:hover {
    transform: scale(1.02);
    filter: brightness(1.1);
}

.loading {
    position: relative;
    overflow: hidden;
}

.loading::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
    animation: loading 1.5s infinite;
}

@keyframes loading {
    0% { left: -100%; }
    100% { left: 100%; }
}

@media (max-width: 1200px) {
    .charts-grid {
        grid-template-columns: 1fr;
    }
    
    .dashboard-title {
        font-size: 2.5rem;
    }
}

@media (max-width: 768px) {
    .dashboard-container {
        padding: 15px;
    }
    
    .dashboard-header {
        padding: 25px;
    }
    
    .dashboard-title {
        font-size: 2rem;
    }
    
    .kpi-section {
        grid-template-columns: 1fr;
    }
    
    .execution-info {
        flex-direction: column;
        gap: 15px;
    }
    
    .quick-actions {
        bottom: 20px;
        right: 20px;
    }
    
    .action-button {
        width: 50px;
        height: 50px;
    }
}

@media print {
    body {
        background: white;
        color: black;
    }
    
    .dashboard-container {
        background: white;
    }
    
    .quick-actions {
        display: none;
    }
    
    .chart-actions {
        display: none;
    }
}

@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>`;
  }

  private generateHeader(report: CSReport): string {
    const metadata = report.metadata;
    const duration = this.formatDuration(metadata.duration);
    
    return `
<header class="dashboard-header">
    <div class="header-content">
        <h1 class="dashboard-title">${metadata.reportName}</h1>
        <p class="dashboard-subtitle">Executive Test Automation Dashboard</p>
        <div class="execution-info">
            <div class="info-item">
                <svg class="info-icon" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Environment: <strong>${metadata.environment}</strong></span>
            </div>
            <div class="info-item">
                <svg class="info-icon" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
                <span>Duration: <strong>${duration}</strong></span>
            </div>
            <div class="info-item">
                <svg class="info-icon" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Executed: <strong>${this.formatDate(metadata.executionDate)}</strong></span>
            </div>
            <div class="info-item">
                <svg class="info-icon" viewBox="0 0 24 24">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span>Report ID: <strong>${metadata.reportId}</strong></span>
            </div>
        </div>
    </div>
</header>`;
  }

  private getTrendNumericValue(trend: number | { data: number[]; change: number; direction: 'up' | 'down' | 'stable' }): number {
    if (typeof trend === 'number') {
      return trend;
    }
    return trend.change;
  }

  private generateKPISection(summary: ExecutionSummary): string {
    const kpis = [
      {
        title: 'Pass Rate',
        value: `${summary.passRate.toFixed(1)}%`,
        change: this.calculateTrendChange(this.getTrendNumericValue(summary.trends?.passRateTrend || 0)),
        color: this.getPassRateColor(summary.passRate),
        icon: '✓'
      },
      {
        title: 'Total Tests',
        value: summary.totalScenarios.toString(),
        change: this.calculateCountChange(summary.totalScenarios, summary.trends),
        color: '#17A2B8',
        icon: '📊'
      },
      {
        title: 'Failed Tests',
        value: summary.failedScenarios.toString(),
        change: this.calculateFailureChange(summary.failedScenarios, summary.trends),
        color: '#DC3545',
        icon: '✗'
      },
      {
        title: 'Execution Time',
        value: this.formatDuration(summary.executionTime),
        change: this.calculateTimeChange(this.getTrendNumericValue(summary.trends?.executionTimeTrend || 0)),
        color: '#FFC107',
        icon: '⏱'
      },
      {
        title: 'Parallel Workers',
        value: summary.parallelWorkers.toString(),
        change: null,
        color: '#6F42C1',
        icon: '⚡'
      },
      {
        title: 'Retry Count',
        value: summary.retryCount.toString(),
        change: null,
        color: '#E83E8C',
        icon: '🔄'
      }
    ];

    return `
<section class="kpi-section">
    ${kpis.map((kpi, index) => `
    <div class="kpi-card" style="--kpi-color: ${kpi.color}; animation-delay: ${index * 0.1}s">
        <div class="kpi-header">
            <span class="kpi-title">${kpi.title}</span>
            <div class="kpi-icon">${kpi.icon}</div>
        </div>
        <div class="kpi-value">${kpi.value}</div>
        ${kpi.change ? `
        <div class="kpi-change ${kpi.change.type}">
            <svg class="kpi-change-icon" viewBox="0 0 16 16">
                ${kpi.change.type === 'positive' 
                  ? '<path d="M8 12V4m0 0L4 8m4-4l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' 
                  : '<path d="M8 4v8m0 0l4-4m-4 4L4 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}
            </svg>
            <span>${Math.abs(kpi.change.value)}% vs last run</span>
        </div>
        ` : ''}
        ${this.generateMiniSparkline(kpi.title, summary.trends?.lastExecutions || [])}
    </div>
    `).join('')}
</section>`;
  }

  private generateChartsGrid(_charts: ChartDataCollection, _theme: ReportTheme): string {
    return `
<section class="charts-grid">
    <div class="chart-card">
        ${this.generateChartHeader('Test Execution Overview')}
        <div class="chart-container">
            <div id="execution-pie-chart" class="custom-chart"></div>
        </div>
    </div>
    
    <div class="chart-card">
        ${this.generateChartHeader('Pass Rate Trend')}
        <div class="chart-container">
            <div id="pass-rate-trend-chart" class="custom-chart"></div>
        </div>
    </div>
    
    <div class="chart-card full-width">
        ${this.generateChartHeader('Feature Performance')}
        <div class="chart-container">
            <div id="feature-bar-chart" class="custom-chart"></div>
        </div>
    </div>
    
    <div class="chart-card">
        ${this.generateChartHeader('Execution Duration Distribution')}
        <div class="chart-container">
            <div id="duration-histogram" class="custom-chart"></div>
        </div>
    </div>
    
    <div class="chart-card">
        ${this.generateChartHeader('Error Distribution')}
        <div class="chart-container">
            <div id="error-distribution-chart" class="custom-chart"></div>
        </div>
    </div>
    
    <div class="chart-card full-width">
        ${this.generateChartHeader('Test Execution Timeline')}
        <div class="chart-container">
            <div id="execution-timeline" class="custom-chart"></div>
        </div>
    </div>
</section>`;
  }

  private generateMetricsSection(report: CSReport): string {
    const metrics = report.metrics;
    
    return `
<section class="metrics-section">
    <h2 class="section-title">Performance Metrics</h2>
    <div class="metrics-grid">
        <div class="metric-item">
            <div class="metric-label">Avg Scenario Duration</div>
            <div class="metric-value">${(metrics.execution.avgScenarioDuration / 1000).toFixed(2)}<span class="metric-unit">s</span></div>
        </div>
        <div class="metric-item">
            <div class="metric-label">Avg Step Duration</div>
            <div class="metric-value">${metrics.execution.avgStepDuration.toFixed(0)}<span class="metric-unit">ms</span></div>
        </div>
        <div class="metric-item">
            <div class="metric-label">Page Load Time</div>
            <div class="metric-value">${(metrics.browser.pageLoadTime / 1000).toFixed(2)}<span class="metric-unit">s</span></div>
        </div>
        <div class="metric-item">
            <div class="metric-label">Network Requests</div>
            <div class="metric-value">${metrics.network.totalRequests}</div>
        </div>
        <div class="metric-item">
            <div class="metric-label">Failed Requests</div>
            <div class="metric-value">${metrics.network.failedRequests}</div>
        </div>
        <div class="metric-item">
            <div class="metric-label">Avg Response Time</div>
            <div class="metric-value">${metrics.network.avgResponseTime.toFixed(0)}<span class="metric-unit">ms</span></div>
        </div>
        <div class="metric-item">
            <div class="metric-label">Memory Usage</div>
            <div class="metric-value">${this.formatBytes(metrics.browser.memoryUsage.usedJSHeapSize)}</div>
        </div>
        <div class="metric-item">
            <div class="metric-label">CPU Usage</div>
            <div class="metric-value">${metrics.system.cpuUsage.toFixed(1)}<span class="metric-unit">%</span></div>
        </div>
    </div>
</section>`;
  }

  private generateTrendsSection(report: CSReport): string {
    const trends = report.summary.trends;
    if (!trends || !trends.lastExecutions || trends.lastExecutions.length === 0) {
      return '';
    }

    const passRateTrendValue = this.getTrendNumericValue(trends.passRateTrend);
    const executionTimeTrendValue = this.getTrendNumericValue(trends.executionTimeTrend);
    const failureRateTrendValue = this.getTrendNumericValue(trends.failureRateTrend);

    return `
<section class="trends-section">
    <h2 class="section-title">Execution Trends</h2>
    <div class="trend-cards">
        <div class="trend-card">
            <div class="trend-header">
                <span class="trend-title">Pass Rate Trend</span>
                <div class="trend-indicator ${passRateTrendValue >= 0 ? 'positive' : 'negative'}">
                    ${passRateTrendValue >= 0 ? '↑' : '↓'} ${Math.abs(passRateTrendValue).toFixed(1)}%
                </div>
            </div>
            <div class="trend-chart" id="pass-rate-mini-trend"></div>
        </div>
        
        <div class="trend-card">
            <div class="trend-header">
                <span class="trend-title">Execution Time Trend</span>
                <div class="trend-indicator ${executionTimeTrendValue <= 0 ? 'positive' : 'negative'}">
                    ${executionTimeTrendValue <= 0 ? '↓' : '↑'} ${Math.abs(executionTimeTrendValue).toFixed(1)}%
                </div>
            </div>
            <div class="trend-chart" id="execution-time-mini-trend"></div>
        </div>
        
        <div class="trend-card">
            <div class="trend-header">
                <span class="trend-title">Failure Rate Trend</span>
                <div class="trend-indicator ${failureRateTrendValue <= 0 ? 'positive' : 'negative'}">
                    ${failureRateTrendValue <= 0 ? '↓' : '↑'} ${Math.abs(failureRateTrendValue).toFixed(1)}%
                </div>
            </div>
            <div class="trend-chart" id="failure-rate-mini-trend"></div>
        </div>
    </div>
</section>`;
  }

  private generateErrorInsights(errors: ErrorAnalysis): string {
    if (!errors || errors.summary.totalErrors === 0) {
      return '';
    }

    return `
<section class="error-insights">
    <h2 class="section-title">Error Analysis</h2>
    
    <div class="error-summary">
        <div class="error-stat">
            <div class="metric-label">Total Errors</div>
            <div class="metric-value">${errors.summary.totalErrors}</div>
        </div>
        <div class="error-stat">
            <div class="metric-label">Unique Errors</div>
            <div class="metric-value">${errors.summary.uniqueErrors}</div>
        </div>
        <div class="error-stat">
            <div class="metric-label">Most Common</div>
            <div class="metric-value">${errors.summary.mostCommonError || 'N/A'}</div>
        </div>
    </div>
    
    <div class="error-patterns">
        <h3>Common Error Patterns</h3>
        ${errors.commonPatterns.slice(0, 5).map(pattern => `
        <div class="error-pattern">
            <div class="pattern-info">
                <div class="pattern-name">${pattern.pattern}</div>
                <div class="pattern-description">${pattern.recommendation}</div>
            </div>
            <div class="pattern-count">${pattern.count}</div>
        </div>
        `).join('')}
    </div>
</section>`;
  }

  private generateAIInsights(aiHealing: AIHealingReport): string {
    if (!aiHealing || aiHealing.summary.totalAttempts === 0) {
      return '';
    }

    return `
<section class="ai-insights">
    <h2 class="section-title">AI Self-Healing Insights</h2>
    
    <div class="ai-stats">
        <div class="ai-stat">
            <div class="metric-label">Healing Attempts</div>
            <div class="metric-value">${aiHealing.summary.totalAttempts}</div>
        </div>
        <div class="ai-stat">
            <div class="metric-label">Success Rate</div>
            <div class="metric-value">${aiHealing.summary.healingRate.toFixed(1)}%</div>
        </div>
        <div class="ai-stat">
            <div class="metric-label">Avg Confidence</div>
            <div class="metric-value">${aiHealing.summary.avgConfidence.toFixed(1)}%</div>
        </div>
        <div class="ai-stat">
            <div class="metric-label">Elements Healed</div>
            <div class="metric-value">${aiHealing.summary.successfulHeals}</div>
        </div>
    </div>
    
    <div class="healing-chart" id="healing-success-chart"></div>
</section>`;
  }

  private generatePerformanceSection(report: CSReport): string {
    const metrics = report.metrics.browser;
    const benchmarks = {
      pageLoadTime: 3000,
      firstContentfulPaint: 1800,
      largestContentfulPaint: 2500,
      timeToInteractive: 3800,
      totalBlockingTime: 300
    };

    return `
<section class="performance-section">
    <div class="performance-card">
        <h3 class="card-title">Web Vitals Performance</h3>
        ${Object.entries({
          'Page Load Time': { value: metrics.pageLoadTime, benchmark: benchmarks.pageLoadTime },
          'First Contentful Paint': { value: metrics.firstContentfulPaint, benchmark: benchmarks.firstContentfulPaint },
          'Largest Contentful Paint': { value: metrics.largestContentfulPaint, benchmark: benchmarks.largestContentfulPaint },
          'Time to Interactive': { value: metrics.timeToInteractive, benchmark: benchmarks.timeToInteractive },
          'Total Blocking Time': { value: metrics.totalBlockingTime, benchmark: benchmarks.totalBlockingTime }
        }).map(([name, data]) => {
          const percentage = Math.min((data.value / data.benchmark) * 100, 100);
          const performanceStatus = percentage <= 100 ? 'good' : 'poor';
          const statusClass = performanceStatus === 'good' ? 'status-good' : 'status-poor';
          
          return `
          <div class="performance-metric ${statusClass}">
              <span class="metric-name">${name}</span>
              <div class="metric-bar">
                  <div class="metric-fill" style="width: ${percentage}%; background: ${this.getPerformanceColor(percentage)}"></div>
              </div>
              <span class="metric-value">${data.value}ms</span>
          </div>`;
        }).join('')}
    </div>
    
    <div class="performance-card">
        <h3 class="card-title">System Performance</h3>
        <div class="performance-metric">
            <span class="metric-name">CPU Usage</span>
            <div class="metric-bar">
                <div class="metric-fill" style="width: ${report.metrics.system.cpuUsage}%"></div>
            </div>
            <span class="metric-value">${report.metrics.system.cpuUsage.toFixed(1)}%</span>
        </div>
        <div class="performance-metric">
            <span class="metric-name">Memory Usage</span>
            <div class="metric-bar">
                <div class="metric-fill" style="width: ${report.metrics.system.memoryUsage}%"></div>
            </div>
            <span class="metric-value">${report.metrics.system.memoryUsage.toFixed(1)}%</span>
        </div>
        <div class="performance-metric">
            <span class="metric-name">Parallel Efficiency</span>
            <div class="metric-bar">
                <div class="metric-fill" style="width: ${report.metrics.execution.parallelEfficiency * 100}%"></div>
            </div>
            <span class="metric-value">${(report.metrics.execution.parallelEfficiency * 100).toFixed(1)}%</span>
        </div>
    </div>
</section>`;
  }

  private generateQuickActions(_report: CSReport): string {
    return `
<div class="quick-actions">
    <button class="action-button" onclick="window.print()">
        <svg viewBox="0 0 24 24">
            <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM16 19H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
        </svg>
        <span class="action-tooltip">Print Dashboard</span>
    </button>
    
    <button class="action-button" onclick="exportDashboard()">
        <svg viewBox="0 0 24 24">
            <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
        </svg>
        <span class="action-tooltip">Export Dashboard</span>
    </button>
    
    <button class="action-button" onclick="toggleFullscreen()">
        <svg viewBox="0 0 24 24">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
        </svg>
        <span class="action-tooltip">Fullscreen</span>
    </button>
    
    <button class="action-button" onclick="refreshCharts()">
        <svg viewBox="0 0 24 24">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        <span class="action-tooltip">Refresh Charts</span>
    </button>
</div>`;
  }

  private generateDashboardScripts(charts: ChartDataCollection): string {
    return `
<script>

const chartData = ${JSON.stringify(charts)};

document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    animateKPIs();
    setupInteractions();
    startAutoRefresh();
});


function initializeCharts() {
    createPieChart('execution-pie-chart', chartData.executionPieChart);
    
    createLineChart('pass-rate-trend-chart', chartData.passRateTrend);
    
    createBarChart('feature-bar-chart', chartData.featureBarChart);
    
    createHistogram('duration-histogram', chartData.durationHistogram);
    
    createDoughnutChart('error-distribution-chart', chartData.errorDistribution);
    
    createTimelineChart('execution-timeline', chartData.timelineGantt);
    
    createMiniTrendCharts();
}

function createPieChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) / 2 - 40;
    
    const svg = createSVG(container, width, height);
    const g = svg.append('g')
        .attr('transform', \`translate(\${width/2},\${height/2})\`);
    
    const total = data.values.reduce((a, b) => a + b, 0);
    let currentAngle = -Math.PI / 2;
    const slices = [];
    
    data.values.forEach((value, i) => {
        const angle = (value / total) * 2 * Math.PI;
        slices.push({
            startAngle: currentAngle,
            endAngle: currentAngle + angle,
            value: value,
            label: data.labels[i],
            color: data.colors[i],
            percentage: (value / total * 100).toFixed(1)
        });
        currentAngle += angle;
    });
    
    slices.forEach((slice, i) => {
        const path = g.append('path')
            .attr('d', createArc(slice.startAngle, slice.endAngle, 0, radius))
            .attr('fill', slice.color)
            .attr('stroke', '#0f0f23')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .style('opacity', 0)
            .style('transform', 'scale(0)')
            .style('transform-origin', 'center');
        
        setTimeout(() => {
            path.transition()
                .duration(800)
                .ease(d3EaseOutBack)
                .style('opacity', 1)
                .style('transform', 'scale(1)');
        }, i * 100);
        
        path.on('mouseenter', function(event) {
            d3Select(this)
                .transition()
                .duration(200)
                .style('transform', 'scale(1.05)')
                .attr('filter', 'brightness(1.2)');
            
            showTooltip(event, slice.label, slice.value, slice.percentage + '%');
        })
        .on('mouseleave', function() {
            d3Select(this)
                .transition()
                .duration(200)
                .style('transform', 'scale(1)')
                .attr('filter', 'none');
            
            hideTooltip();
        });
    });
    
    slices.forEach((slice, i) => {
        const labelAngle = (slice.startAngle + slice.endAngle) / 2;
        const labelX = Math.cos(labelAngle) * (radius + 20);
        const labelY = Math.sin(labelAngle) * (radius + 20);
        
        const label = g.append('text')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('text-anchor', labelX > 0 ? 'start' : 'end')
            .attr('dominant-baseline', 'middle')
            .style('fill', '#e0e0e0')
            .style('font-size', '14px')
            .style('opacity', 0);
        
        label.append('tspan')
            .text(slice.label)
            .attr('x', labelX)
            .attr('dy', '-0.3em');
        
        label.append('tspan')
            .text(slice.percentage + '%')
            .attr('x', labelX)
            .attr('dy', '1.2em')
            .style('font-weight', 'bold')
            .style('fill', slice.color);
        
        setTimeout(() => {
            label.transition()
                .duration(500)
                .style('opacity', 1);
        }, 800 + i * 100);
    });
    
    const centerText = g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('opacity', 0);
    
    centerText.append('tspan')
        .text(total)
        .style('font-size', '32px')
        .style('font-weight', 'bold')
        .style('fill', '#fff');
    
    centerText.append('tspan')
        .text('Total')
        .attr('x', 0)
        .attr('dy', '1.5em')
        .style('font-size', '16px')
        .style('fill', '#a0a0a0');
    
    centerText.transition()
        .delay(1000)
        .duration(500)
        .style('opacity', 1);
}

function createLineChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    const svg = createSVG(container, width, height);
    const g = svg.append('g')
        .attr('transform', \`translate(\${margin.left},\${margin.top})\`);
    
    const xScale = d3ScaleLinear()
        .domain([0, data.labels.length - 1])
        .range([0, innerWidth]);
    
    const yScale = d3ScaleLinear()
        .domain([0, 100])
        .range([innerHeight, 0]);
    
    g.append('g')
        .attr('class', 'grid')
        .attr('transform', \`translate(0,\${innerHeight})\`)
        .call(d3AxisBottom(xScale)
            .tickSize(-innerHeight)
            .tickFormat('')
        )
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3);
    
    g.append('g')
        .attr('class', 'grid')
        .call(d3AxisLeft(yScale)
            .tickSize(-innerWidth)
            .tickFormat('')
        )
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3);
    
    data.datasets.forEach((dataset, i) => {
        const line = d3Line()
            .x((d, i) => xScale(i))
            .y(d => yScale(d))
            .curve(d3CurveCatmullRom);
        
        const area = d3Area()
            .x((d, i) => xScale(i))
            .y0(innerHeight)
            .y1(d => yScale(d))
            .curve(d3CurveCatmullRom);
        
        if (dataset.fill) {
            const areaPath = g.append('path')
                .datum(dataset.data)
                .attr('fill', dataset.backgroundColor || dataset.borderColor)
                .attr('opacity', 0.2)
                .attr('d', area);
            
            const totalLength = areaPath.node().getTotalLength();
            areaPath
                .attr('stroke-dasharray', totalLength)
                .attr('stroke-dashoffset', totalLength)
                .transition()
                .duration(2000)
                .ease(d3EaseLinear)
                .attr('stroke-dashoffset', 0);
        }
        
        const linePath = g.append('path')
            .datum(dataset.data)
            .attr('fill', 'none')
            .attr('stroke', dataset.borderColor)
            .attr('stroke-width', 3)
            .attr('d', line);
        
        const totalLength = linePath.node().getTotalLength();
        linePath
            .attr('stroke-dasharray', totalLength)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(2000)
            .ease(d3EaseLinear)
            .attr('stroke-dashoffset', 0);
        
        dataset.data.forEach((value, j) => {
            const dot = g.append('circle')
                .attr('cx', xScale(j))
                .attr('cy', yScale(value))
                .attr('r', 0)
                .attr('fill', dataset.borderColor)
                .attr('stroke', '#0f0f23')
                .attr('stroke-width', 2)
                .style('cursor', 'pointer');
            
            dot.transition()
                .delay(2000 + j * 100)
                .duration(300)
                .ease(d3EaseOutBack)
                .attr('r', 5);
            
            dot.on('mouseenter', function(event) {
                d3Select(this)
                    .transition()
                    .duration(200)
                    .attr('r', 8);
                
                showTooltip(event, data.labels[j], value, dataset.label);
            })
            .on('mouseleave', function() {
                d3Select(this)
                    .transition()
                    .duration(200)
                    .attr('r', 5);
                
                hideTooltip();
            });
        });
    });
    
    g.append('g')
        .attr('transform', \`translate(0,\${innerHeight})\`)
        .call(d3AxisBottom(xScale)
            .tickFormat(i => data.labels[i])
        )
        .style('color', '#a0a0a0');
    
    g.append('g')
        .call(d3AxisLeft(yScale)
            .tickFormat(d => d + '%')
        )
        .style('color', '#a0a0a0');
}

function createBarChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    const svg = createSVG(container, width, height);
    const g = svg.append('g')
        .attr('transform', \`translate(\${margin.left},\${margin.top})\`);
    
    const xScale = d3ScaleBand()
        .domain(data.labels)
        .range([0, innerWidth])
        .padding(0.2);
    
    const yScale = d3ScaleLinear()
        .domain([0, Math.max(...data.datasets.flatMap(d => d.data))])
        .nice()
        .range([innerHeight, 0]);
    
    data.datasets.forEach((dataset, datasetIndex) => {
        const barWidth = xScale.bandwidth() / data.datasets.length;
        
        dataset.data.forEach((value, i) => {
            const bar = g.append('rect')
                .attr('x', xScale(data.labels[i]) + datasetIndex * barWidth)
                .attr('y', innerHeight)
                .attr('width', barWidth)
                .attr('height', 0)
                .attr('fill', dataset.backgroundColor)
                .attr('stroke', dataset.borderColor || 'none')
                .style('cursor', 'pointer');
            
            bar.transition()
                .delay(i * 50)
                .duration(800)
                .ease(d3EaseOutBack)
                .attr('y', yScale(value))
                .attr('height', innerHeight - yScale(value));
            
            const label = g.append('text')
                .attr('x', xScale(data.labels[i]) + datasetIndex * barWidth + barWidth / 2)
                .attr('y', yScale(value) - 5)
                .attr('text-anchor', 'middle')
                .style('fill', '#e0e0e0')
                .style('font-size', '12px')
                .style('opacity', 0)
                .text(value);
            
            label.transition()
                .delay(800 + i * 50)
                .duration(300)
                .style('opacity', 1);
            
            bar.on('mouseenter', function(event) {
                d3Select(this)
                    .transition()
                    .duration(200)
                    .attr('filter', 'brightness(1.3)');
                
                showTooltip(event, data.labels[i], value, dataset.label);
            })
            .on('mouseleave', function() {
                d3Select(this)
                    .transition()
                    .duration(200)
                    .attr('filter', 'none');
                
                hideTooltip();
            });
        });
    });
    
    g.append('g')
        .attr('transform', \`translate(0,\${innerHeight})\`)
        .call(d3AxisBottom(xScale))
        .style('color', '#a0a0a0')
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
    
    g.append('g')
        .call(d3AxisLeft(yScale))
        .style('color', '#a0a0a0');
    
    const legend = svg.append('g')
        .attr('transform', \`translate(\${width - 150}, 20)\`);
    
    data.datasets.forEach((dataset, i) => {
        const legendItem = legend.append('g')
            .attr('transform', \`translate(0, \${i * 25})\`);
        
        legendItem.append('rect')
            .attr('width', 18)
            .attr('height', 18)
            .attr('fill', dataset.backgroundColor);
        
        legendItem.append('text')
            .attr('x', 24)
            .attr('y', 9)
            .attr('dy', '0.32em')
            .style('fill', '#e0e0e0')
            .style('font-size', '14px')
            .text(dataset.label);
    });
}

function createHistogram(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    const svg = createSVG(container, width, height);
    const g = svg.append('g')
        .attr('transform', \`translate(\${margin.left},\${margin.top})\`);
    
    const xScale = d3ScaleLinear()
        .domain([Math.min(...data.bins), Math.max(...data.bins)])
        .range([0, innerWidth]);
    
    const yScale = d3ScaleLinear()
        .domain([0, Math.max(...data.frequencies)])
        .nice()
        .range([innerHeight, 0]);
    
    data.frequencies.forEach((freq, i) => {
        const bar = g.append('rect')
            .attr('x', xScale(data.bins[i]))
            .attr('y', innerHeight)
            .attr('width', innerWidth / data.bins.length - 2)
            .attr('height', 0)
            .attr('fill', \`hsl(\${220 + i * 10}, 70%, 50%)\`)
            .style('cursor', 'pointer');
        
        bar.transition()
            .delay(i * 30)
            .duration(600)
            .ease(d3EaseOutQuad)
            .attr('y', yScale(freq))
            .attr('height', innerHeight - yScale(freq));
        
        bar.on('mouseenter', function(event) {
            d3Select(this)
                .transition()
                .duration(200)
                .attr('fill', \`hsl(\${220 + i * 10}, 80%, 60%)\`);
            
            const binStart = data.bins[i];
            const binEnd = i < data.bins.length - 1 ? data.bins[i + 1] : binStart + data.binWidth;
            showTooltip(event, \`\${binStart}-\${binEnd}ms\`, freq, 'Tests');
        })
        .on('mouseleave', function() {
            d3Select(this)
                .transition()
                .duration(200)
                .attr('fill', \`hsl(\${220 + i * 10}, 70%, 50%)\`);
            
            hideTooltip();
        });
    });
    
    g.append('g')
        .attr('transform', \`translate(0,\${innerHeight})\`)
        .call(d3AxisBottom(xScale).tickFormat(d => d + 'ms'))
        .style('color', '#a0a0a0');
    
    g.append('g')
        .call(d3AxisLeft(yScale))
        .style('color', '#a0a0a0');
    
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (innerHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('fill', '#a0a0a0')
        .text('Frequency');
    
    g.append('text')
        .attr('transform', \`translate(\${innerWidth / 2}, \${innerHeight + margin.bottom})\`)
        .style('text-anchor', 'middle')
        .style('fill', '#a0a0a0')
        .text('Duration (ms)');
}

function createDoughnutChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) / 2 - 40;
    const innerRadius = radius * 0.6;
    
    const svg = createSVG(container, width, height);
    const g = svg.append('g')
        .attr('transform', \`translate(\${width/2},\${height/2})\`);
    
    const total = data.values.reduce((a, b) => a + b, 0);
    let currentAngle = -Math.PI / 2;
    const slices = [];
    
    data.values.forEach((value, i) => {
        const angle = (value / total) * 2 * Math.PI;
        slices.push({
            startAngle: currentAngle,
            endAngle: currentAngle + angle,
            value: value,
            label: data.labels[i],
            color: data.colors[i],
            percentage: (value / total * 100).toFixed(1)
        });
        currentAngle += angle;
    });
    
    slices.forEach((slice, i) => {
        const path = g.append('path')
            .attr('d', createArc(slice.startAngle, slice.endAngle, innerRadius, radius))
            .attr('fill', slice.color)
            .attr('stroke', '#0f0f23')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .style('opacity', 0)
            .style('transform', 'scale(0) rotate(0deg)')
            .style('transform-origin', 'center');
        
        setTimeout(() => {
            path.transition()
                .duration(800)
                .ease(d3EaseOutBack)
                .style('opacity', 1)
                .style('transform', 'scale(1) rotate(360deg)');
        }, i * 100);
        
        path.on('mouseenter', function(event) {
            d3Select(this)
                .transition()
                .duration(200)
                .attr('d', createArc(slice.startAngle, slice.endAngle, innerRadius - 5, radius + 10));
            
            showTooltip(event, slice.label, slice.value, slice.percentage + '%');
        })
        .on('mouseleave', function() {
            d3Select(this)
                .transition()
                .duration(200)
                .attr('d', createArc(slice.startAngle, slice.endAngle, innerRadius, radius));
            
            hideTooltip();
        });
    });
    
    const centerGroup = g.append('g')
        .style('opacity', 0);
    
    centerGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .style('font-size', '36px')
        .style('font-weight', 'bold')
        .style('fill', '#fff')
        .text(total);
    
    centerGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.5em')
        .style('font-size', '16px')
        .style('fill', '#a0a0a0')
        .text('Total Errors');
    
    centerGroup.transition()
        .delay(1000)
        .duration(500)
        .style('opacity', 1);
}

function createTimelineChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 30, bottom: 40, left: 150 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    const svg = createSVG(container, width, height);
    const g = svg.append('g')
        .attr('transform', \`translate(\${margin.left},\${margin.top})\`);
    
    const timeScale = d3ScaleTime()
        .domain([new Date(data.startTime), new Date(data.endTime)])
        .range([0, innerWidth]);
    
    const taskScale = d3ScaleBand()
        .domain(data.tasks.map(t => t.name))
        .range([0, innerHeight])
        .padding(0.2);
    
    data.tasks.forEach((task, i) => {
        const taskGroup = g.append('g')
            .attr('transform', \`translate(0, \${taskScale(task.name)})\`);
        
        const bar = taskGroup.append('rect')
            .attr('x', timeScale(new Date(task.start)))
            .attr('y', 0)
            .attr('width', 0)
            .attr('height', taskScale.bandwidth())
            .attr('fill', task.color || '#93186C')
            .attr('rx', 4)
            .style('cursor', 'pointer')
            .style('opacity', 0.8);
        
        bar.transition()
            .delay(i * 50)
            .duration(800)
            .attr('width', timeScale(new Date(task.end)) - timeScale(new Date(task.start)));
        
        if (task.progress < 100) {
            const progressBar = taskGroup.append('rect')
                .attr('x', timeScale(new Date(task.start)))
                .attr('y', taskScale.bandwidth() * 0.3)
                .attr('width', 0)
                .attr('height', taskScale.bandwidth() * 0.4)
                .attr('fill', '#28A745')
                .attr('rx', 2);
            
            progressBar.transition()
                .delay(800 + i * 50)
                .duration(500)
                .attr('width', (timeScale(new Date(task.end)) - timeScale(new Date(task.start))) * (task.progress / 100));
        }
        
        taskGroup.append('text')
            .attr('x', -10)
            .attr('y', taskScale.bandwidth() / 2)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .style('fill', '#e0e0e0')
            .style('font-size', '14px')
            .text(task.name);
        
        bar.on('mouseenter', function(event) {
            d3Select(this)
                .transition()
                .duration(200)
                .style('opacity', 1)
                .attr('filter', 'brightness(1.2)');
            
            const duration = new Date(task.end) - new Date(task.start);
            showTooltip(event, task.name, \`\${(duration / 1000).toFixed(2)}s\`, \`Progress: \${task.progress}%\`);
        })
        .on('mouseleave', function() {
            d3Select(this)
                .transition()
                .duration(200)
                .style('opacity', 0.8)
                .attr('filter', 'none');
            
            hideTooltip();
        });
    });
    
    g.append('g')
        .attr('transform', \`translate(0,\${innerHeight})\`)
        .call(d3AxisBottom(timeScale)
            .tickFormat(d3TimeFormat('%H:%M:%S'))
        )
        .style('color', '#a0a0a0');
    
    const now = new Date();
    if (now >= new Date(data.startTime) && now <= new Date(data.endTime)) {
        g.append('line')
            .attr('x1', timeScale(now))
            .attr('x2', timeScale(now))
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .attr('stroke', '#DC3545')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .style('opacity', 0.8);
    }
}

function createMiniTrendCharts() {
    document.querySelectorAll('.kpi-mini-chart').forEach(container => {
        const width = container.clientWidth;
        const height = 40;
        const data = generateRandomTrendData(10);
        
        const svg = d3Select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);
        
        const xScale = d3ScaleLinear()
            .domain([0, data.length - 1])
            .range([0, width]);
        
        const yScale = d3ScaleLinear()
            .domain([Math.min(...data), Math.max(...data)])
            .range([height - 5, 5]);
        
        const line = d3Line()
            .x((d, i) => xScale(i))
            .y(d => yScale(d))
            .curve(d3CurveCatmullRom);
        
        const area = d3Area()
            .x((d, i) => xScale(i))
            .y0(height)
            .y1(d => yScale(d))
            .curve(d3CurveCatmullRom);
        
        svg.append('path')
            .datum(data)
            .attr('fill', 'var(--kpi-color)')
            .attr('opacity', 0.2)
            .attr('d', area);
        
        const linePath = svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', 'var(--kpi-color)')
            .attr('stroke-width', 2)
            .attr('d', line);
        
        const totalLength = linePath.node().getTotalLength();
        linePath
            .attr('stroke-dasharray', totalLength)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(1500)
            .attr('stroke-dashoffset', 0);
    });
}


function createSVG(container, width, height) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('class', 'chart-svg');
    container.appendChild(svg);
    
    svg.append = function(tagName) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        this.appendChild(element);
        return addD3Methods(element);
    };
    
    return addD3Methods(svg);
}

function addD3Methods(element) {
    element.attr = function(name, value) {
        if (value === undefined) return this.getAttribute(name);
        this.setAttribute(name, value);
        return this;
    };
    
    element.style = function(name, value) {
        if (value === undefined) return this.style[name];
        this.style[name] = value;
        return this;
    };
    
    element.append = function(tagName) {
        const child = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        this.appendChild(child);
        return addD3Methods(child);
    };
    
    element.text = function(value) {
        if (value === undefined) return this.textContent;
        this.textContent = value;
        return this;
    };
    
    element.datum = function(data) {
        this.__data__ = data;
        return this;
    };
    
    element.on = function(event, handler) {
        this.addEventListener(event, handler);
        return this;
    };
    
    element.transition = function() {
        return new Transition(this);
    };
    
    element.select = function(selector) {
        const selected = this.querySelector(selector);
        return selected ? addD3Methods(selected) : null;
    };
    
    element.selectAll = function(selector) {
        const selected = Array.from(this.querySelectorAll(selector));
        return selected.map(el => addD3Methods(el));
    };
    
    element.node = function() {
        return this;
    };
    
    element.call = function(fn, ...args) {
        fn(this, ...args);
        return this;
    };
    
    return element;
}

class Transition {
    constructor(element) {
        this.element = element;
        this.duration_ = 250;
        this.delay_ = 0;
        this.ease_ = d3EaseLinear;
        this.attrs = {};
        this.styles = {};
    }
    
    duration(value) {
        this.duration_ = value;
        return this;
    }
    
    delay(value) {
        this.delay_ = value;
        return this;
    }
    
    ease(fn) {
        this.ease_ = fn;
        return this;
    }
    
    attr(name, value) {
        this.attrs[name] = value;
        this._schedule();
        return this;
    }
    
    style(name, value) {
        this.styles[name] = value;
        this._schedule();
        return this;
    }
    
    _schedule() {
        if (this._scheduled) return;
        this._scheduled = true;
        
        setTimeout(() => {
            const startTime = performance.now();
            const startAttrs = {};
            const startStyles = {};
            
            for (const key in this.attrs) {
                startAttrs[key] = this.element.getAttribute(key) || 0;
            }
            for (const key in this.styles) {
                startStyles[key] = this.element.style[key] || 0;
            }
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / this.duration_, 1);
                const eased = this.ease_(progress);
                
                for (const key in this.attrs) {
                    const start = parseFloat(startAttrs[key]) || 0;
                    const end = parseFloat(this.attrs[key]) || 0;
                    const current = start + (end - start) * eased;
                    this.element.setAttribute(key, current);
                }
                
                for (const key in this.styles) {
                    const start = parseFloat(startStyles[key]) || 0;
                    const end = parseFloat(this.styles[key]) || 0;
                    const current = start + (end - start) * eased;
                    const unit = this.styles[key].toString().match(/[a-z%]+$/i)?.[0] || '';
                    this.element.style[key] = current + unit;
                }
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };
            
            requestAnimationFrame(animate);
        }, this.delay_);
    }
}

function createArc(startAngle, endAngle, innerRadius, outerRadius) {
    const x1 = Math.cos(startAngle) * outerRadius;
    const y1 = Math.sin(startAngle) * outerRadius;
    const x2 = Math.cos(endAngle) * outerRadius;
    const y2 = Math.sin(endAngle) * outerRadius;
    const x3 = Math.cos(endAngle) * innerRadius;
    const y3 = Math.sin(endAngle) * innerRadius;
    const x4 = Math.cos(startAngle) * innerRadius;
    const y4 = Math.sin(startAngle) * innerRadius;
    
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    
    return \`M \${x1} \${y1} A \${outerRadius} \${outerRadius} 0 \${largeArc} 1 \${x2} \${y2} L \${x3} \${y3} A \${innerRadius} \${innerRadius} 0 \${largeArc} 0 \${x4} \${y4} Z\`;
}

function d3Select(element) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }
    return addD3Methods(element);
}

const d3EaseOutBack = t => 1 + (--t) * t * (2.70158 * t + 1.70158);
const d3EaseLinear = t => t;
const d3EaseOutQuad = t => t * (2 - t);

function d3ScaleLinear() {
    let domain = [0, 1];
    let range = [0, 1];
    
    function scale(value) {
        const t = (value - domain[0]) / (domain[1] - domain[0]);
        return range[0] + t * (range[1] - range[0]);
    }
    
    scale.domain = function(d) {
        if (!arguments.length) return domain;
        domain = d;
        return scale;
    };
    
    scale.range = function(r) {
        if (!arguments.length) return range;
        range = r;
        return scale;
    };
    
    scale.nice = function() {
        const extent = domain[1] - domain[0];
        const step = Math.pow(10, Math.floor(Math.log10(extent)));
        domain[0] = Math.floor(domain[0] / step) * step;
        domain[1] = Math.ceil(domain[1] / step) * step;
        return scale;
    };
    
    return scale;
}

function d3ScaleBand() {
    let domain = [];
    let range = [0, 1];
    let padding = 0;
    
    function scale(value) {
        const index = domain.indexOf(value);
        if (index === -1) return undefined;
        
        const step = (range[1] - range[0]) / domain.length;
        const paddingTotal = step * padding;
        const bandWidth = step - paddingTotal;
        
        return range[0] + index * step + paddingTotal / 2;
    }
    
    scale.domain = function(d) {
        if (!arguments.length) return domain;
        domain = d;
        return scale;
    };
    
    scale.range = function(r) {
        if (!arguments.length) return range;
        range = r;
        return scale;
    };
    
    scale.padding = function(p) {
        if (!arguments.length) return padding;
        padding = p;
        return scale;
    };
    
    scale.bandwidth = function() {
        const step = (range[1] - range[0]) / domain.length;
        return step - step * padding;
    };
    
    return scale;
}

function d3ScaleTime() {
    const linearScale = d3ScaleLinear();
    
    function scale(value) {
        return linearScale(value.getTime());
    }
    
    scale.domain = function(d) {
        if (!arguments.length) return linearScale.domain().map(t => new Date(t));
        linearScale.domain(d.map(date => date.getTime()));
        return scale;
    };
    
    scale.range = function(r) {
        if (!arguments.length) return linearScale.range();
        linearScale.range(r);
        return scale;
    };
    
    return scale;
}

function d3AxisBottom(scale) {
    return function(selection) {
        const range = scale.range();
        const domain = scale.domain();
        
        selection.append('line')
            .attr('x1', range[0])
            .attr('x2', range[1])
            .attr('y1', 0)
            .attr('y2', 0)
            .attr('stroke', 'currentColor');
        
        const tickCount = 10;
        const tickSize = 6;
        
        for (let i = 0; i <= tickCount; i++) {
            const value = domain[0] + (domain[1] - domain[0]) * i / tickCount;
            const x = scale(value);
            
            selection.append('line')
                .attr('x1', x)
                .attr('x2', x)
                .attr('y1', 0)
                .attr('y2', tickSize)
                .attr('stroke', 'currentColor');
            
            selection.append('text')
                .attr('x', x)
                .attr('y', tickSize + 12)
                .attr('text-anchor', 'middle')
                .attr('font-size', '12px')
                .text(this.tickFormat ? this.tickFormat(value) : value.toFixed(1));
        }
    };
}

function d3AxisLeft(scale) {
    return function(selection) {
        const range = scale.range();
        const domain = scale.domain();
        
        selection.append('line')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', range[0])
            .attr('y2', range[1])
            .attr('stroke', 'currentColor');
        
        const tickCount = 10;
        const tickSize = 6;
        
        for (let i = 0; i <= tickCount; i++) {
            const value = domain[0] + (domain[1] - domain[0]) * i / tickCount;
            const y = scale(value);
            
            selection.append('line')
                .attr('x1', 0)
                .attr('x2', -tickSize)
                .attr('y1', y)
                .attr('y2', y)
                .attr('stroke', 'currentColor');
            
            selection.append('text')
                .attr('x', -tickSize - 4)
                .attr('y', y)
                .attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .attr('font-size', '12px')
                .text(this.tickFormat ? this.tickFormat(value) : value.toFixed(1));
        }
    };
}

d3AxisBottom.tickSize = function(size) { return this; };
d3AxisBottom.tickFormat = function(format) { return this; };
d3AxisLeft.tickSize = function(size) { return this; };
d3AxisLeft.tickFormat = function(format) { return this; };

function d3Line() {
    let xAccessor = d => d[0];
    let yAccessor = d => d[1];
    let curveType = null;
    
    function line(data) {
        let path = \`M \${xAccessor(data[0], 0)} \${yAccessor(data[0], 0)}\`;
        
        for (let i = 1; i < data.length; i++) {
            if (curveType === d3CurveCatmullRom && i < data.length - 1) {
                const p0 = i > 1 ? data[i - 2] : data[i - 1];
                const p1 = data[i - 1];
                const p2 = data[i];
                const p3 = i < data.length - 1 ? data[i + 1] : data[i];
                
                const t = 0.5;
                const v0 = { x: xAccessor(p0, i - 2), y: yAccessor(p0, i - 2) };
                const v1 = { x: xAccessor(p1, i - 1), y: yAccessor(p1, i - 1) };
                const v2 = { x: xAccessor(p2, i), y: yAccessor(p2, i) };
                const v3 = { x: xAccessor(p3, i + 1), y: yAccessor(p3, i + 1) };
                
                const d1 = Math.sqrt((v1.x - v0.x) ** 2 + (v1.y - v0.y) ** 2);
                const d2 = Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2);
                const d3 = Math.sqrt((v3.x - v2.x) ** 2 + (v3.y - v2.y) ** 2);
                
                const cp1x = v1.x + (v2.x - v0.x) / 6 * t;
                const cp1y = v1.y + (v2.y - v0.y) / 6 * t;
                const cp2x = v2.x - (v3.x - v1.x) / 6 * t;
                const cp2y = v2.y - (v3.y - v1.y) / 6 * t;
                
                path += \` C \${cp1x} \${cp1y}, \${cp2x} \${cp2y}, \${v2.x} \${v2.y}\`;
            } else {
                path += \` L \${xAccessor(data[i], i)} \${yAccessor(data[i], i)}\`;
            }
        }
        
        return path;
    }
    
    line.x = function(accessor) {
        xAccessor = accessor;
        return line;
    };
    
    line.y = function(accessor) {
        yAccessor = accessor;
        return line;
    };
    
    line.curve = function(curve) {
        curveType = curve;
        return line;
    };
    
    return line;
}

function d3Area() {
    let xAccessor = d => d[0];
    let y0Accessor = () => 0;
    let y1Accessor = d => d[1];
    let curveType = null;
    
    function area(data) {
        const topLine = d3Line()
            .x(xAccessor)
            .y(y1Accessor)
            .curve(curveType);
        
        let path = topLine(data);
        
        for (let i = data.length - 1; i >= 0; i--) {
            path += \` L \${xAccessor(data[i], i)} \${y0Accessor(data[i], i)}\`;
        }
        
        path += ' Z';
        return path;
    }
    
    area.x = function(accessor) {
        xAccessor = accessor;
        return area;
    };
    
    area.y0 = function(accessor) {
        y0Accessor = typeof accessor === 'function' ? accessor : () => accessor;
        return area;
    };
    
    area.y1 = function(accessor) {
        y1Accessor = accessor;
        return area;
    };
    
    area.curve = function(curve) {
        curveType = curve;
        return area;
    };
    
    return area;
}

const d3CurveCatmullRom = 'catmullRom';

function d3TimeFormat(format) {
    return function(date) {
        const d = new Date(date);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return \`\${hours}:\${minutes}:\${seconds}\`;
    };
}

function showTooltip(event, title, value, subtitle) {
    let tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chart-tooltip';
        tooltip.style.cssText = \`
            position: absolute;
            background: #2a2a4a;
            border: 1px solid #93186C;
            border-radius: 8px;
            padding: 12px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        \`;
        document.body.appendChild(tooltip);
    }
    
    tooltip.innerHTML = \`
        <div style="font-weight: bold; color: #fff; margin-bottom: 4px;">\${title}</div>
        <div style="font-size: 20px; color: #93186C; font-weight: bold;">\${value}</div>
        \${subtitle ? \`<div style="color: #a0a0a0; font-size: 12px; margin-top: 4px;">\${subtitle}</div>\` : ''}
    \`;
    
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 10;
    
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) {
        top = rect.bottom + 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
}

function hideTooltip() {
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) {
        tooltip.style.opacity = '0';
    }
}

function generateRandomTrendData(points) {
    const data = [];
    let value = 50 + Math.random() * 30;
    
    for (let i = 0; i < points; i++) {
        value += (Math.random() - 0.5) * 10;
        value = Math.max(20, Math.min(100, value));
        data.push(value);
    }
    
    return data;
}

function animateKPIs() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'slideInUp 0.6s ease forwards';
                
                const valueElement = entry.target.querySelector('.kpi-value');
                if (valueElement) {
                    const finalValue = valueElement.textContent;
                    const isPercentage = finalValue.includes('%');
                    const numericValue = parseFloat(finalValue);
                    
                    if (!isNaN(numericValue)) {
                        let currentValue = 0;
                        const increment = numericValue / 30;
                        const startTime = performance.now();
                        
                        function updateCounter(currentTime) {
                            const elapsed = currentTime - startTime;
                            const progress = Math.min(elapsed / 1000, 1);
                            
                            currentValue = numericValue * d3EaseOutQuad(progress);
                            
                            if (isPercentage) {
                                valueElement.textContent = currentValue.toFixed(1) + '%';
                            } else if (finalValue.includes(':')) {
                                const totalSeconds = Math.floor(currentValue);
                                const hours = Math.floor(totalSeconds / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                const seconds = totalSeconds % 60;
                                
                                if (hours > 0) {
                                    valueElement.textContent = \`\${hours}h \${minutes}m\`;
                                } else if (minutes > 0) {
                                    valueElement.textContent = \`\${minutes}m \${seconds}s\`;
                                } else {
                                    valueElement.textContent = \`\${seconds}s\`;
                                }
                            } else {
                                valueElement.textContent = Math.round(currentValue).toString();
                            }
                            
                            if (progress < 1) {
                                requestAnimationFrame(updateCounter);
                            } else {
                                valueElement.textContent = finalValue;
                            }
                        }
                        
                        requestAnimationFrame(updateCounter);
                    }
                }
                
                observer.unobserve(entry.target);
            }
        });
    });
    
    document.querySelectorAll('.kpi-card').forEach(card => {
        observer.observe(card);
    });
}

function setupInteractions() {
    document.querySelectorAll('.chart-action').forEach(button => {
        button.addEventListener('click', function(e) {
            const action = this.getAttribute('data-action');
            const chartCard = this.closest('.chart-card');
            const chartId = chartCard.querySelector('.custom-chart').id;
            
            switch(action) {
                case 'fullscreen':
                    toggleChartFullscreen(chartCard);
                    break;
                case 'export':
                    exportChart(chartId);
                    break;
                case 'refresh':
                    refreshChart(chartId);
                    break;
            }
        });
    });
    
    setupFilters();
    
    setupSearch();
    
    setupThemeSwitcher();
}

function toggleChartFullscreen(chartCard) {
    if (!document.fullscreenElement) {
        chartCard.requestFullscreen().then(() => {
            chartCard.classList.add('fullscreen');
        }).catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen().then(() => {
            chartCard.classList.remove('fullscreen');
        }).catch(err => {
            console.error('Error attempting to exit fullscreen:', err);
        });
    }
}

function exportChart(chartId) {
    const chartContainer = document.getElementById(chartId);
    const svg = chartContainer.querySelector('svg');
    
    if (svg) {
        const width = svg.getAttribute('width');
        const height = svg.getAttribute('height');
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = 2;
        
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);
        
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        const img = new Image();
        img.onload = function() {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob(function(blob) {
                const link = document.createElement('a');
                link.download = chartId + '_' + new Date().getTime() + '.png';
                link.href = URL.createObjectURL(blob);
                link.click();
                
                URL.revokeObjectURL(url);
                URL.revokeObjectURL(link.href);
            }, 'image/png');
        };
        
        img.src = url;
    }
}

function refreshChart(chartId) {
    const container = document.getElementById(chartId);
    
    container.classList.add('loading');
    
    container.innerHTML = '';
    
    setTimeout(() => {
        switch(chartId) {
            case 'execution-pie-chart':
                createPieChart(chartId, chartData.executionPieChart);
                break;
            case 'pass-rate-trend-chart':
                createLineChart(chartId, chartData.passRateTrend);
                break;
            case 'feature-bar-chart':
                createBarChart(chartId, chartData.featureBarChart);
                break;
            case 'duration-histogram':
                createHistogram(chartId, chartData.durationHistogram);
                break;
            case 'error-distribution-chart':
                createDoughnutChart(chartId, chartData.errorDistribution);
                break;
            case 'execution-timeline':
                createTimelineChart(chartId, chartData.timelineGantt);
                break;
        }
        
        container.classList.remove('loading');
    }, 500);
}

function refreshCharts() {
    const charts = [
        'execution-pie-chart',
        'pass-rate-trend-chart',
        'feature-bar-chart',
        'duration-histogram',
        'error-distribution-chart',
        'execution-timeline'
    ];
    
    charts.forEach((chartId, index) => {
        setTimeout(() => refreshChart(chartId), index * 200);
    });
}

function setupFilters() {
}

function setupSearch() {
}

function setupThemeSwitcher() {
}

function startAutoRefresh() {
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            console.log('Auto-refresh triggered');
        }
    }, 30000);
}

function exportDashboard() {
    const modal = document.createElement('div');
    modal.className = 'export-modal';
    modal.innerHTML = \`
        <div class="export-content">
            <h3>Export Dashboard</h3>
            <div class="export-options">
                <button onclick="exportAsPDF()">Export as PDF</button>
                <button onclick="exportAsExcel()">Export as Excel</button>
                <button onclick="exportAsJSON()">Export as JSON</button>
            </div>
            <button onclick="this.parentElement.parentElement.remove()">Cancel</button>
        </div>
    \`;
    
    modal.style.cssText = \`
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    \`;
    
    const content = modal.querySelector('.export-content');
    content.style.cssText = \`
        background: #1a1a2e;
        border-radius: 15px;
        padding: 30px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    \`;
    
    const title = content.querySelector('h3');
    title.style.cssText = \`
        color: #fff;
        margin-bottom: 20px;
        font-size: 1.5rem;
    \`;
    
    const buttons = content.querySelectorAll('button');
    buttons.forEach(button => {
        button.style.cssText = \`
            display: block;
            width: 100%;
            padding: 12px 24px;
            margin: 10px 0;
            background: #93186C;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s ease;
        \`;
        
        button.addEventListener('mouseenter', function() {
            this.style.background = '#B91C84';
            this.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.background = '#93186C';
            this.style.transform = 'translateY(0)';
        });
    });
    
    document.body.appendChild(modal);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen().catch(err => {
            console.error('Error attempting to exit fullscreen:', err);
        });
    }
}

function exportAsPDF() {
    console.log('Exporting dashboard as PDF...');
    alert('PDF export would be handled by backend service in production');
}

function exportAsExcel() {
    console.log('Exporting dashboard as Excel...');
    alert('Excel export would be handled by backend service in production');
}

function exportAsJSON() {
    const exportData = {
        metadata: {
            exportDate: new Date().toISOString(),
            reportId: chartData.reportId || 'unknown',
            version: '1.0.0'
        },
        summary: {
            totalTests: chartData.executionPieChart?.values?.reduce((a, b) => a + b, 0) || 0,
            passed: chartData.executionPieChart?.values?.[0] || 0,
            failed: chartData.executionPieChart?.values?.[1] || 0,
            skipped: chartData.executionPieChart?.values?.[2] || 0,
            pending: chartData.executionPieChart?.values?.[3] || 0
        },
        charts: chartData,
        timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dashboard_export_' + new Date().getTime() + '.json';
    link.click();
    URL.revokeObjectURL(url);
}

</script>`;
  }

  private prepareChartData(report: CSReport): ChartDataCollection {
    const summary = report.summary;
    
    return {
      executionPieChart: {
        type: ChartType.PIE,
        title: 'Test Execution Overview',
        labels: ['Passed', 'Failed', 'Skipped', 'Pending'],
        values: [
          summary.passedScenarios,
          summary.failedScenarios,
          summary.skippedScenarios,
          summary.pendingSteps
        ],
        colors: [STATUS_COLORS.passed, STATUS_COLORS.failed, STATUS_COLORS.skipped, STATUS_COLORS.pending],
        data: {},
        options: {}
      },
      
      passRateTrend: this.preparePassRateTrend(report),
      featureBarChart: this.prepareFeatureBarChart(report),
      durationHistogram: this.prepareDurationHistogram(report),
      errorDistribution: this.prepareErrorDistribution(report),
      performanceRadar: this.preparePerformanceRadar(report),
      networkWaterfall: this.prepareNetworkWaterfall(report),
      timelineGantt: this.prepareTimelineGantt(report),
      heatmap: this.prepareHeatmap(report),
      customCharts: {}
    };
  }

  private preparePassRateTrend(report: CSReport): LineChartData {
    const trends = report.summary.trends?.lastExecutions || [];
    
    return {
      type: ChartType.LINE,
      title: 'Pass Rate Trend',
      labels: trends.map((_, i) => `Run ${i + 1}`),
      datasets: [{
        label: 'Pass Rate',
        data: trends.map(e => e.passRate),
        borderColor: STATUS_COLORS.passed,
        backgroundColor: STATUS_COLORS.passed + '20',
        fill: true,
        tension: 0.4
      }],
      data: {},
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    };
  }

  private prepareFeatureBarChart(report: CSReport): BarChartData {
    const features = report.features.slice(0, 10);
    
    return {
      type: ChartType.BAR,
      title: 'Feature Performance',
      labels: features.map(f => f.feature),
      datasets: [
        {
          label: 'Passed',
          data: features.map(f => f.statistics.passedScenarios),
          backgroundColor: STATUS_COLORS.passed,
          borderColor: STATUS_COLORS.passed
        },
        {
          label: 'Failed',
          data: features.map(f => f.statistics.failedScenarios),
          backgroundColor: STATUS_COLORS.failed,
          borderColor: STATUS_COLORS.failed
        },
        {
          label: 'Skipped',
          data: features.map(f => f.statistics.skippedScenarios),
          backgroundColor: STATUS_COLORS.skipped,
          borderColor: STATUS_COLORS.skipped
        }
      ],
      data: {},
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    };
  }

  private prepareDurationHistogram(report: CSReport): HistogramData {
    const durations = report.scenarios.map(s => s.duration);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const binCount = 10;
    const binWidth = (max - min) / binCount;
    
    const bins: number[] = [];
    const frequencies: number[] = [];
    
    for (let i = 0; i < binCount; i++) {
      const binStart = min + i * binWidth;
      bins.push(binStart);
      
      const count = durations.filter(d => 
        d >= binStart && d < binStart + binWidth
      ).length;
      frequencies.push(count);
    }
    
    return {
      type: ChartType.HISTOGRAM,
      title: 'Execution Duration Distribution',
      bins,
      frequencies,
      binWidth,
      data: {},
      options: {}
    };
  }

  private prepareErrorDistribution(report: CSReport): PieChartData {
    const errorTypes = report.errors.summary.errorsByType;
    
    return {
      type: ChartType.DOUGHNUT,
      title: 'Error Distribution',
      labels: Object.keys(errorTypes),
      values: Object.values(errorTypes),
      colors: [
        '#DC3545', '#E85D75', '#F08080', '#FFB6C1', '#FFC0CB'
      ],
      data: {},
      options: {}
    };
  }

  private preparePerformanceRadar(report: CSReport): RadarChartData {
    const metrics = report.metrics.browser;
    const benchmarks = {
      pageLoadTime: 3000,
      firstContentfulPaint: 1800,
      largestContentfulPaint: 2500,
      timeToInteractive: 3800,
      totalBlockingTime: 300
    };
    
    return {
      type: ChartType.RADAR,
      title: 'Performance Metrics',
      labels: Object.keys(benchmarks),
      datasets: [{
        label: 'Actual',
        data: [
          (benchmarks.pageLoadTime / metrics.pageLoadTime) * 100,
          (benchmarks.firstContentfulPaint / metrics.firstContentfulPaint) * 100,
          (benchmarks.largestContentfulPaint / metrics.largestContentfulPaint) * 100,
          (benchmarks.timeToInteractive / metrics.timeToInteractive) * 100,
          (benchmarks.totalBlockingTime / metrics.totalBlockingTime) * 100
        ],
        borderColor: STATUS_COLORS.passed,
        backgroundColor: STATUS_COLORS.passed + '40',
        pointBackgroundColor: STATUS_COLORS.passed
      }],
      data: {},
      options: {}
    };
  }

  private prepareNetworkWaterfall(report: CSReport): WaterfallChartData {
    const entries = report.network.waterfall.entries.slice(0, 20);
    
    return {
      type: ChartType.WATERFALL,
      title: 'Network Waterfall',
      categories: entries.map(e => e.url.substring(0, 50)),
      values: entries.map(e => e.timing.total),
      isTotal: entries.map(() => false),
      data: {},
      options: {}
    };
  }

  private prepareTimelineGantt(report: CSReport): GanttChartData {
    const scenarios = report.scenarios.slice(0, 15);
    const startTime = new Date(report.metadata.startTime);
    
    return {
      type: ChartType.GANTT,
      title: 'Execution Timeline',
      tasks: scenarios.map(s => ({
        id: s.scenarioId,
        name: s.scenario.substring(0, 30),
        start: new Date(s.startTime),
        end: new Date(s.endTime),
        progress: s.status === TestStatus.PASSED ? 100 : 
                  s.status === TestStatus.FAILED ? 0 : 50,
        color: STATUS_COLORS[s.status] || STATUS_COLORS.pending
      })),
      startTime,
      endTime: new Date(report.metadata.endTime),
      data: {},
      options: {}
    };
  }

  private prepareHeatmap(_report: CSReport): HeatmapData {
    const hours = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0') + ':00');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
    
    for (let i = 0; i < 7; i++) {
      const row = data[i];
      if (row) {
        for (let j = 0; j < 24; j++) {
          row[j] = Math.random() * 100;
        }
      }
    }
    
    return {
      type: ChartType.HEATMAP,
      title: 'Test Execution Heatmap',
      xLabels: hours,
      yLabels: days,
      data,
      minValue: 0,
      maxValue: 100,
      colorScale: 'viridis',
      options: {}
    };
  }

  private generateChartHeader(title: string): string {
    return `
<div class="chart-header">
    <h3 class="chart-title">${title}</h3>
    <div class="chart-actions">
        <button class="chart-action" data-action="fullscreen" title="Fullscreen">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
            </svg>
        </button>
        <button class="chart-action" data-action="export" title="Export">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
            </svg>
        </button>
        <button class="chart-action" data-action="refresh" title="Refresh">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
        </button>
    </div>
</div>`;
  }

  private generateMiniSparkline(metric: string, history: ExecutionHistory[]): string {
    if (!history || history.length === 0) return '';
    
    return `<div class="kpi-mini-chart" data-metric="${metric}"></div>`;
  }

  private calculateTrendChange(trend: number): { type: 'positive' | 'negative', value: number } | null {
    if (trend === 0) return null;
    return {
      type: trend > 0 ? 'positive' : 'negative',
      value: trend
    };
  }

  private calculateCountChange(current: number, trends?: TrendData): { type: 'positive' | 'negative', value: number } | null {
    if (!trends || !trends.lastExecutions || trends.lastExecutions.length < 2) return null;
    
    const previousExecution = trends.lastExecutions[trends.lastExecutions.length - 2];
    if (!previousExecution) return null;
    
    const previous = previousExecution.totalTests;
    const change = ((current - previous) / previous) * 100;
    
    return {
      type: change >= 0 ? 'positive' : 'negative',
      value: Math.abs(change)
    };
  }

  private calculateFailureChange(_current: number, trends?: TrendData): { type: 'positive' | 'negative', value: number } | null {
    if (!trends || trends.failureRateTrend === undefined) return null;
    
    const failureRateTrendValue = this.getTrendNumericValue(trends.failureRateTrend);
    
    return {
      type: failureRateTrendValue <= 0 ? 'positive' : 'negative',
      value: Math.abs(failureRateTrendValue)
    };
  }

  private calculateTimeChange(trend: number): { type: 'positive' | 'negative', value: number } | null {
    if (trend === 0) return null;
    return {
      type: trend <= 0 ? 'positive' : 'negative',
      value: Math.abs(trend)
    };
  }

  private getPassRateColor(passRate: number): string {
    if (passRate >= 95) return STATUS_COLORS.passed;
    if (passRate >= 80) return STATUS_COLORS.pending;
    return STATUS_COLORS.failed;
  }

  private getPerformanceColor(percentage: number): string {
    if (percentage <= 50) return STATUS_COLORS.passed;
    if (percentage <= 100) return STATUS_COLORS.pending;
    return STATUS_COLORS.failed;
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }
}
