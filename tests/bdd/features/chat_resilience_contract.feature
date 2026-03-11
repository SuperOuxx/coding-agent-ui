Feature: Chat resilience source contracts
  As a maintainer
  I want key resilience contracts to stay in source code
  So that regressions are caught early

  Scenario Outline: sendMessage contract returns boolean in chat layers
    Then file "<file>" should contain text "<text>"

    Examples:
      | file                                                | text                                       |
      | src/contexts/WebSocketContext.tsx                  | sendMessage: (message: unknown) => boolean |
      | src/components/chat/types/types.ts                 | sendMessage: (message: unknown) => boolean |
      | src/components/main-content/types/types.ts         | sendMessage: (message: unknown) => boolean |
      | src/components/chat/hooks/useChatComposerState.ts  | sendMessage: (message: unknown) => boolean |
      | src/components/chat/hooks/useChatSessionState.ts   | sendMessage: (message: unknown) => boolean |

  Scenario: Composer send failure path exists before session activation
    Then file "src/components/chat/hooks/useChatComposerState.ts" should contain text "const sent = sendMessage(requestPayload);"
    And file "src/components/chat/hooks/useChatComposerState.ts" should contain text "if (!sent) {"
    And file "src/components/chat/hooks/useChatComposerState.ts" should contain text "handleSendFailure();"
    And file "src/components/chat/hooks/useChatComposerState.ts" should contain text "Connection lost before request was sent. Please wait for reconnect and retry."
    And in file "src/components/chat/hooks/useChatComposerState.ts" text "const sent = sendMessage(requestPayload);" should appear before text "onSessionActive?.(sessionToActivate);"

  Scenario: Session polling contract stays at 5s and skips temporary sessions
    Then file "src/components/chat/hooks/useChatSessionState.ts" should contain text "statusSessionId.startsWith('new-session-')"
    And file "src/components/chat/hooks/useChatSessionState.ts" should contain text "window.setInterval(pollSessionStatus, 5000);"
    And file "src/components/chat/hooks/useChatSessionState.ts" should contain text "type: 'check-session-status'"
