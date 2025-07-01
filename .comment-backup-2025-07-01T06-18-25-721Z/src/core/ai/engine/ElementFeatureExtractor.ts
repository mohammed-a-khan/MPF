// src/core/ai/engine/ElementFeatureExtractor.ts

import { ElementHandle } from 'playwright';
import { ActionLogger } from '../../logging/ActionLogger';
import {
  ElementFeatures,
  TextFeatures,
  VisualFeatures,
  StructuralFeatures,
  SemanticFeatures,
  ContextFeatures
} from '../types/ai.types';

export class ElementFeatureExtractor {
  async extractFeatures(
    element: ElementHandle
  ): Promise<ElementFeatures> {
    try {
      const [text, visual, structural, semantic, context] = await Promise.all([
        this.extractTextFeatures(element),
        this.extractVisualFeatures(element),
        this.extractStructuralFeatures(element),
        this.extractSemanticFeatures(element),
        this.extractContextFeatures(element)
      ]);

      return {
        text,
        visual,
        structural,
        semantic,
        context,
        timestamp: Date.now()
      };
    } catch (error) {
      ActionLogger.logError('Feature extraction failed', error);
      throw error;
    }
  }

  async quickExtract(
    element: Element
  ): Promise<ElementFeatures> {
    // Quick extraction for confidence scoring
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    
    return {
      text: {
        content: element.textContent?.trim() || '',
        visibleText: this.getVisibleText(element),
        length: element.textContent?.length || 0,
        words: element.textContent?.trim().split(/\s+/).length || 0
      },
      visual: {
        isVisible: rect.width > 0 && rect.height > 0,
        boundingBox: rect,
        inViewport: this.isInViewport(rect),
        zIndex: parseInt(styles.zIndex) || 0,
        opacity: parseFloat(styles.opacity) || 1,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        hasHighContrast: false,
        hasAnimation: false
      },
      structural: {
        tagName: element.tagName.toLowerCase(),
        attributes: {},
        classList: Array.from(element.classList),
        id: element.id,
        isInteractive: false,
        hasChildren: element.children.length > 0,
        childCount: element.children.length,
        depth: 0,
        role: element.getAttribute('role'),
        formElement: false
      },
      semantic: {
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        ariaLabel: element.getAttribute('aria-label'),
        ariaDescribedBy: element.getAttribute('aria-describedby'),
        isLandmark: false,
        headingLevel: 0,
        listItem: false,
        tableCell: false
      },
      context: {
        parentTag: element.parentElement?.tagName.toLowerCase() || '',
        parentText: '',
        siblingTexts: [],
        nearbyHeading: '',
        labelText: '',
        formId: '',
        tableHeaders: []
      },
      timestamp: Date.now()
    };
  }

  private async extractTextFeatures(element: ElementHandle): Promise<TextFeatures> {
    return element.evaluate(el => {
      const content = el.textContent?.trim() || '';
      const visibleText = this.getVisibleText(el as Element);
      
      // Extract different text sources
      const ariaLabel = (el as Element).getAttribute('aria-label') || '';
      const title = (el as Element).getAttribute('title') || '';
      const placeholder = (el as HTMLInputElement).placeholder || '';
      const value = (el as HTMLInputElement).value || '';
      const alt = (el as HTMLImageElement).alt || '';
      
      // Analyze text patterns
      const hasNumbers = /\d/.test(content);
      const hasUppercase = /[A-Z]/.test(content);
      const hasSpecialChars = /[^a-zA-Z0-9\s]/.test(content);
      
      return {
        content,
        visibleText,
        length: content.length,
        words: content.split(/\s+/).filter(w => w).length,
        ariaLabel,
        title,
        placeholder,
        value,
        alt,
        textSources: [content, ariaLabel, title, placeholder, value, alt].filter(t => t),
        hasNumbers,
        hasUppercase,
        hasSpecialChars,
        language: (el as HTMLElement).lang || document.documentElement.lang || 'en'
      };
    });
  }

