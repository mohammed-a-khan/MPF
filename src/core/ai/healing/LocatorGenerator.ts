// src/core/ai/healing/LocatorGenerator.ts

import { ElementHandle } from 'playwright';
import { logger } from '../../utils/Logger';
import { ActionLogger } from '../../logging/ActionLogger';

export class LocatorGenerator {
    private static instance: LocatorGenerator;
    
    private readonly locatorPriorities = {
        id: 10,
        testId: 9,
        ariaLabel: 8,
        uniqueClass: 7,
        role: 6,
        text: 5,
        placeholder: 4,
        title: 3,
        xpath: 2,
        css: 1
    };
    
    private readonly attributePriorities = [
        'data-testid',
        'data-test',
        'data-qa',
        'data-automation-id',
        'aria-label',
        'role',
        'name',
        'type',
        'placeholder',
        'title',
        'alt'
    ];
    
    private constructor() {
    }
    
    static getInstance(): LocatorGenerator {
        if (!LocatorGenerator.instance) {
            LocatorGenerator.instance = new LocatorGenerator();
        }
        return LocatorGenerator.instance;
    }
    
    async generateLocator(element: ElementHandle | Element): Promise<string> {
        try {
            const locators = await this.generateMultipleLocators(element);
            
            if (locators.length === 0) {
                throw new Error('Could not generate any locators for element');
            }
            
            return locators[0] || '';
            
        } catch (error) {
            logger.error(`Failed to generate locator: ${(error as Error).message}`);
            throw error;
        }
    }
    
    async generateMultipleLocators(element: ElementHandle | Element): Promise<string[]> {
        const locators: LocatorCandidate[] = [];
        
        try {
            const info = await this.extractElementInfo(element);
            
            
            if (info.id) {
                locators.push({
                    selector: `#${this.escapeSelector(info.id)}`,
                    type: 'id',
                    score: this.calculateLocatorScore('id', info)
                });
            }
            
            for (const testIdAttr of ['data-testid', 'data-test', 'data-qa', 'data-automation-id']) {
                if (info.attributes[testIdAttr]) {
                    locators.push({
                        selector: `[${testIdAttr}="${this.escapeAttributeValue(info.attributes[testIdAttr])}"]`,
                        type: 'testId',
                        score: this.calculateLocatorScore('testId', info)
                    });
                }
            }
            
            if (info.attributes['aria-label']) {
                locators.push({
                    selector: `[aria-label="${this.escapeAttributeValue(info.attributes['aria-label'])}"]`,
                    type: 'ariaLabel',
                    score: this.calculateLocatorScore('ariaLabel', info)
                });
            }
            
            if (info.attributes['role']) {
                const roleSelector = this.generateRoleSelector(info);
                if (roleSelector) {
                    locators.push({
                        selector: roleSelector,
                        type: 'role',
                        score: this.calculateLocatorScore('role', info)
                    });
                }
            }
            
            if (info.text && info.text.length > 0 && info.text.length < 100) {
                const textSelector = this.generateTextSelector(info);
                if (textSelector) {
                    locators.push({
                        selector: textSelector,
                        type: 'text',
                        score: this.calculateLocatorScore('text', info)
                    });
                }
            }
            
            const attrSelector = this.generateAttributeSelector(info);
            if (attrSelector) {
                locators.push({
                    selector: attrSelector,
                    type: 'css',
                    score: this.calculateLocatorScore('css', info)
                });
            }
            
            if (info.classes.length > 0) {
                const classSelector = this.generateClassSelector(info);
                if (classSelector) {
                    locators.push({
                        selector: classSelector,
                        type: 'uniqueClass',
                        score: this.calculateLocatorScore('uniqueClass', info)
                    });
                }
            }
            
            const xpathSelector = await this.generateXPathSelector(element, info);
            if (xpathSelector) {
                locators.push({
                    selector: xpathSelector,
                    type: 'xpath',
                    score: this.calculateLocatorScore('xpath', info)
                });
            }
            
            const cssPath = await this.generateCSSPath(element, info);
            if (cssPath) {
                locators.push({
                    selector: cssPath,
                    type: 'css',
                    score: this.calculateLocatorScore('css', info) * 0.5
                });
            }
            
            const uniqueLocators = this.deduplicateLocators(locators);
            uniqueLocators.sort((a, b) => b.score - a.score);
            
            const validatedLocators: string[] = [];
            
            for (const locator of uniqueLocators) {
                const optimized = this.optimizeLocator(locator.selector);
                if (optimized && !validatedLocators.includes(optimized)) {
                    validatedLocators.push(optimized);
                }
            }
            
            ActionLogger.logInfo(`Generated ${validatedLocators.length} locators`, {
                primaryLocator: validatedLocators[0],
                totalLocators: validatedLocators.length,
                type: 'locator_generation'
            });
            
            return validatedLocators;
            
        } catch (error) {
            logger.error(`Failed to generate multiple locators: ${(error as Error).message}`);
            return [];
        }
    }
    
