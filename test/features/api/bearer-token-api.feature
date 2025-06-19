Feature: API Testing with Bearer Token Authentication
  As an API tester
  I want to test endpoints that require bearer token authentication
  So that I can verify secure API functionality

  Background:
    Given user loads test data from "api/test-data.json" as "testData"
    And user sets ADO test case ID "{{testData.ado.testCases.bearerToken}}"

  @api @bearer-token @TestPlan-413 @TestSuite-414 @TestCase-417 @priority:1
  Scenario: Test Bearer Token Authentication Flow
    Given user sets base URL to "{{testData.api.endpoints.dummyJson.baseUrl}}"
    
    # Step 1: Get Bearer Token
    Given user sets request body to JSON:
      """
      {
        "username": "{{testData.api.endpoints.dummyJson.auth.username}}",
        "password": "{{testData.api.endpoints.dummyJson.auth.password}}"
      }
      """
    When user sends POST request to "{{testData.api.endpoints.dummyJson.paths.login}}"
    Then response status code should be 200
    And response should contain JSON:
      | path | type |
      | token | string |
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "application/json"
    And user stores response JSON "token" as "auth_token"
    And user captures response as ADO evidence

    # Step 2: Use Bearer Token
    Given user sets bearer token "{{auth_token}}"
    When user sends GET request to "{{testData.api.endpoints.dummyJson.paths.profile}}"
    Then response status code should be 200
    And response should contain JSON:
      | path | type |
      | id | number |
      | username | string |
      | email | string |
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "application/json"
    And user captures response as ADO evidence

  @api @bearer-token @TestPlan-413 @TestSuite-414 @TestCase-417 @priority:1
  Scenario: Test Bearer Token Authentication Failure
    Given user sets base URL to "{{testData.api.endpoints.dummyJson.baseUrl}}"
    And user sets bearer token "invalid_token"
    When user sends GET request to "{{testData.api.endpoints.dummyJson.paths.profile}}"
    Then response status code should be 401
    And response should contain JSON:
      | path | type | value |
      | message | string | Invalid/Expired Token! |
    And user captures response as ADO evidence 