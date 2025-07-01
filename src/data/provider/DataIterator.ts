// src/data/provider/DataIterator.ts

import { TestData, IteratorOptions, IteratorState } from '../types/data.types';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class DataIterator implements Iterator<TestData>, Iterable<TestData> {
    private data: TestData[];
    private currentIndex: number = 0;
    private options: IteratorOptions;
    private state: IteratorState;
    private skipIndices: Set<number> = new Set();
    private processedIndices: Set<number> = new Set();
    
    constructor(data: TestData[], options: IteratorOptions = {}) {
        this.data = data;
        this.options = {} as IteratorOptions;
        if (options.batchSize !== undefined) this.options.batchSize = options.batchSize;
        if (options.shuffle !== undefined) this.options.shuffle = options.shuffle;
        if (options.loop !== undefined) this.options.loop = options.loop;
        if (options.filter !== undefined) this.options.filter = options.filter;
        if (options.skip !== undefined) this.options.skip = options.skip;
        if (options.take !== undefined) this.options.take = options.take;
        if (options.parallel !== undefined) this.options.parallel = options.parallel;
        if (options.onBeforeIteration !== undefined) this.options.onBeforeIteration = options.onBeforeIteration;
        if (options.onAfterIteration !== undefined) this.options.onAfterIteration = options.onAfterIteration;
        if (options.onError !== undefined) this.options.onError = options.onError;
        
        this.state = {
            totalItems: this.data.length,
            currentIndex: 0,
            iterationCount: 0,
            batchCount: 0,
            errors: [],
            startTime: Date.now()
        };
        
        this.initialize();
    }

    private initialize(): void {
        if (this.options.filter) {
            this.data = this.data.filter(this.options.filter);
            this.state.totalItems = this.data.length;
        }
        
        if (this.options.shuffle) {
            this.shuffleData();
        }
        
        if (this.options.skip && this.options.skip > 0) {
            this.currentIndex = Math.min(this.options.skip, this.data.length);
        }
        
        logger.debug(`DataIterator initialized with ${this.state.totalItems} items`);
    }

    next(): IteratorResult<TestData> {
        if (this.isComplete()) {
            if (this.options.loop) {
                this.reset();
            } else {
                return { done: true, value: undefined };
            }
        }
        
        const item = this.getNextItem();
        if (!item) {
            return { done: true, value: undefined };
        }
        
        return { done: false, value: item };
    }

    [Symbol.iterator](): Iterator<TestData> {
        return this;
    }

    private getNextItem(): TestData | null {
        while (this.skipIndices.has(this.currentIndex) && this.currentIndex < this.data.length) {
            this.currentIndex++;
        }
        
        if (this.currentIndex >= this.data.length) {
            return null;
        }
        
        if (this.options.take && this.state.iterationCount >= this.options.take) {
            return null;
        }
        
        const item = this.data[this.currentIndex];
        if (item === undefined) {
            return null;
        }
        
        if (this.options.onBeforeIteration && item) {
            try {
                this.options.onBeforeIteration(item, this.currentIndex, this.state);
            } catch (error) {
                this.handleError(error, item);
            }
        }
        
        this.processedIndices.add(this.currentIndex);
        this.currentIndex++;
        this.state.currentIndex = this.currentIndex;
        this.state.iterationCount++;
        
        if (this.options.onAfterIteration && item) {
            try {
                this.options.onAfterIteration(item, this.currentIndex - 1, this.state);
            } catch (error) {
                this.handleError(error, item);
            }
        }
        
        ActionLogger.logInfo('Data iterator operation: next', {
            operation: 'data_iterator_next',
            index: this.currentIndex - 1,
            total: this.state.totalItems,
            item: item
        });
        
        return item || null;
    }

    nextBatch(): TestData[] {
        const batch: TestData[] = [];
        const batchSize = this.options.batchSize || 1;
        
        for (let i = 0; i < batchSize; i++) {
            const result = this.next();
            if (result.done) break;
            if (result.value) batch.push(result.value);
        }
        
        if (batch.length > 0) {
            this.state.batchCount++;
            ActionLogger.logInfo('Data iterator operation: batch', {
                operation: 'data_iterator_batch',
                batchNumber: this.state.batchCount,
                batchSize: batch.length
            });
        }
        
        return batch;
    }

    remaining(): TestData[] {
        const remaining: TestData[] = [];
        let result = this.next();
        
        while (!result.done && result.value) {
            remaining.push(result.value);
            result = this.next();
        }
        
        return remaining;
    }

    peek(): TestData | null {
        if (this.isComplete()) return null;
        
        let peekIndex = this.currentIndex;
        while (this.skipIndices.has(peekIndex) && peekIndex < this.data.length) {
            peekIndex++;
        }
        
        if (peekIndex < this.data.length) {
            const item = this.data[peekIndex];
            return item !== undefined ? item : null;
        }
        return null;
    }

    skip(): void {
        if (this.currentIndex < this.data.length) {
            this.skipIndices.add(this.currentIndex);
            this.currentIndex++;
            this.state.currentIndex = this.currentIndex;
        }
    }

    skipMany(count: number): void {
        for (let i = 0; i < count; i++) {
            this.skip();
        }
    }

    reset(): void {
        this.currentIndex = this.options.skip !== undefined ? this.options.skip : 0;
        this.state.currentIndex = this.currentIndex;
        this.state.iterationCount = 0;
        this.state.batchCount = 0;
        this.processedIndices.clear();
        
        if (this.options.shuffle) {
            this.shuffleData();
        }
        
        logger.debug('DataIterator reset');
    }

    isComplete(): boolean {
        if (this.options.take && this.state.iterationCount >= this.options.take) {
            return true;
        }
        
        for (let i = this.currentIndex; i < this.data.length; i++) {
            if (!this.skipIndices.has(i)) {
                return false;
            }
        }
        
        return true;
    }

    getState(): IteratorState {
        return {
            ...this.state,
            progress: this.state.totalItems > 0 
                ? (this.state.iterationCount / this.state.totalItems) * 100 
                : 100,
            remainingItems: this.getRemainingCount(),
            elapsedTime: Date.now() - this.state.startTime
        };
    }

    getRemainingCount(): number {
        let remaining = 0;
        for (let i = this.currentIndex; i < this.data.length; i++) {
            if (!this.skipIndices.has(i)) {
                remaining++;
            }
        }
        
        if (this.options.take) {
            remaining = Math.min(remaining, this.options.take - this.state.iterationCount);
        }
        
        return remaining;
    }

    async processParallel<T>(
        processor: (item: TestData, index: number) => Promise<T>,
        maxConcurrency: number = 5
    ): Promise<T[]> {
        if (!this.options.parallel) {
            throw new Error('Parallel processing not enabled for this iterator');
        }
        
        const results: T[] = [];
        const promises: Promise<void>[] = [];
        let activeCount = 0;
        
        const processItem = async (item: TestData, index: number): Promise<void> => {
            try {
                const result = await processor(item, index);
                results[index] = result;
            } catch (error) {
                this.handleError(error, item);
                throw error;
            }
        };
        
        for (let i = 0; i < this.data.length; i++) {
            if (this.skipIndices.has(i)) continue;
            
            while (activeCount >= maxConcurrency) {
                await Promise.race(promises);
                activeCount--;
            }
            
            const item = this.data[i];
            if (item === undefined) continue;
            const promise = processItem(item, i);
            promises.push(promise);
            activeCount++;
        }
        
        await Promise.all(promises);
        
        return results;
    }

    toArray(): TestData[] {
        const results: TestData[] = [];
        let current = this.next();
        while (!current.done && current.value) {
            results.push(current.value);
            current = this.next();
        }
        return results;
    }

    map<T>(transform: (item: TestData, index: number) => T): T[] {
        const results: T[] = [];
        let index = 0;
        
        let current = this.next();
        while (!current.done && current.value) {
            results.push(transform(current.value, index++));
            current = this.next();
        }
        
        return results;
    }

    filter(predicate: (item: TestData, index: number) => boolean): TestData[] {
        const results: TestData[] = [];
        let index = 0;
        
        let current = this.next();
        while (!current.done && current.value) {
            if (predicate(current.value, index++)) {
                results.push(current.value);
            }
            current = this.next();
        }
        
        return results;
    }

    find(predicate: (item: TestData, index: number) => boolean): TestData | undefined {
        let index = 0;
        
        let current = this.next();
        while (!current.done && current.value) {
            if (predicate(current.value, index++)) {
                return current.value;
            }
            current = this.next();
        }
        
        return undefined;
    }

    forEach(callback: (item: TestData, index: number) => void): void {
        let index = 0;
        
        let current = this.next();
        while (!current.done && current.value) {
            callback(current.value, index++);
            current = this.next();
        }
    }

    private shuffleData(): void {
        for (let i = this.data.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = this.data[i];
            const itemJ = this.data[j];
            if (temp !== undefined && itemJ !== undefined) {
                this.data[i] = itemJ;
                this.data[j] = temp;
            }
        }
        
        logger.debug('Data shuffled');
    }

    private handleError(error: any, item: TestData): void {
        const errorInfo = {
            message: error.message,
            item,
            index: this.currentIndex - 1,
            timestamp: new Date()
        };
        
        this.state.errors.push(errorInfo);
        
        if (this.options.onError) {
            this.options.onError(error, item, this.state);
        } else {
            logger.error('Iterator error:', error as Error);
        }
    }

    getStatistics(): Record<string, any> {
        return {
            totalItems: this.state.totalItems,
            processedItems: this.state.iterationCount,
            skippedItems: this.skipIndices.size,
            remainingItems: this.getRemainingCount(),
            batchCount: this.state.batchCount,
            errorCount: this.state.errors.length,
            elapsedTime: Date.now() - this.state.startTime,
            averageTimePerItem: this.state.iterationCount > 0
                ? (Date.now() - this.state.startTime) / this.state.iterationCount
                : 0
        };
    }
}
