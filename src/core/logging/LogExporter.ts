/**
 * CS Test Automation Framework - Log Exporter
 * 
 * Utility for exporting and accessing framework logs including
 * initialization messages.
 * 
 * @author CS Test Automation Team
 * @version 1.0.0
 */

import { ActionLogger } from './ActionLogger';
import { consoleCapture, ConsoleMessage } from './ConsoleCapture';
import * as fs from 'fs';
import * as path from 'path';

export interface ExportOptions {
  includeConsole?: boolean;
  includeActionLogs?: boolean;
  includeInitializationOnly?: boolean;
  format?: 'text' | 'json' | 'html';
  outputPath?: string;
}

export class LogExporter {
  private static instance: LogExporter;

  private constructor() {}

  static getInstance(): LogExporter {
    if (!LogExporter.instance) {
      LogExporter.instance = new LogExporter();
    }
    return LogExporter.instance;
  }

  /**
   * Get all framework initialization logs
   */
  getInitializationLogs(): {
    console: ConsoleMessage[];
    framework: string[];
  } {
    // Get console messages related to initialization
    const consoleMessages = consoleCapture.getInitializationLogs();
    
    // Get framework messages from ActionLogger
    const actionLogger = ActionLogger.getInstance();
    const frameworkLogs = actionLogger.getAllBufferedLogs()
      .filter(log => {
        const message = JSON.stringify(log);
        return message.includes('initialization') ||
               message.includes('Framework') ||
               message.includes('Starting') ||
               message.includes('Configuration loaded');
      })
      .map(log => {
        const timestamp = log.timestamp.toISOString();
        const level = log.level || 'INFO';
        const message = (log as any).message || JSON.stringify(log);
        return `[${timestamp}] [${level}] ${message}`;
      });

    return {
      console: consoleMessages,
      framework: frameworkLogs
    };
  }

  /**
   * Export all logs with options
   */
  async exportLogs(options: ExportOptions = {}): Promise<string> {
    const {
      includeConsole = true,
      includeActionLogs = true,
      includeInitializationOnly = false,
      format = 'text',
      outputPath
    } = options;

    let content = '';
    const logs: any[] = [];

    if (includeConsole) {
      const consoleLogs = includeInitializationOnly 
        ? consoleCapture.getInitializationLogs()
        : consoleCapture.getMessages();
      
      if (format === 'text') {
        content += '=== CONSOLE LOGS ===\n\n';
        content += consoleLogs.map(log => 
          `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}`
        ).join('\n');
        content += '\n\n';
      } else {
        logs.push(...consoleLogs.map(log => ({
          source: 'console',
          ...log
        })));
      }
    }

    if (includeActionLogs && !includeInitializationOnly) {
      const actionLogs = ActionLogger.getInstance().getAllBufferedLogs();
      
      if (format === 'text') {
        content += '=== ACTION LOGS ===\n\n';
        content += actionLogs.map(log => {
          const timestamp = log.timestamp.toISOString();
          const level = log.level || 'INFO';
          const type = log.type;
          const details = JSON.stringify(log, null, 2);
          return `[${timestamp}] [${level}] [${type}] ${details}`;
        }).join('\n');
      } else {
        logs.push(...actionLogs.map(log => ({
          source: 'action',
          ...log
        })));
      }
    }

    if (format === 'json') {
      content = JSON.stringify(logs, null, 2);
    } else if (format === 'html') {
      content = this.generateHtmlReport(logs);
    }

    if (outputPath) {
      await this.saveToFile(outputPath, content);
    }

    return content;
  }

  /**
   * Get real-time log stream
   */
  streamLogs(callback: (log: any) => void): () => void {
    // Listen to ActionLogger events
    const actionLogger = ActionLogger.getInstance();
    const logHandler = (entry: any) => {
      callback({
        source: 'action',
        ...entry
      });
    };

    actionLogger.on('log', logHandler);

    // Return cleanup function
    return () => {
      actionLogger.off('log', logHandler);
    };
  }

