# Realtime voice agent stack options (2026) for a browser-based simulated phone call

Research date: 2026-09-27. All prices and limits below were read from the cited pages on that date unless another date is given. Vendor pages were read through an automated fetch-and-summarize tool, so every number should be spot-checked on the primary page before it is quoted in a final deliverable. Items marked UNVERIFIED could not be confirmed on a primary source.

## 1. Speech-to-speech realtime APIs: OpenAI Realtime, Gemini Live, Anthropic/Claude

### Takeaway
OpenAI Realtime (gpt-realtime-2.1 / 2.1-mini, WebRTC in the browser, 60-minute sessions) and Gemini Live (gemini-3.8-live, WebSocket only, 15-minute audio sessions, roughly 4-5x cheaper audio) are the two first-party speech-to-speech options; Anthropic has no developer voice/realtime API, so Claude can only be used as the text LLM inside a cascaded pipeline.

### Cited Findings

OpenAI Realtime API
- Current models listed on the pricing page: gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-2, gpt-realtime-1.5, gpt-realtime-mini, gpt-realtime. — [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- gpt-realtime-2.1: audio input $32.00 / 1M tokens, cached audio input $0.40, audio output $64.00; text input $4.00, cached $0.40, text output $24.00. — [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- gpt-realtime-2.1-mini: audio input $10.00 / 1M, cached $0.30, audio output $20.00; text input $0.60, cached $0.06, text output $2.40. — [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- Realtime transcription models are priced per minute: gpt-realtime-whisper $0.017/min, gpt-live-transcribe $0.017/min, gpt-4o-transcribe $0.006/min, gpt-4o-mini-transcribe $0.003/min, gpt-transcribe $0.0045/min. — [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- gpt-realtime-2.1 and 2.1-mini were announced July 6, 2026; stated improvements are alphanumeric recognition, silence/noise handling, better interruption behavior, configurable reasoning effort and tool use; OpenAI also states it "reduced p95 latency by at least 25% across Realtime voice models through improved caching". — [OpenAI Developer Community announcement](https://community.openai.com/t/new-realtime-models-on-the-api-gpt-realtime-2-1-and-gpt-realtime-2-1-mini/1385896)
- Developer-reported failure modes in the same thread: gpt-realtime-2.1-mini "frequently narrates its own behaviour" (unsolicited lines such as "Let me continue with the call"), needs substantially more prompt engineering than the older realtime-mini, and one developer reported 2.1-mini stopped triggering function tools with an unchanged configuration. — [OpenAI Developer Community announcement](https://community.openai.com/t/new-realtime-models-on-the-api-gpt-realtime-2-1-and-gpt-realtime-2-1-mini/1385896)
- Maximum Realtime session duration is 60 minutes. — [OpenAI Realtime conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- Browser transport: WebRTC is recommended over WebSocket for browser apps for "more consistent performance"; audio flows over media tracks and events over a data channel named "oai-events". Two auth patterns: (a) unified interface where the browser posts its SDP offer to your server, which forwards it to OpenAI with the standard API key; (b) ephemeral token minted by your server and used directly by the browser. — [OpenAI Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- Client secret lifetime: `expires_after` defaults to 600 seconds and is configurable between 10 and 7200 seconds. — [OpenAI API reference: client secrets](https://platform.openai.com/docs/api-reference/realtime-sessions/create-realtime-client-secret) (read via search summary; the same summary also mentions a one-minute token lifetime from an older community thread, so the exact TTL is UNVERIFIED) — [OpenAI community thread on ephemeral key TTL](https://community.openai.com/t/question-about-ephemeral-key-ttl-in-realtime-api/1114627)
- Interruption handling differs by transport: over WebRTC the server manages the output buffer and truncates unplayed audio automatically on `input_audio_buffer.speech_started`; over WebSocket the client must stop playback and send `conversation.item.truncate` with the item ID and the audio cutoff in milliseconds. — [OpenAI Realtime conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- Function calling flow: tools configured on the session or response; the model emits a `function_call` item with name, JSON arguments and `call_id`; the app adds a `function_call_output` item with the matching `call_id` and sends `response.create`. — [OpenAI Realtime conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- Text and audio can be sent in the same session (`input_text` content items alongside audio). — [OpenAI Realtime conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- Measured cost, 4,000 production sessions on gpt-realtime-mini (published June 11, 2026): 1-minute session $0.066, 3-minute $0.189, 5-minute $0.408; typical assistant $0.05-$0.08/min; audio output is about 80% of cost; a 14-minute session without context pruning reached $2.05 ($0.146/min) because history is resubmitted every turn; the author states gpt-realtime-2 costs "roughly 3x more" for audio tokens. — [HackerNoon: Realtime API pricing, 4,000 measured sessions](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- Token-rate conflict: one guide states a minute of input audio is about 600 tokens and a minute of generated speech about 1,200 tokens (about $0.019/min heard and $0.077/min spoken on gpt-realtime-2.1) — [Layer3 Labs pricing guide](https://www.layer3labs.io/guides/openai-realtime-api-pricing); the HackerNoon article states 100 tokens per second for both directions — [HackerNoon](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions). These conflict; neither was confirmed on an OpenAI primary page.
- A third-party overview puts OpenAI Realtime at about $0.30/min and describes it as the "cleanest developer experience in the category" at the price of vendor lock-in. — [Reactify Solutions, June 7, 2026](https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026)

Google Gemini Live API
- Models and prices: gemini-3.8-live and gemini-3.8-live-extended-thinking at text input $0.75 / 1M, text output $4.50, audio input $3.00 / 1M (or $0.005/min), audio output $12.00 / 1M (or $0.018/min); gemini-3.1-flash-live-preview at the same prices; gemini-2.5-flash-native-audio-preview-12-2025 at text $0.50 / $2.00 and audio $3.00 / $12.00. A free tier is listed for all of them. — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Session limits: audio-only sessions limited to 15 minutes, audio+video to 2 minutes (without compression); the WebSocket connection lifetime is "around 10 minutes"; context window compression (sliding window) extends sessions; session resumption handles are valid for 2 hours after the last session termination; the server sends a GoAway message with `timeLeft` before disconnecting. — [Gemini Live session management](https://ai.google.dev/gemini-api/docs/live-session)
- Context window is 128k tokens; audio input is raw 16-bit PCM 16 kHz, output 24 kHz. — [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- Transport and auth: the browser connects directly by WebSocket; ephemeral tokens are minted by your backend, work only on the v1beta API, default to `expireTime` 30 minutes and `newSessionExpireTime` 1 minute, support a `uses` count, and can be locked to a config via `liveConnectConstraints`. The documentation does not mention WebRTC. — [Gemini ephemeral tokens](https://ai.google.dev/gemini-api/docs/ephemeral-tokens)
- Turn-taking: automatic VAD with `startOfSpeechSensitivity` / `endOfSpeechSensitivity`, configurable silence duration and prefix padding; on interruption the server sends an `interrupted` message and cancels pending generation. — [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- Tool calling: gemini-3.8-live supports async function calling (NON_BLOCKING default); gemini-3.1-flash-live-preview is described as legacy with sequential function calling. Input and output audio transcription can both be enabled. Affective dialog and proactive audio require v1beta. — [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- Known issue: with ephemeral token plus the constrained WebSocket endpoint on gemini-3.1-flash-live-preview, the configured `prebuiltVoiceConfig.voiceName` is reported as never applied. — [google-gemini/cookbook issue #1333](https://github.com/google-gemini/cookbook/issues/1333)

Anthropic / Claude
- Current Claude API models "support text and image input, text output"; no audio input/output modality is listed. Lineup and base prices: Claude Haiku 4.5 (`claude-haiku-4-5`, "Fastest", $1 / $5 per MTok), Claude Sonnet 5 (`claude-sonnet-5`, "Fast", $2 / $10), Claude Opus 5.5 ($4 / $20), Claude Fable 5.1 ($10 / $50). Haiku 4.5 retirement is listed as "not sooner than October 15, 2026". — [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- Claude voice mode (updated July 23, 2026 to allow Opus, Sonnet and Haiku) is a consumer app feature; the coverage mentions no developer voice API. — [TechCrunch, July 23, 2026](https://techcrunch.com/2026/07/23/anthropic-updates-claude-voice-mode-with-more-capable-models/)
- Claude models are available as the LLM inside third-party voice orchestrators: ElevenLabs lists Opus 4.8, Opus 4.7, Sonnet 5, Sonnet 4.6, Sonnet 4.5 and Haiku 4.5 — [ElevenLabs LLM docs](https://elevenlabs.io/docs/eleven-agents/customization/llm); Deepgram Voice Agent lists Anthropic as a think provider — [Deepgram voice agent configuration](https://developers.deepgram.com/docs/configure-voice-agent); Retell prices "Claude 5 Sonnet" at $0.064/min — [Retell pricing](https://www.retellai.com/pricing).

### Inferences
- For a browser demo, OpenAI Realtime over WebRTC removes the most client work: echo cancellation, jitter handling and barge-in truncation are handled by the browser WebRTC stack and the server. Gemini Live requires the app to capture PCM, play back audio and flush the playback queue on `interrupted`, which is more code and more places for barge-in to feel wrong.
- Gemini Live's roughly 10-minute connection lifetime means a reconnect path (session resumption handle) is mandatory even for ordinary calls; with OpenAI's 60-minute limit a short onboarding call never hits the cap.
- The reported 2.1-mini regressions (self-narration, missed tool calls) make the full gpt-realtime-2.1 the safer choice where tool-call reliability is graded, despite roughly 3x audio cost. At demo scale the cost difference is tens of dollars.
- Because Haiku 4.5 may be retired as soon as mid-October 2026, a cascaded design using Claude should pin `claude-sonnet-5` or confirm the Haiku successor before the demo date.

### Gaps
- No primary-source latency numbers (time to first audio) were found for gpt-realtime-2.1 or gemini-3.8-live. The OpenAI launch post for gpt-realtime (benchmarks such as ComplexFuncBench) returned HTTP 403 and could not be read.
- No independent, current head-to-head on tool-calling reliability during voice between gpt-realtime-2.1 and gemini-3.8-live was found.
- Whether the voiceName bug affects gemini-3.8-live is unknown; the issue was filed against gemini-3.1-flash-live-preview.
- OpenAI ephemeral token exact TTL is unverified (600 s default for `expires_after` versus an older one-minute claim).
- Gemini free tier rate limits for Live sessions were not retrieved.

## 2. Orchestration platforms

### Takeaway
Every platform examined has a browser path; they split into managed platforms (ElevenLabs Agents, Vapi, Retell, Deepgram Voice Agent, Ultravox, Hume, Bland) that reach a first call fastest but keep turn-taking behind a few knobs, and open frameworks (LiveKit Agents, Pipecat) that expose full control of endpointing, interruption and context repair at the cost of running an agent process.

### Cited Findings

ElevenLabs Agents (ElevenAgents, formerly Conversational AI)
- Price: $0.080 per call minute on all plans, burst $0.160/min, text messages $0.003 each; free plan includes 15 minutes and 4 concurrent calls, Starter 75 minutes, Creator 275 minutes, Pro 1,238 minutes. "LLM usage is billed separately on top, based on the model you choose." STT and TTS are included. — [ElevenAgents pricing](https://elevenlabs.io/pricing/agents)
- Browser SDK: React/JS SDK uses WebRTC for voice and WebSocket for text-only mode; auth is a server-minted conversation token (WebRTC) or signed URL (WebSocket); callbacks include onConnect, onDisconnect, onMessage, onError, onModeChange (speaking/listening), onStatusChange, onAudioAlignment (character-level timing); `sendUserMessage()` injects typed text, `sendContextualUpdate()` injects non-reply context, `sendUserActivity()` pauses agent speech about 2 seconds while the user types; `textOnly: true` runs a chat-only session; client tools run in the browser. — [ElevenLabs React SDK docs](https://elevenlabs.io/docs/agents-platform/libraries/react)
- Turn-taking controls: turn eagerness (Eager / Normal / Patient), turn timeout 1-30 seconds, soft timeout filler 0.5-8.0 seconds (disabled by default), interruptions toggle, max conversation duration default 600 seconds (range 60-7,200). No dedicated spelling or entity-capture feature is documented on that page. — [ElevenLabs conversation flow docs](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)
- Native LLM list includes Claude Opus 4.8/4.7, Sonnet 5/4.6/4.5, Haiku 4.5, plus OpenAI and Gemini models. — [ElevenLabs LLM docs](https://elevenlabs.io/docs/eleven-agents/customization/llm)
- Custom LLM: any OpenAI-compatible Chat Completions or Responses endpoint returning SSE; must support OpenAI-format function calling to use system tools (end_call, skip_turn, etc.); "buffer words" are recommended for slow LLMs. — [ElevenLabs custom LLM docs](https://elevenlabs.io/docs/agents-platform/customization/llm/custom-llm)

Vapi
- Price: $0.05/min hosting fee plus provider costs at cost (examples listed: Deepgram transcription $0.0095-$0.0099/min, OpenAI models $0.0077-$0.0452/min, ElevenLabs voice $0.0146-$0.0238/min); $5 free credits; 4 concurrent calls on the $0 tier. — [Vapi pricing](https://vapi.ai/pricing)
- Third-party estimate: $0.05-$0.13/min with bundled providers, $0.23-$0.33/min effective with bring-your-own-key. — [Particula, May 14, 2026](https://particula.tech/blog/vapi-vs-retell-vs-livekit-vs-pipecat-voice-agent-platform)
- Web SDK: `@vapi-ai/web`, public key auth, events call-start, call-end, speech-start, speech-end, message (transcripts and function calls), error; methods start, stop, on. — [Vapi Web SDK docs](https://docs.vapi.ai/sdk/web)

Retell AI
- Price is component-based: voice infrastructure $0.055/min; LLM add-on e.g. Claude 5 Sonnet $0.064/min, Gemini 3.5 Flash $0.048/min, GPT 5.5 $0.16/min; TTS $0.015/min (platform/Cartesia/OpenAI voices) or $0.040/min (ElevenLabs); $10 free credits; first 20 concurrency free. — [Retell pricing](https://www.retellai.com/pricing)
- Conflict: third-party comparisons describe Retell as "flat ~$0.07/min" all-in — [Particula](https://particula.tech/blog/vapi-vs-retell-vs-livekit-vs-pipecat-voice-agent-platform); Retell's own page adds LLM and TTS on top of $0.055, which puts a Claude-backed call near $0.13/min — [Retell pricing](https://www.retellai.com/pricing).
- Web calls: `retell-client-js-sdk`; status lifecycle connecting / live / ended; events onStatus, onTranscript, onNodeTransition, onAudio, onEnd, onError; server webhooks call_started, call_ended, call_analyzed. — [Retell web call docs](https://docs.retellai.com/deploy/web-call)

Bland
- Price: all-inclusive per-minute by plan, Start $0.14/min ($0/month), Build $0.12/min ($299/month), Scale $0.11/min ($499/month); $0.015 minimum per call attempt. Figures come from a third-party summary of bland.ai/pricing dated August 2026. — [pxlpeak Bland pricing guide](https://pxlpeak.com/blog/ai-tools/bland-ai-pricing)

LiveKit Agents
- LiveKit Cloud Build (free) plan: 1,000 agent session minutes, 5,000 WebRTC minutes, $2.50 inference credits (about 50 minutes of model usage), 5 concurrent agent sessions, 1 deployment, no credit card; agent sessions $0.01/min beyond the allotment. LiveKit Inference examples: GPT Realtime $0.0676/min, STT $0.0025-$0.0095/min. — [LiveKit pricing](https://livekit.com/pricing)
- Turn detection options: turn detector model (recommended), realtime-model built-in detection (OpenAI Realtime, Gemini Live), VAD only, STT endpointing (AssemblyAI, Deepgram Flux), manual control via `interrupt()`, `clear_user_turn()`, `commit_user_turn()`. — [LiveKit turns docs](https://docs.livekit.io/agents/logic/turns/)
- Tools are plain decorated Python functions; native MCP tools and adaptive interruption handling arrived in the 1.5.x line; barge-in cancels both LLM generation and TTS playback. — [Reactify Solutions](https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026)
- Session state, reconnection and barge-in "come from the RTC layer instead of being retrofitted". — [Fora Soft comparison](https://www.forasoft.com/blog/article/pipecat-vs-livekit-agents)

Pipecat (Daily)
- Open-source Python framework with a composable pipeline; self-hosted or Pipecat Cloud. — [Particula](https://particula.tech/blog/vapi-vs-retell-vs-livekit-vs-pipecat-voice-agent-platform)
- Client SDKs for JavaScript, React, React Native, iOS, Android and C++ implementing the open RTVI standard; they manage connection, devices, audio rendering, session state, transcription and bot events, and custom messaging. — [Pipecat client SDK docs](https://docs.pipecat.ai/client/introduction)
- Practitioner note (September 23, 2026): Pipecat uses ElevenLabs word-level timestamps for context repair so the history records exactly what was spoken before an interruption; LiveKit uses the same timestamps to sync captions. Recommendation: choose Pipecat when interruption behavior is a product differentiator, LiveKit when transport complexity dominates. The author explicitly did not measure latency. — [Vadim's blog](https://vadim.blog/livekit-pipecat-elevenlabs-voice-agent-seams/)

Deepgram Voice Agent API
- Price: Standard $0.075/min; BYO TTS $0.065/min; BYO LLM $0.059/min; BYO LLM + TTS $0.050/min; Advanced $0.163/min. Flux English STT $0.0065/min (promotional), Nova-3 $0.0048/min (promotional), Aura-2 TTS $0.030 per 1k characters. $200 free credit, no card required. — [Deepgram pricing](https://deepgram.com/pricing)
- Configuration: think providers OpenAI, Google, Anthropic, Groq, AWS Bedrock; listen models Flux (`flux-general-en`, `flux-general-multi`) and Nova-3 with keyterms; speak providers Deepgram Aura-2, ElevenLabs, Cartesia, OpenAI, AWS Polly; functions can execute client-side or server-side, and `defer_until_eot: true` defers irreversible operations; events referenced include EndOfTurn, EagerEndOfTurn, FunctionCallRequest. A Browser Agent SDK exists. — [Deepgram voice agent configuration](https://developers.deepgram.com/docs/configure-voice-agent); [Deepgram Voice Agent overview](https://developers.deepgram.com/docs/voice-agent)

Cartesia
- Products: Sonic (TTS), Ink (STT), Line (voice agent platform); plans Free, Pro $4/mo, Startup $39/mo, Scale $239/mo; Sonic 3 about $35 per 1M characters; Ink-Whisper $0.13/hour. All from third-party summaries. — [eesel: Cartesia Sonic 3 pricing](https://www.eesel.ai/blog/cartesia-sonic-3-pricing)

Hume EVI
- EVI 3 overage $0.06 / $0.05 / $0.04 per minute on Pro / Scale / Business, EVI 4 mini metered at half rate (third-party). — [aipedia Hume pricing guide](https://www.aipedia.wiki/guides/hume-ai-pricing-for-emotion-aware-voice-apps/)
- EVI supports external and custom language models (Claude, GPT, Gemini), billed additionally. — [Hume custom language model docs](https://dev.hume.ai/docs/speech-to-speech-evi/guides/custom-language-model)

Ultravox
- Price: $0.05/min pay-as-you-go after 30 free minutes; up to 5 concurrent calls. — [Ultravox pricing](https://www.ultravox.ai/pricing)
- Fully hosted realtime voice platform with tools, RAG, call stages, SDKs, 26 languages. — [Ultravox docs overview](https://docs.ultravox.ai/overview)

Cross-platform guidance
- "Vapi and Retell sell you time, LiveKit and Pipecat sell you ceiling." Under 10K minutes/month, managed platforms are recommended; keep prompts, tools and flows in your own codebase to limit lock-in. — [Particula](https://particula.tech/blog/vapi-vs-retell-vs-livekit-vs-pipecat-voice-agent-platform)

### Inferences
- For this project (browser only, shared text channel, tool calls, graded on feel), the shortlist is: ElevenLabs Agents (fastest path with Claude as LLM, built-in text-only mode and `sendUserMessage` for the shared chat channel), OpenAI Realtime direct (best latency, one vendor), and LiveKit Agents (most control over turn-taking and false-interruption recovery, free tier covers the demo).
- Bland, Retell and Vapi are phone-first; their value (telephony, compliance, no-code flows) is mostly unused in a browser-only take-home, and their dashboards hide logic an evaluator may want to see in code.
- Lock-in ranking, lowest to highest: Pipecat and LiveKit (open source, swap any provider) < Deepgram Voice Agent and ElevenLabs with custom LLM (your LLM and tools stay portable) < OpenAI Realtime / Gemini Live (model, voice and turn-taking are one vendor) < Vapi, Retell, Bland when configured in a dashboard.
- Setup time estimates are not published by vendors; the ordering managed platform < direct S2S API < framework is an inference from the amount of code each requires.

### Gaps
- Bland browser/web-call SDK availability was not confirmed; only pricing was found, and from a secondary source.
- Ultravox model version, WebRTC transport, client event names and text injection were not on the pages retrieved.
- Hume and Cartesia prices come from secondary sources; their web SDK details and turn-taking controls were not retrieved.
- Pipecat RTVI event names, transports list and reconnect behavior were not on the page retrieved.
- Vapi: whether typed text can be injected mid-call, and its underlying transport, were not on the page retrieved.
- ElevenLabs plan monthly prices (Starter, Creator, Pro) and the per-model LLM rates were not retrieved.

## 3. Speech-to-speech versus cascaded pipelines

### Takeaway
Sources agree that speech-to-speech wins on latency and expressiveness while cascaded wins on control, debuggability, mature tool calling and an inspectable transcript; most 2026 production agents are still cascaded, with S2S favored for short conversations with a shallow tool surface, which describes this onboarding call.

### Cited Findings
- "Cascade still wins on control, transparency, and compliance, while speech-to-speech still wins on latency and natural expressiveness"; with S2S "you can't easily inspect what the model 'heard'". — [Deepgram: S2S vs cascade](https://deepgram.com/learn/speech-to-speech-vs-cascade-voice-agent-architecture) (vendor with a cascaded product)
- "Most 2026 production voice agents still run cascaded, while S2S is growing fast for short conversational use cases where latency dominates and the tool surface is shallow"; pick cascaded for per-stage debugging, vendor flexibility, mature tool calling, strict eval coverage. — [Future AGI: cascaded vs S2S 2026](https://futureagi.com/blog/cascaded-voice-ai-vs-speech-to-speech-2026/)
- Cascaded flattens tone, hesitation and emphasis into text before the LLM sees it. — [AssemblyAI: S2S for voice agents](https://www.assemblyai.com/blog/speech-to-speech-for-voice-agents) (vendor)
- Coval (January 28, 2026) cites S2S response times of 200-300 ms versus 2000 ms for cascaded, and projects 25-30% enterprise S2S adoption by end of 2026 (a prediction, not a measurement). — [Coval](https://www.coval.ai/blog/speech-to-speech-vs-cascaded-voice-ai-which-architecture-should-you-deploy/)
- Conflicting latency picture: a June 2026 overview gives a cascaded budget of STT first partial 150-250 ms, turn detection about 220 ms, LLM first token 200-300 ms, TTS first audio 40-90 ms, and an S2S end-to-end range of 0.78-2.98 s across providers; design target is 300 ms time to first audible response. — [Reactify Solutions](https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026); contradicts [Coval](https://www.coval.ai/blog/speech-to-speech-vs-cascaded-voice-ai-which-architecture-should-you-deploy/)
- Latency target: under 800 ms total turn latency, about 300 ms to feel conversational; budget STT finalization 100-300 ms, LLM TTFT 200-600 ms, tools 0-500 ms+, TTS first audio 100-300 ms. — [Particula](https://particula.tech/blog/vapi-vs-retell-vs-livekit-vs-pipecat-voice-agent-platform)
- Cost: cascaded range $0.0095-$0.17/min versus OpenAI Realtime about $0.30/min. — [Reactify Solutions](https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026); measured gpt-realtime-mini typical $0.05-$0.08/min. — [HackerNoon](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- In the OpenAI Realtime cost breakdown, input transcription appears as a separate Whisper line item, i.e. the user transcript comes from a separate ASR pass rather than from the speech model itself. — [HackerNoon](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- Tool calls in full-duplex speech models are an active research topic (September 2026 arXiv paper on a frontend-backend architecture). — [arXiv 2609.19334](https://arxiv.org/pdf/2609.19334)

### Inferences
- Published latency comparisons are inconsistent enough (S2S quoted anywhere from 0.2 s to 3 s) that the only trustworthy number is one measured on the builder's own network with the final prompt and tools.
- For name capture, cascaded gives a single authoritative transcript that the LLM acted on. In S2S, the displayed transcript and what the model understood can differ because the transcript is produced by a separate ASR pass, so a tool call argument, not the transcript, should be treated as the recorded value and read back to the user.
- A cascaded pipeline is the only way to have Claude drive the conversation, and it lets the voice and text channels share literally the same LLM message history.
- The task's tool surface (three fields) is shallow, so S2S tool-calling weakness is less of a risk than in complex workflows; the larger risk is the mini model's reported missed tool calls.

### Gaps
- No independent 2026 benchmark with stated methodology comparing S2S and cascaded on the same task was found; most sources are vendor blogs with a stake in one architecture.
- No quantitative tool-call success rates during voice were found for either architecture.
- Hacker News and Reddit practitioner threads were searched for but not surfaced by the search tool; practitioner views here come from individual blogs.

## 4. Turn detection and endpointing

### Takeaway
State of the art has moved from fixed-silence VAD to audio-native semantic end-of-turn models (LiveKit turn detector v1, Pipecat Smart Turn v3.2, OpenAI semantic_vad, STT-integrated detectors such as Deepgram Flux and AssemblyAI), and LiveKit additionally ships backchannel-aware adaptive interruption handling with automatic resume after false interruptions.

### Cited Findings
- OpenAI `server_vad` parameters: `threshold`, `prefix_padding_ms`, `silence_duration_ms`, `create_response`, `interrupt_response`; it is the default. `semantic_vad` has `eagerness` (low / medium / high / auto, auto equals medium) and makes the model "less likely to interrupt the user during a speech-to-speech conversation"; low eagerness waits longer. — [OpenAI Realtime VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad)
- Gemini Live: automatic VAD with start and end sensitivity (LOW / MEDIUM / HIGH), configurable silence duration and prefix padding; proactive audio lets the model decline to respond to irrelevant input. — [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- LiveKit turn detector: two audio-based versions, v1 (served on LiveKit Inference, free for LiveKit Cloud deployments) and v1-mini (local CPU, under 500 MB RAM, free everywhere) with automatic fallback from v1 to v1-mini; 14 languages; requires VAD with minimum 0.25 s silence; default endpointing delays min 0.3 s and max 2.5 s (versus 0.5 s / 3.0 s standard); tunable `unlikely_threshold`. The older text-based detector is deprecated. — [LiveKit turn detector docs](https://docs.livekit.io/agents/logic/turns/turn-detector/)
- LiveKit adaptive interruption handling distinguishes "true interruptions and conversational backchanneling" from audio; `false_interruption_timeout` and `resume_false_interruption` resume agent speech after a false interruption; `min_duration` and `min_words` gate what counts as an interruption; events `user_interruption_detected` and `agent_false_interruption` are emitted. — [LiveKit turns docs](https://docs.livekit.io/agents/logic/turns/)
- Pipecat Smart Turn v3.2: Whisper Tiny encoder plus linear classifier, about 8M parameters, 8 MB int8 CPU build and 32 MB fp32 GPU build; "runs in as little as 10ms on some CPUs, and under 100ms on most cloud instances" (about 65 ms on Pipecat Cloud); 23 languages; BSD 2-Clause; runs after Silero VAD detects silence, on the whole user turn; maximum input 8 seconds of 16 kHz mono audio. — [pipecat-ai/smart-turn](https://github.com/pipecat-ai/smart-turn)
- Smart Turn can also be used inside LiveKit via a community package. — [smart-turn-livekit on PyPI](https://pypi.org/project/smart-turn-livekit/0.4.0/)
- ElevenLabs Agents: turn eagerness Eager / Normal / Patient, turn timeout 1-30 s, soft-timeout filler. — [ElevenLabs conversation flow docs](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)
- Deepgram Flux exposes EndOfTurn and EagerEndOfTurn events from the STT model itself. — [Deepgram voice agent configuration](https://developers.deepgram.com/docs/configure-voice-agent)
- AssemblyAI (August 25, 2026) reports STT-integrated endpointing around 300 ms with modes min_latency / balanced / max_accuracy (min turn silence 128-512 ms, max 640-2560 ms), and argues "turn detection isn't really a latency problem" but a rhythm and consistency problem. The same article describes LiveKit's detector as text-based. — [AssemblyAI turn detection](https://www.assemblyai.com/blog/turn-detection-endpointing-voice-agent); contradicted by [LiveKit turn detector docs](https://docs.livekit.io/agents/logic/turns/turn-detector/), which state the current model is audio-based and the text model deprecated.
- The critical seam is interruption during TTS: the system must stop playback and record what was actually spoken, otherwise "the agent apologises for something nobody heard, or repeats a sentence it already delivered." — [Vadim's blog, September 23, 2026](https://vadim.blog/livekit-pipecat-elevenlabs-voice-agent-seams/)

### Inferences
- For a call that asks for a name and a free-form use case, users will pause mid-thought; semantic or audio-native endpointing (OpenAI `semantic_vad` with low or medium eagerness, LiveKit turn detector, ElevenLabs Patient mode for the use-case question) should reduce premature cut-ins compared with a fixed silence threshold.
- Backchannel handling ("uh huh", "yeah") is explicitly addressed only by LiveKit among the sources read; on OpenAI Realtime and Gemini Live, a backchannel is likely to register as barge-in and stop the agent unless the app disables `interrupt_response` or raises thresholds.
- Long silence should be handled in app logic regardless of stack: a reprompt after a few seconds and a graceful end after a longer idle period, implemented with turn timeout (ElevenLabs), user away state (LiveKit), or a client timer reset on speech events (OpenAI, Gemini).

### Gaps
- No published accuracy benchmark for the current LiveKit audio turn detector or Smart Turn v3.2 was found on the pages read.
- OpenAI `idle_timeout_ms` was not mentioned on the VAD page retrieved; its current status is unverified.
- No source quantified false-interruption rates for OpenAI semantic_vad or Gemini Live VAD.

## 5. Call lifecycle events for persisting state and resuming

### Takeaway
All stacks emit connect, disconnect, speaking-state and transcript events to the browser, but only Gemini Live (resumption handles valid 2 hours) and the WebRTC frameworks offer protocol-level resumption; in every case durable state must live in the app's own store, written by tool calls and transcript events as they happen.

### Cited Findings
- OpenAI Realtime: `input_audio_buffer.speech_started` / `speech_stopped`, `response.done` (contains function call details), `conversation.item.truncate` for interrupted audio on WebSocket, automatic truncation on WebRTC; events travel on the `oai-events` data channel. — [OpenAI Realtime conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations); [OpenAI Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- Gemini Live: `interrupted`, `generationComplete`, GoAway with `timeLeft`, session resumption via `SessionResumptionConfig` with handles valid 2 hours after termination. — [Gemini Live session management](https://ai.google.dev/gemini-api/docs/live-session); [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- ElevenLabs: onConnect, onDisconnect, onStatusChange, onModeChange (speaking/listening), onMessage (transcripts and replies), onError, onAudioAlignment. — [ElevenLabs React SDK docs](https://elevenlabs.io/docs/agents-platform/libraries/react)
- Vapi: call-start, call-end, speech-start, speech-end, message, error. — [Vapi Web SDK docs](https://docs.vapi.ai/sdk/web)
- Retell: onStatus (connecting / live / ended), onTranscript, onEnd, onError in the browser; call_started, call_ended, call_analyzed webhooks on the server. — [Retell web call docs](https://docs.retellai.com/deploy/web-call)
- LiveKit Agents: `user_state_changed` (speaking, listening, away), `agent_state_changed` (initializing, idle, listening, thinking, speaking), `user_interruption_detected`, `agent_false_interruption`. — [LiveKit turns docs](https://docs.livekit.io/agents/logic/turns/)
- Deepgram Voice Agent: EndOfTurn, EagerEndOfTurn, FunctionCallRequest; `defer_until_eot` delays irreversible function execution until end of turn. — [Deepgram voice agent configuration](https://developers.deepgram.com/docs/configure-voice-agent)
- Pipecat client SDKs manage session state and event streams for transcription and bot interactions under the RTVI standard. — [Pipecat client SDK docs](https://docs.pipecat.ai/client/introduction)

### Inferences
- A stack-independent resume design: the server owns a conversation record (collected fields, message log, last agent utterance actually spoken); every tool call writes through the server immediately; on reconnect the new voice or text session is seeded with the collected fields and a short summary, and the agent continues from the first missing field.
- A hangup mid-sentence and a network drop look different on the wire (explicit stop or close versus ICE/WebSocket failure) but should lead to the same persisted state, so writes must not wait for an end-of-call event. Browser `pagehide`/`beforeunload` and WebRTC connection state changes are needed in addition to the vendor's disconnect callback.
- Interrupted agent turns should be stored as truncated text (what was played), which OpenAI over WebRTC and Pipecat do automatically and which a raw WebSocket client must compute.
- Deepgram's `defer_until_eot` is a useful pattern to copy on any stack: do not commit a captured name until the user's turn is complete.

### Gaps
- Disconnect reason codes (user ended versus agent ended versus error) for ElevenLabs, Vapi and Retell were not detailed on the pages retrieved.
- Whether OpenAI Realtime offers any session resumption after a dropped connection was not found; the pages read describe none.
- LiveKit client reconnect behavior and whether the agent session survives a brief client drop was asserted by a secondary source only.

## 6. Name capture accuracy

### Takeaway
Proper names are the weakest point of speech recognition (even a leading vendor reports missing about 17% of names), and because an unknown user's name cannot be pre-loaded as a keyterm, the reliable mitigations are conversational and UI-level: confirm by read-back or spelling, show the captured value on screen, and let the user correct it by text.

### Cited Findings
- AssemblyAI (vendor, September 8, 2026): on the Pipecat benchmark its Universal-3.5 Pro Realtime has 6.99% word error rate but 15.31% entity error rate; names 16.92% missed, phone numbers 3.55%, places 6.28%; it reports Deepgram Flux at 50.50% entity error rate. A five-turn conversation collecting entities succeeds 43.6% of the time at 84.69% per-turn accuracy. Mitigations listed: prompting/context, keyterm boosting (100 terms, 50 characters each). — [AssemblyAI: voice agent accuracy](https://www.assemblyai.com/blog/voice-agent-accuracy-problem-benchmarks)
- Named-entity misspelling is listed among the seven most common ASR failure modes in production voice agents. — [Future AGI: ASR failure modes](https://futureagi.com/blog/voice-agent-asr-failure-modes-2026/)
- Deepgram Voice Agent supports a keyterms array on Flux/Nova-3. — [Deepgram voice agent configuration](https://developers.deepgram.com/docs/configure-voice-agent)
- gpt-realtime-2.1 lists improved alphanumeric recognition among its changes. — [OpenAI Developer Community announcement](https://community.openai.com/t/new-realtime-models-on-the-api-gpt-realtime-2-1-and-gpt-realtime-2-1-mini/1385896)
- Recommended monitoring: track tool call parameter errors, especially numbers and proper nouns. — [Hamming AI guide](https://hamming.ai/blog/the-ultimate-guide-to-asr-stt-tts-for-voice-agents)
- ElevenLabs documents no dedicated spelling or entity-capture setting in conversation flow. — [ElevenLabs conversation flow docs](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)

### Inferences
- Keyterm prompting helps with known vocabulary (product name, "Gmail") but not with an arbitrary user's name, so it should be used for the domain terms and not relied on for the name.
- The shared text channel is the strongest mitigation available to this project: display the captured name as soon as the tool call fires, accept a typed correction at any time, and have the agent acknowledge the correction in voice.
- A read-back step ("I have Jonathan, J-O-N-A-T-H-A-N, is that right?") costs one turn; asking the user to spell only when the read-back is rejected keeps the call short for common names.
- The Deepgram Flux 50.50% entity error figure comes from a direct competitor and should not be treated as settled.

### Gaps
- No source was found that measures the effect of spelling confirmation or on-screen transcript display on name accuracy.
- No entity-accuracy numbers were found for speech-to-speech models (gpt-realtime-2.1, gemini-3.8-live).
- No independent (non-vendor) 2026 benchmark of name recognition across STT providers was found.

## 7. Fastest path for a solo builder and cost of about 100 short calls

### Takeaway
The fastest high-quality paths are OpenAI Realtime over WebRTC (least client code, 60-minute sessions) or ElevenLabs Agents with a Claude model (built-in turn-taking controls and a text mode sharing the same agent); at roughly 100 calls of about 3 minutes, every option costs between $0 (free credits) and well under $100.

### Cited Findings
- OpenAI gpt-realtime-mini measured $0.063/min at 3 minutes and $0.05-$0.08/min typical; gpt-realtime-2 audio roughly 3x. — [HackerNoon](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- OpenAI Realtime about $0.30/min per a third-party overview. — [Reactify Solutions](https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026)
- Gemini 3.8 Live audio $0.005/min in and $0.018/min out, free tier available. — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- ElevenLabs Agents $0.08/min plus LLM, 15 free minutes, Creator plan includes 275 minutes. — [ElevenAgents pricing](https://elevenlabs.io/pricing/agents)
- Deepgram Voice Agent $0.075/min standard, $0.059/min BYO LLM, $200 free credit. — [Deepgram pricing](https://deepgram.com/pricing)
- LiveKit Cloud free plan: 1,000 agent minutes, 5,000 WebRTC minutes, $2.50 inference credit. — [LiveKit pricing](https://livekit.com/pricing)
- Vapi $0.05/min plus providers, $5 free credit. — [Vapi pricing](https://vapi.ai/pricing)
- Retell $0.055/min plus LLM ($0.048-$0.064/min for Gemini Flash or Claude Sonnet) plus TTS $0.015/min, $10 free credit. — [Retell pricing](https://www.retellai.com/pricing)
- Ultravox $0.05/min, 30 free minutes. — [Ultravox pricing](https://www.ultravox.ai/pricing)
- Claude Sonnet 5 $2 / $10 per MTok, Haiku 4.5 $1 / $5 per MTok. — [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- Under 10K minutes/month, managed options are recommended for speed. — [Particula](https://particula.tech/blog/vapi-vs-retell-vs-livekit-vs-pipecat-voice-agent-platform)

### Inferences
Cost estimates assume 100 calls x 3 minutes = 300 minutes. These are arithmetic on the cited rates, not measured.

| Stack | Basis | Estimated cost for 300 min |
|---|---|---|
| Gemini 3.8 Live | up to $0.023/min audio plus text tokens | under $10, possibly $0 on free tier |
| Ultravox | $0.05/min, 30 min free | about $14 |
| Deepgram Voice Agent | $0.059-$0.075/min | $18-$23, covered by $200 credit |
| OpenAI gpt-realtime-2.1-mini | $0.06-$0.08/min measured on prior mini | $18-$25 |
| ElevenLabs Agents + Claude | $0.08/min plus LLM tokens | $24 plus a few dollars of LLM |
| Vapi | $0.05 plus about $0.03-$0.08 providers | $24-$40 |
| Retell + Claude Sonnet | about $0.13/min | about $40 |
| Bland | $0.14/min | about $42 |
| OpenAI gpt-realtime-2.1 | about 3x mini, up to $0.30/min cited | $55-$90 |
| LiveKit Agents cascaded (own keys) | free agent minutes; STT about $0.0065/min, TTS and Claude tokens extra | roughly $10-$25 |

- Recommended order of evaluation for this project:
  1. OpenAI Realtime (gpt-realtime-2.1) over WebRTC with `semantic_vad`, server-minted client secret, tools executed by the app server, typed chat injected as `input_text` items into the same session. Strongest conversational feel per unit of code; risks are lock-in, transcript divergence, and cost if context is not pruned.
  2. ElevenLabs Agents with Claude Sonnet 5, React SDK, WebRTC for voice and text-only mode for chat. Best if Claude must drive the dialogue and voice quality is weighted heavily; risk is fewer turn-taking knobs and default 10-minute max duration (configurable).
  3. LiveKit Agents cascaded (Deepgram Flux or AssemblyAI STT, Claude, Cartesia or ElevenLabs TTS) with the turn detector and adaptive interruption handling. Best stress-test behavior on backchannels and false interruptions; cost is a separate agent process to run and deploy and more setup time.
- A hybrid that keeps options open: define tools and conversation state on the app server behind a small interface so the voice transport (OpenAI Realtime, ElevenLabs, LiveKit) can be swapped without touching state logic.
- Whichever stack is chosen, cap response length in the prompt and prune context; the HackerNoon data shows agent verbosity and unpruned history are the main cost and latency drivers.

### Gaps
- No source gave a measured build time for any stack; the "few days" feasibility is a judgment, not a cited fact.
- Hosting cost for a small deployed demo (a Node or Python server plus, for LiveKit or Pipecat, an agent worker) was not researched.
- Per-call LLM token cost for Claude in a cascaded voice pipeline was not measured; at three collected fields and short turns it is expected to be cents per call, but that is an estimate.
- Free-tier rate limits (Gemini Live concurrent sessions, OpenAI tier limits for realtime models) that could throttle an evaluator's stress test were not retrieved.
