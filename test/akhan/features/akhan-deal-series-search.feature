@TestCase:504 @ADO_TestSuite:500
@DataProvider(source="test/data/akhan-test-data.json",type="json",filter="executeTest=true,priority=high")
Feature: AKHAN ESSS/Series Search
  As a user of AKHAN application
  I want to search for ESSS/Series
  So that I can find specific series information

  Background:
    Given I navigate to the AKHAN application
    When I enter username "login" and password "passwd"
    And I click on Log On link
    And I navigate to "ESSS/Series" module

  @regression @TestCase:504 @TC504 @smoke @high
  @DataProvider(source="test/data/akhan-test-data.json",type="json",jsonPath="$.esss_search_scenarios[?(@.testId=='TC504')]",filter="executeTest=true")
  Scenario Outline: Search ESSS by Key using JSON data
    Given I am logged in to AKHAN application
    And I am on the ESSS/Series page
    When I select search type "<searchType>"
    And I select search attribute "<searchAttribute>"
    And I enter search value "<searchValue>"
    And I click on the Search button
    Then I should see the search results
    And the search results should contain "<searchValue>"

    Examples:
      | searchType | searchAttribute | searchValue |

  @regression @TestCase:504
  @DataProvider(source="test/data/esss-search-data.xlsx",type="excel",sheet="SearchTests",filter="testType=regression,priority=high")
  Scenario Outline: Search ESSS by Key using Excel data
    When I select "<searchType>" from Type dropdown
    And I verify Type dropdown options
      | ESSS               |
      | Series            |
      | Reference Interest |
      | Fallback Interest |
      | Product Group     |
      | Business Line     |
      | Benchmark         |
      | Administrator     |
      | CDI Name         |
    And I select "<searchAttribute>" from Attribute dropdown
    And I verify Attribute dropdown options for ESSS type
      | Key  |
      | Name |
      | ID   |
    And I enter search value "<searchValue>"
    When I click on Search button
    Then I should see search results in the table
    And I should see "<searchValue>" in search results

    Examples:
      | searchType | searchAttribute | searchValue |

  @regression @TestCase:504
  @DataProvider(source="test/data/esss-search-data.csv",type="csv",headers="true",filter="environment=SIT,status=active")
  Scenario Outline: Search ESSS by Key using CSV data
    When I select "<searchType>" from Type dropdown
    And I select "<searchAttribute>" from Attribute dropdown
    And I enter search value "<searchValue>"
    When I click on Search button
    Then I should see search results in the table
    And I should see "<searchValue>" in search results

    Examples:
      | searchType | searchAttribute | searchValue |

  @regression @TestCase:504
  @data-provider:source="test/data/akhan-test-data.json",type="json",jsonPath="$.esss_search_scenarios[?(@.testId=='TC504')]"
  Scenario Outline: Verify dropdown options for ESSS search
    When I select "<searchType>" from Type dropdown
    And I verify Type dropdown options
      | ESSS               |
      | Series            |
      | Reference Interest |
      | Fallback Interest |
      | Product Group     |
      | Business Line     |
      | Benchmark         |
      | Administrator     |
      | CDI Name         |
    And I select "<searchAttribute>" from Attribute dropdown
    And I verify Attribute dropdown options for ESSS type
      | Key  |
      | Name |
      | ID   |
    And I enter search value "<searchValue>"
    When I click on Search button
    Then I should see search results in the table
    And I should see "<searchValue>" in search results

    Examples:
      | searchType | searchAttribute | searchValue | 