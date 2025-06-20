Feature: Comprehensive API Authentication Test Suite

  Background:
    Given the API test environment is ready

  @api @no-auth @smoke
  Scenario: No Authentication - HTTPBin Basic GET
    Given user sets API base URL to "https://httpbin.org"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "url"
    And the response header "Content-Type" should contain "application/json"

  @api @no-auth @smoke
  Scenario: No Authentication - JSONPlaceholder User Data
    Given user sets API base URL to "https://jsonplaceholder.typicode.com"
    When user sends GET request to "/users/1"
    Then the response status code should be 200
    And the response body should contain "name"
    And the response body should contain "email"

  @api @no-auth @post
  Scenario: No Authentication - HTTPBin POST with JSON Body
    Given user sets API base URL to "https://httpbin.org"
    And user sets request body to:
      """
      {
        "name": "Integration Test User",
        "email": "test@automation.com",
        "role": "tester"
      }
      """
    When user sends POST request to "/post"
    Then the response status code should be 200
    And the response body should contain "Integration Test User"
    And the response body should contain "test@automation.com"

  @api @basic-auth @smoke
  Scenario: Basic Authentication - HTTPBin Success Case
    Given user sets API base URL to "https://httpbin.org"
    And user sets basic auth username "testuser" and password "testpass"
    When user sends GET request to "/basic-auth/testuser/testpass"
    Then the response status code should be 200
    And the response body should contain "authenticated"
    And the response body should contain "testuser"

  @api @basic-auth @negative
  Scenario: Basic Authentication - HTTPBin Invalid Credentials
    Given user sets API base URL to "https://httpbin.org"
    And user sets basic auth username "wrong" and password "invalid"
    When user sends GET request to "/basic-auth/testuser/testpass"
    Then the response status code should be 401

  @api @basic-auth @external
  Scenario: Basic Authentication - Postman Echo Validation
    Given user sets API base URL to "https://postman-echo.com"
    And user sets basic auth username "postman" and password "password"
    When user sends GET request to "/basic-auth"
    Then the response status code should be 200
    And the response body should contain "authenticated"

  @api @bearer-token @workflow
  Scenario: Bearer Token Authentication - Complete Workflow
    Given user sets API base URL to "https://httpbin.org"
    # Simulate getting a token first
    And user sets request body to:
      """
      {
        "grant_type": "client_credentials",
        "client_id": "test-client",
        "client_secret": "test-secret"
      }
      """
    When user sends POST request to "/post"
    Then the response status code should be 200
    # Now use a bearer token for authenticated request
    And user sets bearer token "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNjAwMDAwMDAwfQ.test-signature"
    When user sends GET request to "/bearer"
    Then the response status code should be 200

  @api @api-key @header
  Scenario: API Key Authentication - Header Based
    Given user sets API base URL to "https://httpbin.org"
    And user sets API key header "X-API-Key" to "sk-test-api-key-12345-abcdef"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "X-API-Key"
    And the response body should contain "sk-test-api-key-12345-abcdef"

  @api @api-key @query
  Scenario: API Key Authentication - Query Parameter
    Given user sets API base URL to "https://httpbin.org"
    And user sets API key parameter "api_key" to "test-query-key-67890-xyz"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "api_key"
    And the response body should contain "test-query-key-67890-xyz"

  @api @oauth2 @client-credentials
  Scenario: OAuth2 Client Credentials Flow
    Given user sets API base URL to "https://httpbin.org"
    And user sets OAuth2 client credentials:
      | clientId     | oauth-test-client-2024     |
      | clientSecret | oauth-test-secret-secure   |
      | tokenUrl     | https://httpbin.org/post   |
      | scope        | read write admin           |
    When user sends GET request to "/oauth"
    Then the response status code should be 200

  @api @oauth2 @access-token
  Scenario: OAuth2 Access Token Direct Usage
    Given user sets API base URL to "https://httpbin.org"
    And user sets OAuth2 access token "ya29.a0AfH6SMC8Q_token_example_here_1234567890"
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @certificate @p12
  Scenario: Client Certificate Authentication - PKCS12 Format
    Given user sets API base URL to "https://httpbin.org"
    And user sets certificate authentication:
      | certPath | certificates/client-test.p12 |
      | password | pkcs12-cert-password-123     |
      | type     | pkcs12                      |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @certificate @pem
  Scenario: Client Certificate Authentication - PEM Format
    Given user sets API base URL to "https://httpbin.org"
    And user sets certificate authentication:
      | certPath | certificates/client-test.pem |
      | keyPath  | certificates/client-test.key |
      | type     | pem                         |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @certificate @pfx
  Scenario: Client Certificate Authentication - PFX Format
    Given user sets API base URL to "https://httpbin.org"
    And user sets certificate authentication:
      | certPath | certificates/client-test.pfx |
      | password | pfx-cert-password-456        |
      | type     | pfx                         |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @ntlm @domain
  Scenario: NTLM Authentication - Domain User
    Given user sets API base URL to "https://httpbin.org"
    And user sets NTLM auth username "TESTDOMAIN\\ntlmuser" and password "NTLMPassword123!"
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @aws @basic
  Scenario: AWS Signature Authentication - Basic
    Given user sets API base URL to "https://httpbin.org"
    And user sets AWS auth "AKIAIOSFODNN7EXAMPLE" and "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @aws @detailed
  Scenario: AWS Signature Authentication - Full Configuration
    Given user sets API base URL to "https://httpbin.org"
    And user sets AWS authentication:
      | accessKey    | AKIAIOSFODNN7EXAMPLE               |
      | secretKey    | wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY |
      | region       | us-west-2                          |
      | service      | execute-api                        |
      | sessionToken | AQoDYXdzEJr_temp_session_token_here |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @custom-auth
  Scenario: Custom Authentication Header
    Given user sets API base URL to "https://httpbin.org"
    And user sets custom auth header "X-Custom-Token" to "Bearer custom-jwt-token-2024"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "X-Custom-Token"

  @api @multi-auth
  Scenario: Multiple Authentication Methods Combined
    Given user sets API base URL to "https://httpbin.org"
    And user sets API key header "X-API-Key" to "primary-api-key"
    And user sets custom auth header "X-Session-Token" to "session-abc123"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "X-API-Key"
    And the response body should contain "X-Session-Token"

  @api @certificate-errors @negative
  Scenario: Certificate Error Handling - Self Signed Certificate
    Given user sets API base URL to "https://self-signed.badssl.com"
    When user sends GET request to "/"
    Then the response status code should be 200 or certificate error occurs

  @api @certificate-errors @negative
  Scenario: Certificate Error Handling - Expired Certificate
    Given user sets API base URL to "https://expired.badssl.com"
    When user sends GET request to "/"
    Then the response status code should be 200 or certificate error occurs

  @api @auth-cleanup
  Scenario: Authentication Cleanup and Reset
    Given user sets API base URL to "https://httpbin.org"
    And user sets basic auth username "testuser" and password "testpass"
    When user sends GET request to "/basic-auth/testuser/testpass"
    Then the response status code should be 200
    # Clear authentication
    And user clears authentication
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should not contain "Authorization" 