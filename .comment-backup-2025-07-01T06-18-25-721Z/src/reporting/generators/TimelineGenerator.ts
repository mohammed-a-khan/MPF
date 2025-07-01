// src/reporting/generators/TimelineGenerator.ts

import { TimelineData, ReportTheme } from '../types/reporting.types';
import { DateUtils } from '../../core/utils/DateUtils';
import { Logger } from '../../core/utils/Logger';
import { FeatureReport, ScenarioReport, TestStatus } from '../types/reporting.types';

// Define missing types locally
interface ExecutionTimeline {
  events: TimelineEvent[];
  groups: TimelineGroup[];
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  milestones: Array<{ time: Date; label: string; type: string }>;
}

interface TimelineEvent {
  id: string;
  groupId: string;
  name: string;
  type: 'feature' | 'scenario' | 'step' | 'parallel';
  status: TestStatus;
  startTime: Date;
  endTime: Date;
  duration: number;
  details?: any;
}

interface TimelineGroup {
  id: string;
  name: string;
  type: 'feature' | 'worker' | 'browser';
  color: string;
  items: TimelineEvent[];
}

interface TimelineDataWithFeatures extends TimelineData {
  features?: FeatureReport[];
  parallelExecutions?: Array<{
    workerId: number;
    executions: Array<{
      scenario: ScenarioReport;
      startTime: Date;
      endTime: Date;
    }>;
  }>;
}

export class TimelineGenerator {
  private static readonly logger = Logger.getInstance(TimelineGenerator.name);
  private theme: ReportTheme;

  constructor(theme: ReportTheme) {
    this.theme = theme;
  }

  /**
   * Generate interactive execution timeline
   */
  async generateTimeline(data: TimelineDataWithFeatures): Promise<string> {
    TimelineGenerator.logger.info('Generating execution timeline');

    const timeline = this.buildTimelineData(data);
    const html = this.generateTimelineHTML(timeline);
    const css = this.generateTimelineCSS();
    const js = this.generateTimelineJS();

    return `
      <div id="timeline-container" class="cs-timeline-container">
        <style>${css}</style>
        ${html}
        <script>${js}</script>
      </div>
    `;
  }

  /**
   * Build timeline data structure
   */
  private buildTimelineData(data: TimelineDataWithFeatures): ExecutionTimeline {
    const events: TimelineEvent[] = [];
    const groups: TimelineGroup[] = [];
    
    // Calculate overall time bounds
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    const totalDuration = endTime.getTime() - startTime.getTime();

    // Process features
    data.features?.forEach((feature: FeatureReport, featureIndex: number) => {
      const featureGroup: TimelineGroup = {
        id: `feature-${featureIndex}`,
        name: feature.name || 'Unnamed Feature',
        type: 'feature',
        color: this.getFeatureColor(feature.status) || '#666',
        items: []
      };
      groups.push(featureGroup);

      // Add feature event
      const featureEvent: TimelineEvent = {
        id: `event-feature-${featureIndex}`,
        groupId: featureGroup.id,
        name: feature.name || 'Unnamed Feature',
        startTime: new Date(feature.startTime),
        endTime: new Date(feature.endTime),
        duration: feature.duration,
        status: feature.status,
        type: 'feature',
        details: {
          scenarios: feature.scenarios.length,
          passed: feature.scenarios.filter((s: any) => s.status === TestStatus.PASSED).length,
          failed: feature.scenarios.filter((s: any) => s.status === TestStatus.FAILED).length,
          skipped: feature.scenarios.filter((s: any) => s.status === TestStatus.SKIPPED).length
        }
      };
      events.push(featureEvent);
      featureGroup.items.push(featureEvent);

      // Process scenarios
      feature.scenarios.forEach((scenario: any, scenarioIndex: number) => {
        const scenarioEvent: TimelineEvent = {
          id: `event-scenario-${featureIndex}-${scenarioIndex}`,
          groupId: featureGroup.id,
          name: scenario.name || scenario.title || 'Unnamed Scenario',
          startTime: new Date(scenario.startTime),
          endTime: new Date(scenario.endTime),
          duration: scenario.duration,
          status: scenario.status,
          type: 'scenario',
          details: {
            steps: scenario.steps?.length || 0,
            retries: scenario.retryCount || 0,
            parent: `event-feature-${featureIndex}`
          }
        };
        events.push(scenarioEvent);
        featureGroup.items.push(scenarioEvent);

        // Process steps for failed scenarios
        if (scenario.status === TestStatus.FAILED && scenario.steps) {
          scenario.steps.forEach((step: any, stepIndex: number) => {
            const stepEvent: TimelineEvent = {
              id: `event-step-${featureIndex}-${scenarioIndex}-${stepIndex}`,
              groupId: featureGroup.id,
              name: step.text,
              startTime: new Date(step.startTime),
              endTime: new Date(step.endTime),
              duration: step.duration,
              status: step.status,
              type: 'step',
              details: {
                error: step.result?.error?.message || step.error?.message,
                parent: `event-scenario-${featureIndex}-${scenarioIndex}`
              }
            };
            events.push(stepEvent);
            featureGroup.items.push(stepEvent);
          });
        }
      });
    });

    // Add parallel execution lanes if applicable
    if (data.parallelExecutions) {
      data.parallelExecutions.forEach((worker: any, index: number) => {
        const workerGroup: TimelineGroup = {
          id: `worker-${index}`,
          name: `Worker ${worker.workerId}`,
          type: 'worker',
          color: this.theme.colors?.info || this.theme.infoColor,
          items: []
        };
        groups.push(workerGroup);

        worker.executions.forEach((execution: any, execIndex: number) => {
          const executionEvent: TimelineEvent = {
            id: `event-worker-${index}-${execIndex}`,
            groupId: workerGroup.id,
            name: execution.scenario.name,
            startTime: new Date(execution.startTime),
            endTime: new Date(execution.endTime),
            duration: execution.endTime.getTime() - execution.startTime.getTime(),
            status: execution.scenario.status,
            type: 'scenario',
            details: {
              scenarios: 1
            }
          };
          events.push(executionEvent);
          workerGroup.items.push(executionEvent);
        });
      });
    }

    return {
      startTime,
      endTime,
      totalDuration,
      events,
      groups,
      milestones: data.milestones?.map(m => ({
        time: new Date(m.timestamp),
        label: m.name,
        type: m.type
      })) || []
    };
  }

