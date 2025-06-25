@akhan @login @navigation @data-driven @excel
Feature: AKHAN Login and Navigation - Excel Data Driven
  As a user of AKHAN application
  I want to login and navigate through modules using Excel test data
  So that I can verify the application functionality with multiple data sets

  Background:
    Given I am on the AKHAN login page

  @regression @TestCase:501 @TC501-excel @smoke @high
  @DataProvider(source="test/akhan/data/akhan-login-data.xlsx",type="excel",sheet="LoginData",filter="executeTest=true")
  Scenario Outline: AKHAN Login Verification with Excel Data
    When I enter username "<username>" and password "<password>"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @regression @TestCase:503 @TC503-excel @navigation
  @DataProvider(source="test/akhan/data/akhan-navigation-data.xlsx",type="excel",sheet="NavigationModules",filter="executeTest=true,priority=high")
  Scenario Outline: Navigate to AKHAN modules using Excel Data
    Given I am logged in to AKHAN application
    When I click on "<moduleName>" menu item
    Then I should see the "<expectedHeader>" header of type "<headerType>"

  @regression @TestCase:502 @TC502-excel @menu-verification
  @DataProvider(source="test/akhan/data/akhan-navigation-data.xlsx",type="excel",sheet="MenuItems",filter="isVisible=true")
  Scenario Outline: Verify menu items visibility using Excel Data
    Given I am logged in to AKHAN application
    When I click on "<menuItem>" menu item
    Then I should be navigated to "<menuItem>" page