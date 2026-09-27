# Persona onboarding: design plan

Status: draft for review. No code written yet.
Research behind this plan: `reports/Persona onboarding design research.md`

## 1. What the reviewer is grading

Taken from the assignment wording, in order of weight.

| Priority | Their words | What it means for the build |
|---|---|---|
| 1 | "I will be stress testing this", "call hangups" | State survives any interruption. Nothing already said is ever re-asked. |
| 2 | "It shouldn't feel like a form" | No fixed step order. The agent reacts, picks up information given out of order, and asks at most one thing per turn. |
| 3 | "show how we can provide value to the user", "graduate" | Onboarding ends when the user has seen value, which can happen before every field is filled. |
| 4 | "gently steer them without being overbearing" | A limit on how often each field is asked for, and a way to defer it. |
| 5 | "attempt to do a phone call" | The agent calls the user. Declining is allowed and never argued with. |

## 2. Product thesis

Persona's site says "No prompts, no settings, no onboarding." So the onboarding has to feel like already using the product.

The four fields are not a sequence. Each is classified by what it blocks.

| Field | What it blocks | Default if missing | Collected where |
|---|---|---|---|
| Help topic | The first task in the main experience | None. This is the entry point. | Call, text, or the user's first message |
| Gmail | Only tasks that need email | Sample inbox | Click on screen, prompted by the agent |
| User name | Nothing | Neutral address | Call first, text as fallback |
| Agent name | Nothing | "Persona" | Text, before the call |

Two consequences follow.

- Graduation and hangup survival are the same design decision. Both need the system to know, at any moment and outside any live session, what it has and what each missing piece blocks.
- A user who opens with a real task has already given the most valuable field. Making them name the agent first would be the form-like failure the assignment warns about.

## 3. The experience

### Happy path

1. **Thread opens.** The page looks like a message thread. The agent sends two short texts in Persona's voice and asks what the user wants to call it, offering "Persona" as the default.
2. **Agent calls.** Once the name is settled or skipped, the agent says it will call, and an incoming call screen appears with accept and decline.
3. **On the call.** The agent uses its new name, asks the user's name, and reads it back once. It asks what is on the user's plate. Captured values appear on screen as they are recorded.
4. **Gmail ask.** The agent explains the request using the user's own goal, says what will and will not happen, and warns that Google will show a caution screen because this is a demo app. A Connect Gmail button appears. The user clicks it, the popup opens, and the call stays live.
5. **First value.** On connection the agent reads a handful of recent threads and says one specific, goal-relevant thing about them.
6. **Graduation.** The agent says it is now in the user's messages and ends the call. The thread continues in main mode, starting on the user's task.

### Branches that must work

| User does | System does |
|---|---|
| Opens with a task instead of answering | Records the help topic, offers graduation, defers both names |
| Declines the call | Continues in text with the same state. Offers a call once more later, then stops. |
| Hangs up mid-call | Saves state, then texts a follow-up that names what was captured and offers a callback or to continue in text |
| Hangs up twice | Stops offering calls unprompted and stays in text |
| Refreshes or closes the tab | Reloads into the same thread at the same point |
| Types during the call | The typed text goes into the live call and the agent responds by voice |
| Closes the Google popup | Agent notes it lightly, offers the sample inbox, moves on |
| Denies access | Agent accepts it once, marks Gmail declined, continues |
| Account not on the allowlist | Agent explains the demo limit and switches to the sample inbox |
| Says "call me back later" | Treated as a valid outcome. Agent confirms what is saved and ends warmly. |
| Goes silent | One check-in, then an offer to switch to text, then a graceful end with state saved |
| Gives a joke name | Accepted without comment unless it is a slur or impersonation |
| Tries prompt injection | Declined in one light sentence. The value is stored as plain data. |
| Corrects an earlier answer | Latest statement wins, with a short confirmation |

### The main experience after graduation

