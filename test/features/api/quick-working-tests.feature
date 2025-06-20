Feature: Quick Working API Tests

  @no-auth
  Scenario: HTTPBin GET Test
    Given user sets API base URL to "https://httpbin.org"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "args"

  @no-auth  
  Scenario: JSONPlaceholder GET Test
    Given user sets API base URL to "https://jsonplaceholder.typicode.com"
    When user sends GET request to "/users/1"
    Then the response status code should be 200
    And the response body should contain "name"

  @post-test
  Scenario: HTTPBin POST Test
    Given user sets API base URL to "https://httpbin.org"
    And user sets JSON body:
      """
      {
        "name": "Test User",
        "email": "test@example.com"
      }
      """
    When user sends POST request to "/post"
    Then the response status code should be 200
    And the response body should contain "Test User" 