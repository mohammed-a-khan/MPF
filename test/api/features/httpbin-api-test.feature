Feature: HTTPBin API Testing
  As a QA engineer
  I want to test HTTPBin API endpoints
  So that I can validate API responses and authentication

  Background:
    Given user is working with "httpbin" API
    And user sets API base URL to "https://httpbin.org"
    And user sets API timeout to 30 seconds
    And user enables API request logging

  @api @httpbin @get @simple
  Scenario: Test HTTPBin GET endpoint with certificate authentication - Simple
    Given user loads certificate from "certificates/client.pfx" with password "test123"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response JSON path "$.url" should equal "https://httpbin.org/get"
    And the response JSON path "$.headers" should exist
    And the response JSON path "$.args" should exist
    And the response JSON path "$.origin" should exist
    And the response body should contain "httpbin.org"
    And the response time should be less than 5000 ms

  @api @httpbin @get @validation
  Scenario: Verify HTTPBin GET response basic structure
    Given user loads certificate from "certificates/client.pfx" with password "test123"
    When user sends GET request to "/get"
    Then the response status code should be 200
    And the response JSON path "$.headers.Host" should equal "httpbin.org"
    And the response JSON path "$.headers.User-Agent" should exist
    And the response body should contain "https://httpbin.org/get" 