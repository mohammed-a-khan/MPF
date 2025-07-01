// src/core/debugging/DebugManager.ts

import { Page } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import { DateUtils } from '../utils/DateUtils';
import { ExecutionContext } from '../../bdd/context/ExecutionContext';
import * as path from 'path';
import * as readline from 'readline';

export class DebugManager {
    private static instance: DebugManager;
    private debugMode: boolean = false;
    private pauseOnNext: boolean = false;
    private breakpoints: Set<string> = new Set();
    private watchExpressions: Map<string, string> = new Map();
    private debugContext: DebugContext | null = null;
    private replInterface: readline.Interface | null = null;
    private stateSnapshots: StateSnapshot[] = [];
    private debugSession: DebugSession | null = null;
    private pausePromiseResolve: (() => void) | null = null;
    private logger: Logger;
    
    private readonly maxSnapshots = 50;
    private readonly debugOutputPath = path.join(process.cwd(), 'debug-output');
    
    private constructor() {
        this.logger = Logger.getInstance('DebugManager');
        this.initialize();
    }
    
    static getInstance(): DebugManager {
        if (!DebugManager.instance) {
            DebugManager.instance = new DebugManager();
        }
        return DebugManager.instance;
    }
    
    private async initialize(): Promise<void> {
        try {
            await FileUtils.ensureDir(this.debugOutputPath);
            
            this.setupProcessHandlers();
            
            this.logger.info('DebugManager initialized');
            
        } catch (error) {
            this.logger.error(`Failed to initialize DebugManager: ${(error as Error).message}`);
        }
    }
    
    enableDebugMode(): void {
        this.debugMode = true;
        this.debugSession = {
            id: this.generateSessionId(),
            startTime: new Date(),
            breakpointsHit: 0,
            stepsExecuted: 0,
            snapshotsTaken: 0
        };
        
        this.logger.info('🐞 Debug mode enabled');
        ActionLogger.logInfo('Debug mode enabled');
        
        this.printDebugCommands();
    }
    
    disableDebugMode(): void {
        this.debugMode = false;
        this.pauseOnNext = false;
        this.breakpoints.clear();
        this.watchExpressions.clear();
        
        if (this.debugSession) {
            this.debugSession.endTime = new Date();
            this.saveDebugSession();
        }
        
        this.logger.info('Debug mode disabled');
        ActionLogger.logInfo('Debug mode disabled');
    }
    
    isDebugMode(): boolean {
        return this.debugMode;
    }
    
    pauseOnNextStep(): void {
        if (!this.debugMode) {
            this.logger.warn('Debug mode is not enabled');
            return;
        }
        
        this.pauseOnNext = true;
        this.logger.info('⏸️  Will pause on next step');
    }
    
    async pauseNow(): Promise<void> {
        if (!this.debugMode) {
            this.logger.warn('Debug mode is not enabled');
            return;
        }
        
        this.logger.info('\n⏸️  Execution paused. Debug REPL active.');
        
        await this.enterDebugRepl();
    }
    
    setBreakpoint(stepPattern: string): void {
        this.breakpoints.add(stepPattern);
        this.logger.info(`🔴 Breakpoint set: ${stepPattern}`);
        ActionLogger.logInfo('Breakpoint set', { location: stepPattern });
    }
    
    removeBreakpoint(stepPattern: string): void {
        this.breakpoints.delete(stepPattern);
        this.logger.info(`⭕ Breakpoint removed: ${stepPattern}`);
        ActionLogger.logInfo('Breakpoint removed', { location: stepPattern });
    }
    
    clearBreakpoints(): void {
        this.breakpoints.clear();
        this.logger.info('All breakpoints cleared');
    }
    
    listBreakpoints(): string[] {
        return Array.from(this.breakpoints);
    }
    
    addWatchExpression(name: string, expression: string): void {
        this.watchExpressions.set(name, expression);
        this.logger.info(`👁️  Watch added: ${name} = ${expression}`);
    }
    
    removeWatchExpression(name: string): void {
        this.watchExpressions.delete(name);
        this.logger.info(`Watch removed: ${name}`);
    }
    
