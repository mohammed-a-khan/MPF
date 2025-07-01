import { ReportOptions, ReportTheme } from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Manages report configuration
 */
export class ReportConfig {
    private logger: Logger;
    private config: Map<string, any> = new Map();
    private defaultConfig: Map<string, any> = new Map();
    private customTheme: ReportTheme = {} as ReportTheme;
    private configFile: string;

    constructor() {
        this.logger = Logger.getInstance('ReportConfig');
        this.configFile = path.join(process.cwd(), 'reports', '.config', 'report-config.json');
        this.initializeDefaults();
    }

    /**
     * Load configuration
     */
    public async load(options: ReportOptions): Promise<void> {
        try {
            // Load saved configuration if exists
            await this.loadSavedConfig();

            // Apply provided options
            Object.entries(options).forEach(([key, value]) => {
                this.config.set(key, value);
            });

            // Initialize theme
            this.initializeTheme();

            // Validate configuration
            this.validateConfig();

            // Save configuration
            await this.saveConfig();

            this.logger.info('Report configuration loaded');

        } catch (error: any) {
            this.logger.error('Failed to load configuration', error);
            throw error;
        }
    }

    /**
     * Get configuration value
     */
    public get<T = any>(key: string): T {
        return this.config.get(key) ?? this.defaultConfig.get(key);
    }

    /**
     * Set configuration value
     */
    public set(key: string, value: any): void {
        this.config.set(key, value);
    }

    /**
     * Get all configuration
     */
    public getAll(): Map<string, any> {
        const allConfig = new Map(this.defaultConfig);
        this.config.forEach((value, key) => {
            allConfig.set(key, value);
        });
        return allConfig;
    }

    /**
     * Get report theme
     */
    public getTheme(): ReportTheme {
        return this.customTheme;
    }

    /**
     * Update theme
     */
    public updateTheme(theme: Partial<ReportTheme>): void {
        this.customTheme = { ...this.customTheme, ...theme };
        this.config.set('theme', this.customTheme);
    }

    /**
     * Reset to defaults
     */
    public resetToDefaults(): void {
        this.config.clear();
        this.initializeTheme();
        this.logger.info('Configuration reset to defaults');
    }

    /**
     * Export configuration
     */
    public async exportConfig(filepath: string): Promise<void> {
        const configData = {
            config: Object.fromEntries(this.getAll()),
            theme: this.customTheme,
            exported: new Date().toISOString()
        };

        await fs.promises.writeFile(filepath, JSON.stringify(configData, null, 2));
        this.logger.info(`Configuration exported to ${filepath}`);
    }

    /**
     * Import configuration
     */
    public async importConfig(filepath: string): Promise<void> {
        try {
            const content = await fs.promises.readFile(filepath, 'utf-8');
            const configData = JSON.parse(content);

            if (configData.config) {
                Object.entries(configData.config).forEach(([key, value]) => {
                    this.config.set(key, value);
                });
            }

            if (configData.theme) {
                this.customTheme = configData.theme;
            }

            await this.saveConfig();
            this.logger.info(`Configuration imported from ${filepath}`);

        } catch (error: any) {
            this.logger.error('Failed to import configuration', error);
            throw error;
        }
    }

    /**
     * Initialize default configuration
     */
    private initializeDefaults(): void {
        const defaults = {
            // Paths
            reportPath: './reports',
            archivePath: './reports/archive',
            evidencePath: './reports/evidence',
            templatePath: './reports/templates',
            
            // Theme
            themePrimaryColor: '#93186C',
            themeSecondaryColor: '#FFFFFF',
            themeAccentColor: '#6B1250',
            themeSuccessColor: '#28A745',
            themeErrorColor: '#DC3545',
            themeWarningColor: '#FFC107',
            themeInfoColor: '#17A2B8',
            themeFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            
            // Report Options
            generatePDF: true,
            generateExcel: true,
            generateJSON: true,
            generateXML: false,
            
            // Content Options
            includeScreenshots: true,
            includeVideos: true,
            includeLogs: true,
            includeHAR: true,
            includeTraces: false,
            includeMetrics: true,
            includePerformance: true,
            
            // Features
            enableCharts: true,
            enableTimeline: true,
            enableTrends: true,
            enableDashboard: true,
            enableGallery: true,
            enableSearch: true,
            enableFilters: true,
            enableExport: true,
            
            // Performance
            maxScreenshotsPerTest: 10,
            maxVideosPerTest: 3,
            maxLogLinesPerTest: 1000,
            compressImages: true,
            imageQuality: 85,
            lazyLoadImages: true,
            virtualScrollThreshold: 100,
            
            // Company Branding
            companyName: 'CS Automation',
            companyLogo: '',
            companyUrl: '',
            reportTitle: 'Test Automation Report',
            reportSubtitle: 'Comprehensive Test Execution Results',
            reportFooter: 'Generated by CS Test Automation Framework',
            
            // Advanced Options
            autoCleanup: true,
            cleanupDays: 30,
            archiveReports: true,
            archiveDays: 90,
            enableNotifications: false,
            notificationWebhook: '',
            
            // Chart Options
            chartAnimations: true,
            chartAnimationDuration: 1000,
            chartInteractive: true,
            chartColors: [
                '#93186C', '#6B1250', '#B91C84', '#D63AAF',
                '#17A2B8', '#28A745', '#FFC107', '#DC3545'
            ],
            
            // Timeline Options
            timelineZoomable: true,
            timelineDraggable: true,
            timelineShowTooltips: true,
            timelineGroupByFeature: true,
            
            // Gallery Options
            galleryColumns: 4,
            galleryThumbnailSize: 200,
            galleryLightbox: true,
            galleryDownloadable: true,
            
            // Table Options
            tablePagination: true,
            tablePageSize: 25,
            tableSortable: true,
            tableFilterable: true,
            tableExportable: true,
            
            // Security
            sanitizeData: true,
            maskSensitiveData: true,
            sensitiveDataPatterns: [
                'password', 'token', 'secret', 'key', 'authorization'
            ]
        };

        Object.entries(defaults).forEach(([key, value]) => {
            this.defaultConfig.set(key, value);
        });
    }