  /**
   * Generate timeline HTML
   */
  private generateTimelineHTML(timeline: ExecutionTimeline): string {
    return `
      <div class="timeline-header">
        <h2>Execution Timeline</h2>
        <div class="timeline-controls">
          <button class="timeline-btn" onclick="timelineZoomIn()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7 0h2v16H7zM0 7h16v2H0z"/>
            </svg>
            Zoom In
          </button>
          <button class="timeline-btn" onclick="timelineZoomOut()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 7h16v2H0z"/>
            </svg>
            Zoom Out
          </button>
          <button class="timeline-btn" onclick="timelineReset()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
              <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
            </svg>
            Reset View
          </button>
          <div class="timeline-filter">
            <label>
              <input type="checkbox" id="showSteps" onchange="toggleSteps()">
              Show Steps
            </label>
            <label>
              <input type="checkbox" id="showParallel" onchange="toggleParallel()" checked>
              Show Parallel Execution
            </label>
          </div>
        </div>
      </div>
      
      <div class="timeline-summary">
        <div class="summary-item">
          <span class="summary-label">Total Duration:</span>
          <span class="summary-value">${this.formatDuration(timeline.totalDuration)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Start Time:</span>
          <span class="summary-value">${DateUtils.formatDateTime(timeline.startTime)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">End Time:</span>
          <span class="summary-value">${DateUtils.formatDateTime(timeline.endTime)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Total Events:</span>
          <span class="summary-value">${timeline.events.length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Groups:</span>
          <span class="summary-value">${timeline.groups.length}</span>
        </div>
      </div>
      
      <div class="timeline-viewport" id="timelineViewport">
        <div class="timeline-canvas" id="timelineCanvas">
          <div class="timeline-scale" id="timelineScale"></div>
          <div class="timeline-groups" id="timelineGroups">
            ${timeline.groups.map(group => `
              <div class="timeline-group" data-group="${group.id}">
                <div class="group-header">
                  <span class="group-name">${group.name}</span>
                  <span class="group-type">${group.type}</span>
                </div>
                <div class="group-track" data-track="${group.id}"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="timeline-tooltip" id="timelineTooltip" style="display: none;">
        <div class="tooltip-header">
          <span class="tooltip-title"></span>
          <span class="tooltip-status"></span>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-time"></div>
          <div class="tooltip-duration"></div>
          <div class="tooltip-details"></div>
        </div>
      </div>
      
      <script>
        window.timelineData = ${JSON.stringify(timeline)};
      </script>
    `;
  }

  /**
   * Generate timeline CSS
   */
  private generateTimelineCSS(): string {
    return `
      .cs-timeline-container {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        padding: 24px;
        margin-bottom: 24px;
      }

      .timeline-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }

      .timeline-header h2 {
        color: ${this.theme.colors?.text || this.theme.textColor};
        font-size: 20px;
        font-weight: 600;
        margin: 0;
      }

      .timeline-controls {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .timeline-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: ${this.theme.colors?.backgroundDark || this.theme.backgroundColor};
        border: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
        border-radius: 6px;
        font-size: 13px;
        color: ${this.theme.colors?.text || this.theme.textColor};
        cursor: pointer;
        transition: all 0.2s;
      }

      .timeline-btn:hover {
        background: ${this.theme.colors?.primary || this.theme.primaryColor};
        color: white;
        transform: translateY(-1px);
      }

      .timeline-btn svg {
        width: 16px;
        height: 16px;
      }

      .timeline-filter {
        display: flex;
        gap: 16px;
        margin-left: 16px;
        padding-left: 16px;
        border-left: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
      }

      .timeline-filter label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: ${this.theme.colors?.textLight || this.theme.textColor};
        cursor: pointer;
      }

      .timeline-summary {
        display: flex;
        gap: 24px;
        padding: 16px;
        background: ${this.theme.colors?.backgroundDark || this.theme.backgroundColor};
        border-radius: 6px;
        margin-bottom: 20px;
      }

      .summary-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .summary-label {
        font-size: 13px;
        color: ${this.theme.colors?.textLight || this.theme.textColor};
      }

      .summary-value {
        font-size: 14px;
        font-weight: 600;
        color: ${this.theme.colors?.text || this.theme.textColor};
      }

      .timeline-viewport {
        position: relative;
        height: 400px;
        overflow: hidden;
        border: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
        border-radius: 6px;
        background: ${this.theme.colors?.background || this.theme.backgroundColor};
      }

      .timeline-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
      }

      .timeline-scale {
        position: sticky;
        top: 0;
        height: 40px;
        background: ${this.theme.colors?.backgroundDark || this.theme.backgroundColor};
        border-bottom: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
        z-index: 10;
        display: flex;
        align-items: center;
      }

      .timeline-groups {
        position: relative;
        padding-top: 40px;
      }

      .timeline-group {
        position: relative;
        border-bottom: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
      }

      .group-header {
        position: sticky;
        left: 0;
        width: 200px;
        padding: 12px 16px;
        background: ${this.theme.colors?.backgroundDark || this.theme.backgroundColor};
        border-right: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
        z-index: 5;
      }

      .group-name {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: ${this.theme.colors?.text || this.theme.textColor};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .group-type {
        display: inline-block;
        margin-top: 4px;
        padding: 2px 8px;
        background: ${this.theme.colors?.primary || this.theme.primaryColor}20;
        color: ${this.theme.colors?.primary || this.theme.primaryColor};
        font-size: 11px;
        font-weight: 500;
        border-radius: 3px;
        text-transform: uppercase;
      }

      .group-track {
        position: relative;
        height: 60px;
        margin-left: 200px;
        background: ${this.theme.colors?.background || this.theme.backgroundColor};
      }

      .timeline-event {
        position: absolute;
        top: 10px;
        height: 40px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        overflow: hidden;
        display: flex;
        align-items: center;
        padding: 0 8px;
        font-size: 12px;
        color: white;
        white-space: nowrap;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .timeline-event:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 10;
      }

      .timeline-event.passed {
        background: ${this.theme.colors?.success || this.theme.successColor};
      }

      .timeline-event.failed {
        background: ${this.theme.colors?.error || this.theme.failureColor};
      }

      .timeline-event.skipped {
        background: ${this.theme.colors?.warning || this.theme.warningColor};
      }

      .timeline-event.feature {
        height: 36px;
        font-weight: 500;
      }

      .timeline-event.scenario {
        height: 28px;
        top: 16px;
        opacity: 0.9;
      }

      .timeline-event.step {
        height: 20px;
        top: 20px;
        font-size: 11px;
        opacity: 0.8;
      }

      .timeline-event.execution {
        background: ${this.theme.colors?.info || this.theme.infoColor};
      }

      .scale-tick {
        position: absolute;
        top: 0;
        width: 1px;
        height: 40px;
        background: ${this.theme.colors?.border || '#e5e7eb'};
      }

      .scale-label {
        position: absolute;
        top: 12px;
        font-size: 11px;
        color: ${this.theme.colors?.textLight || this.theme.textColor};
        transform: translateX(-50%);
      }

      .timeline-tooltip {
        position: fixed;
        z-index: 1000;
        background: white;
        border: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 12px;
        max-width: 300px;
      }

      .tooltip-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
      }

      .tooltip-title {
        font-size: 13px;
        font-weight: 600;
        color: ${this.theme.colors?.text || this.theme.textColor};
      }

      .tooltip-status {
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 500;
        border-radius: 3px;
        text-transform: uppercase;
      }

      .tooltip-status.passed {
        background: ${this.theme.colors?.success || this.theme.successColor}20;
        color: ${this.theme.colors?.success || this.theme.successColor};
      }

      .tooltip-status.failed {
        background: ${this.theme.colors?.error || this.theme.failureColor}20;
        color: ${this.theme.colors?.error || this.theme.failureColor};
      }

      .tooltip-status.skipped {
        background: ${this.theme.colors?.warning || this.theme.warningColor}20;
        color: ${this.theme.colors?.warning || this.theme.warningColor};
      }

      .tooltip-body {
        font-size: 12px;
        color: ${this.theme.colors?.textLight || this.theme.textColor};
      }

      .tooltip-time,
      .tooltip-duration {
        margin-bottom: 4px;
      }

      .tooltip-details {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid ${this.theme.colors?.border || '#e5e7eb'};
        font-size: 11px;
      }

      .timeline-connection {
        position: absolute;
        border-left: 2px dashed ${this.theme.colors?.border || '#e5e7eb'};
        opacity: 0.5;
        pointer-events: none;
      }

      @media (max-width: 768px) {
        .timeline-summary {
          flex-wrap: wrap;
          gap: 12px;
        }

        .timeline-controls {
          flex-wrap: wrap;
        }

        .group-header {
          width: 150px;
        }

        .group-track {
          margin-left: 150px;
        }
      }
    `;
  }

  /**
   * Generate timeline JavaScript
   */
  private generateTimelineJS(): string {
    return `
      (function() {
        const viewport = document.getElementById('timelineViewport');
        const canvas = document.getElementById('timelineCanvas');
        const scale = document.getElementById('timelineScale');
        const tooltip = document.getElementById('timelineTooltip');
        
        let currentZoom = 1;
        let showSteps = false;
        let showParallel = true;
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;
        
        const timeline = window.timelineData;
        const timeRange = timeline.endTime.getTime() - timeline.startTime.getTime();
        const pixelsPerMs = 0.05; // Base scale
        
        // Initialize timeline
        function initTimeline() {
          renderScale();
          renderEvents();
          setupInteractions();
        }
        
        // Render time scale
        function renderScale() {
          scale.innerHTML = '';
          const width = timeRange * pixelsPerMs * currentZoom;
          scale.style.width = width + 'px';
          
          // Calculate tick interval
          const tickInterval = calculateTickInterval(timeRange);
          const tickCount = Math.floor(timeRange / tickInterval);
          
          for (let i = 0; i <= tickCount; i++) {
            const time = i * tickInterval;
            const x = time * pixelsPerMs * currentZoom;
            
            const tick = document.createElement('div');
            tick.className = 'scale-tick';
            tick.style.left = x + 'px';
            scale.appendChild(tick);
            
            if (i % 5 === 0) {
              const label = document.createElement('div');
              label.className = 'scale-label';
              label.style.left = x + 'px';
              label.textContent = formatScaleTime(timeline.startTime.getTime() + time);
              scale.appendChild(label);
            }
          }
        }
        
        // Render timeline events
        function renderEvents() {
          // Clear existing events
          document.querySelectorAll('.timeline-event').forEach(el => el.remove());
          document.querySelectorAll('.timeline-connection').forEach(el => el.remove());
          
          // Set canvas width
          const width = timeRange * pixelsPerMs * currentZoom;
          canvas.style.width = width + 200 + 'px';
          
          // Render events
          timeline.events.forEach(event => {
            if (event.type === 'step' && !showSteps) return;
            if (event.groupId.startsWith('worker-') && !showParallel) return;
            
            const track = document.querySelector(\`[data-track="\${event.groupId}"]\`);
            if (!track) return;
            
            const eventEl = createEventElement(event);
            track.appendChild(eventEl);
            
            // Add connection to parent
            if (event.parent) {
              const parentEvent = timeline.events.find(e => e.id === event.parent);
              if (parentEvent) {
                const connection = createConnection(parentEvent, event);
                track.appendChild(connection);
              }
            }
          });
        }
        
        // Create event element
        function createEventElement(event) {
          const el = document.createElement('div');
          el.className = \`timeline-event \${event.status} \${event.type}\`;
          el.dataset.eventId = event.id;
          
          const startOffset = event.start.getTime() - timeline.startTime.getTime();
          const duration = event.end.getTime() - event.start.getTime();
          
          el.style.left = (startOffset * pixelsPerMs * currentZoom) + 'px';
          el.style.width = Math.max(duration * pixelsPerMs * currentZoom, 20) + 'px';
          
          el.innerHTML = \`<span>\${event.title}</span>\`;
          
          // Add event listeners
          el.addEventListener('mouseenter', (e) => showTooltip(e, event));
          el.addEventListener('mouseleave', hideTooltip);
          el.addEventListener('click', () => selectEvent(event));
          
          return el;
        }
        
        // Create connection line
        function createConnection(parent, child) {
          const el = document.createElement('div');
          el.className = 'timeline-connection';
          
          const parentStart = parent.start.getTime() - timeline.startTime.getTime();
          const childStart = child.start.getTime() - timeline.startTime.getTime();
          
          el.style.left = (parentStart * pixelsPerMs * currentZoom) + 'px';
          el.style.width = ((childStart - parentStart) * pixelsPerMs * currentZoom) + 'px';
          el.style.top = '35px';
          el.style.height = '15px';
          
          return el;
        }
        
        // Show tooltip
        function showTooltip(e, event) {
          const rect = e.target.getBoundingClientRect();
          
          tooltip.style.display = 'block';
          tooltip.style.left = rect.left + 'px';
          tooltip.style.top = (rect.bottom + 5) + 'px';
          
          tooltip.querySelector('.tooltip-title').textContent = event.title;
          tooltip.querySelector('.tooltip-status').textContent = event.status;
          tooltip.querySelector('.tooltip-status').className = \`tooltip-status \${event.status}\`;
          
          const startTime = new Date(event.start).toLocaleTimeString();
          const endTime = new Date(event.end).toLocaleTimeString();
          tooltip.querySelector('.tooltip-time').textContent = \`Time: \${startTime} - \${endTime}\`;
          tooltip.querySelector('.tooltip-duration').textContent = \`Duration: \${formatDuration(event.duration)}\`;
          
          let details = '';
          if (event.details) {
            Object.entries(event.details).forEach(([key, value]) => {
              if (value) {
                details += \`<div>\${key}: \${value}</div>\`;
              }
            });
          }
          tooltip.querySelector('.tooltip-details').innerHTML = details;
        }
        
        // Hide tooltip
        function hideTooltip() {
          tooltip.style.display = 'none';
        }
        
        // Setup interactions
        function setupInteractions() {
          // Drag to scroll
          canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.pageX - canvas.offsetLeft;
            scrollLeft = canvas.scrollLeft;
            canvas.style.cursor = 'grabbing';
          });
          
          canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - canvas.offsetLeft;
            const walk = (x - startX) * 2;
            canvas.scrollLeft = scrollLeft - walk;
          });
          
          canvas.addEventListener('mouseup', () => {
            isDragging = false;
            canvas.style.cursor = 'grab';
          });
          
          canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            canvas.style.cursor = 'grab';
          });
          
          // Zoom with mouse wheel
          viewport.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
              e.preventDefault();
              const delta = e.deltaY > 0 ? 0.9 : 1.1;
              const newZoom = Math.max(0.1, Math.min(5, currentZoom * delta));
              if (newZoom !== currentZoom) {
                const mouseX = e.clientX - viewport.getBoundingClientRect().left;
                const scrollRatio = (canvas.scrollLeft + mouseX) / canvas.scrollWidth;
                currentZoom = newZoom;
                renderScale();
                renderEvents();
                canvas.scrollLeft = (canvas.scrollWidth * scrollRatio) - mouseX;
              }
            }
          });
        }
        
        // Calculate tick interval
        function calculateTickInterval(range) {
          const intervals = [
            100,      // 100ms
            500,      // 500ms
            1000,     // 1s
            5000,     // 5s
            10000,    // 10s
            30000,    // 30s
            60000,    // 1m
            300000,   // 5m
            600000,   // 10m
            1800000,  // 30m
            3600000   // 1h
          ];
          
          const targetTicks = 20;
          const idealInterval = range / targetTicks;
          
          return intervals.find(i => i >= idealInterval) || intervals[intervals.length - 1];
        }
        
        // Format scale time
        function formatScaleTime(timestamp) {
          const date = new Date(timestamp);
          const elapsed = timestamp - timeline.startTime.getTime();
          
          if (elapsed < 60000) {
            return Math.floor(elapsed / 1000) + 's';
          } else if (elapsed < 3600000) {
            return Math.floor(elapsed / 60000) + 'm';
          } else {
            return date.toLocaleTimeString();
          }
        }
        
        // Format duration
        function formatDuration(ms) {
          if (ms < 1000) return ms + 'ms';
          if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
          if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
          return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
        }
        
        // Select event
        function selectEvent(event) {
          // Remove previous selection
          document.querySelectorAll('.timeline-event.selected').forEach(el => {
            el.classList.remove('selected');
          });
          
          // Add selection
          const el = document.querySelector(\`[data-event-id="\${event.id}"]\`);
          if (el) {
            el.classList.add('selected');
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }
          
          // Trigger custom event
          window.dispatchEvent(new CustomEvent('timeline-event-selected', { detail: event }));
        }
        
        // Public functions
        window.timelineZoomIn = function() {
          currentZoom = Math.min(5, currentZoom * 1.5);
          renderScale();
          renderEvents();
        };
        
        window.timelineZoomOut = function() {
          currentZoom = Math.max(0.1, currentZoom / 1.5);
          renderScale();
          renderEvents();
        };
        
        window.timelineReset = function() {
          currentZoom = 1;
          canvas.scrollLeft = 0;
          renderScale();
          renderEvents();
        };
        
        window.toggleSteps = function() {
          showSteps = document.getElementById('showSteps').checked;
          renderEvents();
        };
        
        window.toggleParallel = function() {
          showParallel = document.getElementById('showParallel').checked;
          document.querySelectorAll('[data-group^="worker-"]').forEach(el => {
            el.style.display = showParallel ? 'block' : 'none';
          });
          renderEvents();
        };
        
        // Initialize
        initTimeline();
      })();
    `;
  }

  /**
   * Get theme color with fallback
   */
  private getThemeColor(colorPath: string, fallback: string): string {
    const colors = this.theme.colors;
    if (!colors) {
      // Use direct theme properties as fallback
      switch (colorPath) {
        case 'primary': return this.theme.primaryColor;
        case 'secondary': return this.theme.secondaryColor;
        case 'success': return this.theme.successColor;
        case 'error': return this.theme.failureColor;
        case 'warning': return this.theme.warningColor;
        case 'info': return this.theme.infoColor;
        case 'text': return this.theme.textColor;
        case 'background': return this.theme.backgroundColor;
        default: return fallback;
      }
    }
    
    // Navigate through nested color object
    const parts = colorPath.split('.');
    let current: any = colors;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return fallback;
      }
    }
    return current || fallback;
  }

  /**
   * Get feature color based on status
   */
  private getFeatureColor(status: TestStatus | string): string {
    switch (status) {
      case TestStatus.PASSED:
      case 'passed':
        return this.getThemeColor('success', this.theme.successColor);
      case TestStatus.FAILED:
      case 'failed':
        return this.getThemeColor('error', this.theme.failureColor);
      case TestStatus.SKIPPED:
      case 'skipped':
        return this.getThemeColor('warning', this.theme.warningColor);
      default:
        return this.getThemeColor('text.secondary', this.theme.textColor);
    }
  }

  /**
   * Format duration for display
   */
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