    async checkStepBreakpoint(stepText: string, context: ExecutionContext): Promise<void> {
        if (!this.debugMode) return;
        
        this.debugContext = {
            stepText,
            executionContext: context,
            timestamp: new Date()
        };
        
        if (this.debugSession) {
            this.debugSession.stepsExecuted++;
        }
        
        let shouldPause = this.pauseOnNext;
        
        for (const pattern of this.breakpoints) {
            if (this.matchesPattern(stepText, pattern)) {
                shouldPause = true;
                this.logger.info(`🔴 Breakpoint hit: ${pattern}`);
                
                if (this.debugSession) {
                    this.debugSession.breakpointsHit++;
                }
                break;
            }
        }
        
        if (shouldPause) {
            this.pauseOnNext = false;
            await this.pauseExecution(stepText, context);
        }
    }
    
    async takeDebugScreenshot(name: string, page?: Page): Promise<string> {
        try {
            const currentPage = page || await this.getCurrentPage();
            
            if (!currentPage) {
                throw new Error('No page available for screenshot');
            }
            
            const timestamp = DateUtils.toTimestamp(new Date());
            const fileName = `debug-${name}-${timestamp}.png`;
            const filePath = path.join(this.debugOutputPath, 'screenshots', fileName);
            
            await FileUtils.ensureDir(path.dirname(filePath));
            
            await currentPage.screenshot({
                fullPage: true,
                path: filePath
            });
            
            this.logger.info(`📸 Debug screenshot saved: ${fileName}`);
            ActionLogger.logScreenshot(filePath);
            
            if (this.debugSession) {
                this.debugSession.snapshotsTaken++;
            }
            
            return filePath;
            
        } catch (error) {
            this.logger.error(`Failed to take debug screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    async capturePageState(page: Page): Promise<PageState> {
        try {
            const [url, title, cookies, localStorage, sessionStorage, viewport] = await Promise.all([
                page.url(),
                page.title(),
                page.context().cookies(),
                this.captureLocalStorage(page),
                this.captureSessionStorage(page),
                page.viewportSize()
            ]);
            
            const domSnapshot = await page.evaluate(() => {
                const captureElement = (element: Element): any => {
                    const rect = element.getBoundingClientRect();
                    return {
                        tagName: element.tagName,
                        id: element.id,
                        className: element.className,
                        textContent: element.textContent?.substring(0, 100),
                        isVisible: rect.width > 0 && rect.height > 0,
                        position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                        attributes: Array.from(element.attributes).reduce((acc, attr) => {
                            acc[attr.name] = attr.value;
                            return acc;
                        }, {} as Record<string, string>)
                    };
                };
                
                const forms = Array.from(document.forms).map(captureElement);
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]')).map(captureElement);
                const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(captureElement);
                const links = Array.from(document.querySelectorAll('a')).map(captureElement);
                
                return {
                    forms,
                    buttons,
                    inputs,
                    links,
                    documentReadyState: document.readyState,
                    documentTitle: document.title
                };
            });
            
            const consoleLogs = await this.captureConsoleLogs(page);
            
            const networkActivity = await this.captureNetworkActivity(page);
            
            const state: PageState = {
                url,
                title,
                timestamp: new Date(),
                cookies,
                localStorage,
                sessionStorage,
                viewport,
                domSnapshot,
                consoleLogs,
                networkActivity,
                customData: {}
            };
            
            this.addStateSnapshot({
                id: this.generateSnapshotId(),
                timestamp: new Date(),
                stepText: this.debugContext?.stepText || 'Manual capture',
                pageState: state
            });
            
            this.logger.info('📋 Page state captured');
            
            return state;
            
        } catch (error) {
            this.logger.error(`Failed to capture page state: ${(error as Error).message}`);
            throw error;
        }
    }
    
    getDebugInfo(): DebugInfo {
        return {
            debugMode: this.debugMode,
            breakpoints: Array.from(this.breakpoints),
            watchExpressions: Object.fromEntries(this.watchExpressions),
            currentStep: this.debugContext?.stepText || null,
            stateSnapshots: this.stateSnapshots.length,
            session: this.debugSession
        };
    }
    
    async exportDebugSession(): Promise<string> {
        try {
            const sessionData = {
                session: this.debugSession,
                breakpointsHit: Array.from(this.breakpoints),
                stateSnapshots: this.stateSnapshots,
                debugInfo: this.getDebugInfo()
            };
            
            const fileName = `debug-session-${this.debugSession?.id || 'unknown'}.json`;
            const filePath = path.join(this.debugOutputPath, fileName);
            
            await FileUtils.writeJSON(filePath, sessionData);
            
            this.logger.info(`Debug session exported: ${fileName}`);
            
            return filePath;
            
        } catch (error) {
            this.logger.error(`Failed to export debug session: ${(error as Error).message}`);
            throw error;
        }
    }
    
    
    private async pauseExecution(stepText: string, context: ExecutionContext): Promise<void> {
        this.logger.info(`\n${'='.repeat(80)}`);
        this.logger.info(`⏸️  PAUSED at step: ${stepText}`);
        this.logger.info(`${'='.repeat(80)}\n`);
        
        await this.displayCurrentState(context);
        
        await this.evaluateWatchExpressions(context);
        
        await this.enterDebugRepl();
    }
    
    private async enterDebugRepl(): Promise<void> {
        return new Promise((resolve) => {
            this.pausePromiseResolve = resolve;
            
            if (this.replInterface) {
                this.replInterface.close();
            }
            
            this.replInterface = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: 'debug> ',
                completer: this.getCompleter()
            });
            
            this.logger.info('Debug REPL active. Type "help" for commands.\n');
            
            this.replInterface.prompt();
            
            this.replInterface.on('line', async (line) => {
                const trimmed = line.trim();
                
                if (trimmed.length === 0) {
                    this.replInterface!.prompt();
                    return;
                }
                
                try {
                    const shouldContinue = await this.handleDebugCommand(trimmed);
                    
                    if (shouldContinue) {
                        this.replInterface!.close();
                        this.replInterface = null;
                        
                        if (this.pausePromiseResolve) {
                            this.pausePromiseResolve();
                            this.pausePromiseResolve = null;
                        }
                    } else {
                        this.replInterface!.prompt();
                    }
                } catch (error) {
                    this.logger.error(`Debug command error: ${(error as Error).message}`);
                    this.replInterface!.prompt();
                }
            });
            
            this.replInterface.on('close', () => {
                if (this.pausePromiseResolve) {
                    this.pausePromiseResolve();
                    this.pausePromiseResolve = null;
                }
            });
        });
    }
    
    private async handleDebugCommand(command: string): Promise<boolean> {
        const parts = command.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() || '';
        const args = parts.slice(1);
        
        switch (cmd) {
            case 'help':
            case 'h':
                this.printDebugCommands();
                return false;
                
            case 'continue':
            case 'c':
                this.logger.info('▶️  Continuing execution...\n');
                return true;
                
            case 'next':
            case 'n':
                this.pauseOnNext = true;
                this.logger.info('⏭️  Will pause on next step\n');
                return true;
                
            case 'step':
            case 's':
                this.logger.info('Step into not yet implemented\n');
                return false;
                
            case 'breakpoint':
            case 'b':
                if (args.length === 0) {
                    this.printBreakpoints();
                } else {
                    this.setBreakpoint(args.join(' '));
                }
                return false;
                
            case 'delete':
            case 'd':
                if (args.length > 0) {
                    this.removeBreakpoint(args.join(' '));
                }
                return false;
                
            case 'watch':
            case 'w':
                if (args.length >= 2) {
                    const name = args[0] || '';
                    const expression = args.slice(1).join(' ');
                    this.addWatchExpression(name, expression);
                    await this.evaluateSingleWatch(name, expression);
                }
                return false;
                
            case 'unwatch':
                if (args.length > 0) {
                    this.removeWatchExpression(args[0] || '');
                }
                return false;
                
            case 'eval':
            case 'e':
                if (args.length > 0) {
                    await this.evaluateExpression(args.join(' '));
                }
                return false;
                
            case 'screenshot':
            case 'ss':
                const name = args[0] || 'debug';
                await this.takeDebugScreenshot(name);
                return false;
                
            case 'state':
                await this.displayCurrentState(this.debugContext?.executionContext);
                return false;
                
            case 'page':
                await this.displayPageInfo();
                return false;
                
            case 'elements':
                await this.displayElements(args[0]);
                return false;
                
            case 'network':
                await this.displayNetworkActivity();
                return false;
                
            case 'console':
                await this.displayConsoleLogs();
                return false;
                
            case 'cookies':
                await this.displayCookies();
                return false;
                
            case 'storage':
                await this.displayStorage();
                return false;
                
            case 'history':
                this.displayStateHistory();
                return false;
                
            case 'export':
                await this.exportDebugSession();
                return false;
                
            case 'exit':
            case 'quit':
            case 'q':
                this.disableDebugMode();
                process.exit(0);
                
            default:
                if (command.includes('=') || command.includes('.') || command.includes('(')) {
                    await this.evaluateExpression(command);
                } else {
                    this.logger.warn(`Unknown command: ${cmd}. Type "help" for commands.`);
                }
                return false;
        }
    }
    
    private async evaluateExpression(expression: string): Promise<void> {
        try {
            const page = await this.getCurrentPage();
            
            if (!page) {
                this.logger.warn('No page context available');
                return;
            }
            
            if (expression.startsWith('$') || expression.includes('document.')) {
                const result = await page.evaluate((expr) => {
                    try {
                        return eval(expr);
                    } catch (error) {
                        return `Error: ${(error as Error).message}`;
                    }
                }, expression);
                
                this.logger.info(`Result: ${JSON.stringify(result, null, 2)}`);
            } else {
                try {
                    const result = eval(expression);
                    this.logger.info(`Result: ${JSON.stringify(result, null, 2)}`);
                } catch (error) {
                    this.logger.error(`Evaluation error: ${(error as Error).message}`);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to evaluate expression: ${(error as Error).message}`);
        }
    }
    