Graduation needs a real destination, so the demo includes a minimal main mode.

- The agent can list and read threads, from real Gmail or the sample inbox.
- It can draft a reply, shown as a card that waits for the user's yes. Nothing is ever sent. This mirrors Persona's approval rule.
- Fields still missing are collected in context. Gmail is requested when a task needs it. Names are asked at a natural pause after the first useful result.

## 4. Architecture

```
Browser                          Deepgram                      Server (Node)
+---------------------+         +------------------+          +---------------------------+
| Mic / speaker       |<-socket>| Speech to text   |          |                           |
|                     |         | Turn detection   |--turn--->| Brain endpoint            |
|                     |         | Text to speech   |<-words---|   Agent core              |---> Claude
+---------------------+         +------------------+          |   Tool rules              |
| Thread UI           |<------------- SSE --------------------| State push                |
| Text input          |-------------- HTTP ------------------>| Text turn endpoint        |
| Connect Gmail button|                                       |                           |
|   Google popup  ----+-------------- code ------------------>| OAuth exchange            |---> Google
+---------------------+                                       | Onboarding record (SQLite)|
                                                              | Inbox provider            |---> Gmail or sample
                                                              +---------------------------+
```

Deepgram handles hearing, speaking and turn-taking. Every turn it calls the brain endpoint on the server, which is where Claude, the tools and the record live. The text channel calls the same agent core directly, so voice and text share one prompt, one tool set and one record.

### Onboarding record

One record per onboarding, keyed to an onboarding ID and not to a call.

Each field stores:

- value
- status: empty, provisional, confirmed, deferred, declined
- source channel
- ask count
- history of prior values

An append-only event log stores every message, tool call, call start, call end with its reason, and OAuth event. Agent speech is stored cut off at the point the user actually heard.

### Agent core

One module builds the instructions and the tool set for both channels. It takes the record, the channel, and the resume context. After every tool call the server recomputes a "known / missing / what each blocks" block and injects it into the next turn.

### Tools

| Tool | Purpose | Server rule |
|---|---|---|
| `update_profile` | Record one or more fields from a single utterance | Validates length and content. Voice names start provisional until read back. |
| `defer_field` | Record a refusal or "later" | Stops further asks for that field this session |
| `record_ask` | Note that the reply asks for a field | Counts asks. Refuses a third ask and refuses fields already known. |
| `offer_gmail_connect` | Show the Connect Gmail button | Never sets Gmail status |
| `use_sample_inbox` | Switch to the sample inbox when the user asks for it | Can never replace or imitate a real account |
| `place_call` | Ring the user from the text thread | Refused after two declines or two unplanned hangups, unless the user asked for the call |
| `graduate` | Move to main mode | Allowed once a help topic exists or the user asks to skip. Returns what is still outstanding. |
| `end_call` | End or pause the call | Records the reason |

A real Gmail connection is written only by the OAuth callback. The model cannot claim a connection that did not happen. The one thing it can do is switch the user to the sample inbox, which is labelled as sample everywhere.

### Settings found by testing

| Setting | Choice | Why |
|---|---|---|
| Claude's thinking | Left on, at low effort | With thinking off, Opus 5 wrote tool calls as plain text, so nothing was saved |
| Shape of a turn | One reply plus its actions in a single request. A second request happens only when the agent said nothing first or an action was rejected. | Stops the agent speaking twice or reporting on its own actions, and halves the wait |
| Tool list | Fixed for the length of a turn | Opus 5.5 rejects a request whose tools changed midway |
| Prompt caching | The stable prompt is cached on its own | The per-turn state block changes every turn and would otherwise defeat the cache |
| User text in the prompt | Wrapped and escaped | A user cannot forge a server event such as "Gmail connected" |

### Voice transport

