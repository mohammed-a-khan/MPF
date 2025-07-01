// src/steps/ui/NetworkSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { NetworkInterceptor } from '../../core/network/NetworkInterceptor';
import { RequestMocker } from '../../core/network/RequestMocker';
import { ResponseModifier } from '../../core/network/ResponseModifier';
import { HARRecorder } from '../../core/network/HARRecorder';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { MockResponse, URLPattern } from '../../core/network/types/network.types';
import { DataTable } from '../../bdd/types/bdd.types';

export class NetworkSteps extends CSBDDBaseStepDefinition {
    private networkInterceptor: NetworkInterceptor | null = null;
    private requestMocker: RequestMocker | null = null;
    private responseModifier: ResponseModifier | null = null;
    private harRecorder: HARRecorder;

    constructor() {
        super();
        this.harRecorder = new HARRecorder();
    }

    private getNetworkInterceptor(): NetworkInterceptor {
        if (!this.networkInterceptor) {
            this.networkInterceptor = new NetworkInterceptor(this.page);
        }
        return this.networkInterceptor;
    }

    private getRequestMocker(): RequestMocker {
        if (!this.requestMocker) {
            this.requestMocker = new RequestMocker(this.page);
        }
        return this.requestMocker;
    }

    private getResponseModifier(): ResponseModifier {
        if (!this.responseModifier) {
            this.responseModifier = new ResponseModifier(this.page);
        }
        return this.responseModifier;
    }

