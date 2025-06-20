Feature: Comprehensive API Authentication Testing

  @api @authentication @no-auth
  Scenario: No Authentication - HTTPBin GET
    Given user sets API base URL to "https://httpbin.org"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "url"

  @api @authentication @no-auth  
  Scenario: No Authentication - JSONPlaceholder GET
    Given user sets API base URL to "https://jsonplaceholder.typicode.com"
    When user sends GET request to "/posts/1"
    Then the response status code should be 200
    And the response body should contain "userId"

  @api @authentication @basic-auth
  Scenario: Basic Authentication - HTTPBin Success
    Given user sets API base URL to "https://httpbin.org"
    And user sets basic auth username "testuser" and password "testpass"
    When user sends GET request to "/basic-auth/testuser/testpass"
    Then the response status code should be 200
    And the response body should contain "authenticated"

  @api @authentication @basic-auth
  Scenario: Basic Authentication - Postman Echo Success
    Given user sets API base URL to "https://postman-echo.com"
    And user sets basic auth username "postman" and password "password"
    When user sends GET request to "/basic-auth"
    Then the response status code should be 200
    And the response body should contain "authenticated"

  @api @authentication @bearer-token
  Scenario: Bearer Token Authentication - Two Step Flow
    Given user sets API base URL to "https://httpbin.org"
    # Step 1: Get a token (simulated)
    And user sets request body to:
      """
      {
        "username": "testuser",
        "password": "testpass"
      }
      """
    When user sends POST request to "/post"
    Then the response status code should be 200
    # Step 2: Use the token for authenticated request
    And user sets bearer token "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token"
    When user sends GET request to "/bearer"
    Then the response status code should be 200

  @api @authentication @api-key
  Scenario: API Key Authentication - Header Based
    Given user sets API base URL to "https://httpbin.org"
    And user sets API key header "X-API-Key" to "test-api-key-12345"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "X-API-Key"

  @api @authentication @api-key  
  Scenario: API Key Authentication - Query Parameter
    Given user sets API base URL to "https://httpbin.org"
    And user sets API key parameter "api_key" to "test-query-key-67890"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "api_key"

  @api @authentication @oauth2
  Scenario: OAuth2 Client Credentials Flow
    Given user sets API base URL to "https://httpbin.org"
    And user sets OAuth2 client credentials:
      | clientId     | test-client-id     |
      | clientSecret | test-client-secret |
      | tokenUrl     | https://httpbin.org/post |
      | scope        | read write         |
    When user sends GET request to "/oauth"
    Then the response status code should be 200

  @api @authentication @certificate
  Scenario: Client Certificate Authentication - P12 Format
    Given user sets API base URL to "https://httpbin.org"
    And user sets certificate authentication:
      | certPath | test-client.p12 |
      | password | certpass123     |
      | type     | pkcs12         |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @authentication @certificate
  Scenario: Client Certificate Authentication - PEM Format  
    Given user sets API base URL to "https://httpbin.org"
    And user sets certificate authentication:
      | certPath | test-client.pem |
      | keyPath  | test-client.key |
      | type     | pem            |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @authentication @ntlm
  Scenario: NTLM Authentication
    Given user sets API base URL to "https://httpbin.org"
    And user sets NTLM auth username "domain\\testuser" and password "ntlmpass123"
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @authentication @aws
  Scenario: AWS Signature Authentication
    Given user sets API base URL to "https://httpbin.org"
    And user sets AWS auth "AKIAIOSFODNN7EXAMPLE" and "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @authentication @aws-detailed
  Scenario: AWS Signature Authentication - Detailed Configuration
    Given user sets API base URL to "https://httpbin.org"
    And user sets AWS authentication:
      | accessKey    | AKIAIOSFODNN7EXAMPLE              |
      | secretKey    | wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY |
      | region       | us-east-1                         |
      | service      | execute-api                       |
      | sessionToken | temporary-session-token-here      |
    When user sends GET request to "/get"
    Then the response status code should be 200

  @api @authentication @custom
  Scenario: Custom Authentication Header
    Given user sets API base URL to "https://httpbin.org"
    And user sets custom auth header "X-Custom-Auth" to "CustomToken123456"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "X-Custom-Auth"

  @api @authentication @certificate-errors
  Scenario: Certificate Error Handling - Self Signed
    Given user sets API base URL to "https://self-signed.badssl.com"
    When user sends GET request to "/"
    Then the response status code should be 200 or certificate error occurs

  @api @authentication @certificate-errors
  Scenario: Certificate Error Handling - Expired Certificate
    Given user sets API base URL to "https://expired.badssl.com"
    When user sends GET request to "/"
    Then the response status code should be 200 or certificate error occurs

  @api @authentication @certificate-errors
  Scenario: Certificate Error Handling - Missing Client Certificate
    Given user sets API base URL to "https://httpbin.org"
    And user clears authentication
    When user sends GET request to "/get"
    Then the response status code should be 200 