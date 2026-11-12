Feature: Keeping private text on the machine

  Scenario: A session title never leaves
    Given facts with a desk titled "Client contract review"
    When the agent redacts them
    Then no desk carries a title
    And the desk still names its project

  Scenario: A tool label never leaves
    Given facts with a desk whose activity label is "secret-token.txt"
    When the agent redacts them
    Then no desk carries an activity label

  Scenario: Paths and branches never leave
    Given facts with a project path "/Users/alice/Dev/private"
    When the agent redacts them
    Then no project carries a path
    And no desk carries a branch

  Scenario: Commit subjects never leave
    Given facts with a commit subject "fix: rotate the api key"
    When the agent redacts them
    Then no project carries commit subjects

  Scenario: Titles can be kept on purpose
    Given facts with a desk titled "Client contract review"
    When the agent redacts them keeping titles
    Then the desk carries the title "Client contract review"

  Scenario: An excluded project never leaves
    Given facts with a desk and a project "side-project" and a desk in "connected-office"
    When the agent excludes "SIDE-PROJECT" and redacts them
    Then nothing names "side-project"
    And the desk still names its project

  Scenario: An excluded project's time leaves the totals
    Given facts where "side-project" worked 120 minutes and "connected-office" 30 minutes on 2026-11-09
    When the agent excludes "side-project" and redacts them
    Then the totals count 30 agent minutes and 1 project
    And 2026-11-09 counts 30 minutes

  Scenario: A project outside the listed folders never leaves
    Given facts with a project in "/home/alice/Dev/work/api" and one in "/home/alice/Dev/side-project/lobby"
    When the agent keeps only "~/Dev/work" and redacts them
    Then nothing names "lobby"
    And a project is named "api"

  Scenario: Counts in a list survive
    Given facts where hour 8 counts 20 agent minutes
    When the agent redacts them
    Then hour 8 still counts 20 agent minutes

  Scenario: Times and kinds a drawing reads survive
    Given facts with a specialist intern, an activity since 11:00 and a commit at 10:30
    When the agent redacts them
    Then the intern is still a specialist, the activity still starts at 11:00 and the commit still has its time

  Scenario: The listed folders work with Windows paths
    Given facts with a project in "c:\Users\alice\Dev\work\api" and one in "C:\Users\alice\Dev\side-project\lobby"
    When the agent on Windows keeps only "~/Dev/work" and redacts them
    Then nothing names "lobby"
    And a project is named "api"
