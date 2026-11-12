Feature: Merging two people's office facts

  Scenario: Two people's desks share one building
    Given Alice's facts hold a desk in project "connected-office"
    And Bob's facts hold a desk in project "connected-office"
    When the relay merges the latest facts of both people
    Then the merged office holds 2 desks
    And both desks sit in the room "connected-office"

  Scenario: Numbers add up across machines
    Given Alice's facts report 60 agent minutes for project "connected-office"
    And Bob's facts report 40 agent minutes for project "connected-office"
    When the relay merges the latest facts of both people
    Then project "connected-office" reports 100 agent minutes

  Scenario: Totals are the pushes' own, not a recount
    Given Alice's facts report 60 agent minutes for project "connected-office"
    And Bob's facts report 40 agent minutes for project "connected-office"
    When the relay merges the latest facts of both people
    Then the merged totals report 100 agent minutes

  Scenario: Per-day buckets add up
    Given Alice's facts report 30 minutes on day "2026-11-09"
    And Bob's facts report 45 minutes on day "2026-11-09"
    When the relay merges the latest facts of both people
    Then the merged day "2026-11-09" reports 75 minutes

  Scenario: A machine that stopped pushing leaves the live floor
    Given Alice's facts hold a desk in project "connected-office"
    And Bob's facts hold a desk in project "connected-office"
    And Bob's facts were pushed 30 minutes ago
    When the relay merges the latest facts of both people
    Then the merged office holds only Alice's desks
    And project "connected-office" still reports Bob's agent minutes

  Scenario: One repository cloned under two folder names is one room
    Given the folder names "proj-a" and "proj-b" stand for "shared"
    And Alice's facts hold a desk in project "proj-a"
    And Bob's facts hold a desk in project "proj-b"
    When the relay merges the latest facts of both people
    Then both desks sit in the room "shared"
    And the merged office holds only the project "shared"

  Scenario: A push from another plugin version is refused
    Given a token issued for "alice"
    And a push with the spec "theoffice/1" has been accepted
    When a push whose spec is "theoffice/2" arrives with that token
    Then the relay answers 409
    And the relay still holds the "theoffice/1" push

  Scenario: An account with no label of its own takes the machine's
    Given Alice's facts hold an account with no label
    When the relay merges Alice's facts alone
    Then an account is labelled "alice"
    And no account label holds "null"
