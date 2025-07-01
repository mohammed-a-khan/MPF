import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { CSBasePage } from './CSBasePage';
import { PageRegistration, PageRegistryStats } from './types/page.types';

export class PageRegistry {
    private static registry: Map<string, PageRegistration> = new Map();
    private static aliases: Map<string, string> = new Map();
    private static tags: Map<string, Set<string>> = new Map();

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

        const registration: PageRegistration = {
            name,
            pageClass,
            description: options?.description || '',
            tags: options?.tags || [],
            url: options?.url || '',
            registeredAt: new Date()
        };

        this.registry.set(name, registration);

        if (options?.aliases) {
            options.aliases.forEach(alias => {
                if (this.aliases.has(alias)) {
                    throw new Error(`Alias '${alias}' is already in use`);
                }
                this.aliases.set(alias, name);
            });
        }

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

    static get(name: string): typeof CSBasePage {
        let registration = this.registry.get(name);

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

    static has(name: string): boolean {
        return this.registry.has(name) || this.aliases.has(name);
    }

    static getAll(): Map<string, PageRegistration> {
        return new Map(this.registry);
    }

    static getByTag(tag: string): PageRegistration[] {
        const pageNames = this.tags.get(tag);
        if (!pageNames) {
            return [];
        }

        return Array.from(pageNames)
            .map(name => this.registry.get(name))
            .filter(reg => reg !== undefined) as PageRegistration[];
    }

    static getByTags(tags: string[]): PageRegistration[] {
        if (tags.length === 0) {
            return Array.from(this.registry.values());
        }

        return Array.from(this.registry.values()).filter(registration => 
            tags.every(tag => registration.tags.includes(tag))
        );
    }

    static search(query: string): PageRegistration[] {
        const lowerQuery = query.toLowerCase();
        
        return Array.from(this.registry.values()).filter(registration => 
            registration.name.toLowerCase().includes(lowerQuery) ||
            registration.description.toLowerCase().includes(lowerQuery) ||
            registration.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    static unregister(name: string): boolean {
        const registration = this.registry.get(name);
        if (!registration) {
            return false;
        }

        this.registry.delete(name);

        const aliasesToRemove: string[] = [];
        this.aliases.forEach((targetName, alias) => {
            if (targetName === name) {
                aliasesToRemove.push(alias);
            }
        });
        aliasesToRemove.forEach(alias => this.aliases.delete(alias));

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

    static clear(): void {
        const count = this.registry.size;
        
        this.registry.clear();
        this.aliases.clear();
        this.tags.clear();

        ActionLogger.logInfo('page_registry_clear', { count });
    }

    static getStats(): PageRegistryStats {
        const stats: PageRegistryStats = {
            totalPages: this.registry.size,
            totalAliases: this.aliases.size,
            totalTags: this.tags.size,
            pagesByTag: {},
            registrationTimeline: []
        };

        this.tags.forEach((pages, tag) => {
            stats.pagesByTag[tag] = pages.size;
        });

        stats.registrationTimeline = Array.from(this.registry.values())
            .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())
            .map(reg => ({
                name: reg.name,
                registeredAt: reg.registeredAt
            }));

        return stats;
    }

    static getAvailablePages(): string[] {
        const names = Array.from(this.registry.keys());
        const aliasNames = Array.from(this.aliases.keys());
        return [...new Set([...names, ...aliasNames])].sort();
    }

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

    static import(_data: any): void {
        logger.info('PageRegistry: Import function is for documentation only');
    }

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

            try {
                PageRegistry.register(name, target, registerOptions);
            } catch (error) {
                logger.error(`PageRegistry: Failed to auto-register ${name}`, error as Error);
                throw error;
            }
        };
    }

    static generateDocumentation(): string {
        const docs: string[] = ['# Registered Page Objects\n'];
        
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
            
            const aliases = Array.from(this.aliases.entries())
                .filter(([, target]) => target === name)
                .map(([alias]) => alias);
            
            if (aliases.length > 0) {
                docs.push(`- **Aliases**: ${aliases.map(a => `\`${a}\``).join(', ')}`);
            }
            
            docs.push(`- **Registered**: ${registration.registeredAt.toISOString()}\n`);
        });
        
        docs.push('## Summary\n');
        docs.push(`- **Total Pages**: ${this.registry.size}`);
        docs.push(`- **Total Aliases**: ${this.aliases.size}`);
        docs.push(`- **Total Tags**: ${this.tags.size}`);
        
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

    static async validateAll(): Promise<Map<string, string[]>> {
        const validationResults = new Map<string, string[]>();
        
        for (const [name, registration] of this.registry) {
            const errors: string[] = [];
            
            if (!(registration.pageClass.prototype instanceof CSBasePage)) {
                errors.push('Does not extend CSBasePage');
            }
            
            
            const proto = registration.pageClass.prototype;
            
            if (typeof proto.initialize !== 'function') {
                errors.push('Missing initialize method');
            }
            
            if (typeof proto.navigateTo !== 'function') {
                errors.push('Missing navigateTo method');
            }
            
            if (errors.length > 0) {
                validationResults.set(name, errors);
            }
        }
        
        return validationResults;
    }

    static findByUrl(urlPattern: string | RegExp): PageRegistration[] {
        const pattern = typeof urlPattern === 'string' 
            ? new RegExp(urlPattern) 
            : urlPattern;
        
        return Array.from(this.registry.values()).filter(registration => 
            registration.url && pattern.test(registration.url)
        );
    }

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

    static getDependencyGraph(): Map<string, string[]> {
        const dependencies = new Map<string, string[]>();
        
        this.registry.forEach((_registration, name) => {
            dependencies.set(name, []);
        });
        
        return dependencies;
    }
}
