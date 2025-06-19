Feature: Test API Step Definitions
  As a developer
  I want to verify that API step definitions are loaded
  So that I can debug the step loading issue

  @api @test
  Scenario: Test basic step definitions exist
    When user sends GET request to "https://httpbin.org/get" 