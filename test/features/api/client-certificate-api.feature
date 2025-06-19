Feature: API Testing with Client Certificate Authentication
  As an API tester
  I want to test endpoints that require client certificate authentication
  So that I can verify mutual TLS functionality

  Background:
    Given user loads test data from "api/test-data.json" as "testData"
    And user sets ADO test case ID "{{testData.ado.testCases.clientCert}}"

  @api @client-cert @p12 @TestPlan-413 @TestSuite-414 @TestCase-418 @priority:1
  Scenario: Test P12 Client Certificate Authentication
    Given user sets base URL to "{{testData.api.endpoints.badssl.baseUrl}}"
    And user loads certificate from "{{testData.api.endpoints.badssl.certificates.p12.path}}" with password "{{testData.api.endpoints.badssl.certificates.p12.password}}"
    When user sends GET request to "{{testData.api.endpoints.badssl.paths.root}}"
    Then response status code should be 200
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "text/html"
    And user captures response as ADO evidence

  @api @client-cert @pem @TestPlan-413 @TestSuite-414 @TestCase-418 @priority:1
  Scenario: Test PEM Client Certificate Authentication
    Given user sets base URL to "{{testData.api.endpoints.badssl.baseUrl}}"
    And user sets certificate authentication:
      | certFile | {{testData.api.endpoints.badssl.certificates.pem.certFile}} |
      | keyFile  | {{testData.api.endpoints.badssl.certificates.pem.keyFile}} |
    When user sends GET request to "{{testData.api.endpoints.badssl.paths.root}}"
    Then response status code should be 200
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "text/html"
    And user captures response as ADO evidence

  @api @client-cert @pfx @TestPlan-413 @TestSuite-414 @TestCase-418 @priority:1
  Scenario: Test PFX Client Certificate Authentication
    Given user sets base URL to "{{testData.api.endpoints.badssl.baseUrl}}"
    And user loads certificate from "{{testData.api.endpoints.badssl.certificates.pfx.path}}" with password "{{testData.api.endpoints.badssl.certificates.pfx.password}}"
    When user sends GET request to "{{testData.api.endpoints.badssl.paths.root}}"
    Then response status code should be 200
    And response time should be less than 5000 ms
    And response header "Content-Type" should contain "text/html"
    And user captures response as ADO evidence

  @api @client-cert @error @TestPlan-413 @TestSuite-414 @TestCase-418 @priority:1
  Scenario: Test Client Certificate Authentication Failure
    Given user sets base URL to "{{testData.api.endpoints.badssl.baseUrl}}"
    When user sends GET request to "{{testData.api.endpoints.badssl.paths.root}}"
    Then response status code should be 400
    And user captures response as ADO evidence

  @api @client-cert @TestPlan-413 @TestSuite-414 @TestCase-418 @priority:1
  Scenario: Update ADO Test Case Status
    Given user sets ADO test case ID "418"
    Then user updates ADO test case with status "Passed" 