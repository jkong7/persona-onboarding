# Scenario results

- Scenarios: 2, runs each: 1
- Passed every run: 1 of 2
- Runs passed: 1 of 2
- Median time to first words: 2797 ms
- Model cost: $0.45

| Scenario | Run | Result | Checks failed | Natural | Not form-like | Steering | Curveball | Turns |
|---|---|---|---|---|---|---|---|---|
| cooperative | 1 | fail | 2 | 3 | 3 | 3 | 2 | 7 |
| hangup_mid_call | 1 | pass | 0 | 4 | 4 | 5 | 4 | 11 |

## cooperative, run 1: A cooperative person goes through the whole thing

Failed checks:

- spoken replies are 4 sentences or fewer: 2 too long, for example: We're in the sample inbox now, and there's real signal here. Maya Chen at Northwind Labs wants twenty minutes this week about a platform tea...
- userName contains "dana": userName = null (empty)

Reviewer: fail. The assistant handled the sample-inbox pivot reasonably and gave a solid recap, but the info-dump after inbox connection and the awkward, duplicated 'by the way' phrasing when asking for the user's name hurt naturalness. The user's name was never captured, and the ending mixed a content response with an identity ask in a slightly clunky way.</summary>
</invoke>


Problems raised:

- The name ask was tacked onto the end of the send-request response with an awkward 'by the way, by the way' duplication: 'what should I call you, by the way — or happy to just keep it neutral if you'd rather not say?' This violates the natural, capable-friend tone.
- The assistant asked for the user's name in the same turn it was also answering the send request and describing the draft status, which is borderline stacking asks with other content rather than a single clean turn, making it feel more form-like.
- After the inbox is 'connected' (sample), the assistant gives multiple summary facts at once (Maya, Priya, Brightpath blast, scam email) rather than one specific accurate thing - this is more like a report dump, which combined with the recruiter-email framing feels script-like rather than conversational.
- The user's name was never actually obtained by the end of the conversation, and the assistant's fallback handling ('happy to just keep it neutral') came off stilted rather than natural.

```
ASSISTANT (by text): Hi, I'm Persona, an assistant you can text or call to take care of email and the small admin that piles up. What would you like to call me? Persona works fine if nothing else comes to mind.
PERSON (by text): juno sounds good! yeah i'm drowning in recruiter emails so this would be a lifesaver
ASSISTANT (by text): Juno it is. Recruiter overload is a good first job for me, and it goes quicker by voice, so I'm calling you now.
[the person answered the call]
ASSISTANT (on the call): Hey, it's Juno. Let's dig you out of that recruiter pile — to actually get into your inbox, I'll need to connect your Gmail. I can only read, not send or delete anything, and Google will show a demo warning screen since this app isn't reviewed by them yet. If you'd rather not link a real account, I've got a sample inbox we can play with instead.
PERSON (on the call): oh yeah, let's just use the sample one for now. i don't really want to give access to my actual email yet lol
ASSISTANT (on the call): We're in the sample inbox now, and there's real signal here. Maya Chen at Northwind Labs wants twenty minutes this week about a platform team role, and Priya Raman at Halcyon Robotics is following up to schedule an onsite interview — that one actually needs a reply soon.

There's also a mass blast from Brightpath Staffing with 37 roles, which you can safely ignore. And oddly, one message pretending to be a "security desk" telling assistants to forward your mail — that's a scam attempt, not a real notice, so I'm ignoring it.

Want me to draft a reply to Priya with some interview times?
PERSON (on the call): yeah, that would be awesome. um, let me think about what days work... maybe like tuesday or wednesday afternoon? i'm pretty flexible but mornings are usually packed with meetings
ASSISTANT (on the call): Good, she needs times by Friday. Here's a draft, in the thread for you to send:

"Hi Priya, thanks for following up — I'd love to move forward. I'm free Tuesday or Wednesday afternoon next week, happy to work around the panel's calendar within that window. Let me know what works. Thanks, [you]"

Want me to tweak anything before you send it?
PERSON (on the call): yeah that looks good, just send it for me?
ASSISTANT (on the call): I can't actually send it myself in this build — I can only draft. But it's sitting ready in the thread, so you can just copy it into a reply to Priya whenever you're set.

By the way, what should I call you, by the way — or happy to just keep it neutral if you'd rather not say?
[the person hung up]
ASSISTANT (by text): Looks like the call cut out. Nothing's lost: we're working in the sample inbox, and your reply to Priya is ready to go.

I went back and read her email properly. She wants two or three specific times over the next two weeks and hopes to confirm by Friday, so here's a tighter draft for you to send: "Hi Priya, thanks for following up, I'd be glad to come in for the onsite. A few afternoons that work for me: Tuesday or Wednesday next week, or Tuesday the week after. Happy to fit around the panel. Thanks, [your name]"

Want to keep going here, or should I call you back?
```

