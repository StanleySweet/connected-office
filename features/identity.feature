Feature: Naming who sits at a desk

  Scenario: Each token names its person
    Given a token issued for "alice"
    When a push arrives with that token
    Then every desk of that push carries the account "alice"

  Scenario: A person's history names them
    Given a token issued for "bob"
    When a push arrives with that token
    Then the merged facts list an account labelled "bob"

  Scenario: A machine with several accounts keeps both names
    Given a token issued for "alice"
    And a push whose desks carry the account "work"
    When that push arrives with that token
    Then his desks carry the account "alice@work"
