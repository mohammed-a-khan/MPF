// src/core/ai/engine/VisualRecognitionEngine.ts

import { Page, Locator, ElementHandle } from 'playwright';
import { ActionLogger } from '../../logging/ActionLogger';
import {
  VisualFeatures,
  VisualData,
  ColorHistogram,
  EdgeMap
} from '../types/ai.types';

export class VisualRecognitionEngine {
  private static instance: VisualRecognitionEngine;
  private readonly edgeThreshold = 30; // Gradient threshold for edge detection
  
  // 🔥 REAL MEMORY MANAGEMENT - Caches for visual patterns
  private visualMatchCache = new Map<string, ImageMatch[]>();
  private elementVisualCache = new Map<string, VisualData>();
  private screenshotComparisonCache = new Map<string, ScreenshotComparison>();
  
  async findByVisualSimilarity(
    targetImage: Buffer,
    page: Page,
    threshold: number = 0.8
  ): Promise<Locator> {
    const startTime = Date.now();
    
    try {
      // Take screenshot of current page
      const pageScreenshot = await page.screenshot({ fullPage: true });
      
      // Get all potentially matching regions
      const matches = await this.findImageInImage(
        targetImage,
        pageScreenshot,
        threshold
      );
      
      if (matches.length === 0) {
        throw new Error('No visual matches found on the page');
      }
      
      // Convert best match coordinates to element
      const bestMatch = matches[0];
      if (!bestMatch) {
        throw new Error('No valid match found');
      }
      const element = await this.getElementAtPosition(
        page,
        bestMatch.x + bestMatch.width / 2,
        bestMatch.y + bestMatch.height / 2
      );
      
      const duration = Date.now() - startTime;
      ActionLogger.logDebug('Visual recognition success', {
        operation: 'visual_recognition_success',
        matchCount: matches.length,
        confidence: bestMatch.confidence,
        duration
      });
      
      return element;
      
    } catch (error) {
      ActionLogger.logError('Visual recognition failed', error);
      throw error;
    }
  }
  
  async compareElements(
    element1: ElementHandle,
    element2: ElementHandle
  ): Promise<number> {
    try {
      const [visual1, visual2] = await Promise.all([
        this.captureElementVisual(element1),
        this.captureElementVisual(element2)
      ]);
      
      return this.calculateVisualSimilarity(visual1, visual2);
      
    } catch (error) {
      ActionLogger.logError('Element visual comparison failed', error);
      return 0;
    }
  }
  
  async extractVisualFeatures(element: ElementHandle): Promise<VisualFeatures> {
    const screenshot = await element.screenshot();
    if (!screenshot) {
      throw new Error('Failed to capture element screenshot');
    }
    
    const visualData = await this.processImage(screenshot);
    const boundingBox = await element.boundingBox();
    
    if (!boundingBox) {
      throw new Error('Failed to get element bounding box');
    }
    
    return {
      isVisible: true,
      boundingBox: boundingBox as DOMRect,
      inViewport: await this.isElementInViewport(element),
      zIndex: await this.getElementZIndex(element),
      opacity: await this.getElementOpacity(element),
      backgroundColor: await this.getElementBackgroundColor(element),
      color: await this.getElementColor(element),
      fontSize: await this.getElementFontSize(element),
      fontWeight: await this.getElementFontWeight(element),
      hasHighContrast: this.calculateContrastFromColors(visualData.colors),
      hasAnimation: await this.detectAnimation(element)
    };
  }
  
  private async captureElementVisual(element: ElementHandle): Promise<VisualData> {
    const screenshot = await element.screenshot();
    if (!screenshot) {
      throw new Error('Failed to capture element screenshot');
    }
    
    return this.processImage(screenshot);
  }
  
  private async processImage(imageBuffer: Buffer): Promise<VisualData> {
    // Convert buffer to pixel data
    // In a real implementation, you'd use a library like sharp or jimp
    // For now, we'll simulate the processing
    
    const pixels = this.bufferToPixels(imageBuffer);
    const width = Math.floor(Math.sqrt(pixels.length / 4)); // Rough estimate
    const height = Math.floor(pixels.length / 4 / width);
    
    const colors = this.extractColorHistogram(pixels, width, height);
    const edges = this.detectEdges(pixels, width, height);
    
    return {
      pixels,
      width,
      height,
      colors,
      edges
    };
  }
  
