Feature: Deploying the relay

  Scenario: The compose file declares the relay
    Given the deploy directory
    When it is read
    Then the compose file declares a relay service
    And the relay publishes only on the loopback
    And the relay restarts unless stopped
    And the relay has a memory ceiling

  Scenario: The scripts are runnable
    Given the deploy directory
    When it is read
    Then start.sh is executable
    And stop.sh is executable

  Scenario: The image is built for the NAS architecture
    Given the deploy directory
    When it is read
    Then the image is built for linux/amd64
    And the timezone is pinned
