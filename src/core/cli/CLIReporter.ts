// src/core/cli/CLIReporter.ts

import * as readline from 'readline';
import * as os from 'os';
import { ExecutionOptions, TestResult, TestStatus, StepResult, ExecutionSummary, WorkerResult } from './ExecutionOptions';

/**
* Production-ready CLI reporter with real-time progress, animations,
* and beautiful console output with full ANSI color support
*/
export class CLIReporter {
 private static instance: CLIReporter;
 private readonly stdout: NodeJS.WriteStream;
 private readonly stderr: NodeJS.WriteStream;
 private readonly stdin: NodeJS.ReadStream;
 
 // Terminal capabilities
 private readonly isInteractive: boolean;
 private readonly hasColors: boolean;
 private readonly terminalWidth: number;
 private readonly terminalHeight: number;
 private readonly isCIEnvironment: boolean;
 
 // Execution state
 private startTime: number = 0;
 private currentFeature: string = '';
 private currentScenario: string = '';
 private currentStep: string = '';
 private totalFeatures: number = 0;
 private totalScenarios: number = 0;
 private totalSteps: number = 0;
 private completedFeatures: number = 0;
 private completedScenarios: number = 0;
 private completedSteps: number = 0;
 private passedSteps: number = 0;
 private failedSteps: number = 0;
 private skippedSteps: number = 0;
 private pendingSteps: number = 0;
 
 // Progress tracking
 private progressBarWidth: number = 40;
 private lastProgressUpdate: number = 0;
 private progressUpdateInterval: number = 100; // ms
 private spinnerIndex: number = 0;
 private spinnerInterval: NodeJS.Timeout | null = null;
 
 // Output buffering
 private outputBuffer: string[] = [];
 private errorBuffer: string[] = [];
 private isBuffering: boolean = false;
 private lastLineLength: number = 0;
 
 // Worker tracking for parallel execution
 private workers: Map<string, WorkerState> = new Map();
 private workerColors: string[] = [
   '\x1b[36m', // Cyan
   '\x1b[35m', // Magenta
   '\x1b[34m', // Blue
   '\x1b[33m', // Yellow
   '\x1b[32m', // Green
   '\x1b[31m', // Red
 ];
 
 // ANSI escape codes
 private readonly ANSI = {
   // Cursor movement
   CURSOR_UP: '\x1b[A',
   CURSOR_DOWN: '\x1b[B',
   CURSOR_FORWARD: '\x1b[C',
   CURSOR_BACK: '\x1b[D',
   CURSOR_NEXT_LINE: '\x1b[E',
   CURSOR_PREV_LINE: '\x1b[F',
   CURSOR_HORIZONTAL_ABS: '\x1b[G',
   CURSOR_POSITION: '\x1b[H',
   ERASE_LINE: '\x1b[2K',
   ERASE_LINE_END: '\x1b[K',
   ERASE_LINE_START: '\x1b[1K',
   ERASE_DOWN: '\x1b[J',
   ERASE_UP: '\x1b[1J',
   ERASE_SCREEN: '\x1b[2J',
   SAVE_CURSOR: '\x1b[s',
   RESTORE_CURSOR: '\x1b[u',
   HIDE_CURSOR: '\x1b[?25l',
   SHOW_CURSOR: '\x1b[?25h',
   
   // Colors
   RESET: '\x1b[0m',
   BRIGHT: '\x1b[1m',
   DIM: '\x1b[2m',
   UNDERSCORE: '\x1b[4m',
   BLINK: '\x1b[5m',
   REVERSE: '\x1b[7m',
   HIDDEN: '\x1b[8m',
   
   // Foreground colors
   FG_BLACK: '\x1b[30m',
   FG_RED: '\x1b[31m',
   FG_GREEN: '\x1b[32m',
   FG_YELLOW: '\x1b[33m',
   FG_BLUE: '\x1b[34m',
   FG_MAGENTA: '\x1b[35m',
   FG_CYAN: '\x1b[36m',
   FG_WHITE: '\x1b[37m',
   FG_GRAY: '\x1b[90m',
   FG_BRIGHT_RED: '\x1b[91m',
   FG_BRIGHT_GREEN: '\x1b[92m',
   FG_BRIGHT_YELLOW: '\x1b[93m',
   FG_BRIGHT_BLUE: '\x1b[94m',
   FG_BRIGHT_MAGENTA: '\x1b[95m',
   FG_BRIGHT_CYAN: '\x1b[96m',
   FG_BRIGHT_WHITE: '\x1b[97m',
   
   // Background colors
   BG_BLACK: '\x1b[40m',
   BG_RED: '\x1b[41m',
   BG_GREEN: '\x1b[42m',
   BG_YELLOW: '\x1b[43m',
   BG_BLUE: '\x1b[44m',
   BG_MAGENTA: '\x1b[45m',
   BG_CYAN: '\x1b[46m',
   BG_WHITE: '\x1b[47m',
   BG_GRAY: '\x1b[100m',
   BG_BRIGHT_RED: '\x1b[101m',
   BG_BRIGHT_GREEN: '\x1b[102m',
   BG_BRIGHT_YELLOW: '\x1b[103m',
   BG_BRIGHT_BLUE: '\x1b[104m',
   BG_BRIGHT_MAGENTA: '\x1b[105m',
   BG_BRIGHT_CYAN: '\x1b[106m',
   BG_BRIGHT_WHITE: '\x1b[107m',
 };
 
