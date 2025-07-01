// src/core/browser/EmulationManager.ts
import { BrowserContext, Page, devices } from 'playwright';
import { Geolocation } from './types/browser.types';
import { ActionLogger } from '../logging/ActionLogger';

export class EmulationManager {
  private static instance: EmulationManager;
  private readonly deviceRegistry: Map<string, any>;
  private readonly customDevices: Map<string, any> = new Map();

  private constructor() {
    this.deviceRegistry = new Map(Object.entries(devices));
    this.registerCustomDevices();
  }

  static getInstance(): EmulationManager {
    if (!EmulationManager.instance) {
      EmulationManager.instance = new EmulationManager();
    }
    return EmulationManager.instance;
  }

  private registerCustomDevices(): void {
    this.customDevices.set('Custom Desktop', {
      name: 'Custom Desktop',
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    });

    this.customDevices.set('Custom Tablet', {
      name: 'Custom Tablet',
      viewport: { width: 1024, height: 768 },
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
  }

  async emulateDevice(
    context: BrowserContext,
    deviceName: string
  ): Promise<void> {
    try {
      if (!context.browser()?.isConnected()) {
        throw new Error('Browser context is not connected');
      }
      
      let device = this.deviceRegistry.get(deviceName) || 
                   this.customDevices.get(deviceName);
      
      if (!device) {
        throw new Error(`Device '${deviceName}' not found`);
      }

      ActionLogger.logEmulation('device', deviceName, {
        ...device,
        contextPages: context.pages().length
      });
    } catch (error) {
      ActionLogger.logError('Failed to emulate device', error as Error);
      throw error;
    }
  }

  getDeviceDescriptor(deviceName: string): any {
    return this.deviceRegistry.get(deviceName) || 
           this.customDevices.get(deviceName);
  }

  async setViewport(
    page: Page,
    width: number,
    height: number
  ): Promise<void> {
    try {
      await page.setViewportSize({ width, height });
      ActionLogger.logEmulation('viewport', `${width}x${height}`, { width, height });
    } catch (error) {
      ActionLogger.logError('Failed to set viewport', error as Error);
      throw error;
    }
  }

  async setUserAgent(
    context: BrowserContext,
    userAgent: string
  ): Promise<void> {
    try {
      if (!context.browser()?.isConnected()) {
        throw new Error('Browser context is not connected');
      }
      
      const pages = context.pages();
      ActionLogger.logEmulation('userAgent', userAgent.substring(0, 50) + '...', {
        fullUserAgent: userAgent,
        contextPages: pages.length
      });
    } catch (error) {
      ActionLogger.logError('Failed to set user agent', error as Error);
      throw error;
    }
  }

  async setLocale(
    context: BrowserContext,
    locale: string
  ): Promise<void> {
    try {
      if (!context.browser()?.isConnected()) {
        throw new Error('Browser context is not connected');
      }
      
      ActionLogger.logEmulation('locale', locale, { 
        locale,
        contextId: (context as any)._guid || 'unknown'
      });
    } catch (error) {
      ActionLogger.logError('Failed to set locale', error as Error);
      throw error;
    }
  }

  async setTimezone(
    context: BrowserContext,
    timezone: string
  ): Promise<void> {
    try {
      if (!context.browser()?.isConnected()) {
        throw new Error('Browser context is not connected');
      }
      
      if (!timezone.includes('/')) {
        throw new Error(`Invalid timezone format: ${timezone}. Expected format like 'America/New_York'`);
      }
      
      ActionLogger.logEmulation('timezone', timezone, { 
        timezone,
        contextPages: context.pages().length
      });
    } catch (error) {
      ActionLogger.logError('Failed to set timezone', error as Error);
      throw error;
    }
  }

  async setGeolocation(
    context: BrowserContext,
    location: Geolocation
  ): Promise<void> {
    try {
      await context.setGeolocation(location);
      ActionLogger.logEmulation('geolocation', `${location.latitude},${location.longitude}`, location);
    } catch (error) {
      ActionLogger.logError('Failed to set geolocation', error as Error);
      throw error;
    }
  }

  async setColorScheme(
    page: Page,
    scheme: 'light' | 'dark' | 'no-preference'
  ): Promise<void> {
    try {
      await page.emulateMedia({ colorScheme: scheme });
      ActionLogger.logEmulation('colorScheme', scheme, { scheme });
    } catch (error) {
      ActionLogger.logError('Failed to set color scheme', error as Error);
      throw error;
    }
  }

  async setReducedMotion(
    page: Page,
    reduced: 'reduce' | 'no-preference'
  ): Promise<void> {
    try {
      await page.emulateMedia({ reducedMotion: reduced });
      ActionLogger.logEmulation('reducedMotion', reduced, { reduced });
    } catch (error) {
      ActionLogger.logError('Failed to set reduced motion', error as Error);
      throw error;
    }
  }

  async emulateMedia(
    page: Page,
    media: 'screen' | 'print'
  ): Promise<void> {
    try {
      await page.emulateMedia({ media });
      ActionLogger.logEmulation('media', media, { media });
    } catch (error) {
      ActionLogger.logError('Failed to emulate media', error as Error);
      throw error;
    }
  }

  async setOffline(
    context: BrowserContext,
    offline: boolean
  ): Promise<void> {
    try {
      await context.setOffline(offline);
      ActionLogger.logEmulation('offline', offline ? 'true' : 'false', { offline });
    } catch (error) {
      ActionLogger.logError('Failed to set offline mode', error as Error);
      throw error;
    }
  }

  async setCPUThrottling(
    page: Page,
    rate: number
  ): Promise<void> {
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate });
      ActionLogger.logEmulation('cpuThrottling', `${rate}x`, { rate });
    } catch (error) {
      ActionLogger.logError('Failed to set CPU throttling', error as Error);
      throw error;
    }
  }

  async setNetworkConditions(
    page: Page,
    conditions: {
      offline?: boolean;
      downloadThroughput?: number;
      uploadThroughput?: number;
      latency?: number;
    }
  ): Promise<void> {
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Network.emulateNetworkConditions', {
        offline: conditions.offline || false,
        downloadThroughput: conditions.downloadThroughput || -1,
        uploadThroughput: conditions.uploadThroughput || -1,
        latency: conditions.latency || 0
      });
      
      ActionLogger.logEmulation('networkConditions', JSON.stringify(conditions), conditions);
    } catch (error) {
      ActionLogger.logError('Failed to set network conditions', error as Error);
      throw error;
    }
  }

  async emulateNetworkPreset(
    page: Page,
    preset: 'GPRS' | '3G' | '4G' | 'DSL' | 'WiFi'
  ): Promise<void> {
    const presets = {
      'GPRS': {
        downloadThroughput: 50 * 1024 / 8,
        uploadThroughput: 20 * 1024 / 8,
        latency: 500
      },
      '3G': {
        downloadThroughput: 1.5 * 1024 * 1024 / 8,
        uploadThroughput: 750 * 1024 / 8,
        latency: 100
      },
      '4G': {
        downloadThroughput: 4 * 1024 * 1024 / 8,
        uploadThroughput: 3 * 1024 * 1024 / 8,
        latency: 20
      },
      'DSL': {
        downloadThroughput: 2 * 1024 * 1024 / 8,
        uploadThroughput: 1 * 1024 * 1024 / 8,
        latency: 5
      },
      'WiFi': {
        downloadThroughput: 30 * 1024 * 1024 / 8,
        uploadThroughput: 15 * 1024 * 1024 / 8,
        latency: 2
      }
    };

    await this.setNetworkConditions(page, presets[preset]);
  }

  async setExtraHTTPHeaders(
    page: Page,
    headers: Record<string, string>
  ): Promise<void> {
    try {
      await page.setExtraHTTPHeaders(headers);
      ActionLogger.logEmulation('extraHeaders', Object.keys(headers).join(', '), headers);
    } catch (error) {
      ActionLogger.logError('Failed to set extra HTTP headers', error as Error);
      throw error;
    }
  }

  async blockResources(
    page: Page,
    resourceTypes: string[]
  ): Promise<void> {
    try {
      await page.route('**/*', (route) => {
        if (resourceTypes.includes(route.request().resourceType())) {
          route.abort();
        } else {
          route.continue();
        }
      });
      
      ActionLogger.logEmulation('blockedResources', resourceTypes.join(', '), { resourceTypes });
    } catch (error) {
      ActionLogger.logError('Failed to block resources', error as Error);
      throw error;
    }
  }

  async setJavaScriptEnabled(
    context: BrowserContext,
    enabled: boolean
  ): Promise<void> {
    try {
      if (!context.browser()?.isConnected()) {
        throw new Error('Browser context is not connected');
      }
      
      const pages = context.pages();
      ActionLogger.logEmulation('javaScript', enabled ? 'enabled' : 'disabled', { 
        enabled,
        affectedPages: pages.length,
        warning: pages.length > 0 ? 'This setting only affects new pages' : undefined
      });
    } catch (error) {
      ActionLogger.logError('Failed to set JavaScript enabled state', error as Error);
      throw error;
    }
  }

  async emulateVisionDeficiency(
    page: Page,
    type: 'none' | 'achromatopsia' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  ): Promise<void> {
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setEmulatedVisionDeficiency', { type });
      ActionLogger.logEmulation('visionDeficiency', type, { type });
    } catch (error) {
      ActionLogger.logError('Failed to emulate vision deficiency', error as Error);
      throw error;
    }
  }

  async setTouchEnabled(
    context: BrowserContext,
    enabled: boolean
  ): Promise<void> {
    try {
      if (!context.browser()?.isConnected()) {
        throw new Error('Browser context is not connected');
      }
      
      const pages = context.pages();
      const touchSupport = pages.length > 0 ? 'Only affects new pages' : 'Will be applied to new pages';
      
      ActionLogger.logEmulation('touch', enabled ? 'enabled' : 'disabled', { 
        enabled,
        contextPages: pages.length,
        note: touchSupport
      });
    } catch (error) {
      ActionLogger.logError('Failed to set touch enabled state', error as Error);
      throw error;
    }
  }

  getAvailableDevices(): string[] {
    return [
      ...Array.from(this.deviceRegistry.keys()),
      ...Array.from(this.customDevices.keys())
    ];
  }

  registerCustomDevice(name: string, config: any): void {
    this.customDevices.set(name, { name, ...config });
    ActionLogger.logEmulation('customDevice', 'registered', { name, config });
  }
}
