// src/reporting/generators/ChartGenerator.ts

import {
  ChartData,
  ChartOptions,
  ChartType,
  DoughnutChart,
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  RadarChart,
  ScatterChart,
  BubbleChart,
  HeatmapChart,
  TreemapChart,
  SankeyChart,
  GaugeChart,
  WaterfallChart,
  FunnelChart,
  Point,
  ChartColors,
  ReportTheme
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';

/**
 * Chart Generator - Creates Custom Charts Without External Dependencies
 * 
 * Implements 14 different chart types from scratch:
 * - Doughnut, Bar, Line, Area, Pie
 * - Radar, Scatter, Bubble, Heatmap
 * - Treemap, Sankey, Gauge, Waterfall, Funnel
 * 
 * Features:
 * - SVG-based rendering for quality
 * - Animations and transitions
 * - Interactive tooltips
 * - Responsive design
 * - Custom color schemes
 * - Data labels and legends
 * - Grid lines and axes
 * - Zoom and pan capabilities
 * 
 * Zero external dependencies - pure TypeScript/JavaScript implementation.
 */
export class ChartGenerator {
  private readonly logger = Logger.getInstance();
  private readonly defaultColors: string[] = [
    '#93186C', // Primary brand color
    '#10B981', // Success green
    '#EF4444', // Error red
    '#F59E0B', // Warning yellow
    '#3B82F6', // Info blue
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#6366F1', // Indigo
    '#84CC16', // Lime
    '#06B6D4'  // Cyan
  ];

  /**
   * Generate chart based on type
   */
  async generateChart(
    type: ChartType,
    data: ChartData,
    options: ChartOptions,
    theme: ReportTheme
  ): Promise<string> {
    this.logger.info(`Generating ${type} chart`);
    
    const chartId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    const colors: ChartColors = options.colors 
      ? { dataColors: options.colors }
      : this.generateColorPalette(data, theme);
    
    switch (type) {
      case ChartType.DOUGHNUT:
        return this.generateDoughnutChart(chartId, data as DoughnutChart, options, colors);
      case ChartType.BAR:
        return this.generateBarChart(chartId, data as BarChart, options, colors);
      case ChartType.LINE:
        return this.generateLineChart(chartId, data as LineChart, options, colors);
      case ChartType.AREA:
        return this.generateAreaChart(chartId, data as AreaChart, options, colors);
      case ChartType.PIE:
        return this.generatePieChart(chartId, data as PieChart, options, colors);
      case ChartType.RADAR:
        return this.generateRadarChart(chartId, data as RadarChart, options, colors);
      case ChartType.SCATTER:
        return this.generateScatterChart(chartId, data as ScatterChart, options, colors);
      case ChartType.BUBBLE:
        return this.generateBubbleChart(chartId, data as BubbleChart, options, colors);
      case ChartType.HEATMAP:
        return this.generateHeatmapChart(chartId, data as HeatmapChart, options, colors);
      case ChartType.TREEMAP:
        return this.generateTreemapChart(chartId, data as TreemapChart, options, colors);
      case ChartType.SANKEY:
        return this.generateSankeyChart(chartId, data as SankeyChart, options, colors);
      case ChartType.GAUGE:
        return this.generateGaugeChart(chartId, data as GaugeChart, options, colors);
      case ChartType.WATERFALL:
        return this.generateWaterfallChart(chartId, data as WaterfallChart, options, colors);
      case ChartType.FUNNEL:
        return this.generateFunnelChart(chartId, data as FunnelChart, options, colors);
      default:
        throw new Error(`Unsupported chart type: ${type}`);
    }
  }

  /**
   * Generate Doughnut Chart
   */
  private generateDoughnutChart(
    id: string,
    data: DoughnutChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 400;
    const height = options.height || 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(width, height) / 2 - 40;
    const innerRadius = outerRadius * 0.6;
    
    // Defensive check for data.values
    if (!data.values || !Array.isArray(data.values)) {
      console.error('DoughnutChart: data.values is undefined or not an array');
      return '<svg width="' + width + '" height="' + height + '"><text x="' + (width/2) + '" y="' + (height/2) + '" text-anchor="middle">No data available</text></svg>';
    }
    
    const total = data.values.reduce((sum: number, val: number) => sum + val, 0);
    let currentAngle = -Math.PI / 2; // Start at top
    
    const segments = data.values.map((value: number, index: number) => {
      const percentage = value / total;
      const angle = percentage * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      
      return {
        value,
        percentage,
        startAngle,
        endAngle,
        label: data.labels[index],
        color: colors.dataColors[index % colors.dataColors.length]
      };
    });
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      ${this.generateChartGradients(colors)}
    </defs>
    
    <!-- Chart Title -->
    ${options.title ? `
    <text x="${centerX}" y="20" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Doughnut Segments -->
    <g class="doughnut-segments" transform="translate(${centerX}, ${centerY})">
      ${segments.map((segment: any, index: number) => {
        const path = this.createArcPath(
          0, 0, innerRadius, outerRadius,
          segment.startAngle, segment.endAngle
        );
        
        return `
        <g class="segment" data-index="${index}">
          <path
            d="${path}"
            fill="${segment.color}"
            stroke="white"
            stroke-width="2"
            class="segment-path"
            data-value="${segment.value}"
            data-label="${segment.label}"
            style="cursor: pointer; transition: all 0.3s ease;"
            onmouseover="chartHover_${id}(event, ${index})"
            onmouseout="chartUnhover_${id}(event, ${index})"
            onclick="chartClick_${id}(event, ${index})"
          />
          
          <!-- Label -->
          ${options.showLegend === false ? '' : this.createSegmentLabel(segment, innerRadius, outerRadius)}
        </g>`;
      }).join('')}
    </g>
    
    <!-- Center Text -->
    <g class="center-text" transform="translate(${centerX}, ${centerY})">
      <text y="-10" text-anchor="middle" class="center-value">
        ${data.centerText?.value || total}
      </text>
      <text y="10" text-anchor="middle" class="center-label">
        ${data.centerText?.label || 'Total'}
      </text>
    </g>
    
    <!-- Legend -->
    ${options.showLegend !== false ? this.generateLegend(
      segments.map((s: any) => ({ label: s.label, color: s.color })),
      width, height, 'right'
    ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateDoughnutScript(id, segments, total)}`;
  }

  /**
   * Generate Bar Chart
   */
  private generateBarChart(
    id: string,
    data: BarChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate scales
    const barWidth = chartWidth / data.labels.length;
    const maxValue = Math.max(...data.datasets.flatMap(ds => ds.data));
    const yScale = chartHeight / (maxValue * 1.1); // Add 10% padding
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      ${this.generateChartGradients(colors)}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Grid Lines -->
      ${this.generateGridLines(chartWidth, chartHeight, 5, 'horizontal')}
      
      <!-- X Axis -->
      <g class="x-axis" transform="translate(0, ${chartHeight})">
        <line x1="0" y1="0" x2="${chartWidth}" y2="0" stroke="${colors.gridColor}" />
        ${data.labels.map((label, index) => `
        <g transform="translate(${index * barWidth + barWidth / 2}, 0)">
          <line y1="0" y2="6" stroke="${colors.gridColor}" />
          <text y="20" text-anchor="middle" class="axis-label">
            ${this.truncateLabel(label, 10)}
          </text>
        </g>
        `).join('')}
      </g>
      
      <!-- Y Axis -->
      <g class="y-axis">
        <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.gridColor}" />
        ${this.generateYAxisLabels(0, maxValue, 5).map((value: any) => `
        <g transform="translate(0, ${chartHeight - (value * yScale)})">
          <line x1="-6" x2="0" stroke="${colors.gridColor}" />
          <text x="-10" y="5" text-anchor="end" class="axis-label">
            ${this.formatAxisValue(value)}
          </text>
        </g>
        `).join('')}
      </g>
      
      <!-- Bars -->
      ${data.datasets.map((dataset, datasetIndex) => {
        const barGroupWidth = barWidth / data.datasets.length;
        const barPadding = barGroupWidth * 0.1;
        
        return `
        <g class="dataset" data-dataset="${datasetIndex}">
          ${dataset.data.map((value, index) => {
            const x = index * barWidth + datasetIndex * barGroupWidth + barPadding;
            const barHeight = value * yScale;
            const y = chartHeight - barHeight;
            
            return `
            <rect
              x="${x}"
              y="${y}"
              width="${barGroupWidth - 2 * barPadding}"
              height="${barHeight}"
              fill="${colors.dataColors[datasetIndex % colors.dataColors.length]}"
              class="bar"
              data-value="${value}"
              data-label="${data.labels[index]}"
              data-dataset="${dataset.label}"
              style="cursor: pointer; transition: all 0.3s ease;"
              onmouseover="barHover_${id}(event, ${datasetIndex}, ${index})"
              onmouseout="barUnhover_${id}(event, ${datasetIndex}, ${index})"
            >
              <animate
                attributeName="height"
                from="0"
                to="${barHeight}"
                dur="0.5s"
                fill="freeze"
              />
              <animate
                attributeName="y"
                from="${chartHeight}"
                to="${y}"
                dur="0.5s"
                fill="freeze"
              />
            </rect>
            
            <!-- Value Label -->
            ${options.showValues ? `
            <text
              x="${x + (barGroupWidth - 2 * barPadding) / 2}"
              y="${y - 5}"
              text-anchor="middle"
              class="value-label"
              style="opacity: 0"
            >
              ${value}
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                begin="0.5s"
                dur="0.3s"
                fill="freeze"
              />
            </text>
            ` : ''}
            `;
          }).join('')}
        </g>`;
      }).join('')}
      
      <!-- Axis Labels -->
      ${options.xAxisLabel ? `
      <text
        x="${chartWidth / 2}"
        y="${chartHeight + 50}"
        text-anchor="middle"
        class="axis-title"
      >
        ${options.xAxisLabel}
      </text>
      ` : ''}
      
      ${options.yAxisLabel ? `
      <text
        x="${-chartHeight / 2}"
        y="-40"
        text-anchor="middle"
        transform="rotate(-90)"
        class="axis-title"
      >
        ${options.yAxisLabel}
      </text>
      ` : ''}
    </g>
    
    <!-- Legend -->
    ${data.datasets.length > 1 && options.showLegend !== false ? 
      this.generateLegend(
        data.datasets.map((ds: any, i: number) => ({
          label: ds.label,
          color: ds.color || colors.dataColors[i % colors.dataColors.length]
        })),
        width, height, 'top'
      ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateBarChartScript(id, data)}`;
  }

  /**
   * Generate Line Chart
   */
  private generateLineChart(
    id: string,
    data: LineChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate scales
    const xScale = chartWidth / (data.labels.length - 1);
    const allValues = data.datasets.flatMap(ds => ds.data);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const valueRange = maxValue - minValue;
    const yScale = chartHeight / (valueRange * 1.1);
    const yOffset = minValue - valueRange * 0.05;
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      ${this.generateChartGradients(colors)}
      
      <!-- Area gradients -->
      ${data.datasets.map((_dataset: any, index: number) => {
        const color = colors.dataColors[index % colors.dataColors.length];
        return `
        <linearGradient id="${id}-gradient-${index}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0" />
        </linearGradient>`;
      }).join('')}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Grid -->
      ${this.generateGridLines(chartWidth, chartHeight, 5, 'both')}
      
      <!-- X Axis -->
      <g class="x-axis" transform="translate(0, ${chartHeight})">
        <line x1="0" y1="0" x2="${chartWidth}" y2="0" stroke="${colors.gridColor}" />
        ${data.labels.map((label, index) => `
        <g transform="translate(${index * xScale}, 0)">
          <line y1="0" y2="6" stroke="${colors.gridColor}" />
          <text y="20" text-anchor="middle" class="axis-label">
            ${this.truncateLabel(label, 10)}
          </text>
        </g>
        `).join('')}
      </g>
      
      <!-- Y Axis -->
      <g class="y-axis">
        <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.gridColor}" />
        ${this.generateYAxisLabels(minValue, maxValue, 5).map((value: any) => `
        <g transform="translate(0, ${chartHeight - ((value - yOffset) * yScale)})">
          <line x1="-6" x2="0" stroke="${colors.gridColor}" />
          <text x="-10" y="5" text-anchor="end" class="axis-label">
            ${this.formatAxisValue(value)}
          </text>
        </g>
        `).join('')}
      </g>
      
      <!-- Lines and Areas -->
      ${data.datasets.map((dataset, datasetIndex) => {
        const color = colors.dataColors[datasetIndex % colors.dataColors.length];
        const points = dataset.data.map((value, index) => ({
          x: index * xScale,
          y: chartHeight - ((value - yOffset) * yScale)
        }));
        
        const linePath = this.createLinePath(points, dataset.smooth !== false);
        const lastPoint = points[points.length - 1];
        const areaPath = lastPoint 
          ? `${linePath} L ${lastPoint.x},${chartHeight} L 0,${chartHeight} Z`
          : linePath;
        
        return `
        <g class="dataset" data-dataset="${datasetIndex}">
          <!-- Area -->
          ${dataset.fill !== false ? `
          <path
            d="${areaPath}"
            fill="url(#${id}-gradient-${datasetIndex})"
            class="line-area"
            style="opacity: 0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.5s"
              begin="0.3s"
              fill="freeze"
            />
          </path>
          ` : ''}
          
          <!-- Line -->
          <path
            d="${linePath}"
            fill="none"
            stroke="${color}"
            stroke-width="${dataset.borderWidth || 2}"
            class="line-path"
            style="stroke-dasharray: ${this.getPathLength(linePath)}; stroke-dashoffset: ${this.getPathLength(linePath)}"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="${this.getPathLength(linePath)}"
              to="0"
              dur="1s"
              fill="freeze"
            />
          </path>
          
          <!-- Points -->
          ${points.map((point, index) => `
          <circle
            cx="${point.x}"
            cy="${point.y}"
            r="${dataset.pointRadius || 4}"
            fill="${color}"
            stroke="white"
            stroke-width="2"
            class="line-point"
            data-value="${dataset.data[index]}"
            data-label="${data.labels[index]}"
            data-dataset="${dataset.label}"
            style="cursor: pointer; opacity: 0"
            onmouseover="linePointHover(event, ${datasetIndex}, ${index})"
            onmouseout="linePointUnhover(event, ${datasetIndex}, ${index})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${0.5 + index * 0.05}s"
              dur="0.3s"
              fill="freeze"
            />
          </circle>
          `).join('')}
        </g>`;
      }).join('')}
      
      <!-- Axis Labels -->
      ${options.xAxisLabel ? `
      <text
        x="${chartWidth / 2}"
        y="${chartHeight + 50}"
        text-anchor="middle"
        class="axis-title"
      >
        ${options.xAxisLabel}
      </text>
      ` : ''}
      
      ${options.yAxisLabel ? `
      <text
        x="${-chartHeight / 2}"
        y="-40"
        text-anchor="middle"
        transform="rotate(-90)"
        class="axis-title"
      >
        ${options.yAxisLabel}
      </text>
      ` : ''}
    </g>
    
    <!-- Legend -->
    ${data.datasets.length > 1 && options.showLegend !== false ? 
      this.generateLegend(
        data.datasets.map((ds: any, i: number) => ({
          label: ds.label,
          color: ds.color || colors.dataColors[i % colors.dataColors.length]
        })),
        width, height, 'top'
      ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateLineChartScript(id, data)}`;
  }

  /**
   * Generate Area Chart
   */
  private generateAreaChart(
    id: string,
    data: AreaChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    // Area chart is similar to line chart with filled areas
    const lineChartData: LineChart = {
      type: ChartType.AREA,
      title: data.title || '',
      data: data,
      options: options,
      labels: data.labels,
      datasets: data.datasets.map(ds => ({
        ...ds,
        fill: true
      }))
    };
    
    return this.generateLineChart(id, lineChartData, options, colors);
  }

  /**
   * Generate Pie Chart
   */
  private generatePieChart(
    id: string,
    data: PieChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 400;
    const height = options.height || 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;
    
    // Defensive check for data.values
    if (!data.values || !Array.isArray(data.values)) {
      console.error('PieChart: data.values is undefined or not an array');
      return '<svg width="' + width + '" height="' + height + '"><text x="' + (width/2) + '" y="' + (height/2) + '" text-anchor="middle">No data available</text></svg>';
    }
    
    const total = data.values.reduce((sum: number, val: number) => sum + val, 0);
    let currentAngle = -Math.PI / 2;
    
    const segments = data.values.map((value: number, index: number) => {
      const percentage = value / total;
      const angle = percentage * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      
      return {
        value,
        percentage,
        startAngle,
        endAngle,
        label: data.labels[index],
        color: colors.dataColors[index % colors.dataColors.length]
      };
    });
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      ${this.generateChartGradients(colors)}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${centerX}" y="20" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Pie Segments -->
    <g class="pie-segments" transform="translate(${centerX}, ${centerY})">
      ${segments.map((segment: any, index: number) => {
        const path = this.createArcPath(
          0, 0, 0, radius,
          segment.startAngle, segment.endAngle
        );
        
        const labelAngle = (segment.startAngle + segment.endAngle) / 2;
        const labelX = Math.cos(labelAngle) * (radius * 0.7);
        const labelY = Math.sin(labelAngle) * (radius * 0.7);
        
        return `
        <g class="segment" data-index="${index}">
          <path
            d="${path}"
            fill="${segment.color}"
            stroke="white"
            stroke-width="2"
            class="segment-path"
            data-value="${segment.value}"
            data-label="${segment.label}"
            style="cursor: pointer; transition: all 0.3s ease; transform-origin: center;"
            onmouseover="pieHover(event, ${index})"
            onmouseout="pieUnhover(event, ${index})"
          >
            <animate
              attributeName="d"
              from="${this.createArcPath(0, 0, 0, 0, segment.startAngle, segment.endAngle)}"
              to="${path}"
              dur="0.5s"
              fill="freeze"
            />
          </path>
          
          <!-- Value Label -->
          ${segment.percentage > 0.05 ? `
          <text
            x="${labelX}"
            y="${labelY}"
            text-anchor="middle"
            class="segment-label"
            style="pointer-events: none; opacity: 0"
          >
            ${Math.round(segment.percentage * 100)}%
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="0.5s"
              dur="0.3s"
              fill="freeze"
            />
          </text>
          ` : ''}
        </g>`;
      }).join('')}
    </g>
    
    <!-- Legend -->
    ${options.showLegend !== false ? this.generateLegend(
      segments.map((s: any) => ({ label: s.label, color: s.color })),
      width, height, 'right'
    ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generatePieChartScript(id, segments, total)}`;
  }

  /**
   * Generate Radar Chart
   */
  private generateRadarChart(
    id: string,
    data: RadarChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 400;
    const height = options.height || 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 60;
    
    const axes = data.labels.length;
    const angleStep = (2 * Math.PI) / axes;
    const levels = 5;
    
    // Calculate max value for scaling
    const maxValue = Math.max(...data.datasets.flatMap(ds => ds.data));
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      ${data.datasets.map((_dataset: any, index: number) => {
        const color = colors.dataColors[index % colors.dataColors.length];
        return `
        <linearGradient id="${id}-radar-gradient-${index}">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.1" />
        </linearGradient>`;
      }).join('')}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${centerX}" y="20" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Radar Grid -->
    <g class="radar-grid" transform="translate(${centerX}, ${centerY})">
      <!-- Circular Grid Lines -->
      ${Array.from({ length: levels }, (_, i) => {
        const levelRadius = radius * ((i + 1) / levels);
        const points = Array.from({ length: axes }, (_, j) => {
          const angle = j * angleStep - Math.PI / 2;
          return {
            x: Math.cos(angle) * levelRadius,
            y: Math.sin(angle) * levelRadius
          };
        });
        
        return `
        <polygon
          points="${points.map(p => `${p.x},${p.y}`).join(' ')}"
          fill="none"
          stroke="${colors.gridColor}"
          stroke-width="1"
          opacity="0.3"
        />`;
      }).join('')}
      
      <!-- Axes -->
      ${data.labels.map((label, index) => {
        const angle = index * angleStep - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const labelX = Math.cos(angle) * (radius + 20);
        const labelY = Math.sin(angle) * (radius + 20);
        
        return `
        <g class="radar-axis">
          <line
            x1="0"
            y1="0"
            x2="${x}"
            y2="${y}"
            stroke="${colors.gridColor}"
            stroke-width="1"
            opacity="0.3"
          />
          <text
            x="${labelX}"
            y="${labelY}"
            text-anchor="middle"
            dominant-baseline="middle"
            class="axis-label"
          >
            ${label}
          </text>
        </g>`;
      }).join('')}
      
      <!-- Scale Labels -->
      ${Array.from({ length: levels }, (_, i) => {
        const value = (maxValue * (i + 1)) / levels;
        const y = -radius * ((i + 1) / levels);
        
        return `
        <text
          x="5"
          y="${y}"
          text-anchor="start"
          class="scale-label"
          font-size="10"
          fill="${colors.textColor}"
          opacity="0.5"
        >
          ${this.formatAxisValue(value)}
        </text>`;
      }).join('')}
      
      <!-- Data Polygons -->
      ${data.datasets.map((dataset, datasetIndex) => {
        const color = colors.dataColors[datasetIndex % colors.dataColors.length];
        const points = dataset.data.map((value, index) => {
          const angle = index * angleStep - Math.PI / 2;
          const distance = (value / maxValue) * radius;
          return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance
          };
        });
        
        const pathData = points.map(p => `${p.x},${p.y}`).join(' ');
        
        return `
        <g class="dataset" data-dataset="${datasetIndex}">
          <!-- Area -->
          <polygon
            points="${pathData}"
            fill="url(#${id}-radar-gradient-${datasetIndex})"
            stroke="${color}"
            stroke-width="2"
            class="radar-area"
            style="opacity: 0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              dur="0.5s"
              fill="freeze"
            />
          </polygon>
          
          <!-- Points -->
          ${points.map((point, index) => `
          <circle
            cx="${point.x}"
            cy="${point.y}"
            r="4"
            fill="${color}"
            stroke="white"
            stroke-width="2"
            class="radar-point"
            data-value="${dataset.data[index]}"
            data-label="${data.labels[index]}"
            data-dataset="${dataset.label}"
            style="cursor: pointer; opacity: 0"
            onmouseover="radarPointHover(event, ${datasetIndex}, ${index})"
            onmouseout="radarPointUnhover(event, ${datasetIndex}, ${index})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${0.5 + index * 0.1}s"
              dur="0.3s"
              fill="freeze"
            />
          </circle>
          `).join('')}
        </g>`;
      }).join('')}
    </g>
    
    <!-- Legend -->
    ${data.datasets.length > 1 && options.showLegend !== false ? 
      this.generateLegend(
        data.datasets.map((ds: any, i: number) => ({
          label: ds.label,
          color: ds.color || colors.dataColors[i % colors.dataColors.length]
        })),
        width, height, 'bottom'
      ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateRadarChartScript(id, data)}`;
  }

  /**
   * Generate Scatter Chart
   */
  private generateScatterChart(
    id: string,
    data: ScatterChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate scales
    const allPoints = data.datasets.flatMap(ds => ds.data);
    const xMin = Math.min(...allPoints.map(p => p.x));
    const xMax = Math.max(...allPoints.map(p => p.x));
    const yMin = Math.min(...allPoints.map(p => p.y));
    const yMax = Math.max(...allPoints.map(p => p.y));
    
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xScale = chartWidth / (xRange * 1.1);
    const yScale = chartHeight / (yRange * 1.1);
    const xOffset = xMin - xRange * 0.05;
    const yOffset = yMin - yRange * 0.05;
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Grid -->
      ${this.generateGridLines(chartWidth, chartHeight, 5, 'both')}
      
      <!-- X Axis -->
      <g class="x-axis" transform="translate(0, ${chartHeight})">
        <line x1="0" y1="0" x2="${chartWidth}" y2="0" stroke="${colors.gridColor}" />
        ${this.generateAxisValues(xMin, xMax, 5).map((value: any) => {
          const x = (value - xOffset) * xScale;
          return `
          <g transform="translate(${x}, 0)">
            <line y1="0" y2="6" stroke="${colors.gridColor}" />
            <text y="20" text-anchor="middle" class="axis-label">
              ${this.formatAxisValue(value)}
            </text>
          </g>`;
        }).join('')}
      </g>
      
      <!-- Y Axis -->
      <g class="y-axis">
        <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.gridColor}" />
        ${this.generateAxisValues(yMin, yMax, 5).map((value: any) => {
          const y = chartHeight - ((value - yOffset) * yScale);
          return `
          <g transform="translate(0, ${y})">
            <line x1="-6" x2="0" stroke="${colors.gridColor}" />
            <text x="-10" y="5" text-anchor="end" class="axis-label">
              ${this.formatAxisValue(value)}
            </text>
          </g>`;
        }).join('')}
      </g>
      
      <!-- Data Points -->
      ${data.datasets.map((dataset, datasetIndex) => {
        const color = colors.dataColors[datasetIndex % colors.dataColors.length];
        
        return `
        <g class="dataset" data-dataset="${datasetIndex}">
          ${dataset.data.map((point, index) => {
            const x = (point.x - xOffset) * xScale;
            const y = chartHeight - ((point.y - yOffset) * yScale);
            
            return `
            <circle
              cx="${x}"
              cy="${y}"
              r="${dataset.pointRadius || 5}"
              fill="${color}"
              fill-opacity="0.6"
              stroke="${color}"
              stroke-width="1"
              class="scatter-point"
              data-x="${point.x}"
              data-y="${point.y}"
              data-dataset="${dataset.label}"
              style="cursor: pointer; opacity: 0"
              onmouseover="scatterPointHover(event, ${datasetIndex}, ${index})"
              onmouseout="scatterPointUnhover(event, ${datasetIndex}, ${index})"
            >
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                begin="${Math.random() * 0.5}s"
                dur="0.3s"
                fill="freeze"
              />
              <animate
                attributeName="r"
                from="0"
                to="${dataset.pointRadius || 5}"
                begin="${Math.random() * 0.5}s"
                dur="0.3s"
                fill="freeze"
              />
            </circle>`;
          }).join('')}
        </g>`;
      }).join('')}
      
      <!-- Axis Labels -->
      ${options.xAxisLabel ? `
      <text
        x="${chartWidth / 2}"
        y="${chartHeight + 50}"
        text-anchor="middle"
        class="axis-title"
      >
        ${options.xAxisLabel}
      </text>
      ` : ''}
      
      ${options.yAxisLabel ? `
      <text
        x="${-chartHeight / 2}"
        y="-40"
        text-anchor="middle"
        transform="rotate(-90)"
        class="axis-title"
      >
        ${options.yAxisLabel}
      </text>
      ` : ''}
    </g>
    
    <!-- Legend -->
    ${data.datasets.length > 1 && options.showLegend !== false ? 
      this.generateLegend(
        data.datasets.map((ds: any, i: number) => ({
          label: ds.label,
          color: ds.color || colors.dataColors[i % colors.dataColors.length]
        })),
        width, height, 'right'
      ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateScatterChartScript(id, data)}`;
  }

  /**
   * Generate Bubble Chart
   */
  private generateBubbleChart(
    id: string,
    data: BubbleChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate scales
    const allPoints = data.datasets.flatMap(ds => ds.data);
    const xMin = Math.min(...allPoints.map(p => p.x));
    const xMax = Math.max(...allPoints.map(p => p.x));
    const yMin = Math.min(...allPoints.map(p => p.y));
    const yMax = Math.max(...allPoints.map(p => p.y));
    const rMax = Math.max(...allPoints.map(p => p.r || 5));
    
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xScale = chartWidth / (xRange * 1.1);
    const yScale = chartHeight / (yRange * 1.1);
    const xOffset = xMin - xRange * 0.05;
    const yOffset = yMin - yRange * 0.05;
    const maxBubbleSize = 50;
    const rScale = maxBubbleSize / rMax;
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      ${data.datasets.map((_dataset: any, index: number) => {
        const color = colors.dataColors[index % colors.dataColors.length];
        return `
        <radialGradient id="${id}-bubble-gradient-${index}">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.3" />
        </radialGradient>`;
      }).join('')}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Grid -->
      ${this.generateGridLines(chartWidth, chartHeight, 5, 'both')}
      
      <!-- X Axis -->
      <g class="x-axis" transform="translate(0, ${chartHeight})">
        <line x1="0" y1="0" x2="${chartWidth}" y2="0" stroke="${colors.gridColor}" />
        ${this.generateAxisValues(xMin, xMax, 5).map((value: any) => {
          const x = (value - xOffset) * xScale;
          return `
          <g transform="translate(${x}, 0)">
            <line y1="0" y2="6" stroke="${colors.gridColor}" />
            <text y="20" text-anchor="middle" class="axis-label">
              ${this.formatAxisValue(value)}
            </text>
          </g>`;
        }).join('')}
      </g>
      
      <!-- Y Axis -->
      <g class="y-axis">
        <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.gridColor}" />
        ${this.generateAxisValues(yMin, yMax, 5).map((value: any) => {
          const y = chartHeight - ((value - yOffset) * yScale);
          return `
          <g transform="translate(0, ${y})">
            <line x1="-6" x2="0" stroke="${colors.gridColor}" />
            <text x="-10" y="5" text-anchor="end" class="axis-label">
              ${this.formatAxisValue(value)}
            </text>
          </g>`;
        }).join('')}
      </g>
      
      <!-- Bubbles -->
      ${data.datasets.map((dataset, datasetIndex) => {
        // Sort bubbles by size (largest first) to prevent overlap issues
        const sortedData = [...dataset.data].sort((a, b) => (b.r || 0) - (a.r || 0));
        
        return `
        <g class="dataset" data-dataset="${datasetIndex}">
          ${sortedData.map((point, index) => {
            const x = (point.x - xOffset) * xScale;
            const y = chartHeight - ((point.y - yOffset) * yScale);
            const r = (point.r || 5) * rScale;
            
            return `
            <circle
              cx="${x}"
              cy="${y}"
              r="${r}"
              fill="url(#${id}-bubble-gradient-${datasetIndex})"
              stroke="${colors.dataColors[datasetIndex % colors.dataColors.length]}"
              stroke-width="1"
              class="bubble"
              data-x="${point.x}"
              data-y="${point.y}"
              data-r="${point.r}"
              data-dataset="${dataset.label}"
              style="cursor: pointer; opacity: 0"
              onmouseover="bubbleHover(event, ${datasetIndex}, ${index})"
              onmouseout="bubbleUnhover(event, ${datasetIndex}, ${index})"
            >
              <animate
                attributeName="opacity"
                from="0"
                to="1"
                begin="${Math.random() * 0.5}s"
                dur="0.5s"
                fill="freeze"
              />
              <animate
                attributeName="r"
                from="0"
                to="${r}"
                begin="${Math.random() * 0.5}s"
                dur="0.5s"
                fill="freeze"
              />
            </circle>`;
          }).join('')}
        </g>`;
      }).join('')}
      
      <!-- Axis Labels -->
      ${options.xAxisLabel ? `
      <text
        x="${chartWidth / 2}"
        y="${chartHeight + 50}"
        text-anchor="middle"
        class="axis-title"
      >
        ${options.xAxisLabel}
      </text>
      ` : ''}
      
      ${options.yAxisLabel ? `
      <text
        x="${-chartHeight / 2}"
        y="-40"
        text-anchor="middle"
        transform="rotate(-90)"
        class="axis-title"
      >
        ${options.yAxisLabel}
      </text>
      ` : ''}
    </g>
    
    <!-- Legend -->
    ${data.datasets.length > 1 && options.showLegend !== false ? 
      this.generateLegend(
        data.datasets.map((ds: any, i: number) => ({
          label: ds.label,
          color: ds.color || colors.dataColors[i % colors.dataColors.length]
        })),
        width, height, 'right'
      ) : ''}
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateBubbleChartScript(id, data)}`;
  }

  /**
   * Generate Heatmap Chart
   */
  private generateHeatmapChart(
    id: string,
    data: HeatmapChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 80, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    const cellWidth = chartWidth / data.xLabels.length;
    const cellHeight = chartHeight / data.yLabels.length;
    
    // Find min and max values for color scaling
    const flatData = data.data.flat();
    const minValue = Math.min(...flatData);
    const maxValue = Math.max(...flatData);
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      <!-- Color gradient for heatmap -->
      <linearGradient id="${id}-heatmap-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${colors.heatmapColors?.[0] || '#f3f4f6'}" />
        <stop offset="50%" style="stop-color:${colors.heatmapColors?.[1] || '#fbbf24'}" />
        <stop offset="100%" style="stop-color:${colors.heatmapColors?.[2] || '#dc2626'}" />
      </linearGradient>
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Heatmap Cells -->
      ${data.data.map((row, rowIndex) => 
        row.map((value, colIndex) => {
          const normalizedValue = (value - minValue) / (maxValue - minValue);
          const color = this.getHeatmapColor(normalizedValue, colors.heatmapColors || ['#f3f4f6', '#fbbf24', '#dc2626']);
          
          return `
          <rect
            x="${colIndex * cellWidth}"
            y="${rowIndex * cellHeight}"
            width="${cellWidth}"
            height="${cellHeight}"
            fill="${color}"
            stroke="white"
            stroke-width="1"
            class="heatmap-cell"
            data-value="${value}"
            data-x="${data.xLabels[colIndex]}"
            data-y="${data.yLabels[rowIndex]}"
            style="cursor: pointer; opacity: 0"
            onmouseover="heatmapCellHover(event, ${rowIndex}, ${colIndex})"
            onmouseout="heatmapCellUnhover(event, ${rowIndex}, ${colIndex})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${(rowIndex * data.xLabels.length + colIndex) * 0.01}s"
              dur="0.3s"
              fill="freeze"
            />
          </rect>
          
          <!-- Value text (if cell is large enough) -->
          ${cellWidth > 40 && cellHeight > 30 ? `
          <text
            x="${colIndex * cellWidth + cellWidth / 2}"
            y="${rowIndex * cellHeight + cellHeight / 2}"
            text-anchor="middle"
            dominant-baseline="middle"
            class="cell-value"
            font-size="${Math.min(cellWidth, cellHeight) * 0.3}"
            fill="${normalizedValue > 0.5 ? 'white' : 'black'}"
            style="opacity: 0; pointer-events: none"
          >
            ${this.formatCellValue(value)}
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${(rowIndex * data.xLabels.length + colIndex) * 0.01 + 0.3}s"
              dur="0.3s"
              fill="freeze"
            />
          </text>
          ` : ''}`;
        }).join('')
      ).join('')}
      
      <!-- X Labels -->
      ${data.xLabels.map((label, index) => `
      <text
        x="${index * cellWidth + cellWidth / 2}"
        y="${chartHeight + 20}"
        text-anchor="middle"
        class="axis-label"
        transform="rotate(45, ${index * cellWidth + cellWidth / 2}, ${chartHeight + 20})"
      >
        ${label}
      </text>
      `).join('')}
      
      <!-- Y Labels -->
      ${data.yLabels.map((label, index) => `
      <text
        x="-10"
        y="${index * cellHeight + cellHeight / 2}"
        text-anchor="end"
        dominant-baseline="middle"
        class="axis-label"
      >
        ${label}
      </text>
      `).join('')}
      
      <!-- Axis Labels -->
      ${options.xAxisLabel ? `
      <text
        x="${chartWidth / 2}"
        y="${chartHeight + 70}"
        text-anchor="middle"
        class="axis-title"
      >
        ${options.xAxisLabel}
      </text>
      ` : ''}
      
      ${options.yAxisLabel ? `
      <text
        x="${-chartHeight / 2}"
        y="-60"
        text-anchor="middle"
        transform="rotate(-90)"
        class="axis-title"
      >
        ${options.yAxisLabel}
      </text>
      ` : ''}
    </g>
    
    <!-- Color Scale Legend -->
    <g transform="translate(${width - margin.right - 120}, ${margin.top})">
      <text x="60" y="-10" text-anchor="middle" class="legend-title">Scale</text>
      
      <!-- Gradient rect -->
      <rect
        x="10"
        y="0"
        width="100"
        height="20"
        fill="url(#${id}-heatmap-gradient)"
        stroke="${colors.gridColor}"
      />
      
      <!-- Scale labels -->
      <text x="10" y="35" text-anchor="middle" class="scale-label">
        ${this.formatAxisValue(minValue)}
      </text>
      <text x="110" y="35" text-anchor="middle" class="scale-label">
        ${this.formatAxisValue(maxValue)}
      </text>
    </g>
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateHeatmapChartScript(id, data)}`;
  }

  /**
   * Generate Treemap Chart
   */
  private generateTreemapChart(
    id: string,
    data: TreemapChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Defensive check for data.data
    if (!data.data || !Array.isArray(data.data)) {
      console.error('TreemapChart: data.data is undefined or not an array');
      return '<svg width="' + width + '" height="' + height + '"><text x="' + (width/2) + '" y="' + (height/2) + '" text-anchor="middle">No data available</text></svg>';
    }
    
    // Calculate treemap layout
    const totalValue = data.data.reduce((sum: number, item: any) => sum + item.value, 0);
    const normalizedData = data.data.map(item => ({
      label: item.label || item.name,
      value: item.value,
      color: item.color
    }));
    const rectangles = this.calculateTreemapLayout(normalizedData, chartWidth, chartHeight);
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      ${rectangles.map((rect, index) => {
        const color = colors.dataColors[index % colors.dataColors.length];
        const percentage = (rect.value / totalValue) * 100;
        
        return `
        <g class="treemap-rect" data-index="${index}">
          <rect
            x="${rect.x}"
            y="${rect.y}"
            width="${rect.width}"
            height="${rect.height}"
            fill="${color}"
            stroke="white"
            stroke-width="2"
            class="treemap-cell"
            data-label="${rect.label}"
            data-value="${rect.value}"
            style="cursor: pointer; opacity: 0"
            onmouseover="treemapCellHover(event, ${index})"
            onmouseout="treemapCellUnhover(event, ${index})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="0.8"
              begin="${index * 0.05}s"
              dur="0.3s"
              fill="freeze"
            />
          </rect>
          
          <!-- Label (if rectangle is large enough) -->
          ${rect.width > 50 && rect.height > 30 ? `
          <text
            x="${rect.x + rect.width / 2}"
            y="${rect.y + rect.height / 2 - 10}"
            text-anchor="middle"
            class="treemap-label"
            style="pointer-events: none"
          >
            ${this.truncateLabel(rect.label, Math.floor(rect.width / 10))}
          </text>
          <text
            x="${rect.x + rect.width / 2}"
            y="${rect.y + rect.height / 2 + 10}"
            text-anchor="middle"
            class="treemap-value"
            style="pointer-events: none"
          >
            ${this.formatValue(rect.value)} (${percentage.toFixed(1)}%)
          </text>
          ` : ''}
        </g>`;
      }).join('')}
    </g>
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateTreemapChartScript(id, data, totalValue)}`;
  }

  /**
   * Generate Sankey Chart
   */
  private generateSankeyChart(
    id: string,
    data: SankeyChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 800;
    const height = options.height || 600;
    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate node positions
    const nodes = this.calculateSankeyNodes(data.nodes, data.links, chartWidth, chartHeight);
    const links = this.calculateSankeyLinks(nodes, data.links);
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      <!-- Gradients for links -->
      ${links.map((link, index) => `
      <linearGradient id="${id}-link-gradient-${index}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${link.source.color};stop-opacity:0.5" />
        <stop offset="100%" style="stop-color:${link.target.color};stop-opacity:0.5" />
      </linearGradient>
      `).join('')}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Links -->
      <g class="sankey-links">
        ${links.map((link, index) => {
          const path = this.createSankeyLinkPath(link);
          
          return `
          <path
            d="${path}"
            fill="url(#${id}-link-gradient-${index})"
            stroke="none"
            class="sankey-link"
            data-source="${link.source.label}"
            data-target="${link.target.label}"
            data-value="${link.value}"
            style="opacity: 0"
            onmouseover="sankeyLinkHover(event, ${index})"
            onmouseout="sankeyLinkUnhover(event, ${index})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="0.6"
              begin="${index * 0.05}s"
              dur="0.5s"
              fill="freeze"
            />
          </path>`;
        }).join('')}
      </g>
      
      <!-- Nodes -->
      <g class="sankey-nodes">
        ${nodes.map((node, index) => `
        <g class="sankey-node" data-index="${index}">
          <rect
            x="${node.x}"
            y="${node.y}"
            width="${node.width}"
            height="${node.height}"
            fill="${node.color}"
            stroke="${colors.gridColor}"
            stroke-width="1"
            class="node-rect"
            data-label="${node.label}"
            data-value="${node.value}"
            style="cursor: pointer; opacity: 0"
            onmouseover="sankeyNodeHover(event, ${index})"
            onmouseout="sankeyNodeUnhover(event, ${index})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${index * 0.05 + 0.3}s"
              dur="0.3s"
              fill="freeze"
            />
          </rect>
          
          <!-- Node label -->
          <text
            x="${node.x + node.width + 10}"
            y="${node.y + node.height / 2}"
            dominant-baseline="middle"
            class="node-label"
            style="opacity: 0"
          >
            ${node.label}
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${index * 0.05 + 0.5}s"
              dur="0.3s"
              fill="freeze"
            />
          </text>
        </g>
        `).join('')}
      </g>
    </g>
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateSankeyChartScript(id, nodes, links)}`;
  }

  /**
   * Generate Gauge Chart
   */
  private generateGaugeChart(
    id: string,
    data: GaugeChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 400;
    const height = options.height || 300;
    const centerX = width / 2;
    const centerY = height * 0.75;
    const radius = Math.min(width / 2, height * 0.75) - 40;
    
    // Calculate angles
    const startAngle = -Math.PI * 0.75;
    const endAngle = Math.PI * 0.75;
    const angleRange = endAngle - startAngle;
    const valueRatio = (data.value - data.min) / (data.max - data.min);
    const valueAngle = startAngle + angleRange * valueRatio;
    
    // Calculate color zones
    const zones = data.zones || [
      { min: data.min, max: data.max * 0.3, color: colors.dataColors[2] || '#ef4444' },
      { min: data.max * 0.3, max: data.max * 0.7, color: colors.dataColors[1] || '#f59e0b' },
      { min: data.max * 0.7, max: data.max, color: colors.dataColors[0] || '#10b981' }
    ];
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      <!-- Gauge gradients -->
      ${zones.map((zone, index) => `
      <linearGradient id="${id}-zone-gradient-${index}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${zone.color};stop-opacity:0.8" />
        <stop offset="100%" style="stop-color:${zone.color};stop-opacity:0.6" />
      </linearGradient>
      `).join('')}
      
      <!-- Needle shadow -->
      <filter id="${id}-needle-shadow">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
        <feOffset dx="2" dy="2" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.3"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${centerX}" y="30" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Gauge -->
    <g transform="translate(${centerX}, ${centerY})">
      <!-- Outer ring -->
      <circle
        cx="0"
        cy="0"
        r="${radius + 10}"
        fill="none"
        stroke="${colors.gridColor}"
        stroke-width="2"
        opacity="0.3"
      />
      
      <!-- Color zones -->
      ${zones.map((zone, index) => {
        const zoneStartRatio = (zone.min - data.min) / (data.max - data.min);
        const zoneEndRatio = (zone.max - data.min) / (data.max - data.min);
        const zoneStartAngle = startAngle + angleRange * zoneStartRatio;
        const zoneEndAngle = startAngle + angleRange * zoneEndRatio;
        
        const path = this.createArcPath(0, 0, radius - 20, radius, zoneStartAngle, zoneEndAngle);
        
        return `
        <path
          d="${path}"
          fill="url(#${id}-zone-gradient-${index})"
          stroke="none"
          class="gauge-zone"
          style="opacity: 0"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            begin="${index * 0.1}s"
            dur="0.3s"
            fill="freeze"
          />
        </path>`;
      }).join('')}
      
      <!-- Scale ticks -->
      ${this.generateGaugeTicks(data.min, data.max, 10).map((tick: any) => {
        const tickRatio = (tick.value - data.min) / (data.max - data.min);
        const tickAngle = startAngle + angleRange * tickRatio;
        const isMajor = tick.major;
        const tickLength = isMajor ? 15 : 8;
        
        const x1 = Math.cos(tickAngle) * (radius - tickLength);
        const y1 = Math.sin(tickAngle) * (radius - tickLength);
        const x2 = Math.cos(tickAngle) * radius;
        const y2 = Math.sin(tickAngle) * radius;
        
        const labelX = Math.cos(tickAngle) * (radius - tickLength - 15);
        const labelY = Math.sin(tickAngle) * (radius - tickLength - 15);
        
        return `
        <g class="gauge-tick">
          <line
            x1="${x1}"
            y1="${y1}"
            x2="${x2}"
            y2="${y2}"
            stroke="${colors.gridColor}"
            stroke-width="${isMajor ? 2 : 1}"
            opacity="${isMajor ? 0.8 : 0.4}"
          />
          ${isMajor ? `
          <text
            x="${labelX}"
            y="${labelY}"
            text-anchor="middle"
            dominant-baseline="middle"
            class="gauge-label"
            font-size="12"
          >
            ${this.formatAxisValue(tick.value)}
          </text>
          ` : ''}
        </g>`;
      }).join('')}
      
      <!-- Center circle -->
      <circle
        cx="0"
        cy="0"
        r="${radius * 0.15}"
        fill="${colors.backgroundColor}"
        stroke="${colors.gridColor}"
        stroke-width="2"
      />
      
      <!-- Needle -->
      <g class="gauge-needle" style="transform-origin: center">
        <path
          d="M -5,0 L -1,-${radius * 0.9} L 0,-${radius * 0.95} L 1,-${radius * 0.9} L 5,0 L 3,20 L -3,20 Z"
          fill="${colors.primaryColor}"
          stroke="${colors.primaryDark}"
          stroke-width="1"
          filter="url(#${id}-needle-shadow)"
          transform="rotate(${(startAngle + Math.PI / 2) * 180 / Math.PI})"
          style="transition: transform 1s ease-out"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="${(startAngle + Math.PI / 2) * 180 / Math.PI}"
            to="${(valueAngle + Math.PI / 2) * 180 / Math.PI}"
            dur="1s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.4 0 0.2 1"
          />
        </path>
        
        <!-- Center cap -->
        <circle
          cx="0"
          cy="0"
          r="${radius * 0.1}"
          fill="${colors.primaryColor}"
          stroke="${colors.primaryDark}"
          stroke-width="2"
        />
      </g>
      
      <!-- Value display -->
      <g class="gauge-value">
        <rect
          x="-60"
          y="${radius * 0.3}"
          width="120"
          height="40"
          rx="5"
          fill="${colors.backgroundColor}"
          stroke="${colors.gridColor}"
          stroke-width="1"
        />
        <text
          x="0"
          y="${radius * 0.3 + 25}"
          text-anchor="middle"
          class="gauge-value-text"
          font-size="24"
          font-weight="bold"
        >
          <tspan>0</tspan>
          <animate
            attributeName="textContent"
            from="0"
            to="${data.value}"
            dur="1s"
            fill="freeze"
            calcMode="discrete"
            keyTimes="${this.generateKeyTimes(100)}"
            values="${this.generateAnimationValues(0, data.value, 100)}"
          />
        </text>
        ${data.label ? `
        <text
          x="0"
          y="${radius * 0.3 + 45}"
          text-anchor="middle"
          class="gauge-label-text"
          font-size="14"
          fill="${colors.textColor}"
          opacity="0.7"
        >
          ${data.label}
        </text>
        ` : ''}
      </g>
    </g>
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateGaugeChartScript(id, data)}`;
  }

  /**
   * Generate Waterfall Chart
   */
  private generateWaterfallChart(
    id: string,
    data: WaterfallChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 600;
    const height = options.height || 400;
    const margin = { top: 40, right: 40, bottom: 80, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate cumulative values
    const cumulativeData = this.calculateWaterfallData(data.data);
    const barWidth = chartWidth / cumulativeData.length * 0.7;
    const barSpacing = chartWidth / cumulativeData.length * 0.3;
    
    // Find min and max for scaling
    const allValues = cumulativeData.flatMap(d => [d.start, d.end]);
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(...allValues);
    const valueRange = maxValue - minValue;
    const yScale = chartHeight / (valueRange * 1.1);
    const yZero = chartHeight - (Math.abs(minValue) * yScale);
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Grid -->
      ${this.generateGridLines(chartWidth, chartHeight, 5, 'horizontal')}
      
      <!-- Zero line -->
      <line
        x1="0"
        y1="${yZero}"
        x2="${chartWidth}"
        y2="${yZero}"
        stroke="${colors.gridColor}"
        stroke-width="2"
        opacity="0.5"
      />
      
      <!-- X Axis -->
      <g class="x-axis" transform="translate(0, ${chartHeight})">
        <line x1="0" y1="0" x2="${chartWidth}" y2="0" stroke="${colors.gridColor}" />
        ${cumulativeData.map((item, index) => `
        <g transform="translate(${index * (barWidth + barSpacing) + barWidth / 2}, 0)">
          <line y1="0" y2="6" stroke="${colors.gridColor}" />
          <text
            y="20"
            text-anchor="middle"
            class="axis-label"
            transform="rotate(45, 0, 20)"
          >
            ${this.truncateLabel(item.label, 12)}
          </text>
        </g>
        `).join('')}
      </g>
      
      <!-- Y Axis -->
      <g class="y-axis">
        <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="${colors.gridColor}" />
        ${this.generateYAxisLabels(minValue, maxValue, 5).map((value: any) => `
        <g transform="translate(0, ${chartHeight - ((value - minValue) * yScale)})">
          <line x1="-6" x2="0" stroke="${colors.gridColor}" />
          <text x="-10" y="5" text-anchor="end" class="axis-label">
            ${this.formatAxisValue(value)}
          </text>
        </g>
        `).join('')}
      </g>
      
      <!-- Waterfall bars and connectors -->
      ${cumulativeData.map((item, index) => {
        const x = index * (barWidth + barSpacing);
        const barHeight = Math.abs(item.value) * yScale;
        const y = item.value >= 0 
          ? chartHeight - ((item.end - minValue) * yScale)
          : chartHeight - ((item.start - minValue) * yScale);
        
        // Determine bar color
        let barColor;
        if (item.type === 'total') {
          barColor = colors.dataColors[3] || '#6366f1';
        } else if (item.value >= 0) {
          barColor = colors.dataColors[0] || '#10b981';
        } else {
          barColor = colors.dataColors[2] || '#ef4444';
        }
        
        return `
        <g class="waterfall-item" data-index="${index}">
          <!-- Connector line -->
          ${index > 0 ? `
          <line
            x1="${(index - 1) * (barWidth + barSpacing) + barWidth}"
            y1="${chartHeight - ((cumulativeData[index - 1].end - minValue) * yScale)}"
            x2="${x}"
            y2="${chartHeight - ((item.start - minValue) * yScale)}"
            stroke="${colors.gridColor}"
            stroke-width="1"
            stroke-dasharray="3,3"
            class="connector-line"
            style="opacity: 0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${index * 0.1 + 0.3}s"
              dur="0.2s"
              fill="freeze"
            />
          </line>
          ` : ''}
          
          <!-- Bar -->
          <rect
            x="${x}"
            y="${y}"
            width="${barWidth}"
            height="${barHeight}"
            fill="${barColor}"
            stroke="white"
            stroke-width="1"
            class="waterfall-bar"
            data-label="${item.label}"
            data-value="${item.value}"
            data-start="${item.start}"
            data-end="${item.end}"
            style="cursor: pointer; opacity: 0"
            onmouseover="waterfallBarHover(event, ${index})"
            onmouseout="waterfallBarUnhover(event, ${index})"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${index * 0.1}s"
              dur="0.3s"
              fill="freeze"
            />
            <animate
              attributeName="height"
              from="0"
              to="${barHeight}"
              begin="${index * 0.1}s"
              dur="0.3s"
              fill="freeze"
            />
            ${item.value >= 0 ? '' : `
            <animate
              attributeName="y"
              from="${y + barHeight}"
              to="${y}"
              begin="${index * 0.1}s"
              dur="0.3s"
              fill="freeze"
            />
            `}
          </rect>
          
          <!-- Value label -->
          <text
            x="${x + barWidth / 2}"
            y="${y - 5}"
            text-anchor="middle"
            class="value-label"
            style="opacity: 0"
          >
            ${item.value >= 0 ? '+' : ''}${this.formatValue(item.value)}
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${index * 0.1 + 0.3}s"
              dur="0.2s"
              fill="freeze"
            />
          </text>
          
          <!-- End value label (for totals) -->
          ${item.type === 'total' ? `
          <text
            x="${x + barWidth / 2}"
            y="${chartHeight - ((item.end - minValue) * yScale) + 20}"
            text-anchor="middle"
            class="total-label"
            font-weight="bold"
            style="opacity: 0"
          >
            ${this.formatValue(item.end)}
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin="${index * 0.1 + 0.5}s"
              dur="0.2s"
              fill="freeze"
            />
          </text>
          ` : ''}
        </g>`;
      }).join('')}
      
      <!-- Axis Labels -->
      ${options.yAxisLabel ? `
      <text
        x="${-chartHeight / 2}"
        y="-40"
        text-anchor="middle"
        transform="rotate(-90)"
        class="axis-title"
      >
        ${options.yAxisLabel}
      </text>
      ` : ''}
    </g>
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateWaterfallChartScript(id, cumulativeData)}`;
  }

  /**
   * Generate Funnel Chart
   */
  private generateFunnelChart(
    id: string,
    data: FunnelChart,
    options: ChartOptions,
    colors: ChartColors
  ): string {
    const width = options.width || 500;
    const height = options.height || 400;
    const margin = { top: 40, right: 50, bottom: 40, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Calculate funnel dimensions
    const maxValue = Math.max(...data.values);
    const segmentHeight = chartHeight / data.values.length;
    const topWidth = chartWidth * 0.9;
    const bottomWidth = chartWidth * 0.3;
    
    const segments = data.values.map((value, index) => {
      const ratio = value / maxValue;
      const prevRatio = index > 0 ? (data.values[index - 1] || 0) / maxValue : 1;
      
      const y = index * segmentHeight;
      const topSegmentWidth = topWidth - (topWidth - bottomWidth) * (index / data.values.length);
      const bottomSegmentWidth = topWidth - (topWidth - bottomWidth) * ((index + 1) / data.values.length);
      
      const actualTopWidth = topSegmentWidth * prevRatio;
      const actualBottomWidth = bottomSegmentWidth * ratio;
      
      const topOffset = (chartWidth - actualTopWidth) / 2;
      const bottomOffset = (chartWidth - actualBottomWidth) / 2;
      
      return {
        label: data.labels[index],
        value,
        ratio,
        percentage: (value / (data.values[0] || 1)) * 100,
        path: `
          M ${topOffset},${y}
          L ${topOffset + actualTopWidth},${y}
          L ${bottomOffset + actualBottomWidth},${y + segmentHeight}
          L ${bottomOffset},${y + segmentHeight}
          Z
        `,
        centerX: chartWidth / 2,
        centerY: y + segmentHeight / 2,
        color: colors.dataColors[index % colors.dataColors.length]
      };
    });
    
    return `
<div class="chart-container" id="${id}-container">
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="${id}">
    <defs>
      ${this.generateChartFilters()}
      <!-- Funnel gradients -->
      ${segments.map((segment, index) => `
      <linearGradient id="${id}-funnel-gradient-${index}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${segment.color};stop-opacity:0.9" />
        <stop offset="100%" style="stop-color:${segment.color};stop-opacity:0.7" />
      </linearGradient>
      `).join('')}
    </defs>
    
    <!-- Title -->
    ${options.title ? `
    <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">
      ${options.title}
    </text>
    ` : ''}
    
    <!-- Chart Area -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <!-- Funnel segments -->
      ${segments.map((segment, index) => `
      <g class="funnel-segment" data-index="${index}">
        <path
          d="${segment.path}"
          fill="url(#${id}-funnel-gradient-${index})"
          stroke="white"
          stroke-width="2"
          class="segment-path"
          data-label="${segment.label}"
          data-value="${segment.value}"
          style="cursor: pointer; opacity: 0"
          onmouseover="funnelSegmentHover(event, ${index})"
          onmouseout="funnelSegmentUnhover(event, ${index})"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            begin="${index * 0.1}s"
            dur="0.3s"
            fill="freeze"
          />
        </path>
        
        <!-- Segment label and value -->
        <text
          x="${segment.centerX}"
          y="${segment.centerY - 10}"
          text-anchor="middle"
          class="segment-label"
          style="pointer-events: none; opacity: 0"
        >
          ${segment.label}
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            begin="${index * 0.1 + 0.3}s"
            dur="0.2s"
            fill="freeze"
          />
        </text>
        
        <text
          x="${segment.centerX}"
          y="${segment.centerY + 10}"
          text-anchor="middle"
          class="segment-value"
          style="pointer-events: none; opacity: 0"
        >
          ${this.formatValue(segment.value)} (${segment.percentage.toFixed(1)}%)
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            begin="${index * 0.1 + 0.3}s"
            dur="0.2s"
            fill="freeze"
          />
        </text>
        
        <!-- Conversion rate (between segments) -->
        ${index < segments.length - 1 ? `
        <text
          x="${chartWidth + 20}"
          y="${segment.centerY + segmentHeight / 2}"
          text-anchor="start"
          class="conversion-rate"
          font-size="12"
          fill="${colors.textColor}"
          opacity="0.7"
          style="opacity: 0"
        >
          ${((data.values[index + 1] || 0) / segment.value * 100).toFixed(1)}%
          <animate
            attributeName="opacity"
            from="0"
            to="0.7"
            begin="${index * 0.1 + 0.5}s"
            dur="0.2s"
            fill="freeze"
          />
        </text>
        ` : ''}
      </g>
      `).join('')}
      
      <!-- Drop-off indicators -->
      ${segments.slice(0, -1).map((segment, index) => {
        const dropOff = segment.value - (data.values[index + 1] || 0);
        const dropOffPercentage = (dropOff / segment.value) * 100;
        
        return `
        <g class="drop-off" style="opacity: 0">
          <text
            x="-10"
            y="${segment.centerY + segmentHeight / 2}"
            text-anchor="end"
            class="drop-off-value"
            font-size="12"
            fill="${colors.dataColors[2] || '#ef4444'}"
          >
            -${this.formatValue(dropOff)}
          </text>
          <text
            x="-10"
            y="${segment.centerY + segmentHeight / 2 + 15}"
            text-anchor="end"
            class="drop-off-percentage"
            font-size="10"
            fill="${colors.dataColors[2] || '#ef4444'}"
            opacity="0.7"
          >
            (-${dropOffPercentage.toFixed(1)}%)
          </text>
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            begin="${index * 0.1 + 0.7}s"
            dur="0.2s"
            fill="freeze"
          />
        </g>`;
      }).join('')}
    </g>
  </svg>
  
  <!-- Tooltip -->
  <div class="chart-tooltip" id="${id}-tooltip" style="display: none;">
    <div class="tooltip-content"></div>
  </div>
</div>

${this.generateChartStyles(id, colors)}
${this.generateFunnelChartScript(id, segments)}`;
  }

  // ========== Helper Methods ==========

  /**
   * Generate color palette
   */
  private generateColorPalette(_data: ChartData, theme: ReportTheme): ChartColors {
    return {
      primaryColor: theme.primaryColor,
      primaryDark: this.darkenColor(theme.primaryColor, 20),
      backgroundColor: '#ffffff',
      gridColor: '#e5e7eb',
      textColor: '#1f2937',
      dataColors: this.defaultColors,
      heatmapColors: ['#f3f4f6', '#fbbf24', '#dc2626']
    };
  }

  /**
   * Create arc path
   */
  private createArcPath(
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number
  ): string {
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    
    const x1 = cx + Math.cos(startAngle) * outerRadius;
    const y1 = cy + Math.sin(startAngle) * outerRadius;
    const x2 = cx + Math.cos(endAngle) * outerRadius;
    const y2 = cy + Math.sin(endAngle) * outerRadius;
    
    const x3 = cx + Math.cos(endAngle) * innerRadius;
    const y3 = cy + Math.sin(endAngle) * innerRadius;
    const x4 = cx + Math.cos(startAngle) * innerRadius;
    const y4 = cy + Math.sin(startAngle) * innerRadius;
    
    if (innerRadius > 0) {
      return `
        M ${x1} ${y1}
        A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
        L ${x3} ${y3}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
        Z
      `;
    } else {
      return `
        M ${cx} ${cy}
        L ${x1} ${y1}
        A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
        Z
      `;
    }
  }

  /**
   * Create segment label
   */
  private createSegmentLabel(segment: any, innerRadius: number, outerRadius: number): string {
    const midAngle = (segment.startAngle + segment.endAngle) / 2;
    const labelRadius = (innerRadius + outerRadius) / 2;
    const x = Math.cos(midAngle) * labelRadius;
    const y = Math.sin(midAngle) * labelRadius;
    
    return `
    <text
      x="${x}"
      y="${y}"
      text-anchor="middle"
      dominant-baseline="middle"
      class="segment-label"
      style="pointer-events: none"
    >
      <tspan x="${x}" dy="0">${segment.label}</tspan>
      <tspan x="${x}" dy="1.2em" font-size="0.9em">${((segment.percentage || 0) * 100).toFixed(1)}%</tspan>
    </text>`;
  }

  /**
   * Create line path
   */
  private createLinePath(points: Point[], smooth: boolean = true): string {
    if (points.length === 0) return '';
    if (points.length === 1) {
      const firstPoint = points[0];
      return firstPoint ? `M ${firstPoint.x} ${firstPoint.y}` : '';
    }
    
    if (!smooth) {
      return points.map((p, i) => 
        i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
      ).join(' ');
    }
    
    // Create smooth curve using cubic bezier
    const firstPoint = points[0];
    if (!firstPoint) return '';
    
    let path = `M ${firstPoint.x} ${firstPoint.y}`;
    
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      
      if (!p0 || !p1 || !p2) continue;
      
      const cp1x = p0.x + (p1.x - p0.x) * 0.5;
      const cp1y = p0.y + (p1.y - p0.y) * 0.5;
      const cp2x = p1.x - (p2.x - p0.x) * 0.125;
      const cp2y = p1.y - (p2.y - p0.y) * 0.125;
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    
    // Last point
    const lastPoint = points[points.length - 1];
    if (lastPoint) {
      path += ` L ${lastPoint.x} ${lastPoint.y}`;
    }
    
    return path;
  }

  /**
   * Get path length (approximation for animation)
   */
  private getPathLength(path: string): number {
    // Rough approximation based on path commands
    const commands = path.match(/[A-Z][^A-Z]*/g) || [];
    return commands.length * 100;
  }

  /**
   * Generate grid lines
   */
  private generateGridLines(
    width: number,
    height: number,
    count: number,
    direction: 'horizontal' | 'vertical' | 'both'
  ): string {
    let lines = '';
    
    if (direction === 'horizontal' || direction === 'both') {
      for (let i = 0; i <= count; i++) {
        const y = (height / count) * i;
        lines += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e5e7eb" stroke-width="1" opacity="0.3" />`;
      }
    }
    
    if (direction === 'vertical' || direction === 'both') {
      for (let i = 0; i <= count; i++) {
        const x = (width / count) * i;
        lines += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#e5e7eb" stroke-width="1" opacity="0.3" />`;
      }
    }
    
    return lines;
  }

  /**
   * Generate Y axis labels
   */
  private generateYAxisLabels(min: number, max: number, count: number): number[] {
    const range = max - min;
    const step = range / count;
    const labels: number[] = [];
    
    for (let i = 0; i <= count; i++) {
      labels.push(min + step * i);
    }
    
    return labels;
  }

  /**
   * Generate axis values
   */
  private generateAxisValues(min: number, max: number, count: number): number[] {
    const range = max - min;
    const step = this.getNiceStep(range / count);
    const start = Math.floor(min / step) * step;
    const values: number[] = [];
    
    for (let value = start; value <= max; value += step) {
      values.push(value);
    }
    
    return values;
  }

  /**
   * Get nice step value
   */
  private getNiceStep(roughStep: number): number {
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    
    let niceStep;
    if (normalized <= 1) niceStep = 1;
    else if (normalized <= 2) niceStep = 2;
    else if (normalized <= 5) niceStep = 5;
    else niceStep = 10;
    
    return niceStep * magnitude;
  }

  /**
   * Format axis value
   */
  private formatAxisValue(value: number): string {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    } else if (Number.isInteger(value)) {
      return value.toString();
    } else {
      return value.toFixed(1);
    }
  }

  /**
   * Format value
   */
  private formatValue(value: number): string {
    return value.toLocaleString();
  }

  /**
   * Format cell value
   */
  private formatCellValue(value: number): string {
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toFixed(0);
  }

  /**
   * Truncate label
   */
  private truncateLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
  }

  /**
   * Generate legend
   */
  private generateLegend(
    items: Array<{ label: string; color: string }>,
    width: number,
    height: number,
    position: 'top' | 'right' | 'bottom' | 'left'
  ): string {
    let x, y, orientation;
    
    switch (position) {
      case 'top':
        x = width / 2;
        y = 50;
        orientation = 'horizontal';
        break;
      case 'right':
        x = width - 150;
        y = height / 2 - (items.length * 20) / 2;
        orientation = 'vertical';
        break;
      case 'bottom':
        x = width / 2;
        y = height - 30;
        orientation = 'horizontal';
        break;
      case 'left':
        x = 20;
        y = height / 2 - (items.length * 20) / 2;
        orientation = 'vertical';
        break;
    }
    
    if (orientation === 'horizontal') {
      const totalWidth = items.length * 120;
      const startX = x - totalWidth / 2;
      
      return `
      <g class="legend" transform="translate(${startX}, ${y})">
        ${items.map((item, index) => `
        <g transform="translate(${index * 120}, 0)">
          <rect x="0" y="-6" width="12" height="12" fill="${item.color}" />
          <text x="16" y="4" class="legend-label">${item.label}</text>
        </g>
        `).join('')}
      </g>`;
    } else {
      return `
      <g class="legend" transform="translate(${x}, ${y})">
        ${items.map((item, index) => `
        <g transform="translate(0, ${index * 20})">
          <rect x="0" y="-6" width="12" height="12" fill="${item.color}" />
          <text x="16" y="4" class="legend-label">${item.label}</text>
        </g>
        `).join('')}
      </g>`;
    }
  }

  /**
   * Darken color
   */
  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255))
      .toString(16).slice(1);
  }

  /**
   * Get heatmap color
   */
  private getHeatmapColor(value: number, colors: string[]): string {
    if (value <= 0) return colors[0] || '#93186C';
    if (value >= 1) return colors[colors.length - 1] || '#93186C';
    
    const index = Math.floor(value * (colors.length - 1));
    const remainder = value * (colors.length - 1) - index;
    
    const color1 = colors[index] || '#93186C';
    const color2 = colors[index + 1] || colors[index] || '#93186C';
    
    return this.interpolateColor(color1, color2, remainder);
  }

  /**
   * Interpolate between two colors
   */
  private interpolateColor(color1: string, color2: string, factor: number): string {
    const c1 = parseInt(color1.replace('#', ''), 16);
    const c2 = parseInt(color2.replace('#', ''), 16);
    
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  /**
   * Calculate treemap layout
   */
  private calculateTreemapLayout(
    data: Array<{ label: string; value: number }>,
    width: number,
    height: number
  ): Array<{ label: string; value: number; x: number; y: number; width: number; height: number }> {
    // Defensive check for data
    if (!data || !Array.isArray(data) || data.length === 0) {
      return [];
    }
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const sorted = [...data].sort((a, b) => b.value - a.value);
    
    const rectangles: any[] = [];
    let x = 0;
    let y = 0;
    let remainingWidth = width;
    let remainingHeight = height;
    let remainingValue = total;
    
    // Simple slice and dice algorithm
    sorted.forEach((item: any) => {
      const ratio = item.value / remainingValue;
      
      if (remainingWidth > remainingHeight) {
        // Vertical slice
        const rectWidth = remainingWidth * ratio;
        rectangles.push({
          ...item,
          x,
          y,
          width: rectWidth,
          height: remainingHeight
        });
        x += rectWidth;
        remainingWidth -= rectWidth;
      } else {
        // Horizontal slice
        const rectHeight = remainingHeight * ratio;
        rectangles.push({
          ...item,
          x,
          y,
          width: remainingWidth,
          height: rectHeight
        });
        y += rectHeight;
        remainingHeight -= rectHeight;
      }
      
      remainingValue -= item.value;
    });
    
    return rectangles;
  }

  /**
   * Calculate sankey nodes
   */
  private calculateSankeyNodes(
    nodes: Array<{ id: string; label: string }>,
    links: Array<{ source: string; target: string; value: number }>,
    width: number,
    height: number
  ): any[] {
    // Group nodes by level (simple left-to-right layout)
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, level: 0, value: 0 }]));
    
    // Calculate node values
    links.forEach(link => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (source) source.value += link.value;
      if (target) target.value += link.value;
    });
    
    // Assign levels (simple approach)
    const visited = new Set<string>();
    const assignLevel = (nodeId: string, level: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = nodeMap.get(nodeId);
      if (node) {
        node.level = Math.max(node.level, level);
        
        links
          .filter(l => l.source === nodeId)
          .forEach(l => assignLevel(l.target, level + 1));
      }
    };
    
    // Find root nodes (no incoming links)
    const rootNodes = nodes.filter(n => 
      !links.some(l => l.target === n.id)
    );
    rootNodes.forEach(n => assignLevel(n.id, 0));
    
    // Calculate positions
    const levelGroups = new Map<number, any[]>();
    nodeMap.forEach(node => {
      if (!levelGroups.has(node.level)) {
        levelGroups.set(node.level, []);
      }
      levelGroups.get(node.level)!.push(node);
    });
    
    const maxLevel = Math.max(...Array.from(levelGroups.keys()));
    const nodeWidth = 20;
    const nodePadding = 10;
    const levelWidth = width / (maxLevel + 1);
    
    const positionedNodes: any[] = [];
    
    levelGroups.forEach((levelNodes: any, level: number) => {
      // Defensive check for levelNodes
      if (!levelNodes || !Array.isArray(levelNodes) || levelNodes.length === 0) {
        return;
      }
      
      const totalHeight = levelNodes.reduce((sum: number, n: any) => sum + n.value, 0);
      const scale = (height - nodePadding * (levelNodes.length - 1)) / totalHeight;
      
      let currentY = 0;
      levelNodes.forEach((node: any) => {
        const nodeHeight = node.value * scale;
        
        positionedNodes.push({
          ...node,
          x: level * levelWidth,
          y: currentY,
          width: nodeWidth,
          height: nodeHeight,
          color: this.defaultColors[level % this.defaultColors.length]
        });
        
        currentY += nodeHeight + nodePadding;
      });
    });
    
    return positionedNodes;
  }

  /**
   * Calculate sankey links
   */
  private calculateSankeyLinks(nodes: any[], links: any[]): any[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    return links.map(link => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      
      return {
        ...link,
        source,
        target
      };
    });
  }

  /**
   * Create sankey link path
   */
  private createSankeyLinkPath(link: any): string {
    const x0 = link.source.x + link.source.width;
    const x1 = link.target.x;
    const y0 = link.source.y + link.source.height / 2;
    const y1 = link.target.y + link.target.height / 2;
    
    const xi = (x0 + x1) / 2;
    
    return `
      M ${x0},${y0}
      C ${xi},${y0} ${xi},${y1} ${x1},${y1}
    `;
  }

  /**
   * Generate gauge ticks
   */
  private generateGaugeTicks(
    min: number,
    max: number,
    _count: number
  ): Array<{ value: number; major: boolean }> {
    const ticks: Array<{ value: number; major: boolean }> = [];
    const majorStep = (max - min) / 5;
    const minorStep = majorStep / 2;
    
    for (let value = min; value <= max; value += minorStep) {
      ticks.push({
        value,
        major: Math.abs(value % majorStep) < 0.001
      });
    }
    
    return ticks;
  }

  /**
   * Calculate waterfall data
   */
  private calculateWaterfallData(data: any[]): any[] {
    const result: any[] = [];
    let cumulativeValue = 0;
    
    data.forEach((item: any) => {
      const start = cumulativeValue;
      const end = item.type === 'total' ? item.value : start + item.value;
      
      result.push({
        ...item,
        start,
        end,
        value: item.type === 'total' ? item.value : item.value
      });
      
      if (item.type !== 'total') {
        cumulativeValue = end;
      }
    });
    
    return result;
  }

  /**
   * Generate key times for animation
   */
  private generateKeyTimes(steps: number): string {
    return Array.from({ length: steps }, (_, i) => (i / (steps - 1)).toFixed(2)).join(';');
  }

  /**
   * Generate animation values
   */
  private generateAnimationValues(start: number, end: number, steps: number): string {
    return Array.from({ length: steps }, (_, i) => 
      Math.round(start + (end - start) * (i / (steps - 1)))
    ).join(';');
  }

  /**
   * Generate chart filters
   */
  private generateChartFilters(): string {
    return `
    <filter id="drop-shadow">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="2" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.2"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    
    <filter id="hover-glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>`;
  }

  /**
   * Generate chart gradients
   */
  private generateChartGradients(colors: ChartColors): string {
    return colors.dataColors.map((color, index) => `
    <linearGradient id="gradient-${index}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:0.8" />
      <stop offset="100%" style="stop-color:${color};stop-opacity:0.6" />
    </linearGradient>
    `).join('');
  }

  /**
   * Generate chart styles
   */
  private generateChartStyles(id: string, colors: ChartColors): string {
    return `
<style>
#${id}-container {
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#${id} .chart-title {
  font-size: 18px;
  font-weight: 600;
  fill: ${colors.textColor};
}

#${id} .axis-label {
  font-size: 12px;
  fill: ${colors.textColor};
  opacity: 0.7;
}

#${id} .axis-title {
  font-size: 14px;
  font-weight: 500;
  fill: ${colors.textColor};
}

#${id} .value-label {
  font-size: 11px;
  fill: ${colors.textColor};
  font-weight: 500;
}

#${id} .legend-label {
  font-size: 12px;
  fill: ${colors.textColor};
}

#${id} .segment-label {
  font-size: 13px;
  fill: white;
  font-weight: 500;
}

#${id} .center-value {
  font-size: 24px;
  font-weight: bold;
  fill: ${colors.textColor};
}

#${id} .center-label {
  font-size: 14px;
  fill: ${colors.textColor};
  opacity: 0.7;
}

#${id} .gauge-value-text {
  fill: ${colors.primaryColor};
}

#${id} .gauge-label {
  font-size: 12px;
  fill: ${colors.textColor};
  opacity: 0.6;
}

#${id} .treemap-label {
  font-size: 14px;
  font-weight: 500;
  fill: white;
}

#${id} .treemap-value {
  font-size: 12px;
  fill: white;
  opacity: 0.8;
}

#${id} .node-label {
  font-size: 12px;
  fill: ${colors.textColor};
}

#${id} .scale-label {
  font-size: 10px;
  fill: ${colors.textColor};
  opacity: 0.6;
}

#${id}-tooltip {
  position: absolute;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

#${id}-tooltip::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid rgba(0, 0, 0, 0.9);
}

.chart-container svg {
  overflow: visible;
}

/* Hover effects */
.segment-path:hover,
.bar:hover,
.line-point:hover,
.radar-point:hover,
.scatter-point:hover,
.bubble:hover,
.heatmap-cell:hover,
.treemap-cell:hover,
.sankey-link:hover,
.sankey-node rect:hover,
.waterfall-bar:hover,
.segment-path:hover {
  filter: brightness(1.1);
  transform: scale(1.02);
  transform-origin: center;
}
</style>`;
  }

  /**
   * Generate doughnut chart script
   */
  private generateDoughnutScript(id: string, segments: any[], total: number): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const segments = ${JSON.stringify(segments)};
  const total = ${total};
  
  window.chartHover_${id} = function(event, index) {
    const segment = segments[index];
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${segment.label}</strong></div>
      <div>Value: \${segment.value.toLocaleString()}</div>
      <div>Percentage: \${(segment.percentage * 100).toFixed(1)}%</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    // Highlight segment
    event.target.style.transform = 'scale(1.05)';
    event.target.style.filter = 'brightness(1.1)';
  };
  
  window.chartUnhover_${id} = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.transform = '';
    event.target.style.filter = '';
  };
  
  window.chartClick_${id} = function(event, index) {
    const segment = segments[index];
    console.log('Clicked:', segment);
    // Add custom click handler here
  };
})();
</script>`;
  }

  /**
   * Generate bar chart script
   */
  private generateBarChartScript(id: string, data: BarChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  window.barHover_${id} = function(event, datasetIndex, index) {
    const dataset = data.datasets[datasetIndex];
    const value = dataset.data[index];
    const label = data.labels[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${label}</strong></div>
      <div>\${dataset.label}: \${value.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.filter = 'brightness(1.2)';
  };
  
  window.barUnhover_${id} = function(event, datasetIndex, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.filter = '';
  };
})();
</script>`;
  }

  /**
   * Generate line chart script
   */
  private generateLineChartScript(id: string, data: LineChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  window.linePointHover = function(event, datasetIndex, index) {
    const dataset = data.datasets[datasetIndex];
    const value = dataset.data[index];
    const label = data.labels[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${label}</strong></div>
      <div>\${dataset.label}: \${value.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.setAttribute('r', '6');
  };
  
  window.linePointUnhover = function(event, datasetIndex, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.setAttribute('r', '4');
  };
})();
</script>`;
  }

  /**
   * Generate pie chart script
   */
  private generatePieChartScript(id: string, segments: any[], total: number): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const segments = ${JSON.stringify(segments)};
  const total = ${total};
  
  window.pieHover = function(event, index) {
    const segment = segments[index];
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${segment.label}</strong></div>
      <div>Value: \${segment.value.toLocaleString()}</div>
      <div>Percentage: \${(segment.percentage * 100).toFixed(1)}%</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.transform = 'scale(1.1)';
  };
  
  window.pieUnhover = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.transform = 'scale(1)';
  };
})();
</script>`;
  }

  /**
   * Generate radar chart script
   */
  private generateRadarChartScript(id: string, data: RadarChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  window.radarPointHover = function(event, datasetIndex, index) {
    const dataset = data.datasets[datasetIndex];
    const value = dataset.data[index];
    const label = data.labels[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${label}</strong></div>
      <div>\${dataset.label}: \${value.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.setAttribute('r', '6');
  };
  
  window.radarPointUnhover = function(event, datasetIndex, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.setAttribute('r', '4');
  };
})();
</script>`;
  }

  /**
   * Generate scatter chart script
   */
  private generateScatterChartScript(id: string, data: ScatterChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  window.scatterPointHover = function(event, datasetIndex, index) {
    const dataset = data.datasets[datasetIndex];
    const point = dataset.data[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${dataset.label}</strong></div>
      <div>X: \${point.x.toLocaleString()}</div>
      <div>Y: \${point.y.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.setAttribute('r', String(Number(event.target.getAttribute('r')) * 1.5));
    event.target.style.fillOpacity = '0.8';
  };
  
  window.scatterPointUnhover = function(event, datasetIndex, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    const dataset = data.datasets[datasetIndex];
    event.target.setAttribute('r', String(dataset.pointRadius || 5));
    event.target.style.fillOpacity = '0.6';
  };
})();
</script>`;
  }

  /**
   * Generate bubble chart script
   */
  private generateBubbleChartScript(id: string, data: BubbleChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  window.bubbleHover = function(event, datasetIndex, index) {
    const dataset = data.datasets[datasetIndex];
    const point = dataset.data[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${dataset.label}</strong></div>
      <div>X: \${point.x.toLocaleString()}</div>
      <div>Y: \${point.y.toLocaleString()}</div>
      <div>Size: \${point.r.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.strokeWidth = '3';
    event.target.style.fillOpacity = '0.9';
  };
  
  window.bubbleUnhover = function(event, datasetIndex, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.strokeWidth = '1';
    event.target.style.fillOpacity = '';
  };
})();
</script>`;
  }

  /**
   * Generate heatmap chart script
   */
  private generateHeatmapChartScript(id: string, data: HeatmapChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  window.heatmapCellHover = function(event, rowIndex, colIndex) {
    const value = data.data[rowIndex][colIndex];
    const xLabel = data.xLabels[colIndex];
    const yLabel = data.yLabels[rowIndex];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${yLabel} - \${xLabel}</strong></div>
      <div>Value: \${value.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.strokeWidth = '3';
    event.target.style.stroke = '#000';
  };
  
  window.heatmapCellUnhover = function(event, rowIndex, colIndex) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.strokeWidth = '1';
    event.target.style.stroke = 'white';
  };
})();
</script>`;
  }

  /**
   * Generate treemap chart script
   */
  private generateTreemapChartScript(id: string, data: TreemapChart, total: number): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  const total = ${total};
  
  window.treemapCellHover = function(event, index) {
    const item = data.data[index];
    const percentage = (item.value / total * 100).toFixed(1);
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${item.label}</strong></div>
      <div>Value: \${item.value.toLocaleString()}</div>
      <div>Percentage: \${percentage}%</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.opacity = '1';
    event.target.style.strokeWidth = '3';
  };
  
  window.treemapCellUnhover = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.opacity = '0.8';
    event.target.style.strokeWidth = '2';
  };
})();
</script>`;
  }

  /**
   * Generate sankey chart script
   */
  private generateSankeyChartScript(id: string, nodes: any[], links: any[]): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const nodes = ${JSON.stringify(nodes)};
  const links = ${JSON.stringify(links)};
  
  window.sankeyNodeHover = function(event, index) {
    const node = nodes[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${node.label}</strong></div>
      <div>Value: \${node.value.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    // Highlight node
    event.target.style.strokeWidth = '3';
    event.target.style.stroke = '#000';
    
    // Highlight connected links
    const nodeId = node.id;
    const svgLinks = document.querySelectorAll('#' + chartId + ' .sankey-link');
    svgLinks.forEach(link => {
      if (link.dataset.source === node.label || link.dataset.target === node.label) {
        link.style.opacity = '0.9';
        link.style.stroke = '#000';
        link.style.strokeWidth = '1';
      } else {
        link.style.opacity = '0.2';
      }
    });
  };
  
  window.sankeyNodeUnhover = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.strokeWidth = '1';
    event.target.style.stroke = '';
    
    // Reset links
    const svgLinks = document.querySelectorAll('#' + chartId + ' .sankey-link');
    svgLinks.forEach(link => {
      link.style.opacity = '0.6';
      link.style.stroke = 'none';
      link.style.strokeWidth = '0';
    });
  };
  
  window.sankeyLinkHover = function(event, index) {
    const link = links[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${link.source.label} → \${link.target.label}</strong></div>
      <div>Flow: \${link.value.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.opacity = '0.9';
    event.target.style.stroke = '#000';
    event.target.style.strokeWidth = '1';
  };
  
  window.sankeyLinkUnhover = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.opacity = '0.6';
    event.target.style.stroke = 'none';
    event.target.style.strokeWidth = '0';
  };
})();
</script>`;
  }

  /**
   * Generate gauge chart script
   */
  private generateGaugeChartScript(id: string, data: GaugeChart): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(data)};
  
  // Animate value counter
  const valueElement = document.querySelector('#' + chartId + ' .gauge-value-text tspan');
  if (valueElement) {
    let currentValue = 0;
    const targetValue = data.value;
    const increment = targetValue / 50;
    const timer = setInterval(() => {
      currentValue += increment;
      if (currentValue >= targetValue) {
        currentValue = targetValue;
        clearInterval(timer);
      }
      valueElement.textContent = Math.round(currentValue).toLocaleString();
    }, 20);
  }
  
  // Add click handler to needle
  const needle = document.querySelector('#' + chartId + ' .gauge-needle');
  if (needle) {
    needle.style.cursor = 'pointer';
    needle.addEventListener('click', () => {
      console.log('Gauge value:', data.value);
      // Add custom click handler here
    });
  }
  
  // Add hover effect
  const gaugeZones = document.querySelectorAll('#' + chartId + ' .gauge-zone');
  gaugeZones.forEach((zone, index) => {
    zone.addEventListener('mouseenter', () => {
      zone.style.opacity = '0.8';
    });
    zone.addEventListener('mouseleave', () => {
      zone.style.opacity = '1';
    });
  });
})();
</script>`;
  }

  /**
   * Generate waterfall chart script
   */
  private generateWaterfallChartScript(id: string, cumulativeData: any[]): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const data = ${JSON.stringify(cumulativeData)};
  
  window.waterfallBarHover = function(event, index) {
    const item = data[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    const changeType = item.value >= 0 ? 'Increase' : 'Decrease';
    const changeValue = Math.abs(item.value).toLocaleString();
    
    content.innerHTML = \`
      <div><strong>\${item.label}</strong></div>
      <div>\${changeType}: \${changeValue}</div>
      <div>Start: \${item.start.toLocaleString()}</div>
      <div>End: \${item.end.toLocaleString()}</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.filter = 'brightness(1.1)';
    event.target.style.strokeWidth = '2';
  };
  
  window.waterfallBarUnhover = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.filter = '';
    event.target.style.strokeWidth = '1';
  };
  
  // Animate connector lines
  const connectors = document.querySelectorAll('#' + chartId + ' .connector-line');
  connectors.forEach((connector, index) => {
    connector.style.strokeDasharray = '3,3';
    connector.style.animation = 'dash 20s linear infinite';
  });
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes dash {
      to {
        stroke-dashoffset: -100;
      }
    }
  \`;
  document.head.appendChild(style);
})();
</script>`;
  }

  /**
   * Generate funnel chart script
   */
  private generateFunnelChartScript(id: string, segments: any[]): string {
    return `
<script>
(function() {
  const chartId = '${id}';
  const segments = ${JSON.stringify(segments)};
  
  window.funnelSegmentHover = function(event, index) {
    const segment = segments[index];
    
    const tooltip = document.getElementById(chartId + '-tooltip');
    const content = tooltip.querySelector('.tooltip-content');
    
    content.innerHTML = \`
      <div><strong>\${segment.label}</strong></div>
      <div>Value: \${segment.value.toLocaleString()}</div>
      <div>Percentage: \${segment.percentage.toFixed(1)}%</div>
      <div>Conversion Rate: \${segment.ratio.toFixed(1)}%</div>
    \`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = (event.pageY - tooltip.offsetHeight - 10) + 'px';
    
    event.target.style.filter = 'brightness(1.1)';
    event.target.style.strokeWidth = '3';
  };
  
  window.funnelSegmentUnhover = function(event, index) {
    const tooltip = document.getElementById(chartId + '-tooltip');
    tooltip.style.display = 'none';
    
    event.target.style.filter = '';
    event.target.style.strokeWidth = '2';
  };
  
  // Animate funnel segments
  segments.forEach((segment, index) => {
    setTimeout(() => {
      const labels = document.querySelectorAll('#' + chartId + ' .segment-label, #' + chartId + ' .segment-value');
      labels.forEach(label => {
        if (label.style.opacity === '0') {
          label.style.transition = 'opacity 0.3s ease';
          label.style.opacity = '1';
        }
      });
    }, index * 100 + 300);
  });
  
  // Highlight conversion rates on hover
  const conversionRates = document.querySelectorAll('#' + chartId + ' .conversion-rate');
  conversionRates.forEach(rate => {
    rate.style.cursor = 'pointer';
    rate.addEventListener('mouseenter', () => {
      rate.style.fontWeight = 'bold';
      rate.style.fontSize = '14px';
    });
    rate.addEventListener('mouseleave', () => {
      rate.style.fontWeight = 'normal';
      rate.style.fontSize = '12px';
    });
  });
})();
</script>`;
  }
}
