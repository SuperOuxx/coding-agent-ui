Feature: Codex session lifecycle
  As a chat system
  I want codex sessions to end in a deterministic state
  So that UI state can recover correctly

  @codex
  Scenario: Timed out codex stream returns timeout error
    Given codex stream never emits events
    And CODEX_STREAM_IDLE_TIMEOUT_MS is "10000"
    When I start a codex query for session "bdd-timeout-session"
    And I advance test clock by 14000 milliseconds
    Then codex query should finish
    And message type "session-created" should be emitted
    And message type "codex-error" should be emitted
    And emitted codex error should be "Codex request timed out after 10s of inactivity"
    And codex session "bdd-timeout-session" should be inactive

  @codex
  Scenario: Completed codex stream returns completion event
    Given codex stream emits a completed turn event
    And CODEX_STREAM_IDLE_TIMEOUT_MS is "10000"
    When I start a codex query for session "bdd-complete-session"
    Then codex query should finish
    And message type "session-created" should be emitted
    And message type "codex-complete" should be emitted
    And message type "codex-error" should not be emitted
    And codex session "bdd-complete-session" should be inactive

  @codex
  Scenario: Aborted codex session does not emit codex-error
    Given codex stream never emits events
    And CODEX_STREAM_IDLE_TIMEOUT_MS is "10000"
    When I start a codex query for session "bdd-abort-session"
    And I abort codex session "bdd-abort-session"
    Then codex query should finish
    And message type "codex-error" should not be emitted
    And codex session "bdd-abort-session" should be inactive
