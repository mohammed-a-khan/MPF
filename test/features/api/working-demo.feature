@API @Demo @Working
Feature: API Features Demonstration - Working Version
  As a QA engineer
  I want to demonstrate all API testing capabilities
  So that I can validate the framework's functionality

  Background:
    Given I am testing API endpoints
    And I have a valid API context
    And I set the base URL to "https://httpbin.org"

  @BasicHTTP @GET
  Scenario: Test GET request functionality
    Given I set the endpoint to "/get"
    When I send a GET request
    Then the response status code should be 200
    And the response should contain JSON data
    And the response time should be less than 5000 milliseconds

  @BasicHTTP @POST
  Scenario: Test POST request with JSON data
    Given I set the endpoint to "/post"
    And I set the request content type to "application/json"
    And I set the request body to:
    """
    {
      "name": "CS Framework Demo",
      "method": "POST",
      "features": ["API Testing", "BDD", "Validation"]
    }
    """
    When I send a POST request
    Then the response status code should be 200
    And the response should contain "CS Framework Demo" in the JSON path "$.json.name"
    And the response should contain "POST" in the JSON path "$.json.method"

  @Authentication @BasicAuth
  Scenario: Test Basic Authentication
    Given I set the endpoint to "/basic-auth/testuser/testpass"
    And I set basic authentication with username "testuser" and password "testpass"
    When I send a GET request
    Then the response status code should be 200
    And the response should contain "authenticated" in the JSON path "$.authenticated"
    And the response should contain "testuser" in the JSON path "$.user"

  @Validation @StatusCodes
  Scenario Outline: Test different HTTP status codes
    Given I set the endpoint to "/status/<status_code>"
    When I send a GET request
    Then the response status code should be <expected_status>

    Examples:
      | status_code | expected_status |
      | 200         | 200            |
      | 201         | 201            |
      | 404         | 404            |
      | 500         | 500            |

  @Headers @CustomHeaders
  Scenario: Test custom headers functionality
    Given I set the endpoint to "/headers"
    And I set the header "X-Custom-Header" to "CS-Framework-Test"
    And I set the header "User-Agent" to "CS-API-Framework/1.0"
    When I send a GET request
    Then the response status code should be 200
    And the response should contain "CS-Framework-Test" in the JSON path "$.headers.X-Custom-Header"
    And the response should contain "CS-API-Framework/1.0" in the JSON path "$.headers.User-Agent"

  @DataDriven @Multiple
  Scenario: Test multiple endpoints in sequence
    Given I set the endpoint to "/get"
    When I send a GET request
    Then the response status code should be 200
    And I store the response in context as "first_response"
    
    Given I set the endpoint to "/post"
    And I set the request content type to "application/json"
    And I set the request body to:
    """
    {
      "previous_request": "stored",
      "test_data": "multiple_requests"
    }
    """
    When I send a POST request
    Then the response status code should be 200
    And the response should contain "stored" in the JSON path "$.json.previous_request" 