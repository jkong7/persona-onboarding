# Persona onboarding: design plan

Status: built. Sections 4, 5 and 7 describe what was built and measured. How to run it: `README.md`.
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

1. **Thread opens.** The page looks like a message thread. Two short texts appear at once, hand-written so there is no wait, and ask what the user wants to call the agent, offering "Persona" as the default.
2. **Agent calls.** Once the name is settled or skipped, the agent says it will call, and an incoming call screen appears with accept and decline.
3. **On the call.** The agent uses its new name and asks the user's name. It greets them by that name, which is their chance to correct it, and asks what is on their plate in the same breath.
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
| `update_profile` | Record one or more fields from a single utterance | Validates length and content. A name first heard on a call is always provisional, whatever the model claims. |
| `defer_field` | Record a refusal or "later" | Stops further asks for that field this session |
| `record_ask` | Note that the reply asks for a field | Counts asks. Refuses a third ask and refuses fields already known. |
| `offer_gmail_connect` | Show the Connect Gmail button | Never sets Gmail status |
| `use_sample_inbox` | Switch to the sample inbox when the user asks for it | Can never replace or imitate a real account |
| `place_call` | Ring the user from the text thread | Refused after two declines or two unplanned hangups, unless the user asked for the call |
| `graduate` | Move to main mode | Allowed once a help topic exists or the user asks to skip. Returns what is still outstanding. |
| `end_call` | End or pause the call | Refused until a goodbye has been spoken. The call ends only after the page confirms the goodbye was played. |
| `send_text` | Put a draft, list or figures in the thread during a call | Only works during a call |
| `wait_quietly` | Stay on the line and say nothing | Only works during a call |
| `search_inbox`, `read_email` | Read the connected or sample inbox | Read only. Email content is marked as written by other people, never instructions. |

A real Gmail connection is written only by the OAuth callback. The model cannot claim a connection that did not happen. The one thing it can do is switch the user to the sample inbox, which is labelled as sample everywhere.

### Settings found by testing

| Setting | Choice | Why |
|---|---|---|
| Claude's thinking | Left on, at low effort | With thinking off, Opus 5 wrote tool calls as plain text, so nothing was saved |
| Shape of a turn | One reply plus its actions in a single request. A second request happens only when the agent said nothing first or an action was rejected. | Stops the agent speaking twice or reporting on its own actions, and halves the wait |
| Tool list | Fixed for the length of a turn | Opus 5.5 rejects a request whose tools changed midway |
| Prompt caching | The stable prompt is cached on its own | The per-turn state block changes every turn and would otherwise defeat the cache |
| User text in the prompt | Wrapped and escaped | A user cannot forge a server event such as "Gmail connected" |
| Thinking setting on calls | Left out of the request | Sending `thinking: disabled` made some requests take 2.5 s longer to start, depending on their content. Sending `adaptive` took 3 s. Leaving the setting out was about 1 s every time across six replayed requests. |
| Strict tool schemas on calls | Off | Strict checking added 0.2 s to every spoken reply in the probe and about 1 s in live calls. The server validates every tool input itself, so nothing is lost. |
| What reaches the speaker | Whole sentences, sent the moment each is complete | The voice service speaks at sentence ends. A reply that ended without trailing space sat unspoken until the whole turn finished, which cost 2 s on any turn with a lookup. |
| Spoken length | Two sentences at once, four to five in a turn, the rest moved to the thread with one spoken pointer | The model's own sense of "short" is unreliable. A filter is not. |
| Questions | One per spoken turn, and the turn ends at the question | Stops the agent asking and then carrying on talking |
| Filler and internal wording | Dropped before speech: "Got it" after a lookup, narration of its own actions, words such as onboarding, names spelled letter by letter | Seen in live calls with the fast model |
| Leaked markup | Tags and reasoning blocks are removed from every reply | Opus 5.5 sometimes wrapped a text in tags or wrote a line of reasoning in one |
| Inbox preview | The newest twelve emails are placed in the prompt each turn once an inbox is connected | Most inbox questions are answered with no tool call, which removes a round trip |
| Hints | Goodbye, call back, text instead and hold on are spotted in the person's words and passed to the model as a hint | The fast model missed a plain "bye" about one call in three |
| First text and first spoken line | Hand-written, chosen at random from a few | No wait on page load or call connect, and no chance of a clumsy first impression |

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
| Text thread | Claude Opus 5.5, low effort | Best wording in testing. A wait of a few seconds is normal in a text thread. |
| Calls | Claude Haiku 4.5, falling back to Sonnet 5 if it is ever retired | Holds a steady reply gap at any time of day. Its weaker judgment is covered by the server-side guards below. |