- Audio runs between the browser and Deepgram's Voice Agent service, started with a short-lived token minted by the server. The real key never reaches the browser.
- Deepgram is configured with a custom language model that points at the server's brain endpoint. The endpoint speaks the OpenAI-compatible streaming format Deepgram expects.
- The call settings carry a signed, short-lived call token in the endpoint headers, so the brain endpoint knows which record and which call it is serving and rejects anything else.
- Tools run inside the brain endpoint, on the server. If the tab dies mid-turn, the write still commits.
- Deepgram has to reach the brain endpoint over the public internet. Local development uses a tunnel, and a hosted demo uses its own URL.

Turn-taking settings used:

| Setting | Use |
|---|---|
| End-of-turn threshold | How sure Deepgram must be that the user has finished before the agent replies |
| Eager end-of-turn threshold | Lets Claude start on a likely finished turn, which cuts waiting |
| End-of-turn timeout | Ends a turn after a long pause even when unsure |
| Key terms | Boosts recognition of the agent's chosen name and product words |
| User started speaking event | Stops playback at once when the user cuts in |
| Playback position | Stored so the record holds what the user heard |
| Injected messages | Typed text and server events enter a live call |

### Text transport

- Text turns go to the server and run through the same agent core as the call.
- During a live call, typed text is sent into the call as a user message.

### Models

| Channel | Model | Why |
|---|---|---|
| Text thread | Claude Opus 5.5, low effort | Best wording in testing. A wait of 2 to 3 seconds is normal in a text thread. |
| Calls | Claude Sonnet 5, low effort | About twice as fast to first words, which is what makes a call feel responsive |

Both use the same prompt, tools and record.

Measured time to first words, median over eight turns:

| Model | Median | Note |
|---|---|---|
| Opus 5.5 | 2.6 s | Best wording |
| Opus 5 | 1.9 s | |
| Sonnet 5 | 1.3 s | Slightly chattier |
| Haiku 4.5 | 0.9 s | Narrated its own tool use aloud. Ruled out. |

### Hangup handling

| Event | Detected by |
|---|---|
| User presses hang up | Client call |
| Tab closed or refreshed | `pagehide` beacon, and the brain endpoint going quiet |
| Network drop | Socket close on the client, and the brain endpoint going quiet |
| Silence timeout | Server timer |
| Agent ends call | `end_call` tool |

All five lead to the same saved state. After an unplanned end, the server:

1. Closes the call record with its reason.
2. Runs a short extraction pass over the last partial transcript and stores anything new as provisional.
3. Sends a follow-up text whose wording depends on what is known and how the call ended.

On the next call the agent skips the greeting and continues from the first missing item.

### Steering limits

- At most one request per agent turn.
- Answer or acknowledge the user first, then steer.
- At most two asks per field. The second is worded differently and offers a way out. After that the field is deferred.
- Questions about privacy or the Google warning count as on-topic and get a full answer.

### Name accuracy

- Read the name back once.
- Ask for spelling only if the read-back is rejected.
- Show the captured name on screen the moment it is recorded.
- Accept a typed correction at any time.

## 5. Gmail

| Decision | Choice | Reason |
|---|---|---|
| App status | External, Testing | Verification for read scopes takes weeks and a paid assessment |
| Scope | `gmail.readonly` only, requested alone | Gives one allow-or-cancel screen. No cheaper read scope exists. |
| Flow | Popup, authorization code, exchanged on the server | A redirect would unload the page and drop the call |
| Trigger | User clicks a button | Browsers block popups opened without a click |
| Tokens | Encrypted at rest, with a disconnect control that revokes | Google policy |
| Fallback | Sample inbox on the same code path, labelled on screen and in speech | Covers the allowlist, the warning screen, and plain reluctance |

The reviewer's Google address has to be on the test-user list before they try. The README will say so.