  private async extractVisualFeatures(element: ElementHandle): Promise<VisualFeatures> {
    return element.evaluate(el => {
      const rect = (el as Element).getBoundingClientRect();
      const styles = window.getComputedStyle(el as Element);
      
      // Check visibility
      const isVisible = !!(
        rect.width > 0 &&
        rect.height > 0 &&
        styles.display !== 'none' &&
        styles.visibility !== 'hidden' &&
        parseFloat(styles.opacity) > 0
      );
      
      // Check if in viewport
      const inViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );
      
      // Calculate contrast ratio
      const hasHighContrast = this.calculateContrast(
        styles.color,
        styles.backgroundColor
      ) > 4.5;
      
      // Check for animations
      const hasAnimation = !!(
        styles.animation !== 'none' ||
        styles.transition !== 'none 0s ease 0s'
      );
      
      // Extract visual hierarchy indicators
      const visualWeight = this.calculateVisualWeight(styles);
      
      return {
        isVisible,
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          toJSON: () => rect.toJSON()
        } as DOMRect,
        inViewport,
        zIndex: parseInt(styles.zIndex) || 0,
        opacity: parseFloat(styles.opacity),
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        hasHighContrast,
        hasAnimation,
        borderStyle: styles.borderStyle,
        boxShadow: styles.boxShadow,
        cursor: styles.cursor,
        display: styles.display,
        position: styles.position,
        visualWeight
      };
    });
  }

  private async extractStructuralFeatures(element: ElementHandle): Promise<StructuralFeatures> {
    return element.evaluate(el => {
      // Collect attributes
      const attributes: Record<string, string> = {};
      Array.from((el as Element).attributes).forEach((attr: Attr) => {
        attributes[attr.name] = attr.value;
      });
      
      // Check if interactive
      const isInteractive = this.isInteractiveElement(el as Element);
      
      // Get structural hierarchy
      const path = this.getElementPath(el as Element);
      const depth = path.length;
      
      // Check form relationship
      const form = (el as Element).closest('form');
      const formElement = !!(form && (
        (el as Element).tagName === 'INPUT' ||
        (el as Element).tagName === 'SELECT' ||
        (el as Element).tagName === 'TEXTAREA' ||
        (el as Element).tagName === 'BUTTON'
      ));
      
      // Get sibling information
      const parent = el.parentElement;
      const siblings = parent ? Array.from(parent.children) : [];
      const siblingIndex = siblings.indexOf(el as Element);
      
      return {
        tagName: (el as Element).tagName.toLowerCase(),
        attributes,
        classList: Array.from((el as Element).classList),
        id: (el as Element).id,
        isInteractive,
        hasChildren: (el as Element).children.length > 0,
        childCount: (el as Element).children.length,
        depth,
        path,
        role: (el as Element).getAttribute('role'),
        formElement,
        inputType: (el as HTMLInputElement).type,
        href: (el as HTMLAnchorElement).href,
        src: (el as HTMLImageElement).src,
        disabled: (el as HTMLInputElement).disabled,
        readOnly: (el as HTMLInputElement).readOnly,
        checked: (el as HTMLInputElement).checked,
        selected: (el as HTMLOptionElement).selected,
        siblingCount: siblings.length,
        siblingIndex,
        isFirstChild: siblingIndex === 0,
        isLastChild: siblingIndex === siblings.length - 1
      };
    });
  }

  private async extractSemanticFeatures(element: ElementHandle): Promise<SemanticFeatures> {
    return element.evaluate(el => {
      // Define inferRole locally
      const inferRole = (element: Element): string => {
        const tagName = element.tagName.toLowerCase();
        
        const roleMap: Record<string, string> = {
          a: 'link',
          button: 'button',
          nav: 'navigation',
          main: 'main',
          header: 'banner',
          footer: 'contentinfo',
          aside: 'complementary',
          article: 'article',
          section: 'region',
          form: 'form',
          search: 'search',
          img: 'img',
          h1: 'heading',
          h2: 'heading',
          h3: 'heading',
          h4: 'heading',
          h5: 'heading',
          h6: 'heading'
        };
        
        return roleMap[tagName] || '';
      };
      
      const role = (el as Element).getAttribute('role') || inferRole(el as Element);
      const ariaLabel = (el as Element).getAttribute('aria-label');
      const ariaDescribedBy = (el as Element).getAttribute('aria-describedby');
      const ariaLabelledBy = (el as Element).getAttribute('aria-labelledby');
      
      // Check if landmark
      const landmarkRoles = ['banner', 'complementary', 'contentinfo', 'form', 
                           'main', 'navigation', 'region', 'search'];
      const isLandmark = landmarkRoles.includes(role);
      
      // Get heading level
      const headingMatch = (el as Element).tagName.match(/^H(\d)$/);
      const headingLevel = headingMatch ? parseInt(headingMatch[1] || '0') : 0;
      
      // Check list context
      const listItem = !!((el as Element).closest('li') || (el as Element).tagName === 'LI');
      const listContainer = (el as Element).closest('ul, ol, dl');
      
      // Check table context
      const tableCell = !!((el as Element).closest('td, th') || ['TD', 'TH'].includes((el as Element).tagName));
      const tableRow = (el as Element).closest('tr');
      const table = (el as Element).closest('table');
      
      // Get semantic meaning
      const semanticType = this.getSemanticType(el as Element);
      
      return {
        role,
        ariaLabel,
        ariaDescribedBy,
        ariaLabelledBy,
        isLandmark,
        headingLevel,
        listItem,
        listContainer: !!listContainer,
        tableCell,
        tableRow: !!tableRow,
        table: !!table,
        semanticType,
        isRequired: (el as HTMLInputElement).required,
        isInvalid: (el as Element).getAttribute('aria-invalid') === 'true',
        describedByElements: ariaDescribedBy ? 
          ariaDescribedBy.split(' ').map((id: string) => 
            document.getElementById(id)?.textContent?.trim()
          ).filter((text): text is string => text !== undefined) : []
      };
    });
  }

  private async extractContextFeatures(element: ElementHandle): Promise<ContextFeatures> {
    return element.evaluate(el => {
      const parent = el.parentElement;
      
      // Get parent context
      const parentTag = parent?.tagName.toLowerCase() || '';
      const parentText = parent?.textContent?.trim().substring(0, 100) || '';
      
      // Get sibling texts
      const siblings = parent ? Array.from(parent.children) : [];
      const siblingTexts = siblings
        .filter(sibling => sibling !== el)
        .map(sibling => sibling.textContent?.trim().substring(0, 50))
        .filter(Boolean) as string[];
      
      // Find nearby heading
      let nearbyHeading = '';
      let currentEl = el as Element | null;
      while (currentEl && !nearbyHeading) {
        const heading = currentEl.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
          nearbyHeading = heading.textContent?.trim() || '';
          break;
        }
        currentEl = currentEl.parentElement;
      }
      
      // Get label text
      let labelText = '';
      if ((el as Element).id) {
        const label = document.querySelector(`label[for="${(el as Element).id}"]`);
        labelText = label?.textContent?.trim() || '';
      }
      if (!labelText) {
        const parentLabel = (el as Element).closest('label');
        labelText = parentLabel?.textContent?.trim() || '';
      }
      
      // Get form context
      const form = (el as Element).closest('form');
      const formId = form?.id || '';
      
      // Get table headers if in table
      const tableHeaders: string[] = [];
      if ((el as Element).tagName === 'TD') {
        const cell = el as HTMLTableCellElement;
        const row = cell.parentElement as HTMLTableRowElement;
        const table = row?.closest('table');
        if (table) {
          const headers = Array.from(table.querySelectorAll('th'));
          const cellIndex = Array.from(row.cells).indexOf(cell);
          if (headers[cellIndex]) {
            tableHeaders.push(headers[cellIndex].textContent?.trim() || '');
          }
        }
      }
      
      // Get position relative to landmarks
      const landmarks = document.querySelectorAll('[role="banner"], [role="main"], [role="navigation"], nav, main, header');
      const nearestLandmark = Array.from(landmarks).find(landmark => 
        landmark.contains(el as Node)
      );
      
      return {
        parentTag,
        parentText,
        siblingTexts,
        nearbyHeading,
        labelText,
        formId,
        tableHeaders,
        nearestLandmark: nearestLandmark ? {
          role: nearestLandmark.getAttribute('role') || (nearestLandmark as Element).tagName.toLowerCase(),
          id: nearestLandmark.id
        } : null,
        precedingText: this.getPrecedingText(el as Element),
        followingText: this.getFollowingText(el as Element)
      };
    });
  }

  private getVisibleText(element: Element): string {
    // Get only visible text, excluding hidden elements
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const styles = window.getComputedStyle(parent);
          if (styles.display === 'none' || 
              styles.visibility === 'hidden' ||
              parseFloat(styles.opacity) === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    const texts: string[] = [];
    let node: Node | null;
    
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text) texts.push(text);
    }
    
    return texts.join(' ');
  }

  private calculateContrast(color: string, backgroundColor: string): number {
    // Simple contrast calculation
    const rgb1 = this.parseColor(color);
    const rgb2 = this.parseColor(backgroundColor);
    
    if (!rgb1 || !rgb2) return 1;
    
    const l1 = this.relativeLuminance(rgb1);
    const l2 = this.relativeLuminance(rgb2);
    
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  private parseColor(color: string): { r: number; g: number; b: number } | null {
    // Parse rgb/rgba colors
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1] || '0'),
        g: parseInt(match[2] || '0'),
        b: parseInt(match[3] || '0')
      };
    }
    return null;
  }

  private relativeLuminance(rgb: { r: number; g: number; b: number }): number {
    const { r, g, b } = rgb;
    const sRGB = [r, g, b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    
    return 0.2126 * (sRGB[0] || 0) + 0.7152 * (sRGB[1] || 0) + 0.0722 * (sRGB[2] || 0);
  }

  private calculateVisualWeight(styles: CSSStyleDeclaration): number {
    let weight = 0;
    
    // Font size
    const fontSize = parseInt(styles.fontSize);
    if (fontSize > 20) weight += 0.3;
    else if (fontSize > 16) weight += 0.2;
    else if (fontSize > 14) weight += 0.1;
    
    // Font weight
    const fontWeight = styles.fontWeight;
    if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) weight += 0.2;
    
    // Colors
    if (styles.color !== 'rgb(0, 0, 0)' && styles.color !== 'inherit') weight += 0.1;
    if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && 
        styles.backgroundColor !== 'transparent') weight += 0.1;
    
    // Borders and shadows
    if (styles.borderStyle !== 'none') weight += 0.1;
    if (styles.boxShadow !== 'none') weight += 0.1;
    
    // Position
    if (styles.position === 'fixed' || styles.position === 'sticky') weight += 0.1;
    
    return Math.min(weight, 1);
  }

  private isInteractiveElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
    
    if (interactiveTags.includes(tagName)) return true;
    
    const role = element.getAttribute('role');
    const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 
                             'combobox', 'tab', 'menuitem'];
    if (role && interactiveRoles.includes(role)) return true;
    
    if (element.hasAttribute('onclick') || 
        element.hasAttribute('ng-click') ||
        element.hasAttribute('data-click') ||
        element.hasAttribute('href')) return true;
    
    const tabindex = element.getAttribute('tabindex');
    if (tabindex && tabindex !== '-1') return true;
    
    return false;
  }

  private getElementPath(element: Element): string[] {
    const path: string[] = [];
    let current: Element | null = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className) {
        const classes = current.className.toString().split(' ').filter(c => c);
        if (classes.length > 0) {
          selector += `.${classes[0]}`;
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path;
  }

  // Removed unused inferRole method - now defined inline where needed
  // This method was previously defined here but is now defined inside evaluate context

  private getSemanticType(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const type = (element as HTMLInputElement).type;
    
    // Input types
    if (tagName === 'input') {
      return `input-${type || 'text'}`;
    }
    
    // Buttons
    if (tagName === 'button' || role === 'button') {
      const buttonType = (element as HTMLButtonElement).type;
      return `button-${buttonType || 'button'}`;
    }
    
    // Links
    if (tagName === 'a') {
      const href = (element as HTMLAnchorElement).href;
      if (href.startsWith('mailto:')) return 'link-email';
      if (href.startsWith('tel:')) return 'link-phone';
      if (href.startsWith('#')) return 'link-anchor';
      return 'link-navigation';
    }
    
    // Lists
    if (tagName === 'ul') return 'list-unordered';
    if (tagName === 'ol') return 'list-ordered';
    if (tagName === 'dl') return 'list-definition';
    
    // Headings
    if (/^h[1-6]$/.test(tagName)) return `heading-${tagName.slice(1)}`;
    
    // Default to tag name
    return tagName;
  }

  private getPrecedingText(element: Element): string {
    const range = document.createRange();
    range.setStartBefore(element);
    range.setEndBefore(element);
    
    const fragment = range.cloneContents();
    const text = fragment.textContent?.trim() || '';
    
    // Get last 50 characters
    return text.slice(-50);
  }

  private getFollowingText(element: Element): string {
    const range = document.createRange();
    range.setStartAfter(element);
    range.setEndAfter(element);
    
    const fragment = range.cloneContents();
    const text = fragment.textContent?.trim() || '';
    
    // Get first 50 characters
    return text.slice(0, 50);
  }

  private isInViewport(rect: DOMRect): boolean {
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }
}