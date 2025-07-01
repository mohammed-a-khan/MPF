// src/steps/ui/FrameSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { FrameHandler } from '../../core/pages/FrameHandler';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

export class FrameSteps extends CSBDDBaseStepDefinition {
    private frameHandler: FrameHandler | null = null;

    private getFrameHandler(): FrameHandler {
        if (!this.frameHandler) {
            this.frameHandler = new FrameHandler(this.page);
        }
        return this.frameHandler;
    }

    @CSBDDStepDef('user switches to frame {string}')
    @CSBDDStepDef('I switch to frame {string}')
    @CSBDDStepDef('user enters frame {string}')
    async switchToFrame(frameIdentifier: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('switch_to_frame', { frame: frameIdentifier });
        
        try {
            const handler = this.getFrameHandler();
            
            // Check if it's a number (frame index)
            const frameIndex = parseInt(frameIdentifier, 10);
            if (!isNaN(frameIndex)) {
                await handler.switchToFrame(frameIndex);
            } else {
                await handler.switchToFrame(frameIdentifier);
            }
            
            await actionLogger.logAction('frame_switched', { frame: frameIdentifier, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'switch_to_frame', frame: frameIdentifier });
            throw new Error(`Failed to switch to frame "${frameIdentifier}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user switches to parent frame')
    @CSBDDStepDef('I switch to parent frame')
    @CSBDDStepDef('user exits current frame')
    async switchToParentFrame(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('switch_to_parent_frame', {});
        
        try {
            const handler = this.getFrameHandler();
            await handler.switchToParentFrame();
            
            await actionLogger.logAction('parent_frame_switched', { success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'switch_to_parent_frame' });
            throw new Error(`Failed to switch to parent frame: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user switches to main frame')
    @CSBDDStepDef('I switch to main frame')
    @CSBDDStepDef('user returns to main content')
    async switchToMainFrame(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('switch_to_main_frame', {});
        
        try {
            const handler = this.getFrameHandler();
            await handler.switchToMainFrame();
            
            await actionLogger.logAction('main_frame_switched', { success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'switch_to_main_frame' });
            throw new Error(`Failed to switch to main frame: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user waits for frame {string} to load')
    @CSBDDStepDef('I wait for frame {string} to be ready')
    async waitForFrame(frameIdentifier: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('wait_for_frame', { frame: frameIdentifier });
        
        try {
            const handler = this.getFrameHandler();
            const timeout = ConfigurationManager.getInt('FRAME_LOAD_TIMEOUT', 30000);
            
            await handler.waitForFrame(frameIdentifier, { timeout });
            
            await actionLogger.logAction('frame_loaded', { frame: frameIdentifier, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'wait_for_frame', frame: frameIdentifier });
            throw new Error(`Frame "${frameIdentifier}" did not load within timeout: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('within frame {string}:')
    @CSBDDStepDef('inside frame {string}:')
    async executeWithinFrame(frameIdentifier: string): Promise<void> {
        // This step is handled by the BDD framework
        // It sets up context for subsequent steps to execute within the frame
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('execute_within_frame_context', { frame: frameIdentifier });
        
        try {
            await this.switchToFrame(frameIdentifier);
            
            // Store frame context for cleanup
            this.context.store('currentFrameContext', frameIdentifier);
            
            await actionLogger.logAction('frame_context_established', { frame: frameIdentifier, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'frame_context_setup', frame: frameIdentifier });
            throw error;
        }
    }

    @CSBDDStepDef('the page should have {int} frames')
    @CSBDDStepDef('there should be {int} frames on the page')
    async assertFrameCount(expectedCount: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('assert_frame_count', { expectedCount });
        
        try {
            const handler = this.getFrameHandler();
            const actualCount = handler.getFrameCount();
            
            if (actualCount !== expectedCount) {
                throw new Error(`Frame count mismatch. Expected: ${expectedCount}, Actual: ${actualCount}`);
            }
            
            await actionLogger.logAction('frame_count_assertion_passed', { 
                expectedCount,
                actualCount,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'assert_frame_count', expectedCount });
            throw error;
        }
    }

    @CSBDDStepDef('frame {string} should exist')
    @CSBDDStepDef('the frame {string} should be present')
    async assertFrameExists(frameIdentifier: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('assert_frame_exists', { frame: frameIdentifier });
        
        try {
            const handler = this.getFrameHandler();
            
            // Try to switch to frame to verify it exists
            await handler.executeInFrame(frameIdentifier, async () => {
                // Just being in the frame confirms it exists
                return true;
            });
            
            await actionLogger.logAction('frame_exists_confirmed', { frame: frameIdentifier, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'assert_frame_exists', frame: frameIdentifier });
            throw new Error(`Frame "${frameIdentifier}" does not exist: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user performs action in frame {string} and returns')
    @CSBDDStepDef('I temporarily switch to frame {string}')
    async executeInFrameTemporarily(frameIdentifier: string): Promise<void> {
        // This is a marker step that indicates the next action should be performed in a frame
        // then automatically return to the previous context
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setup_temporary_frame_context', { frame: frameIdentifier });
        
        this.context.store('temporaryFrameContext', frameIdentifier);
        
        await actionLogger.logAction('temporary_frame_context_set', { frame: frameIdentifier, success: true });
    }

    @CSBDDStepDef('the current frame URL should contain {string}')
    async assertFrameURLContains(expectedText: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('assert_frame_url_contains', { expectedText });
        
        try {
            const handler = this.getFrameHandler();
            const currentFrame = handler.getCurrentFrame();
            const url = currentFrame.url();
            
            if (!url.includes(expectedText)) {
                throw new Error(`Frame URL does not contain "${expectedText}". Actual: "${url}"`);
            }
            
            await actionLogger.logAction('frame_url_assertion_passed', { 
                expectedText,
                actualUrl: url,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'assert_frame_url', expectedText });
            throw error;
        }
    }

    @CSBDDStepDef('user switches to nested frame path {string}')
    @CSBDDStepDef('I navigate to nested frames {string}')
    async switchToNestedFrames(framePath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('switch_to_nested_frames', { path: framePath });
        
        try {
            const handler = this.getFrameHandler();
            const frames = framePath.split('>').map(f => f.trim());
            
            // Start from main frame
            await handler.switchToMainFrame();
            
            // Navigate through each frame in the path
            for (const frame of frames) {
                await handler.switchToFrame(frame);
                await actionLogger.logAction('entered_frame', { frame });
            }
            
            await actionLogger.logAction('navigated_to_nested_frames', { 
                path: framePath,
                depth: frames.length,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'nested_frame_navigation', path: framePath });
            throw new Error(`Failed to navigate nested frames "${framePath}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user prints frame tree')
    @CSBDDStepDef('I display the frame structure')
    async printFrameTree(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('print_frame_tree', {});
        
        try {
            const handler = this.getFrameHandler();
            const frameTree = handler.getFrameTree();
            
            const treeString = this.formatFrameTree(frameTree);
            
            await actionLogger.logAction('frame_tree_structure', { tree: treeString });
            
            // Store for potential assertions
            this.context.store('frameTree', frameTree);
            
            await actionLogger.logAction('frame_tree_printed', { success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'print_frame_tree' });
            throw new Error(`Failed to print frame tree: ${(error as Error).message}`);
        }
    }

    private formatFrameTree(tree: any, indent: string = ''): string {
        let result = `${indent}Frame: ${tree.name} (${tree.url})\n`;
        
        for (const child of tree.children) {
            result += this.formatFrameTree(child, indent + '  ');
        }
        
        return result;
    }

    // Cleanup method to be called after scenarios
    async cleanup(): Promise<void> {
        if (this.frameHandler) {
            try {
                await this.frameHandler.switchToMainFrame();
            } catch (error) {
                const actionLogger = ActionLogger.getInstance();
                await actionLogger.logAction('frame_cleanup_warning', { 
                    warning: 'Frame cleanup failed', 
                    error: (error as Error).message 
                });
            }
        }
    }
}