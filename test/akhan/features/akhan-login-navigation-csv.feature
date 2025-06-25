@akhan @login @navigation @data-driven @csv
Feature: AKHAN Login and Navigation - CSV Data Driven
  As a user of AKHAN application
  I want to login and navigate through modules using CSV test data
  So that I can verify the application functionality with CSV data sets

  Background:
    Given I am on the AKHAN login page

  @regression @TestCase:501 @TC501-csv @smoke @high
  @DataProvider(source="test/akhan/data/akhan-login-data.csv",type="csv",headers="true",filter="environment=SIT,status=active")
  Scenario Outline: AKHAN Login Verification with CSV Data
    When I enter username "<username>" and password "<password>"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @regression @TestCase:503 @TC503-csv @navigation
  @DataProvider(source="test/akhan/data/akhan-navigation-data.csv",type="csv",headers="true",filter="testType=navigation,executeFlag=Y")
  Scenario Outline: Navigate to AKHAN modules using CSV Data
    Given I am logged in to AKHAN application
    When I click on "<moduleName>" menu item
    Then I should see the "<expectedHeader>" header of type "h1"

  @regression @TestCase:502 @TC502-csv @menu-verification
  @DataProvider(source="test/akhan/data/akhan-menu-items.csv",type="csv",headers="true",delimiter=",",filter="menuGroup=main")
  Scenario Outline: Verify menu structure using CSV Data
    Given I am logged in to AKHAN application
    When I click on "<menuItem>" menu item
    Then I should be navigated to "<menuItem>" page