  /**
   * Save content to file
   */
  private async saveToFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(logs: any[]): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Framework Logs Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #93186C;
      margin-bottom: 20px;
    }
    .filters {
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .log-entry {
      padding: 10px;
      margin-bottom: 5px;
      border-left: 3px solid #ddd;
      background: #fafafa;
      font-family: monospace;
      font-size: 0.9em;
      transition: all 0.2s;
    }
    .log-entry:hover {
      background: #f0f0f0;
    }
    .log-entry.console {
      border-left-color: #2196F3;
    }
    .log-entry.action {
      border-left-color: #4CAF50;
    }
    .log-entry.error {
      border-left-color: #F44336;
      background: #ffebee;
    }
    .log-entry.warn {
      border-left-color: #FF9800;
      background: #fff3e0;
    }
    .timestamp {
      color: #666;
      font-size: 0.85em;
    }
    .level {
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.85em;
      margin: 0 5px;
    }
    .level.error { background: #F44336; color: white; }
    .level.warn { background: #FF9800; color: white; }
    .level.info { background: #2196F3; color: white; }
    .level.debug { background: #9E9E9E; color: white; }
    .message {
      margin-top: 5px;
      white-space: pre-wrap;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      text-align: center;
    }
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #93186C;
    }
    .stat-label {
      color: #666;
      font-size: 0.9em;
      margin-top: 5px;
    }
    input[type="text"] {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-right: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Framework Logs Report</h1>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${logs.length}</div>
        <div class="stat-label">Total Logs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${logs.filter(l => l.source === 'console').length}</div>
        <div class="stat-label">Console Logs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${logs.filter(l => l.source === 'action').length}</div>
        <div class="stat-label">Action Logs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${logs.filter(l => l.level === 'error' || l.level === 'ERROR').length}</div>
        <div class="stat-label">Errors</div>
      </div>
    </div>
    
    <div class="filters">
      <input type="text" id="searchInput" placeholder="Search logs..." onkeyup="filterLogs()">
      <select id="sourceFilter" onchange="filterLogs()">
        <option value="">All Sources</option>
        <option value="console">Console Only</option>
        <option value="action">Action Only</option>
      </select>
      <select id="levelFilter" onchange="filterLogs()">
        <option value="">All Levels</option>
        <option value="error">Error</option>
        <option value="warn">Warning</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
    </div>
    
    <div id="logs">
      ${logs.map(log => {
        const level = (log.level || 'info').toLowerCase();
        const isError = level === 'error' || level === 'fatal';
        const isWarn = level === 'warn' || level === 'warning';
        
        return `
          <div class="log-entry ${log.source} ${isError ? 'error' : ''} ${isWarn ? 'warn' : ''}" 
               data-source="${log.source}" 
               data-level="${level}">
            <span class="timestamp">${new Date(log.timestamp).toISOString()}</span>
            <span class="level ${level}">${level.toUpperCase()}</span>
            <span class="source">[${log.source.toUpperCase()}]</span>
            <div class="message">${log.message || JSON.stringify(log, null, 2)}</div>
          </div>
        `;
      }).join('')}
    </div>
  </div>
  
  <script>
    function filterLogs() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      const sourceFilter = document.getElementById('sourceFilter').value;
      const levelFilter = document.getElementById('levelFilter').value;
      const entries = document.querySelectorAll('.log-entry');
      
      entries.forEach(entry => {
        const text = entry.textContent.toLowerCase();
        const source = entry.dataset.source;
        const level = entry.dataset.level;
        
        const matchesSearch = !searchTerm || text.includes(searchTerm);
        const matchesSource = !sourceFilter || source === sourceFilter;
        const matchesLevel = !levelFilter || level === levelFilter;
        
        if (matchesSearch && matchesSource && matchesLevel) {
          entry.style.display = 'block';
        } else {
          entry.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Quick method to dump initialization logs to console
   */
  dumpInitializationLogs(): void {
    const logs = this.getInitializationLogs();
    
    console.log('\n=== FRAMEWORK INITIALIZATION LOGS ===\n');
    
    console.log('Console Messages:');
    logs.console.forEach(log => {
      console.log(`[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}`);
    });
    
    console.log('\nFramework Messages:');
    logs.framework.forEach(log => {
      console.log(log);
    });
    
    console.log('\n=====================================\n');
  }
}

// Export singleton instance
export const logExporter = LogExporter.getInstance();