Feature: API Testing with Basic Authentication
  As an API tester
  I want to test endpoints that require basic authentication
  So that I can verify secure API functionality

  Background:
    Given user loads test data from "api/test-data.json" as "testData"
    And user sets ADO test case ID "{{testData.ado.testCases.basicAuth}}"

  @api @basic-auth @TestPlan-413 @TestSuite-414 @TestCase-416 @priority:2
  Scenario: Test Basic Auth with httpbin.org
    Given user sets base URL to "{{testData.api.endpoints.httpbin.baseUrl}}"
    And user sets basic auth username "{{testData.api.endpoints.httpbin.auth.username}}" and password "{{testData.api.endpoints.httpbin.auth.password}}"
    When user sends GET request to "{{testData.api.endpoints.httpbin.paths.basicAuth}}"
    Then response status code should be 200
    And response should contain JSON:
      | path | type | value |
      | authenticated | boolean | true |
      | user | string | {{testData.api.endpoints.httpbin.auth.username}} |
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "application/json"
    And user captures response as ADO evidence

  @api @basic-auth @TestPlan-413 @TestSuite-414 @TestCase-416 @priority:2
  Scenario: Test Basic Auth with postman-echo
    Given user sets base URL to "{{testData.api.endpoints.postmanEcho.baseUrl}}"
    And user sets basic auth username "{{testData.api.endpoints.postmanEcho.auth.username}}" and password "{{testData.api.endpoints.postmanEcho.auth.password}}"
    When user sends GET request to "{{testData.api.endpoints.postmanEcho.paths.basicAuth}}"
    Then response status code should be 200
    And response should contain JSON:
      | path | type | value |
      | authenticated | boolean | true |
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "application/json"
    And user captures response as ADO evidence

  @api @basic-auth @TestPlan-413 @TestSuite-414 @TestCase-416 @priority:2
  Scenario: Test Basic Auth Failure
    Given user sets base URL to "{{testData.api.endpoints.httpbin.baseUrl}}"
    And user sets basic auth username "invalid" and password "invalid"
    When user sends GET request to "{{testData.api.endpoints.httpbin.paths.basicAuth}}"
    Then response status code should be 401
    And response header "WWW-Authenticate" should contain "Basic"
    And user captures response as ADO evidence 