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