## 6. Tradeoffs considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Conversation control | One agent plus a server-owned record | Flow graph | Four fields do not need a graph, and a graph produces a form-like feel |
| Voice pipeline | Separate hearing, thinking and speaking steps | Speech-to-speech | One brain for voice and text, an inspectable transcript, and mature tool calling |
| Voice vendor | Deepgram Voice Agent with Claude as the brain | ElevenLabs, OpenAI Realtime, Gemini Live, LiveKit | Free credit covers the whole project, and it accepts our own model endpoint. ElevenLabs has more expressive voices but costs more. OpenAI Realtime stays the fallback if calls feel slow. |
| Where Claude runs | The server's own brain endpoint | Vendor-hosted Claude | The server owns the prompt, tools and state, and the test harness exercises the same code the call uses |
| Tool execution | Server, inside the brain endpoint | Browser client tools | Survives a closed tab |
| Graduation | Server rule | Model judgment | Cannot be talked into or out of it |
| Storage | SQLite | In-memory, Postgres | Durable across restarts with no setup |
| App shape | One Node server plus a React client | Next.js | Long-lived sockets and streams are simpler in a plain server |

### Known cost of the voice choice

- Response time is the risk. Each turn passes through speech-to-text, the brain endpoint, Claude, and text-to-speech. It will be measured on the first test calls.
- Calls and text run different Claude models, so wording can differ slightly between them.
- The automated harness covers the brain. Audio behaviour such as interruptions and noise is still covered by manual calls.
- If calls feel slow after tuning, the voice layer is swapped for OpenAI Realtime. The record, tools and text channel do not change.

## 7. Testing

### Automated

- 25 to 40 scenario files, each with a persona, scripted events and an expected end state.
- A simulated user plays the persona. The harness injects hangups, reconnects, channel switches, duplicate sessions and OAuth outcomes.
- Deterministic checks on the record:
  - state before hangup equals state after reconnect
  - the first turn after reconnect asks for nothing already known
  - ask counts stay within budget
  - at most one question per agent turn
  - Gmail status is never set by the model
  - no system prompt text appears in output
- Each scenario runs three to five times. The reported number is the share of scenarios that pass every run.

### Manual voice checklist

- Interrupting the agent mid-sentence
- "Uh huh" while the agent is talking
- Long pause while thinking
- Background noise
- Hangup mid-sentence, mid-tool-call and during the Google popup
- Typing during the call

### Limit

Simulated users are an imperfect proxy for real ones, so the write-up reports failures alongside passes.

## 8. To verify during the build

| Item | How |
|---|---|
| Deepgram reaching the brain endpoint with the signed call token | A spike through the tunnel |
| Tunnel latency in local development | Measure with and without the tunnel |
| Popup keeps the call and microphone alive | Manual test in Chrome and Safari |
| Which warning screen a listed test user sees | One run with a second Google account |
| Response latency | Measure on the final prompt and tools |
| Rate limits under repeated calls | Check the account tier |

## 9. Build order

1. Onboarding record, event log and tool rules, with unit tests
2. Agent core and text channel
3. Scenario harness
4. Thread UI with state push and resume
5. Voice call through the brain endpoint, hangup handling and follow-up texts
6. Sample inbox, first value, main mode
7. Real Gmail connection
8. Manual voice pass, tuning, README

Steps 1 to 4 deliver a fully working text onboarding before any voice work starts.

## 10. Open decisions

Settled:

| Decision | Outcome |
|---|---|
| Anthropic API key | In place |
| Deepgram API key | In place, Member role so the server can mint short-lived browser tokens |
| Claude models | Opus 5.5 for text, Sonnet 5 for calls |
| Voice vendor | Deepgram Voice Agent |

Still open:

| Decision | Needed for |
|---|---|
| Tunnel tool for local voice testing | Step 5 |
| Google Cloud OAuth client and test-user list | Step 7 |
| First-hand notes on Persona's real onboarding | Tone and flow details in steps 2 and 5 |
| How the reviewer will access it: hosted link or local run | Step 8 |
| Deadline | Scope of step 6 |
