Feature: Authenticating machines and viewers

  Scenario: A push without a token is refused
    When a push arrives without an Authorization header
    Then the relay answers 401

  Scenario: A push with an unknown token is refused
    When a push arrives with the bearer token "not-a-real-token"
    Then the relay answers 401

  Scenario: A push with a known token is accepted
    Given a token issued for "alice"
    When a push arrives with that token
    Then the relay answers 202

  Scenario: A body above the size limit is refused
    Given a token issued for "alice"
    When a push of 2 megabytes arrives with that token
    Then the relay answers 413

  Scenario: The page is not served without the proxy
    When a browser asks for the page without the proxy header
    Then the relay answers 401