    private async evaluateWatchExpressions(_context?: ExecutionContext): Promise<void> {
        if (this.watchExpressions.size === 0) return;
        
        this.logger.info('\n👁️  Watch Expressions:');
        this.logger.info('-'.repeat(50));
        
        for (const [name, expression] of this.watchExpressions) {
            await this.evaluateSingleWatch(name, expression);
        }
        
        this.logger.info('');
    }
    
    private async evaluateSingleWatch(name: string, expression: string): Promise<void> {
        try {
            const page = await this.getCurrentPage();
            
            if (!page) {
                this.logger.info(`${name}: <no page context>`);
                return;
            }
            
            const result = await page.evaluate((expr) => {
                try {
                    // @ts-ignore
                    return eval(expr);
                } catch (error) {
                    return `<error: ${(error as Error).message}>`;
                }
            }, expression);
            
            this.logger.info(`${name}: ${JSON.stringify(result)}`);
            
        } catch (error) {
            this.logger.info(`${name}: <error: ${(error as Error).message}`);
        }
    }
    
    private async displayCurrentState(context?: ExecutionContext): Promise<void> {
        if (!context) {
            this.logger.warn('No execution context available');
            return;
        }
        
        this.logger.info('📍 Current State:');
        this.logger.info(`  Step: ${this.debugContext?.stepText || 'Unknown'}`);
        this.logger.info(`  Page URL: ${(await this.getPageFromContext(context))?.url() || 'N/A'}`);
        this.logger.info(`  Scenario: ${(context as any).scenario?.name || 'N/A'}`);
        this.logger.info(`  Feature: ${(context as any).feature?.name || 'N/A'}`);
        
        if ((context as any).testData) {
            this.logger.info(`  Test Data: ${JSON.stringify((context as any).testData).substring(0, 100)}...`);
        }
        
        this.logger.info('');
    }
    
