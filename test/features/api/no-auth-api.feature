Feature: API Testing without Authentication
  As an API tester
  I want to test endpoints that don't require authentication
  So that I can verify basic API functionality

  Background:
    Given user loads test data from "api/test-data.json" as "testData"
    And user sets ADO test case ID "{{testData.ado.testCases.noAuth}}"

  @api @no-auth @TestPlan-413 @TestSuite-414 @TestCase-415 @priority:2
  Scenario: Test GET request to httpbin.org
    Given user sets base URL to "{{testData.api.endpoints.httpbin.baseUrl}}"
    When user sends GET request to "{{testData.api.endpoints.httpbin.paths.get}}"
    Then response status code should be 200
    And response should contain JSON:
      | path | type |
      | url  | string |
      | headers | object |
      | args | object |
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "application/json"
    And user captures response as ADO evidence

  @api @no-auth @TestPlan-413 @TestSuite-414 @TestCase-415 @priority:2
  Scenario: Test GET request to JSONPlaceholder
    Given user sets base URL to "https://jsonplaceholder.typicode.com"
    When user sends GET request to "/users/1"
    Then response status code should be 200
    And response should contain JSON:
      | path | type |
      | id | number |
      | name | string |
      | email | string |
      | address | object |
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "application/json"
    And user captures response as ADO evidence 