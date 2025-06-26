@akhan @login @navigation @data-driven @excel-demo
Feature: AKHAN Login and Navigation - Excel Data Driven Demo
  As a user of AKHAN application
  I want to demonstrate data-driven testing using Excel format
  So that I can verify the application functionality with Excel spreadsheet data

  Background:
    Given I am on the AKHAN login page

  @TC501 @smoke @high
  @DataProvider(source="test/akhan/data/akhan-combined-test-data.xlsx",type="excel",sheetName="Sheet1",headers="true",filter="testType=login,executeFlag=Y")
  Scenario: Standard user login with Excel data
    When I enter username "<username>" and password "<password>"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @TC503 @regression @medium
  @DataProvider(source="test/akhan/data/akhan-combined-test-data.xlsx",type="excel",sheetName="Sheet1",headers="true",filter="testType=navigation,executeFlag=Y")
  Scenario: Verify navigation to each module with Excel data
    Given I am logged in to AKHAN application
    When I click on "<module>" menu item
    Then I should be navigated to "<module>" page

  @TC502 @regression @medium  
  @DataProvider(source="test/akhan/data/akhan-combined-test-data.xlsx",type="excel",sheetName="Sheet1",headers="true",filter="testType=menu-verify,executeFlag=Y")
  Scenario: Verify menu items with Excel data
    Given I am logged in to AKHAN application
    Then I should see the following menu items
      | Admin           |
      | PIM            |
      | Leave          |
      | Time           |
      | Recruitment    |
      | My Info        |
      | Performance    |
      | Dashboard      |
      | Directory      |
      | Maintenance    |
      | Buzz           |