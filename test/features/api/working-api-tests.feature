@api @smoke
Feature: API Testing - Core Scenarios
  This feature contains the core API testing scenarios for the CS Test Automation Framework

  Background:
    Given test environment is ready

  @httpbin @get
  Scenario: HTTPBin GET Request Test
    Given user sets API base URL to "https://httpbin.org"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "httpbin"

  @jsonplaceholder @get  
  Scenario: JSONPlaceholder GET Request Test
    Given user sets API base URL to "https://jsonplaceholder.typicode.com"
    When user sends GET request to "/posts/1"
    Then the response status code should be 200
    And the response body should contain "userId"

  @httpbin @post
  Scenario: HTTPBin POST Request Test
    Given user sets API base URL to "https://httpbin.org"
    And user sets request body to JSON:
      """
      {
        "username": "testuser",
        "password": "testpass"
      }
      """
    When user sends POST request to "/post"
    Then the response status code should be 200
    And the response body should contain "testuser"

  @basic-auth
  Scenario: Basic Authentication Test
    Given user sets API base URL to "https://httpbin.org"
    And user sets basic authentication with username "testuser" and password "testpass"
    When user sends GET request to "/basic-auth/testuser/testpass"
    Then the response status code should be 200
    And the response body should contain "authenticated"

  @pfx @certificate
  Scenario: PFX Certificate Authentication Test
    Given user sets API base URL to "https://httpbin.org"
    Given user sets certificate authentication:
      | key      | value                    |
      | certPath | certificates/client.pfx  |
      | password | testPassword123          |
      | type     | pfx                      |
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response body should contain "httpbin"
