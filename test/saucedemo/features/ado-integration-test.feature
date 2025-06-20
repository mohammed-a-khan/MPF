Feature: ADO Integration Test
  As a test automation engineer
  I want to verify that test results are correctly uploaded to ADO
  So that I can track test execution in Azure DevOps

  Background:
    Given I am on the SauceDemo login page

  @TestPlanId-413 @TestSuiteId-414 @TestCaseId-415
  Scenario: Successful login with valid credentials
    When I login with username "standard_user" and password "secret_sauce"
    Then I should see the products page
    And performance metrics should be captured

  @TestPlanId-413 @TestSuiteId-414 @TestCaseId-416
  Scenario: Failed login with invalid credentials
    When I login with username "invalid_user" and password "invalid_password"
    Then I should see an error message
    And the error should be logged appropriately