    /**
     * Initialize theme
     */
    private initializeTheme(): void {
        this.customTheme = {
            primaryColor: this.get('themePrimaryColor'),
            secondaryColor: this.get('themeSecondaryColor'),
            successColor: this.get('themeSuccessColor'),
            failureColor: this.get('themeErrorColor'),
            warningColor: this.get('themeWarningColor'),
            infoColor: this.get('themeInfoColor'),
            backgroundColor: this.get('themeBackgroundColor') || '#FFFFFF',
            textColor: this.get('themeTextColor') || '#333333',
            fontFamily: this.get('themeFontFamily'),
            fontSize: this.get('themeFontSize') || '14px',
            logo: this.get('themeLogo'),
            customCSS: this.get('themeCustomCSS')
        };
    }

    /**
     * Validate configuration
     */
    private validateConfig(): void {
        const errors: string[] = [];

        // Validate required fields
        if (!this.get('reportPath')) {
            errors.push('Report path is required');
        }

        // Validate numeric ranges
        const imageQuality = this.get('imageQuality');
        if (imageQuality < 1 || imageQuality > 100) {
            errors.push('Image quality must be between 1 and 100');
        }

        const maxScreenshots = this.get('maxScreenshotsPerTest');
        if (maxScreenshots < 0) {
            errors.push('Max screenshots per test must be non-negative');
        }

        // Validate colors
        const colorPattern = /^#[0-9A-Fa-f]{6}$/;
        const colors = [
            'themePrimaryColor', 'themeSecondaryColor', 'themeAccentColor',
            'themeSuccessColor', 'themeErrorColor', 'themeWarningColor', 'themeInfoColor'
        ];

        colors.forEach(colorKey => {
            const color = this.get(colorKey);
            if (color && !colorPattern.test(color)) {
                errors.push(`Invalid color format for ${colorKey}: ${color}`);
            }
        });

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Load saved configuration
     */
    private async loadSavedConfig(): Promise<void> {
        try {
            const configDir = path.dirname(this.configFile);
            await fs.promises.mkdir(configDir, { recursive: true });

            if (await this.fileExists(this.configFile)) {
                const content = await fs.promises.readFile(this.configFile, 'utf-8');
                const savedConfig = JSON.parse(content);

                Object.entries(savedConfig).forEach(([key, value]) => {
                    this.config.set(key, value);
                });

                this.logger.info('Loaded saved configuration');
            }
        } catch (error: any) {
            this.logger.warn('Failed to load saved configuration', error);
        }
    }

    /**
     * Save configuration
     */
    private async saveConfig(): Promise<void> {
        try {
            const configDir = path.dirname(this.configFile);
            await fs.promises.mkdir(configDir, { recursive: true });

            const configData = Object.fromEntries(this.config);
            await fs.promises.writeFile(
                this.configFile,
                JSON.stringify(configData, null, 2)
            );

            this.logger.debug('Configuration saved');
        } catch (error: any) {
            this.logger.warn('Failed to save configuration', error);
        }
    }

    /**
     * Check if file exists
     */
    private async fileExists(filepath: string): Promise<boolean> {
        try {
            await fs.promises.access(filepath);
            return true;
        } catch {
            return false;
        }
    }
}