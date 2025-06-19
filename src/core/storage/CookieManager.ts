import { BrowserContext } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { Cookie, CookieFilter } from './types/storage.types';

/**
 * CookieManager - Complete cookie management
 * Handles all cookie operations with validation and security
 */
export class CookieManager {
    /**
     * Set a single cookie
     */
    async setCookie(context: BrowserContext, cookie: Cookie): Promise<void> {
        try {
            // Validate cookie
            this.validateCookie(cookie);
            
            // Apply defaults
            const cookieToSet = this.applyCookieDefaults(cookie);
            
            await context.addCookies([cookieToSet]);
            
            ActionLogger.logInfo('Storage operation: cookie_set', {
                operation: 'cookie_set',
                name: cookie.name,
                domain: cookie.domain,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite
            });
        } catch (error) {
            logger.error('CookieManager: Failed to set cookie', error as Error);
            throw error;
        }
    }

    /**
     * Set multiple cookies
     */
    async setCookies(context: BrowserContext, cookies: Cookie[]): Promise<void> {
        try {
            // Validate all cookies
            cookies.forEach(cookie => this.validateCookie(cookie));
            
            // Apply defaults to all
            const cookiesToSet = cookies.map(cookie => this.applyCookieDefaults(cookie));
            
            await context.addCookies(cookiesToSet);
            
            ActionLogger.logInfo('Storage operation: cookies_set', {
                operation: 'cookies_set',
                count: cookies.length
            });
        } catch (error) {
            logger.error('CookieManager: Failed to set cookies', error as Error);
            throw error;
        }
    }

    /**
     * Get all cookies
     */
    async getCookies(context: BrowserContext, urls?: string[]): Promise<Cookie[]> {
        try {
            const cookies = await context.cookies(urls);
            
            ActionLogger.logInfo('Storage operation: cookies_get', {
                operation: 'cookies_get',
                count: cookies.length,
                urls
            });
            
            return cookies;
        } catch (error) {
            logger.error('CookieManager: Failed to get cookies', error as Error);
            throw error;
        }
    }

    /**
     * Get specific cookie
     */
    async getCookie(
        context: BrowserContext, 
        name: string, 
        url?: string
    ): Promise<Cookie | null> {
        try {
            const cookies = await this.getCookies(context, url ? [url] : undefined);
            const cookie = cookies.find(c => c.name === name) || null;
            
            ActionLogger.logInfo('Storage operation: cookie_get', {
                operation: 'cookie_get',
                name,
                found: !!cookie,
                url
            });
            
            return cookie;
        } catch (error) {
            logger.error('CookieManager: Failed to get cookie', error as Error);
            throw error;
        }
    }

    /**
     * Delete specific cookie
     */
    async deleteCookie(
        context: BrowserContext, 
        name: string, 
        options?: { url?: string; domain?: string; path?: string }
    ): Promise<void> {
        try {
            const cookies = await this.getCookies(context);
            
            // Find cookies to delete
            const cookiesToDelete = cookies.filter(cookie => {
                if (cookie.name !== name) return false;
                if (options?.domain && cookie.domain !== options.domain) return false;
                if (options?.path && cookie.path !== options.path) return false;
                return true;
            });

            if (cookiesToDelete.length === 0) {
                logger.warn(`CookieManager: Cookie '${name}' not found`);
                return;
            }

            // Delete by clearing and re-adding all except deleted
            const remainingCookies = cookies.filter(c => !cookiesToDelete.includes(c));
            await context.clearCookies();
            
            if (remainingCookies.length > 0) {
                await context.addCookies(remainingCookies);
            }
            
            ActionLogger.logInfo('Storage operation: cookie_delete', {
                operation: 'cookie_delete',
                name,
                deleted: cookiesToDelete.length,
                ...options
            });
        } catch (error) {
            logger.error('CookieManager: Failed to delete cookie', error as Error);
            throw error;
        }
    }

    /**
     * Delete all cookies
     */
    async deleteAllCookies(context: BrowserContext): Promise<void> {
        try {
            const cookieCount = (await context.cookies()).length;
            
            await context.clearCookies();
            
            ActionLogger.logInfo('Storage operation: cookies_clear', {
                operation: 'cookies_clear',
                deletedCount: cookieCount
            });
        } catch (error) {
            logger.error('CookieManager: Failed to delete all cookies', error as Error);
            throw error;
        }
    }

