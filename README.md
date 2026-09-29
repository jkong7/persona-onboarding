# Persona onboarding

A first conversation with a personal assistant, by text and by voice, in the browser.

The assistant learns four things, in whatever order they come up:

| What | How it is collected |
|---|---|
| A name for the assistant | Text, before the call |
| A name for the person | On the call, or by text |
| Something they want help with | On the call, or by text |
| A connected Gmail | A button on screen, offered when the task involves email |

It rings the person in the browser to collect everything except its own name. If they decline, hang up, go quiet or would rather type, the same conversation carries on by text with nothing lost.

Design reasoning and tradeoffs: [DESIGN.md](DESIGN.md). Research behind it: [reports/](reports/).

## Run it

Needs Node 26, pnpm and `cloudflared` (`brew install cloudflared`).

```sh
pnpm install
pnpm -C client install
cp .env.example .env     # then fill in the keys below
pnpm build:client
pnpm dev:voice
```

Open http://localhost:8787 in Chrome and allow the microphone when the call is answered.

`pnpm dev:voice` starts the server and opens two tunnels, because the voice service has to reach the server over the public internet. Wait for the line `tunnel: calls now go through ...` before answering a call, which can take a minute. If a tunnel stops answering, calls move to the other one and the dead one is replaced. Text works without the tunnel (`pnpm start`).

### Keys

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Claude |
| `DEEPGRAM_API_KEY` | Speech to text, turn taking and text to speech. Needs the Member role so the server can mint short-lived browser tokens. |
| `CALL_TOKEN_SECRET` | Any long random string. Signs the per-call token. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. A Google OAuth web client. Without them the app offers the sample inbox only and says so. |
| `TOKEN_ENCRYPTION_KEY` | Needed with the Google client. 64 hex characters (`openssl rand -hex 32`). Encrypts stored Google tokens. |

### Real Gmail

The Google app runs in Testing mode with one scope, `gmail.readonly`. Two things follow:

- Your Google address has to be on the app's test-user list before you connect.
- Google shows an "unverified app" screen first. The assistant warns about it before you click.

In the Google Cloud console, the OAuth client needs `http://localhost:8787` (or the hosted address) under Authorised JavaScript origins. No redirect address is needed, because the connection happens in a popup and the call stays live behind it.

The sample inbox needs none of this. It is twelve made-up emails, including one that tries to give the assistant instructions.

## Hosted copy

Live at https://persona-onboarding-792894733520.us-central1.run.app, on Google Cloud Run.

- One instance runs all the time, so a call never waits on a cold start.
- The conversation record is SQLite inside the container. Litestream copies every change to a private storage bucket within a second and restores it when the container starts, so restarts and deploys lose nothing.
- Keys live in Secret Manager. `deploy/gcp-secrets.sh <project>` copies them there from `.env` without printing them.
- `deploy/gcp-deploy.sh` builds the image and rolls it out. Settings and keys carry over from the previous revision.

A hosted copy needs no tunnel, because the voice service reaches the server at its own address.

## Things to try

| Try | What should happen |
|---|---|
| Ignore the name question and open with a task | It takes the task, keeps "Persona" and moves on |
| Decline the call | It carries on by text. It offers a call once more at most. |
| Hang up mid-sentence | A text arrives saying what it caught and offering to call back or carry on |
| Call back | No second greeting. It picks up where things stopped. |
| Hang up twice | It stops ringing you unless you ask |
| Say everything in one breath | It records all of it and asks for nothing twice |
| Interrupt it | It stops talking and answers what you said |
| Say "hold on" and go quiet | It waits, checks in once, then offers text, then ends the call and texts you |
| Give a name it mishears | Correct it aloud, spell it, or type it during the call |
| Refuse to give a name or connect anything | It accepts the refusal once and helps anyway |
| Ask what it can see in your email | A plain answer before anything else |
| Tell it to ignore its instructions, or that Gmail is connected | It declines in a sentence and carries on |
| Close the tab mid-call and reopen it | Same thread, same state |
| "Just let me in" | It lets you in. Missing details are picked up later, in context. |

"Reviewer tools" in the top right shows the saved record, the event log and a Start over button.

## How it works

```
Browser                 Deepgram                  Server
mic / speaker  <---->   hearing, turn taking,
                        speaking         ---->    reply endpoint --> Claude
thread, buttons <------ live updates ----------   record (SQLite), event log
Google popup    ------- code ----------------->   token exchange --> Google
```

- One agent and one record serve both channels. The record belongs to the server, so a dropped call or a closed tab loses nothing.
- The model proposes and the server decides. Tools write through the server's rules: how often a thing may be asked, when a call may be offered, when onboarding is over, and that only Google can mark Gmail as connected.
- Everything the model says on a call passes through a filter before it is spoken: whole sentences only, a cap on length with the rest sent to the thread, one question per turn, nothing after the question, no filler after a lookup, no internal wording, no dashes.
- A name heard on a call is provisional. The person hears it used once, and it settles when they carry on without correcting it. A name that does not look like a name is never used. The assistant asks again.

### Models

| Channel | Model | Why |
|---|---|---|
| Text | Claude Opus 5.5 | Best wording. A few seconds is normal in a text thread. |
| Calls | Claude Haiku 4.5 | Steady reply gap of about 1.6 s at any time of day. `AGENT_VOICE_MODEL=claude-sonnet-5` talks better but took 3 to 6 s per reply on a weekday afternoon. |

`AGENT_MODEL` and `AGENT_VOICE_MODEL` change them.

## Tests

```sh
pnpm test            # server unit and route tests
pnpm -C client test  # client tests
pnpm eval            # simulated people against the text agent, judged
pnpm eval:voice      # live calls with synthesized speech through the real voice service
```

`pnpm eval:voice` needs `pnpm dev:voice` running. It speaks scripted lines into real calls, interrupts, goes quiet and hangs up, then checks the saved record and what was said.

Results from the last full runs are in [DESIGN.md](DESIGN.md#7-testing).

## Known limits

- Words cut off by a hangup mid-sentence are lost. The voice service only reports speech once a turn is complete.
- The tunnel in local development is a free quick tunnel and can take a minute to come up. A hosted deployment has no tunnel.
- Tested in Chrome. Safari and Firefox are untested.
- The assistant drafts and never sends. Nothing in this build can send email, spend money or contact anyone.
