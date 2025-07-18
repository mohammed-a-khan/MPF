
export interface ConsoleMessage {
  timestamp: Date;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  args: any[];
  stack?: string;
}

export class ConsoleCapture {
  private static instance: ConsoleCapture;
  private messages: ConsoleMessage[] = [];
  private originalMethods: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };
  private isCapturing: boolean = false;
  private maxMessages: number = 10000;

  private constructor() {
    this.originalMethods = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console)
    };
  }

  static getInstance(): ConsoleCapture {
    if (!ConsoleCapture.instance) {
      ConsoleCapture.instance = new ConsoleCapture();
    }
    return ConsoleCapture.instance;
  }

  startCapture(): void {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;

    console.log = this.createInterceptor('log');
    console.info = this.createInterceptor('info');
    console.warn = this.createInterceptor('warn');
    console.error = this.createInterceptor('error');
    console.debug = this.createInterceptor('debug');
  }

  stopCapture(): void {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;

    console.log = this.originalMethods.log;
    console.info = this.originalMethods.info;
    console.warn = this.originalMethods.warn;
    console.error = this.originalMethods.error;
    console.debug = this.originalMethods.debug;
  }

  private createInterceptor(level: keyof typeof this.originalMethods): (...args: any[]) => void {
    return (...args: any[]) => {
      const message = args.map(arg => this.formatArg(arg)).join(' ');
      const consoleMessage: ConsoleMessage = {
        timestamp: new Date(),
        level,
        message,
        args: args.map(arg => this.serializeArg(arg))
      };

      if (level === 'error' && args[0] instanceof Error && args[0].stack) {
        consoleMessage.stack = args[0].stack;
      }

      this.addMessage(consoleMessage);

      this.originalMethods[level](...args);
    };
  }

  private formatArg(arg: any): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  private serializeArg(arg: any): any {
    if (arg === null || arg === undefined) return arg;
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack
      };
    }
    if (typeof arg === 'object') {
      try {
        return JSON.parse(JSON.stringify(arg));
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  private addMessage(message: ConsoleMessage): void {
    this.messages.push(message);

    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }

  getMessages(): ConsoleMessage[] {
    return [...this.messages];
  }

  getMessagesByLevel(level: ConsoleMessage['level']): ConsoleMessage[] {
    return this.messages.filter(m => m.level === level);
  }

  getMessagesInRange(startTime: Date, endTime: Date): ConsoleMessage[] {
    return this.messages.filter(m => 
      m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  searchMessages(searchTerm: string): ConsoleMessage[] {
    const lowerSearch = searchTerm.toLowerCase();
    return this.messages.filter(m => 
      m.message.toLowerCase().includes(lowerSearch)
    );
  }

  clear(): void {
    this.messages = [];
  }

  exportAsText(): string {
    return this.messages.map(m => {
      const timestamp = m.timestamp.toISOString();
      const level = m.level.toUpperCase().padEnd(5);
      return `[${timestamp}] [${level}] ${m.message}`;
    }).join('\n');
  }

  exportAsJson(): string {
    return JSON.stringify(this.messages, null, 2);
  }

  exportAsHtml(): string {
    const levelColors = {
      log: '#333',
      info: '#2196F3',
      warn: '#FF9800',
      error: '#F44336',
      debug: '#9E9E9E'
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Console Logs</title>
  <style>
    body {
      font-family: 'Consolas', 'Monaco', monospace;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      margin: 0;
    }
    .log-entry {
      margin-bottom: 8px;
      padding: 8px;
      border-radius: 4px;
      background: #2d2d2d;
      word-wrap: break-word;
    }
    .timestamp {
      color: #608b4e;
      font-size: 0.9em;
    }
    .level {
      font-weight: bold;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.85em;
      margin: 0 8px;
    }
    .message {
      white-space: pre-wrap;
    }
    .stack {
      color: #f48771;
      font-size: 0.85em;
      margin-top: 5px;
      padding-left: 20px;
      white-space: pre-wrap;
    }
    .search {
      margin-bottom: 20px;
      padding: 10px;
      background: #2d2d2d;
      border-radius: 4px;
    }
    input {
      width: 100%;
      padding: 8px;
      background: #1e1e1e;
      border: 1px solid #3e3e3e;
      color: #d4d4d4;
      border-radius: 4px;
    }
    .stats {
      margin-bottom: 20px;
      padding: 10px;
      background: #2d2d2d;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>Console Logs</h1>
  <div class="stats">
    Total Messages: ${this.messages.length} | 
    Errors: ${this.getMessagesByLevel('error').length} | 
    Warnings: ${this.getMessagesByLevel('warn').length}
  </div>
  <div class="search">
    <input type="text" id="searchInput" placeholder="Search logs..." onkeyup="filterLogs()">
  </div>
  <div id="logs">
    ${this.messages.map(m => `
      <div class="log-entry" data-level="${m.level}">
        <span class="timestamp">${m.timestamp.toISOString()}</span>
        <span class="level" style="background-color: ${levelColors[m.level]};">${m.level}</span>
        <span class="message">${this.escapeHtml(m.message)}</span>
        ${m.stack ? `<div class="stack">${this.escapeHtml(m.stack)}</div>` : ''}
      </div>
    `).join('')}
  </div>
  <script>
    function filterLogs() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      const entries = document.querySelectorAll('.log-entry');
      
      entries.forEach(entry => {
        const text = entry.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          entry.style.display = 'block';
        } else {
          entry.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document?.createElement?.('div');
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getInitializationLogs(): ConsoleMessage[] {
    return this.messages.filter(m => 
      m.message.includes('🚀') ||
      m.message.includes('Framework v') ||
      m.message.includes('Starting test execution') ||
      m.message.includes('PURE TYPESCRIPT') ||
      m.message.includes('initialization') ||
      m.message.includes('Framework')
    );
  }

  getSummary(): {
    total: number;
    byLevel: Record<ConsoleMessage['level'], number>;
    errors: number;
    warnings: number;
    initializationLogs: number;
  } {
    const byLevel: Record<ConsoleMessage['level'], number> = {
      log: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0
    };

    this.messages.forEach(m => {
      byLevel[m.level]++;
    });

    return {
      total: this.messages.length,
      byLevel,
      errors: byLevel.error,
      warnings: byLevel.warn,
      initializationLogs: this.getInitializationLogs().length
    };
  }
}

export const consoleCapture = ConsoleCapture.getInstance();
