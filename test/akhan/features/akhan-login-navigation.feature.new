@akhan @login @navigation
Feature: AKHAN Login and Navigation

  @TC501 @smoke @high
  Scenario: Standard user login
    Given I am on the AKHAN login page
    When I enter username "Admin" and password "admin123"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @TC502 @regression @medium
  Scenario: Verify menu items
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

  @TC503 @regression @medium
  Scenario Outline: Verify navigation to each module
    Given I am logged in to AKHAN application
    When I click on "<module>" menu item
    Then I should be navigated to "<module>" page

    Examples:
      | module      |
      | Admin      |
      | PIM        |
      | Leave      |
      | Time       |
      | Recruitment|
      | My Info    |
      | Performance|
      | Dashboard  |
      | Directory  |
      | Maintenance|
      | Buzz       | 