    private async displayPageInfo(): Promise<void> {
        const page = await this.getCurrentPage();
        
        if (!page) {
            this.logger.warn('No page available');
            return;
        }
        
        const [url, title, viewport] = await Promise.all([
            page.url(),
            page.title(),
            page.viewportSize()
        ]);
        
        this.logger.info('\n📄 Page Information:');
        this.logger.info(`  URL: ${url}`);
        this.logger.info(`  Title: ${title}`);
        this.logger.info(`  Viewport: ${viewport?.width}x${viewport?.height}`);
        
        const metrics = await page.evaluate(() => ({
            readyState: document.readyState,
            documentHeight: document.documentElement.scrollHeight,
            documentWidth: document.documentElement.scrollWidth,
            elementsCount: document.querySelectorAll('*').length,
            formsCount: document.forms.length,
            imagesCount: document.images.length,
            linksCount: document.links.length
        }));
        
        this.logger.info(`  Ready State: ${metrics.readyState}`);
        this.logger.info(`  Document Size: ${metrics.documentWidth}x${metrics.documentHeight}`);
        this.logger.info(`  Total Elements: ${metrics.elementsCount}`);
        this.logger.info(`  Forms: ${metrics.formsCount}, Images: ${metrics.imagesCount}, Links: ${metrics.linksCount}`);
        this.logger.info('');
    }
    
