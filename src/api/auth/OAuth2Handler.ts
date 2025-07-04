
import { createHash, randomBytes, createHmac } from 'crypto';
import { performance } from 'perf_hooks';
import { URL, URLSearchParams } from 'url';
import * as http from 'http';
import * as https from 'https';
import { Server } from 'http';
import { promisify } from 'util';
import { exec } from 'child_process';

import {
  OAuth2Config,
  OAuth2GrantType,
  OAuth2Token,
  OAuth2TokenResponse,
  OAuth2TokenRequest,
  OAuth2RefreshRequest,
  OAuth2IntrospectionResponse,
  PKCEChallenge,
  OAuth2State,
  OAuth2Session,
  OAuth2ProviderMetadata,
  OAuth2DeviceAuthorizationResponse,
  OAuth2Metrics,
  OAuth2Cache,
  OAuth2SecurityPolicy,
  OAuth2TokenExchange,
  OAuth2ClientAssertionType,
  OAuth2UserInfo
} from './auth.types';

import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ProxyManager } from '../../core/proxy/ProxyManager';
import { RequestOptions } from '../types/api.types';

const execAsync = promisify(exec);

export class OAuth2Handler {
  private static instance: OAuth2Handler;
  private readonly logger: Logger;
  private readonly actionLogger: ActionLogger;
  
  private readonly stateStore: Map<string, OAuth2State> = new Map();
  private readonly sessionStore: Map<string, OAuth2Session> = new Map();
  private readonly tokenCache: Map<string, OAuth2Cache> = new Map();
  private readonly providerMetadata: Map<string, OAuth2ProviderMetadata> = new Map();
  
  private readonly pkceStore: Map<string, PKCEChallenge> = new Map();
  
  private readonly deviceCodePolling: Map<string, NodeJS.Timeout> = new Map();
  
  private authorizationServers: Map<string, Server> = new Map();
  
  private readonly metrics: OAuth2Metrics = {
    totalTokenRequests: 0,
    successfulTokenRequests: 0,
    failedTokenRequests: 0,
    tokenRefreshes: 0,
    authorizationRequests: 0,
    introspectionRequests: 0,
    revocationRequests: 0,
    averageTokenRequestTime: 0,
    grantTypeUsage: new Map(),
    providerUsage: new Map(),
    errors: [],
    lastReset: new Date()
  };
  
  private readonly securityPolicies: Map<string, OAuth2SecurityPolicy> = new Map();
  
  private readonly config = {
    defaultTimeout: 30000,
    authorizationTimeout: 300000,
    deviceCodePollingInterval: 5000,
    maxDeviceCodePollingAttempts: 60,
    tokenCacheTTL: 3600000,
    stateTTL: 600000,
    sessionTTL: 86400000,
    enablePKCE: true,
    requireStateParameter: true,
    validateIssuer: true,
    validateAudience: true,
    validateNonce: true,
    clockSkew: 300,
    maxRedirects: 5,
    enableMetrics: true,
    enableDiscovery: true,
    discoveryTimeout: 10000,
    jwksRefreshInterval: 3600000,
    supportedResponseTypes: ['code', 'token', 'id_token', 'code token', 'code id_token', 'token id_token', 'code token id_token'],
    supportedResponseModes: ['query', 'fragment', 'form_post', 'query.jwt', 'fragment.jwt', 'form_post.jwt', 'jwt'],
    supportedGrantTypes: Object.values(OAuth2GrantType),
    supportedScopes: ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'],
    supportedTokenEndpointAuthMethods: ['client_secret_basic', 'client_secret_post', 'client_secret_jwt', 'private_key_jwt', 'none'],
    supportedCodeChallengeMethods: ['S256', 'plain'],
    defaultCodeChallengeMethod: 'S256',
    enableDPoP: false,
    enableMTLS: false,
    enablePAR: false,
    enableJAR: false,
    enableRAR: false
  };

  private constructor() {
    this.logger = Logger.getInstance();
    this.actionLogger = ActionLogger.getInstance();
    
    this.initializeSecurityPolicies();
    this.startCleanupTimer();
  }

  public static getInstance(): OAuth2Handler {
    if (!OAuth2Handler.instance) {
      OAuth2Handler.instance = new OAuth2Handler();
    }
    return OAuth2Handler.instance;
  }

  public async authenticate(
    request: RequestOptions,
    config: OAuth2Config,
    options?: any
  ): Promise<OAuth2TokenResponse> {
    const startTime = performance.now();
    const correlationId = options?.correlationId || this.generateCorrelationId();

    try {
      this.actionLogger.logAction('oauth2_authentication', {
        grantType: config.grantType,
        clientId: config.clientId,
        scopes: config.scope,
        correlationId,
        timestamp: new Date()
      });

      const validationResult = await this.validateConfig(config);
      if (!validationResult) {
        throw new OAuth2Error('Invalid OAuth2 configuration', 'invalid_request');
      }

      const cacheKey = this.generateCacheKey(config);
      const cachedToken = this.getFromTokenCache(cacheKey);
      
      if (cachedToken && !this.isTokenExpired(cachedToken)) {
        this.metrics.totalTokenRequests++;
        this.metrics.successfulTokenRequests++;
        
        this.applyTokenToRequest(request, cachedToken);
        
        return {
          success: true,
          accessToken: cachedToken.access_token,
          tokenType: cachedToken.token_type,
          expiresIn: cachedToken.expires_in,
          expiresAt: cachedToken.expires_at,
          refreshToken: cachedToken.refresh_token,
          scope: cachedToken.scope,
          headers: request.headers || {},
          cached: true,
          metadata: config.provider || config.grantType ? {
            grantType: config.grantType,
            provider: config.provider
          } : undefined,
          access_token: cachedToken.access_token,
          token_type: cachedToken.token_type
        };
      }

      let tokenResponse: OAuth2Token;
      
      switch (config.grantType) {
       case OAuth2GrantType.AUTHORIZATION_CODE:
         tokenResponse = await this.executeAuthorizationCodeFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.CLIENT_CREDENTIALS:
         tokenResponse = await this.executeClientCredentialsFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.PASSWORD:
         tokenResponse = await this.executePasswordFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.REFRESH_TOKEN:
         tokenResponse = await this.executeRefreshTokenFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.IMPLICIT:
         tokenResponse = await this.executeImplicitFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.DEVICE_CODE:
         tokenResponse = await this.executeDeviceCodeFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.JWT_BEARER:
         tokenResponse = await this.executeJWTBearerFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.SAML2_BEARER:
         tokenResponse = await this.executeSAML2BearerFlow(config, correlationId);
         break;
         
       case OAuth2GrantType.TOKEN_EXCHANGE:
         tokenResponse = await this.executeTokenExchangeFlow(config, correlationId);
         break;
         
       default:
         throw new OAuth2Error(`Unsupported grant type: ${config.grantType}`, 'unsupported_grant_type');
     }

     this.addToTokenCache(cacheKey, tokenResponse);

     this.applyTokenToRequest(request, tokenResponse);

     this.updateMetrics(config.grantType, true, performance.now() - startTime);

     return {
       success: true,
       accessToken: tokenResponse.access_token,
       tokenType: tokenResponse.token_type,
       expiresIn: tokenResponse.expires_in,
       expiresAt: tokenResponse.expires_at,
       refreshToken: tokenResponse.refresh_token,
       scope: tokenResponse.scope,
       idToken: tokenResponse.id_token,
       headers: request.headers || {},
       metadata: config.grantType || config.provider || tokenResponse.iss || tokenResponse.aud ? {
         grantType: config.grantType,
         provider: config.provider,
         issuer: tokenResponse.iss,
         audience: tokenResponse.aud
       } : undefined,
       access_token: tokenResponse.access_token,
       token_type: tokenResponse.token_type
     };

   } catch (error) {
     this.updateMetrics(config.grantType, false, performance.now() - startTime);
     
     this.logger.error('OAuth2 authentication failed', {
       error: error instanceof Error ? error.message : String(error),
       grantType: config.grantType,
       correlationId
     });
     
     throw error;
   }
 }

