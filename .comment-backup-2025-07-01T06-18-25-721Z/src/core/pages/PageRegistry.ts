import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { CSBasePage } from './CSBasePage';
import { PageRegistration, PageRegistryStats } from './types/page.types';

/**
 * PageRegistry - Central registry for all page objects
 * Enables dynamic page creation and discovery
 */
export class PageRegistry {
    private static registry: Map<string, PageRegistration> = new Map();
    private static aliases: Map<string, string> = new Map();
    private static tags: Map<string, Set<string>> = new Map();

    /**
     * Register a page class
     */
    static register(
        name: string, 
        pageClass: typeof CSBasePage,
        options?: {
            description?: string;
            tags?: string[];
            aliases?: string[];
            url?: string;
        }
    ): void {
        if (this.registry.has(name)) {
            throw new Error(`Page '${name}' is already registered`);
        }

        // Register the page
        const registration: PageRegistration = {
            name,
            pageClass,
            description: options?.description || '',
            tags: options?.tags || [],
            url: options?.url || '',
            registeredAt: new Date()
        };

        this.registry.set(name, registration);

        // Register aliases
        if (options?.aliases) {
            options.aliases.forEach(alias => {
                if (this.aliases.has(alias)) {
                    throw new Error(`Alias '${alias}' is already in use`);
                }
                this.aliases.set(alias, name);
            });
        }

        // Register tags
        if (options?.tags) {
            options.tags.forEach(tag => {
                if (!this.tags.has(tag)) {
                    this.tags.set(tag, new Set());
                }
                this.tags.get(tag)!.add(name);
            });
        }

        ActionLogger.logPageOperation('page_registry_register', name, {
            aliases: options?.aliases?.length || 0,
            tags: options?.tags?.length || 0
        });
    }

    /**
     * Get a page class by name or alias
     */
    static get(name: string): typeof CSBasePage {
        // Check direct registration
        let registration = this.registry.get(name);

        // Check aliases if not found
        if (!registration) {
            const actualName = this.aliases.get(name);
            if (actualName) {
                registration = this.registry.get(actualName);
            }
        }

        if (!registration) {
            const available = this.getAvailablePages();
            throw new Error(
                `Page '${name}' not found in registry. ` +
                `Available pages: ${available.join(', ')}`
            );
        }

        return registration.pageClass;
    }

    /**
     * Check if a page is registered
     */
    static has(name: string): boolean {
        return this.registry.has(name) || this.aliases.has(name);
    }

    /**
     * Get all registered pages
     */
    static getAll(): Map<string, PageRegistration> {
        return new Map(this.registry);
    }

    /**
     * Get pages by tag
     */
    static getByTag(tag: string): PageRegistration[] {
        const pageNames = this.tags.get(tag);
        if (!pageNames) {
            return [];
        }

        return Array.from(pageNames)
            .map(name => this.registry.get(name))
            .filter(reg => reg !== undefined) as PageRegistration[];
    }

    /**
     * Get pages by multiple tags (AND operation)
     */
    static getByTags(tags: string[]): PageRegistration[] {
        if (tags.length === 0) {
            return Array.from(this.registry.values());
        }

        return Array.from(this.registry.values()).filter(registration => 
            tags.every(tag => registration.tags.includes(tag))
        );
    }

