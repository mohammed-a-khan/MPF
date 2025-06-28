@akhan @login @navigation
Feature: akhan Login and Navigation

  @TC501 @smoke @high
  Scenario: Standard user login
    Given user is on the akhan login page
    When user enters username "Admin" and password "admin123"
    And user clicks on the Log On link
    Then user should be logged in successfully
    And user should see the akhan home page

  @TC502 @regression @medium
  Scenario: Verify menu items
    Given user is logged in to akhan application with username "Admin" and password "admin123"
    Then user should see the following menu items
      | Admin                |
      | PIM        |
      | Leave |
      | Time   |
      | Recruitment |
      | My Info       |
      | Performance|
      | Directory        |

  @TC503 @regression @medium
  Scenario Outline: Verify navigation to each module
    Given user is logged in to akhan application with username "Admin" and password "admin123"
    When user clicks on "<moduleName>" menu item
    Then user should see the "<expectedHeader>" page

    Examples:
      | moduleName           | expectedHeader       |
      | PIM         | PIM        |
      | Leave | Leave  |
      | Time    | Time     |
      | Recruitment  | Recruitment   |