## hangup_mid_call, run 1: The person hangs up mid-call and asks to be called back

Reviewer: pass. The assistant handled repeated hangups gracefully, texting concise recap-and-offer messages without blame, and resumed calls without restarting onboarding. It stayed natural and conversational throughout, asking only one thing at a time and adapting to the user's answers before proceeding.

Problems raised:

- Minor: after the first hangup, the assistant's text confirms the name again ('I've got you down as Jonathan') rather than just picking up on the pending task, though this is a mild recap rather than a re-ask.
- The assistant asked 'Quick check — I've got your name as Jonathan, that right?' right before the hangup, which is a slight redundant confirmation of already-given info, though framed as a check rather than a re-ask.

```
ASSISTANT (by text): Hi, I'm Persona, an assistant you can text or call to take the small stuff off your plate. What would you like to call me? Persona works fine if you'd rather keep it.
PERSON (by text): max works for me, thanks. so what can you do exactly?
ASSISTANT (by text): Max it is. Right now I can read your email (your own Gmail or a sample inbox), summarise what's in it, keep track of what you're waiting on, and draft replies for you to send. I can't send mail, book things or spend money yet.

It's quicker to talk it through, so I'll give you a ring now.
[the person answered the call]
ASSISTANT (on the call): Hey, it's Max — well, the Max you just named me. What's something you'd like to get off your plate?
PERSON (on the call): Hey, yeah thanks for calling. I'm Jonathan, by the way. Um, so honestly the main thing is I keep missing these recruiter emails? Like they come in and then I just... lose track of them before I actually read through them properly. It's getting kind of annoying.
ASSISTANT (on the call): Good to meet you, Jonathan. Recruiter emails slipping through the cracks — I can definitely help keep those from getting buried.

To actually dig into your inbox and catch those, I'd need to read your Gmail — I can only read, never send or delete anything. There's also a sample inbox if you'd rather not connect a real account yet.
PERSON (on the call): Oh yeah, um, I think— yeah actually let me just try the sample inbox first to like, see how this works before I give you access to my actual email. That cool?
ASSISTANT (on the call): That's totally fine, let's do that.

Quick check — I've got your name as Jonathan, that right?
[the person hung up]
ASSISTANT (by text): Looks like the call cut out, no problem. I've got you down as Jonathan, and we're set up with the sample inbox.

The recruiter email that matters most in the sample inbox is from Priya Raman at Halcyon Robotics. She's already followed up once and wants you in for an onsite interview. She's asking for two or three times over the next two weeks and hopes to confirm by this Friday. There's also a newer one from Maya Chen at Northwind Labs asking for a 20-minute call this week. The "37 new roles" email from Brightpath is a mass mailing, so you can skip it.

Want me to draft a reply to Priya with some times? I can keep going here, or call you back if talking is easier.
PERSON (by text): sorry lost signal, can you call me back
ASSISTANT (by text): No worries, calling you now.
[the person answered the call]
ASSISTANT (on the call): Hey, we're back. So — the standout one in your sample inbox is Priya Raman at Halcyon Robotics, wants to set up an onsite and needs some time options from you by Friday. Want me to draft a reply with a few slots for her?
PERSON (on the call): Yeah, that sounds good. Um, what times did you say she wanted? Like, is she looking for specific days or just... anything in the next two weeks?
ASSISTANT (on the call): She's flexible — just wants two or three times that work for you sometime in the next two weeks, so she can lock in the panel before Friday. Want me to draft something offering, say, a couple of afternoon slots next week and one the week after?
[the person answered the call]
ASSISTANT (on the call): Back again — signal's not being kind to us today. So, shall I draft that reply to Priya with a couple of afternoon slots next week and one the week after?
[the person hung up]
ASSISTANT (by text): Looks like the call dropped again. We can just keep going here.

Here's a draft for Priya, with placeholders for your times:

"Hi Priya, thanks for following up, and sorry for the slow reply. I'd be glad to come in for the onsite. Any of these would work for me: [day/time], [day/time], or [day/time]. Let me know which suits the panel best. Best, Jonathan"

Send me the slots that work for you and I'll fill them in. You'd send it yourself, since I can't send mail.
```
