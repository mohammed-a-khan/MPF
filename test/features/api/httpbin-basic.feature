Feature: HTTPBin Basic API Testing
  Background:
    Given user is working with "httpbin" API

  Scenario: Simple GET request to HTTPBin
    Given user sets API base URL to "https://httpbin.org"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "args"
    And the response time should be less than 5000 ms

  Scenario: POST request with JSON body
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
    And the response body should contain "test@example.com"

  Scenario: Basic Authentication
    Given user sets API base URL to "https://httpbin.org"
    And user sets basic auth username "user" and password "passwd"
    When user sends GET request to "/basic-auth/user/passwd"
    Then the response status code should be 200
    And the response body should contain "authenticated"
