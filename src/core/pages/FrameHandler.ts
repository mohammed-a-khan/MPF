import { Page, Frame } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { FrameTree, FrameInfo, WaitOptions } from './types/page.types';

export class FrameHandler {
    private currentFrame: Frame | Page;
    private frameStack: Array<Frame | Page> = [];
    private page: Page;
    private frameCache: Map<string, Frame> = new Map();
    private frameCounter: number = 0;

    constructor(page: Page) {
        this.page = page;
        this.currentFrame = page;
    }

    async switchToFrame(identifier: string | number | Frame): Promise<Frame> {
        try {
            let frame: Frame | null = null;
            
            if (typeof identifier === 'object' && 'childFrames' in identifier) {
                frame = identifier as Frame;
            } else if (typeof identifier === 'number') {
                const frames = 'childFrames' in this.currentFrame ? this.currentFrame.childFrames() : this.page.frames();
                if (identifier >= 0 && identifier < frames.length) {
                    frame = frames[identifier] || null;
                }
            } else {
                frame = await this.findFrameByIdentifier(identifier.toString());
            }
            
            if (!frame) {
                throw new Error(`Frame '${identifier}' not found`);
            }
            
            if (frame.isDetached()) {
                throw new Error(`Frame '${identifier}' is detached`);
            }
            
            this.frameStack.push(this.currentFrame);
            this.currentFrame = frame;
            
            ActionLogger.logInfo('frame_switch', {
                identifier: identifier.toString(),
                depth: this.frameStack.length,
                url: frame.url()
            });
            
            return frame;
        } catch (error) {
            logger.error('FrameHandler: Failed to switch to frame', error as Error);
            throw error;
        }
    }

    async switchToParentFrame(): Promise<Frame | Page> {
        try {
            if (this.frameStack.length === 0) {
                throw new Error('Already at top level frame');
            }
            
            this.currentFrame = this.frameStack.pop()!;
            
            ActionLogger.logInfo('frame_switch_parent', {
                depth: this.frameStack.length,
                isMainFrame: this.currentFrame === this.page
            });
            
            return this.currentFrame;
        } catch (error) {
            logger.error('FrameHandler: Failed to switch to parent frame', error as Error);
            throw error;
        }
    }

    async switchToMainFrame(): Promise<Page> {
        try {
            this.frameStack = [];
            this.currentFrame = this.page;
            
            ActionLogger.logInfo('frame_switch_main', {
                previousDepth: this.frameStack.length
            });
            
            return this.page;
        } catch (error) {
            logger.error('FrameHandler: Failed to switch to main frame', error as Error);
            throw error;
        }
    }

    getCurrentFrame(): Frame | Page {
        return this.currentFrame;
    }

    getFrameCount(): number {
        return this.getAllFrames().length;
    }

    getAllFrames(): Frame[] {
        const frames: Frame[] = [];
        
        const collectFrames = (parent: Frame | Page) => {
            const childFrames = 'childFrames' in parent ? parent.childFrames() : this.page.frames().filter(f => f !== this.page.mainFrame());
            frames.push(...childFrames);
            
            childFrames.forEach((frame: Frame) => collectFrames(frame));
        };
        
        collectFrames(this.page);
        return frames;
    }

    getFrameTree(): FrameTree {
        return this.buildFrameTree(this.page);
    }

    async findFrameByUrl(urlPattern: string | RegExp): Promise<Frame | null> {
        const frames = this.getAllFrames();
        
        for (const frame of frames) {
            const url = frame.url();
            
            if (typeof urlPattern === 'string') {
                if (url.includes(urlPattern)) {
                    return frame;
                }
            } else {
                if (urlPattern.test(url)) {
                    return frame;
                }
            }
        }
        
        return null;
    }

    async findFrameByName(name: string): Promise<Frame | null> {
        if ('frame' in this.currentFrame) {
            return this.currentFrame.frame({ name });
        }
        const frames = this.page.frames();
        return frames.find(f => f.name() === name) || null;
    }

    async waitForFrame(
        selector: string, 
        options?: WaitOptions
    ): Promise<Frame> {
        try {
            const timeout = options?.timeout || 30000;
            const startTime = Date.now();
            
            await this.currentFrame.waitForSelector(selector, {
                timeout,
                state: 'attached'
            });
            
            let frame: Frame | null = null;
            
            while (!frame && Date.now() - startTime < timeout) {
                frame = await this.findFrameBySelector(selector);
                
                if (!frame) {
                    await this.page.waitForTimeout(100);
                }
            }
            
            if (!frame) {
                throw new Error(`Frame not found for selector: ${selector}`);
            }
            
            await frame.waitForLoadState('domcontentloaded');
            
            ActionLogger.logInfo('frame_wait', {
                selector,
                waitTime: Date.now() - startTime
            });
            
            return frame;
        } catch (error) {
            logger.error('FrameHandler: Failed to wait for frame', error as Error);
            throw error;
        }
    }

    async executeInFrame<T>(
        identifier: string | number | Frame,
        action: (frame: Frame) => Promise<T>
    ): Promise<T> {
        const previousFrame = this.currentFrame;
        const previousStack = [...this.frameStack];
        
        try {
            const frame = await this.switchToFrame(identifier);
            return await action(frame);
        } finally {
            this.currentFrame = previousFrame;
            this.frameStack = previousStack;
        }
    }