 private async executeAuthorizationCodeFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   if (config.authorizationCode) {
     return await this.exchangeCodeForToken(config, correlationId);
   }

   const state = this.generateState();
   const pkce = this.config.enablePKCE ? this.generatePKCE() : undefined;

   this.stateStore.set(state, {
     state,
     clientId: config.clientId,
     redirectUri: config.redirectUri!,
     scope: config.scope,
     pkce: pkce,
     createdAt: new Date(),
     correlationId
   });

   if (pkce) {
     this.pkceStore.set(state, pkce);
   }

   const authUrl = await this.buildAuthorizationUrl(config, state, pkce);

   const authCode = await this.captureAuthorizationCode(authUrl, config.redirectUri!, state);

   config.authorizationCode = authCode;
   if (pkce) {
     config.codeVerifier = pkce.verifier;
   }

   return await this.exchangeCodeForToken(config, correlationId);
 }

 private async buildAuthorizationUrl(
   config: OAuth2Config,
   state: string,
   pkce?: PKCEChallenge
 ): Promise<string> {
   const authUrl = new URL(config.authorizationUrl!);
   
   const params = new URLSearchParams({
     response_type: 'code',
     client_id: config.clientId,
     redirect_uri: config.redirectUri!,
     state,
     scope: config.scope || 'openid profile email'
   });

   if (pkce) {
     params.set('code_challenge', pkce.challenge);
     params.set('code_challenge_method', pkce.method);
   }

   if (config.prompt) params.set('prompt', config.prompt);
   if (config.loginHint) params.set('login_hint', config.loginHint);
   if (config.maxAge) params.set('max_age', config.maxAge.toString());
   if (config.uiLocales) params.set('ui_locales', config.uiLocales);
   if (config.acrValues) params.set('acr_values', config.acrValues);
   if (config.nonce) params.set('nonce', config.nonce);

   if (config.additionalParameters) {
     Object.entries(config.additionalParameters).forEach(([key, value]) => {
       params.set(key, value);
     });
   }

   authUrl.search = params.toString();
   return authUrl.toString();
 }

 private async captureAuthorizationCode(
   authUrl: string,
   redirectUri: string,
   expectedState: string
 ): Promise<string> {
   const redirectUrl = new URL(redirectUri);
   const port = parseInt(redirectUrl.port) || (redirectUrl.protocol === 'https:' ? 443 : 80);
   const path = redirectUrl.pathname;

   return new Promise((resolve, reject) => {
     let server: Server;
     let timeout: NodeJS.Timeout;

     const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
       const reqUrl = new URL(req.url!, `http://localhost:${port}`);
       
       if (reqUrl.pathname !== path) {
         res.writeHead(404);
         res.end('Not Found');
         return;
       }

       const params = reqUrl.searchParams;
       const code = params.get('code');
       const state = params.get('state');
       const error = params.get('error');
       const errorDescription = params.get('error_description');

       res.writeHead(200, { 'Content-Type': 'text/html' });
       res.end(`
         <html>
           <body>
             <h1>Authentication ${error ? 'Failed' : 'Successful'}</h1>
             <p>${error ? errorDescription : 'You can close this window.'}</p>
             <script>window.close();</script>
           </body>
         </html>
       `);

       clearTimeout(timeout);
       server.close();

       if (error) {
         reject(new OAuth2Error(errorDescription || error, error));
         return;
       }

       if (!code) {
         reject(new OAuth2Error('No authorization code received', 'invalid_response'));
         return;
       }

       if (state !== expectedState) {
         reject(new OAuth2Error('State mismatch', 'invalid_state'));
         return;
       }

       resolve(code);
     };

     server = http.createServer(handler);
     
     this.authorizationServers.set(expectedState, server);

     server.listen(port, 'localhost', () => {
       this.logger.info(`Authorization callback server listening on port ${port}`);
       
       this.openBrowser(authUrl);
     });

     timeout = setTimeout(() => {
       server.close();
       this.authorizationServers.delete(expectedState);
       reject(new OAuth2Error('Authorization timeout', 'timeout'));
     }, this.config.authorizationTimeout);

     server.on('error', (error) => {
       clearTimeout(timeout);
       this.authorizationServers.delete(expectedState);
       reject(new OAuth2Error(`Server error: ${error instanceof Error ? error.message : String(error)}`, 'server_error'));
     });
   });
 }

 private async openBrowser(url: string): Promise<void> {
   const platform = process.platform;
   let command: string;

   switch (platform) {
     case 'darwin':
       command = `open "${url}"`;
       break;
     case 'win32':
       command = `start "${url}"`;
       break;
     default:
       command = `xdg-open "${url}"`;
   }

   try {
     await execAsync(command);
   } catch (error) {
     this.logger.warn('Failed to open browser automatically', { error: error instanceof Error ? error.message : String(error) });
     console.log(`Please open the following URL in your browser:\n${url}`);
   }
 }

 private async exchangeCodeForToken(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   const tokenRequest: OAuth2TokenRequest = {
     grant_type: OAuth2GrantType.AUTHORIZATION_CODE,
     code: config.authorizationCode!,
     redirect_uri: config.redirectUri!,
     client_id: config.clientId
   };

   if (config.codeVerifier) {
     tokenRequest.code_verifier = config.codeVerifier;
   }

   const headers = await this.getClientAuthenticationHeaders(config);

   return await this.requestToken(config.tokenUrl!, tokenRequest, headers, correlationId);
 }

 private async executeClientCredentialsFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   const tokenRequest: OAuth2TokenRequest = {
     grant_type: OAuth2GrantType.CLIENT_CREDENTIALS
   };
   
   if (config.scope) {
     tokenRequest.scope = config.scope;
   }

   const headers = await this.getClientAuthenticationHeaders(config);

   return await this.requestToken(config.tokenUrl!, tokenRequest, headers, correlationId);
 }

 private async executePasswordFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   if (!config.username || !config.password) {
     throw new OAuth2Error('Username and password are required for password flow', 'invalid_request');
   }

   const tokenRequest: OAuth2TokenRequest = {
     grant_type: OAuth2GrantType.PASSWORD,
     username: config.username,
     password: config.password
   };
   
   if (config.scope) {
     tokenRequest.scope = config.scope;
   }

   const headers = await this.getClientAuthenticationHeaders(config);

   return await this.requestToken(config.tokenUrl!, tokenRequest, headers, correlationId);
 }

 private async executeRefreshTokenFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   if (!config.refreshToken) {
     throw new OAuth2Error('Refresh token is required', 'invalid_request');
   }

   const tokenRequest: OAuth2RefreshRequest = {
     grant_type: OAuth2GrantType.REFRESH_TOKEN,
     refresh_token: config.refreshToken
   };
   
   if (config.scope) {
     tokenRequest.scope = config.scope;
   }

   const headers = await this.getClientAuthenticationHeaders(config);

   return await this.requestToken(config.tokenUrl!, tokenRequest, headers, correlationId);
 }

 private async executeImplicitFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   const state = this.generateState();

   this.stateStore.set(state, {
     state,
     clientId: config.clientId,
     redirectUri: config.redirectUri!,
     scope: config.scope,
     createdAt: new Date(),
     correlationId
   });

   const authUrl = new URL(config.authorizationUrl!);
   const params = new URLSearchParams({
     response_type: 'token',
     client_id: config.clientId,
     redirect_uri: config.redirectUri!,
     state,
     scope: config.scope || 'openid profile email'
   });

   if (config.nonce) params.set('nonce', config.nonce);

   authUrl.search = params.toString();

   const token = await this.captureImplicitToken(authUrl.toString(), config.redirectUri!, state);

   return token;
 }

 private async captureImplicitToken(
   authUrl: string,
   redirectUri: string,
   expectedState: string
 ): Promise<OAuth2Token> {
   const redirectUrl = new URL(redirectUri);
   const port = parseInt(redirectUrl.port) || 80;

   return new Promise((resolve, reject) => {
     let server: Server;
     let timeout: NodeJS.Timeout;

     const captureScript = `
       <script>
         const hash = window.location.hash.substring(1);
         const params = new URLSearchParams(hash);
         const token = {
           access_token: params.get('access_token'),
           token_type: params.get('token_type'),
           expires_in: params.get('expires_in'),
           scope: params.get('scope'),
           state: params.get('state'),
           error: params.get('error'),
           error_description: params.get('error_description')
         };
         
         fetch('/callback', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(token)
         }).then(() => window.close());
       </script>
     `;

     const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
       if (req.method === 'GET' && req.url === redirectUrl.pathname) {
         res.writeHead(200, { 'Content-Type': 'text/html' });
         res.end(`
           <html>
             <body>
               <h1>Processing...</h1>
               ${captureScript}
             </body>
           </html>
         `);
       } else if (req.method === 'POST' && req.url === '/callback') {
         let body = '';
         req.on('data', chunk => body += chunk);
         req.on('end', () => {
           try {
             const data = JSON.parse(body);
             
             res.writeHead(200);
             res.end('OK');
             
             clearTimeout(timeout);
             server.close();

             if (data.error) {
               reject(new OAuth2Error(data.error_description || data.error, data.error));
               return;
             }

             if (data.state !== expectedState) {
               reject(new OAuth2Error('State mismatch', 'invalid_state'));
               return;
             }

             const token: OAuth2Token = {
               access_token: data.access_token,
               token_type: data.token_type || 'Bearer',
               expires_in: parseInt(data.expires_in) || 3600,
               expires_at: new Date(Date.now() + (parseInt(data.expires_in) || 3600) * 1000),
               scope: data.scope
             };

             resolve(token);
           } catch (error) {
             reject(new OAuth2Error('Invalid token response', 'invalid_response'));
           }
         });
       } else {
         res.writeHead(404);
         res.end('Not Found');
       }
     };

     server = http.createServer(handler);
     
     server.listen(port, 'localhost', () => {
       this.logger.info(`Implicit flow callback server listening on port ${port}`);
       this.openBrowser(authUrl);
     });

     timeout = setTimeout(() => {
       server.close();
       reject(new OAuth2Error('Authorization timeout', 'timeout'));
     }, this.config.authorizationTimeout);

     server.on('error', (error) => {
       clearTimeout(timeout);
       reject(new OAuth2Error(`Server error: ${error instanceof Error ? error.message : String(error)}`, 'server_error'));
     });
   });
 }

 private async executeDeviceCodeFlow(
   config: OAuth2Config,
   _correlationId: string
 ): Promise<OAuth2Token> {
   const deviceAuthResponse = await this.requestDeviceAuthorization(config);

   console.log('\n========================================');
   console.log(`Please visit: ${deviceAuthResponse.verification_uri}`);
   console.log(`And enter code: ${deviceAuthResponse.user_code}`);
   console.log('========================================\n');

   if (deviceAuthResponse.verification_uri_complete) {
     this.openBrowser(deviceAuthResponse.verification_uri_complete);
   }

   return await this.pollDeviceToken(
     config,
     deviceAuthResponse.device_code,
     deviceAuthResponse.interval || this.config.deviceCodePollingInterval / 1000,
     _correlationId
   );
 }

 private async requestDeviceAuthorization(
   config: OAuth2Config
 ): Promise<OAuth2DeviceAuthorizationResponse> {
   const url = config.deviceAuthorizationUrl || `${config.tokenUrl!.replace('/token', '/device_authorization')}`;
   
   const body = new URLSearchParams({
     client_id: config.clientId,
     scope: config.scope || 'openid profile email'
   });

   const response = await this.makeHttpRequest(url, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/x-www-form-urlencoded',
       'Accept': 'application/json'
     },
     body: body.toString()
   });

   if (!response.ok) {
     const error = await this.parseErrorResponse(response);
     throw new OAuth2Error(error.error_description || error.error, error.error);
   }

   return await response.json();
 }

 private async pollDeviceToken(
   config: OAuth2Config,
   deviceCode: string,
   interval: number,
   correlationId: string
 ): Promise<OAuth2Token> {
   let attempts = 0;
   const maxAttempts = this.config.maxDeviceCodePollingAttempts;

   return new Promise((resolve, reject) => {
     const poll = async () => {
       attempts++;

       if (attempts > maxAttempts) {
         clearInterval(polling);
         reject(new OAuth2Error('Device code expired', 'expired_token'));
         return;
       }

       try {
         const tokenRequest: OAuth2TokenRequest = {
           grant_type: OAuth2GrantType.DEVICE_CODE,
           device_code: deviceCode,
           client_id: config.clientId
         };

         const headers = await this.getClientAuthenticationHeaders(config);
         const token = await this.requestToken(config.tokenUrl!, tokenRequest, headers, correlationId, true);
         
         clearInterval(polling);
         resolve(token);
       } catch (error) {
         const oauth2Error = error as OAuth2Error;
         if (oauth2Error.code === 'authorization_pending') {
           this.logger.debug(`Device authorization pending (attempt ${attempts}/${maxAttempts})`);
         } else if (oauth2Error.code === 'slow_down') {
           clearInterval(polling);
           interval = interval * 2;
           polling = setInterval(poll, interval * 1000);
           this.logger.debug(`Slowing down polling to ${interval}s`);
         } else {
           clearInterval(polling);
           reject(error);
         }
       }
     };

     let polling = setInterval(poll, interval * 1000);
     this.deviceCodePolling.set(deviceCode, polling);

     poll();
   });
 }

 private async executeJWTBearerFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   const assertion = await this.generateJWTAssertion(config);

   const tokenRequest: OAuth2TokenRequest = {
     grant_type: OAuth2GrantType.JWT_BEARER,
     assertion
   };
   
   if (config.scope) {
     tokenRequest.scope = config.scope;
   }

   return await this.requestToken(config.tokenUrl!, tokenRequest, {}, correlationId);
 }

 private async generateJWTAssertion(config: OAuth2Config): Promise<string> {
   if (!config.privateKey) {
     throw new OAuth2Error('Private key is required for JWT bearer flow', 'invalid_request');
   }

   const now = Math.floor(Date.now() / 1000);
   
   const header = {
     alg: config.algorithm || 'RS256',
     typ: 'JWT',
     kid: config.keyId
   };

   const payload = {
     iss: config.clientId,
     sub: config.subject || config.clientId,
     aud: config.tokenUrl,
     iat: now,
     exp: now + 3600,
     jti: this.generateJTI(),
     scope: config.scope
   };

   if (config.additionalClaims) {
     Object.assign(payload, config.additionalClaims);
   }

   return await this.signJWT(header, payload, config.privateKey, config.algorithm || 'RS256');
 }

 private async executeSAML2BearerFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   if (!config.samlAssertion) {
     throw new OAuth2Error('SAML assertion is required', 'invalid_request');
   }

   const tokenRequest: OAuth2TokenRequest = {
     grant_type: OAuth2GrantType.SAML2_BEARER,
     assertion: config.samlAssertion
   };
   
   if (config.scope) {
     tokenRequest.scope = config.scope;
   }

   return await this.requestToken(config.tokenUrl!, tokenRequest, {}, correlationId);
 }

 private async executeTokenExchangeFlow(
   config: OAuth2Config,
   correlationId: string
 ): Promise<OAuth2Token> {
   if (!config.subjectToken) {
     throw new OAuth2Error('Subject token is required for token exchange', 'invalid_request');
   }

   const tokenRequest: OAuth2TokenExchange = {
     grant_type: OAuth2GrantType.TOKEN_EXCHANGE,
     subject_token: config.subjectToken,
     subject_token_type: config.subjectTokenType || 'urn:ietf:params:oauth:token-type:access_token'
   };
   
   if (config.scope) {
     tokenRequest.scope = config.scope;
   }

   if (config.resource) tokenRequest.resource = config.resource;
   if (config.audience) tokenRequest.audience = config.audience;
   if (config.requestedTokenType) tokenRequest.requested_token_type = config.requestedTokenType;
   if (config.actorToken) {
     tokenRequest.actor_token = config.actorToken;
     tokenRequest.actor_token_type = config.actorTokenType || 'urn:ietf:params:oauth:token-type:access_token';
   }

   const headers = await this.getClientAuthenticationHeaders(config);
   return await this.requestToken(config.tokenUrl!, tokenRequest, headers, correlationId);
 }

 private async requestToken(
   tokenUrl: string,
   tokenRequest: OAuth2TokenRequest | OAuth2RefreshRequest | OAuth2TokenExchange,
   headers: Record<string, string>,
   correlationId: string,
   skipErrorHandling = false
 ): Promise<OAuth2Token> {
   const startTime = performance.now();
   
   try {
     const body = new URLSearchParams(tokenRequest as any);
     
     const requestHeaders = {
       'Content-Type': 'application/x-www-form-urlencoded',
       'Accept': 'application/json',
       'User-Agent': 'CS Test Automation Framework OAuth2 Client/4.0.0',
       ...headers
     };

     this.actionLogger.logAction('oauth2_token_request', {
       url: tokenUrl,
       grantType: tokenRequest.grant_type,
       correlationId,
       timestamp: new Date()
     });

     const response = await this.makeHttpRequest(tokenUrl, {
       method: 'POST',
       headers: requestHeaders,
       body: body.toString()
     });

     if (!response.ok) {
       if (skipErrorHandling) {
         const error = await this.parseErrorResponse(response);
         throw new OAuth2Error(error.error_description || error.error, error.error);
       }
       
       const error = await this.parseErrorResponse(response);
       throw new OAuth2Error(
         error.error_description || `Token request failed: ${error.error}`,
         error.error || 'invalid_request'
       );
     }

     const tokenResponse = await response.json();

     this.validateTokenResponse(tokenResponse);

     const expiresAt = new Date(Date.now() + (tokenResponse.expires_in || 3600) * 1000);

     const token: OAuth2Token = {
       access_token: tokenResponse.access_token,
       token_type: tokenResponse.token_type || 'Bearer',
       expires_in: tokenResponse.expires_in || 3600,
       expires_at: expiresAt,
       refresh_token: tokenResponse.refresh_token,
       scope: tokenResponse.scope,
       id_token: tokenResponse.id_token,
       iss: tokenResponse.iss,
       aud: tokenResponse.aud,
       sub: tokenResponse.sub,
       azp: tokenResponse.azp,
       iat: tokenResponse.iat,
       exp: tokenResponse.exp
     };

     this.actionLogger.logAction('oauth2_token_response', {
       success: true,
       tokenType: token.token_type,
       expiresIn: token.expires_in,
       hasRefreshToken: !!token.refresh_token,
       hasIdToken: !!token.id_token,
       correlationId,
       duration: performance.now() - startTime
     });

     return token;

   } catch (error) {
     this.actionLogger.logAction('oauth2_token_response', {
       success: false,
       error: error instanceof Error ? error.message : String(error),
       errorCode: error instanceof OAuth2Error ? error.code : undefined,
       correlationId,
       duration: performance.now() - startTime
     });

     throw error;
   }
 }

 private async getClientAuthenticationHeaders(config: OAuth2Config): Promise<Record<string, string>> {
   const headers: Record<string, string> = {};

   switch (config.clientAuthMethod || 'client_secret_basic') {
     case 'client_secret_basic':
       if (config.clientSecret) {
         const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
         headers['Authorization'] = `Basic ${credentials}`;
       }
       break;

     case 'client_secret_post':
       break;

     case 'client_secret_jwt':
       if (config.clientSecret) {
         const assertion = await this.generateClientSecretJWT(config);
         headers['Client-Assertion-Type'] = OAuth2ClientAssertionType.JWT_BEARER;
         headers['Client-Assertion'] = assertion;
       }
       break;

     case 'private_key_jwt':
       if (config.privateKey) {
         const assertion = await this.generatePrivateKeyJWT(config);
         headers['Client-Assertion-Type'] = OAuth2ClientAssertionType.JWT_BEARER;
         headers['Client-Assertion'] = assertion;
       }
       break;

     case 'tls_client_auth':
       break;

     case 'self_signed_tls_client_auth':
       break;

     case 'none':
       break;
   }

   return headers;
 }

 private async generateClientSecretJWT(config: OAuth2Config): Promise<string> {
   const now = Math.floor(Date.now() / 1000);
   
   const header = {
     alg: 'HS256',
     typ: 'JWT'
   };

   const payload = {
     iss: config.clientId,
     sub: config.clientId,
     aud: config.tokenUrl,
     iat: now,
     exp: now + 300,
     jti: this.generateJTI()
   };

   return await this.signJWT(header, payload, config.clientSecret!, 'HS256');
 }

 private async generatePrivateKeyJWT(config: OAuth2Config): Promise<string> {
   const now = Math.floor(Date.now() / 1000);
   
   const header = {
     alg: config.algorithm || 'RS256',
     typ: 'JWT',
     kid: config.keyId
   };

   const payload = {
     iss: config.clientId,
     sub: config.clientId,
     aud: config.tokenUrl,
     iat: now,
     exp: now + 300,
     jti: this.generateJTI()
   };

   return await this.signJWT(header, payload, config.privateKey!, config.algorithm || 'RS256');
 }

 private async signJWT(
   header: any,
   payload: any,
   key: string,
   algorithm: string
 ): Promise<string> {
   const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
   const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
   
   const signingInput = `${encodedHeader}.${encodedPayload}`;
   let signature: string;

   if (algorithm.startsWith('HS')) {
     const alg = algorithm.replace('HS', 'sha');
     signature = createHmac(alg, key)
       .update(signingInput)
       .digest('base64url');
   } else if (algorithm.startsWith('RS') || algorithm.startsWith('PS')) {
     const sign = require('crypto').createSign(algorithm.replace('RS', 'RSA-SHA').replace('PS', 'RSA-SHA'));
     sign.update(signingInput);
     signature = sign.sign(key, 'base64url');
   } else if (algorithm.startsWith('ES')) {
     const sign = require('crypto').createSign(algorithm.replace('ES', 'SHA'));
     sign.update(signingInput);
     signature = sign.sign(key, 'base64url');
   } else {
     throw new OAuth2Error(`Unsupported algorithm: ${algorithm}`, 'invalid_request');
   }

   return `${signingInput}.${signature}`;
 }

 private validateTokenResponse(response: any): void {
   if (!response.access_token) {
     throw new OAuth2Error('Missing access token in response', 'invalid_response');
   }

   if (response.token_type && response.token_type.toLowerCase() !== 'bearer') {
     this.logger.warn(`Unsupported token type: ${response.token_type}`);
   }

   if (response.expires_in && (typeof response.expires_in !== 'number' || response.expires_in <= 0)) {
     throw new OAuth2Error('Invalid expires_in value', 'invalid_response');
   }
 }

 private applyTokenToRequest(request: RequestOptions, token: OAuth2Token): void {
   if (!request.headers) {
     request.headers = {};
   }

   switch (token.token_type.toLowerCase()) {
     case 'bearer':
       request.headers['Authorization'] = `Bearer ${token.access_token}`;
       break;
       
     case 'dpop':
       request.headers['Authorization'] = `DPoP ${token.access_token}`;
       break;
       
     case 'mac':
       const macHeader = this.generateMACHeader(request, token);
       request.headers['Authorization'] = macHeader;
       break;
       
     default:
       request.headers['Authorization'] = `${token.token_type} ${token.access_token}`;
   }
 }

 private generateMACHeader(request: RequestOptions, token: OAuth2Token): string {
   const timestamp = Math.floor(Date.now() / 1000);
   const nonce = randomBytes(16).toString('hex');
   const url = new URL(request.url);
   
   const normalized = [
     timestamp,
     nonce,
     request.method || 'GET',
     url.pathname + url.search,
     url.hostname,
     url.port || (url.protocol === 'https:' ? 443 : 80),
     '',
     ''
   ].join('\n') + '\n';
   
   const mac = createHmac('sha256', token.mac_key || '')
     .update(normalized)
     .digest('base64');
   
   return `MAC id="${token.access_token}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
 }

 private async makeHttpRequest(
   url: string,
   options: {
     method: string;
     headers: Record<string, string>;
     body?: string;
   }
 ): Promise<any> {
   const urlObj = new URL(url);
   const isHttps = urlObj.protocol === 'https:';
   
   const proxyConfig = await ProxyManager.getInstance().getProxyForURL(url);
   
   return new Promise((resolve, reject) => {
     const requestOptions: any = {
       hostname: urlObj.hostname,
       port: urlObj.port || (isHttps ? 443 : 80),
       path: urlObj.pathname + urlObj.search,
       method: options.method,
       headers: {
         ...options.headers,
         'Content-Length': options.body ? Buffer.byteLength(options.body) : 0
       }
     };

     if (proxyConfig && proxyConfig.server) {
       const proxyUrl = new URL(proxyConfig.server);
       
       if (proxyUrl.protocol === 'http:' || proxyUrl.protocol === 'https:') {
         requestOptions.proxy = {
           host: proxyUrl.hostname,
           port: parseInt(proxyUrl.port || (proxyUrl.protocol === 'https:' ? '443' : '80')),
           auth: proxyConfig.username && proxyConfig.password ? {
             username: proxyConfig.username,
             password: proxyConfig.password
           } : undefined
         };
       }
     }

     const protocol = isHttps ? https : http;
     
     const req = protocol.request(requestOptions, (res) => {
       let data = '';
       
       res.on('data', (chunk) => {
         data += chunk;
       });
       
       res.on('end', () => {
         const response = {
           ok: res.statusCode! >= 200 && res.statusCode! < 300,
           status: res.statusCode,
           statusText: res.statusMessage,
           headers: res.headers,
           json: async () => JSON.parse(data),
           text: async () => data
         };
         
         resolve(response);
       });
     });
     
     req.on('error', (error) => {
       reject(new OAuth2Error(`Request failed: ${error.message}`, 'request_failed'));
     });
     
     req.setTimeout(this.config.defaultTimeout, () => {
       req.destroy();
       reject(new OAuth2Error('Request timeout', 'timeout'));
     });
     
     if (options.body) {
       req.write(options.body);
     }
     
     req.end();
   });
 }

 private async parseErrorResponse(response: any): Promise<any> {
   try {
     const contentType = response.headers['content-type'] || '';
     
     if (contentType.includes('application/json')) {
       return await response.json();
     } else {
       const text = await response.text();
       
       const params = new URLSearchParams(text);
       if (params.has('error')) {
         return {
           error: params.get('error'),
           error_description: params.get('error_description')
         };
       }
       
       return {
         error: 'invalid_response',
         error_description: text || `HTTP ${response.status} ${response.statusText}`
       };
     }
   } catch {
     return {
       error: 'invalid_response',
       error_description: `HTTP ${response.status} ${response.statusText}`
     };
   }
 }

 public async refreshToken(config: OAuth2Config): Promise<{
   accessToken: string;
   refreshToken?: string | undefined;
   expiresIn: number;
   scope?: string | undefined;
   sessionToken?: string | undefined;
 }> {
   if (!config.refreshToken) {
     throw new OAuth2Error('Refresh token is required', 'invalid_request');
   }

   config.grantType = OAuth2GrantType.REFRESH_TOKEN;
   const result = await this.authenticate({} as RequestOptions, config);
   
   this.metrics.tokenRefreshes++;
   
   const refreshResult: {
     accessToken: string;
     refreshToken?: string | undefined;
     expiresIn: number;
     scope?: string | undefined;
     sessionToken?: string | undefined;
   } = {
     accessToken: result.accessToken!,
     expiresIn: result.expiresIn || 3600
   };
   
   if (result.refreshToken) {
     refreshResult.refreshToken = result.refreshToken;
   }
   if (result.scope) {
     refreshResult.scope = result.scope;
   }
   if (result.sessionToken) {
     refreshResult.sessionToken = result.sessionToken;
   }
   
   return refreshResult;
 }

 public async introspectToken(
   token: string,
   config: OAuth2Config,
   tokenTypeHint?: 'access_token' | 'refresh_token'
 ): Promise<OAuth2IntrospectionResponse> {
   if (!config.introspectionUrl) {
     throw new OAuth2Error('Introspection URL is required', 'invalid_request');
   }

   const body = new URLSearchParams({
     token,
     token_type_hint: tokenTypeHint || 'access_token'
   });

   const headers = await this.getClientAuthenticationHeaders(config);
   headers['Content-Type'] = 'application/x-www-form-urlencoded';

   const response = await this.makeHttpRequest(config.introspectionUrl, {
     method: 'POST',
     headers,
     body: body.toString()
   });

   if (!response.ok) {
     const error = await this.parseErrorResponse(response);
     throw new OAuth2Error(error.error_description || error.error, error.error);
   }

   const result = await response.json();
   
   this.metrics.introspectionRequests++;
   
   return result;
 }

 public async revokeToken(
   token: string,
   config: OAuth2Config,
   tokenTypeHint?: 'access_token' | 'refresh_token'
 ): Promise<void> {
   if (!config.revocationUrl) {
     throw new OAuth2Error('Revocation URL is required', 'invalid_request');
   }

   const body = new URLSearchParams({
     token,
     token_type_hint: tokenTypeHint || 'access_token'
   });

   const headers = await this.getClientAuthenticationHeaders(config);
   headers['Content-Type'] = 'application/x-www-form-urlencoded';

   const response = await this.makeHttpRequest(config.revocationUrl, {
     method: 'POST',
     headers,
     body: body.toString()
   });

   if (!response.ok) {
     const error = await this.parseErrorResponse(response);
     throw new OAuth2Error(error.error_description || error.error, error.error);
   }
   
   this.metrics.revocationRequests++;
   
   const cacheKey = this.generateCacheKey(config);
   this.tokenCache.delete(cacheKey);
 }

 public async getUserInfo(
   accessToken: string,
   userInfoUrl: string
 ): Promise<OAuth2UserInfo> {
   const response = await this.makeHttpRequest(userInfoUrl, {
     method: 'GET',
     headers: {
       'Authorization': `Bearer ${accessToken}`,
       'Accept': 'application/json'
     }
   });

   if (!response.ok) {
     const error = await this.parseErrorResponse(response);
     throw new OAuth2Error(error.error_description || error.error, error.error);
   }

   return await response.json();
 }

 public async discoverProviderMetadata(issuer: string): Promise<OAuth2ProviderMetadata> {
   const cached = this.providerMetadata.get(issuer);
   if (cached && cached.cachedAt && Date.now() - cached.cachedAt.getTime() < this.config.jwksRefreshInterval) {
     return cached;
   }

   const wellKnownUrl = `${issuer}/.well-known/openid-configuration`;
   
   const response = await this.makeHttpRequest(wellKnownUrl, {
     method: 'GET',
     headers: {
       'Accept': 'application/json'
     }
   });

   if (!response.ok) {
     throw new OAuth2Error('Failed to discover provider metadata', 'discovery_failed');
   }

   const metadata = await response.json();
   metadata.cachedAt = new Date();
   
   this.providerMetadata.set(issuer, metadata);
   
   return metadata;
 }

 private generatePKCE(): PKCEChallenge {
   const verifier = randomBytes(32).toString('base64url');
   const challenge = createHash('sha256').update(verifier).digest('base64url');
   
   return {
     verifier,
     challenge,
     method: 'S256'
   };
 }

 private generateState(): string {
   return randomBytes(32).toString('base64url');
 }

 private generateJTI(): string {
   return randomBytes(16).toString('hex');
 }

 private generateCorrelationId(): string {
   return `oauth2-${Date.now()}-${randomBytes(8).toString('hex')}`;
 }

 private generateCacheKey(config: OAuth2Config): string {
   const parts = [
     config.grantType,
     config.clientId,
     config.tokenUrl,
     config.scope || 'default'
   ];
   
   if (config.audience) {
     parts.push(config.audience);
   }
   
   return createHash('sha256').update(parts.join(':')).digest('hex');
 }

 private getFromTokenCache(key: string): OAuth2Token | null {
   const cached = this.tokenCache.get(key);
   if (!cached) return null;
   
   if (this.isTokenExpired(cached.token)) {
     this.tokenCache.delete(key);
     return null;
   }
   
   return cached.token;
 }

 private addToTokenCache(key: string, token: OAuth2Token): void {
   this.tokenCache.set(key, {
     token,
     cachedAt: new Date()
   });
 }

 private isTokenExpired(token: OAuth2Token): boolean {
   if (!token.expires_at) return false;
   
   const now = new Date();
   const expiresAt = new Date(token.expires_at);
   const buffer = 5 * 60 * 1000;
   
   return now.getTime() + buffer >= expiresAt.getTime();
 }

 public async validateConfig(config: OAuth2Config): Promise<boolean> {
   if (!config.clientId) {
     throw new OAuth2Error('Client ID is required', 'invalid_request');
   }
   
   if (!config.tokenUrl) {
     throw new OAuth2Error('Token URL is required', 'invalid_request');
   }
   
   switch (config.grantType) {
     case OAuth2GrantType.AUTHORIZATION_CODE:
       if (!config.authorizationUrl && !config.authorizationCode) {
         throw new OAuth2Error('Authorization URL is required', 'invalid_request');
       }
       if (!config.redirectUri) {
         throw new OAuth2Error('Redirect URI is required', 'invalid_request');
       }
       break;
       
     case OAuth2GrantType.PASSWORD:
       if (!config.username || !config.password) {
         throw new OAuth2Error('Username and password are required', 'invalid_request');
       }
       break;
       
     case OAuth2GrantType.CLIENT_CREDENTIALS:
       if (!config.clientSecret && !config.privateKey) {
         throw new OAuth2Error('Client authentication is required', 'invalid_request');
       }
       break;
       
     case OAuth2GrantType.REFRESH_TOKEN:
       if (!config.refreshToken) {
         throw new OAuth2Error('Refresh token is required', 'invalid_request');
       }
       break;
       
     case OAuth2GrantType.JWT_BEARER:
       if (!config.privateKey && !config.jwtAssertion) {
         throw new OAuth2Error('Private key or JWT assertion is required', 'invalid_request');
       }
       break;
       
     case OAuth2GrantType.SAML2_BEARER:
       if (!config.samlAssertion) {
         throw new OAuth2Error('SAML assertion is required', 'invalid_request');
       }
       break;
       
     case OAuth2GrantType.DEVICE_CODE:
       break;
       
     case OAuth2GrantType.TOKEN_EXCHANGE:
       if (!config.subjectToken) {
         throw new OAuth2Error('Subject token is required', 'invalid_request');
       }
       break;
   }
   
   return true;
 }

 private initializeSecurityPolicies(): void {
   this.securityPolicies.set('pkce-enforcement', {
     id: 'pkce-enforcement',
     name: 'PKCE Enforcement',
     enabled: this.config.enablePKCE,
     enforce: (_config: OAuth2Config) => {
       if (_config.grantType === OAuth2GrantType.AUTHORIZATION_CODE && !_config.codeVerifier) {
         return {
           allowed: false,
           reason: 'PKCE is required for authorization code flow'
         };
       }
       return { allowed: true };
     }
   });

   this.securityPolicies.set('state-enforcement', {
     id: 'state-enforcement',
     name: 'State Parameter Enforcement',
     enabled: this.config.requireStateParameter,
     enforce: (_config: OAuth2Config) => {
       return { allowed: true };
     }
   });

   this.securityPolicies.set('scope-validation', {
     id: 'scope-validation',
     name: 'Scope Validation',
     enabled: true,
     enforce: (_config: OAuth2Config) => {
       if (_config.scope) {
         const requestedScopes = _config.scope.split(' ');
         const invalidScopes = requestedScopes.filter(
           (scope: string) => !this.config.supportedScopes.includes(scope) && !scope.startsWith('custom:')
         );
         
         if (invalidScopes.length > 0) {
           return {
             allowed: false,
             reason: `Invalid scopes: ${invalidScopes.join(', ')}`
           };
         }
       }
       return { allowed: true };
     }
   });
 }

 private startCleanupTimer(): void {
   setInterval(() => {
     this.cleanupExpiredEntries();
   }, 60000);
   
   setInterval(() => {
     this.resetMetrics();
   }, 24 * 60 * 60 * 1000);
 }

 private cleanupExpiredEntries(): void {
   const now = Date.now();
   
   const expiredStates: string[] = [];
   this.stateStore.forEach((state, key) => {
     if (now - state.createdAt.getTime() > this.config.stateTTL) {
       expiredStates.push(key);
     }
   });
   expiredStates.forEach(key => {
     this.stateStore.delete(key);
     this.pkceStore.delete(key);
   });
   
   const expiredSessions: string[] = [];
   this.sessionStore.forEach((session, key) => {
     if (now - session.createdAt.getTime() > this.config.sessionTTL) {
       expiredSessions.push(key);
     }
   });
   expiredSessions.forEach(key => this.sessionStore.delete(key));
   
   const expiredTokens: string[] = [];
   this.tokenCache.forEach((cache, key) => {
     if (this.isTokenExpired(cache.token)) {
       expiredTokens.push(key);
     }
   });
   expiredTokens.forEach(key => this.tokenCache.delete(key));
   
   const expiredPolling: string[] = [];
   this.deviceCodePolling.forEach((timeout, key) => {
     if (!this.sessionStore.has(key)) {
       clearInterval(timeout);
       expiredPolling.push(key);
     }
   });
   expiredPolling.forEach(key => this.deviceCodePolling.delete(key));
   
   if (expiredStates.length + expiredSessions.length + expiredTokens.length + expiredPolling.length > 0) {
     this.logger.debug('Cleaned up expired OAuth2 entries', {
       states: expiredStates.length,
       sessions: expiredSessions.length,
       tokens: expiredTokens.length,
       polling: expiredPolling.length
     });
   }
 }

 private updateMetrics(grantType: OAuth2GrantType, success: boolean, duration: number): void {
   if (!this.config.enableMetrics) return;
   
   this.metrics.totalTokenRequests++;
   
   if (success) {
     this.metrics.successfulTokenRequests++;
   } else {
     this.metrics.failedTokenRequests++;
   }
   
   const totalTime = this.metrics.averageTokenRequestTime * (this.metrics.totalTokenRequests - 1) + duration;
   this.metrics.averageTokenRequestTime = totalTime / this.metrics.totalTokenRequests;
   
   const count = this.metrics.grantTypeUsage.get(grantType) || 0;
   this.metrics.grantTypeUsage.set(grantType, count + 1);
 }

 private resetMetrics(): void {
   this.metrics.totalTokenRequests = 0;
   this.metrics.successfulTokenRequests = 0;
   this.metrics.failedTokenRequests = 0;
   this.metrics.tokenRefreshes = 0;
   this.metrics.authorizationRequests = 0;
   this.metrics.introspectionRequests = 0;
   this.metrics.revocationRequests = 0;
   this.metrics.averageTokenRequestTime = 0;
   this.metrics.grantTypeUsage.clear();
   this.metrics.providerUsage.clear();
   this.metrics.errors = [];
   this.metrics.lastReset = new Date();
 }

 public getMetrics(): OAuth2Metrics {
   return { ...this.metrics };
 }

 public clearCaches(): void {
   this.stateStore.clear();
   this.sessionStore.clear();
   this.tokenCache.clear();
   this.pkceStore.clear();
   this.providerMetadata.clear();
   
   this.deviceCodePolling.forEach(timeout => clearInterval(timeout));
   this.deviceCodePolling.clear();
   
   this.logger.info('All OAuth2 caches cleared');
 }

 public async testConfiguration(config: OAuth2Config): Promise<{
   success: boolean;
   error?: string | undefined;
   details?: any;
 }> {
   try {
     await this.validateConfig(config);
     
     let result: any;
     
     switch (config.grantType) {
       case OAuth2GrantType.CLIENT_CREDENTIALS:
         const token = await this.executeClientCredentialsFlow(config, 'test');
         result = {
           tokenReceived: !!token.access_token,
           tokenType: token.token_type,
           expiresIn: token.expires_in,
           scope: token.scope
         };
         break;
         
       case OAuth2GrantType.AUTHORIZATION_CODE:
         if (config.authorizationUrl) {
           const authResponse = await this.makeHttpRequest(config.authorizationUrl, {
             method: 'HEAD',
             headers: {}
           });
           result = {
             authorizationUrlAccessible: authResponse.ok,
             authorizationUrlStatus: authResponse.status
           };
         }
         break;
         
       default:
         result = {
           configValid: true,
           grantType: config.grantType
         };
     }
     
     return {
       success: true,
       details: result
     };
     
   } catch (error) {
     const oauth2Error = error as OAuth2Error;
     const errorResult: {
       success: boolean;
       error?: string | undefined;
       details?: any;
     } = {
       success: false,
       details: {}
     };
     
     if (oauth2Error.message) {
       errorResult.error = oauth2Error.message;
     }
     
     if (oauth2Error.code) {
       errorResult.details.code = oauth2Error.code;
     }
     
     if (oauth2Error.description) {
       errorResult.details.description = oauth2Error.description;
     }
     
     return errorResult;
   }
 }
}

class OAuth2Error extends Error {
 public code: string;
 public description?: string | undefined;
 public uri?: string | undefined;
 public state?: string | undefined;
 
 constructor(message: string, code: string, description?: string, uri?: string) {
   super(message);
   this.name = 'OAuth2Error';
   this.code = code;
   this.description = description;
   this.uri = uri;
   
   Object.setPrototypeOf(this, OAuth2Error.prototype);
 }
}