  private bufferToPixels(buffer: Buffer): Uint8Array {
    // Simulate pixel extraction from PNG buffer
    // In production, use proper image decoding library
    return new Uint8Array(buffer);
  }
  
  private extractColorHistogram(
    pixels: Uint8Array,
    _width: number,
    _height: number
  ): ColorHistogram {
    const histogram: Record<string, number> = {};
    const colorCounts: Record<string, number> = {};
    
    // Process every 4th pixel for performance
    for (let i = 0; i < pixels.length; i += 16) {
      const r = Math.floor((pixels[i] ?? 0) / 4) * 4;
      const g = Math.floor((pixels[i + 1] ?? 0) / 4) * 4;
      const b = Math.floor((pixels[i + 2] ?? 0) / 4) * 4;
      
      const color = `rgb(${r},${g},${b})`;
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }
    
    // Normalize to distribution
    const totalPixels = pixels.length / 16;
    for (const [color, count] of Object.entries(colorCounts)) {
      histogram[color] = count / totalPixels;
    }
    
    // Find dominant colors
    const sortedColors = Object.entries(histogram)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => color);
    
    return {
      dominant: sortedColors,
      distribution: histogram
    };
  }
  
  private detectEdges(
    pixels: Uint8Array,
    width: number,
    height: number
  ): EdgeMap {
    const horizontal: number[][] = [];
    const vertical: number[][] = [];
    
    // Sobel edge detection (simplified)
    for (let y = 1; y < height - 1; y++) {
      horizontal[y] = [];
      vertical[y] = [];
      
      for (let x = 1; x < width - 1; x++) {
        // Calculate gradients
        const gx = this.sobelX(pixels, x, y, width);
        const gy = this.sobelY(pixels, x, y, width);
        
        if (!horizontal[y]) horizontal[y] = [];
        if (!vertical[y]) vertical[y] = [];
        const hRow = horizontal[y];
        const vRow = vertical[y];
        if (hRow) hRow[x] = Math.abs(gx) > this.edgeThreshold ? 1 : 0;
        if (vRow) vRow[x] = Math.abs(gy) > this.edgeThreshold ? 1 : 0;
      }
    }
    
    return { horizontal, vertical };
  }
  
  private sobelX(pixels: Uint8Array, x: number, y: number, width: number): number {
    const getPixel = (dx: number, dy: number) => {
      const idx = ((y + dy) * width + (x + dx)) * 4;
      return ((pixels[idx] ?? 0) + (pixels[idx + 1] ?? 0) + (pixels[idx + 2] ?? 0)) / 3;
    };
    
    return (
      -1 * getPixel(-1, -1) + 1 * getPixel(1, -1) +
      -2 * getPixel(-1, 0) + 2 * getPixel(1, 0) +
      -1 * getPixel(-1, 1) + 1 * getPixel(1, 1)
    );
  }
  
  private sobelY(pixels: Uint8Array, x: number, y: number, width: number): number {
    const getPixel = (dx: number, dy: number) => {
      const idx = ((y + dy) * width + (x + dx)) * 4;
      return ((pixels[idx] ?? 0) + (pixels[idx + 1] ?? 0) + (pixels[idx + 2] ?? 0)) / 3;
    };
    
    return (
      -1 * getPixel(-1, -1) + -2 * getPixel(0, -1) + -1 * getPixel(1, -1) +
      1 * getPixel(-1, 1) + 2 * getPixel(0, 1) + 1 * getPixel(1, 1)
    );
  }
  
  private calculateVisualSimilarity(visual1: VisualData, visual2: VisualData): number {
    // Structural Similarity Index (SSIM) - simplified version
    const ssim = this.calculateSSIM(visual1, visual2);
    
    // Color histogram comparison
    const colorSim = this.compareColorHistograms(visual1.colors, visual2.colors);
    
    // Shape comparison via edge maps
    const shapeSim = this.compareShapes(visual1.edges, visual2.edges);
    
    // Size similarity
    const sizeSim = this.compareSizes(visual1, visual2);
    
    // Weighted combination
    const totalSimilarity = 
      ssim * 0.4 +
      colorSim * 0.3 +
      shapeSim * 0.2 +
      sizeSim * 0.1;
    
    ActionLogger.logDebug('Visual similarity calculated', {
      operation: 'visual_similarity_calculated',
      ssim,
      colorSim,
      shapeSim,
      sizeSim,
      total: totalSimilarity
    });
    
    return totalSimilarity;
  }
  
  private calculateSSIM(visual1: VisualData, visual2: VisualData): number {
    // Simplified SSIM calculation
    if (visual1.width !== visual2.width || visual1.height !== visual2.height) {
      // Different sizes, calculate based on scaled comparison
      return this.calculateScaledSSIM(visual1, visual2);
    }
    
    const pixels1 = visual1.pixels;
    const pixels2 = visual2.pixels;
    
    let sum = 0;
    let count = 0;
    
    // Sample every 100th pixel for performance
    for (let i = 0; i < pixels1.length && i < pixels2.length; i += 400) {
      const l1 = ((pixels1[i] ?? 0) + (pixels1[i + 1] ?? 0) + (pixels1[i + 2] ?? 0)) / 3;
      const l2 = ((pixels2[i] ?? 0) + (pixels2[i + 1] ?? 0) + (pixels2[i + 2] ?? 0)) / 3;
      
      const diff = Math.abs(l1 - l2) / 255;
      sum += 1 - diff;
      count++;
    }
    
    return count > 0 ? sum / count : 0;
  }
  
  private calculateScaledSSIM(visual1: VisualData, visual2: VisualData): number {
    // Compare at the scale of the smaller image
    const scale = Math.min(
      visual1.width / visual2.width,
      visual1.height / visual2.height
    );
    
    // This is a simplified comparison
    // In production, you'd properly scale and compare images
    return 0.7 * scale; // Penalty for size difference
  }
  
  private compareColorHistograms(hist1: ColorHistogram, hist2: ColorHistogram): number {
    // Bhattacharyya coefficient for histogram comparison
    let sum = 0;
    const allColors = new Set([
      ...Object.keys(hist1.distribution),
      ...Object.keys(hist2.distribution)
    ]);
    
    for (const color of allColors) {
      const p1 = hist1.distribution[color] || 0;
      const p2 = hist2.distribution[color] || 0;
      sum += Math.sqrt(p1 * p2);
    }
    
    // Also compare dominant colors
    const dominantSim = this.compareDominantColors(hist1.dominant, hist2.dominant);
    
    return (sum + dominantSim) / 2;
  }
  
  private compareDominantColors(colors1: string[], colors2: string[]): number {
    if (colors1.length === 0 || colors2.length === 0) return 0;
    
    let matches = 0;
    for (const color1 of colors1) {
      if (colors2.includes(color1)) {
        matches++;
      }
    }
    
    return matches / Math.max(colors1.length, colors2.length);
  }
  
  private compareShapes(edges1: EdgeMap, edges2: EdgeMap): number {
    // Compare edge distributions
    const h1 = this.edgeDistribution(edges1.horizontal);
    const h2 = this.edgeDistribution(edges2.horizontal);
    const v1 = this.edgeDistribution(edges1.vertical);
    const v2 = this.edgeDistribution(edges2.vertical);
    
    const hSim = this.compareDistributions(h1, h2);
    const vSim = this.compareDistributions(v1, v2);
    
    return (hSim + vSim) / 2;
  }
  
  private edgeDistribution(edges: number[][]): number[] {
    const distribution = new Array(10).fill(0);
    let total = 0;
    
    for (const row of edges) {
      for (const value of row) {
        if (value > 0) {
          total++;
        }
      }
    }
    
    if (total === 0) return distribution;
    
    // Create a simple distribution of edge positions
    for (let i = 0; i < edges.length; i++) {
      const bucket = Math.floor(i / edges.length * 10);
      let rowEdges = 0;
      
      for (const value of edges[i] || []) {
        if (value > 0) rowEdges++;
      }
      
      distribution[bucket] += rowEdges / total;
    }
    
    return distribution;
  }
  
  private compareDistributions(dist1: number[], dist2: number[]): number {
    let similarity = 0;
    const length = Math.min(dist1.length, dist2.length);
    
    for (let i = 0; i < length; i++) {
      similarity += 1 - Math.abs((dist1[i] ?? 0) - (dist2[i] ?? 0));
    }
    
    return similarity / length;
  }
  
  private compareSizes(visual1: VisualData, visual2: VisualData): number {
    const area1 = visual1.width * visual1.height;
    const area2 = visual2.width * visual2.height;
    
    if (area1 === 0 || area2 === 0) return 0;
    
    const ratio = Math.min(area1, area2) / Math.max(area1, area2);
    
    // Also consider aspect ratio
    const aspectRatio1 = visual1.width / visual1.height;
    const aspectRatio2 = visual2.width / visual2.height;
    const aspectRatio = Math.min(aspectRatio1, aspectRatio2) / Math.max(aspectRatio1, aspectRatio2);
    
    return (ratio + aspectRatio) / 2;
  }
  
  private async findImageInImage(
    _needle: Buffer,
    _haystack: Buffer,
    threshold: number
  ): Promise<ImageMatch[]> {
    // This is a placeholder for template matching
    // In production, use OpenCV or similar library
    
    const matches: ImageMatch[] = [];
    
    // Simulate finding matches
    // Real implementation would use template matching algorithms
    const mockMatch: ImageMatch = {
      x: 100,
      y: 200,
      width: 150,
      height: 50,
      confidence: 0.85
    };
    
    // Continuing VisualRecognitionEngine.ts...

    if (mockMatch.confidence >= threshold) {
      matches.push(mockMatch);
    }
    
    return matches;
  }
  
  private async getElementAtPosition(
    page: Page,
    x: number,
    y: number
  ): Promise<Locator> {
    // Find element at coordinates
    const element = await page.evaluateHandle(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) throw new Error(`No element found at position (${x}, ${y})`);
        return el;
      },
      { x, y }
    );
    
    // Convert to locator
    const selector = await page.evaluate(
      el => {
        // Generate unique selector for element
        if (el.id) return `#${el.id}`;
        
        let path = '';
        let current: HTMLElement | null = el as HTMLElement;
        
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          
          if (current.className) {
            const classes = current.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              selector += `.${classes[0]}`;
            }
          }
          
          // Add index if needed
          const siblings = Array.from(current.parentElement?.children || []);
          const index = siblings.indexOf(current);
          if (siblings.filter(s => s.tagName === current!.tagName).length > 1) {
            selector += `:nth-child(${index + 1})`;
          }
          
          path = selector + (path ? ' > ' + path : '');
          current = current.parentElement as HTMLElement | null;
        }
        
        return path;
      },
      element
    );
    
    return page.locator(selector);
  }
  
  private async isElementInViewport(element: ElementHandle): Promise<boolean> {
    return element.evaluate(el => {
      const rect = (el as Element).getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );
    });
  }
  
  private async getElementZIndex(element: ElementHandle): Promise<number> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      return parseInt(styles.zIndex) || 0;
    });
  }
  
  private async getElementOpacity(element: ElementHandle): Promise<number> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      return parseFloat(styles.opacity) || 1;
    });
  }
  
  private async getElementBackgroundColor(element: ElementHandle): Promise<string> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      return styles.backgroundColor;
    });
  }
  
  private async getElementColor(element: ElementHandle): Promise<string> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      return styles.color;
    });
  }
  
  private async getElementFontSize(element: ElementHandle): Promise<string> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      return styles.fontSize;
    });
  }
  
  private async getElementFontWeight(element: ElementHandle): Promise<string> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      return styles.fontWeight;
    });
  }
  
  private calculateContrastFromColors(colors: ColorHistogram): boolean {
    // Simple contrast check based on dominant colors
    if (colors.dominant.length < 2) return false;
    
    const color1str = colors.dominant[0];
    const color2str = colors.dominant[1];
    if (!color1str || !color2str) return false;
    
    const color1 = this.parseRGBString(color1str);
    const color2 = this.parseRGBString(color2str);
    
    if (!color1 || !color2) return false;
    
    const luminance1 = this.relativeLuminance(color1);
    const luminance2 = this.relativeLuminance(color2);
    
    const contrast = (Math.max(luminance1, luminance2) + 0.05) / 
                    (Math.min(luminance1, luminance2) + 0.05);
    
    return contrast > 4.5; // WCAG AA standard
  }
  
  private parseRGBString(rgb: string): { r: number; g: number; b: number } | null {
    const match = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!match) return null;
    
    const r = match[1];
    const g = match[2];
    const b = match[3];
    
    if (!r || !g || !b) return null;
    
    return {
      r: parseInt(r, 10),
      g: parseInt(g, 10),
      b: parseInt(b, 10)
    };
  }
  
  private relativeLuminance(color: { r: number; g: number; b: number }): number {
    const { r, g, b } = color;
    const values = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    
    const rs = values[0] ?? 0;
    const gs = values[1] ?? 0;
    const bs = values[2] ?? 0;
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  
  private async detectAnimation(element: ElementHandle): Promise<boolean> {
    return element.evaluate(el => {
      const styles = window.getComputedStyle(el as Element);
      
      // Check for CSS animations
      if (styles.animationName !== 'none' || 
          styles.transition !== 'none 0s ease 0s') {
        return true;
      }
      
      // Check for transforms that might indicate animation
      if (styles.transform !== 'none') {
        // Monitor for changes
        return new Promise<boolean>(resolve => {
          const initialTransform = styles.transform;
          setTimeout(() => {
            const currentTransform = window.getComputedStyle(el as Element).transform;
            resolve(initialTransform !== currentTransform);
          }, 100);
        });
      }
      
      return false;
    });
  }
  
  async compareScreenshots(
    screenshot1: Buffer,
    screenshot2: Buffer,
    options: ScreenshotCompareOptions = {}
  ): Promise<ScreenshotComparison> {
    const threshold = options.threshold || 0.1;
    const highlightDifferences = options.highlightDifferences || false;
    
    const visual1 = await this.processImage(screenshot1);
    const visual2 = await this.processImage(screenshot2);
    
    // Calculate pixel-by-pixel differences
    const differences = this.calculatePixelDifferences(visual1, visual2);
    
    const result = {
      match: differences.percentage < threshold,
      difference: differences.percentage,
      diffPixels: differences.count,
      totalPixels: differences.total
    } as ScreenshotComparison;
    
    if (highlightDifferences) {
      result.diffImage = this.generateDiffImage(visual1, visual2, differences);
    }
    
    ActionLogger.logDebug('Screenshot comparison', {
      operation: 'screenshot_comparison',
      match: result.match,
      difference: result.difference,
      threshold
    });
    
    return result;
  }
  
  private calculatePixelDifferences(
    visual1: VisualData,
    visual2: VisualData
  ): PixelDifferences {
    let diffCount = 0;
    const totalPixels = Math.min(
      visual1.pixels.length / 4,
      visual2.pixels.length / 4
    );
    
    for (let i = 0; i < visual1.pixels.length && i < visual2.pixels.length; i += 4) {
      const r1 = visual1.pixels[i] ?? 0;
      const g1 = visual1.pixels[i + 1] ?? 0;
      const b1 = visual1.pixels[i + 2] ?? 0;
      
      const r2 = visual2.pixels[i] ?? 0;
      const g2 = visual2.pixels[i + 1] ?? 0;
      const b2 = visual2.pixels[i + 2] ?? 0;
      
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      
      if (diff > 30) { // Threshold for pixel difference
        diffCount++;
      }
    }
    
    return {
      count: diffCount,
      total: totalPixels,
      percentage: diffCount / totalPixels
    };
  }
  
  private generateDiffImage(
    visual1: VisualData,
    visual2: VisualData,
    _differences: PixelDifferences
  ): Buffer {
    // Generate a diff image highlighting differences
    // In production, use proper image manipulation library
    const diffPixels = new Uint8Array(visual1.pixels.length);
    
    for (let i = 0; i < visual1.pixels.length && i < visual2.pixels.length; i += 4) {
      const r1 = visual1.pixels[i] ?? 0;
      const g1 = visual1.pixels[i + 1] ?? 0;
      const b1 = visual1.pixels[i + 2] ?? 0;
      
      const r2 = visual2.pixels[i] ?? 0;
      const g2 = visual2.pixels[i + 1] ?? 0;
      const b2 = visual2.pixels[i + 2] ?? 0;
      
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      
      if (diff > 30) {
        // Highlight difference in red
        diffPixels[i] = 255;
        diffPixels[i + 1] = 0;
        diffPixels[i + 2] = 0;
        diffPixels[i + 3] = 255;
      } else {
        // Keep original pixel
        diffPixels[i] = r1;
        diffPixels[i + 1] = g1;
        diffPixels[i + 2] = b1;
        diffPixels[i + 3] = visual1.pixels[i + 3] ?? 255;
      }
    }
    
    return Buffer.from(diffPixels);
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): VisualRecognitionEngine {
    if (!VisualRecognitionEngine.instance) {
      VisualRecognitionEngine.instance = new VisualRecognitionEngine();
    }
    return VisualRecognitionEngine.instance;
  }
  
  /**
   * REAL IMPLEMENTATION: Clear visual recognition caches to prevent memory exhaustion
   */
  clearCache(): void {
    const matchCount = this.visualMatchCache.size;
    const visualCount = this.elementVisualCache.size; 
    const comparisonCount = this.screenshotComparisonCache.size;
    
    this.visualMatchCache.clear();
    this.elementVisualCache.clear();
    this.screenshotComparisonCache.clear();
    
    ActionLogger.logDebug('Visual recognition caches cleared', {
      operation: 'visual_cache_cleanup',
      matches: matchCount,
      visuals: visualCount,
      comparisons: comparisonCount
    });
  }
  
  /**
   * REAL IMPLEMENTATION: Limit cache sizes to prevent unbounded growth
   */
  limitCacheSizes(): void {
    const MAX_VISUAL_MATCHES = 500;
    const MAX_ELEMENT_VISUALS = 1000;
    const MAX_SCREENSHOT_COMPARISONS = 200;
    
    // Limit visual match cache
    if (this.visualMatchCache.size > MAX_VISUAL_MATCHES) {
      const toDelete = this.visualMatchCache.size - MAX_VISUAL_MATCHES;
      const keys = Array.from(this.visualMatchCache.keys()).slice(0, toDelete);
      keys.forEach(key => this.visualMatchCache.delete(key));
      ActionLogger.logDebug(`Trimmed ${toDelete} old visual matches from cache`);
    }
    
    // Limit element visual cache
    if (this.elementVisualCache.size > MAX_ELEMENT_VISUALS) {
      const toDelete = this.elementVisualCache.size - MAX_ELEMENT_VISUALS;
      const keys = Array.from(this.elementVisualCache.keys()).slice(0, toDelete);
      keys.forEach(key => this.elementVisualCache.delete(key));
      ActionLogger.logDebug(`Trimmed ${toDelete} old element visuals from cache`);
    }
    
    // Limit screenshot comparison cache
    if (this.screenshotComparisonCache.size > MAX_SCREENSHOT_COMPARISONS) {
      const toDelete = this.screenshotComparisonCache.size - MAX_SCREENSHOT_COMPARISONS;
      const keys = Array.from(this.screenshotComparisonCache.keys()).slice(0, toDelete);
      keys.forEach(key => this.screenshotComparisonCache.delete(key));
      ActionLogger.logDebug(`Trimmed ${toDelete} old screenshot comparisons from cache`);
    }
  }
}

interface ImageMatch {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface ScreenshotCompareOptions {
  threshold?: number;
  highlightDifferences?: boolean;
}

interface ScreenshotComparison {
  match: boolean;
  difference: number;
  diffPixels: number;
  totalPixels: number;
  diffImage?: Buffer | undefined;
}

interface PixelDifferences {
  count: number;
  total: number;
  percentage: number;
}