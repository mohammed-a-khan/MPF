@akhan @login @navigation @data-driven @json
Feature: AKHAN Login and Navigation - JSON Data Driven
  As a user of AKHAN application
  I want to login and navigate through modules using JSON test data
  So that I can verify the application functionality with structured JSON data

  Background:
    Given I am on the AKHAN login page

  @regression @TestCase:501 @TC501-json @smoke @high
  @DataProvider(source="test/akhan/data/akhan-test-data.json",type="json",jsonPath="$.login_scenarios[?(@.executeTest==true)]",filter="priority=high")
  Scenario Outline: AKHAN Login Verification with JSON Data
    When I enter username "<username>" and password "<password>"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @regression @TestCase:503 @TC503-json @navigation
  @DataProvider(source="test/akhan/data/akhan-test-data.json",type="json",jsonPath="$.module_navigation_scenarios[0].modules[*]")
  Scenario Outline: Navigate to AKHAN modules using JSON Data
    Given I am logged in to AKHAN application
    When I click on "<name>" menu item
    Then I should see the "<expectedHeader>" header of type "<headerType>"

  @regression @TestCase:502 @TC502-json @menu-verification
  @DataProvider(source="test/akhan/data/akhan-test-data.json",type="json",jsonPath="$.navigation_scenarios[0].menuItems",skipFlag="true")
  Scenario Outline: Verify all menu items using JSON Data
    Given I am logged in to AKHAN application
    When I click on "<menuItem>" menu item
    Then I should be navigated to "<menuItem>" page