    async getFrameInfo(frame: Frame): Promise<FrameInfo> {
        const parentFrame = frame.parentFrame();
        
        return {
            url: frame.url(),
            name: await this.getFrameName(frame),
            isDetached: frame.isDetached(),
            childFrameCount: frame.childFrames().length,
            parentFrameName: parentFrame ? await this.getFrameName(parentFrame) : null,
            depth: this.getFrameDepth(frame)
        };
    }

    async navigateFrame(
        frame: Frame,
        url: string,
        options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
    ): Promise<void> {
        try {
            await frame.goto(url, {
                waitUntil: options?.waitUntil || 'load'
            });
            
            ActionLogger.logInfo('frame_navigate', {
                url,
                frameName: await this.getFrameName(frame)
            });
        } catch (error) {
            logger.error('FrameHandler: Failed to navigate frame', error as Error);
            throw error;
        }
    }

    async reloadFrame(frame: Frame): Promise<void> {
        try {
            const currentUrl = frame.url();
            await this.navigateFrame(frame, currentUrl);
            
            ActionLogger.logInfo('frame_reload', {
                url: currentUrl
            });
        } catch (error) {
            logger.error('FrameHandler: Failed to reload frame', error as Error);
            throw error;
        }
    }

    isInFrame(): boolean {
        return this.currentFrame !== this.page;
    }

    getFramePath(): string {
        if (!this.isInFrame()) {
            return '/';
        }
        
        const path: string[] = [];
        
        for (const frame of this.frameStack) {
            if (frame === this.page) {
                path.push('main');
            } else {
                path.push(this.getFrameIdentifier(frame as Frame));
            }
        }
        
        path.push(this.getFrameIdentifier(this.currentFrame as Frame));
        
        return path.join(' > ');
    }

    async findFramesBySelector(selector: string): Promise<Frame[]> {
        const frames: Frame[] = [];
        const allFrames = this.getAllFrames();
        
        for (const frame of allFrames) {
            try {
                const element = await frame.$(selector);
                if (element) {
                    const contentFrame = await element.contentFrame();
                    if (contentFrame) {
                        frames.push(contentFrame);
                    }
                }
            } catch {
            }
        }
        
        return frames;
    }

    monitorFrameChanges(
        callback: (event: { type: 'added' | 'removed'; frame: Frame }) => void
    ): () => void {
        const frameAddedHandler = (frame: Frame) => {
            callback({ type: 'added', frame });
        };
        
        const frameDetachedHandler = (frame: Frame) => {
            callback({ type: 'removed', frame });
        };
        
        this.page.on('frameattached', frameAddedHandler);
        this.page.on('framedetached', frameDetachedHandler);
        
        return () => {
            this.page.off('frameattached', frameAddedHandler);
            this.page.off('framedetached', frameDetachedHandler);
        };
    }


    private async findFrameByIdentifier(identifier: string): Promise<Frame | null> {
        let frame: Frame | null = null;
        
        if ('frame' in this.currentFrame) {
            frame = this.currentFrame.frame({ name: identifier });
            if (frame) return frame;
            
            frame = this.currentFrame.frame({ url: identifier });
        } else {
            const frames = this.page.frames();
            frame = frames.find(f => f.name() === identifier || f.url() === identifier) || null;
        }
        if (frame) return frame;
        
        frame = await this.findFrameBySelector(identifier);
        if (frame) return frame;
        
        frame = this.frameCache.get(identifier) || null;
        if (frame && !frame.isDetached()) return frame;
        
        return null;
    }

    private async findFrameBySelector(selector: string): Promise<Frame | null> {
        try {
            const elementHandle = await this.currentFrame.$(selector);
            if (!elementHandle) return null;
            
            const frame = await elementHandle.contentFrame();
            
            if (frame) {
                const cacheKey = `selector_${selector}_${++this.frameCounter}`;
                this.frameCache.set(cacheKey, frame);
            }
            
            return frame;
        } catch {
            return null;
        }
    }

    private buildFrameTree(frame: Frame | Page): FrameTree {
        const children = ('childFrames' in frame ? frame.childFrames() : this.page.frames().filter(f => f !== this.page.mainFrame())).map((child: Frame) => this.buildFrameTree(child));
        
        return {
            url: frame.url(),
            name: frame === this.page ? 'main' : this.getFrameIdentifier(frame as Frame),
            children,
            isDetached: frame === this.page ? false : (frame as Frame).isDetached()
        };
    }

    private getFrameIdentifier(frame: Frame): string {
        const name = frame.name();
        if (name) return name;
        
        const url = frame.url();
        if (url && url !== 'about:blank') {
            return url.split('/').pop() || url;
        }
        
        const parent = frame.parentFrame() || this.page;
        const childFrames = 'childFrames' in parent ? parent.childFrames() : this.page.frames();
        const index = childFrames.indexOf(frame);
        return `frame[${index}]`;
    }

    private async getFrameName(frame: Frame | Page): Promise<string> {
        if (frame === this.page) {
            return 'main';
        }
        
        return (frame as Frame).name() || this.getFrameIdentifier(frame as Frame);
    }

    private getFrameDepth(frame: Frame): number {
        let depth = 0;
        let current: Frame | null = frame;
        
        while (current) {
            if ('parentFrame' in current) {
                const parent = current.parentFrame();
                if (!parent || parent === this.page.mainFrame()) {
                    break;
                }
                depth++;
                current = parent;
            } else {
                break;
            }
        }
        
        return depth;
    }
}