 // Unicode symbols
 private readonly SYMBOLS = {
   SUCCESS: '✓',
   FAILURE: '✗',
   SKIPPED: '⊘',
   PENDING: '?',
   WARNING: '⚠',
   INFO: 'ℹ',
   ARROW_RIGHT: '→',
   ARROW_DOWN: '↓',
   BULLET: '•',
   ELLIPSIS: '…',
   CHECK_HEAVY: '✔',
   CROSS_HEAVY: '✖',
   CIRCLE: '●',
   CIRCLE_EMPTY: '○',
   SQUARE: '■',
   SQUARE_EMPTY: '□',
   DIAMOND: '◆',
   DIAMOND_EMPTY: '◇',
   STAR: '★',
   STAR_EMPTY: '☆',
   PLAY: '▶',
   PAUSE: '⏸',
   STOP: '⏹',
   HOURGLASS: '⏳',
   CLOCK: '🕐',
   ROCKET: '🚀',
   FIRE: '🔥',
   SPARKLES: '✨',
   PACKAGE: '📦',
   BUG: '🐛',
   WRENCH: '🔧',
   LIGHTBULB: '💡',
   LOCK: '🔒',
   KEY: '🔑',
   FOLDER: '📁',
   FILE: '📄',
   GRAPH: '📊',
 };
 
