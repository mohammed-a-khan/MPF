Feature: Simple Working API Test

  Scenario: Basic HTTPBin GET Test
    When user sends GET request to "https://httpbin.org/get"
    Then the response status code should be 200
    And the response body should contain "args"

  Scenario: Basic JSONPlaceholder GET Test  
    When user sends GET request to "https://jsonplaceholder.typicode.com/users/1"
    Then the response status code should be 200
    And the response body should contain "name"
