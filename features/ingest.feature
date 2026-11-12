Feature: Receiving activity from a laptop

  Scenario: A new push replaces the previous one
    Given a token issued for "alice"
    When a push arrives with that token
    And another push arrives with that token
    Then the relay holds exactly 1 push for "alice"

  Scenario: The relay wakes the open pages
    Given a token issued for "alice"
    And a page listening on the event stream
    When a push arrives with that token
    Then the listening page receives a change signal

  Scenario: The facts survive a restart
    Given a token issued for "alice"
    When a push arrives with that token
    And the relay restarts
    Then the relay still holds 1 push for "alice"
