# Gmail OAuth in a Conversational Onboarding Flow, and Activation / Time-to-Value Research

Research date: 2026-09-27. Google policy pages were read on that date; each Google citation notes the page's own "last updated" stamp where one was visible.

Reading notes for the report writer:
- Quoted strings from Google pages were extracted through an automated page reader. Wording is close to the source but should be re-checked against the live page before being reproduced as a verbatim quote in a final deliverable.
- Source quality tiers used below: PRIMARY (Google docs, IETF RFC, peer-reviewed paper, vendor's own policy page), SECONDARY (named industry survey or benchmark with stated sample), WEAK (vendor marketing blog or aggregator repeating a stat without a traceable original). Weak items are labelled and should not carry design decisions on their own.

---

# PART A: Gmail OAuth

## A1. Current Gmail OAuth scope classification (non-sensitive, sensitive, restricted) and what each scope can do

### Takeaway
Any scope that lets an app read mail content or even mail headers is restricted: `gmail.readonly`, `gmail.metadata`, `gmail.modify`, `gmail.compose`, and `https://mail.google.com/` are all restricted. Only `gmail.send` (sensitive) and `gmail.labels` (non-sensitive) sit below that tier, and neither can read a message.

### Cited Findings
- PRIMARY. Google's Gmail scope table (page last updated 2026-09-10) classifies scopes as follows — [Google: Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes):

| Scope | Consent-screen description | Tier |
|---|---|---|
| `gmail.labels` | "See and edit your email labels." | Non-sensitive |
| `gmail.addons.current.action.compose` | Manage drafts and send when interacting with a Workspace add-on | Non-sensitive |
| `gmail.addons.current.message.action` | View messages when interacting with the add-on | Non-sensitive |
| `gmail.send` | "Send email on your behalf." | Sensitive |
| `gmail.addons.current.message.metadata` | Add-on only metadata | Sensitive |
| `gmail.addons.current.message.readonly` | Add-on only read | Sensitive |
| `gmail.readonly` | "View your email messages and settings." | Restricted |
| `gmail.metadata` | "View your email message metadata such as labels and headers." | Restricted |
| `gmail.modify` | "Read, compose, and send emails from your Gmail account." | Restricted |
| `gmail.compose` | "Manage drafts and send emails." | Restricted |
| `gmail.insert` | "Add emails into your Gmail mailbox." | Restricted |
| `gmail.settings.basic` | Settings and filters | Restricted |
| `gmail.settings.sharing` | Sensitive settings including delegation | Restricted |
| `https://mail.google.com/` | "Read, compose, send, and permanently delete all your email from Gmail." | Restricted |

- PRIMARY. The same page states that apps using sensitive or restricted scopes must complete Google's OAuth verification, and that restricted-scope data stored or transmitted on servers requires a security assessment — [Google: Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- PRIMARY. `users.threads.list` accepts four scopes: `https://mail.google.com/`, `gmail.modify`, `gmail.readonly`, `gmail.metadata`. `maxResults` defaults to 100 (max 500). The `q` search parameter "cannot be used when accessing the api using the gmail.metadata scope." — [Gmail API reference: users.threads.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list)
- PRIMARY. Sign-in scopes `openid`, `email`, `profile` are treated separately: they are exempt from the granular-consent screen and exempt from the Testing-mode 7-day refresh-token expiry — [Google: granular permissions](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions); [Google: Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- PRIMARY. Google permits restricted Gmail scopes only for four application types: email clients; automatic backup; apps that "enhance the email experience for productivity purposes"; and reporting or monitoring services (policy page last updated 2026-09-03) — [Google Workspace API user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

### Inferences
- There is no "cheap" read scope. Dropping from `gmail.readonly` to `gmail.metadata` does not lower the verification tier; it only removes body access and search. For a demo that wants to summarize threads, `gmail.readonly` is the narrowest scope that does the job.
- An AI assistant that triages or drafts replies plausibly fits the "enhance the email experience for productivity purposes" category, which is the category email-assistant products would need to claim at verification time. This is a reading of the policy text, not a Google ruling.
- A draft-creating assistant needs `gmail.compose` (restricted), which also grants send. There is no draft-only scope in the table.

### Gaps
- The scopes page does not list `openid`/`email`/`profile` with a tier label; their non-sensitive status is implied by the exemptions above rather than stated in the Gmail table.
- I did not verify per-method scope requirements for `users.messages.get` or `users.drafts.create`.

---

## A2. Rules for unverified apps and Testing status; what an external evaluator sees; verification and CASA requirements, cost and time

### Takeaway
For a take-home, the workable configuration is External + Testing with the evaluator's Google address added to the test-user allowlist in advance; they will see a warning screen and can click through. Full verification for a restricted Gmail scope (brand verification, restricted-scope review, annual CASA assessment) takes weeks and costs money, and is not realistic inside a take-home timeline.

### Cited Findings

Testing status
- PRIMARY. In Testing, "Only users explicitly added to the test user allowlist can access the app (limited to a hard cap of 100 test users)." Users requesting only `openid`, `email`, `profile` can access without being on the allowlist. (Page last updated 2026-05-22.) — [Google: OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- PRIMARY. Testing projects are "limited to up to 100 test users listed in the OAuth consent screen"; authorizations expire seven days after consent and refresh tokens also expire; a warning is shown before test users authorize — [Google Cloud Console Help: Manage App Audience](https://support.google.com/cloud/answer/15549945)
- PRIMARY. "A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile." (Page last updated 2026-05-26.) — [Google: Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- PRIMARY. Other refresh-token failure causes: user revocation, six months unused, password change when the token contains Gmail scopes, exceeding the limit of "100 refresh tokens per Google Account per OAuth 2.0 client ID", time-based access expiry, admin restriction — [Google: Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

Published but unverified
- PRIMARY. Published-unverified apps are open to any Google user, cannot show name and logo, and "For apps requesting sensitive or restricted scopes, unverified app warnings (Danger UI) will be displayed to users, and a hard cap of 100 total users applies." — [Google: OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- PRIMARY. The cap is "100 new users in total, after the app presents the unverified app screen", counted over the project lifetime, and cannot be reset or changed — [Google Cloud Console Help: Manage App Audience](https://support.google.com/cloud/answer/15549945)
- PRIMARY. The unverified screen also appears if the scopes requested in code differ from those declared in the consent-screen configuration — [Google Cloud Console Help: Unverified apps](https://support.google.com/cloud/answer/7454865)
- SECONDARY. Third-party write-up describes the click-through as "Advanced > Go to [App name]" — [Unipile: Google OAuth consent screen](https://www.unipile.com/google-oauth-consent-screen/)

When verification is not required
- PRIMARY. Not required for: personal use ("fewer than 100 users", warnings still shown); development/testing/staging; service-account-only data; internal apps in a Workspace or Cloud Identity org (these bypass the warning and the cap); admin-trusted or Marketplace-installed apps. All apps must still follow the API Services User Data Policy — [Google Cloud Console Help: When is verification not needed](https://support.google.com/cloud/answer/13464323)
- PRIMARY. The restricted-scope page lists the same exemptions, including personal use "Only used by a few users, all of whom are known personally to you" (page last updated 2026-08-19) — [Google: Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

Verification requirements
- PRIMARY. Sensitive-scope verification needs: public homepage, privacy policy on the same domain, domain ownership verified in Search Console, an unlisted YouTube demo video showing the grant flow and each scope's use, and a per-scope justification including why a narrower scope is insufficient. It "typically takes 3-5 business days." No security assessment is required at this tier — [Google: Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- PRIMARY. Restricted-scope verification adds: proof of being a permitted application type and a security assessment for "every app that requests access to Google users' restricted data and has the ability to access data from or through a third-party server." Brand verification "typically takes 2-3 business days"; the restricted process "can potentially take several weeks." Reassessment is required "at least every 12 months" after the Letter of Assessment date. Google does not state a cost — [Google: Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

Cost and time, from developers
- SECONDARY (first-person account, January 2025). A solo developer with Gmail restricted scopes passed CASA Tier 2 using TAC Security, paying $720 for a plan with unlimited revalidation; scanning took 3 to 4 days; the process included a 50-plus question self-assessment questionnaire and remediation rounds; they chose DAST over SAST to avoid sharing source — [DEV Community: My SaaS passed CASA Tier 2](https://dev.to/rem4ik4ever/my-saas-passed-casa-tier-2-assessment-and-yours-can-to-here-is-how-1b20)
- WEAK (aggregated by search, not individually verified). Tier 2 lab fees quoted around $540 to $1,000; Tier 3 several thousand dollars (one lab listed at $4,500); end-to-end first-time timeline 4 to 12 weeks — [DeepStrike: Google CASA](https://deepstrike.io/blog/google-casa-security-assessment-2025); [Unipile: Google OAuth verification](https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/)

### Inferences
- The evaluator must be on the allowlist before they try to connect Gmail in Testing mode. That means collecting their Google address ahead of time, which is an out-of-band step the README has to call out. If they are not listed, the Gmail grant will fail, so the app needs a visible fallback at that exact moment (see A7).
- Option B is to publish unverified. Any Google account can then proceed without being pre-listed, but sees the stronger "Danger UI" warning and consumes one of 100 lifetime slots. The 7-day refresh-token rule is written as specific to Testing status, so it should not apply to a published app; I did not find a Google sentence that states this positively.
- For a demo evaluated within a few days, 7-day token expiry is mostly harmless, but the app should treat `invalid_grant` on refresh as "reconnect needed" rather than an error state.
- Sign-in with only `openid email profile` avoids the allowlist, the warning, and the 7-day expiry. That supports splitting identity sign-in from the Gmail grant.

### Gaps
- Conflict between Google pages: the app-state overview says Testing users "see a warning UI indicating the app is in testing, rather than the standard unverified app screen," while the "when is verification not needed" help page says development-phase apps "remain subject to the unverified app screen and 100-user cap." The exact screen a test user sees in September 2026 should be confirmed by running the flow once with a second Google account.
- I could not extract the literal on-screen wording of the warning ("Google hasn't verified this app" and the Advanced link) from a Google page; that wording comes from third-party write-ups and memory of the UI.
- Whether Workspace-managed evaluator accounts are blocked by their admin's third-party app policy was not researched; Google lists `admin_policy_enforced` as an error, so it is possible.
- No authoritative, current CASA price list was found. Figures above are from one developer and from vendor blogs.

---

## A3. Least-friction, most honest approach: minimal scopes first versus read access up front; incremental authorization, granular consent, partial grants

### Takeaway
Google's policy language says to request scopes in context with a justification first, and to request the smallest set. For this project that points to: sign in with identity scopes only, then request a single Gmail scope (`gmail.readonly`) at the moment the conversation reaches the Gmail step, and check the granted scope list on return.

### Cited Findings
- PRIMARY. "Where possible, you must ask for scopes in context with incremental authorization and provide a justification to the user before you request authorization." (Page last updated 2026-08-05.) — [Google: OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- PRIMARY. "You must only request the smallest set of scopes that are necessary for providing functionality knowingly chosen by the user." — [Google: OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- PRIMARY. With `include_granted_scopes=true`, "the new access token will also cover any scopes to which the user previously granted the application access." Google describes incremental authorization as best practice so apps can "request access to user data in context" — [Google: OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- PRIMARY. In the Google Identity Services JS library, `include_granted_scopes` defaults to `true`, and `enable_granular_consent` is "Deprecated, no effect if set" — [Google Identity Services JS reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- PRIMARY. Granular permissions let users grant or deny individual scopes. Apps requesting only sign-in scopes, or only a single non-sign-in scope, do not get the granular checkbox screen — [Google: granular permissions](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions)
- PRIMARY. "Your app should always check which scopes were granted by the user and handle any denial of scopes by disabling relevant features." In Node, inspect `tokens.scope` — [Google: granular permissions](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions)
- PRIMARY. The GIS library exposes `hasGrantedAllScopes` and `hasGrantedAnyScope`, and the code response includes a `scope` field listing approved scopes — [Google Identity Services JS reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)

### Inferences
- Requesting exactly one Gmail scope in its own authorization request avoids the checkbox screen entirely, so the user faces a single allow/cancel decision. Bundling `gmail.readonly` with `gmail.send` or Calendar in one request would bring back per-scope checkboxes and the partial-grant case.
- If sign-in and Gmail are requested together, the user can approve sign-in and untick Gmail. The app then has a signed-in user and no Gmail access, and should behave exactly as it does for an explicit decline.
- "Honest" in practice means the scope's consent text matches what the agent said out loud. `gmail.readonly` reads "View your email messages and settings," so the agent should say it can read mail and cannot send, delete, or change anything, which is true of that scope.
- Send or draft capability is better left for a later in-product moment when the user first asks the assistant to reply to something.

### Gaps
- The granular-permissions page did not show rollout dates, so I cannot state when granular consent became universal for web clients.
- No Google guidance was found on the specific case of voice-led flows.

---

## A4. Web implementation: authorization code flow with PKCE, popup versus redirect, keeping a voice call alive, detecting completion/cancel/denial, state and CSRF, token storage, revocation

### Takeaway
Use the authorization code flow in a popup so the page hosting the voice call never navigates. Exchange the code on the server, keep the refresh token encrypted server-side, and treat popup-closed, popup-blocked, access-denied, and scope-missing as four distinct outcomes the agent can respond to.

### Cited Findings
Flow choice
- PRIMARY. Google: "For the best balance of usability and security, we recommend using the Popup mode UX flow with Authorization code model." — [Google Identity Services: Use code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
- PRIMARY. In popup mode the authorization code is returned to a JavaScript `callback`; in redirect mode Google redirects the user agent to `redirect_uri` with the code as a URL parameter. `ux_mode` defaults to `popup` — [Google Identity Services: Use code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model); [GIS JS reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- PRIMARY. The flow is started by calling `client.requestCode()` from a user gesture such as a button click — [Google Identity Services: Use code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
- PRIMARY. Google prohibits sending authorization requests to an embedded user agent under the developer's control (no embedded webviews or iframes of the consent page) — [Google: OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)

Detecting outcomes
- PRIMARY. `error_callback` handles non-OAuth errors with types `popup_failed_to_open`, `popup_closed` ("closed before an OAuth response is returned"), and `unknown` — [GIS JS reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- PRIMARY. The code response carries `code`, `scope`, `state`, `error`, `error_description`, `error_uri`. `access_denied` is returned when the user refuses — [GIS JS reference](https://developers.google.com/identity/oauth2/web/reference/js-reference); [Google: OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)

CSRF and PKCE
- PRIMARY. Redirect mode uses the `state` parameter; apps should "confirm that the `state` received from Google matches the `state` sent in the authorization request." In popup mode Google's guidance is to add a custom header (`X-Requested-With`) on the code-exchange request and verify it and the origin server-side — [Google: OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server); [Google Identity Services: Use code model](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
- PRIMARY. RFC 9700 (January 2025): public clients MUST use PKCE; for confidential clients PKCE "is RECOMMENDED"; clients may rely on PKCE for CSRF protection if the server supports it, otherwise one-time `state` tokens MUST be used; implicit grant SHOULD NOT be used — [IETF RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700)

Offline access, storage, revocation
- PRIMARY. `access_type=offline` returns a refresh token on the first code exchange; `prompt=consent` forces the consent screen to reappear — [Google: OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- PRIMARY. "Never transmit tokens in plaintext, and always store encrypted tokens at rest"; protect the client secret like a password and use a secret manager; "Revoke tokens when you no longer need access" — [Google: OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- PRIMARY. Revoke by calling `https://oauth2.googleapis.com/revoke` with the token; GIS also exposes `google.accounts.oauth2.revoke`, which "revokes all of the scopes that the user granted to the app" — [Google: OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server); [GIS JS reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)

Popup pitfalls
- PRIMARY/SECONDARY. A `Cross-Origin-Opener-Policy: same-origin` header on the host page breaks popup-to-opener communication, producing blank popups; `same-origin-allow-popups` is the documented fix — [Google: Sign in with Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid); [Next.js discussion 51135](https://github.com/vercel/next.js/discussions/51135)

### Inferences
- Voice call continuity: a popup is a separate browsing context, so the opener page keeps its JavaScript, WebRTC or WebSocket connection, and microphone stream. Redirect mode unloads the page and would end the call. This follows from how the two modes are defined in Google's docs; I did not find a source testing call continuity specifically.
- The user-gesture requirement means the voice agent cannot open the popup by itself from a tool call; browsers will block it (`popup_failed_to_open`). The practical pattern is that the agent says what is about to happen and the page surfaces a "Connect Gmail" button that the user clicks.
- While the popup has focus the user may be reading the consent screen. The agent should stay quiet or say one short line, then resume based on the callback. A timeout with a gentle check-in covers the case where the popup is left open behind the main window.
- Suggested outcome mapping for the conversation state machine:
  - `code` present and granted `scope` includes the Gmail scope: connected; run the first read.
  - `code` present but Gmail scope absent: partial grant; treat as decline.
  - `error=access_denied`: explicit decline; acknowledge, offer sandbox or skip.
  - `popup_closed`: abandonment; ask once whether they want to try again or continue without it.
  - `popup_failed_to_open`: blocked popup; show an inline link or fall back to redirect after saving conversation state.
- If a redirect fallback is unavoidable (for example mobile Safari), persist onboarding state server-side keyed by session, carry a one-time `state` value, and reconnect the call on return.
- For a confidential web client the code exchange is protected by the client secret. Adding PKCE is consistent with RFC 9700 and harmless, but it is an addition to, not a replacement for, Google's documented CSRF measures.

### Gaps
- Google's web-server OAuth page, as read, does not mention PKCE or `code_challenge`. I could not confirm from a Google primary source whether Web application client types accept PKCE parameters. Treat PKCE support for Google web clients as unconfirmed and test it.
- No source was found on browser behaviour of microphone capture or audio playback when a popup takes focus. Needs a manual test in Chrome and Safari.
- Google notes that reliable notification of token revocation requires integrating Cross-Account Protection; I did not research that integration.

---

## A5. Demonstrating immediate value from a small read, and privacy considerations of sending email to an LLM

### Takeaway
A single `threads.list` call limited to a handful of inbox threads, followed by fetching those threads, is enough to produce a spoken summary or to surface one message that needs a reply. Google's Limited Use rules allow passing that content to a model to serve the user's own feature, but forbid using it to train generalized models and restrict human access.

### Cited Findings
- PRIMARY. `users.threads.list` supports `maxResults`, `labelIds[]`, `q`, `includeSpamTrash` and works with `gmail.readonly` — [Gmail API reference: users.threads.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list)
- PRIMARY. Limited Use prohibits transferring or using user data to "create, train, or improve a machine learning or artificial intelligence model beyond that specific user's personalized model for the appropriate use case or user-facing feature." — [Google Workspace API user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- PRIMARY. Human reading of user data is allowed only with documented explicit consent for specific messages, for security purposes, for legal compliance, or when aggregated and anonymized for internal operations — [Google Workspace API user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- PRIMARY. Transfers are prohibited except to provide or improve the user-facing feature with consent, for security, legal compliance, or M&A; transfers to ad platforms and data brokers and use for ads are prohibited — [Google Workspace API user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- PRIMARY. All apps must comply with the API Services User Data Policy regardless of verification status — [Google Cloud Console Help: When is verification not needed](https://support.google.com/cloud/answer/13464323)
- PRIMARY/SECONDARY. Anthropic API: inputs and outputs are deleted from the backend within 30 days by default, with exceptions for zero-data-retention agreements and policy enforcement; Commercial Terms state Anthropic may not train models on customer content — [Anthropic Privacy Center: data retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data); [Claude Platform docs: API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention). These were read from search summaries, not fetched in full.
- PRIMARY (vendor's own page). Cora discloses LLM use directly: "We share your emails with LLMs, but your data is never used to train models." — [Cora](https://cora.computer/declare-email-bankruptcy)

### Inferences
- Concrete first-value read: `threads.list` with `labelIds=INBOX`, `maxResults` of about 5 to 10, optionally `q="is:unread newer_than:3d"`; then `threads.get` per thread; pass sender, subject, date, and a truncated body to the model; return either a three-line summary or "one email that looks like it needs a reply."
- Tie the first read to the "one thing they want help with" answer collected earlier, so the demonstration looks personalized rather than generic.
- Data minimization choices that are cheap to implement and easy to state to the user: fetch only a few threads; truncate bodies; do not persist message content after the response; do not log bodies; show on screen which threads were read.
- The policy applies even in Testing mode, so the demo's privacy statement should be true as written. If the LLM provider or voice vendor retains prompts for 30 days, saying "nothing is stored" would be inaccurate; say what the app stores and name the processors.
- Voice adds a processor: transcripts and any email text spoken aloud pass through the speech vendor. That should be in the disclosure.
- Reading email aloud on a call can expose content to people nearby. Summarize by sender and topic first and let the user ask for detail.

### Gaps
- I did not find Google guidance that specifically addresses third-party LLM APIs as sub-processors under Limited Use beyond the text quoted.
- Anthropic retention details come from search summaries of Anthropic pages; confirm current terms for whichever LLM and voice vendors the project uses.
- Prompt injection from email content into the agent was not researched here and is a known risk category for any assistant that reads mail.

---

## A6. How AI assistant products phrase the permission request; drop-off at consent screens and what reduces it

### Takeaway
Shipping products state plainly what they read, what they never do, and that an LLM is involved. Hard public data on Google consent-screen drop-off is scarce; the best quantified evidence for "explain before you ask" comes from mobile permission priming, which is an analogy, not a direct measurement.

### Cited Findings
- PRIMARY (vendor page). Cora's phrasing: "Cora will never send emails for you"; "Cora doesn't have the ability or permissions to send or delete emails"; "We never train on your data"; "We have no backdoor access or ability to view your emails. Period."; states it is "Google Verified" and compliant with "CASA 2" — [Cora](https://cora.computer/declare-email-bankruptcy)
- PRIMARY. Google requires a justification to the user before the authorization request — [Google: OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- PRIMARY. Unverified apps cannot show their name and logo on the consent screen and show a warning — [Google: OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- SECONDARY. Lenny Rachitsky's 500-plus response survey ranks the tactics respondents said most improved activation: simpler onboarding UI, reducing friction, follow-up emails, copy, targeting, sales outreach, incentives, showing value earlier — [Lenny's Newsletter: What is a good activation rate](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)
- WEAK. Vendor blog claims about consent screens: a poorly branded consent screen can see "50% drop-off"; narrower, clearly defined scopes and plain-language descriptions raise grant rates. No study or sample is cited — [SSOJet](https://ssojet.com/ciam-qna/google-oauth-consent-screen-issues-verification-requirements); [Auth0 blog](https://auth0.com/blog/the-art-of-user-consent-management-oauth/)
- WEAK (mobile analogy; figures surfaced via search summaries of vendor posts). Pre-permission priming before iOS system prompts is reported to raise opt-in substantially; one summary attributes to Adjust an average 65% opt-in with pre-prompts against a 25 to 35% baseline — [Adjust: Getting the opt-in](https://www.adjust.com/blog/getting-the-opt-in/); [AdExchanger](https://www.adexchanger.com/data-driven-thinking/perfect-your-ios-14-opt-in-strategy-with-pre-permission-prompts-built-with-context-and-trust/)

### Inferences
- A workable spoken script structure, assembled from the patterns above:
  1. Why now, tied to their stated goal.
  2. What will happen: a Google window opens, read-only access.
  3. What will not happen: no sending, deleting, or changing anything.
  4. The expected warning: because this is a demo app, Google will show a caution screen; that is expected.
  5. The exit: they can skip, use a sample inbox, or disconnect later.
- Pre-announcing the warning screen matters more for this project than for a verified product, because the warning is the scariest element the evaluator will encounter and it contradicts a trust-building tone unless explained first.
- The spoken claim must match the consent text. If the app requests `gmail.readonly`, do not say "I'll only look at your last five emails" as a description of the permission; say the permission allows reading mail and that the app will read only the latest few.
- Show the same explanation in text on screen while it is spoken, so the user can re-read it while the popup is open.

### Gaps
- No reliable, sourced benchmark for Google OAuth consent completion rates for Gmail scopes was found. The "50%" figure is unsourced vendor copy.
- I could not retrieve the actual in-product Gmail connection copy for Superhuman, Shortwave, Fyxer, Lindy, or similar; those screens sit behind signup. Only Cora's public marketing page was read.
- No study was found that isolates the effect of offering "skip" on eventual grant rates for OAuth.

---

## A7. Should the demo offer a simulated or sandbox inbox for evaluators who will not connect a real account?

### Takeaway
Yes. The allowlist requirement, the warning screen, and ordinary reluctance to grant mail access to a candidate's project each independently justify a labelled sample-inbox path, so that the evaluator can still reach the value demonstration.

### Cited Findings
- PRIMARY. In Testing, only allowlisted users can complete a Gmail-scope grant — [Google: OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- SECONDARY. Appcues' review of CRM onboarding notes products use sample data to get past the empty state, and that it should be clearly labelled as sample (HubSpot is the cited example) — [Appcues: CRM onboarding and the empty state](https://www.appcues.com/blog/crm-software-user-onboarding)
- SECONDARY. Microsoft provides sample data packs (mailboxes, calendar events, chats) for developer sandbox tenants — [Microsoft Learn: developer sandbox sample data](https://learn.microsoft.com/en-us/office/developer-program/install-sample-packs)
- WEAK (vendor content). Demo-tooling vendors describe sandbox environments as a way to show a product without setup or exposure of real data — [HowdyGo: Demo sandbox guide](https://www.howdygo.com/blog/demo-sandbox); [Supademo](https://supademo.com/blog/sandbox-environment)

### Inferences
- Design the sandbox as the same code path with a different data source: a fixture that returns Gmail-shaped thread objects. That keeps the summarization and "needs a reply" logic identical and lets the evaluator judge the real behaviour.
- Label it persistently in the UI and have the agent say it is sample data. Presenting simulated mail as if it were the user's would undercut trust.
- Offer it at three points: as an alternative before the ask, after a decline or closed popup, and automatically when the grant fails because the account is not on the allowlist.
- Keep "connect real Gmail" available afterwards so sandbox users can upgrade without restarting.
- A third option for cautious evaluators is a throwaway Gmail account seeded with test mail; mention it in the README.

### Gaps
- No evidence was found of consumer AI email assistants shipping a public sandbox inbox; the pattern is documented for B2B SaaS demos and developer tenants.
- No data on how sample-data modes affect later conversion to a real connection.

---

# PART B: Activation and Onboarding

## B1. Time-to-value, activation moments, and onboarding length

### Takeaway
Named benchmarks put typical activation around 25 to 37 percent, and respondents credit simpler, lower-friction flows and earlier value for improvements. The Reforge setup/aha/habit model gives a clean frame: collecting names and connecting Gmail is setup; the first useful inbox insight is the aha.

### Cited Findings
- SECONDARY. Lenny Rachitsky and Yuriy Timen survey (October 2022, 500-plus products): average activation 34%, median 25%; SaaS only, average 36%, median 30%. Activation rate is defined as users who hit the activation milestone divided by users who completed signup. Example milestones include "first 5 survey responses collected" and "first design published and shared" — [Lenny's Newsletter: What is a good activation rate](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)
- SECONDARY. The same source defines the activation milestone as the earliest point in onboarding that shows value and predicts retention; activated users should retain at least 2x better — [Lenny's Newsletter: How to determine your activation metric](https://www.lennysnewsletter.com/p/how-to-determine-your-activation)
- SECONDARY. Userpilot benchmark report (547 SaaS companies): activation 34.6% for product-led and 41.6% for sales-led companies; time to value about 1 day 12 hours (PLG) and 1 day 11 hours (SLG); onboarding checklist completion averages 19.2%; month-1 retention 48.4% PLG, 39.1% SLG — [Userpilot: Product metrics benchmark report](https://userpilot.com/blog/product-metrics-benchmark-report/)
- SECONDARY. Userpilot's separate activation report (62 B2B companies) gives average 37.5%, median 37% — [Userpilot: User activation rate benchmark report 2024](https://userpilot.com/blog/user-activation-rate-benchmark-report-2024/)
- SECONDARY. Reforge defines three activation moments: setup (user has completed the actions required to receive value), aha (first experience of the core value), habit (core action repeated within an initial period) — [Reforge: Define your setup moment](https://www.reforge.com/guides/define-your-setup-moment); [Reforge: Defining your aha moment](https://www.reforge.com/c/retention-series-eg/activation/aha-moment)
- WEAK. Claims surfaced via aggregators that I could not trace to an original: "over 98% of new users churn within two weeks when they never hit a value milestone" attributed to Amplitude 2025; "AI-native onboarding delivers a 3.2x median activation lift"; "first value within 14 days retain at 82 percent" — [Flowjam](https://www.flowjam.com/blog/saas-onboarding-best-practices-2025-guide-checklist); [Perspective AI](https://getperspective.ai/blog/2026-customer-onboarding-benchmark-activation-rates-by-industry); [SaaS Mag](https://www.saasmag.com/time-to-value-saas-onboarding-retention-2026/)

### Inferences
- Mapping to this project: setup moment is agent name, user name, one goal, and Gmail connected (or sandbox chosen). The aha moment is the first accurate, goal-relevant thing the agent says about the inbox. Onboarding should end at the aha, not at the last form field.
- "Early graduation" follows from the setup-moment definition, which asks for the minimum needed to deliver value. Once the required fields are captured, the user can move into the main product even if the scripted conversation has more to say.
- Ordering implication: the cheap, low-stakes asks (names, goal) come first and give the agent material to justify the expensive ask (Gmail). The goal answer is what makes the Gmail request feel purposeful.
- The 19.2% checklist completion figure is a caution against long multi-step onboarding in general.

### Gaps
- No primary benchmark specific to AI assistants or agents was found. A search summary claimed AI and ML products reach value "in hours", attributed to Userpilot, but the Userpilot page as read did not contain per-industry time-to-value, so that claim is unconfirmed.
- The Lenny survey's per-category numbers are in chart images and were not extractable.
- Benchmarks are self-reported with company-specific definitions of activation; they are not comparable measurements.

---

## B2. Conversational versus form-based onboarding, and voice onboarding specifically

### Takeaway
Evidence that conversational formats beat forms is mostly vendor-reported and applies to longer forms; several of the same sources say short forms of under five fields do as well or better in traditional layout. Evidence for voice onboarding is weak and commercially motivated, so voice should be treated as an experience choice with a text path always available.

### Cited Findings
- WEAK (vendor blog citing Typeform data that I could not trace to a Typeform publication). Conversational forms complete at 47.3% versus 21.5% for traditional forms; conversational formats outperform by 15 to 40%; traditional forms "still win for short interactions (under 5 fields), checkout flows, and data entry tasks" — [TinyCommand: Conversational vs traditional forms](https://tinycommand.com/blogs/conversational-forms-vs-traditional-forms-which-is-better-for-your-business)
- WEAK. Voice AI vendor claims: 90% completion for voice versus 55% for text chat in financial onboarding; 35% lower abandonment. No methodology given — [RevRag.AI](https://www.revrag.ai/resources/voice-ai-vs-chat-the-future-of-customer-onboarding)
- WEAK. A different vendor states the opposite for sensitive contexts: text sees higher completion where disclosure is sensitive, because it is private and asynchronous — [Gravity Base](https://www.gravitybase.ai/voice-ai-vs-text-chatbots-pros-cons-and-when-to-use-each/)
- PRIMARY (HCI). Luger and Sellen (CHI 2016), interviews with 14 users of conversational agents, found user expectations "dramatically out of step with the operation of the systems" regarding intelligence, capability, and goals — [Microsoft Research PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/p5286-luger.pdf); [Edinburgh Research Explorer](https://www.research.ed.ac.uk/en/publications/like-having-a-really-bad-pa-the-gulf-between-user-expectation-and/)
- SECONDARY. NN/g: users "want to start using the product right away" and guidance delivered out of context is hard to recall — [NN/g: Onboarding tutorials vs. contextual help](https://www.nngroup.com/articles/onboarding-tutorials/)

### Inferences
- This project collects three short fields plus one permission. By the vendors' own caveat, that is the range where a plain form is competitive. The conversational format therefore has to justify itself through product demonstration (the onboarding is the first experience of the assistant) rather than through completion-rate claims.
- Voice has specific weaknesses for this data: names are error-prone in speech recognition, so show captured values on screen and allow one-tap correction; OAuth cannot be done by voice at all and needs a click.
- Offer modality choice at the start and allow switching mid-flow with shared state. Users in public or shared spaces will not want to discuss their inbox aloud.
- The Luger and Sellen finding argues for the agent stating concretely what it can do during onboarding, to set expectations at a level the product will meet.

### Gaps
- No peer-reviewed or independently audited comparison of conversational versus form onboarding completion was found.
- No credible study of voice-led onboarding for consumer software was found. All voice completion numbers located are vendor marketing.

---

## B3. Personalization and naming: IKEA effect, endowment, anthropomorphism, and risks

### Takeaway
Human-like cues produce a small positive effect on user responses in a large meta-analysis, and effort-based valuation is well documented for physical goods. Neither body of evidence directly shows that naming an assistant improves retention, so naming is a reasonable low-cost step, not a proven lever.

### Cited Findings
- PRIMARY. Meta-analysis in Humanities and Social Sciences Communications (2025): 800 effect sizes, 199 datasets, 142 papers, N = 41,642; human-like social cues in text-based agents have a small positive effect on social responses, g = 0.36, 95% CI [0.27, 0.44]; effects are moderated by user characteristics, agent type, and context — [Nature HSSC meta-analysis](https://www.nature.com/articles/s41599-025-05618-w); [OSF project page](https://osf.io/cezmu/wiki/home/). Read from abstract-level summaries; the article page required a login redirect.
- PRIMARY. Norton, Mochon, Ariely (Journal of Consumer Psychology, 2012): across studies with IKEA boxes, origami, and Lego, people valued self-assembled products more than identical pre-assembled ones; the paper also investigates boundary conditions — [HBS: The IKEA effect](https://www.hbs.edu/faculty/Pages/item.aspx?num=41121); [Working paper PDF](https://www.hbs.edu/ris/Publication%20Files/11-091.pdf)
- PRIMARY. Blut et al. meta-analysis on anthropomorphism in service provision (Journal of the Academy of Marketing Science) covers robots, chatbots, and other AI — [Springer](https://link.springer.com/article/10.1007/s11747-020-00762-y). Located but not read in detail.
- PRIMARY. Luger and Sellen: gap between expectation and capability is a central source of disappointment with conversational agents — [Microsoft Research PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/p5286-luger.pdf)
- PRIMARY. A 2026 scoping review addresses ethical perspectives on anthropomorphising LLM-based agents — [arXiv 2601.09869](https://arxiv.org/pdf/2601.09869). Located but not read in detail.
- PRIMARY. A longitudinal randomized study of extended chatbot use compares voice and text modes on psychosocial outcomes such as loneliness and emotional dependence — [arXiv 2503.17473](https://arxiv.org/pdf/2503.17473). Only the search summary was read; the summary's claim that voice modes were more favourable should be checked against the paper, which I recall reports that benefits diminished at high usage.

### Inferences
- Naming the agent is a small act of customization that plausibly creates ownership, by analogy with the IKEA effect. The original finding concerns completed physical assembly, and the paper reports boundary conditions, so the transfer to typing a name is a hypothesis.
- Risks to design around: a name and voice raise perceived capability, which widens the expectation gap if the agent then fails at basic tasks; more human-like presentation can make users less careful about what they grant or disclose, which matters when the next step is mail access; naming is a blank-page question that can stall some users.
- Practical handling: offer a default or a few suggestions so the question can be answered in one word; let the user skip and rename later; keep the agent's self-description factual about being an AI and about what it can do.
- Asking the user's own name is lower value if Google sign-in already returns a profile name. Confirming ("Should I call you Jonathan?") is faster than asking and demonstrates that the connection did something.

### Gaps
- No study was found measuring retention or engagement effects of user-chosen assistant names specifically.
- Per-outcome effect sizes and cue-level results (names versus avatars versus language style) from the 2025 meta-analysis were not accessible.
- Endowment-effect literature was not searched separately.

---

## B4. Progressive profiling and deferring asks

### Takeaway
Industry sources consistently report that fewer up-front fields raise completion and that collecting data later in context works, but the specific percentages in circulation are poorly sourced. Google's own policy independently requires the in-context approach for permissions.

### Cited Findings
- PRIMARY. Google policy requires asking for scopes in context with incremental authorization and only the smallest set necessary for functionality "knowingly chosen by the user" — [Google: OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- SECONDARY. Reforge's setup moment is framed around the minimum information needed to deliver the aha moment — [Reforge: Define your setup moment](https://www.reforge.com/guides/define-your-setup-moment)
- SECONDARY. Lenny's survey lists "reducing onboarding friction" and "simpler onboarding UI/UX" as the top reported activation levers — [Lenny's Newsletter: What is a good activation rate](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)
- SECONDARY. NN/g recommends progressive disclosure and help triggered by user signals in place of up-front instruction — [NN/g: Onboarding tutorials vs. contextual help](https://www.nngroup.com/articles/onboarding-tutorials/)
- WEAK (agency and vendor blogs; attributed originals not located). Cutting a form from 11 to 4 fields associated with about 120% more completions; each added field lowers conversion by about 4.1% (attributed to HubSpot 2024); progressive profiling yields 47% higher conversion (attributed to Salesforce 2025) — [Brixon Group](https://brixongroup.com/en/lead-forms-in-b2b-the-perfect-balancing-act-between-data-depth-and-conversion-rate); [Reform](https://www.reform.app/blog/progressive-profiling-vs-traditional-forms-key-differences)
- SECONDARY. Baymard checkout research, as cited by a vendor, finds a meaningful share of abandonment attributed to long or complicated processes — [TinyCommand](https://tinycommand.com/blogs/conversational-forms-vs-traditional-forms-which-is-better-for-your-business)

### Inferences
- The brief fixes four required items. Progressive profiling therefore applies to everything else: tone preferences, working hours, calendar access, send permission, notification settings. None of those should appear in onboarding.
- Within the four, the order that defers the costliest ask until it has a reason is: agent name or user name, the goal, then Gmail framed by the goal. An alternative is Gmail-first for high-intent users who arrive wanting exactly that; the flow should accept items in any order the user volunteers them.
- If one utterance contains several answers ("I'm Sam, call yourself Max, I need help with recruiter email"), the agent should extract all of them and not re-ask.
- Declining Gmail should not block graduation if the brief allows it; mark it as pending and re-offer at the first moment the user asks for something that needs mail.

### Gaps
- I could not locate the original HubSpot or Salesforce studies behind the widely repeated percentages. Treat those figures as illustrative.
- No controlled evidence on deferring an OAuth grant versus requiring it during onboarding was found.

---

## B5. Letting expert or high-intent users skip, and steering users who drift

### Takeaway
NN/g's position is that mandatory up-front onboarding costs attention and should be skippable, short, and replaced by contextual help where possible. For a conversational flow this translates to accepting direct answers, offering a visible manual path, and redirecting drift briefly and no more than a couple of times.

### Cited Findings
- SECONDARY. NN/g: tutorials "don't result in better task performance", users "frequently skip them", and information shown out of context is hard to remember. Recommendations include making help easy to dismiss and recall, using progressive disclosure, and skipping the obvious — [NN/g: Onboarding tutorials vs. contextual help](https://www.nngroup.com/articles/onboarding-tutorials/)
- SECONDARY. NN/g video title and summary: "Onboarding: Skip it When Possible"; instructions that must be digested before use "reduce usability, and should be avoided as much as possible" — [NN/g video](https://www.nngroup.com/videos/onboarding-skip-it-when-possible/)
- SECONDARY. Userpilot: onboarding checklist completion averages 19.2% across 547 companies — [Userpilot: Product metrics benchmark report](https://userpilot.com/blog/product-metrics-benchmark-report/)
- PRIMARY. Luger and Sellen document that users struggle to know what a conversational agent can do, which affects how they phrase and recover — [Microsoft Research PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/p5286-luger.pdf)
- SECONDARY. Superhuman has historically run a 30-minute human onboarding call as its default path, a counterexample where long, high-touch onboarding is the product strategy — [Lindy: Superhuman alternatives](https://www.lindy.ai/blog/superhuman-alternatives). Third-party description, not Superhuman's own page.

### Inferences
- Skip mechanics for a voice-plus-chat flow:
  - A persistent on-screen panel showing the four items and their status, each editable by click, so an expert can finish without talking.
  - Multi-slot extraction so a single message can complete several items.
  - An explicit "skip to the app" control that becomes available once required items are done, plus an agent offer to move on at that point.
- Graduation rule: exit onboarding when required slots are filled and the first value has been shown (or the user has declined Gmail and chosen sandbox or skip). Do not hold the user for remaining scripted content.
- Drift handling: answer the off-topic question briefly if it is answerable, then return with one sentence that links back to the pending item. Cap redirects at about two per item; after that, offer to skip the item or switch to the manual panel. Repeated redirection is what reads as overbearing.
- Treat a real question about privacy or the warning screen as on-topic, not drift. It deserves a full answer before re-asking.
- If the user goes silent during the popup or the call, use one check-in and then wait. Do not loop prompts.
- The Superhuman example shows that longer onboarding can work when the user has high intent and the session itself delivers value; it does not support length for its own sake.

### Gaps
- No empirical study was found on redirect frequency or tolerance in conversational onboarding. The cap suggested above is a design judgment.
- NN/g's article is qualitative and gives no task-success numbers.
- No research was found on detecting expert users automatically in conversational flows.

---

## Cross-cutting summary of what could not be confirmed

- The exact warning screen shown to allowlisted test users in Testing mode (Google pages disagree).
- PKCE support for Google "Web application" OAuth clients, from a Google primary source.
- Any sourced benchmark for OAuth consent-screen completion.
- Any independent evidence for voice onboarding outcomes.
- Any direct evidence that naming an assistant affects retention.
- Current CASA pricing from Google or the App Defense Alliance.
- AI-assistant-specific activation or time-to-value benchmarks.