    /**
     * Update existing cookie
     */
    async updateCookie(
        context: BrowserContext, 
        name: string, 
        updates: Partial<Cookie>
    ): Promise<void> {
        try {
            const existingCookie = await this.getCookie(context, name);
            
            if (!existingCookie) {
                throw new Error(`Cookie '${name}' not found`);
            }

            // Merge updates
            const updatedCookie: Cookie = {
                ...existingCookie,
                ...updates,
                name // Ensure name doesn't change
            };

            // Delete old and set new
            await this.deleteCookie(context, name);
            await this.setCookie(context, updatedCookie);
            
            ActionLogger.logInfo('Storage operation: cookie_update', {
                operation: 'cookie_update',
                name,
                updates: Object.keys(updates)
            });
        } catch (error) {
            logger.error('CookieManager: Failed to update cookie', error as Error);
            throw error;
        }
    }

    /**
     * Check if cookie exists
     */
    async hasCookie(context: BrowserContext, name: string): Promise<boolean> {
        const cookie = await this.getCookie(context, name);
        return cookie !== null;
    }

    /**
     * Export cookies
     */
    async exportCookies(context: BrowserContext): Promise<Cookie[]> {
        try {
            const cookies = await this.getCookies(context);
            
            // Sort for consistent export
            cookies.sort((a, b) => {
                const aDomain = a.domain || '';
                const bDomain = b.domain || '';
                if (aDomain !== bDomain) return aDomain.localeCompare(bDomain);
                const aPath = a.path || '/';
                const bPath = b.path || '/';
                if (aPath !== bPath) return aPath.localeCompare(bPath);
                return a.name.localeCompare(b.name);
            });
            
            ActionLogger.logInfo('Storage operation: cookies_export', {
                operation: 'cookies_export',
                count: cookies.length
            });
            
            return cookies;
        } catch (error) {
            logger.error('CookieManager: Failed to export cookies', error as Error);
            throw error;
        }
    }

    /**
     * Import cookies
     */
    async importCookies(context: BrowserContext, cookies: Cookie[]): Promise<void> {
        try {
            // Clear existing cookies first
            await this.deleteAllCookies(context);
            
            // Import new cookies
            await this.setCookies(context, cookies);
            
            ActionLogger.logInfo('Storage operation: cookies_import', {
                operation: 'cookies_import',
                count: cookies.length
            });
        } catch (error) {
            logger.error('CookieManager: Failed to import cookies', error as Error);
            throw error;
        }
    }

    /**
     * Filter cookies by criteria
     */
    async filterCookies(
        context: BrowserContext, 
        filter: CookieFilter
    ): Promise<Cookie[]> {
        try {
            let cookies = await this.getCookies(context);
            
            // Apply filters
            if (filter.name) {
                if (filter.name instanceof RegExp) {
                    cookies = cookies.filter(c => (filter.name as RegExp).test(c.name));
                } else {
                    cookies = cookies.filter(c => c.name.includes(filter.name as string));
                }
            }
            
            if (filter.domain) {
                cookies = cookies.filter(c => c.domain === filter.domain);
            }
            
            if (filter.path) {
                cookies = cookies.filter(c => c.path === filter.path);
            }
            
            if (filter.secure !== undefined) {
                cookies = cookies.filter(c => c.secure === filter.secure);
            }
            
            if (filter.httpOnly !== undefined) {
                cookies = cookies.filter(c => c.httpOnly === filter.httpOnly);
            }
            
            if (filter.sameSite) {
                cookies = cookies.filter(c => c.sameSite === filter.sameSite);
            }
            
            if (filter.expired !== undefined) {
                const now = Date.now() / 1000;
                cookies = cookies.filter(c => {
                    const expires = c.expires || -1;
                    const isExpired = expires !== -1 && expires < now;
                    return filter.expired ? isExpired : !isExpired;
                });
            }
            
            return cookies;
        } catch (error) {
            logger.error('CookieManager: Failed to filter cookies', error as Error);
            throw error;
        }
    }

    /**
     * Get cookies by domain
     */
    async getCookiesByDomain(
        context: BrowserContext, 
        domain: string
    ): Promise<Cookie[]> {
        return this.filterCookies(context, { domain });
    }

