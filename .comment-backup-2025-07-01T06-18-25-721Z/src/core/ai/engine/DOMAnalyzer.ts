// src/core/ai/engine/DOMAnalyzer.ts

import { Page, ElementHandle } from 'playwright';
import { ActionLogger } from '../../logging/ActionLogger';
import {
  DOMAnalysis,
  ElementInfo,
  ElementCandidate,
  SemanticMap,
  FormInfo,
  TableInfo,
  NavigationInfo,
  DOMMetrics
} from '../types/ai.types';

export class DOMAnalyzer {
  private readonly interactiveSelectors = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[onclick]',
    '[ng-click]',
    '[data-click]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  async analyzePage(page: Page): Promise<DOMAnalysis> {
    const startTime = Date.now();
    
    try {
      const analysis = await page.evaluate(() => {
        const getElementInfo = (element: Element, depth: number = 0): ElementInfo => {
          const rect = element.getBoundingClientRect();
          const styles = window.getComputedStyle(element);
          
          // Collect all attributes
          const attributes: Record<string, string> = {};
          Array.from(element.attributes).forEach(attr => {
            attributes[attr.name] = attr.value;
          });

          // Get text content
          const textContent = element.textContent?.trim() || '';
          const childNodes = Array.from(element.childNodes);
          const directText = childNodes
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent?.trim())
            .filter(text => text)
            .join(' ');

          // Determine visibility
          const isVisible = !!(
            rect.width > 0 &&
            rect.height > 0 &&
            styles.display !== 'none' &&
            styles.visibility !== 'hidden' &&
            styles.opacity !== '0'
          );

          // Check if element is in viewport
          const isInViewport = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
          );

          // Get aria attributes
          const ariaAttributes: Record<string, string> = {};
          Array.from(element.attributes)
            .filter(attr => attr.name.startsWith('aria-'))
            .forEach(attr => {
              ariaAttributes[attr.name] = attr.value;
            });

          const info: ElementInfo = {
            tagName: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className.toString(),
            attributes,
            text: textContent,
            directText,
            visible: isVisible,
            inViewport: isInViewport,
            interactive: isInteractiveElement(element),
            position: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
              bottom: rect.bottom,
              right: rect.right
            },
            styles: {
              display: styles.display,
              position: styles.position,
              zIndex: styles.zIndex,
              color: styles.color,
              backgroundColor: styles.backgroundColor,
              fontSize: styles.fontSize,
              fontWeight: styles.fontWeight,
              cursor: styles.cursor
            },
            ariaAttributes,
            depth,
            path: getElementPath(element),
            xpath: getXPath(element),
            children: depth < 3 ? Array.from(element.children).map(child => 
              getElementInfo(child, depth + 1)
            ) : []
          };

          return info;
        };

        const isInteractiveElement = (element: Element): boolean => {
          const tagName = element.tagName.toLowerCase();
          const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
          
          if (interactiveTags.includes(tagName)) return true;
          
          const role = element.getAttribute('role');
          const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox'];
          if (role && interactiveRoles.includes(role)) return true;
          
          if (element.hasAttribute('onclick') || 
              element.hasAttribute('ng-click') ||
              element.hasAttribute('data-click')) return true;
              
          const tabindex = element.getAttribute('tabindex');
          if (tabindex && tabindex !== '-1') return true;
          
          return false;
        };

        const getElementPath = (element: Element): string[] => {
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
        };

        const getXPath = (element: Element): string => {
          if (element.id) {
            return `//*[@id="${element.id}"]`;
          }
          
          const parts: string[] = [];
          let current: Element | null = element;
          
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling = current.previousSibling;
            
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE &&
                  sibling.nodeName === current.nodeName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            
            const tagName = current.nodeName.toLowerCase();
            const part = index > 0 ? `${tagName}[${index + 1}]` : tagName;
            parts.unshift(part);
            
            current = current.parentElement;
          }
          
