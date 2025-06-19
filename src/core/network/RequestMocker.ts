// src/core/network/RequestMocker.ts
import { Page } from 'playwright';
import { NetworkInterceptor } from './NetworkInterceptor';
import { 
  MockResponse, 
  URLPattern, 
  NetworkError,
  MockCondition,
  MockCall,
  MockSequenceItem
} from './types/network.types';
import { FileUtils } from '../utils/FileUtils';
import { ActionLogger } from '../logging/ActionLogger';

export class RequestMocker {
  private networkInterceptor: NetworkInterceptor;
  private mockCallHistory: Map<string, MockCall[]> = new Map();
  private mockSequences: Map<string, { items: MockSequenceItem[]; currentIndex: number }> = new Map();
  private conditionalMocks: Map<string, { condition: MockCondition; response: MockResponse }[]> = new Map();
  private mockTemplates: Map<string, string> = new Map();
  private dynamicMocks: Map<string, (request: any) => MockResponse> = new Map();

  constructor(page: Page) {
    this.networkInterceptor = new NetworkInterceptor(page);
  }

  /**
   * Mock endpoint with static response
   */
  async mockEndpoint(url: string, response: MockResponse): Promise<void> {
    try {
      ActionLogger.logInfo('mockEndpoint', {
        url,
        status: response.status,
        hasBody: !!response.body || !!response.json || !!response.text
      });

      const pattern: URLPattern = { url };
      
      // Track mock setup
      this.initializeMockTracking(url);

      // Set up interception
      await this.networkInterceptor.mockResponse(pattern, response);

      ActionLogger.logInfo('mockEndpoint.registered', {
        url,
        responseType: this.getResponseType(response)
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockEndpoint', error as Error);
      throw new Error(`Failed to mock endpoint ${url}: ${(error as Error).message}`);
    }
  }

  /**
   * Mock endpoint from file
   */
  async mockFromFile(url: string, filePath: string): Promise<void> {
    try {
      ActionLogger.logInfo('mockFromFile', {
        url,
        filePath
      });

      // Read file content
      const fileContent = await FileUtils.readFile(filePath);
      const contentType = this.getContentTypeFromFile(filePath);

      let response: MockResponse;

      if (contentType.includes('json')) {
        // Parse JSON file
        try {
          const json = JSON.parse(fileContent.toString());
          response = {
            status: 200,
            json,
            contentType
          };
        } catch (parseError) {
          throw new Error(`Invalid JSON in file ${filePath}: ${(parseError as Error).message}`);
        }
      } else {
        // Use as text/binary
        response = {
          status: 200,
          body: fileContent,
          contentType
        };
      }

      await this.mockEndpoint(url, response);

      ActionLogger.logInfo('mockFromFile.complete', {
        url,
        filePath,
        contentType,
        size: fileContent.length
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockFromFile', error as Error);
      throw new Error(`Failed to mock from file: ${(error as Error).message}`);
    }
  }

  /**
   * Mock from template with data interpolation
   */
  async mockFromTemplate(
    url: string, 
    template: string, 
    data: any
  ): Promise<void> {
    try {
      ActionLogger.logInfo('mockFromTemplate', {
        url,
        templateLength: template.length,
        dataKeys: Object.keys(data)
      });

      // Store template for reuse
      this.mockTemplates.set(url, template);

      // Process template
      const processedContent = this.processTemplate(template, data);

      // Determine response type
      let response: MockResponse;
      
      try {
        // Try to parse as JSON
        const json = JSON.parse(processedContent);
        response = {
          status: 200,
          json,
          contentType: 'application/json'
        };
      } catch {
        // Treat as text
        response = {
          status: 200,
          text: processedContent,
          contentType: 'text/plain'
        };
      }

      await this.mockEndpoint(url, response);

      ActionLogger.logInfo('mockFromTemplate.complete', {
        url,
        processedLength: processedContent.length
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockFromTemplate', error as Error);
      throw new Error(`Failed to mock from template: ${(error as Error).message}`);
    }
  }

  /**
   * Mock error response
   */
  async mockError(url: string, error: NetworkError): Promise<void> {
    try {
      ActionLogger.logInfo('mockError', {
        url,
        errorType: error.type,
        message: error.message
      });

      const pattern: URLPattern = { url };
      
      await this.networkInterceptor.simulateNetworkError(pattern, error);

      ActionLogger.logInfo('mockError.registered', {
        url,
        error: error.type
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockError', error as Error);
      throw new Error(`Failed to mock error: ${(error as Error).message}`);
    }
  }

  /**
   * Mock with delay
   */
  async mockDelay(url: string, delay: number): Promise<void> {
    try {
      ActionLogger.logInfo('mockDelay', {
        url,
        delay
      });

      const pattern: URLPattern = { url };
      
      await this.networkInterceptor.delayRequests(pattern, delay);

      ActionLogger.logInfo('mockDelay.registered', {
        url,
        delayMs: delay
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockDelay', error as Error);
      throw new Error(`Failed to mock delay: ${(error as Error).message}`);
    }
  }

  /**
   * Mock sequence of responses
   */
  async mockSequence(url: string, responses: MockResponse[]): Promise<void> {
    try {
      ActionLogger.logInfo('mockSequence', {
        url,
        sequenceLength: responses.length
      });

      if (responses.length === 0) {
        throw new Error('Response sequence cannot be empty');
      }

      // Initialize sequence tracking
      this.mockSequences.set(url, {
        items: responses.map((response, index) => ({
          response,
          index,
          used: false
        })),
        currentIndex: 0
      });

      // Set up dynamic mock
      const pattern: URLPattern = { url };
      
      await this.networkInterceptor.interceptRequest(pattern, async (route, request) => {
        const sequence = this.mockSequences.get(url);
        
        if (!sequence) {
          await route.continue();
          return;
        }

        // Get current response
        const currentItem = sequence.items[sequence.currentIndex];
        if (!currentItem) {
          await route.continue();
          return;
        }
        const response = currentItem.response;

        // Mark as used
        currentItem.used = true;

        // Advance to next response (loop if at end)
        sequence.currentIndex = (sequence.currentIndex + 1) % sequence.items.length;

        ActionLogger.logInfo('mockSequence.serving', {
          url: request.url(),
          sequenceIndex: sequence.currentIndex,
          status: response.status
        });

        // Apply delay if specified
        if (response.delay) {
          await new Promise(resolve => setTimeout(resolve, response.delay));
        }

        // Fulfill with response
        await route.fulfill({
          status: response.status || 200,
          headers: {
            'Content-Type': response.contentType || 'application/json',
            ...response.headers
          },
          body: this.getResponseBody(response)
        });

        // Track call
        this.recordMockCall(url, request, response);
      });

      ActionLogger.logInfo('mockSequence.registered', {
        url,
        responses: responses.length
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockSequence', error as Error);
      throw new Error(`Failed to mock sequence: ${(error as Error).message}`);
    }
  }

  /**
   * Mock with conditional logic
   */
  async mockConditional(
    url: string, 
    condition: MockCondition, 
    response: MockResponse
  ): Promise<void> {
    try {
      ActionLogger.logInfo('mockConditional', {
        url,
        hasCondition: true
      });

      // Store conditional mock
      if (!this.conditionalMocks.has(url)) {
        this.conditionalMocks.set(url, []);
      }
      
      this.conditionalMocks.get(url)!.push({ condition, response });

      // Set up interception
      const pattern: URLPattern = { url };
      
      await this.networkInterceptor.interceptRequest(pattern, async (route, request) => {
        const conditions = this.conditionalMocks.get(url);
        
        if (!conditions) {
          await route.continue();
          return;
        }

        // Find matching condition
        let matchedResponse: MockResponse | null = null;
        
        for (const { condition, response } of conditions) {
          if (condition(request)) {
            matchedResponse = response;
            break;
          }
        }

        if (!matchedResponse) {
          // No condition matched, continue normally
          await route.continue();
          return;
        }

        ActionLogger.logInfo('mockConditional.matched', {
          url: request.url(),
          status: matchedResponse.status
        });

        // Apply delay if specified
        if (matchedResponse.delay) {
          await new Promise(resolve => setTimeout(resolve, matchedResponse.delay));
        }

        // Fulfill with matched response
        await route.fulfill({
          status: matchedResponse.status || 200,
          headers: {
            'Content-Type': matchedResponse.contentType || 'application/json',
            ...matchedResponse.headers
          },
          body: this.getResponseBody(matchedResponse)
        });

        // Track call
        this.recordMockCall(url, request, matchedResponse);
      });

      ActionLogger.logInfo('mockConditional.registered', {
        url,
        conditionsCount: this.conditionalMocks.get(url)!.length
      });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockConditional', error as Error);
      throw new Error(`Failed to mock conditional: ${(error as Error).message}`);
    }
  }

  /**
   * Mock with dynamic response generator
   */
  async mockDynamic(
    url: string,
    responseGenerator: (request: any) => MockResponse
  ): Promise<void> {
    try {
      ActionLogger.logInfo('mockDynamic', {
        url,
        hasDynamicGenerator: true
      });

      // Store dynamic mock
      this.dynamicMocks.set(url, responseGenerator);

      // Set up interception
      const pattern: URLPattern = { url };
      
      await this.networkInterceptor.interceptRequest(pattern, async (route, request) => {
        const generator = this.dynamicMocks.get(url);
        
        if (!generator) {
          await route.continue();
          return;
        }

        try {
          // Generate response based on request
          const requestData = {
            url: request.url(),
            method: request.method(),
            headers: request.headers(),
            postData: request.postData(),
            params: this.extractUrlParams(request.url())
          };

          const response = generator(requestData);

          ActionLogger.logInfo('mockDynamic.generated', {
            url: request.url(),
            status: response.status
          });

          // Apply delay if specified
          if (response.delay) {
            await new Promise(resolve => setTimeout(resolve, response.delay));
          }

          // Fulfill with generated response
          await route.fulfill({
            status: response.status || 200,
            headers: {
              'Content-Type': response.contentType || 'application/json',
              ...response.headers
            },
            body: this.getResponseBody(response)
          });

          // Track call
          this.recordMockCall(url, request, response);
        } catch (generatorError) {
          ActionLogger.logError('RequestMocker.mockDynamic.generator', generatorError as Error);
          await route.abort('failed');
        }
      });

      ActionLogger.logInfo('mockDynamic.registered', { url });
    } catch (error) {
      ActionLogger.logError('RequestMocker.mockDynamic', error as Error);
      throw new Error(`Failed to mock dynamic: ${(error as Error).message}`);
    }
  }

  /**
   * Clear all mocks
   */
  async clearMocks(): Promise<void> {
    try {
      ActionLogger.logInfo('clearMocks', {
        totalMocks: this.getAllMocksCount()
      });

      await this.networkInterceptor.clearInterceptors();
      
      this.mockCallHistory.clear();
      this.mockSequences.clear();
      this.conditionalMocks.clear();
      this.mockTemplates.clear();
      this.dynamicMocks.clear();

      ActionLogger.logInfo('clearMocks.complete');
    } catch (error) {
      ActionLogger.logError('RequestMocker.clearMocks', error as Error);
      throw new Error(`Failed to clear mocks: ${(error as Error).message}`);
    }
  }

  /**
   * Clear specific mock
   */
  async clearMock(url: string): Promise<void> {
    try {
      ActionLogger.logInfo('clearMock', { url });

      // Remove from tracking
      this.mockCallHistory.delete(url);
      this.mockSequences.delete(url);
      this.conditionalMocks.delete(url);
      this.mockTemplates.delete(url);
      this.dynamicMocks.delete(url);

      // Note: Individual route removal not supported in Playwright
      // Would need to re-register all other mocks

      ActionLogger.logInfo('clearMock.complete', { url });
    } catch (error) {
      ActionLogger.logError('RequestMocker.clearMock', error as Error);
      throw new Error(`Failed to clear mock: ${(error as Error).message}`);
    }
  }

  /**
   * Get mock call history
   */
  getMockCalls(url: string): MockCall[] {
    return this.mockCallHistory.get(url) || [];
  }

  /**
   * Verify mock was called
   */
  verifyMockCalled(url: string, times?: number): boolean {
    const calls = this.getMockCalls(url);
    
    if (times === undefined) {
      return calls.length > 0;
    }
    
    return calls.length === times;
  }

  /**
   * Get all mock calls
   */
  getAllMockCalls(): Map<string, MockCall[]> {
    return new Map(this.mockCallHistory);
  }

  /**
   * Reset mock sequences
   */
  resetMockSequences(): void {
    this.mockSequences.forEach(sequence => {
      sequence.currentIndex = 0;
      sequence.items.forEach(item => {
        item.used = false;
      });
    });

    ActionLogger.logInfo('resetMockSequences', {
      sequencesReset: this.mockSequences.size
    });
  }

  /**
   * Get mock statistics
   */
  getMockStats(): Record<string, any> {
    const totalCalls = Array.from(this.mockCallHistory.values())
      .reduce((sum, calls) => sum + calls.length, 0);

    const mockTypes = {
      sequences: this.mockSequences.size,
      conditional: this.conditionalMocks.size,
      dynamic: this.dynamicMocks.size,
      templates: this.mockTemplates.size
    };

    const callsByUrl: Record<string, number> = {};
    this.mockCallHistory.forEach((calls, url) => {
      callsByUrl[url] = calls.length;
    });

    return {
      totalMocks: this.getAllMocksCount(),
      totalCalls,
      mockTypes,
      callsByUrl,
      averageResponseTime: this.calculateAverageResponseTime()
    };
  }

  // Private helper methods

  private initializeMockTracking(url: string): void {
    if (!this.mockCallHistory.has(url)) {
      this.mockCallHistory.set(url, []);
    }
  }

  private recordMockCall(
    url: string, 
    request: any, 
    response: MockResponse
  ): void {
    const call: MockCall = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData(),
      timestamp: new Date(),
      matchedPattern: url,
      response: {
        status: response.status || 200,
        headers: response.headers || {},
        body: this.getResponseBody(response)
      }
    };

    if (!this.mockCallHistory.has(url)) {
      this.mockCallHistory.set(url, []);
    }

    this.mockCallHistory.get(url)!.push(call);

    // Limit history
    const calls = this.mockCallHistory.get(url)!;
    if (calls.length > 100) {
      calls.shift();
    }
  }

  private getResponseBody(response: MockResponse): string {
    if (response.json !== undefined) {
      return JSON.stringify(response.json);
    } else if (response.text !== undefined) {
      return response.text;
    } else if (response.body !== undefined) {
      return response.body;
    }
    return '';
  }

  private getResponseType(response: MockResponse): string {
    if (response.json !== undefined) return 'json';
    if (response.text !== undefined) return 'text';
    if (response.body !== undefined) return 'body';
    if (response.path !== undefined) return 'file';
    return 'empty';
  }

  private getContentTypeFromFile(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    const contentTypes: Record<string, string> = {
      'json': 'application/json',
      'xml': 'application/xml',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf'
    };

    return contentTypes[extension || ''] || 'application/octet-stream';
  }

  private processTemplate(template: string, data: any): string {
    let processed = template;

    // Replace placeholders {{key}} with data values
    const placeholderRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    
    processed = processed.replace(placeholderRegex, (match, key) => {
      const value = this.getNestedValue(data, key);
      return value !== undefined ? String(value) : match;
    });

    // Handle loops {#each items}...{/each}
    const loopRegex = /\{#each\s+(\w+)\}([\s\S]*?)\{\/each\}/g;
    
    processed = processed.replace(loopRegex, (_match, arrayKey, loopContent) => {
      const array = data[arrayKey];
      if (!Array.isArray(array)) return '';
      
      return array.map((item, index) => {
        let itemContent = loopContent;
        
        // Replace item placeholders
        itemContent = itemContent.replace(/\{\{item\.(\w+)\}\}/g, (m: string, prop: string) => {
          return item[prop] !== undefined ? String(item[prop]) : m;
        });
        
        // Replace index
        itemContent = itemContent.replace(/\{\{index\}\}/g, String(index));
        
        return itemContent;
      }).join('');
    });

    // Handle conditionals {#if condition}...{/if}
    const conditionalRegex = /\{#if\s+(\w+)\}([\s\S]*?)\{\/if\}/g;
    
    processed = processed.replace(conditionalRegex, (_match, condition, content) => {
      const value = data[condition];
      return value ? content : '';
    });

    return processed;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private extractUrlParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    } catch {
      // Invalid URL, return empty params
    }
    
    return params;
  }

  private getAllMocksCount(): number {
    return this.mockSequences.size + 
           this.conditionalMocks.size + 
           this.dynamicMocks.size + 
           this.mockTemplates.size;
  }

  private calculateAverageResponseTime(): number {
    let totalTime = 0;
    let totalCalls = 0;

    this.mockCallHistory.forEach(calls => {
      calls.forEach(call => {
        if (call.responseTime) {
          totalTime += call.responseTime;
          totalCalls++;
        }
      });
    });

    return totalCalls > 0 ? totalTime / totalCalls : 0;
  }
}