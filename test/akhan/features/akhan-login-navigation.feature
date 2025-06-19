@akhan @login @navigation
Feature: AKHAN Login and Navigation

  @TC501 @smoke @high
  Scenario: Standard user login
    Given I am on the AKHAN login page
    When I enter username "login" and password "passwd"
    And I click on the Log On link
    Then I should be logged in successfully
    And I should see the AKHAN home page

  @TC502 @regression @medium
  Scenario: Verify menu items
    Given I am logged in to AKHAN application
    Then I should see the following menu items
      | Home                |
      | ESSS/Series        |
      | Reference Interests |
      | Interest History   |
      | External Interests |
      | System Admin       |
      | Version Information|
      | File Upload        |

  @TC503 @regression @medium
  Scenario Outline: Verify navigation to each module
    Given I am logged in to AKHAN application
    When I click on "<moduleName>" menu item
    Then I should see the "<expectedHeader>" header of type "<headerType>"

    Examples:
      | moduleName           | expectedHeader       | headerType |
      | ESSS/Series         | ESSSs/Series        | h1         |
      | Reference Interests | Reference Interests  | h1         |
      | Interest History    | Interest History     | h1         |
      | External Interests  | External Interests   | h1         |
      | System Admin        | System Admin         | h1         |
      | Version Information | Version Information  | h1         |
      | File Upload         | Add files            | span       | 