          return parts.length ? `/${parts.join('/')}` : '';
        };

        // Collect forms
        const forms = Array.from(document.forms).map((form): FormInfo => ({
          name: form.name,
          id: form.id,
          action: form.action,
          method: form.method,
          fields: Array.from(form.elements).map(el => ({
            name: (el as HTMLInputElement).name,
            type: (el as HTMLInputElement).type,
            id: el.id,
            required: (el as HTMLInputElement).required
          })).filter(field => field.name)
        }));

        // Collect tables
        const tables = Array.from(document.querySelectorAll('table')).map((table): TableInfo => ({
          id: table.id,
          className: table.className,
          rows: table.rows.length,
          columns: table.rows[0]?.cells.length || 0,
          headers: Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim() || '')
        }));

        // Collect navigation elements
        const navElements = Array.from(document.querySelectorAll('nav, [role="navigation"]'))
          .map((nav): NavigationInfo => ({
            id: nav.id,
            className: nav.className,
            links: Array.from(nav.querySelectorAll('a')).map(a => ({
              text: a.textContent?.trim() || '',
              href: a.href,
              active: a.classList.contains('active') || a.ariaCurrent === 'page'
            }))
          }));

        // Calculate metrics
        const allElements = document.querySelectorAll('*');
        const visibleElements = Array.from(allElements).filter(el => {
          const rect = el.getBoundingClientRect();
          const styles = window.getComputedStyle(el as Element);
          return rect.width > 0 && rect.height > 0 && 
                 styles.display !== 'none' && styles.visibility !== 'hidden';
        });

        const metrics: DOMMetrics = {
          totalElements: allElements.length,
          visibleElements: visibleElements.length,
          interactableElements: document.querySelectorAll(this.interactiveSelectors).length,
          forms: forms.length,
          tables: tables.length,
          images: document.images.length,
          links: document.links.length,
          maxDepth: this.calculateMaxDepth(document.body),
          averageDepth: this.calculateAverageDepth(document.body)
        };

        return {
          hierarchy: getElementInfo(document.body),
          forms,
          tables,
          navigation: navElements,
          metrics,
          title: document.title,
          url: window.location.href,
          timestamp: Date.now()
        };
      });

      const duration = Date.now() - startTime;
      ActionLogger.logInfo('AI Operation: dom_analyzed', {
        url: page.url(),
        metrics: analysis.metrics,
        duration
      });

      return analysis;

    } catch (error) {
      ActionLogger.logError('DOM analysis failed', error);
      throw error;
    }
  }

  async getCandidateElements(
    page: Page,
    elementType?: string,
    keywords?: string[]
  ): Promise<ElementCandidate[]> {
    const selector = elementType ? 
      this.getSelectorForElementType(elementType) : 
      this.interactiveSelectors;

    try {
      const candidates = await page.evaluate(
        ({ selector, keywords }) => {
          const elements = Array.from(document.querySelectorAll(selector));
          
          return elements.map(element => {
            const rect = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            
            // Get all text content
            const textContent = element.textContent?.trim() || '';
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const placeholder = element.getAttribute('placeholder') || '';
            const value = (element as HTMLInputElement).value || '';
            
            const allText = [textContent, ariaLabel, title, placeholder, value]
              .filter(t => t)
              .join(' ')
              .toLowerCase();

            // Calculate relevance score
            let relevance = 0;
            if (keywords && keywords.length > 0) {
              keywords.forEach(keyword => {
                if (allText.includes(keyword.toLowerCase())) {
                  relevance += 10;
                }
              });
            }

            // Build selector path
            let selector = '';
            if (element.id) {
              selector = `#${element.id}`;
            } else if (element.className) {
              const classes = element.className.toString().split(' ').filter(c => c);
              if (classes.length > 0) {
                selector = `.${classes.join('.')}`;
              }
            } else {
              selector = element.tagName.toLowerCase();
            }

            const attributes: Record<string, string> = {};
            Array.from(element.attributes).forEach(attr => {
              attributes[attr.name] = attr.value;
            });

            return {
              element,
              selector,
              tagName: element.tagName.toLowerCase(),
              text: textContent,
              attributes,
              position: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0 && 
                        styles.display !== 'none' && 
                        styles.visibility !== 'hidden',
              isInteractive: this.isInteractiveTag(element.tagName.toLowerCase()),
              relevance,
              allText,
              page: null // Will be set below
            };
          })
          .filter(candidate => candidate.isVisible)
          .sort((a, b) => b.relevance - a.relevance);
        },
        { selector, keywords }
      );

      // Convert to proper ElementCandidate objects with locators
      const elementCandidates: ElementCandidate[] = [];
      
      for (const candidate of candidates) {
        const locator = page.locator(candidate.selector).first();
        
        elementCandidates.push({
          ...candidate,
          element: (await locator.elementHandle()) as ElementHandle<Node>,
          locator,
          page
        });
      }

      ActionLogger.logInfo('AI Operation: candidates_found', {
        elementType,
        keywords,
        count: elementCandidates.length
      });

      return elementCandidates;

    } catch (error) {
      ActionLogger.logError('Failed to get candidate elements', error);
      return [];
    }
  }

  async getCandidateElementsInContext(
    page: Page,
    context: ElementHandle,
    elementType?: string
  ): Promise<ElementCandidate[]> {
    const selector = elementType ? 
      this.getSelectorForElementType(elementType) : 
      this.interactiveSelectors;

    try {
      const candidates = await context.evaluate(
        (contextEl: Element, selector: string) => {
          const elements = Array.from(contextEl.querySelectorAll(selector));
          
          // Define isInteractiveElement locally
          const isInteractiveElement = (element: Element): boolean => {
            const tagName = element.tagName.toLowerCase();
            const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
            
            if (interactiveTags.includes(tagName)) return true;
            
            const role = element.getAttribute('role');
            const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox'];
            if (role && interactiveRoles.includes(role)) return true;
            
            if (element.hasAttribute('onclick') || 
                element.hasAttribute('ng-click') ||
                element.hasAttribute('data-click')) return true;
                
            const tabindex = element.getAttribute('tabindex');
            if (tabindex && tabindex !== '-1') return true;
            
            return false;
          };
          
          return elements.map(element => {
            const rect = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            
            const attributes: Record<string, string> = {};
            Array.from(element.attributes).forEach(attr => {
              attributes[attr.name] = attr.value;
            });

            return {
              tagName: element.tagName.toLowerCase(),
              text: element.textContent?.trim() || '',
              attributes,
              position: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0 && 
                        styles.display !== 'none' && 
                        styles.visibility !== 'hidden',
              isInteractive: isInteractiveElement(element)
            };
          })
          .filter(candidate => candidate.isVisible);
        },
        selector
      );

      // Convert to ElementCandidate objects
      const elementCandidates: ElementCandidate[] = [];
      
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const locator = page.locator(selector).nth(i);
        
        const elementHandle = await locator.elementHandle();
        if (!elementHandle) continue;
        
        if (candidate) {
          elementCandidates.push({
            element: elementHandle as ElementHandle<Node>,
            locator,
            page,
            selector: selector,
            relevance: 0,
            allText: candidate.text,
            tagName: candidate.tagName,
            text: candidate.text,
            attributes: candidate.attributes,
            position: candidate.position,
            isVisible: candidate.isVisible,
            isInteractive: candidate.isInteractive
          });
        }
      }

      return elementCandidates;

    } catch (error) {
      ActionLogger.logError('Failed to get candidate elements in context', error);
      return [];
    }
  }

  async getAllInteractableElements(page: Page): Promise<ElementCandidate[]> {
    return this.getCandidateElements(page);
  }

  async getElementPath(element: ElementHandle<Node>): Promise<string[]> {
    return element.evaluate(el => {
      const path: string[] = [];
      let current: Element | null = el as Element;
      
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
        
        // Add index if there are siblings with same selector
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(child =>
            child.tagName === current!.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current);
            selector += `:nth-of-type(${index + 1})`;
          }
        }
        
        path.unshift(selector);
        current = current.parentElement;
      }
      
      return path;
    });
  }

  async getElementContext(element: ElementHandle<Node>): Promise<ElementContext> {
    return element.evaluate(el => {
      const parent = el.parentElement;
      const siblings = parent ? Array.from(parent.children) : [];
      const index = siblings.indexOf(el as Element);
      
      // Get surrounding text
      const previousText = index > 0 ? 
        (siblings[index - 1] as Element)?.textContent?.trim() || '' : '';
      const nextText = index < siblings.length - 1 ? 
        (siblings[index + 1] as Element)?.textContent?.trim() || '' : '';
      
      // Get parent context
      const parentText = parent?.textContent?.trim() || '';
      const parentTag = parent?.tagName.toLowerCase() || '';
      
      // Get form context if in a form
      const form = (el as Element).closest('form');
      const formContext = form ? {
        id: form.id,
        name: (form as HTMLFormElement).name,
        action: (form as HTMLFormElement).action
      } : null;
      
      // Get table context if in a table
      const table = (el as Element).closest('table');
      const tableContext = table ? {
        id: table.id,
        className: table.className
      } : null;
      
      // Get section context
      const section = (el as Element).closest('section, article, main, aside, nav, header, footer');
      const sectionContext = section ? {
        tag: section.tagName.toLowerCase(),
        id: section.id,
        className: section.className
      } : null;

      return {
        parentText,
        parentTag,
        previousText,
        nextText,
        siblingCount: siblings.length,
        indexInParent: index,
        formContext,
        tableContext,
        sectionContext,
        depth: this.getElementDepth(el as Element)
      };
    });
  }

  async calculateElementImportance(element: ElementHandle<Node>): Promise<number> {
    return element.evaluate(el => {
      let importance = 0;
      
      // Position scoring
      const rect = (el as Element).getBoundingClientRect();
      if (rect.y < 200) importance += 0.2; // Near top
      if (rect.x < 400) importance += 0.1; // Near left
      
      // Size scoring
      const area = rect.width * rect.height;
      if (area > 10000) importance += 0.2;
      else if (area > 5000) importance += 0.1;
      
      // Visibility scoring
      const styles = window.getComputedStyle(el as Element);
      if (styles.fontSize && parseInt(styles.fontSize) > 16) importance += 0.1;
      if (styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 600) importance += 0.1;
      
      // Interactive element
      if (this.isInteractiveTag((el as Element).tagName.toLowerCase())) importance += 0.2;
      
      // Has ARIA labels
      if ((el as Element).getAttribute('aria-label')) importance += 0.1;
      
      // In main content area
      if ((el as Element).closest('main, [role="main"]')) importance += 0.1;
      
      return Math.min(importance, 1.0);
    });
  }

  async findElementsByPattern(
    page: Page,
    pattern: string
  ): Promise<ElementCandidate[]> {
    // Pattern can be CSS selector, XPath, or text pattern
    let candidates: ElementCandidate[] = [];
    
    try {
      // Try as CSS selector
      if (pattern.match(/^[.#\[][^\/]*$/)) {
        const elements = await page.$$(pattern);
        for (const element of elements) {
          const candidate = await this.elementToCandidate(element, page);
          if (candidate) candidates.push(candidate);
        }
      }
      
      // Try as XPath
      else if (pattern.startsWith('/') || pattern.startsWith('//')) {
        const elements = await page.$$(pattern);
        for (const element of elements) {
          const candidate = await this.elementToCandidate(element, page);
          if (candidate) candidates.push(candidate);
        }
      }
      
      // Try as text pattern
      else {
        const elements = await page.$$(`text="${pattern}"`);
        for (const element of elements) {
          const candidate = await this.elementToCandidate(element, page);
          if (candidate) candidates.push(candidate);
        }
      }
      
      return candidates;
      
    } catch (error) {
      ActionLogger.logWarn('Pattern search failed', { pattern, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  async getSemanticStructure(page: Page): Promise<SemanticMap> {
    return page.evaluate(() => {
      const getSemanticRole = (element: Element): string => {
        // Check explicit role
        const role = element.getAttribute('role');
        if (role) return role;
        
        // Infer from tag
        const tagName = element.tagName.toLowerCase();
        const semanticTags: Record<string, string> = {
          nav: 'navigation',
          main: 'main',
          aside: 'complementary',
          header: 'banner',
          footer: 'contentinfo',
          article: 'article',
          section: 'region',
          form: 'form',
          search: 'search'
        };
        
        return semanticTags[tagName] || tagName;
      };
      
      const analyzeSemantic = (element: Element): any => {
        const children = Array.from(element.children)
          .map(child => analyzeSemantic(child))
          .filter(child => child !== null);
        
        const role = getSemanticRole(element);
        const isLandmark = ['navigation', 'main', 'complementary', 'banner', 
                           'contentinfo', 'form', 'search'].includes(role);
        
        if (isLandmark || element.id || children.length > 0) {
          return {
            role,
            id: element.id,
            className: element.className,
            text: element.textContent?.trim().substring(0, 50),
            children
          };
        }
        
        return null;
      };
      
      return {
        structure: analyzeSemantic(document.body),
        landmarks: Array.from(document.querySelectorAll('[role], nav, main, aside, header, footer, article, section'))
          .map(el => ({
            role: getSemanticRole(el),
            id: el.id,
            className: el.className,
            selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()
          }))
      };
    });
  }

  private getSelectorForElementType(elementType: string): string {
    const selectorMap: Record<string, string> = {
      button: 'button, input[type="button"], input[type="submit"], [role="button"]',
      link: 'a[href], [role="link"]',
      input: 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea',
      text: 'input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"], textarea',
      dropdown: 'select, [role="combobox"]',
      checkbox: 'input[type="checkbox"], [role="checkbox"]',
      radio: 'input[type="radio"], [role="radio"]',
      image: 'img',
      heading: 'h1, h2, h3, h4, h5, h6',
      list: 'ul, ol, dl, [role="list"]',
      table: 'table',
      form: 'form'
    };
    
    return selectorMap[elementType] || this.interactiveSelectors;
  }

  private async elementToCandidate(
    element: ElementHandle | null,
    page: Page
  ): Promise<ElementCandidate | null> {
    try {
      if (!element) return null;
      const info = await element.evaluate(el => {
        const rect = (el as Element).getBoundingClientRect();
        const styles = window.getComputedStyle(el as Element);
        
        const attributes: Record<string, string> = {};
        Array.from((el as Element).attributes).forEach((attr: Attr) => {
          attributes[attr.name] = attr.value;
        });
        
        return {
          tagName: (el as Element).tagName.toLowerCase(),
          text: el.textContent?.trim() || '',
          attributes,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          isVisible: rect.width > 0 && rect.height > 0 && 
                    styles.display !== 'none' && 
                    styles.visibility !== 'hidden'
        };
      });
      
      if (!info.isVisible) return null;
      
      let selector = '';
      if (info.attributes['id']) {
        selector = `#${info.attributes['id']}`;
      } else if (info.attributes['class']) {
        const classes = info.attributes['class'].split(' ').filter(c => c);
        if (classes.length > 0) {
          selector = `.${classes[0]}`;
        }
      } else {
        selector = info.tagName;
      }
      
      return {
        element,
        locator: page.locator(selector).first(),
        selector,
        ...info,
        isInteractive: this.isInteractiveTag(info.tagName),
        relevance: 0,
        allText: info.text,
        page
      };
      
    } catch {
      return null;
    }
  }

  private isInteractiveTag(tagName: string): boolean {
    const interactiveTags = [
      'a', 'button', 'input', 'select', 'textarea',
      'details', 'summary'
    ];
    return interactiveTags.includes(tagName);
  }

  private calculateMaxDepth(element: Element): number {
    if (element.children.length === 0) return 0;
    
    const childDepths = Array.from(element.children).map(child => 
      this.calculateMaxDepth(child)
    );
    
    return 1 + Math.max(...childDepths);
  }

  private calculateAverageDepth(element: Element): number {
    const depths: number[] = [];
    
    const traverse = (el: Element, depth: number) => {
      if (el.children.length === 0) {
        depths.push(depth);
      } else {
        Array.from(el.children).forEach(child => 
          traverse(child, depth + 1)
        );
      }
    };
    
    traverse(element, 0);
    
    return depths.reduce((a, b) => a + b, 0) / depths.length;
  }

  private getElementDepth(element: Element | Node): number {
    let depth = 0;
    let current = (element as Element).parentElement;
    
    while (current && current !== document.body) {
      depth++;
      current = current.parentElement;
    }
    
    return depth;
  }

  async analyzeFormStructure(form: ElementHandle): Promise<FormStructure> {
    return form.evaluate(formEl => {
      const formElement = formEl as HTMLFormElement;
      const fields: FormField[] = [];
      
      // Analyze all form fields
      const inputs = Array.from(formElement.elements);
      
      inputs.forEach(input => {
        if (input.tagName === 'INPUT' || 
            input.tagName === 'SELECT' || 
            input.tagName === 'TEXTAREA') {
          
          const field = input as HTMLInputElement;
          // Continuing DOMAnalyzer.ts...

          const label = this.findLabelForField(field);
          
          const fieldData: FormField = {
            name: field.name,
            id: field.id,
            type: field.type || field.tagName.toLowerCase(),
            required: field.required,
            label: label?.textContent?.trim() || '',
            placeholder: field.placeholder || '',
            value: field.value || '',
          };
          
          if (field.tagName === 'SELECT') {
            fieldData.options = Array.from((field as unknown as HTMLSelectElement).options).map(opt => ({
              value: opt.value,
              text: opt.text
            }));
          }
          
          fields.push(fieldData);
        }
      });
      
      // Group fields by their visual proximity
      const fieldGroups = this.groupFieldsByProximity(fields, formElement);
      
      return {
        id: formElement.id,
        name: formElement.name,
        action: formElement.action,
        method: formElement.method,
        fields,
        fieldGroups,
        submitButtons: Array.from(formElement.querySelectorAll('[type="submit"], button[type="submit"]'))
          .map(btn => ({
            text: btn.textContent?.trim() || '',
            id: btn.id,
            type: (btn as HTMLButtonElement).type || 'submit'
          })),
        enctype: formElement.enctype || 'application/x-www-form-urlencoded'
      };
    });
  }

  private findLabelForField(field: HTMLElement): HTMLLabelElement | null {
    // Check for explicit label
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) return label as HTMLLabelElement;
    }
    
    // Check if field is inside a label
    const parentLabel = field.closest('label');
    if (parentLabel) return parentLabel as HTMLLabelElement;
    
    // Check for aria-labelledby
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = document.getElementById(labelledBy);
      if (label) return label as HTMLLabelElement;
    }
    
    return null;
  }

  private groupFieldsByProximity(fields: FormField[], form: HTMLFormElement): FieldGroup[] {
    const groups: FieldGroup[] = [];
    const processedFields = new Set<string>();
    
    fields.forEach(field => {
      if (processedFields.has(field.id)) return;
      
      const fieldElement = form.querySelector(`#${field.id}`) as HTMLElement;
      if (!fieldElement) return;
      
      const rect = fieldElement.getBoundingClientRect();
      const nearbyFields = fields.filter(other => {
        if (other.id === field.id || processedFields.has(other.id)) return false;
        
        const otherElement = form.querySelector(`#${other.id}`) as HTMLElement;
        if (!otherElement) return false;
        
        const otherRect = otherElement.getBoundingClientRect();
        const distance = Math.sqrt(
          Math.pow(rect.x - otherRect.x, 2) + 
          Math.pow(rect.y - otherRect.y, 2)
        );
        
        return distance < 100; // Within 100px
      });
      
      const group = {
        fields: [field, ...nearbyFields],
        position: { x: rect.x, y: rect.y }
      };
      
      groups.push(group);
      processedFields.add(field.id);
      nearbyFields.forEach(f => processedFields.add(f.id));
    });
    
    return groups;
  }

  async findElementsBySemanticMeaning(
    page: Page,
    meaning: string
  ): Promise<ElementCandidate[]> {
    // Map semantic meanings to selectors
    const semanticMap: Record<string, string[]> = {
      'submit': ['button[type="submit"]', 'input[type="submit"]', 'button:contains("submit")', 'button:contains("save")'],
      'cancel': ['button:contains("cancel")', 'a:contains("cancel")', '[aria-label*="cancel"]'],
      'close': ['button[aria-label*="close"]', '.close', '[class*="close"]', 'button:contains("×")'],
      'navigation': ['nav', '[role="navigation"]', '.navigation', '#navigation'],
      'search': ['input[type="search"]', '[role="search"]', '[aria-label*="search"]', '#search'],
      'login': ['#login', '.login', '[class*="login"]', 'button:contains("login")', 'a:contains("login")'],
      'logout': ['#logout', '.logout', '[class*="logout"]', 'button:contains("logout")', 'a:contains("logout")'],
      'menu': ['[role="menu"]', '.menu', '#menu', '[aria-label*="menu"]'],
      'primary': ['.primary', '.btn-primary', '[class*="primary"]', 'button.primary'],
      'secondary': ['.secondary', '.btn-secondary', '[class*="secondary"]', 'button.secondary']
    };
    
    const selectors = semanticMap[meaning.toLowerCase()] || [];
    const candidates: ElementCandidate[] = [];
    
    // Remove unused selector variable
    for (const _ of selectors) {
      try {
        const elements = await this.getCandidateElements(page, undefined, [meaning]);
        candidates.push(...elements);
      } catch (error) {
        // Continue with other selectors
      }
    }
    
    // Remove duplicates
    const uniqueCandidates = candidates.filter((candidate, index, self) =>
      index === self.findIndex(c => c.selector === candidate.selector)
    );
    
    return uniqueCandidates;
  }

  async buildSemanticMap(page: Page): Promise<SemanticMap> {
    const landmarks = await page.evaluate(() => {
      const landmarkRoles = ['banner', 'main', 'navigation', 'contentinfo', 'search', 'complementary'];
      const landmarks: Array<{
        role: string;
        id: string;
        className: string;
        selector: string;
      }> = [];
      
      // Find elements with landmark roles
      landmarkRoles.forEach(role => {
        const elements = document.querySelectorAll(`[role="${role}"]`);
        elements.forEach((el, index) => {
          const htmlEl = el as HTMLElement;
          landmarks.push({
            role,
            id: htmlEl.id || `${role}_${index}`,
            className: htmlEl.className || '',
            selector: htmlEl.id ? `#${htmlEl.id}` : `[role="${role}"]:nth-of-type(${index + 1})`
          });
        });
      });
      
      // Find semantic HTML5 elements
      const semanticTags = ['nav', 'main', 'header', 'footer', 'aside', 'article', 'section'];
      semanticTags.forEach(tag => {
        const elements = document.querySelectorAll(tag);
        elements.forEach((el, index) => {
          const htmlEl = el as HTMLElement;
          if (!htmlEl.getAttribute('role')) {
            landmarks.push({
              role: tag,
              id: htmlEl.id || `${tag}_${index}`,
              className: htmlEl.className || '',
              selector: htmlEl.id ? `#${htmlEl.id}` : `${tag}:nth-of-type(${index + 1})`
            });
          }
        });
      });
      
      return landmarks;
    });
    
    return {
      structure: {},
      landmarks
    };
  }
}

interface ElementContext {
  parentText: string;
  parentTag: string;
  previousText: string;
  nextText: string;
  siblingCount: number;
  indexInParent: number;
  formContext: { id: string; name: string; action: string } | null;
  tableContext: { id: string; className: string } | null;
  sectionContext: { tag: string; id: string; className: string } | null;
  depth: number;
}

interface FormField {
  name: string;
  id: string;
  type: string;
  required: boolean;
  label: string;
  placeholder: string;
  value: string;
  options?: { value: string; text: string }[];
}

interface FormStructure {
  id: string;
  name: string;
  action: string;
  method: string;
  fields: FormField[];
  fieldGroups: FormFieldGroup[];
  submitButtons: { text: string; id: string; type: string }[];
  enctype: string;
}

interface FormFieldGroup {
  fields: FormField[];
  label?: string;
}

interface FieldGroup {
  fields: FormField[];
  position: { x: number; y: number };
}