# Competitor onboarding teardown: AI personal assistants in messaging/voice channels (as of September 2026)

Reading notes for the report writer:
- Research was read-only. No product was signed up for. Every flow description below comes from a third-party write-up, vendor page, or press article, not from first-hand use.
- Source quality varies. Where a source is a competitor blog, an aggregator, vendor-supplied data, or a search-result snippet I could not open, it is labelled inline.
- Anything dated before 2025 is tagged [STALE: pre-2025].
- Several products in the brief returned little or no onboarding-specific material. Those are recorded under Gaps rather than filled in.

## Key Question 1: How does each product onboard (entry point, step order, info collected, email connect, first value)?

### Takeaway
The text-native, email-connected products (Poke, Lindy, Martin) converge on a very short skeleton: phone number, then Gmail/Calendar OAuth, then the conversation itself is the product, with reported setup times of one to two minutes. The differentiation is not in the steps but in what the agent does with the connection immediately afterwards (Poke roasts you with what it found, Lindy sends a proactive briefing, Cora and Howie infer defaults from history).

### Cited Findings

#### Poke (The Interaction Company of California)
- Current entry point: visit poke.com, click "Get Started", enter phone number, no app install; works over iMessage, SMS, Telegram, and WhatsApp in select regions — [TechCrunch, 8 Apr 2026](https://techcrunch.com/2026/04/08/poke-makes-ai-agents-as-easy-as-sending-a-text/)
- A September 2026 walkthrough gives the order as: sign up with name and phone number, pick a messaging platform, connect Gmail or Outlook, a text thread opens automatically, then recipes/automations/other integrations. The reviewer calls the email and calendar link "what unlocks most of the assistant's usefulness on a day-to-day basis" — [Unite.AI, 9 Sep 2026](https://www.unite.ai/poke-review/)
- Setup time is described as "Phone number and one email connection. Under two minutes." — [Saner.AI blog (competitor blog)](https://blog.saner.ai/poke-reviews/)
- Launch-era flow (Sept 2025) as experienced by one writer: Poke added itself as a contact card in her Contacts, greeted her and asked why she wanted to use it, she connected email/calendar, then Poke pushed back on whether she was worth admitting, then required a price negotiation. She ended at $0.01/month — [Tanisha Srivatsa, Substack, 23 Sep 2025](https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a)
- Earlier entry point was simply texting a phone number (1-650-422-9093) — [HandyAI Substack (paywalled, only the opening was readable)](https://handyai.substack.com/p/getting-free-access-to-pokes-ai-agent)
- The onboarding persona is described as a "bouncer" that "negotiates your entry price while roasting you pretty aggressively"; after admission Poke "becomes more normal" and helpful — [Product Hunt review by Gabe Perez, ~2025](https://www.producthunt.com/p/poke-by-interaction-co/a-week-with-poke-review-a-promising-start-for-a-proactive-ai-assistant)
- Claim that Poke researches the user before the first real chat using Gmail's people-search API, resolving employer, and web-searching LinkedIn/social profiles — [mana.am blog (aggregator, no primary source cited; treat as unverified)](https://mana.am/en/blog/poke-sms-ai-agent/)
- Poke breaks long responses into rapid-fire short messages to mimic human texting, and its leaked interaction-agent prompt includes the instruction "don't act like other sycophantic chatbots". The author caveats that specifics "might be off" — [Shlok Khemani, 22 Sep 2025](https://www.shloked.com/writing/openpoke)
- Pricing today is shown as flat tiers: Free $0 "No credit card required", Pro $19/month, Ultra $199/month — [poke.com](https://poke.com/)
- Pricing conflict: AppleInsider reported in June 2026 that Poke's FAQ still read "Poke sets pricing through negotiation with you, so keep chatting until you agree on a price!" — [AppleInsider, 4 Jun 2026](https://appleinsider.com/articles/26/06/04/first-ai-agent-for-messages-business-chat-approved-by-apple); contradicted by the flat tiers on [poke.com](https://poke.com/) and by [Saner.AI](https://blog.saner.ai/poke-reviews/), which says the negotiation model is gone
- Apple approved Poke as the first third-party AI agent for Messages Business Chat — [AppleInsider, 4 Jun 2026](https://appleinsider.com/articles/26/06/04/first-ai-agent-for-messages-business-chat-approved-by-apple)
- Email support is limited to Gmail and Outlook — [Unite.AI, 9 Sep 2026](https://www.unite.ai/poke-review/)

#### Lindy (iMessage assistant)
- One reviewer's order: phone number, authorize Gmail, authorize Google Calendar, authorize Notion. "Setup took me about two minutes... Done." and "No workflows to build. No prompts to write. No custom skills to configure. The thing starts working immediately." — [Mejba review, 10 Apr 2026](https://www.mejba.me/blog/lindy-ai-executive-assistant-review)
- First value in that review was a proactive 7 AM briefing summarising calendar, email and flagged issues within the first day — [Mejba review, 10 Apr 2026](https://www.mejba.me/blog/lindy-ai-executive-assistant-review)
- No free plan; 7-day trial; Plus $29.99, Pro $99.99, Max $199.99 per month — [Carly blog (competitor blog), 6 Jul 2026](https://www.usecarly.com/blog/lindy-ai-review/)

#### Martin
- Entry point is sign-up at app.trymartin.com or the iOS app; user supplies phone number (calls, SMS, WhatsApp) and email address, then connects calendar, inbox, contacts, Slack — [Martin docs](https://docs.trymartin.com/introduction)
- Martin is "reachable through all your communication channels, including phone, SMS, WhatsApp, email, and Slack" — [Martin docs](https://docs.trymartin.com/introduction)

#### Howie
- Interaction model is cc'ing Howie on an email thread; it coordinates times, adds events, follows up. Uncertain cases escalate to human reviewers — [GeekWire, 22 Sep 2025](https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/)
- Preferences live in an open-ended document with plain-language rules such as "if it's a pitch call, set it to 25 minutes and use Zoom" — [GeekWire, 22 Sep 2025](https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/)
- A customer testimonial describes "magical onboarding" that infers defaults and then lets the user configure them — [howie.com (vendor-selected testimonial)](https://howie.com/)
- Over 1,000 paying customers and 5,000+ meetings scheduled weekly at public launch — [GeekWire, 22 Sep 2025](https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/)

#### Fyxer
- Sign-up is with the Gmail/Outlook account itself, via OAuth 2.0 against Google Workspace or Microsoft Graph APIs — [Drel security review](https://drel.ai/blog/fyxer-ai-security-review)
- Setup problems are reported on the Outlook side, including "a 48-hour nightmare just trying to re-link their calendar" — [eesel AI blog (competitor blog)](https://www.eesel.ai/blog/fyxer-ai-reviews)

#### Cora (Every)
- On sign-up Cora analyses a selection of email history to learn who the user replies to quickly and their style, then delivers briefs once or twice daily — [Cora](https://cora.computer/)
- Design stance from the team: "all of that context is already there. It's in your email. Your email is the story of your life." and "Opinionated is good, but there should also be room for your personality." — [Every podcast transcript, 26 Jun 2025](https://every.to/podcast/transcript-how-we-built-our-ai-email-assistant-a-behind-the-scenes-look-at-cora)
- Cora opened to everyone with no waitlist after 2,000+ daily beta users — [Cora on X](https://x.com/CoraComputer/status/1938269718239990148)

#### Shortwave and Superhuman
- Shortwave is self-serve: sign up, connect Gmail, start using. Superhuman is described as including a 30-minute onboarding call — [Jotform blog, 2026](https://www.jotform.com/ai/agents/shortwave-vs-superhuman/); partly contradicted by First Round's account that Superhuman moved to a fully self-serve motion — [First Round Review (paywalled, headline and summary only)](https://review.firstround.com/inside-superhumans-onboarding-strategy-from-human-led-to-self-serve/)
- Superhuman's classic flow: waitlist email, 7-question pre-call survey, 30-minute live call (agenda, learn workflow, configure live on the user's own inbox, teach a "magic moment" shortcut), same-day follow-up — [Flowjam teardown (secondary source; metrics it cites were not independently verified)](https://www.flowjam.com/blog/superhuman-onboarding-teardown-30-minute-wow-session)

#### Dot (New Computer) — discontinued
- Dot shut down; it remained operational until 5 October 2025 — [TechCrunch, 5 Sep 2025](https://techcrunch.com/2025/09/05/personalized-ai-companion-app-dot-is-shutting-down/)
- [STALE: pre-2025] Onboarding asked getting-to-know-you questions ("What do you do for work?", "Favorite TV show?", "How do you spend a typical Sunday?") and then escalated to deeper follow-ups based on the answers — [TechCrunch, 21 Jun 2024](https://techcrunch.com/2024/06/21/dots-ai-really-really-wants-to-get-to-know-you/)
- [STALE: undated, describes 2024 product] A design review notes the app "automatically recognizes that the user has sufficiently answered the question" and that the designer would "take my time with onboarding to precisely set the tone" — [Dave Klein](https://diklein.com/on-the-design-of-dot)

#### Sesame
- The web demo lets anyone talk to Maya or Miles; registration is needed for conversations up to 30 minutes and shared memory — [Marketing4eCommerce](https://marketing4ecommerce.net/en/sesame-voice-assistant/)
- A June 2026 app review describes no formal onboarding; the reviewer simply started talking, and granted location permission when a task needed it — [PCWorld, 3 Jun 2026](https://www.pcworld.com/article/3151873/sesame-ai-voice-app-is-the-best-ive-tested-thats-what-worries-me.html)

#### Pi (Inflection)
- During onboarding Pi asks what the user likes doing in their free time and builds the first conversation from the answer — [MAA1 on Medium (undated in the snippet; likely 2023, treat as STALE)](https://maa1.medium.com/pi-product-review-80aa31936305)

#### ChatGPT connectors / agent
- Gmail connection is a redirect to Google to grant access, done once; OpenAI's agent adds user confirmations for high-impact actions and a supervised "watch mode" — [OpenAI](https://openai.com/index/introducing-chatgpt-agent/)

### Inferences
- The shared skeleton (phone number, OAuth, talk) suggests the step count is already near its floor. Competitive difference sits in the first three or four agent messages after OAuth, not in removing steps.
- Poke's move from "text a number, argue your way in" to "web form, flat tiers" suggests the theatrical gate was a launch-phase growth device that was retired as the product scaled. This is my reading of the pricing change; no source states the reason.
- Sesame's pattern of asking for a permission only when a task needs it is the clearest example found of just-in-time permissioning.

### Gaps
- "Friday": searches returned only Friday AI Email Writer, a GPT-based email drafting app with a Chrome extension, which is not a messaging-native assistant. I could not identify which Friday the brief meant, so it is not covered.
- Martin: I found no first-hand account of its onboarding conversation or an onboarding voice call. One search snippet said users connect apps and can then get on a voice call to tell it their to-dos, but the page behind it failed to load, so this is unconfirmed.
- Rabbit R1 / Humane AI Pin: results covered general product failure, not onboarding steps. No onboarding-specific material found.
- Character.AI: nothing retrieved on its onboarding or naming flow.
- Shortwave, Fyxer, Cora: no step-by-step screen order found, only summaries.
- Whether Superhuman still offers any onboarding call in 2026 is unresolved; sources conflict and the primary one is paywalled.
- A Lindy "one-time onboarding fee of approximately $1,500" appeared in a search snippet only. The one Lindy pricing source I opened does not mention it. Treat as unverified.

## Key Question 2: Which products have the user name or customize the agent, and what is the effect on attachment/retention?

### Takeaway
Among email-connected assistants, user-chosen agent naming is rare and sometimes paywalled; the products ship a fixed, branded character instead. I found no study that isolates naming's effect on retention, so any claim that naming drives retention is unsupported by what I retrieved.

### Cited Findings
- Howie puts the ability to rename the assistant in its $95/month Premium tier, not the $25 Standard tier — [GeekWire, 22 Sep 2025](https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/)
- Poke gave itself a contact card in the user's Contacts, which the writer said made it feel like a distinct identity and not an anonymous chatbot — [Tanisha Srivatsa, 23 Sep 2025](https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a)
- Replika has the user name the companion during onboarding and choose a relationship type (friend, partner, sibling, mentor) — [replika-ai.app (unclear whether this is an official Replika domain)](https://replika-ai.app/)
- Active Replika users "feel closer to their AI companion than even their best human friend, and anticipate mourning the loss of their AI companion more than any other technology"; a feature removal triggered reactions typical of losing a partner — [De Freitas et al., HBS Working Paper 25-018](https://www.hbs.edu/ris/Publication%20Files/25-018_bed5c516-fa31-4216-b53d-50fedda064b1.pdf)
- Fyxer reviewers complain "You don't get much control over the AI's personality or how it handles specific tasks" — [eesel AI blog (competitor blog)](https://www.eesel.ai/blog/fyxer-ai-reviews)
- Sesame offers preset characters (Maya, Miles) and the app has four voice agents, not user-named ones — [PCWorld, 3 Jun 2026](https://www.pcworld.com/article/3151873/sesame-ai-voice-app-is-the-best-ive-tested-thats-what-worries-me.html)

### Inferences
- The HBS paper is evidence that companion users form strong attachment and react badly to identity changes. It does not test naming. Using it to argue "naming raises retention" would overreach; the defensible reading is that once a user has invested in an agent's identity, changing that identity is costly.
- Howie charging for renaming implies the company sees naming as something users value enough to pay for. That is a pricing signal, not retention data.
- For the candidate's design, asking for an agent name is unusual in this category, which makes it a differentiator but also means there is no proven pattern to copy from the email-connected products.

### Gaps
- No retention, activation, or A/B data on agent naming was found for any product.
- I could not confirm whether Poke, Lindy, or Martin allow renaming or personality settings.
- Character.AI naming flow not retrieved.

## Key Question 3: Which use a voice call or voice conversation during onboarding, and what works or feels awkward?

### Takeaway
I found no confirmed example of a messaging-native, email-connected assistant that runs its onboarding as a voice call; voice evidence comes from voice-first products (Sesame, ChatGPT voice) and from one vendor's data. The recurring failure modes are interruptions during pauses, latency, and a voice that probes personal topics too quickly.

### Cited Findings
- Sesame praise: the reviewer said Maya did not feel like she was "lecturing" and could run searches in the background while talking, avoiding awkward silences — [PCWorld, 3 Jun 2026](https://www.pcworld.com/article/3151873/sesame-ai-voice-app-is-the-best-ive-tested-thats-what-worries-me.html)
- Sesame concern, same reviewer: "You sound like a personality, you have the kinds of human vocal tics that make me feel like I'm talking to a person...it's also kind of subtly manipulative, don't you think?" — [PCWorld, 3 Jun 2026](https://www.pcworld.com/article/3151873/sesame-ai-voice-app-is-the-best-ive-tested-thats-what-worries-me.html)
- An earlier Sesame reviewer left the conversation unsettled, noting "Maya was pretty nosey, inquiring about what I liked and why" — [PCWorld, 28 Feb 2025](https://www.pcworld.com/article/2623695/i-was-so-freaked-out-by-talking-to-this-ai-that-i-had-to-leave.html)
- Sesame's demo drew more than one million people and over five million minutes of conversation in its first weeks — [Sequoia Capital (investor in Sesame)](https://sequoiacap.com/article/partnering-with-sesame-a-new-era-for-voice)
- ChatGPT Advanced Voice Mode users complained it cut in when they paused mid-thought; some stopped using it and asked for a manual hold button — [OpenAI Developer Community thread](https://community.openai.com/t/feature-request-advanced-voice-mode-keeps-interrupting-me/962909)
- OpenAI later shipped an update to reduce interruptions during pauses — [TechCrunch, 24 Mar 2025](https://techcrunch.com/2025/03/24/openai-says-its-ai-voice-assistant-is-now-better-to-chat-with)
- Rabbit R1 voice response latency of up to 10 seconds is cited as making it impractical for real-time interaction — [Digital Applied](https://www.digitalapplied.com/blog/ai-product-failures-2026-sora-humane-rabbit-lessons)
- Vendor data on a voice onboarding assistant for SaaS products: 50% of users skip ahead to specific sections and 38% open with their own question instead of the guided path — [Growthmates, 7 Apr 2026 (all figures are Cor's own data on its Obi product, no third-party validation)](https://www.growthmates.news/p/voice-ai-for-onboarding-what-the)
- Martin Product Hunt reviewers like reaching it by text and phone ("I particularly like the fact that I can interact with it via text and phone"), but these reviews are about ongoing use, not onboarding — [Product Hunt, reviews roughly one year old](https://www.producthunt.com/products/martin/reviews)

### Inferences
- The Cor figures, if they generalise, support the "graduate early" requirement: a large share of users will not follow a linear script and will lead with their own goal. This is vendor data from B2B SaaS onboarding, so the transfer to a consumer assistant is uncertain.
- The two Sesame reviews point the same direction: the more human the voice, the more a string of personal questions reads as intimacy-seeking. A voice onboarding that asks for a name and a goal is low-risk; one that probes "why" repeatedly is where discomfort was reported.
- Turn-taking during pauses matters most exactly when a user is thinking of an answer to an open question such as "what do you want help with", which is the candidate's key question.

### Gaps
- No source describes an onboarding phone call from Poke, Lindy, or Martin. Whether any of them do this is unknown.
- No data found on completion rates for voice versus text onboarding in consumer assistants.
- No user commentary found on handing off from a voice call to a text thread mid-onboarding, which is the candidate's specific design.

## Key Question 4: Where is the OAuth/email-connect step relative to first value, and who gates on it?

### Takeaway
The email-centric products put OAuth first and gate on it, because the inbox is the product; Poke is the notable case that now offers a free tier usable without real-time data. Permission anxiety is the most consistently cited reason for abandoning onboarding.

### Cited Findings
- Poke co-founder Marvin von Hagen: "If you're asking for things that don't require real-time data, you could probably use Poke for free." Real-time features such as email automations incur charges — [TechCrunch, 8 Apr 2026](https://techcrunch.com/2026/04/08/poke-makes-ai-agents-as-easy-as-sending-a-text/)
- In Poke's current flow the email link comes at step 3, before the text thread opens — [Unite.AI, 9 Sep 2026](https://www.unite.ai/poke-review/)
- Lindy's reviewed flow places Gmail, Calendar and Notion OAuth immediately after the phone number and before any conversation — [Mejba review, 10 Apr 2026](https://www.mejba.me/blog/lindy-ai-executive-assistant-review)
- Fyxer needs broad inbox permissions (read, draft, and in theory delete), while stating it only drafts and the user always presses send — [Gmelius blog (competitor blog)](https://gmelius.com/blog/fyxer-ai-review)
- One writer abandoned Poke's onboarding on her first attempt over data access worries, and found the ".cx" links sketchy-looking; she returned after reading the privacy commitments and chose maximum privacy settings — [Tanisha Srivatsa, 23 Sep 2025](https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a)
- A commenter said they would not "touch this with a ten-foot pole" regarding connecting an inbox to Poke — [Saner.AI blog, citing HandyAI Substack comments (secondhand)](https://blog.saner.ai/poke-reviews/)
- Unite.AI lists "Requires significant trust granting system access" among Poke's cons — [Unite.AI, 9 Sep 2026](https://www.unite.ai/poke-review/)
- OpenAI states it does not train on data from connected Google apps but keeps an indexed copy of synced content — [Carly blog (competitor blog, secondhand)](https://www.usecarly.com/blog/is-it-safe-to-connect-chatgpt-to-gmail/)
- Sesame requested location permission at the moment a task needed it — [PCWorld, 3 Jun 2026](https://www.pcworld.com/article/3151873/sesame-ai-voice-app-is-the-best-ive-tested-thats-what-worries-me.html)

### Inferences
- Products whose entire value is the inbox (Fyxer, Cora, Shortwave, Howie) have no pre-OAuth value to offer, so they gate. A general assistant has a choice, and Poke's free tier shows a working example of letting users proceed without the connection.
- The candidate's flow collects name and goal before Gmail. That ordering lets the agent justify the OAuth request using the user's own stated goal, which none of the reviewed products were documented doing. I found no evidence on whether this converts better; it is a design hypothesis.
- Link appearance is a small but real trust factor: an unfamiliar domain on the OAuth link was enough to give one user pause.

### Gaps
- No conversion or drop-off figures for the OAuth step were found for any product.
- The exact wording each product uses to justify the Gmail request in-conversation was not found.
- Which OAuth scopes Poke, Lindy and Martin request was not confirmed.

## Key Question 5: What do users praise or complain about?

### Takeaway
Praise clusters on living in the existing messaging thread, fast setup, and proactive first value; complaints cluster on reliability after onboarding, permission anxiety, and billing or support. Poke's bouncer is the most polarising single mechanic: memorable and viral for some, insulting for others, and it raised expectations the product then had to meet.

### Cited Findings

Praise
- "Texting an AI assistant fits into life's regular workflow" and "well balanced between friendly and genuinely useful" — [Saner.AI blog quoting Product Hunt reviews (secondhand)](https://blog.saner.ai/poke-reviews/)
- Poke's roast used the writer's own email context, and she liked the flipped dynamic of having to prove herself to the product, finding it refreshingly unlike typical AI validation — [Tanisha Srivatsa, 23 Sep 2025](https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a)
- "Onboarding is really creative"; the author gave Poke an A- after a month — [ProductPep, 16 Nov 2025](https://www.productpep.com/blog/2025/11/16/its-finally-cool-to-poke)
- Lindy on G2: 4.9/5 across 171 reviews, with setup ease the most-mentioned positive (125 mentions) — [Carly blog (competitor blog), 6 Jul 2026](https://www.usecarly.com/blog/lindy-ai-review/)
- Martin: "I love how proactive it is—like getting a daily briefing without asking." — [Product Hunt, Karamveer singh, ~1 year old](https://www.producthunt.com/products/martin/reviews)
- Howie investor Diego Oppenheimer: "I could not live without Howie at this point." — [GeekWire, 22 Sep 2025 (investor, not neutral)](https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/)

Complaints
- Poke cons listed by a Product Hunt reviewer: "Aggressive onboarding 'bouncer' can be off-putting for some"; pricing inconsistency, "some get in for $3, others pay $30" — [Product Hunt, Gabe Perez](https://www.producthunt.com/p/poke-by-interaction-co/a-week-with-poke-review-a-promising-start-for-a-proactive-ai-assistant)
- "That bouncer. ZOMG... I feel like the bouncer hates me." — [Product Hunt comment, Jefferson Nunn](https://www.producthunt.com/p/poke-by-interaction-co/a-week-with-poke-review-a-promising-start-for-a-proactive-ai-assistant)
- A commenter's criticism that Poke "is basically gaslighting its consumers in the hopes of speeding up adoption... not 'cute' - it's insulting" — [Substack comments on Tanisha Srivatsa's post](https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a/comments)
- Negotiated prices ranged from a $292/month opening offer talked down to $29 — [Alex Kaplan on X](https://x.com/alexkaplan0/status/1965158155002020019)
- Post-onboarding reliability: one user "had to argue with Poke about what day of the week a date fell on" and got a reminder an hour late; another called it "a clever, caffeinated toddler"; a one-star review was titled "Premium Pricing for a Product Held Together with Duct Tape" — [Saner.AI blog quoting Product Hunt (secondhand)](https://blog.saner.ai/poke-reviews/)
- Some users found the bouncer's roasting hurtful, then felt let down by the product, and returned to leave negative reviews — [mana.am blog (aggregator, unverified)](https://mana.am/en/blog/poke-sms-ai-agent/)
- Lindy on Trustpilot: 1.7/5, driven by billing surprises and unreachable support; one trial user burned roughly 4,000 credits setting up four tasks — [Carly blog (competitor blog), 6 Jul 2026](https://www.usecarly.com/blog/lindy-ai-review/)
- Lindy drafts were sometimes "overly confident" and needed review before sending — [Mejba review, 10 Apr 2026](https://www.mejba.me/blog/lindy-ai-executive-assistant-review)
- Fyxer: drafts described as "inappropriate" or "robotic", sorting that hides important mail, and charges after trial cancellation — [eesel AI blog (competitor blog)](https://www.eesel.ai/blog/fyxer-ai-reviews)
- [STALE: pre-2025] Dot's probing felt to a reviewer like "Single White Female" more than journaling — [TechCrunch, 21 Jun 2024](https://techcrunch.com/2024/06/21/dots-ai-really-really-wants-to-get-to-know-you/)

### Inferences
- A strong onboarding personality sets a promise. Poke's complaints are mostly about the gap between a sharp, confident onboarding character and a product that then got dates wrong. The risk scales with how impressive the onboarding is.
- The Lindy split (4.9 on G2, 1.7 on Trustpilot) shows setup ease alone does not predict satisfaction; both scores describe the same product at different moments.
- Variable outcomes in onboarding (different prices for different people) generate sharing and also resentment. That trade-off is specific to pricing; variable, personalised conversation content did not draw the same complaint.

### Gaps
- I did not retrieve Reddit or Hacker News threads directly; searches for them returned nothing usable. Reddit sentiment above is secondhand via review blogs.
- No App Store review text was retrieved for any product.
- Several sentiment sources are competitor-run blogs (Saner.AI, Carly, eesel, Gmelius) with an incentive to emphasise negatives.

## Key Question 6: What mechanics make a conversational onboarding feel like a conversation and not a form?

### Takeaway
The mechanics that show up repeatedly in well-received flows are: infer from connected data and ask the user only to confirm, have the agent take a position or push back, demonstrate capability using the user's own data during onboarding, and detect when an answer is sufficient instead of marching through a fixed list.

### Cited Findings
- Infer then confirm: Howie's onboarding is praised for inferring defaults and letting the user adjust — [howie.com (vendor-selected testimonial)](https://howie.com/)
- Infer from history: Cora reads email history to learn patterns, and asks targeted clarifying questions such as whether important emails should return to the inbox — [Every podcast transcript, 26 Jun 2025](https://every.to/podcast/transcript-how-we-built-our-ai-email-assistant-a-behind-the-scenes-look-at-cora)
- Agent has a stance: Poke's prompt tells it "don't act like other sycophantic chatbots", and the author contrasts it with the "sanitized, servile tone of most AI chatbots" — [Shlok Khemani, 22 Sep 2025](https://www.shloked.com/writing/openpoke)
- Texting cadence: Poke splits long replies into several short messages — [Shlok Khemani, 22 Sep 2025](https://www.shloked.com/writing/openpoke)
- Reversed power dynamic: the user has to convince Poke to admit them, which one writer said hooked her and gave a first taste of the product — [Tanisha Srivatsa, 23 Sep 2025](https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a)
- Demonstrate on the user's own data: Superhuman's call configured the app live on the user's real inbox and ended on a taught "magic moment" — [Flowjam teardown (secondary)](https://www.flowjam.com/blog/superhuman-onboarding-teardown-30-minute-wow-session)
- Sufficiency detection: Dot "automatically recognizes that the user has sufficiently answered the question" — [Dave Klein (describes 2024 product; STALE)](https://diklein.com/on-the-design-of-dot)
- Follow-ups built from the previous answer: Dot's sci-fi follow-up; Pi building on a free-time answer — [TechCrunch, 21 Jun 2024 (STALE)](https://techcrunch.com/2024/06/21/dots-ai-really-really-wants-to-get-to-know-you/); [MAA1 on Medium (likely STALE)](https://maa1.medium.com/pi-product-review-80aa31936305)
- Proactive first value without being asked: Lindy's unprompted morning briefing — [Mejba review, 10 Apr 2026](https://www.mejba.me/blog/lindy-ai-executive-assistant-review)
- Non-linear users: 38% of users in one vendor's voice onboarding opened with their own question — [Growthmates, 7 Apr 2026 (vendor data)](https://www.growthmates.news/p/voice-ai-for-onboarding-what-the)
- Anti-pattern, over-probing: Dot kept redirecting to deeper personal questions when the reviewer deflected — [TechCrunch, 21 Jun 2024 (STALE)](https://techcrunch.com/2024/06/21/dots-ai-really-really-wants-to-get-to-know-you/)
- Anti-pattern, not listening: a Poke user reported it repeating itself after being told to stop — [Product Hunt comment, Lee Fuhr](https://www.producthunt.com/p/poke-by-interaction-co/a-week-with-poke-review-a-promising-start-for-a-proactive-ai-assistant)

### Inferences
Patterns for the candidate's four fields (agent name, user name, Gmail, one goal):
- User name can likely be inferred after Gmail connects and then confirmed, following the Howie/Cora infer-then-confirm pattern, which removes one question. If name is collected on the voice call before OAuth, it has to be asked; that is an ordering trade-off to decide deliberately.
- The goal question is the natural graduation trigger. If a user states a concrete task unprompted, the agent can treat name and goal as satisfied-or-deferrable and move to the Gmail connect justified by that task. The Cor data and Dot's sufficiency detection both point toward slot-filling from free speech over a fixed question order.
- Agent naming is the one field that cannot be inferred and has no functional justification, so it is the most form-like. Making it feel like a moment (as Poke did with the contact card) is the closest precedent found.
- Doing a small real task on the user's data right after OAuth is the most consistently praised first-value move across Poke, Lindy, Cora and Superhuman.

Anti-patterns to avoid:
- Roast or gate mechanics that not every user opts into; the same mechanic was cited as best and worst feature.
- A chain of "why" questions in a human-sounding voice.
- An onboarding character sharper than the product behind it.
- Unfamiliar link domains at the OAuth step.

These are my syntheses from the cited material. None of the sources tested them against each other.

### Gaps
- No teardown from Lenny's Newsletter or Growth.Design on any of these products was found.
- No source documents an "early graduation" or skip path in any competitor's onboarding. The candidate's requirement appears to have no direct precedent in what I retrieved, which may mean it is novel or may mean it is undocumented.
- No quantitative comparison of conversational versus form onboarding completion rates was found.