 // Spinner frames
 private readonly SPINNERS = {
   dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
   dots2: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
   dots3: ['⠋', '⠙', '⠚', '⠞', '⠖', '⠦', '⠴', '⠲', '⠳', '⠓'],
   line: ['⎯', '\\', '|', '/'],
   line2: ['⠂', '-', '–', '—', '–', '-'],
   pipe: ['┤', '┘', '┴', '└', '├', '┌', '┬', '┐'],
   simpleDots: ['.  ', '.. ', '...', '   '],
   simpleDotsScrolling: ['.  ', '.. ', '...', ' ..', '  .', '   '],
   star: ['✶', '✸', '✹', '✺', '✹', '✸'],
   star2: ['+', 'x', '*'],
   flip: ['_', '_', '_', '-', '`', '`', "'", '´', '-', '_', '_', '_'],
   hamburger: ['☱', '☲', '☴'],
   growVertical: ['▁', '▃', '▄', '▅', '▆', '▇', '▆', '▅', '▄', '▃'],
   growHorizontal: ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '▊', '▋', '▌', '▍', '▎'],
   balloon: [' ', '.', 'o', 'O', '@', '*', ' '],
   balloon2: ['.', 'o', 'O', '°', 'O', 'o', '.'],
   noise: ['▓', '▒', '░'],
   bounce: ['⠁', '⠂', '⠄', '⠂'],
   boxBounce: ['▖', '▘', '▝', '▗'],
   boxBounce2: ['▌', '▀', '▐', '▄'],
   triangle: ['◢', '◣', '◤', '◥'],
   arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
   circle: ['◡', '⊙', '◠'],
   squareCorners: ['◰', '◳', '◲', '◱'],
   circleQuarters: ['◴', '◷', '◶', '◵'],
   circleHalves: ['◐', '◓', '◑', '◒'],
   squish: ['╫', '╪'],
   toggle: ['⊶', '⊷'],
   toggle2: ['▫', '▪'],
   toggle3: ['□', '■'],
   toggle4: ['■', '□', '▪', '▫'],
   toggle5: ['▮', '▯'],
   toggle6: ['ဝ', '၀'],
   toggle7: ['⦾', '⦿'],
   toggle8: ['◍', '◌'],
   toggle9: ['◉', '◎'],
   toggle10: ['㊂', '㊀', '㊁'],
   arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
   arrow2: ['⬆️ ', '↗️ ', '➡️ ', '↘️ ', '⬇️ ', '↙️ ', '⬅️ ', '↖️ '],
   arrow3: ['▹▹▹▹▹', '▸▹▹▹▹', '▹▸▹▹▹', '▹▹▸▹▹', '▹▹▹▸▹', '▹▹▹▹▸'],
   bouncingBar: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]', '[    ]', '[   =]', '[  ==]', '[ ===]', '[====]', '[=== ]', '[==  ]', '[=   ]'],
   bouncingBall: ['( ●    )', '(  ●   )', '(   ●  )', '(    ● )', '(     ●)', '(    ● )', '(   ●  )', '(  ●   )', '( ●    )', '(●     )'],
   pong: ['▐⠂       ▌', '▐⠈       ▌', '▐ ⠂      ▌', '▐ ⠠      ▌', '▐  ⡀     ▌', '▐  ⠠     ▌', '▐   ⠂    ▌', '▐   ⠈    ▌', '▐    ⠂   ▌', '▐    ⠠   ▌', '▐     ⡀  ▌', '▐     ⠠  ▌', '▐      ⠂ ▌', '▐      ⠈ ▌', '▐       ⠂▌', '▐       ⠠▌', '▐       ⡀▌', '▐      ⠠ ▌', '▐      ⠂ ▌', '▐     ⠈  ▌', '▐     ⠂  ▌', '▐    ⠠   ▌', '▐    ⡀   ▌', '▐   ⠠    ▌', '▐   ⠂    ▌', '▐  ⠈     ▌', '▐  ⠂     ▌', '▐ ⠠      ▌', '▐ ⡀      ▌', '▐⠠       ▌'],
   shark: ['▐|\\____________▌', '▐_|\\___________▌', '▐__|\\__________▌', '▐___|\\_________▌', '▐____|\\________▌', '▐_____|\\_______▌', '▐______|\\______▌', '▐_______|\\_____▌', '▐________|\\____▌', '▐_________|\\___▌', '▐__________|\\__▌', '▐___________|\\_▌', '▐____________|\\▌', '▐____________/|▌', '▐___________/|_▌', '▐__________/|__▌', '▐_________/|___▌', '▐________/|____▌', '▐_______/|_____▌', '▐______/|______▌', '▐_____/|_______▌', '▐____/|________▌', '▐___/|_________▌', '▐__/|__________▌', '▐_/|___________▌', '▐/|____________▌'],
   dqpb: ['d', 'q', 'p', 'b'],
   weather: ['☀️ ', '☀️ ', '☀️ ', '🌤 ', '⛅️ ', '🌥 ', '☁️ ', '🌧 ', '🌨 ', '🌧 ', '🌦 ', '🌦 ', '⛈ ', '🌨 ', '🌨 ', '🌨 ', '🌧 ', '🌦 ', '🌦 ', '☁️ ', '🌥 ', '⛅️ ', '🌤 ', '☀️ ', '☀️ '],
   christmas: ['🌲', '🎄'],
   grenade: ['،  ', '′ ', ' ´ ', ' ‾ ', '  ⸌', '  ⸊', '  |', '  ⁎', '  ⁕', ' ෴ ', '  ⁓', '   ', '   ', '   '],
   point: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●', '∙∙∙'],
   layer: ['-', '=', '≡'],
 };
 
 private readonly options: ExecutionOptions;
 private readonly useColors: boolean;
 private readonly spinner: string[];
 
 private constructor(options: ExecutionOptions = {} as ExecutionOptions) {
   this.options = options;
   this.stdout = process.stdout;
   this.stderr = process.stderr;
   this.stdin = process.stdin;
   
   // Detect terminal capabilities
   this.isInteractive = this.stdout.isTTY && !options.ci;
   this.hasColors = this.stdout.hasColors?.() ?? false;
   this.terminalWidth = this.stdout.columns || 80;
   this.terminalHeight = this.stdout.rows || 24;
   this.isCIEnvironment = options.ci || !!process.env['CI'];
   
   // Configure colors
   this.useColors = this.hasColors && !options.noColors;
   
   // Select spinner based on environment
   if (this.isCIEnvironment) {
     this.spinner = this.SPINNERS.simpleDots;
   } else if (process.platform === 'win32') {
     this.spinner = this.SPINNERS.line;
   } else {
     this.spinner = this.SPINNERS.dots;
   }
   
   // Configure progress bar width
   this.progressBarWidth = Math.min(40, Math.floor(this.terminalWidth * 0.5));
   
   // Setup signal handlers for cleanup
   this.setupSignalHandlers();
 }

 /**
  * Get singleton instance
  */
 public static getInstance(options?: ExecutionOptions): CLIReporter {
   if (!CLIReporter.instance) {
     CLIReporter.instance = new CLIReporter(options || {} as ExecutionOptions);
   }
   return CLIReporter.instance;
 }
 
 /**
  * Initialize reporter and show header
  */
 public initialize(totalFeatures: number, totalScenarios: number, totalSteps: number): void {
   this.totalFeatures = totalFeatures;
   this.totalScenarios = totalScenarios;
   this.totalSteps = totalSteps;
   this.startTime = Date.now();
   
   // Clear screen and show header
   if (this.isInteractive && !this.options.debug) {
     this.clearScreen();
   }
   
   this.showHeader();
   this.showExecutionInfo();
   
   // Start progress updates
   if (this.isInteractive && !this.options.quiet) {
     this.startProgressUpdates();
   }
 }
 
 /**
  * Show framework header with branding
  */
 private showHeader(): void {
   const logo = [
     '╔═══════════════════════════════════════════════════════════════╗',
     '║                                                               ║',
     '║     ██████╗███████╗    ████████╗███████╗███████╗████████╗    ║',
     '║    ██╔════╝██╔════╝    ╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝    ║',
     '║    ██║     ███████╗       ██║   █████╗  ███████╗   ██║       ║',
     '║    ██║     ╚════██║       ██║   ██╔══╝  ╚════██║   ██║       ║',
     '║    ╚██████╗███████║       ██║   ███████╗███████║   ██║       ║',
     '║     ╚═════╝╚══════╝       ╚═╝   ╚══════╝╚══════╝   ╚═╝       ║',
     '║                                                               ║',
     '║            Test Automation Framework v1.0.0                   ║',
     '║                                                               ║',
     '╚═══════════════════════════════════════════════════════════════╝'
   ];
   
   if (this.useColors) {
     // Apply brand color #93186C
     logo.forEach((line: string) => {
       this.writeLine(this.colorize(line, 'brand'));
     });
   } else {
     logo.forEach(line => this.writeLine(line));
   }
   
   this.writeLine('');
 }
 
 /**
  * Show execution information
  */
 private showExecutionInfo(): void {
   const info = [
     `${this.SYMBOLS.ROCKET} Execution ID: ${this.options.executionId}`,
     `${this.SYMBOLS.PACKAGE} Environment: ${this.options.environment}`,
     `${this.SYMBOLS.FOLDER} Features: ${this.totalFeatures}`,
     `${this.SYMBOLS.FILE} Scenarios: ${this.totalScenarios}`,
     `${this.SYMBOLS.PLAY} Steps: ${this.totalSteps}`,
   ];
   
   if (this.options.parallel) {
     info.push(`${this.SYMBOLS.GRAPH} Workers: ${this.options.workers}`);
   }
   
   if (this.options.tags) {
     info.push(`${this.SYMBOLS.KEY} Tags: ${this.options.tags}`);
   }
   
   this.writeLine(this.createBox(info, 'Execution Configuration'));
   this.writeLine('');
 }
 
 /**
  * Start progress update loop
  */
 private startProgressUpdates(): void {
   if (this.isInteractive) {
     this.hideCursor();
     
     // Start spinner
     this.spinnerInterval = setInterval(() => {
       this.updateProgress();
     }, this.progressUpdateInterval);
   }
 }
 
 /**
  * Stop progress updates
  */
 private stopProgressUpdates(): void {
   if (this.spinnerInterval) {
     clearInterval(this.spinnerInterval);
     this.spinnerInterval = null;
   }
   
   if (this.isInteractive) {
     this.showCursor();
   }
 }
 
 /**
  * Update progress display
  */
 public updateProgress(progress?: any): void {
   // Use progress if provided
   if (progress) {
     this.currentFeature = progress.feature || this.currentFeature;
     this.currentScenario = progress.scenario || this.currentScenario;
     this.currentStep = progress.step || this.currentStep;
   }
   
   if (!this.isInteractive || this.options.quiet) {
     return;
   }
   
   const now = Date.now();
   if (now - this.lastProgressUpdate < this.progressUpdateInterval) {
     return;
   }
   
   this.lastProgressUpdate = now;
   
   // Build progress display
   const lines: string[] = [];
   
   if (this.options.parallel && this.workers.size > 0) {
     // Parallel execution - show worker status
     lines.push(this.buildParallelProgress());
   } else {
     // Sequential execution - show single progress
     lines.push(this.buildSequentialProgress());
   }
   
   // Add current activity
   if (this.currentStep) {
     lines.push('');
     lines.push(this.formatCurrentActivity());
   }
   
   // Add statistics
   lines.push('');
   lines.push(this.buildStatistics());
   
   // Clear previous output and write new
   this.clearProgressArea(lines.length);
   lines.forEach(line => this.writeLine(line));
   
   // Move cursor back up
   this.moveCursorUp(lines.length);
 }
 
 /**
  * Build parallel execution progress
  */
 private buildParallelProgress(): string {
   const lines: string[] = [];
   
   // Overall progress
   const overallProgress = this.completedScenarios / this.totalScenarios;
   const progressBar = this.buildProgressBar(overallProgress, this.progressBarWidth);
   const percentage = Math.floor(overallProgress * 100);
   const elapsed = this.formatDuration(Date.now() - this.startTime);
   
   lines.push(`Overall Progress: ${progressBar} ${percentage}% | ${elapsed}`);
   lines.push('');
   
   // Worker status
   lines.push('Workers:');
   
   let workerIndex = 0;
   this.workers.forEach((state, workerId) => {
     const color = this.workerColors[workerIndex % this.workerColors.length];
     const status = this.formatWorkerStatus(state);
     const workerLine = `  ${color}Worker ${workerId} (${workerIndex + 1})${this.ANSI.RESET}: ${status}`;
     lines.push(workerLine);
     workerIndex++;
   });
   
   return lines.join('\n');
 }
 
 /**
  * Build sequential execution progress
  */
 private buildSequentialProgress(): string {
   // 🔥 FIX: Add null checks to prevent NaN calculations
   const safeCompletedSteps = this.completedSteps || 0;
   const safeTotalSteps = this.totalSteps || 1; // Prevent division by zero
   const safeCompletedScenarios = this.completedScenarios || 0;
   const safeTotalScenarios = this.totalScenarios || 1; // Prevent division by zero
   const safeCompletedFeatures = this.completedFeatures || 0;
   const safeTotalFeatures = this.totalFeatures || 1; // Prevent division by zero
   
   const overallProgress = Math.min(1, Math.max(0, safeCompletedSteps / safeTotalSteps));
   const scenarioProgress = Math.min(1, Math.max(0, safeCompletedScenarios / safeTotalScenarios));
   const featureProgress = Math.min(1, Math.max(0, safeCompletedFeatures / safeTotalFeatures));
   
   // Include progress indicators in display
   const progressIndicators = `F:${Math.floor(featureProgress * 100)}% S:${Math.floor(scenarioProgress * 100)}%`;
   
   const progressBar = this.buildProgressBar(overallProgress, this.progressBarWidth);
   const percentage = Math.floor(overallProgress * 100);
   const elapsed = this.formatDuration(Date.now() - this.startTime);
   const eta = this.calculateETA(overallProgress, elapsed);
   
   const spinner = this.spinner[this.spinnerIndex % this.spinner.length];
   this.spinnerIndex++;
   
   return `${spinner} Progress: ${progressBar} ${percentage}% | ${elapsed} | ETA: ${eta} | ${progressIndicators}\n` +
          `   Features: ${safeCompletedFeatures}/${safeTotalFeatures} | ` +
          `Scenarios: ${safeCompletedScenarios}/${safeTotalScenarios} | ` +
          `Steps: ${safeCompletedSteps}/${safeTotalSteps}`;
 }
 
 /**
  * Build progress bar
  */
 private buildProgressBar(progress: number, width: number): string {
   const filled = Math.floor(progress * width);
   const empty = width - filled;
   
   let bar = '[';
   
   if (this.useColors) {
     // Gradient progress bar
     for (let i = 0; i < filled; i++) {
       if (i < width * 0.33) {
         bar += this.ANSI.FG_RED + '█';
       } else if (i < width * 0.66) {
         bar += this.ANSI.FG_YELLOW + '█';
       } else {
         bar += this.ANSI.FG_GREEN + '█';
       }
     }
     bar += this.ANSI.FG_GRAY;
     bar += '░'.repeat(empty);
     bar += this.ANSI.RESET;
   } else {
     bar += '█'.repeat(filled);
     bar += '░'.repeat(empty);
   }
   
   bar += ']';
   
   return bar;
 }
 
 /**
  * Format current activity
  */
 private formatCurrentActivity(): string {
   let activity = 'Current: ';
   
   if (this.currentFeature) {
     activity += this.truncate(this.currentFeature, 30) + ' > ';
   }
   
   if (this.currentScenario) {
     activity += this.truncate(this.currentScenario, 40);
   }
   
   if (this.currentStep) {
     // Use clearLastLine for smooth updates
     this.clearLastLine();
     activity += '\n         ' + this.colorize('└─ ', 'gray') + 
                 this.truncate(this.currentStep, 60);
   }
   
   return activity;
 }
 
 /**
  * Build statistics line
  */
 private buildStatistics(): string {
   const stats = [
     `${this.SYMBOLS.SUCCESS} ${this.colorize(this.passedSteps.toString(), 'green')}`,
     `${this.SYMBOLS.FAILURE} ${this.colorize(this.failedSteps.toString(), 'red')}`,
     `${this.SYMBOLS.SKIPPED} ${this.colorize(this.skippedSteps.toString(), 'yellow')}`,
     `${this.SYMBOLS.PENDING} ${this.colorize(this.pendingSteps.toString(), 'gray')}`,
   ];
   
   return `Status: ${stats.join(' | ')}`;
 }
 
 /**
  * Report feature started
  */
 public onFeatureStart(featureName: string): void {
   this.currentFeature = featureName;
   
   if (!this.isInteractive || this.options.verbose) {
     this.writeLine('');
     this.writeLine(this.colorize(`Feature: ${featureName}`, 'cyan', 'bright'));
   }
 }
 
 /**
  * Report feature completed
  */
 public onFeatureEnd(featureName: string, duration: number): void {
   this.currentFeature = ''; // Clear current feature
   this.completedFeatures++;
   
   if (!this.isInteractive || this.options.verbose) {
     const durationStr = this.formatDuration(duration);
     this.writeLine(this.colorize(`  Feature ${featureName} completed in ${durationStr}`, 'gray'));
   }
 }
 
 /**
  * Report scenario started
  */
 public onScenarioStart(scenarioName: string, tags: string[]): void {
   this.currentScenario = scenarioName;
   
   if (!this.isInteractive || this.options.verbose) {
     const tagStr = tags.length > 0 ? this.colorize(` ${tags.join(' ')}`, 'gray') : '';
     this.writeLine(`  Scenario: ${scenarioName}${tagStr}`);
   }
 }
 
 /**
  * Report scenario completed
  */
 public onScenarioEnd(scenarioName: string, result: TestResult): void {
   this.completedScenarios++;
   
   if (!this.isInteractive || this.options.verbose) {
     const symbol = this.getStatusSymbol(result.status);
     const color = this.getStatusColor(result.status);
     const duration = this.formatDuration(result.duration);
     
     this.writeLine(`    ${this.colorize(symbol, color)} ${scenarioName} (${duration})`);
     
     if (result.error && this.options.verbose) {
       this.writeError(result.error);
     }
   }
 }
 
 /**
  * Report step started
  */
 public onStepStart(step: StepResult): void {
   this.currentStep = `${step.keyword} ${step.name}`;
   
   if (this.options.verbose && !this.isInteractive) {
     this.write(`    ${this.colorize(step.keyword, 'magenta')} ${step.name}`);
   }
 }
 
 /**
  * Report step completed
  */
 public onStepEnd(step: StepResult): void {
   this.completedSteps++;
   
   switch (step.status) {
     case 'passed':
       this.passedSteps++;
       break;
     case 'failed':
       this.failedSteps++;
       break;
     case 'skipped':
       this.skippedSteps++;
       break;
     case 'pending':
       this.pendingSteps++;
       break;
   }
   
   if (this.options.verbose && !this.isInteractive) {
     const symbol = this.getStatusSymbol(step.status);
     const color = this.getStatusColor(step.status);
     const duration = this.formatDuration(step.duration);
     
     this.writeLine(` ${this.colorize(symbol, color)} (${duration})`);
     
     if (step.error) {
       this.writeError(step.error);
     }
   } else if (!this.isInteractive && step.status === 'failed') {
     // Always show failures
     this.writeLine(`    ${this.colorize('✗', 'red')} ${step.keyword} ${step.name}`);
     if (step.error) {
       this.writeError(step.error);
     }
   }
 }
 
 /**
  * Report worker started (parallel execution)
  */
 public onWorkerStart(workerId: string, features: string[]): void {
   this.workers.set(workerId, {
     id: workerId,
     status: 'running',
     currentFeature: '',
     currentScenario: '',
     completedScenarios: 0,
     totalScenarios: 0,
     startTime: Date.now()
   });
   
   if (this.options.verbose) {
     this.writeLine(this.colorize(`Worker ${workerId} started with ${features.length} features`, 'gray'));
   }
 }
 
 /**
  * Report worker progress
  */
 public onWorkerProgress(workerId: string, feature: string, scenario: string): void {
   const worker = this.workers.get(workerId);
   if (worker) {
     worker.currentFeature = feature;
     worker.currentScenario = scenario;
   }
 }
 
 /**
  * Report worker completed
  */
 public onWorkerEnd(workerId: string, result: WorkerResult): void {
   // Use result to update worker stats
   const workerScenarios = result.results.length;
   const workerPassed = result.results.filter(r => r.status === 'passed').length;
   const workerFailed = result.results.filter(r => r.status === 'failed').length;
   
   const worker = this.workers.get(workerId);
   if (worker) {
     worker.status = 'completed';
     worker.endTime = Date.now();
   }
   
   if (this.options.verbose) {
     const duration = this.formatDuration(Date.now() - (worker?.startTime || 0));
     this.writeLine(this.colorize(`Worker ${workerId} completed in ${duration} - ${workerScenarios} scenarios (${workerPassed} passed, ${workerFailed} failed)`, 'gray'));
   }
   
   // Debug logging  
   if (this.options.debug) {
     console.debug(`Worker ${workerId} completed: ${workerScenarios} scenarios, ${workerPassed} passed, ${workerFailed} failed`);
   }
 }
 
 /**
  * Report execution completed
  */
 public onExecutionComplete(summary: ExecutionSummary): void {
   this.stopProgressUpdates();
   
   // Clear progress area
   if (this.isInteractive) {
     this.clearProgressArea(10);
   }
   
   this.writeLine('');
   this.writeLine(this.createSeparator('═'));
   this.showExecutionSummary(summary);
   
   // Show detailed results if verbose
   if (this.options.verbose && summary.metadata?.['detailedResults']) {
     this.showDetailedResults(summary.metadata['detailedResults']);
   }
   
   // Show failure details
   if (summary.failed > 0 && !this.options.quiet) {
     this.showFailureDetails(summary);
   }
   
   this.writeLine(this.createSeparator('═'));
   
   // Final status
   const status = summary.status === 'passed' ? 
     this.colorize('✓ ALL TESTS PASSED', 'green', 'bright') :
     this.colorize('✗ TESTS FAILED', 'red', 'bright');
   
   this.writeLine('');
   this.writeLine(this.center(status));
   this.writeLine('');
 }
 
 /**
  * Show execution summary
  */
 private showExecutionSummary(summary: ExecutionSummary): void {
   const duration = this.formatDuration(summary.duration);
   const throughput = (summary.totalSteps / (summary.duration / 1000)).toFixed(2);
   
   const summaryLines = [
     `Execution Summary`,
     ``,
     `Duration: ${duration}`,
     `Throughput: ${throughput} steps/second`,
     ``,
     `Features: ${summary.totalFeatures}`,
     `Scenarios: ${summary.totalScenarios}`,
     `Steps: ${summary.totalSteps}`,
     ``,
     `Passed: ${this.colorize(summary.passed.toString(), 'green')}`,
     `Failed: ${this.colorize(summary.failed.toString(), 'red')}`,
     `Skipped: ${this.colorize(summary.skipped.toString(), 'yellow')}`,
     `Pending: ${this.colorize(summary.pending.toString(), 'gray')}`,
   ];
   
   if (summary.flaky > 0) {
     summaryLines.push(`Flaky: ${this.colorize(summary.flaky.toString(), 'yellow')}`);
   }
   
   if (summary.retried > 0) {
     summaryLines.push(`Retried: ${this.colorize(summary.retried.toString(), 'blue')}`);
   }
   
   const box = this.createBox(summaryLines, 'Summary', 'double');
   this.writeLine(box);
 }
 
 /**
  * Show detailed results
  */
 private showDetailedResults(results: any): void {
   // Implementation would show detailed breakdown by feature/scenario
   this.writeLine(this.colorize('Detailed Results:', 'cyan', 'bright'));
   // Use results to display details
   if (results && results.features) {
     results.features.forEach((feature: any) => {
       this.writeLine(`  ${feature.name}: ${feature.status}`);
     });
   }
 }
 
 /**
  * Show failure details
  */
 private showFailureDetails(summary: ExecutionSummary): void {
   this.writeLine('');
   this.writeLine(this.colorize('Failed Tests:', 'red', 'bright'));
   this.writeLine(this.createSeparator('-'));
   
   // Use summary to show failure count
   if (summary.failed > 0) {
     this.writeLine(`Total failures: ${summary.failed}`);
     this.writeLine(`Failed steps: ${summary.failed}`);
     this.writeLine(`Skipped steps: ${summary.skipped}`);
   }
 }
 
 /**
  * Write error with formatting
  */
 private writeError(error: any): void {
   const errorLines = this.formatError(error);
   errorLines.forEach(line => {
     if (this.isBuffering) {
       this.errorBuffer.push(this.colorize(`      ${line}`, 'red'));
     } else {
       this.writeLine(this.colorize(`      ${line}`, 'red'));
     }
   });
 }
 
 /**
  * Format error for display
  */
 private formatError(error: any): string[] {
   const lines: string[] = [];
   
   if (error.message) {
     lines.push(`Error: ${error.message}`);
   }
   
   if (error.expected && error.actual) {
     lines.push(`Expected: ${error.expected}`);
     lines.push(`Actual: ${error.actual}`);
   }
   
   if (error.stack && this.options.verbose) {
     const stackLines = error.stack.split('\n').slice(1, 4);
     stackLines.forEach((line: string) => {
       const trimmed = line.trim();
       if (trimmed.startsWith('at ')) {
         lines.push(trimmed);
       }
     });
   }
   
   return lines;
 }
 
 /**
  * Format worker status
  */
 private formatWorkerStatus(state: WorkerState): string {
   if (state.status === 'completed') {
     return this.colorize('Completed', 'green');
   }
   
   const elapsed = this.formatDuration(Date.now() - state.startTime);
   const current = state.currentScenario ? 
     this.truncate(state.currentScenario, 40) : 
     'Initializing...';
   
   return `${current} (${elapsed})`;
 }
 
 /**
  * Create a box around content
  */
 private createBox(lines: string[], title?: string, style: 'single' | 'double' = 'single'): string {
   const maxLength = Math.max(
     ...lines.map(l => this.stripAnsi(l).length),
     title ? title.length + 4 : 0
   );
   
   const chars = style === 'double' ? {
     tl: '╔', tr: '╗', bl: '╚', br: '╝',
     h: '═', v: '║', t: '╤', b: '╧'
   } : {
     tl: '┌', tr: '┐', bl: '└', br: '┘',
     h: '─', v: '│', t: '┬', b: '┴'
   };
   
   const result: string[] = [];
   
   // Top border
   if (title) {
     const titleStr = ` ${title} `;
     const leftPad = Math.floor((maxLength - titleStr.length) / 2);
     const rightPad = maxLength - titleStr.length - leftPad;
     
     result.push(
       chars.tl + 
       chars.h.repeat(leftPad) + 
       titleStr + 
       chars.h.repeat(rightPad) + 
       chars.tr
     );
   } else {
     result.push(chars.tl + chars.h.repeat(maxLength) + chars.tr);
   }
   
   // Content
   lines.forEach((line: string) => {
     const stripped = this.stripAnsi(line);
     const padding = maxLength - stripped.length;
     result.push(chars.v + line + ' '.repeat(padding) + chars.v);
   });
   
   // Bottom border
   result.push(chars.bl + chars.h.repeat(maxLength) + chars.br);
   
   return result.join('\n');
 }
 
 /**
  * Create separator line
  */
 private createSeparator(char: string = '─'): string {
   return char.repeat(this.terminalWidth);
 }
 
 /**
  * Center text
  */
 private center(text: string): string {
   const stripped = this.stripAnsi(text);
   const padding = Math.floor((this.terminalWidth - stripped.length) / 2);
   return ' '.repeat(padding) + text;
 }
 
 /**
  * Truncate text with ellipsis
  */
 private truncate(text: string, maxLength: number): string {
   if (text.length <= maxLength) {
     return text;
   }
   
   return text.substring(0, maxLength - 3) + '...';
 }
 
 /**
  * Strip ANSI codes from string
  */
 private stripAnsi(text: string): string {
   // Comprehensive ANSI escape code regex
   return text.replace(
     /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
     ''
   );
 }
 
 /**
  * Colorize text
  */
 private colorize(text: string, color: string, style?: string): string {
   if (!this.useColors) {
     return text;
   }
   
   let result = '';
   
   // Apply style
   if (style === 'bright') {
     result += this.ANSI.BRIGHT;
   } else if (style === 'dim') {
     result += this.ANSI.DIM;
   } else if (style === 'underscore') {
     result += this.ANSI.UNDERSCORE;
   }
   
   // Apply color
   switch (color) {
     case 'red':
       result += this.ANSI.FG_RED;
       break;
     case 'green':
       result += this.ANSI.FG_GREEN;
       break;
     case 'yellow':
       result += this.ANSI.FG_YELLOW;
       break;
     case 'blue':
       result += this.ANSI.FG_BLUE;
       break;
     case 'magenta':
       result += this.ANSI.FG_MAGENTA;
       break;
     case 'cyan':
       result += this.ANSI.FG_CYAN;
       break;
     case 'gray':
       result += this.ANSI.FG_GRAY;
       break;
     case 'brand':
       // Approximate #93186C
       result += '\x1b[38;2;147;24;108m';
       break;
     default:
       result += this.ANSI.FG_WHITE;
   }
   
   result += text + this.ANSI.RESET;
   
   return result;
 }
 
 /**
  * Format duration
  */
 private formatDuration(ms: number): string {
   if (ms < 1000) {
     return `${ms}ms`;
   }
   
   const seconds = Math.floor(ms / 1000);
   const minutes = Math.floor(seconds / 60);
   const hours = Math.floor(minutes / 60);
   
   if (hours > 0) {
     return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
   } else if (minutes > 0) {
     return `${minutes}m ${seconds % 60}s`;
   } else {
     return `${seconds}s`;
   }
 }
 
 /**
  * Calculate ETA
  */
 private calculateETA(progress: number, elapsed: string): string {
   // Log elapsed for debugging (elapsed is used for logging)
   if (this.options.debug) {
     console.debug(`Progress: ${Math.floor(progress * 100)}%, Elapsed: ${elapsed}`);
   }
   
   if (progress === 0) {
     return 'calculating...';
   }
   
   const elapsedMs = Date.now() - this.startTime;
   const totalMs = elapsedMs / progress;
   const remainingMs = totalMs - elapsedMs;
   
   if (remainingMs < 0) {
     return 'almost done';
   }
   
   return this.formatDuration(remainingMs);
 }
 
 /**
  * Get status symbol
  */
 private getStatusSymbol(status: TestStatus): string {
   switch (status) {
     case 'passed':
       return this.SYMBOLS.SUCCESS;
     case 'failed':
       return this.SYMBOLS.FAILURE;
     case 'skipped':
       return this.SYMBOLS.SKIPPED;
     case 'pending':
       return this.SYMBOLS.PENDING;
     default:
       return this.SYMBOLS.BULLET;
   }
 }
 
 /**
  * Get status color
  */
 private getStatusColor(status: TestStatus): string {
   switch (status) {
     case 'passed':
       return 'green';
     case 'failed':
       return 'red';
     case 'skipped':
       return 'yellow';
     case 'pending':
       return 'gray';
     default:
       return 'white';
   }
 }
 
 /**
  * Clear screen
  */
 private clearScreen(): void {
   if (this.isInteractive) {
     this.write(this.ANSI.ERASE_SCREEN + this.ANSI.CURSOR_POSITION);
   }
 }
 
 /**
  * Clear progress area
  */
 private clearProgressArea(lines: number): void {
   if (this.isInteractive) {
     // Use terminal dimensions to ensure we don't clear beyond screen
     const dims = this.getTerminalDimensions();
     const linesToClear = Math.min(lines, dims.height - 2);
     
     for (let i = 0; i < linesToClear; i++) {
       this.write(this.ANSI.CURSOR_UP + this.ANSI.ERASE_LINE);
     }
   }
 }
 
 /**
  * Move cursor up
  */
 private moveCursorUp(lines: number): void {
   if (this.isInteractive) {
     this.write(`\x1b[${lines}A`);
   }
 }
 
 /**
  * Hide cursor
  */
 private hideCursor(): void {
   if (this.isInteractive) {
     this.write(this.ANSI.HIDE_CURSOR);
   }
 }
 
 /**
  * Show cursor
  */
 private showCursor(): void {
   if (this.isInteractive) {
     this.write(this.ANSI.SHOW_CURSOR);
   }
 }
 
 /**
  * Write to stdout
  */
 private write(text: string): void {
   if (this.isBuffering) {
     this.outputBuffer.push(text);
   } else {
     if (!this.options.quiet || text.includes('Error')) {
       this.stdout.write(text);
     }
   }
 }
 
 /**
  * Write line to stdout
  */
 private writeLine(text: string = ''): void {
   this.lastLineLength = text.length;
   this.write(text + '\n');
 }
 
 /**
  * Setup signal handlers for cleanup
  */
 private setupSignalHandlers(): void {
   const cleanup = () => {
     this.stopProgressUpdates();
     this.showCursor();
     this.flushBuffers();
     process.exit(1);
   };
   
   process.on('SIGINT', cleanup);
   process.on('SIGTERM', cleanup);
   process.on('SIGHUP', cleanup);
 }

 /**
  * Start buffering output
  */
 public startBuffering(): void {
   this.isBuffering = true;
   this.outputBuffer = [];
   this.errorBuffer = [];
 }

 /**
  * Stop buffering and flush
  */
 public stopBuffering(): void {
   this.isBuffering = false;
   this.flushBuffers();
 }

 /**
  * Flush buffers to stdout
  */
 private flushBuffers(): void {
   // Flush output buffer
   if (this.outputBuffer.length > 0) {
     this.outputBuffer.forEach(text => {
       if (!this.options.quiet || text.includes('Error')) {
         this.stdout.write(text);
       }
     });
     this.outputBuffer = [];
   }

   // Flush error buffer
   if (this.errorBuffer.length > 0) {
     this.errorBuffer.forEach(text => {
       this.stderr.write(text + '\n');
     });
     this.errorBuffer = [];
   }
 }
 
 /**
  * Clear last line
  */
 private clearLastLine(): void {
   if (this.isInteractive && this.lastLineLength > 0) {
     this.write(this.ANSI.CURSOR_UP + this.ANSI.ERASE_LINE);
   }
 }
 
 /**
  * Get terminal dimensions
  */
 private getTerminalDimensions(): { width: number; height: number } {
   return {
     width: this.terminalWidth,
     height: this.terminalHeight
   };
 }

 /**
  * Start execution reporting
  */
 public startExecution(totalScenarios: number): void {
   this.totalScenarios = totalScenarios;
   this.startTime = Date.now();
   this.showHeader();
   if (this.isInteractive) {
     this.startSpinner();
   }
 }

 /**
  * End execution reporting
  */
 public endExecution(progress: any): void {
   // Use progress to show final stats
   if (progress && progress.completed) {
     this.completedScenarios = progress.completed;
   }
   
   if (this.spinnerInterval) {
     clearInterval(this.spinnerInterval);
     this.spinnerInterval = null;
   }
   this.showSummary({
     totalScenarios: this.totalScenarios,
     passed: this.passedSteps,
     failed: this.failedSteps,
     skipped: this.skippedSteps,
     pending: this.pendingSteps,
     duration: Date.now() - this.startTime,
     workers: []
   });
 }

 /**
  * Start feature reporting
  */
 public startFeature(feature: any): void {
   this.currentFeature = feature.name;
   if (!this.isInteractive) {
     this.write(`${this.color('cyan', '📦 Feature:')} ${feature.name}\n`);
   }
 }

 /**
  * End feature reporting
  */
 public endFeature(feature: any, status: string): void {
   if (!this.isInteractive) {
     const symbol = this.getStatusSymbol(status as any);
     this.write(`  ${symbol} Feature completed: ${feature.name}\n`);
   }
   this.completedFeatures++;
 }

 /**
  * Start scenario reporting
  */
 public startScenario(scenario: any): void {
   this.currentScenario = scenario.name;
   if (!this.isInteractive) {
     this.write(`  ${this.color('yellow', '📋 Scenario:')} ${scenario.name}\n`);
   }
 }

 /**
  * End scenario reporting
  */
 public endScenario(scenario: any, status: string): void {
   if (!this.isInteractive) {
     const symbol = this.getStatusSymbol(status as any);
     this.write(`    ${symbol} Scenario completed: ${scenario.name}\n`);
   }
   this.completedScenarios++;
 }

 /**
  * Start step reporting
  */
 public startStep(step: any): void {
   this.currentStep = `${step.keyword} ${step.text}`;
   if (!this.isInteractive && this.options.verbose) {
     this.write(`    ${this.color('gray', step.keyword)} ${step.text}\n`);
   }
 }

 /**
  * End step reporting
  */
 public endStep(step: any, status: string, error?: any): void {
   // Log step details
   if (this.options.debug) {
     console.debug(`Step completed: ${step.keyword} ${step.text} - ${status}`);
   }
   
   if (!this.isInteractive && this.options.verbose) {
     const symbol = this.getStatusSymbol(status as any);
     this.write(`      ${symbol} ${status}\n`);
   }
   this.completedSteps++;
   
   switch (status) {
     case 'passed':
       this.passedSteps++;
       break;
     case 'failed':
       this.failedSteps++;
       if (error && this.options.verbose) {
         this.writeError(error);
       }
       break;
     case 'skipped':
       this.skippedSteps++;
       break;
     case 'pending':
       this.pendingSteps++;
       break;
   }
   
   if (this.isInteractive) {
     this.updateProgress();
   }
 }

  /**
   * Helper method to get color
   */
  private color(color: string, text: string): string {
    return this.colorize(text, color);
  }

  /**
   * Start spinner animation
   */
  private startSpinner(): void {
    if (this.isInteractive && !this.spinnerInterval) {
      this.spinnerInterval = setInterval(() => {
        this.updateProgress();
      }, this.progressUpdateInterval);
    }
  }

  /**
   * Show summary
   */
  private showSummary(summary: any): void {
    // Use readline to create interactive line updates
    const rl = readline.createInterface({
      input: this.stdin,
      output: this.stdout
    });
    
    // Use os to get system info for the summary  
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem()
    };
    
    this.writeLine('');
    this.writeLine(this.createSeparator('='));
    this.writeLine(`Total Scenarios: ${summary.totalScenarios}`);
    this.writeLine(`Passed: ${summary.passed}`);
    this.writeLine(`Failed: ${summary.failed}`);
    this.writeLine(`Skipped: ${summary.skipped}`);
    this.writeLine(`Pending: ${summary.pending}`);
    this.writeLine(`Duration: ${this.formatDuration(summary.duration)}`);
    this.writeLine(`System: ${systemInfo.platform} ${systemInfo.arch} (${systemInfo.cpus} CPUs)`);
    this.writeLine(this.createSeparator('='));
    
    // Close readline interface
    rl.close();
  }
}

/**
* Worker state for parallel execution
*/
interface WorkerState {
 id: string;
 status: 'running' | 'completed' | 'failed';
 currentFeature: string;
 currentScenario: string;
 completedScenarios: number;
 totalScenarios: number;
 startTime: number;
 endTime?: number;
}