    async generateRobustLocator(element: ElementHandle | Element): Promise<RobustLocator> {
        try {
            const locators = await this.generateMultipleLocators(element);
            const info = await this.extractElementInfo(element);
            
            const scoredLocators = await Promise.all(
                locators.slice(0, 5).map(async (selector) => {
                    const score = await this.scoreLocatorStability(selector, info);
                    return { selector, score };
                })
            );
            
            scoredLocators.sort((a, b) => b.score - a.score);
            
            const robustLocator: RobustLocator = {
                primary: scoredLocators[0]?.selector || locators[0] || '',
                fallbacks: scoredLocators.slice(1).map(l => l.selector),
                metadata: {
                    tagName: info.tagName,
                    text: info.text,
                    attributes: info.attributes,
                    position: info.position
                },
                confidence: scoredLocators[0]?.score || 0.5
            };
            
            ActionLogger.logInfo('Generated robust locator', {
                primary: robustLocator.primary,
                fallbackCount: robustLocator.fallbacks.length,
                confidence: robustLocator.confidence,
                type: 'robust_locator_generation'
            });
            
            return robustLocator;
            
        } catch (error) {
            logger.error(`Failed to generate robust locator: ${(error as Error).message}`);
            throw error;
        }
    }
    
    async scoreLocatorStability(locator: string, elementInfo?: ElementInfo): Promise<number> {
        let score = 0.5;
        
        try {
            if (locator.startsWith('#')) {
                score = 0.95;
            } else if (locator.includes('data-testid') || locator.includes('data-test')) {
                score = 0.9;
            } else if (locator.includes('aria-label')) {
                score = 0.85;
            } else if (locator.includes('role=')) {
                score = 0.8;
            } else if (locator.includes(':text') || locator.includes('has-text')) {
                score = 0.6;
            } else if (locator.includes(':nth-child') || locator.includes(':nth-of-type')) {
                score = 0.4;
            } else if (locator.includes('>') && locator.split('>').length > 3) {
                score = 0.3;
            }
            
            const attributeCount = (locator.match(/\[/g) || []).length;
            if (attributeCount > 0) {
                score += Math.min(attributeCount * 0.05, 0.2);
            }
            
            if (locator.length > 100) {
                score *= 0.8;
            }
            
            if (elementInfo && elementInfo.classes.some(c => this.isGenericClass(c))) {
                score *= 0.9;
            }
            
            score = Math.max(0, Math.min(1, score));
            
            return score;
            
        } catch (error) {
            logger.error(`Failed to score locator stability: ${(error as Error).message}`);
            return 0.5;
        }
    }
    
    optimizeLocator(locator: string): string {
        try {
            let optimized = locator.trim();
            
            optimized = optimized.replace(/\s+/g, ' ');
            
            optimized = optimized.replace(/\s*>\s*/g, ' > ');
            optimized = optimized.replace(/\s*\+\s*/g, ' + ');
            optimized = optimized.replace(/\s*~\s*/g, ' ~ ');
            
            optimized = optimized.replace(/\[([^=]+)="([^"]*?)"\]/g, (match, attr, value) => {
                if (/^[a-zA-Z0-9_-]+$/.test(value)) {
                    return `[${attr}=${value}]`;
                }
                return match;
            });
            
            optimized = optimized.replace(/:nth-child\(1\)/g, ':first-child');
            optimized = optimized.replace(/:nth-last-child\(1\)/g, ':last-child');
            
            if (optimized.startsWith('body > ')) {
                optimized = optimized.substring(7);
            }
            
            if (optimized.includes(' > ') && optimized.split(' > ').length > 4) {
                const parts = optimized.split(' > ');
                const simplified: string[] = [];
                
                for (let i = parts.length - 1; i >= 0; i--) {
                    const part = parts[i];
                    if (part) {
                        simplified.unshift(part);
                        
                        if (part.includes('#') || part.includes('[data-')) {
                            break;
                        }
                        
                        if (simplified.length >= 3) {
                            break;
                        }
                    }
                }
                
                if (simplified.length < parts.length) {
                    optimized = simplified.join(' > ');
                }
            }
            
            return optimized;
            
        } catch (error) {
            logger.error(`Failed to optimize locator: ${(error as Error).message}`);
            return locator;
        }
    }
    
    
    private async extractElementInfo(element: ElementHandle | Element): Promise<ElementInfo> {
        if ('evaluate' in element) {
            return await element.evaluate(el => {
                const elem = el as Element;
                const rect = elem.getBoundingClientRect();
                const attributes: Record<string, string> = {};
                
                for (const attr of Array.from(elem.attributes)) {
                    attributes[attr.name] = attr.value;
                }
                
                return {
                    tagName: elem.tagName.toLowerCase(),
                    id: elem.id,
                    classes: Array.from(elem.classList),
                    attributes,
                    text: elem.textContent?.trim() || '',
                    value: (elem as any).value || '',
                    position: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    },
                    isVisible: rect.width > 0 && rect.height > 0,
                    parentTag: elem.parentElement?.tagName.toLowerCase() || null
                };
            });
        } else {
            const rect = element.getBoundingClientRect();
            const attributes: Record<string, string> = {};
            
            for (const attr of Array.from(element.attributes)) {
                attributes[attr.name] = attr.value;
            }
            
            return {
                tagName: element.tagName.toLowerCase(),
                id: element.id,
                classes: Array.from(element.classList),
                attributes,
                text: element.textContent?.trim() || '',
                value: (element as any).value || '',
                position: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                },
                isVisible: rect.width > 0 && rect.height > 0,
                parentTag: element.parentElement?.tagName.toLowerCase() || null
            };
        }
    }
    
    private calculateLocatorScore(type: string, info: ElementInfo): number {
        let baseScore = this.locatorPriorities[type as keyof typeof this.locatorPriorities] || 1;
        
        
        if (type === 'id' && info.id && !this.isGenericId(info.id)) {
            baseScore += 2;
        }
        
        if (['button', 'input', 'select', 'a', 'textarea'].includes(info.tagName)) {
            baseScore += 0.5;
        }
        
        if (type === 'uniqueClass' && info.classes.some(c => this.isGenericClass(c))) {
            baseScore -= 1;
        }
        
        if (info.attributes['name'] && ['input', 'select', 'textarea'].includes(info.tagName)) {
            baseScore += 1;
        }
        
        return Math.max(1, baseScore);
    }
    
    private generateRoleSelector(info: ElementInfo): string | null {
        const role = info.attributes['role'];
        if (!role) return null;
        
        let selector = `[role="${role}"]`;
        
        if (info.attributes['aria-label']) {
            selector = `:role("${role}")[name="${this.escapeAttributeValue(info.attributes['aria-label'])}"]`;
        } else if (info.text && info.text.length < 50) {
            selector = `:role("${role}")[name="${this.escapeAttributeValue(info.text)}"]`;
        }
        
        return selector;
    }
    
    private generateTextSelector(info: ElementInfo): string | null {
        if (!info.text || info.text.length === 0) return null;
        
        const text = info.text;
        
        if (text.length < 30) {
            return `:text("${this.escapeTextContent(text)}")`;
        }
        
        const words = text.split(/\s+/).slice(0, 5).join(' ');
        return `:has-text("${this.escapeTextContent(words)}")`;
    }
    
    private generateAttributeSelector(info: ElementInfo): string | null {
        const parts = [info.tagName];
        
        for (const attr of this.attributePriorities) {
            if (info.attributes[attr]) {
                const value = info.attributes[attr];
                if (value && value.length < 100) {
                    parts.push(`[${attr}="${this.escapeAttributeValue(value)}"]`);
                    if (parts.length >= 3) break;
                }
            }
        }
        
        if (parts.length === 1) return null;
        
        return parts.join('');
    }
    
    private generateClassSelector(info: ElementInfo): string | null {
        const semanticClasses = info.classes.filter(c => 
            !this.isGenericClass(c) && 
            c.length > 2 &&
            c.length < 50
        );
        
        if (semanticClasses.length === 0) return null;
        
        const selectedClasses = semanticClasses.slice(0, 2);
        
        return `${info.tagName}.${selectedClasses.join('.')}`;
    }
    
    private async generateXPathSelector(element: ElementHandle | Element, _info: ElementInfo): Promise<string | null> {
        try {
            if ('evaluate' in element) {
                return await element.evaluate(el => {
                    const getXPath = (element: Element): string => {
                        if (element.id) {
                            return `//*[@id="${element.id}"]`;
                        }
                        
                        const parts: string[] = [];
                        let current: Element | null = element;
                        
                        while (current && current !== document.body) {
                            let part = current.tagName.toLowerCase();
                            
                            if (current.parentElement) {
                                const siblings = Array.from(current.parentElement.children)
                                    .filter(s => s.tagName === current!.tagName);
                                
                                if (siblings.length > 1) {
                                    const index = siblings.indexOf(current) + 1;
                                    part += `[${index}]`;
                                }
                            }
                            
                            parts.unshift(part);
                            current = current.parentElement;
                        }
                        
                        return `//${parts.join('/')}`;
                    };
                    
                    return getXPath(el as Element);
                });
            }
            
            return null;
        } catch (error) {
            logger.debug(`Failed to generate XPath: ${(error as Error).message}`);
            return null;
        }
    }
    
    private async generateCSSPath(element: ElementHandle | Element, _info: ElementInfo): Promise<string | null> {
        try {
            if ('evaluate' in element) {
                return await element.evaluate(el => {
                    const getCSSPath = (element: Element): string => {
                        const path: string[] = [];
                        let current: Element | null = element;
                        
                        while (current && current !== document.body) {
                            let selector = current.tagName.toLowerCase();
                            
                            if (current.id) {
                                selector = `#${current.id}`;
                                path.unshift(selector);
                                break;
                            } else if (current.className) {
                                const classes = Array.from(current.classList)
                                    .filter(c => c.length > 0)
                                    .slice(0, 2);
                                if (classes.length > 0) {
                                    selector += `.${classes.join('.')}`;
                                }
                            }
                            
                            if (current.parentElement) {
                                const siblings = Array.from(current.parentElement.children);
                                if (siblings.length > 1) {
                                    const index = siblings.indexOf(current) + 1;
                                    selector += `:nth-child(${index})`;
                                }
                            }
                            
                            path.unshift(selector);
                            current = current.parentElement;
                        }
                        
                        return path.join(' > ');
                    };
                    
                    return getCSSPath(el as Element);
                });
            }
            
            return null;
        } catch (error) {
            logger.debug(`Failed to generate CSS path: ${(error as Error).message}`);
            return null;
        }
    }
    
    private isGenericClass(className: string): boolean {
        const genericPatterns = [
            /^js-/,
            /^is-/,
            /^has-/,
            /^state-/,
            /^active$/,
            /^selected$/,
            /^disabled$/,
            /^hidden$/,
            /^visible$/,
            /^open$/,
            /^closed$/,
            /^first$/,
            /^last$/,
            /^odd$/,
            /^even$/,
            /^col-/,
            /^row-/,
            /^grid-/,
            /^flex-/,
            /^text-/,
            /^bg-/,
            /^border-/,
            /^m-\d/,
            /^p-\d/,
            /^mt-/,
            /^mb-/,
            /^ml-/,
            /^mr-/,
            /^pt-/,
            /^pb-/,
            /^pl-/,
            /^pr-/
        ];
        
        return genericPatterns.some(pattern => pattern.test(className));
    }
    
    private isGenericId(id: string): boolean {
        const genericPatterns = [
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            /^[0-9]+$/,
            /^temp/i,
            /^auto/i,
            /^generated/i,
            /^dynamic/i,
            /^ember\d+/,
            /^react-/,
            /^vue-/,
            /^ng-/,
            /^ext-gen/,
            /^yui_/
        ];
        
        return genericPatterns.some(pattern => pattern.test(id));
    }
    
    private escapeSelector(value: string): string {
        return value.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    }
    
    private escapeAttributeValue(value: string): string {
        return value.replace(/"/g, '\\"');
    }
    
    private escapeTextContent(text: string): string {
        return text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    }
    
    private deduplicateLocators(locators: LocatorCandidate[]): LocatorCandidate[] {
        const seen = new Set<string>();
        const unique: LocatorCandidate[] = [];
        
        for (const locator of locators) {
            const normalized = locator.selector.toLowerCase().trim();
            if (!seen.has(normalized)) {
                seen.add(normalized);
                unique.push(locator);
            }
        }
        
        return unique;
    }
}

interface ElementInfo {
    tagName: string;
    id: string;
    classes: string[];
    attributes: Record<string, string>;
    text: string;
    value: string;
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    isVisible: boolean;
    parentTag: string | null;
}

interface LocatorCandidate {
    selector: string;
    type: string;
    score: number;
}

interface RobustLocator {
    primary: string;
    fallbacks: string[];
    metadata: {
        tagName: string;
        text?: string;
        attributes: Record<string, string>;
        position?: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    };
    confidence: number;
}

export { RobustLocator };
