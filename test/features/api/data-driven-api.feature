Feature: Data-Driven API Testing
  As an API tester
  I want to test APIs with different data sets
  So that I can verify API functionality with various inputs

  Background:
    Given user loads test data from "api/api-test-data.json" as "apiData"

  @api @data-driven
  Scenario Outline: Test Different HTTP Methods with httpbin.org
    Given user sets base URL to "{{apiData.endpoints.httpbin.baseUrl}}"
    When user sends <method> request to "{{apiData.endpoints.httpbin.paths.<path>}}"
    Then response status code should be 200
    And response should contain JSON:
      | path | type |
      | url  | string |
      | headers | object |

    Examples:
      | method | path |
      | GET    | get |
      | POST   | post |
      | PUT    | put |
      | DELETE | delete |

  @api @data-driven
  Scenario Outline: Create Posts for Different Users
    Given user sets base URL to "{{apiData.endpoints.jsonplaceholder.baseUrl}}"
    And user sets request body to JSON:
      """
      {
        "title": "{{apiData.testPosts[<index>].title}}",
        "body": "{{apiData.testPosts[<index>].body}}",
        "userId": {{apiData.testUsers[<index>].id}}
      }
      """
    When user sends POST request to "{{apiData.endpoints.jsonplaceholder.paths.posts}}"
    Then response status code should be 201
    And response should contain JSON:
      | path | type |
      | id | number |
      | title | string |
      | body | string |
      | userId | number |

    Examples:
      | index |
      | 0 |
      | 1 |

  @api @data-driven @ado
  Scenario: Test API with ADO Integration
    Given user loads test data from "api/api-test-data.json" as "apiData"
    And user sets ADO test case ID "TC-1234"
    And user sets base URL to "{{apiData.endpoints.jsonplaceholder.baseUrl}}"
    When user sends GET request to "{{apiData.endpoints.jsonplaceholder.paths.users}}/1"
    Then response status code should be 200
    And user captures response as ADO evidence
    And user updates ADO test case with status "Passed" 