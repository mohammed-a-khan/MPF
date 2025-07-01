// src/api/client/RetryHandler.ts
import { Response, RetryOptions } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

export class RetryHandler {
  private readonly defaultMaxRetries: number;
  private readonly defaultDelay: number;
  private readonly maxDelay: number;
  private readonly jitterFactor: number;

  constructor() {
    this.defaultMaxRetries = ConfigurationManager.getInt('API_RETRY_COUNT', 3);
    this.defaultDelay = ConfigurationManager.getInt('API_RETRY_DELAY', 1000);
    this.maxDelay = ConfigurationManager.getInt('API_MAX_RETRY_DELAY', 30000);
    this.jitterFactor = ConfigurationManager.getInt('API_RETRY_JITTER_FACTOR', 0.1);
  }

  public async executeWithRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? this.defaultMaxRetries;
    const delay = options?.delay ?? this.defaultDelay;
    const backoff = options?.backoff ?? 'exponential';
    const retryCondition = options?.retryCondition ?? this.defaultRetryCondition;
    const onRetry = options?.onRetry;

    let lastError: Error | undefined;
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        ActionLogger.getInstance().debug(`Executing request attempt ${attempt + 1}/${maxRetries + 1}`);
        
        const result = await fn();
        
        if (this.isResponse(result)) {
          lastResponse = result as unknown as Response;
          if (attempt < maxRetries && retryCondition(null, lastResponse)) {
            const retryDelay = this.calculateDelay(attempt, delay, backoff);
            
            ActionLogger.getInstance().info(`Retrying due to response condition. Status: ${lastResponse.status}`, {
              attempt: attempt + 1,
              maxRetries,
              delayMs: retryDelay,
              status: lastResponse.status
            });

            if (onRetry) {
              onRetry(null, attempt + 1);
            }

            await this.sleep(retryDelay);
            continue;
          }
        }

        if (attempt > 0) {
          ActionLogger.getInstance().info(`Request succeeded after ${attempt} retries`);
        }
        return result;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt >= maxRetries || !retryCondition(error, undefined)) {
          ActionLogger.getInstance().logError(lastError, `Request failed after ${attempt + 1} attempts`);
          throw error;
        }

        const retryDelay = this.calculateDelay(attempt, delay, backoff);
        
        ActionLogger.getInstance().warn(`Request failed, retrying...`, {
          error: lastError.message,
          attempt: attempt + 1,
          maxRetries,
          delayMs: retryDelay
        });

        if (onRetry) {
          onRetry(lastError, attempt + 1);
        }

        await this.sleep(retryDelay);
      }
    }

    throw lastError || new Error('Retry handler failed without error');
  }

  private calculateDelay(attempt: number, baseDelay: number, backoff: string): number {
    let delay: number;

    switch (backoff) {
      case 'linear':
        delay = baseDelay * (attempt + 1);
        break;
      
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt);
        break;
      
      case 'fibonacci':
        delay = baseDelay * this.fibonacci(attempt + 1);
        break;
      
      default:
        delay = baseDelay;
    }

    delay = Math.min(delay, this.maxDelay);

    const jitter = delay * this.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.round(delay + jitter);

    return Math.max(delay, 0);
  }

  private fibonacci(n: number): number {
    if (n <= 1) return n;
    let prev = 0;
    let curr = 1;
    
    for (let i = 2; i <= n; i++) {
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    
    return curr;
  }

  private defaultRetryCondition(error: any, response?: Response): boolean {
    if (error) {
      const retryableErrors = [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETUNREACH',
        'EHOSTUNREACH',
        'EPIPE',
        'ECONNABORTED'
      ];

      if (error.code && retryableErrors.includes(error.code)) {
        return true;
      }

      if (error.message && error.message.toLowerCase().includes('timeout')) {
        return true;
      }
    }

    if (response) {
      if (response.status >= 500 && response.status < 600) {
        return true;
      }

      if (response.status === 429) {
        return true;
      }

      if (response.status === 408) {
        return true;
      }
    }

    return false;
  }

  private isResponse(obj: any): boolean {
    return obj && 
           typeof obj === 'object' && 
           'status' in obj && 
           'headers' in obj && 
           'body' in obj;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public createRetryCondition(config: {
    statusCodes?: number[];
    errorCodes?: string[];
    errorPatterns?: RegExp[];
    customCondition?: (error: any, response?: Response) => boolean;
  }): (error: any, response?: Response) => boolean {
    return (error: any, response?: Response) => {
      if (config.customCondition && config.customCondition(error, response)) {
        return true;
      }

      if (error && config.errorCodes && error.code && config.errorCodes.includes(error.code)) {
        return true;
      }

      if (error && config.errorPatterns && error.message) {
        for (const pattern of config.errorPatterns) {
          if (pattern.test(error.message)) {
            return true;
          }
        }
      }

      if (response && config.statusCodes && config.statusCodes.includes(response.status)) {
        return true;
      }

      return this.defaultRetryCondition(error, response);
    };
  }

  public async retryWithExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.defaultMaxRetries,
    initialDelay: number = this.defaultDelay
  ): Promise<T> {
    return this.executeWithRetry(fn, {
      maxRetries,
      delay: initialDelay,
      backoff: 'exponential'
    });
  }

  public async retryWithLinearBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.defaultMaxRetries,
    delay: number = this.defaultDelay
  ): Promise<T> {
    return this.executeWithRetry(fn, {
      maxRetries,
      delay,
      backoff: 'linear'
    });
  }

  public async retryWithFibonacciBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.defaultMaxRetries,
    baseDelay: number = this.defaultDelay
  ): Promise<T> {
    return this.executeWithRetry(fn, {
      maxRetries,
      delay: baseDelay,
      backoff: 'fibonacci'
    });
  }

  public calculateRetryAfter(response: Response): number | null {
    const retryAfterHeader = response.headers['retry-after'] || response.headers['Retry-After'];
    
    if (!retryAfterHeader) {
      return null;
    }

    const retryAfter = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;

    const seconds = parseInt(retryAfter || '', 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    const retryDate = new Date(retryAfter || '');
    if (!isNaN(retryDate.getTime())) {
      const delay = retryDate.getTime() - Date.now();
      return delay > 0 ? delay : 0;
    }

    return null;
  }

  public async retryWithRateLimitHandling<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const enhancedOptions: RetryOptions = {
      maxRetries: options?.maxRetries ?? this.defaultMaxRetries,
      delay: options?.delay ?? this.defaultDelay,
      ...options,
      retryCondition: (error, response) => {
        const shouldRetry = options?.retryCondition 
          ? options.retryCondition(error, response)
          : this.defaultRetryCondition(error, response);

        if (!shouldRetry) {
          return false;
        }

        if (response && response.status === 429) {
          const retryAfter = this.calculateRetryAfter(response);
          if (retryAfter !== null) {
            ActionLogger.getInstance().info(`Rate limited. Retry after: ${retryAfter}ms`);
            (response as any).__retryDelay = retryAfter;
          }
        }

        return true;
      }
    };

    return this.executeWithRetry(async () => {
      try {
        const result = await fn();
        
        if (this.isResponse(result) && (result as any).__retryDelay) {
          await this.sleep((result as any).__retryDelay);
          delete (result as any).__retryDelay;
        }
        
        return result;
      } catch (error) {
        throw error;
      }
    }, enhancedOptions);
  }
}
