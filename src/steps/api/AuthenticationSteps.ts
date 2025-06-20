// src/steps/api/AuthenticationSteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { APIContextManager } from '../../api/context/APIContextManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

/**
 * Step definitions for API authentication
 * Supports all authentication methods: Basic, Bearer, API Key, OAuth2, Certificate, NTLM, AWS
 */
@StepDefinitions
export class AuthenticationSteps extends CSBDDBaseStepDefinition {
    constructor() {
        super();
    }

    /**
     * Sets Bearer token authentication
     * Example: Given user sets bearer token "{{authToken}}"
     */
    @CSBDDStepDef("user sets bearer token {string}")
    async setBearerToken(token: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setBearerToken', { tokenLength: token.length });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedToken = await this.interpolateValue(token);
            
            // Set Authorization header
            currentContext.setHeader('Authorization', `Bearer ${interpolatedToken}`);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'bearer');
            currentContext.setVariable('authToken', interpolatedToken);
            
            await actionLogger.logAction('bearerTokenSet', { 
                tokenLength: interpolatedToken.length,
                tokenPreview: this.maskToken(interpolatedToken)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set bearer token' });
            throw new Error(`Failed to set bearer token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets Basic authentication
     * Example: Given user sets basic auth username "admin" and password "{{password}}"
     */
    @CSBDDStepDef("user sets basic auth username {string} and password {string}")
    async setBasicAuth(username: string, password: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setBasicAuth', { username });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedUsername = await this.interpolateValue(username);
            const interpolatedPassword = await this.interpolateValue(password);
            
            // Create Basic auth header
            const credentials = `${interpolatedUsername}:${interpolatedPassword}`;
            const encodedCredentials = Buffer.from(credentials).toString('base64');
            
            currentContext.setHeader('Authorization', `Basic ${encodedCredentials}`);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'basic');
            currentContext.setVariable('authUsername', interpolatedUsername);
            currentContext.setVariable('authPassword', interpolatedPassword);
            
            await actionLogger.logAction('basicAuthSet', { 
                username: interpolatedUsername,
                credentialsLength: credentials.length
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set basic auth' });
            throw new Error(`Failed to set basic authentication: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets API key authentication in header
     * Example: Given user sets API key header "X-API-Key" to "{{apiKey}}"
     */
    @CSBDDStepDef("user sets API key header {string} to {string}")
    async setAPIKeyHeader(headerName: string, apiKey: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setAPIKeyHeader', { headerName });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedKey = await this.interpolateValue(apiKey);
            
            currentContext.setHeader(headerName, interpolatedKey);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'apikey');
            currentContext.setVariable('authLocation', 'header');
            currentContext.setVariable('authKeyName', headerName);
            currentContext.setVariable('authKeyValue', interpolatedKey);
            
            await actionLogger.logAction('apiKeyHeaderSet', { 
                headerName,
                keyLength: interpolatedKey.length,
                keyPreview: this.maskToken(interpolatedKey)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set API key header' });
            throw new Error(`Failed to set API key header: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets API key authentication in query parameter
     * Example: Given user sets API key parameter "api_key" to "{{apiKey}}"
     */
    @CSBDDStepDef("user sets API key parameter {string} to {string}")
    async setAPIKeyParameter(paramName: string, apiKey: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setAPIKeyParameter', { paramName });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedKey = await this.interpolateValue(apiKey);
            
            // Set query parameter
            const queryParams = currentContext.getVariable('queryParams') || {};
            queryParams[paramName] = interpolatedKey;
            currentContext.setVariable('queryParams', queryParams);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'apikey');
            currentContext.setVariable('authLocation', 'query');
            currentContext.setVariable('authKeyName', paramName);
            currentContext.setVariable('authKeyValue', interpolatedKey);
            
            await actionLogger.logAction('apiKeyParameterSet', { 
                paramName,
                keyLength: interpolatedKey.length,
                keyPreview: this.maskToken(interpolatedKey)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set API key parameter' });
            throw new Error(`Failed to set API key parameter: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets OAuth2 client credentials
     * Example: Given user sets OAuth2 client credentials:
     *   | clientId     | {{clientId}}     |
     *   | clientSecret | {{clientSecret}} |
     *   | tokenUrl     | {{tokenUrl}}     |
     */
    @CSBDDStepDef("user sets OAuth2 client credentials:")
    async setOAuth2ClientCredentials(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setOAuth2ClientCredentials', {});
        
        try {
            const currentContext = this.getAPIContext();
            const credentials: any = {};
            
            // Parse data table - handle both formats
            let rows: any[] = [];
            
            if (dataTable.hashes && typeof dataTable.hashes === 'function') {
                // Cucumber format with headers - this creates objects with key-value pairs
                const hashes = dataTable.hashes();
                await actionLogger.logAction('dataTableHashesDebug', { 
                    hashCount: hashes.length,
                    firstHash: JSON.stringify(hashes[0], null, 2).substring(0, 200)
                });
                
                // Convert hashes to rows format - each hash should be an object with key and value properties
                rows = hashes.map((hash: any) => ({
                    key: hash.key,
                    value: hash.value
                }));
            } else if (dataTable.rows && typeof dataTable.rows === 'function') {
                // Raw array format - skip header row and convert to key-value pairs
                const rawRows = dataTable.rows();
                await actionLogger.logAction('dataTableRowsDebug', { 
                    rowCount: rawRows.length,
                    firstRow: JSON.stringify(rawRows[0]),
                    secondRow: rawRows.length > 1 ? JSON.stringify(rawRows[1]) : 'none'
                });
                
                // Skip header row (first row) and convert to key-value pairs
                const dataRows = rawRows.slice(1);
                rows = dataRows.map((row: any[]) => ({
                    key: row[0],
                    value: row[1]
                }));
            } else if (Array.isArray(dataTable)) {
                // Direct array format
                rows = dataTable.map((row: any[]) => ({
                    key: row[0],
                    value: row[1]
                }));
            } else {
                // Log the actual dataTable structure to help debug
                await actionLogger.logAction('dataTableStructureDebug', { 
                    type: typeof dataTable,
                    keys: Object.keys(dataTable),
                    value: JSON.stringify(dataTable, null, 2).substring(0, 500)
                });
                throw new Error(`Unsupported data table format: ${typeof dataTable}`);
            }
            
            // Process rows to extract AWS config
            for (const row of rows) {
                const key = row.key || row[0];
                const value = row.value || row[1];
                
                // Debug logging for each row
                await actionLogger.logAction('rowProcessing', { 
                    rowIndex: rows.indexOf(row),
                    key: key,
                    value: value ? this.maskToken(String(value)) : 'undefined',
                    rowStructure: JSON.stringify(row)
                });
                
                if (key && value) {
                    credentials[key] = await this.interpolateValue(String(value));
                }
            }
            
            // Validate required fields
            if (!credentials.clientId || !credentials.clientSecret || !credentials.tokenUrl) {
                throw new Error('OAuth2 client credentials require: clientId, clientSecret, tokenUrl');
            }
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'oauth2');
            currentContext.setVariable('oauth2Flow', 'client_credentials');
            currentContext.setVariable('oauth2ClientId', credentials.clientId);
            currentContext.setVariable('oauth2ClientSecret', credentials.clientSecret);
            currentContext.setVariable('oauth2TokenUrl', credentials.tokenUrl);
            currentContext.setVariable('oauth2Scope', credentials.scope || '');
            currentContext.setVariable('oauth2GrantType', 'client_credentials');
            
            await actionLogger.logAction('oauth2ClientCredentialsSet', { 
                clientId: credentials.clientId,
                tokenUrl: credentials.tokenUrl,
                hasScope: !!credentials.scope
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set OAuth2 client credentials' });
            throw new Error(`Failed to set OAuth2 client credentials: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets OAuth2 access token directly
     * Example: Given user sets OAuth2 access token "{{accessToken}}"
     */
    @CSBDDStepDef("user sets OAuth2 access token {string}")
    async setOAuth2AccessToken(accessToken: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setOAuth2AccessToken', {});
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedToken = await this.interpolateValue(accessToken);
            
            // Set Authorization header
            currentContext.setHeader('Authorization', `Bearer ${interpolatedToken}`);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'oauth2');
            currentContext.setVariable('oauth2Flow', 'manual');
            currentContext.setVariable('oauth2AccessToken', interpolatedToken);
            
            await actionLogger.logAction('oauth2AccessTokenSet', { 
                tokenLength: interpolatedToken.length,
                tokenPreview: this.maskToken(interpolatedToken)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set OAuth2 access token' });
            throw new Error(`Failed to set OAuth2 access token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Loads client certificate for mutual TLS
     * Example: Given user loads certificate from "certs/client.p12" with password "{{certPassword}}"
     */
    @CSBDDStepDef("user loads certificate from {string} with password {string}")
    async loadCertificate(certPath: string, password: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('loadCertificate', { certPath });
        
        try {
            const currentContext = this.getAPIContext();
            const resolvedPath = await this.resolveCertPath(certPath);
            const interpolatedPassword = await this.interpolateValue(password);
            
            // Check if certificate exists
            if (!await FileUtils.exists(resolvedPath)) {
                throw new Error(`Certificate file not found: ${resolvedPath}`);
            }
            
            // Load certificate
            // Read certificate file
            const certContent = await FileUtils.readFile(resolvedPath);
            
            // Create certificate config for API context
            const certConfig = {
                cert: certContent.toString(),
                passphrase: interpolatedPassword,
                type: this.detectCertType(resolvedPath) as any
            };
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'certificate');
            currentContext.setVariable('certPath', resolvedPath);
            currentContext.setVariable('certContent', certConfig.cert);
            currentContext.setVariable('certPassphrase', interpolatedPassword);
            currentContext.setVariable('certType', certConfig.type);
            
            await actionLogger.logAction('certificateLoaded', { 
                certPath: resolvedPath,
                type: certConfig.type,
                hasPassphrase: !!interpolatedPassword
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to load certificate' });
            throw new Error(`Failed to load certificate from '${certPath}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets client certificate authentication details
     * Example: Given user sets certificate authentication:
     *   | certFile | certs/client.crt |
     *   | keyFile  | certs/client.key |
     *   | caFile   | certs/ca.crt     |
     */
    @CSBDDStepDef("user sets certificate authentication:")
    async setCertificateAuth(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setCertificateAuth', {});
        
        try {
            const currentContext = this.getAPIContext();
            const certConfig: any = {};
            
            // Parse data table
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const key = row[0] || row.key || row.property;
                const value = row[1] || row.value;
                
                if (key && value) {
                    certConfig[key] = await this.interpolateValue(String(value));
                }
            }
            
            // Load certificate files
            const authConfig: any = { type: 'certificate' };
            
            if (certConfig.certFile) {
                const certPath = await this.resolveCertPath(certConfig.certFile);
                authConfig.cert = (await FileUtils.readFile(certPath)).toString();
            }
            
            if (certConfig.keyFile) {
                const keyPath = await this.resolveCertPath(certConfig.keyFile);
                authConfig.key = (await FileUtils.readFile(keyPath)).toString();
            }
            
            if (certConfig.caFile) {
                const caPath = await this.resolveCertPath(certConfig.caFile);
                authConfig.ca = (await FileUtils.readFile(caPath)).toString();
            }
            
            if (certConfig.passphrase) {
                authConfig.passphrase = certConfig.passphrase;
            }
            
            // Store authentication config in variables
            currentContext.setVariable('authType', authConfig.type);
            if (authConfig.cert) currentContext.setVariable('certContent', authConfig.cert);
            if (authConfig.key) currentContext.setVariable('certKey', authConfig.key);
            if (authConfig.ca) currentContext.setVariable('certCA', authConfig.ca);
            if (authConfig.passphrase) currentContext.setVariable('certPassphrase', authConfig.passphrase);
            
            await actionLogger.logAction('certificateAuthSet', { 
                hasCert: !!authConfig.cert,
                hasKey: !!authConfig.key,
                hasCA: !!authConfig.ca,
                hasPassphrase: !!authConfig.passphrase
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set certificate authentication' });
            throw new Error(`Failed to set certificate authentication: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets NTLM authentication
     * Example: Given user sets NTLM auth with username "DOMAIN\user" and password "{{password}}"
     */
    @CSBDDStepDef("user sets NTLM auth with username {string} and password {string}")
    async setNTLMAuth(username: string, password: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setNTLMAuth', { username });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedUsername = await this.interpolateValue(username);
            const interpolatedPassword = await this.interpolateValue(password);
            
            // Parse domain from username if present
            let domain = '';
            let user = interpolatedUsername;
            
            if (interpolatedUsername.includes('\\')) {
                const parts = interpolatedUsername.split('\\');
                domain = parts[0] || '';
                user = parts[1] || interpolatedUsername;
            }
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'ntlm');
            currentContext.setVariable('ntlmUsername', user);
            currentContext.setVariable('ntlmPassword', interpolatedPassword);
            currentContext.setVariable('ntlmDomain', domain);
            currentContext.setVariable('ntlmWorkstation', ConfigurationManager.get('NTLM_WORKSTATION', ''));
            
            await actionLogger.logAction('ntlmAuthSet', { 
                username: user,
                domain: domain,
                hasWorkstation: !!ConfigurationManager.get('NTLM_WORKSTATION')
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set NTLM auth' });
            throw new Error(`Failed to set NTLM authentication: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets AWS Signature V4 authentication
     * Example: Given user sets AWS auth with key "{{accessKey}}" and secret "{{secretKey}}"
     */
    @CSBDDStepDef("user sets AWS auth with key {string} and secret {string}")
    async setAWSAuth(accessKey: string, secretKey: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setAWSAuth', {});
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedKey = await this.interpolateValue(accessKey);
            const interpolatedSecret = await this.interpolateValue(secretKey);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'aws');
            currentContext.setVariable('awsAccessKeyId', interpolatedKey);
            currentContext.setVariable('awsSecretAccessKey', interpolatedSecret);
            currentContext.setVariable('awsRegion', ConfigurationManager.get('AWS_REGION', 'us-east-1'));
            currentContext.setVariable('awsService', ConfigurationManager.get('AWS_SERVICE', 'execute-api'));
            
            await actionLogger.logAction('awsAuthSet', { 
                keyLength: interpolatedKey.length,
                region: ConfigurationManager.get('AWS_REGION', 'us-east-1'),
                service: ConfigurationManager.get('AWS_SERVICE', 'execute-api')
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set AWS auth' });
            throw new Error(`Failed to set AWS authentication: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets AWS authentication with session token
     * Example: Given user sets AWS auth:
     *   | accessKey    | {{accessKey}}    |
     *   | secretKey    | {{secretKey}}    |
     *   | sessionToken | {{sessionToken}} |
     *   | region       | us-west-2        |
     */
    @CSBDDStepDef("user sets AWS auth:")
    async setAWSAuthDetailed(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setAWSAuthDetailed', {});
        
        try {
            const currentContext = this.getAPIContext();
            const awsConfig: any = {};
            
            // Parse data table - handle both formats
            let rows: any[] = [];
            
            if (dataTable.hashes && typeof dataTable.hashes === 'function') {
                // Cucumber format with headers - this creates objects with key-value pairs
                const hashes = dataTable.hashes();
                await actionLogger.logAction('dataTableHashesDebug', { 
                    hashCount: hashes.length,
                    firstHash: JSON.stringify(hashes[0], null, 2).substring(0, 200)
                });
                
                // Convert hashes to rows format - each hash should be an object with key and value properties
                rows = hashes.map((hash: any) => ({
                    key: hash.key,
                    value: hash.value
                }));
            } else if (dataTable.rows && typeof dataTable.rows === 'function') {
                // Raw array format - skip header row and convert to key-value pairs
                const rawRows = dataTable.rows();
                await actionLogger.logAction('dataTableRowsDebug', { 
                    rowCount: rawRows.length,
                    firstRow: JSON.stringify(rawRows[0]),
                    secondRow: rawRows.length > 1 ? JSON.stringify(rawRows[1]) : 'none'
                });
                
                // Skip header row (first row) and convert to key-value pairs
                const dataRows = rawRows.slice(1);
                rows = dataRows.map((row: any[]) => ({
                    key: row[0],
                    value: row[1]
                }));
            } else if (Array.isArray(dataTable)) {
                // Direct array format
                rows = dataTable.map((row: any[]) => ({
                    key: row[0],
                    value: row[1]
                }));
            } else {
                // Log the actual dataTable structure to help debug
                await actionLogger.logAction('dataTableStructureDebug', { 
                    type: typeof dataTable,
                    keys: Object.keys(dataTable),
                    value: JSON.stringify(dataTable, null, 2).substring(0, 500)
                });
                throw new Error(`Unsupported data table format: ${typeof dataTable}`);
            }
            
            // Process rows to extract AWS config
            for (const row of rows) {
                const key = row.key || row[0];
                const value = row.value || row[1];
                
                // Debug logging for each row
                await actionLogger.logAction('rowProcessing', { 
                    rowIndex: rows.indexOf(row),
                    key: key,
                    value: value ? this.maskToken(String(value)) : 'undefined',
                    rowStructure: JSON.stringify(row)
                });
                
                if (key && value) {
                    awsConfig[key] = await this.interpolateValue(String(value));
                }
            }
            
            // Validate required fields
            if (!awsConfig.accessKey || !awsConfig.secretKey) {
                await actionLogger.logAction('awsConfigDebug', { 
                    configKeys: Object.keys(awsConfig),
                    hasAccessKey: !!awsConfig.accessKey,
                    hasSecretKey: !!awsConfig.secretKey,
                    rowCount: rows.length
                });
                throw new Error('AWS authentication requires: accessKey and secretKey');
            }
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'aws');
            currentContext.setVariable('awsAccessKeyId', awsConfig.accessKey);
            currentContext.setVariable('awsSecretAccessKey', awsConfig.secretKey);
            if (awsConfig.sessionToken) {
                currentContext.setVariable('awsSessionToken', awsConfig.sessionToken);
            }
            currentContext.setVariable('awsRegion', awsConfig.region || 'us-east-1');
            currentContext.setVariable('awsService', awsConfig.service || 'execute-api');
            
            await actionLogger.logAction('awsAuthDetailedSet', { 
                hasSessionToken: !!awsConfig.sessionToken,
                region: awsConfig.region || 'us-east-1',
                service: awsConfig.service || 'execute-api'
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set AWS auth' });
            throw new Error(`Failed to set AWS authentication: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clears all authentication
     * Example: Given user clears authentication
     */
    @CSBDDStepDef("user clears authentication")
    async clearAuthentication(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearAuthentication', {});
        
        try {
            const currentContext = this.getAPIContext();
            
            // Remove Authorization header
            currentContext.removeHeader('Authorization');
            
            // Clear authentication config by removing auth variables
            currentContext.setVariable('authType', null);
            
            await actionLogger.logAction('authenticationCleared', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to clear authentication' });
            throw error;
        }
    }

    /**
     * Sets custom authentication header
     * Example: Given user sets custom auth header "X-Custom-Auth" to "{{customToken}}"
     */
    @CSBDDStepDef("user sets custom auth header {string} to {string}")
    async setCustomAuthHeader(headerName: string, headerValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setCustomAuthHeader', { headerName });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedValue = await this.interpolateValue(headerValue);
            
            currentContext.setHeader(headerName, interpolatedValue);
            
            // Store authentication config in variables
            currentContext.setVariable('authType', 'custom');
            currentContext.setVariable('customAuthHeaderName', headerName);
            currentContext.setVariable('customAuthHeaderValue', interpolatedValue);
            
            await actionLogger.logAction('customAuthHeaderSet', { 
                headerName,
                valueLength: interpolatedValue.length,
                valuePreview: this.maskToken(interpolatedValue)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set custom auth header' });
            throw new Error(`Failed to set custom auth header: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets AWS authentication with detailed configuration (alias for AWS auth)
     * Example: Given user sets AWS authentication:
     *   | accessKey    | AKIAIOSFODNN7EXAMPLE |
     *   | secretKey    | wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY |
     *   | region       | us-east-1 |
     *   | service      | execute-api |
     *   | sessionToken | temporary-session-token |
     */
    @CSBDDStepDef("user sets AWS authentication:")
    async setAWSAuthentication(dataTable: any): Promise<void> {
        // Delegate to the existing AWS auth method
        return this.setAWSAuthDetailed(dataTable);
    }

    /**
     * Helper method to get current API context
     */
    private getAPIContext(): APIContext {
        // Try to get from BDD context (only if scenario context is available)
        try {
            const context = this.retrieve('currentAPIContext') as APIContext;
            if (context) {
                return context;
            }
        } catch (error) {
            // Scenario context not available - try alternative sources
        }
        
        // Try to get from APIContextManager
        try {
            const apiContextManager = APIContextManager.getInstance();
            if (apiContextManager.hasContext('default')) {
                return apiContextManager.getContext('default');
            } else {
                return apiContextManager.createContext('default');
            }
        } catch (error) {
            // APIContextManager not available
        }
        
        throw new Error('No API context available. Please use "Given user sets API base URL" first');
    }

    /**
     * Helper method to mask sensitive tokens
     */
    private maskToken(token: string): string {
        if (token.length <= 8) {
            return '***';
        }
        return token.substring(0, 4) + '...' + token.substring(token.length - 4);
    }

    /**
     * Helper method to resolve certificate paths
     */
    private async resolveCertPath(certPath: string): Promise<string> {
        const path = await import('path');
        if (path.isAbsolute(certPath)) {
            return certPath;
        }
        
        // Try certificates directory
        const certsPath = ConfigurationManager.get('CERTIFICATES_PATH', './certs');
        const resolvedPath = path.join(certsPath, certPath);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        // Try test data directory
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data');
        const testDataResolvedPath = path.join(testDataPath, 'certs', certPath);
        
        if (await FileUtils.exists(testDataResolvedPath)) {
            return testDataResolvedPath;
        }
        
        // Try relative to project root
        return certPath;
    }

    /**
     * Helper method to detect certificate type
     */
    private detectCertType(certPath: string): string {
        const path = (typeof window === 'undefined') ? require('path') : { extname: (p: string) => { const parts = p.split('.'); return parts.length > 1 ? '.' + parts[parts.length - 1] : ''; } };
        const ext = path.extname(certPath).toLowerCase();
        
        switch (ext) {
            case '.p12':
            case '.pfx':
                return 'pkcs12';
            case '.pem':
                return 'pem';
            case '.crt':
            case '.cer':
                return 'cert';
            case '.key':
                return 'key';
            default:
                return 'pem';
        }
    }

    /**
     * Helper method to interpolate variables
     */
    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        // Get variables from context - using retrieve for stored variables
        const variables: Record<string, any> = {};
        
        // Try to get common variables from the BDD context
        const currentContext = this.retrieve('currentAPIContext');
        if (currentContext && typeof currentContext === 'object' && 'getVariables' in currentContext) {
            const apiVars = (currentContext as APIContext).getVariables();
            Object.assign(variables, apiVars);
        }
        
        // Replace placeholders
        let interpolated = value;
        for (const [key, val] of Object.entries(variables)) {
            interpolated = interpolated.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
        }
        
        return interpolated;
    }
}