    /**
     * Delete cookies by filter
     */
    async deleteCookiesByFilter(
        context: BrowserContext, 
        filter: CookieFilter
    ): Promise<number> {
        try {
            const cookiesToDelete = await this.filterCookies(context, filter);
            const allCookies = await this.getCookies(context);
            
            // Keep cookies that don't match filter
            const remainingCookies = allCookies.filter(
                cookie => !cookiesToDelete.includes(cookie)
            );
            
            // Clear and re-add remaining
            await context.clearCookies();
            if (remainingCookies.length > 0) {
                await context.addCookies(remainingCookies);
            }
            
            ActionLogger.logInfo('Storage operation: cookies_delete_filtered', {
                operation: 'cookies_delete_filtered',
                deletedCount: cookiesToDelete.length,
                filter
            });
            
            return cookiesToDelete.length;
        } catch (error) {
            logger.error('CookieManager: Failed to delete cookies by filter', error as Error);
            throw error;
        }
    }

    /**
     * Get cookie statistics
     */
    async getCookieStats(context: BrowserContext): Promise<any> {
        try {
            const cookies = await this.getCookies(context);
            
            const stats = {
                total: cookies.length,
                byDomain: {} as Record<string, number>,
                secure: cookies.filter(c => c.secure).length,
                httpOnly: cookies.filter(c => c.httpOnly).length,
                session: cookies.filter(c => c.expires === -1).length,
                persistent: cookies.filter(c => c.expires !== -1).length,
                expired: 0,
                sameSite: {
                    strict: cookies.filter(c => c.sameSite === 'Strict').length,
                    lax: cookies.filter(c => c.sameSite === 'Lax').length,
                    none: cookies.filter(c => c.sameSite === 'None').length
                }
            };
            
            // Count by domain
            cookies.forEach(cookie => {
                const domain = cookie.domain || 'unspecified';
                const domainCount = stats.byDomain[domain];
                stats.byDomain[domain] = (domainCount !== undefined ? domainCount : 0) + 1;
                
                // Check expiration
                const expires = cookie.expires || -1;
                if (expires !== -1 && expires < Date.now() / 1000) {
                    stats.expired++;
                }
            });
            
            return stats;
        } catch (error) {
            logger.error('CookieManager: Failed to get cookie stats', error as Error);
            throw error;
        }
    }

    // Private helper methods

    private validateCookie(cookie: Cookie): void {
        if (!cookie.name) {
            throw new Error('Cookie name is required');
        }
        
        if (cookie.value === undefined || cookie.value === null) {
            throw new Error('Cookie value is required');
        }
        
        // Validate name format
        if (!/^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(cookie.name)) {
            throw new Error(`Invalid cookie name: ${cookie.name}`);
        }
        
        // Validate SameSite with Secure
        if (cookie.sameSite === 'None' && !cookie.secure) {
            throw new Error('SameSite=None requires Secure flag');
        }
        
        // Validate domain format
        if (cookie.domain && !this.isValidDomain(cookie.domain)) {
            throw new Error(`Invalid cookie domain: ${cookie.domain}`);
        }
        
        // Validate path
        if (cookie.path && !cookie.path.startsWith('/')) {
            throw new Error('Cookie path must start with /');
        }
        
        // Validate expiration
        if (cookie.expires !== undefined && cookie.expires !== -1) {
            if (cookie.expires < Date.now() / 1000) {
                logger.warn(`Cookie '${cookie.name}' is already expired`);
            }
        }
        
        // Check size limits
        const size = cookie.name.length + cookie.value.length;
        if (size > 4096) {
            throw new Error(`Cookie size exceeds 4KB limit: ${size} bytes`);
        }
    }

    private applyCookieDefaults(cookie: Cookie): Cookie {
        const defaults: Cookie = {
            name: cookie.name,
            value: cookie.value,
            path: cookie.path || '/',
            secure: cookie.secure !== undefined ? cookie.secure : true,
            httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
            sameSite: cookie.sameSite || 'Lax',
            expires: cookie.expires !== undefined ? cookie.expires : -1
        };
        
        // Only add domain if it exists
        if (cookie.domain) {
            defaults.domain = cookie.domain;
        }
        
        // Add optional properties if they exist
        if (cookie.size !== undefined) {
            defaults.size = cookie.size;
        }
        
        if (cookie.priority !== undefined) {
            defaults.priority = cookie.priority;
        }
        
        return defaults;
    }

    private isValidDomain(domain: string): boolean {
        // Basic domain validation
        const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$/;
        return domainRegex.test(domain) || domain === 'localhost';
    }
}