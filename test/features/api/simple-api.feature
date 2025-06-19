Feature: Simple API Testing
  As an API tester
  I want to test endpoints without complex integration
  So that I can verify basic API functionality

  @api @simple
  Scenario: Test simple GET request to httpbin
    Given user is working with "httpbin" API
    When user sends GET request to "https://httpbin.org/get"
    Then the response status code should be 200
    And the response JSON path "$.url" should exist
    And the response JSON path "$.headers" should exist

  @api @simple
  Scenario: Test simple GET request to JSONPlaceholder
    Given user is working with "jsonplaceholder" API
    When user sends GET request to "https://jsonplaceholder.typicode.com/posts/1"
    Then the response status code should be 200
    And the response JSON path "$.id" should exist
    And the response JSON path "$.title" should exist
    And the response JSON path "$.body" should exist
    And the response JSON path "$.userId" should exist 