# Conversation Architecture for LLM-Driven Onboarding Slot Filling (Voice + Text)

Research date: 2026-09-27. Scope: architecture patterns for collecting four onboarding fields (agent name, user name, connected Gmail, one thing the user wants help with) across a voice call and a text chat sharing state, with failure handling, adversarial users, graduation logic, and evaluation.

Source-quality note for the report writer: pages were read through a fetch tool that summarizes content with a small model, so "verbatim" quotes below are as returned by that tool and should be treated as close paraphrase unless re-verified. Items marked "(search snippet)" come from search-result summaries rather than a full page read and are lower confidence. Vendor blogs (Hamming, Coval, Cekura, Retell, Daily) have a commercial interest in the conclusion they argue for.

## 1. Architecture options for slot filling with LLMs: pure prompt, explicit flow graph, or hybrid

### Takeaway
The 2025-2026 consensus across framework vendors is that the LLM should own language understanding and phrasing while a deterministic layer outside the model owns state, transitions, and tool availability. For a four-field onboarding, a full flow graph is more structure than needed; the best fit is a single conversational agent with a server-side state store, write-through tool calls, and a dynamically regenerated "what is known / what is missing" context block.

### Cited Findings
- Daily (Pipecat maintainers) argue large context windows do not remove the need for structure: "simply providing access to everything is not the same as providing guidance." The named failure mode of single-prompt agents is context rot, where "instructions or important data from earlier in the history start to be ignored," plus task confusion and premature workflow exits. Published January 12, 2026. — [Daily blog: Beyond the Context Window](https://www.daily.co/blog/beyond-the-context-window-why-your-voice-agent-needs-structure-with-pipecat-flows/)
- Pipecat Flows exerts control through two mechanisms: dynamic prompt adjustment based on conversation state, and changing which functions are available as the conversation progresses. It describes structure as "guardrails, keeping the LLM focused on the task at hand." — [Daily blog: Beyond the Context Window](https://www.daily.co/blog/beyond-the-context-window-why-your-voice-agent-needs-structure-with-pipecat-flows/)
- Pipecat Flows distinguishes declarative flows ("The graph, the prompts, which tools each node offers, and where each tool leads live in a flow config") from programmatic flows, used when "which tools a node offers, or where it can go next, depends on what has happened in the conversation." Flows are recommended when "You need precise control over how a conversation progresses through specific steps" and when "You want to improve LLM accuracy by focusing the model on one specific task at a time." — [Pipecat Flows introduction](https://docs.pipecat.ai/pipecat-flows/introduction)
- Pipecat Flows keeps a persistent `flow_manager.state` dictionary shared across nodes; handlers return a `(result, next_node)` tuple; prompts can reference state with `{{ key }}` placeholders that are filled each time a node is entered; missing keys raise errors ("there is no silent empty string"); values should be stored "already formatted for speech." — [Pipecat Flows state management guide](https://docs.pipecat.ai/pipecat-flows/guides/state-management)
- Rasa CALM separates understanding from execution: "CALM uses LLM to understand user input in the context of the conversation. This is separate from task execution, which is handled by Flows." It claims this "Simplifies debugging by separating reasoning from task execution. LLMs output discrete commands, allowing you to pinpoint why the system behaved a certain way," and contrasts "Deterministic execution" with ReAct-style agents' vulnerability to "cascading errors." — [Rasa CALM concepts](https://rasa.com/docs/learn/concepts/calm/)
- Rasa's command generator takes active flows, previously filled slots, patterns, and history, and emits high-level commands including start flow, cancel flow, skip the current collection step, set slot, clarify, chitchat, knowledge answer, human handoff, and error (search snippet). — [Rasa Command Generator docs](https://rasa.com/docs/pro/customize/command-generator/)
- Rasa ships default "conversation repair" pattern flows that map closely to the failure cases in this assignment: `pattern_correction` (user changes a previous answer), `pattern_skip_question` (user wants to bypass a question), `pattern_chitchat` (off-topic without disrupting the main conversation), `pattern_cancel_flow`, `pattern_clarification`, `pattern_cannot_handle`, `pattern_continue_interrupted`, `pattern_repeat_bot_messages`, `pattern_user_silence` (voice silence), `pattern_validate_slot`, `pattern_session_start`, `pattern_completed`, `pattern_human_handoff`, `pattern_internal_error`. — [Rasa patterns reference](https://rasa.com/docs/reference/primitives/patterns/)
- Retell guidance: single-prompt agents are fastest to set up and suit linear flows with 1-3 functions; consider conversation flow or multi-prompt "when your single prompt exceeds 1000 words or uses more than 5 functions" (search snippet). — [Retell prompt overview docs](https://docs.retellai.com/build/single-multi-prompt/prompt-overview)
- OpenAI's agent-building guide recommends maximizing a single agent's capabilities first before moving to multi-agent designs (search snippet). — [OpenAI: A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- State machines enable "sandboxing": restricting which tools are loaded per state so the model cannot take an out-of-state action, described as an architectural guarantee rather than a prompt instruction (search snippet, practitioner blog). — [GrowwStacks: Voice AI in Production: State Machines](https://growwstacks.com/blog/voice-ai-production-state-machines)
- A September 2026 practitioner roundup recommends a hybrid for the audio layer too: streaming for the data plane with a lightweight state machine for floor ownership. — [WebRTC.ventures: interruption handling, state machines vs streaming](https://webrtc.ventures/2026/09/voice-ai-interruption-handling-state-machines-vs-streaming/)
- LangGraph's persistence model saves graph state at every super-step via checkpointers keyed by `thread_id`; resuming means invoking with the same `thread_id`. When resuming from an `interrupt()`, the whole node re-executes, so logic before the interrupt must be idempotent (search snippet). — [LangGraph persistence docs](https://docs.langchain.com/oss/python/langgraph/persistence)

### Inferences
- Tradeoff summary, synthesized from the above:
  - Pure prompt agent: most natural, fastest to build, weakest guarantees. State lives only in the transcript, so a hangup or context truncation loses it, and there is nothing deterministic to assert against in tests.
  - Explicit flow graph: strongest guarantees and easiest to test per node, but with only four slots it tends to produce the form-like feel the assignment forbids, and it handles out-of-order and multi-field utterances poorly unless every node exposes every setter.
  - Hybrid (recommended): one conversational agent, one tool set, server-owned state. The server recomputes the missing-field list after every tool call and injects it into the next turn. This gets the testability of a state machine (assert on the state store) with the naturalness of free conversation.
- Four slots and roughly four to six tools sits at or below the thresholds where Retell and OpenAI suggest adding structure, which supports a single agent rather than a node graph.
- A small amount of phase structure is still useful: "onboarding" versus "graduated" can be two states that differ in tool availability and prompt, which is the sandboxing idea applied at the coarsest useful grain.
- The Rasa pattern list is a ready-made checklist of conversational repair behaviors to implement and test, even if Rasa itself is not used.
- The Gmail slot is different in kind from the other three: its truth comes from an OAuth callback, not from anything the user says. The model should be able to request the connect flow and read its status, but never set it.

### Gaps
- No independent, quantitative head-to-head comparison of prompt-only versus flow-graph versus hybrid agents on completion rate or naturalness was found. The evidence is vendor argument and practitioner opinion.
- The Future AGI article on multi-agent voice systems redirected and could not be read.
- No Hacker News or X practitioner threads were retrieved; practitioner views here come from blogs.

## 2. Tool and function schema design for recording collected fields

### Takeaway
Treating state tracking as function calling is well supported by research, and the practical requirement is an explicit typed state object with defined update operators (add, overwrite, clear, carry forward) rather than re-inferring state from the transcript each turn.

### Cited Findings
- FnCTOD reframes dialogue state tracking as function calling, with slot-value pairs as function arguments and the model producing both function calls and conversational responses. Reported gains of 4.8% for GPT-3.5 and 14% for GPT-4 over prior prompting approaches; average joint goal accuracy on MultiWOZ of 61.31% (ChatGPT) and 62.59% (GPT-4). Dated May 30, 2024 (older source, pre-2025 models). — [FnCTOD, arXiv 2402.10466](https://arxiv.org/html/2402.10466)
- Four update operators per turn: add an empty slot, overwrite on correction, clear on negation, carry forward unchanged. "Carrying values forward is the stage teams forget to specify, and it is what makes a multi-turn conversation feel continuous." Page dated Sep 25, 2026 (vendor glossary). — [Fini: What is dialogue state tracking](https://www.usefini.com/glossary/what-is-dialogue-state-tracking-dst)
- Why transcript inference fails on corrections: "The conversation history contains the correction and the original value with equal weight, so the model has to re-resolve the conflict on every turn, and it will not resolve it the same way twice." — [Fini: What is dialogue state tracking](https://www.usefini.com/glossary/what-is-dialogue-state-tracking-dst)
- The tuning tension: "A tracker that holds values tightly avoids re-asking and quietly keeps stale ones alive; a tracker that clears aggressively stays fresh and interrogates the customer twice." — [Fini: What is dialogue state tracking](https://www.usefini.com/glossary/what-is-dialogue-state-tracking-dst)
- Error inheritance is a known dialogue-state-tracking failure: once a wrong slot value is extracted it can be carried forward repeatedly (search snippet; 2022 paper, older source). — [arXiv 2202.07156](https://arxiv.org/pdf/2202.07156)
- OpenAI's realtime prompting guidance on exact entity capture: "Email addresses must be captured exactly...ask them to repeat it character by character," and for numeric identifiers "read the value back digit by digit." — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
- OpenAI's guidance on state in long sessions: "Do not rely on the model to infer source priority from a raw transcript or large context dump. Use structure." — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
- Anthropic recommends structured outputs with a JSON schema to constrain classifier-style calls to parseable values the application can branch on. — [Anthropic: Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)

### Inferences
- A suggested minimal tool surface (design proposal, not taken from a source):
  - `update_profile(updates: [{field, value, evidence, certainty, is_correction}])` taking an array so one utterance such as "I'm Jon, call yourself Max, and I need help with my inbox" is recorded in a single call, in any order.
  - `defer_field(field, reason)` with reasons such as `declined`, `later`, `unclear`, so a refusal is recorded as a state rather than re-asked.
  - `start_gmail_connect()` that returns a link or triggers a UI affordance; connection status is written only by the OAuth callback.
  - `graduate(reason)` that the server validates against the minimum-viable rule and may reject with the list of what is still needed.
  - `end_or_pause(reason)` for "call me back later" and similar.
- Each stored field should carry value, status (`empty`, `provisional`, `confirmed`, `deferred`, `declined`), source channel, timestamp, ask count, and a short history of previous values. The history makes "actually call me Jon" an overwrite with an audit trail and makes contradictory answers detectable.
- Certainty is better modeled as a coarse enum the model picks (for example `stated_clearly`, `heard_uncertain`, `inferred`) than a numeric score, since model-reported numeric confidence is unverified. Voice-sourced names should default to provisional until read back once; text-sourced names can be confirmed immediately.
- `evidence` (the quoted user span) is cheap to require and gives the evaluator and the LLM judge something to verify against, which helps detect hallucinated slot values.
- Server-side validation should be the final authority: length limits, rejection of values that look like instructions, and rejection of a user name identical to an obvious refusal phrase. The tool result returned to the model should contain the full post-update state and the recomputed missing list, so the model never has to remember state itself.
- Writes should be idempotent and versioned so a retried tool call or a second tab cannot clobber newer data.

### Gaps
- No authoritative 2025-2026 source was found that prescribes a specific schema for confidence or correction flags in slot-recording tools. The schema above is a design inference.
- No source was found measuring whether model-reported confidence fields are calibrated for slot values.

## 3. Deciding what to ask next without sounding like a checklist

### Takeaway
The supported pattern is goal-based prompting with state injected as structure each turn, combined with explicit repair behaviors for tangents, skips, and corrections, and hard limits on re-asking. No source gives a formula for "naturalness"; most of this section is design inference built on those primitives.

### Cited Findings
- Rasa treats digression handling as first-class default behavior: `pattern_chitchat` manages off-topic interactions "without disrupting main conversation," `pattern_search` handles knowledge questions, `pattern_continue_interrupted` manages returning to an interrupted flow, and `pattern_skip_question` handles a user's intent to bypass a question. — [Rasa patterns reference](https://rasa.com/docs/reference/primitives/patterns/)
- OpenAI recommends structuring prompts into short labeled sections so "the model should find relevant instructions quickly," and gives a template separating current state, authoritative sources, and historical context. — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
- OpenAI's variety rule for voice: "Do not repeat the same sentence twice. Vary your responses so they don't sound robotic." The cookbook version lists "Reduce repetition: Add a Variety rule to reduce robotic phrasing." — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting); [OpenAI Realtime Prompting Guide cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)
- OpenAI's example escalation threshold: "2 failed tool attempts on the same task OR 3 consecutive no-match/no-input events." — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
- Vapi's idle-message hook defaults to a maximum of 3 triggers per call (`triggerMaxCount` range 1-10), which is a vendor default for how many times to nudge before giving up. — [Vapi idle messages docs](https://docs.vapi.ai/assistants/idle-messages)
- Progressive profiling guidance from onboarding UX: ask a question at the moment its answer changes something the user sees, keep it to one or two questions, and phrase conversationally (search snippet, UX vendor blogs). — [Kompassify progressive profiling guide](https://kompassify.com/blog/progressive-profiling-guide)

### Inferences
- Recommended turn loop: (1) opportunistically extract anything in the user's utterance into state, (2) answer or acknowledge what the user actually said, (3) only then, if something is still missing and the moment allows it, fold one request into the reply. Never ask for more than one missing item per turn.
- The injected context block should be regenerated server-side every turn and contain: known fields with status, missing fields ordered by priority, per-field ask counts, deferred fields with reasons, the current channel, and whether this is a resumed session. Instruct the model that this block outranks its memory of the transcript.
- Give the model a reason for each field rather than a script. For example, the agent name exists so the user has something to call it; the help topic determines what happens first after onboarding. Reasons let the model justify a request in context, which reads as conversation rather than form filling.
- Order by conversational fit rather than a fixed sequence. The help topic is often volunteered first and is a natural bridge to Gmail ("to help with that I would need to see your inbox").
- Re-ask budget: at most two asks per field, with the second phrased differently and offering an out. After that, mark the field deferred and move on. This matches the vendor defaults of two to three attempts.
- Offer defaults for low-stakes fields. If the user does not care about naming the agent, propose a name and let them accept or change it later.
- Steering back after a tangent should reference the tangent, not ignore it, and should be skipped entirely if the user seems irritated or has just declined something.

### Gaps
- No empirical study was found comparing checklist-style and goal-style prompting on user-perceived naturalness or completion rate for onboarding.
- The full conversation-flow section of OpenAI's Realtime Prompting Guide cookbook (including its state machine example) could not be extracted because the page content was dominated by embedded audio data.

## 4. Session persistence and resumption

### Takeaway
Outside Gemini Live, realtime voice platforms do not resume dropped sessions for you; the application must persist state and re-inject it. For an evaluator who will hang up mid-call, the key property is that every collected field is durably written at the moment it is captured, not at call end.

### Cited Findings
- Vapi does not support resuming a dropped call from where it left off; the recommended pattern is to save state via webhook and inject it into the next assistant configuration. Reported by an aggregator synthesizing vendor docs, dated 2026-07-19. — [Zylos Research: session resumption and continuity](https://zylos.ai/research/2026-07-19-realtime-voice-agent-session-resumption-continuity/)
- Gemini Live is described as the only platform with native resumption: a resumption handle valid for 2 hours after termination, and a `GoAway` message giving about 60 seconds of warning. OpenAI Realtime is described as having a 60-minute maximum session and no built-in resume as of mid-2026. — [Zylos Research: session resumption and continuity](https://zylos.ai/research/2026-07-19-realtime-voice-agent-session-resumption-continuity/)
- Dominant rehydration pattern: keep the last 1-2 turns verbatim, summarize everything older into a single system-role item, and store durable facts in an external memory layer rather than replaying raw transcripts for older sessions. — [Zylos Research: session resumption and continuity](https://zylos.ai/research/2026-07-19-realtime-voice-agent-session-resumption-continuity/)
- Re-greeting on resume is a known UX failure. Suggested mitigation is an explicit instruction along the lines of "you are continuing an existing call after a brief technical interruption; do not re-introduce yourself." The source flags this as its own inference rather than documented vendor practice. — [Zylos Research: session resumption and continuity](https://zylos.ai/research/2026-07-19-realtime-voice-agent-session-resumption-continuity/)
- A concrete instance of the re-greeting bug: a LiveKit agents-js issue dated August 25, 2026 reports the agent greeting the user again mid-conversation after a Google realtime session resumption, because chat context was restored as text only and audio content was dropped. — [livekit/agents-js issue 2346](https://github.com/livekit/agents-js/issues/2346)
- Reconnection mechanics: exponential backoff starting around 100ms and capped near 5s, keepalive pings every 15-30 seconds, and local buffering of microphone audio during an outage. Transcription events should be ordered by item ID chain, not arrival order. — [Zylos Research: session resumption and continuity](https://zylos.ai/research/2026-07-19-realtime-voice-agent-session-resumption-continuity/)
- LiveKit sessions close automatically by default when the linked participant disconnects for reasons `CLIENT_INITIATED`, `ROOM_DELETED`, or `USER_REJECTED`; this can be disabled with `close_on_disconnect`. — [LiveKit agent session docs](https://docs.livekit.io/agents/logic-structure/sessions/)
- The stored transcript should reflect what the user actually heard: "Sync the conversation context with the TTS playback position so the transcript reflects what was really played." — [WebRTC.ventures: interruption handling](https://webrtc.ventures/2026/09/voice-ai-interruption-handling-state-machines-vs-streaming/)
- Vapi exposes call-ended reasons including voicemail and `silence-timed-out`, which can be used to classify how a call ended (search snippet). — [Vapi call ended reasons docs](https://docs.vapi.ai/calls/call-ended-reason)
- Omnichannel platforms describe the target behavior as a single shared context layer keyed by one session identifier, so chat turns and a voice call appear as one continuous trajectory (search snippet, vendor marketing). — [Future AGI omnichannel glossary](https://futureagi.com/glossary/omnichannel/)
- Amazon Connect implements persistent chat through rehydration of prior transcripts so customers do not repeat themselves (search snippet). — [Amazon Connect chat persistence docs](https://docs.aws.amazon.com/connect/latest/adminguide/chat-persistence.html)
- LangGraph requires idempotent logic before an interrupt point because the node re-executes on resume (search snippet). — [LangGraph persistence docs](https://docs.langchain.com/oss/python/langgraph/persistence)

### Inferences
- What to persist, keyed by a user or onboarding ID rather than a call ID: the slot store with statuses and history, a unified message log tagged by channel, the last agent utterance with how much of it was actually played, the pending question if any, per-field ask counts, session end reason, timestamps, and a rolling summary.
- Write-through persistence: each tool call commits to the database before its result returns to the model. Then a hangup at any point loses at most the current utterance.
- Hangup mid-utterance: on the disconnect event, run a short post-call extraction pass over the final partial transcript to recover anything said but not yet recorded, mark those values provisional, and store the end reason.
- Resume greeting should branch on elapsed time and end reason. Within a minute or two after a drop: acknowledge the cut and continue the pending thread. Hours later: greet by name, state one thing already known, and offer the next step. Never re-ask a confirmed field. Provisional fields get one light confirmation.
- Voice to text switch: both channels read and write the same store and the same message log, and the channel is a parameter of response style only. The first text message after a call should reference the call.
- Duplicate tabs: optimistic concurrency with a version number on the state record, server-push of state changes to all connected clients, and a rule that only one live voice session may exist per user at a time.
- Page refresh: client holds only an ID; all state is rebuilt from the server.
- Gmail OAuth is a cross-channel event. If the user connects Gmail in the browser during a voice call, the callback should update state and notify the live agent so it can acknowledge it without being asked.

### Gaps
- No primary vendor documentation was read directly for Vapi, Gemini Live, or OpenAI Realtime resumption limits; those figures come from one aggregator and should be verified before being stated as fact.
- No source was found on handling duplicate concurrent sessions in two tabs for conversational agents, or on voice to text handoff UX specifically. The recommendations above are inference.
- No source was found on post-call extraction from partial final transcripts as a documented practice.

## 5. Voice-specific failure modes and handling

### Takeaway
Frameworks now ship primitives for most voice failure modes (semantic turn detection, adaptive interruption, false-interruption recovery, user-away timeouts, turn length limits), so the work is mostly configuration plus a defined policy per failure. Interruption handling should be a tested policy rather than a single on/off setting.

### Cited Findings
- LiveKit `user_away_timeout` defaults to 15.0 seconds of silence before the user is marked away; the documented pattern combines it with a `user_state_changed` listener to prompt the user and shut down after retries are exhausted. — [LiveKit agent session docs](https://docs.livekit.io/agents/logic-structure/sessions/)
- LiveKit turn detection modes: a turn detector model (recommended default, which "Predicts end of turn from both the meaning of speech and its acoustic properties, on top of VAD"), realtime model detection, VAD only, STT endpointing, and manual control for push-to-talk. — [LiveKit turns overview](https://docs.livekit.io/agents/build/turns/)
- LiveKit interruption options include `min_duration`, `min_words`, `false_interruption_timeout`, and `resume_false_interruption`; adaptive interruption mode can "distinguish between true interruptions and conversational backchanneling." — [LiveKit turns overview](https://docs.livekit.io/agents/build/turns/)
- LiveKit false interruption timeout defaults to 2.0 seconds; if no transcribed speech arrives in that window the agent can resume speaking (search snippet). — [LiveKit agent session docs](https://docs.livekit.io/agents/logic-structure/sessions/)
- LiveKit user turn limits (`max_words`, `max_duration`, both disabled by default) cap how long a user can hold the turn and call an `on_user_turn_exceeded` hook; described as useful for long-form callers and voicemail greetings. — [LiveKit turns overview](https://docs.livekit.io/agents/build/turns/)
- Vapi `customer.speech.timeout` hook: default 7.5 seconds, range 1-1000 seconds, default maximum 3 triggers, counter reset mode `never` or `onUserSpeech`. Example cascade of 10s, 20s, 30s with the last step ending the call. Idle messages are disabled during tool calls. — [Vapi idle messages docs](https://docs.vapi.ai/assistants/idle-messages)
- Vapi voicemail detection combines audio analysis with transcript analysis, and its recommended method has the LLM call a voicemail function when it recognizes a voicemail greeting (search snippet). — [Vapi voicemail detection docs](https://docs.vapi.ai/calls/voicemail-detection)
- OpenAI unclear-audio guidance: only respond to clear audio, and ask for clarification when audio is ambiguous, noisy, silent, or unintelligible. Changing the word "inaudible" to "unintelligible" in the instruction improved noisy input handling. — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting); [OpenAI Realtime Prompting Guide cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)
- Hamming's interruption runbook (May 20, 2026): "The policy should be per message type, not global," and "Do not test 'interruption works' as one scenario. Split false positives from false negatives." Core test cases include true correction, short backchannel, background noise, long pauses, and silence timeout recovery. — [Hamming interruption handling runbook](https://hamming.ai/resources/voice-agent-interruption-handling-runbook)
- Barge-in latency target: the detection-to-silence path "ideally needs to happen in roughly 100-300 ms." Backchannel words can be filtered by a simple word list. Echo detection compares detected speech timing against agent playback. — [WebRTC.ventures: interruption handling](https://webrtc.ventures/2026/09/voice-ai-interruption-handling-state-machines-vs-streaming/)
- Hamming's published targets (vendor benchmarks): time to first audio under 1.7s, word error rate under 10% for English, task completion above 85%. — [Hamming voice agent testing guide](https://hamming.ai/resources/voice-agent-testing-guide)

### Inferences
- Policy table for the named failure modes (design proposal):
  - Silence: one gentle check-in at roughly 8-10 seconds, a second offering text instead, then end gracefully with state saved and a resumable message in chat.
  - Background noise or talking to someone else: require a minimum word count before treating speech as a turn, and do not record slot values from low-certainty fragments.
  - Voicemail-like audio: detect, do not run onboarding against a recording, end and leave a text follow-up.
  - Constant interruption: shorten agent utterances to a sentence, stop re-starting the same sentence, and yield the floor.
  - "Call me back later": treat as a first-class outcome, record it, confirm what is already saved, and end warmly.
  - Rambling answers: apply a turn length limit, then summarize back the one or two things captured.
  - Mis-heard names: read back once, ask for spelling only on a miss, and offer typing the name in chat as the escape hatch.
  - Refuses to speak or wants text: switch channel immediately with state intact; never argue for voice.
- Names are the highest-risk slot in voice. Showing the captured name in the UI during the call, where the user can see and correct it, removes most of the read-back burden.
- Agent speech that was cut off should be stored truncated at the playback position, otherwise a resumed session may assume the user heard a question they did not.

### Gaps
- LiveKit endpointing delay defaults were not stated on the page read.
- No source was found with measured name-recognition error rates for current speech-to-text models, or a best practice specific to capturing personal names as opposed to emails and numeric identifiers.
- Voicemail detection matters mostly for outbound telephony; whether it applies depends on whether the take-home call is browser WebRTC or phone, which is unknown here.

## 6. Adversarial and off-script users

### Takeaway
Guidance from OWASP and Anthropic converges on defense in depth with the real controls placed outside the model: least privilege, deterministic validation, and nothing secret in the system prompt. Conversationally, the agent should decline briefly and move on rather than lecture.

### Cited Findings
- OWASP LLM01:2025 lists seven mitigations: constrain model behavior, define and validate expected output formats, implement input and output filtering, enforce least privilege, require human approval for high-risk actions, segregate and identify external content, and conduct adversarial testing. It also states: "it is unclear if there are fool-proof methods of prevention for prompt injection." — [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- OWASP added System Prompt Leakage (LLM07:2025) and advises that system prompts should not contain secrets or be relied on as a security control; authorization belongs in deterministic systems outside the model (search snippet, third-party summary of OWASP). — [Invicti summary of OWASP LLM Top 10 2025](https://www.invicti.com/blog/web-security/owasp-top-10-risks-llm-security-2025)
- Anthropic distinguishes direct injection and jailbreaks (the user is the adversary) from indirect injection (third-party content such as email bodies carries instructions). — [Anthropic: Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
- Anthropic's direct-injection mitigations: harmlessness screens using a lightweight model with structured output, input validation for known injection patterns, system prompts that "explicitly tell Claude how to refuse," and responding to repeat offenders with throttling or bans. — [Anthropic: Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
- Anthropic's indirect-injection mitigations, directly relevant once Gmail is connected: put untrusted content only in tool results, label its source, state in the system prompt that tool content is untrusted data, JSON-encode untrusted strings, do not put your own instructions in tool results, limit access to sensitive data and actions, screen tool outputs, and red-team the agent. — [Anthropic: Mitigate jailbreaks and prompt injections](https://platform.claude.com/docs/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)
- OpenAI describes guardrails as layered, including relevance classifiers, safety classifiers, PII filters, moderation, tool safeguards, and rules-based protections, noting a single guardrail is unlikely to be sufficient (search snippet). — [OpenAI: A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- OpenAI voice language guidance: "Do not infer language from accent alone. Only switch languages if the user explicitly asks." An older variant says to respond in the language the user is speaking. These differ by model version, so language policy must be set explicitly. — [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
- Rasa provides `pattern_cannot_handle` and `pattern_human_handoff` as default fallbacks for inputs the assistant cannot process. — [Rasa patterns reference](https://rasa.com/docs/reference/primitives/patterns/)

### Inferences
- Treat slot values as untrusted data. A user name of "ignore all previous instructions" should be stored and rendered as a quoted string in the context block, length-limited, and never interpolated into instruction text. This is the OWASP "segregate untrusted content" principle applied to the agent's own memory.
- The onboarding agent should have no tools that can act on Gmail. If it cannot send or read mail during onboarding, an injection during onboarding has nothing to exploit. Real task requests get an honest answer that this comes right after setup, and the request is captured as the help topic.
- Suggested conversational policies (design proposal):
  - Injection or prompt extraction attempts: decline in one light sentence, do not repeat or paraphrase the prompt, continue.
  - Abuse: stay calm, one boundary statement, continue; end the session after repeated abuse with state saved.
  - Joke or nonsense names: accept harmless ones without comment since it is the user's choice; reject only slurs or impersonation, and offer an alternative.
  - Refuses to give a name: mark declined, use neutral address, do not ask again this session.
  - Refuses Gmail: explain once what it enables and what is not done with it, then mark deferred and continue. Gmail refusal should not block graduation into a limited experience.
  - Contradictory answers: latest statement wins, with a brief confirmation when the field is already confirmed.
  - Unrelated questions: answer briefly if harmless, then return.
  - Minors or sensitive disclosures such as self-harm: step out of the onboarding goal, respond with care and appropriate resources, and do not steer back to data collection in that turn.
  - Non-English: respond in the user's language if the stack supports it, otherwise say so and offer text.
- A pre-screen classifier adds latency that matters in voice. For a take-home, prompt hardening plus deterministic validation of tool arguments plus least privilege is probably sufficient, with a lightweight screen on the text channel only.
- Do not claim the system prompt is secret or put anything in it that would be embarrassing if read aloud.

### Gaps
- No source specific to handling minors or sensitive disclosures in onboarding agents was found; the policy above is inference and should be checked against the product's own policies.
- No source was found on joke or nonsense names in slot filling.
- The OWASP LLM07 page itself was not read directly; the claim comes from a third-party summary.

## 7. Completion and graduation logic

### Takeaway
No source addresses "graduation" for conversational onboarding directly. The closest established idea is progressive profiling: collect the minimum up front and request the rest at the moment it becomes useful. The rule for this product has to be designed, and should be enforced in code rather than left to the model.

### Cited Findings
- Progressive profiling collects user data gradually across the journey rather than at signup, capturing essential information first and deferring nonessential fields (search snippet, identity and UX vendor blogs). — [Descope: Progressive profiling 101](https://www.descope.com/learn/post/progressive-profiling)
- Timing guidance: ask about use case in the first session where the answer can immediately change what the user sees; ask other questions when the user performs a relevant action; the answer should change something the user sees within seconds; one or two questions at most (search snippet). — [Kompassify progressive profiling guide](https://kompassify.com/blog/progressive-profiling-guide)
- Rasa's `pattern_skip_question` treats a user's wish to bypass a question as a standard, handled event rather than an error. — [Rasa patterns reference](https://rasa.com/docs/reference/primitives/patterns/)
- Tool availability can be changed as the conversation progresses, which is the mechanism for unlocking main-experience tools after graduation. — [Daily blog: Beyond the Context Window](https://www.daily.co/blog/beyond-the-context-window-why-your-voice-agent-needs-structure-with-pipecat-flows/)

### Inferences
- Classify each field by what it blocks:
  - Help topic: the only field that defines what the main experience does first. This is the natural graduation trigger.
  - Gmail: blocks only email-dependent tasks. Required at the moment the first such task is attempted, not before.
  - User name: nice to have; can default to neutral address.
  - Agent name: nice to have; can default to a suggested name.
- Proposed rule: graduation is allowed once a help topic exists, or the user explicitly asks to skip ahead. Remaining fields are marked deferred with a reason, and each has a defined later trigger. Gmail is requested just in time when a task needs it; names are requested once at a natural pause after the first useful result.
- The `graduate` tool should be validated server-side and return what is still outstanding, so the model can mention it once lightly and let the user proceed.
- "Gentle steering" should be bounded: at most one mention of an outstanding item per session after graduation, and none immediately after a refusal.
- A user who arrives already knowing what they want has supplied the most valuable field in their first utterance. Making them name the agent before helping would be the form-like failure the assignment warns about.

### Gaps
- No empirical data was found on how many onboarding fields can be deferred before activation or retention suffers in conversational products.
- No source was found on graduation or skip-ahead logic for voice onboarding specifically.

## 8. Evaluation and test harness

### Takeaway
Current practice combines simulated users, deterministic checks on final state, transcript constraints, and LLM rubric judges, run multiple times per scenario because results vary between runs. Simulated users are useful but are documented to be imperfect proxies for humans, so reading transcripts and a small amount of manual testing remain necessary.

### Cited Findings
- Anthropic's guidance for conversational agents (January 9, 2026): combine simulated users where "one model plays a user persona," state verification of actual outcomes, transcript constraints such as maximum turn counts, and LLM rubrics assessing "both task completion and interaction quality." — [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Grader tradeoffs: code-based graders are fast, cheap, and reproducible but brittle to valid variation; model-based graders are flexible but non-deterministic and need calibration; human graders are the gold standard but slow and expensive. — [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Start with "20-50 simple tasks drawn from real failures." Regression evals "should have a nearly 100% pass rate"; capability evals "start at a low pass rate." Build balanced sets that test both presence and absence of a behavior. "You won't know if your graders are working well unless you read the transcripts and grades from many trials." — [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- pass@k measures the chance of at least one success in k attempts; pass^k "measures the probability that all k trials succeed," which is the relevant metric for reliability. — [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- tau-bench evaluates by comparing database state at the end of a conversation with an annotated goal state; function-calling agents of the time succeeded on under 50% of tasks with pass^8 under 25% in retail. Published 2024 (older source). — [tau-bench, arXiv 2406.12045](https://arxiv.org/abs/2406.12045)
- Simulated users are unreliable proxies: agent success rates vary by up to 9 percentage points depending on which model plays the user; simulators underestimate agent performance on hard tasks and overestimate on moderate ones; and they introduce "conversational artifacts and surface different failure patterns than human users." — [Lost in Simulation, arXiv 2601.17087](https://arxiv.org/abs/2601.17087)
- In tau-bench airline, the user simulator behaved inconsistently with its instructions in 11 of 50 conversations, 22% (search snippet attributing this to a follow-up analysis). — [tau2-bench, arXiv 2506.07982](https://arxiv.org/pdf/2506.07982)
- A three-layer framework (question bank, random-walk multi-turn, goal-directed simulated users with five goal types and a ten-category failure taxonomy) found that single-response correctness does not predict multi-turn goal success (within-run Spearman correlation between -0.15 and 0.14). Reported cost of $0.17 per simulated run across 257 runs on a 108-scenario suite. — [arXiv 2608.09939](https://arxiv.org/abs/2608.09939)
- Hamming's guide (January 23, 2026) lists scenario, regression, load, compliance, and production monitoring test types; simulated callers vary accent, noise at signal-to-noise ratios of 20, 10, 5, and 0 dB, barge-in, overlapping speech, corrections, out-of-scope requests, and extended silence. It recommends starting from 50-100 representative conversations and claims 95-96% judge agreement with human evaluators (vendor claim, methodology undisclosed). — [Hamming voice agent testing guide](https://hamming.ai/resources/voice-agent-testing-guide)
- Vendor positioning: Hamming focuses on automated call simulation at volume and production-to-test feedback; Coval on CI-driven simulation with synthetic callers; Cekura on automated test generation and replay of production calls (search snippets from comparison articles written by competitors, treat as marketing). — [Future AGI comparison](https://futureagi.com/blog/voice-ai-simulation-cekura-hamming-bluejay-coval-2025/); [Coval: Hamming vs Cekura](https://www.coval.ai/blog/hamming-vs-cekura)
- Rasa offers dialogue understanding tests that check the commands generated for a given conversation, an example of testing the understanding layer separately from phrasing (search snippet). — [Rasa dialogue understanding tests](https://rasa.com/docs/reference/testing/dialogue-understanding-tests/)

### Inferences
- A credible lightweight harness for a take-home, buildable in about a day:
  - Run the agent's text path in-process so the same brain that serves voice can be tested without audio. This is only valid if voice and text share one agent core, which is itself an argument for that design.
  - Scenario files, roughly 25-40, each with a persona prompt, scripted events, and expected end state. Cover: cooperative, everything in one utterance, out of order, correction, skip-ahead, refuses name, refuses Gmail, joke name, injection, prompt extraction, abuse, tangent, real task request, contradiction, non-English, sensitive disclosure, rambling, silence, "call me back later."
  - Scripted non-conversational events injected by the harness rather than the simulated user: hangup after turn N, hangup mid-tool-call, reconnect after a delay, channel switch, duplicate session, OAuth callback arriving mid-conversation, OAuth denied.
  - Deterministic graders on the state store: correct values, no confirmed field re-asked after resume, ask count per field within budget, no more than one question per agent turn, Gmail status never set by the model, no system prompt text in output, turn count within limit.
  - One LLM judge per dimension with a short rubric: acknowledged the user before steering, did not sound like a form, handled refusal gracefully, resume greeting felt continuous.
  - Three to five trials per scenario, reporting pass^k rather than average pass rate.
  - A results table and a handful of annotated transcripts in the README, including failures found and fixed.
- Hangup tests are the highest-value item given the evaluator named them. The key assertion is simple: state before hangup equals state after reconnect, and the first agent turn after reconnect asks for nothing already known.
- Use a different model for the simulated user and the judge than for the agent where possible, and note the documented limits of simulated users in the write-up. A short list of manual voice test calls covering interruption, noise, and mid-sentence hangup complements the automated suite, since audio-level behavior is not exercised by a text harness.
- Commercial voice test platforms are likely excessive for a take-home, but naming them and explaining what the lightweight harness does and does not cover shows awareness of the production path.

### Gaps
- Pricing and free-tier availability for Hamming, Coval, and Cekura were not checked, so whether any is practical for a take-home is unknown.
- No independent validation of vendor-reported judge agreement rates was found.
- No open-source voice-level simulator (synthetic caller with audio, interruptions, and hangups) suitable for a solo project was identified in this research; Pipecat and LiveKit testing utilities were not investigated.