    private async displayElements(selector?: string): Promise<void> {
        const page = await this.getCurrentPage();
        
        if (!page) {
            this.logger.warn('No page available');
            return;
        }
        
        const selectorToUse = selector || '*';
        
        const elements = await page.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
            return Array.from(elements).slice(0, 20).map(el => {
                const rect = el.getBoundingClientRect();
                return {
                    tagName: el.tagName,
                    id: el.id,
                    className: el.className,
                    text: el.textContent?.substring(0, 50),
                    visible: rect.width > 0 && rect.height > 0,
                    position: `(${Math.round(rect.x)}, ${Math.round(rect.y)})`
                };
            });
        }, selectorToUse);
        
        this.logger.info(`\n🔍 Elements matching "${selectorToUse}":`);
        this.logger.info('-'.repeat(80));
        
        elements.forEach((el, index) => {
            const visibility = el.visible ? '✓' : '✗';
            this.logger.info(`${index + 1}. <${el.tagName}> ${el.id ? `#${el.id}` : ''} ${el.className ? `.${el.className.split(' ')[0]}` : ''}`);
            this.logger.info(`   Visible: ${visibility} | Position: ${el.position}`);
            if (el.text) {
                this.logger.info(`   Text: "${el.text}..."`);
            }
        });
        
        this.logger.info(`\nShowing ${elements.length} of total elements\n`);
    }
    
    private async displayNetworkActivity(): Promise<void> {
        const networkActivity = (this.debugContext?.executionContext as any)?.networkActivity || [];
        
        this.logger.info('\n🌐 Recent Network Activity:');
        this.logger.info('-'.repeat(80));
        
        const recent = networkActivity.slice(-10);
        
        if (recent.length === 0) {
            this.logger.info('No network activity recorded');
            return;
        }
        
        recent.forEach((req: any, index: number) => {
            this.logger.info(`${index + 1}. ${req.method} ${req.url}`);
            this.logger.info(`   Status: ${req.status} | Size: ${req.size} | Duration: ${req.duration}ms`);
        });
        
        this.logger.info('');
    }
    
    private async displayConsoleLogs(): Promise<void> {
        const page = await this.getCurrentPage();
        
        if (!page) {
            this.logger.warn('No page available');
            return;
        }
        
        const logs = await this.captureConsoleLogs(page);
        
        this.logger.info('\n📝 Console Logs:');
        this.logger.info('-'.repeat(80));
        
        if (logs.length === 0) {
            this.logger.info('No console logs');
            return;
        }
        
        logs.slice(-20).forEach((log) => {
            const icon = this.getLogIcon(log.level);
            this.logger.info(`${icon} [${log.level}] ${log.message}`);
            if (log.args.length > 0) {
                this.logger.info(`   Args: ${JSON.stringify(log.args)}`);
            }
        });
        
        this.logger.info('');
    }
    
    private async displayCookies(): Promise<void> {
        const page = await this.getCurrentPage();
        
        if (!page) {
            this.logger.warn('No page available');
            return;
        }
        
        const cookies = await page.context().cookies();
        
        this.logger.info('\n🍪 Cookies:');
        this.logger.info('-'.repeat(80));
        
        if (cookies.length === 0) {
            this.logger.info('No cookies');
            return;
        }
        
        cookies.forEach((cookie) => {
            this.logger.info(`${cookie.name}: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? '...' : ''}`);
            this.logger.info(`   Domain: ${cookie.domain} | Path: ${cookie.path} | Secure: ${cookie.secure} | HttpOnly: ${cookie.httpOnly}`);
        });
        
        this.logger.info('');
    }
    
    private async displayStorage(): Promise<void> {
        const page = await this.getCurrentPage();
        
        if (!page) {
            this.logger.warn('No page available');
            return;
        }
        
        const localStorage = await this.captureLocalStorage(page);
        const sessionStorage = await this.captureSessionStorage(page);
        
        this.logger.info('\n💾 Storage:');
        this.logger.info('-'.repeat(80));
        
        this.logger.info('LocalStorage:');
        if (Object.keys(localStorage).length === 0) {
            this.logger.info('  (empty)');
        } else {
            Object.entries(localStorage).forEach(([key, value]) => {
                this.logger.info(`  ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
            });
        }
        
        this.logger.info('\nSessionStorage:');
        if (Object.keys(sessionStorage).length === 0) {
            this.logger.info('  (empty)');
        } else {
            Object.entries(sessionStorage).forEach(([key, value]) => {
                this.logger.info(`  ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
            });
        }
        
        this.logger.info('');
    }
    
    private displayStateHistory(): void {
        this.logger.info('\n📚 State History:');
        this.logger.info('-'.repeat(80));
        
        if (this.stateSnapshots.length === 0) {
            this.logger.info('No state snapshots');
            return;
        }
        
        this.stateSnapshots.slice(-10).forEach((snapshot, index) => {
            const time = snapshot.timestamp.toLocaleTimeString();
            this.logger.info(`${index + 1}. [${time}] ${snapshot.stepText}`);
            this.logger.info(`   URL: ${snapshot.pageState.url}`);
        });
        
        this.logger.info(`\nTotal snapshots: ${this.stateSnapshots.length}\n`);
    }
    
    private printDebugCommands(): void {
        this.logger.info('\n🐞 Debug Commands:');
        this.logger.info('-'.repeat(80));
        this.logger.info('Execution Control:');
        this.logger.info('  continue (c)     - Continue execution');
        this.logger.info('  next (n)         - Pause on next step');
        this.logger.info('  exit (q)         - Exit debug mode and stop execution');
        this.logger.info('');
        this.logger.info('Breakpoints:');
        this.logger.info('  breakpoint <pattern> (b)  - Set breakpoint on step pattern');
        this.logger.info('  delete <pattern> (d)      - Remove breakpoint');
        this.logger.info('  breakpoint               - List all breakpoints');
        this.logger.info('');
        this.logger.info('Inspection:');
        this.logger.info('  eval <expression> (e)    - Evaluate expression');
        this.logger.info('  watch <name> <expr> (w)  - Add watch expression');
        this.logger.info('  unwatch <name>           - Remove watch expression');
        this.logger.info('  state                    - Display current state');
        this.logger.info('  page                     - Display page info');
        this.logger.info('  elements [selector]      - Display elements');
        this.logger.info('  network                  - Display network activity');
        this.logger.info('  console                  - Display console logs');
        this.logger.info('  cookies                  - Display cookies');
        this.logger.info('  storage                  - Display storage');
        this.logger.info('');
        this.logger.info('Actions:');
        this.logger.info('  screenshot [name] (ss)   - Take debug screenshot');
        this.logger.info('  history                  - Show state history');
        this.logger.info('  export                   - Export debug session');
        this.logger.info('  help (h)                 - Show this help');
        this.logger.info('-'.repeat(80));
        this.logger.info('');
    }
    
    private printBreakpoints(): void {
        const breakpoints = this.listBreakpoints();
        
        this.logger.info('\n🔴 Breakpoints:');
        if (breakpoints.length === 0) {
            this.logger.info('  No breakpoints set');
        } else {
            breakpoints.forEach((bp, index) => {
                this.logger.info(`  ${index + 1}. ${bp}`);
            });
        }
        this.logger.info('');
    }
    
    private matchesPattern(text: string, pattern: string): boolean {
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            const regex = new RegExp(pattern.slice(1, -1), 'i');
            return regex.test(text);
        } else {
            return text.toLowerCase().includes(pattern.toLowerCase());
        }
    }
    
    private async captureLocalStorage(page: Page): Promise<Record<string, string>> {
        try {
            return await page.evaluate(() => {
                const storage: Record<string, string> = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        storage[key] = localStorage.getItem(key) || '';
                    }
                }
                return storage;
            });
        } catch (error) {
            return {};
        }
    }
    
    private async captureSessionStorage(page: Page): Promise<Record<string, string>> {
        try {
            return await page.evaluate(() => {
                const storage: Record<string, string> = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key) {
                        storage[key] = sessionStorage.getItem(key) || '';
                    }
                }
                return storage;
            });
        } catch (error) {
            return {};
        }
    }
    
    private async captureConsoleLogs(_page: Page): Promise<ConsoleLog[]> {
        return [];
    }
    
    private async captureNetworkActivity(_page: Page): Promise<NetworkActivity[]> {
        return [];
    }
    
    private addStateSnapshot(snapshot: StateSnapshot): void {
        this.stateSnapshots.push(snapshot);
        
        if (this.stateSnapshots.length > this.maxSnapshots) {
            this.stateSnapshots.shift();
        }
    }
    
    private setupProcessHandlers(): void {
        process.on('SIGINT', async () => {
            if (this.debugMode) {
                this.logger.info('\n\nReceived SIGINT. Saving debug session...');
                await this.exportDebugSession();
                this.disableDebugMode();
            }
            process.exit(0);
        });
    }
    
    private getCompleter(): (line: string) => [string[], string] {
        const commands = [
            'continue', 'c', 'next', 'n', 'step', 's',
            'breakpoint', 'b', 'delete', 'd',
            'watch', 'w', 'unwatch', 'eval', 'e',
            'screenshot', 'ss', 'state', 'page',
            'elements', 'network', 'console', 'cookies',
            'storage', 'history', 'export', 'help', 'h',
            'exit', 'quit', 'q'
        ];
        
        return (line: string): [string[], string] => {
            const hits = commands.filter(cmd => cmd.startsWith(line));
            return [hits, line];
        };
    }
    
    private getLogIcon(level: string): string {
        switch (level.toLowerCase()) {
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            case 'debug': return '🔍';
            default: return '📝';
        }
    }
    
    private generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    private generateSnapshotId(): string {
        return `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
    
    private async saveDebugSession(): Promise<void> {
        try {
            await this.exportDebugSession();
        } catch (error) {
            this.logger.error(`Failed to save debug session: ${(error as Error).message}`);
        }
    }
    
    private async getCurrentPage(): Promise<Page | undefined> {
        const context = this.debugContext?.executionContext;
        if (!context) return undefined;
        
        if ('getPage' in context && typeof (context as any).getPage === 'function') {
            return await (context as any).getPage();
        }
        
        if ('page' in context) {
            return (context as any).page;
        }
        
        return undefined;
    }
    
    private async getPageFromContext(context: ExecutionContext): Promise<Page | undefined> {
        if ('getPage' in context && typeof (context as any).getPage === 'function') {
            return await (context as any).getPage();
        }
        
        if ('page' in context) {
            return (context as any).page;
        }
        
        return undefined;
    }

    async cleanup(): Promise<void> {
        try {
            this.logger.debug('Cleaning up debug manager...');
            
            if (this.debugSession) {
                this.debugSession.endTime = new Date();
                this.debugSession = null;
            }
            
            if (this.replInterface) {
                this.replInterface.close();
                this.replInterface = null;
            }
            
            this.debugMode = false;
            this.pauseOnNext = false;
            this.breakpoints.clear();
            this.watchExpressions.clear();
            this.stateSnapshots.length = 0;
            this.debugContext = null;
            this.pausePromiseResolve = null;
            
            this.logger.debug('Debug manager cleanup completed');
        } catch (error) {
            this.logger.error('Debug manager cleanup failed', error as Error);
        }
    }
}

interface DebugContext {
    stepText: string;
    executionContext?: ExecutionContext;
    timestamp: Date;
}

interface DebugSession {
    id: string;
    startTime: Date;
    endTime?: Date;
    breakpointsHit: number;
    stepsExecuted: number;
    snapshotsTaken: number;
}

interface PageState {
    url: string;
    title: string;
    timestamp: Date;
    cookies: any[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    viewport: { width: number; height: number } | null;
    domSnapshot: any;
    consoleLogs: ConsoleLog[];
    networkActivity: NetworkActivity[];
    customData: Record<string, any>;
}

interface StateSnapshot {
    id: string;
    timestamp: Date;
    stepText: string;
    pageState: PageState;
}

interface ConsoleLog {
    level: string;
    message: string;
    args: any[];
    timestamp: Date;
}

interface NetworkActivity {
    method: string;
    url: string;
    status: number;
    size: number;
    duration: number;
    timestamp: Date;
}

interface DebugInfo {
    debugMode: boolean;
    breakpoints: string[];
    watchExpressions: Record<string, string>;
    currentStep: string | null;
    stateSnapshots: number;
    session: DebugSession | null;
}

export { DebugContext, DebugSession, PageState, DebugInfo };