    /**
     * Search pages by name or description
     */
    static search(query: string): PageRegistration[] {
        const lowerQuery = query.toLowerCase();
        
        return Array.from(this.registry.values()).filter(registration => 
            registration.name.toLowerCase().includes(lowerQuery) ||
            registration.description.toLowerCase().includes(lowerQuery) ||
            registration.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Unregister a page
     */
    static unregister(name: string): boolean {
        const registration = this.registry.get(name);
        if (!registration) {
            return false;
        }

        // Remove from registry
        this.registry.delete(name);

        // Remove aliases
        const aliasesToRemove: string[] = [];
        this.aliases.forEach((targetName, alias) => {
            if (targetName === name) {
                aliasesToRemove.push(alias);
            }
        });
        aliasesToRemove.forEach(alias => this.aliases.delete(alias));

        // Remove from tags
        registration.tags.forEach(tag => {
            const tagSet = this.tags.get(tag);
            if (tagSet) {
                tagSet.delete(name);
                if (tagSet.size === 0) {
                    this.tags.delete(tag);
                }
            }
        });

        ActionLogger.logInfo('page_registry_unregister', { name });
        return true;
    }

    /**
     * Clear the registry
     */
    static clear(): void {
        const count = this.registry.size;
        
        this.registry.clear();
        this.aliases.clear();
        this.tags.clear();

        ActionLogger.logInfo('page_registry_clear', { count });
    }

    /**
     * Get registry statistics
     */
    static getStats(): PageRegistryStats {
        const stats: PageRegistryStats = {
            totalPages: this.registry.size,
            totalAliases: this.aliases.size,
            totalTags: this.tags.size,
            pagesByTag: {},
            registrationTimeline: []
        };

        // Count pages by tag
        this.tags.forEach((pages, tag) => {
            stats.pagesByTag[tag] = pages.size;
        });

        // Create registration timeline
        stats.registrationTimeline = Array.from(this.registry.values())
            .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())
            .map(reg => ({
                name: reg.name,
                registeredAt: reg.registeredAt
            }));

        return stats;
    }

    /**
     * Get available page names
     */
    static getAvailablePages(): string[] {
        const names = Array.from(this.registry.keys());
        const aliasNames = Array.from(this.aliases.keys());
        return [...new Set([...names, ...aliasNames])].sort();
    }

    /**
     * Export registry data
     */
    static export(): any {
        const data = {
            pages: Array.from(this.registry.entries()).map(([name, reg]) => ({
                name,
                description: reg.description,
                tags: reg.tags,
                url: reg.url,
                className: reg.pageClass.name,
                registeredAt: reg.registeredAt
            })),
            aliases: Object.fromEntries(this.aliases),
            tags: Object.fromEntries(
                Array.from(this.tags.entries()).map(([tag, pages]) => [tag, Array.from(pages)])
            )
        };

        return data;
    }

    /**
     * Import registry data (for documentation/reporting)
     */
    static import(_data: any): void {
        // This would typically be used for documentation generation
        // Not for actual page registration
        logger.info('PageRegistry: Import function is for documentation only');
    }

    /**
     * Decorator for auto-registration
     */
    static Page(options?: string | {
        name?: string;
        description?: string;
        tags?: string[];
        aliases?: string[];
        url?: string;
    }) {
        return function(target: typeof CSBasePage) {
            let name: string;
            let registerOptions: any = {};

            if (typeof options === 'string') {
                name = options;
            } else if (options?.name) {
                name = options.name;
                registerOptions = options;
            } else {
                name = target.name;
                registerOptions = options || {};
            }

            // Auto-register on decoration
            try {
                PageRegistry.register(name, target, registerOptions);
            } catch (error) {
                logger.error(`PageRegistry: Failed to auto-register ${name}`, error as Error);
                throw error;
            }
        };
    }

    /**
     * Generate documentation for all pages
     */
    static generateDocumentation(): string {
        const docs: string[] = ['# Registered Page Objects\n'];
        
        // Sort pages by name
        const sortedPages = Array.from(this.registry.entries())
            .sort(([a], [b]) => a.localeCompare(b));
        
        sortedPages.forEach(([name, registration]) => {
            docs.push(`## ${name}`);
            
            if (registration.description) {
                docs.push(`${registration.description}\n`);
            }
            
            docs.push(`- **Class**: \`${registration.pageClass.name}\``);
            
            if (registration.url) {
                docs.push(`- **URL**: \`${registration.url}\``);
            }
            
            if (registration.tags.length > 0) {
                docs.push(`- **Tags**: ${registration.tags.map(t => `\`${t}\``).join(', ')}`);
            }
            
            // Check for aliases
            const aliases = Array.from(this.aliases.entries())
                .filter(([, target]) => target === name)
                .map(([alias]) => alias);
            
            if (aliases.length > 0) {
                docs.push(`- **Aliases**: ${aliases.map(a => `\`${a}\``).join(', ')}`);
            }
            
            docs.push(`- **Registered**: ${registration.registeredAt.toISOString()}\n`);
        });
        
        // Add summary
        docs.push('## Summary\n');
        docs.push(`- **Total Pages**: ${this.registry.size}`);
        docs.push(`- **Total Aliases**: ${this.aliases.size}`);
        docs.push(`- **Total Tags**: ${this.tags.size}`);
        
        // Tags breakdown
        if (this.tags.size > 0) {
            docs.push('\n### Tags Breakdown\n');
            Array.from(this.tags.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .forEach(([tag, pages]) => {
                    docs.push(`- **${tag}**: ${pages.size} pages`);
                });
        }
        
        return docs.join('\n');
    }

    /**
     * Validate all registered pages
     */
    static async validateAll(): Promise<Map<string, string[]>> {
        const validationResults = new Map<string, string[]>();
        
        for (const [name, registration] of this.registry) {
            const errors: string[] = [];
            
            // Check if class extends CSBasePage
            if (!(registration.pageClass.prototype instanceof CSBasePage)) {
                errors.push('Does not extend CSBasePage');
            }
            
            // Check that the class has the expected structure
            // Since pageUrl and waitForPageLoad are protected abstract members,
            // we can't check them directly. Instead, we verify the class extends CSBasePage
            // which enforces these requirements at compile time.
            
            // Check if the class has required public methods
            const proto = registration.pageClass.prototype;
            
            // Check for initialize method (public)
            if (typeof proto.initialize !== 'function') {
                errors.push('Missing initialize method');
            }
            
            // Check for other expected public methods
            if (typeof proto.navigateTo !== 'function') {
                errors.push('Missing navigateTo method');
            }
            
            if (errors.length > 0) {
                validationResults.set(name, errors);
            }
        }
        
        return validationResults;
    }

    /**
     * Find pages by URL pattern
     */
    static findByUrl(urlPattern: string | RegExp): PageRegistration[] {
        const pattern = typeof urlPattern === 'string' 
            ? new RegExp(urlPattern) 
            : urlPattern;
        
        return Array.from(this.registry.values()).filter(registration => 
            registration.url && pattern.test(registration.url)
        );
    }

    /**
     * Group pages by tags
     */
    static groupByTags(): Map<string, PageRegistration[]> {
        const grouped = new Map<string, PageRegistration[]>();
        
        this.tags.forEach((pageNames, tag) => {
            const pages = Array.from(pageNames)
                .map(name => this.registry.get(name))
                .filter(reg => reg !== undefined) as PageRegistration[];
            
            grouped.set(tag, pages);
        });
        
        return grouped;
    }

    /**
     * Get page dependency graph (based on references)
     */
    static getDependencyGraph(): Map<string, string[]> {
        const dependencies = new Map<string, string[]>();
        
        // This would analyze page classes for references to other pages
        // Simplified implementation for now
        this.registry.forEach((_registration, name) => {
            dependencies.set(name, []);
        });
        
        return dependencies;
    }
}