Both use the same tools and record. Calls have their own shorter prompt, written for speech.

Time to the model's first word on a call turn, same prompt and tools:

| Model | First word | Note |
|---|---|---|
| Sonnet 5 | about 0.95 s at night, 1.5 to 3 s on a weekday afternoon | Better judgment, fewer slips |
| Haiku 4.5 | 0.5 to 0.9 s at any hour | Needs the speech filter, hints and guards to stay tidy |

Measured over the same 16 live calls on the hosted copy, from the end of the person's speech to the first audio of the reply:

| Call model | Median | What the transcripts showed |
|---|---|---|
| Sonnet 5, at night | 1.9 to 2.3 s | Flagged the scam email unprompted, left gaps in drafts, asked again when a name was misheard |
| Sonnet 5, weekday afternoon | 2.8 s, with single replies of 5 to 6 s | Same judgment, but the wait is long enough to feel broken |
| Haiku 4.5, weekday afternoon | 1.6 s, worst 3.0 s | Before the guards: invented interview times, promised reminders, switched on the sample inbox unasked. Each of those now has a server-side rule. |
| Sonnet 5, thinking on | 4.3 s | Too slow for a call |

Haiku 4.5 is the default. The first plan was Sonnet 5, and it is the better talker, but its start time doubled during the day and a reviewer will most likely call during the day. A steady 1.6 s with guarded judgment beats a better reply that arrives after 3 to 6 s of silence. `AGENT_VOICE_MODEL=claude-sonnet-5` switches back.

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

The first build read every name back and asked "did I get that right?". In live calls that cost a turn on every call and the model spelled names out letter by letter, which felt like a form. It was replaced with this:

- The agent greets the person by the name it heard and carries straight on. Hearing it is their chance to correct it.
- The name stays provisional until they have heard it and replied without objecting. The server settles it, not the model.
- A name that does not look like a name (a single letter, a lowercase word, digits) is never used. The agent asks them to say it again, spell it or type it.
- A correction, spoken, spelled or typed, replaces the name at once. Typed names are always trusted.

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

Four layers, from cheapest to most real.

| Layer | Command | What it covers |
|---|---|---|
| Unit and route tests | `pnpm test`, `pnpm -C client test` | Record rules, tools, the speech filter, hints, name handling, call routes, reconnects, Gmail token handling, the page's state logic |
| Simulated people, text | `pnpm eval` | 20 personas played by a model against the real agent, with injected hangups, declines, reconnects and Gmail outcomes. Deterministic checks on the record, plus a judge model reading the transcript against a rubric. |
| Live calls | `pnpm eval:voice` | 16 scripted calls through the real voice service. Speech is synthesized and streamed into the call as microphone audio, so recognition, turn taking, interruption and playback are all real. |
| Browser | by hand | First visit, decline, reload, second view of the same thread, phone width |

### The 16 live calls

Straightforward call. Interrupting twice. Hanging up while the agent speaks, then calling back. Hanging up mid-sentence. "Hold on" then silence. Total silence. A name the recogniser mangles, fixed by typing. A name fixed by spelling it aloud. Everything in one breath. Refusing a name and any inbox. Asking to switch to text. A noisy line. Off-topic questions and three attempts to hijack the agent. Changing name and goal partway. Refusing setup altogether. "I'm driving, call me back."

Checks on every call: no failed turns, no fallback lines, spoken replies of five sentences or fewer, one question at most and nothing after it, no names spelled letter by letter, no dashes, and the saved record at the end.

### Results

Live calls against the hosted copy, Haiku 4.5 on calls (2026-09-28, weekday afternoon):

| Measure | Result |
|---|---|
| Calls completed | 16 of 16 |
| Checks failed | 0 |
| End of speech to first reply audio, median across calls | 1.6 s |
| Slowest single reply | 3.0 s |
| First spoken line after the call connects | 0.4 to 0.9 s |

Every call ended with the right values saved. Report: `eval-results/voice-2026-09-28T20-21-14-318Z/report.md`. Six further fixes were deployed after this run (see the last rows of the table below) and are covered by unit tests only, because the API credit ran out before they could be run live.

Simulated people, text suite (2026-09-28), one run of each of the 20 scenarios:

| Run | Passed | Notes |
|---|---|---|
| Full suite, first run | 14 of 20 | Sonnet 5 on calls |
| The 6 failures, after fixes | 5 of 6 | |
| Full suite, final call model | 12 of 20 | Haiku 4.5 on calls. Three failures were real and are fixed; the rerun could not happen because the API credit ran out. |

What the six failures were:

| Scenario | Cause | Outcome |
|---|---|---|
| cooperative, hangup_mid_call, typed_name_during_call | My own checks misfired: list hyphens inside a draft counted as dashes, a draft logged after the spoken line counted as missing, a reworded help topic counted as lost | Checks corrected |
| hangup_mid_call | A draft sent during a call appeared in the thread before the line that announced it | Fixed: drafts are logged after the spoken line |
| gmail_popup_closed | A second closed Google window went unmentioned | Fixed in the instructions |
| prompt_injection, another_language | The judge misread a correct transcript | Passed on rerun |
| cooperative | The judge objects that a sample inbox is marked as connected | Still fails. This is the design: the sample inbox is a real, labelled fallback. |

The full suite has not been rerun since the last fixes. Reports are in `eval-results/`.

### What testing changed

Each of these was found by running calls, not by reading code.

| Found | Fix |
|---|---|
| Every name was read back with a question, and spelled out letter by letter | Greet by name and carry on. The server settles the name once they have heard it and not objected. |
| Replies after an inbox lookup were not spoken until the whole turn finished | Whole sentences are sent as soon as they are complete, each followed by a space |
| "Got it. The rest is in the thread." with nothing of substance spoken | Filler and narration after a lookup are dropped, and one sentence of substance is always spoken |
| The agent asked a question and kept talking | The spoken turn ends at the question |
| "Let me move you into the main experience" | Internal wording never reaches the speaker |
| A plain "bye" was missed about one call in three on the fast model | Goodbye, call back, text instead and hold on are passed to the model as hints |
| "b" accepted as a name | A name that does not look like one is never used. The agent asks again. |
| A text began with a stray tag, or a line of the model's reasoning | Tags and reasoning blocks are removed from every reply |
| The agent offered real Gmail when no Google client was configured | A separate set of instructions offers only the sample inbox |
| A hangup mid-answer used up one of the two allowed asks | An ask the person never got to answer is given back |
| A draft written on a call contained invented interview times | Drafts leave a bracketed gap for anything the person has not said |
| The local tunnel died mid-run | Two tunnels run at once and calls move to whichever answers |
| The agent kept steering back to the inbox while the person talked about something else | Sentences about connecting are dropped on those turns, and the agent gets one chance to ask about what was said instead |
| "There's a button on your screen" when no button had been shown | The button is shown whenever the agent mentions it |
| Three texts sent quickly got three separate replies, one every five seconds | A burst of texts gets one reply that has read all of them |
| "No calls, I'm on a train" typed while the phone was ringing, and it kept ringing | A typed refusal stops the ring and counts as a decline |
| The agent called a silent caller by its own name | Its own name is removed when used to address the person |
| A helpful conversation ran for nine turns and never left onboarding | Onboarding ends by itself after three replies on the person's task |
| The sample inbox was switched on after an unrelated question | It is switched on only when the person's words are not a question or a refusal |
| A request for the sample inbox in Spanish was refused by that same rule | The rule no longer depends on English words |
| The agent pushed for the real account after the person chose the sample inbox | Sentences about connecting are dropped once the sample inbox is chosen |
| A text-only conversation never asked the person's name | After three messages without a name, the agent is prompted to ask once |
| With the model unreachable, the agent asked the person to repeat themselves forever | The second failure says plainly that the fault is on its side and that everything is saved |

### Limits

- Simulated people and scripted calls are a proxy. They do not mumble, laugh, or talk over the agent the way a person does.
- Words cut off by a hangup mid-sentence are lost, because the voice service only reports speech once a turn is complete. The follow-up text asks again.
- Real Gmail was connected once against Google on the hosted copy (2026-09-28): a closed Google window was handled, the second attempt connected, and the agent searched and read the real inbox and drafted a reply. Disconnect has only been tested against a stand-in for Google's token service.

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
| Claude models | Opus 5.5 for text. Calls: see Models above. |
| Tunnel tool for local voice testing | cloudflared quick tunnel, started and watched by `pnpm dev:voice` |
| Voice vendor | Deepgram Voice Agent |

Still open:

| Decision | Needed for |
|---|---|
| First-hand notes on Persona's real onboarding | Tone and flow details in steps 2 and 5 |
| Deadline | Scope of step 6 |