    @CSBDDStepDef('user mocks {string} endpoint with response:')
    @CSBDDStepDef('I mock {string} with response:')
    async mockEndpointWithResponse(endpoint: string, docString: string): Promise<void> {
        ActionLogger.logInfo('Mock endpoint', { endpoint, type: 'network_step' });
        
        try {
            let responseData: any;
            
            try {
                responseData = JSON.parse(docString);
            } catch {
                responseData = docString;
            }
            
            const mockResponse: MockResponse = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: responseData
            };
            
            await this.getRequestMocker().mockEndpoint(this.resolveEndpoint(endpoint), mockResponse);
            
            ActionLogger.logInfo('Endpoint mocked', { 
                endpoint,
                responseType: typeof responseData,
                type: 'network_success'
            });
        } catch (error) {
            ActionLogger.logError('Mock endpoint failed', error as Error);
            throw new Error(`Failed to mock endpoint "${endpoint}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user mocks {string} endpoint with status {int}')
    @CSBDDStepDef('I mock {string} to return status {int}')
    async mockEndpointWithStatus(endpoint: string, statusCode: number): Promise<void> {
        ActionLogger.logInfo('Mock endpoint with status', { endpoint, statusCode, type: 'network_step' });
        
        try {
            const mockResponse: MockResponse = {
                status: statusCode,
                statusText: this.getStatusText(statusCode),
                body: ''
            };
            
            await this.getRequestMocker().mockEndpoint(this.resolveEndpoint(endpoint), mockResponse);
            
            ActionLogger.logInfo('Endpoint mocked with status', { endpoint, statusCode, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Mock endpoint with status failed', error as Error);
            throw new Error(`Failed to mock endpoint "${endpoint}" with status ${statusCode}: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user mocks {string} endpoint from file {string}')
    @CSBDDStepDef('I mock {string} with response from {string}')
    async mockEndpointFromFile(endpoint: string, filePath: string): Promise<void> {
        ActionLogger.logInfo('Mock endpoint from file', { endpoint, filePath, type: 'network_step' });
        
        try {
            const resolvedPath = this.resolveFilePath(filePath);
            await this.getRequestMocker().mockFromFile(this.resolveEndpoint(endpoint), resolvedPath);
            
            ActionLogger.logInfo('Endpoint mocked from file', { endpoint, filePath: resolvedPath, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Mock endpoint from file failed', error as Error);
            throw new Error(`Failed to mock endpoint "${endpoint}" from file: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user intercepts {string} requests')
    @CSBDDStepDef('I intercept requests to {string}')
    async interceptRequests(pattern: string): Promise<void> {
        ActionLogger.logInfo('Intercept requests', { pattern, type: 'network_step' });
        
        try {
            const urlPattern: URLPattern = { url: pattern };
            
            await this.getNetworkInterceptor().recordRequests(urlPattern);
            
            ActionLogger.logInfo('Request interception started', { pattern, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Intercept requests failed', error as Error);
            throw new Error(`Failed to intercept requests to "${pattern}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user blocks {string} requests')
    @CSBDDStepDef('I block requests to {string}')
    async blockRequests(pattern: string): Promise<void> {
        ActionLogger.logInfo('Block requests', { pattern, type: 'network_step' });
        
        try {
            const urlPattern: URLPattern = { url: pattern };
            
            await this.getNetworkInterceptor().abortRequests(urlPattern);
            
            ActionLogger.logInfo('Requests blocked', { pattern, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Block requests failed', error as Error);
            throw new Error(`Failed to block requests to "${pattern}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user delays {string} requests by {int} milliseconds')
    @CSBDDStepDef('I delay requests to {string} by {int} ms')
    async delayRequests(pattern: string, delay: number): Promise<void> {
        ActionLogger.logInfo('Delay requests', { pattern, delay, type: 'network_step' });
        
        try {
            const urlPattern: URLPattern = { url: pattern };
            
            await this.getNetworkInterceptor().delayRequests(urlPattern, delay);
            
            ActionLogger.logInfo('Request delay configured', { pattern, delay, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Delay requests failed', error as Error);
            throw new Error(`Failed to delay requests to "${pattern}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user throttles {string} requests to {int} kbps')
    @CSBDDStepDef('I throttle bandwidth for {string} to {int} kbps')
    async throttleRequests(pattern: string, bandwidth: number): Promise<void> {
        ActionLogger.logInfo('Throttle requests', { pattern, bandwidth, type: 'network_step' });
        
        try {
            const urlPattern: URLPattern = { url: pattern };
            
            await this.getNetworkInterceptor().throttleRequests(urlPattern, bandwidth);
            
            ActionLogger.logInfo('Request throttling configured', { pattern, bandwidth, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Throttle requests failed', error as Error);
            throw new Error(`Failed to throttle requests to "${pattern}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user should see {int} requests to {string}')
    @CSBDDStepDef('there should be {int} requests to {string}')
    async assertRequestCount(expectedCount: number, pattern: string): Promise<void> {
        ActionLogger.logInfo('Assert request count', { expectedCount, pattern, type: 'network_step' });
        
        try {
            const recordedRequests = this.getNetworkInterceptor().getRecordedRequests()
                .filter(req => req.url().includes(pattern));
            
            const actualCount = recordedRequests.length;
            
            if (actualCount !== expectedCount) {
                throw new Error(`Request count mismatch. Expected: ${expectedCount}, Actual: ${actualCount}`);
            }
            
            ActionLogger.logInfo('Request count assertion passed', { 
                pattern,
                expectedCount,
                actualCount,
                type: 'network_success'
            });
        } catch (error) {
            ActionLogger.logError('Request count assertion failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('user verifies request to {string} contains header {string} with value {string}')
    @CSBDDStepDef('the request to {string} should have header {string} as {string}')
    async verifyRequestHeader(pattern: string, headerName: string, expectedValue: string): Promise<void> {
        ActionLogger.logInfo('Verify request header', { pattern, headerName, expectedValue, type: 'network_step' });
        
        try {
            const requests = this.getNetworkInterceptor().getRecordedRequests()
                .filter(req => req.url().includes(pattern));
            
            if (requests.length === 0) {
                throw new Error(`No requests found matching pattern "${pattern}"`);
            }
            
            const request = requests[requests.length - 1];
            if (!request) {
                throw new Error('No request found');
            }
            const actualValue = request.headers()[headerName.toLowerCase()];
            
            if (actualValue !== expectedValue) {
                throw new Error(`Header value mismatch. Expected: "${expectedValue}", Actual: "${actualValue}"`);
            }
            
            ActionLogger.logInfo('Request header verified', { 
                pattern,
                headerName,
                expectedValue,
                type: 'network_success'
            });
        } catch (error) {
            ActionLogger.logError('Request header verification failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('user starts recording network traffic')
    @CSBDDStepDef('I start HAR recording')
    async startHARRecording(): Promise<void> {
        ActionLogger.logInfo('Start HAR recording', { type: 'network_step' });
        
        try {
            await this.harRecorder.startRecording(this.page, {
                content: ConfigurationManager.get('HAR_CONTENT_TYPE', 'embed') as any,
                maxSize: ConfigurationManager.getInt('HAR_MAX_SIZE', 50 * 1024 * 1024)
            });
            
            ActionLogger.logInfo('HAR recording started', { type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Start HAR recording failed', error as Error);
            throw new Error(`Failed to start HAR recording: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user stops recording network traffic')
    @CSBDDStepDef('I stop HAR recording')
    async stopHARRecording(): Promise<void> {
        ActionLogger.logInfo('Stop HAR recording', { type: 'network_step' });
        
        try {
            const har = await this.harRecorder.stopRecording();
            
            this.context.store('lastHAR', har, 'scenario');
            
            ActionLogger.logInfo('HAR recording stopped', {
                entryCount: har.log.entries.length,
                type: 'network_success'
            });
        } catch (error) {
            ActionLogger.logError('Stop HAR recording failed', error as Error);
            throw new Error(`Failed to stop HAR recording: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user saves network recording to {string}')
    @CSBDDStepDef('I save HAR to {string}')
    async saveHAR(fileName: string): Promise<void> {
        ActionLogger.logInfo('Save HAR file', { fileName, type: 'network_step' });
        
        try {
            const harPath = this.resolveHARPath(fileName);
            await this.harRecorder.saveHAR(harPath);
            
            ActionLogger.logInfo('HAR file saved', { path: harPath, type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Save HAR failed', error as Error);
            throw new Error(`Failed to save HAR to "${fileName}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user analyzes network performance')
    @CSBDDStepDef('I analyze HAR performance')
    async analyzeNetworkPerformance(): Promise<void> {
        ActionLogger.logInfo('Analyze network performance', { type: 'network_step' });
        
        try {
            const har = this.context.retrieve('lastHAR');
            if (!har) {
                throw new Error('No HAR recording found. Please start and stop recording first.');
            }
            
            const analysis = this.harRecorder.analyzeHAR(har);
            const metrics = this.harRecorder.getPerformanceMetrics(har);
            
            this.context.store('networkAnalysis', analysis, 'scenario');
            this.context.store('performanceMetrics', metrics, 'scenario');
            
            ActionLogger.logInfo('Network performance analyzed', {
                totalRequests: analysis.summary.totalRequests,
                totalSize: `${(analysis.summary.totalSize / 1024 / 1024).toFixed(2)} MB`,
                avgResponseTime: `${analysis.summary.averageResponseTime.toFixed(2)} ms`,
                pageLoadTime: `${metrics.pageLoadTime.toFixed(2)} ms`,
                type: 'network_success'
            });
        } catch (error) {
            ActionLogger.logError('Network analysis failed', error as Error);
            throw new Error(`Failed to analyze network performance: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user enables offline mode')
    @CSBDDStepDef('I go offline')
    async enableOfflineMode(): Promise<void> {
        ActionLogger.logInfo('Enable offline mode', { type: 'network_step' });
        
        try {
            await this.getNetworkInterceptor().enableOfflineMode();
            
            ActionLogger.logInfo('Offline mode enabled', { type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Enable offline mode failed', error as Error);
            throw new Error(`Failed to enable offline mode: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user disables offline mode')
    @CSBDDStepDef('I go online')
    async disableOfflineMode(): Promise<void> {
        ActionLogger.logInfo('Disable offline mode', { type: 'network_step' });
        
        try {
            await this.getNetworkInterceptor().clearInterceptors();
            
            ActionLogger.logInfo('Offline mode disabled', { type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Disable offline mode failed', error as Error);
            throw new Error(`Failed to disable offline mode: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user modifies response for {string} endpoint:')
    @CSBDDStepDef('I modify {string} response to:')
    async modifyResponse(endpoint: string, dataTable: DataTable): Promise<void> {
        ActionLogger.logInfo('Modify response', { endpoint, type: 'network_step' });
        
        try {
            const modifications = dataTable.hashes();
            const urlPattern: URLPattern = { url: this.resolveEndpoint(endpoint) };
            
            for (const mod of modifications) {
                if (mod['field'] && mod['value']) {
                    await this.getResponseModifier().injectField(
                        urlPattern,
                        mod['field'],
                        this.parseValue(mod['value'])
                    );
                }
                
                if (mod['header'] && mod['headerValue']) {
                    await this.getResponseModifier().injectHeader(
                        urlPattern,
                        mod['header'],
                        mod['headerValue']
                    );
                }
            }
            
            ActionLogger.logInfo('Response modifications configured', { 
                endpoint,
                modificationCount: modifications.length,
                type: 'network_success'
            });
        } catch (error) {
            ActionLogger.logError('Modify response failed', error as Error);
            throw new Error(`Failed to modify response for "${endpoint}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clears all network mocks')
    @CSBDDStepDef('I clear network mocks')
    async clearNetworkMocks(): Promise<void> {
        ActionLogger.logInfo('Clear network mocks', { type: 'network_step' });
        
        try {
            await this.getRequestMocker().clearMocks();
            await this.getNetworkInterceptor().clearInterceptors();
            await this.getResponseModifier().clearModifiers();
            
            ActionLogger.logInfo('All network mocks cleared', { type: 'network_success' });
        } catch (error) {
            ActionLogger.logError('Clear network mocks failed', error as Error);
            throw new Error(`Failed to clear network mocks: ${(error as Error).message}`);
        }
    }

    private resolveEndpoint(endpoint: string): string {
        if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
            return endpoint;
        }
        
        const apiBaseUrl = ConfigurationManager.get('API_BASE_URL', '');
        if (apiBaseUrl && !endpoint.startsWith('/')) {
            return `${apiBaseUrl}/${endpoint}`;
        }
        
        return endpoint;
    }

    private getStatusText(statusCode: number): string {
        const statusTexts: Record<number, string> = {
            200: 'OK',
            201: 'Created',
            204: 'No Content',
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            500: 'Internal Server Error',
            502: 'Bad Gateway',
            503: 'Service Unavailable'
        };
        
        return statusTexts[statusCode] || 'Unknown';
    }

    private resolveFilePath(filePath: string): string {
        const path = require('path');
        
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const mockDataDir = ConfigurationManager.get('MOCK_DATA_DIR', './test-data/mocks');
        return path.resolve(mockDataDir, filePath);
    }

    private resolveHARPath(fileName: string): string {
        const path = require('path');
        const harDir = ConfigurationManager.get('HAR_OUTPUT_DIR', './reports/har');
        
        if (!fileName.endsWith('.har')) {
            fileName += '.har';
        }
        
        return path.resolve(harDir, fileName);
    }

    private parseValue(value: string): any {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
}
