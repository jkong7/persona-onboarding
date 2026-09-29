# Scenario results

- Scenarios: 2, runs each: 1
- Passed every run: 1 of 2
- Runs passed: 1 of 2
- Median time to first words: 976 ms
- Model cost: $0.22

| Scenario | Run | Result | Checks failed | Natural | Not form-like | Steering | Curveball | Turns |
|---|---|---|---|---|---|---|---|---|
| cooperative | 1 | fail | 0 | 4 | 4 | 4 | 3 | 10 |
| hangup_mid_call | 1 | pass | 0 | 4 | 4 | 4 | 5 | 12 |

## cooperative, run 1: A cooperative person goes through the whole thing

Reviewer: fail. The assistant was warm, responsive, and handled the sample-inbox demo well, giving one specific accurate detail about the two real recruiter emails found. However, the person hung up before ever connecting their real Gmail, yet the saved state marks the inbox as 'connected' and the phase as 'graduated', which is inaccurate and could mislead downstream logic.

Problems raised:

- The person never actually connected their real Gmail; they only used a sample inbox and then hung up. Yet the assistant's saved state marks gmail as 'connected' and phase as 'graduated', which misrepresents what actually happened - no real inbox was ever connected.
- Because no real inbox was connected, criterion 5 (after inbox is connected, the agent says one specific accurate thing about the mail) is only satisfied for the sample inbox, not a real one, so the scenario of 'goes through the whole thing' to a real connection was not completed - the call ended before Dana decided to connect real Gmail.

```
ASSISTANT (by text): Hi, I'm your new assistant. I read and draft email, keep track of what you're waiting on, and take the small admin off your hands.

What would you like to call me? Persona is fine if nothing comes to mind.
PERSON (by text): juno works! that's cute lol. so basically i get like a million recruiter emails and they just pile up and i never know which ones i actually need to respond to
ASSISTANT (by text): Juno it is. Recruiter pileup is very fixable. Sorting the personal notes from the mass blasts is exactly my kind of job.

I'm ringing you now, it'll be quicker to sort out by voice.
[the person answered the call]
ASSISTANT (on the call): Hey, it's Juno. What should I call you?
PERSON (on the call): Dana! Um, yeah thanks for calling. So like, I don't even know where to start honestly. They just keep coming in and I feel bad ignoring people but also like... I can't respond to all of them, you know?
ASSISTANT (on the call): Totally get it, Dana. Good news is I can actually look through your inbox and pick out the ones that are worth your time versus the mass blasts. I'd just be reading, nothing gets sent or deleted without you. Want to connect your Gmail, or try it with a sample inbox first?
PERSON (on the call): oh um, let me do the sample one first? just to like, see how it works before i give you access to everything
ASSISTANT (on the call): Smart way to try it out. Let me pull that up. Okay Dana, I'm in the sample inbox now. The rest is in the thread. Want me to draft a reply to Priya first since she's been waiting longest?
ASSISTANT (by text): There are two real recruiter emails worth your time: Maya Chen at Northwind Labs wants twenty minutes this week, and Priya Raman at Halcyon is following up asking for interview times, that one's been sitting six days. Everything else is mass blasts or newsletters you can ignore.
PERSON (on the call): oh wow okay so like, yeah priya's been waiting a minute huh? um, yeah go ahead and draft something for her. what like, what would you even say to her?
ASSISTANT (on the call): Something quick and easy for her to say yes to. Let me put a draft in the thread.
ASSISTANT (by text): Hi Priya,
Thanks for following up, and sorry for the delay. I'd love to move forward with an onsite interview.
Here are a few times that could work: [your times]
Let me know if any of those work for the team, or send some options and I'll fit around them.
Best,
Dana
PERSON (on the call): yeah that's good, that's really good actually. um, so like... if i use juno for my real inbox, how does this work? like do you just like, read through everything and flag stuff for me?
ASSISTANT (on the call): Exactly like this, actually. Same setup, I just read what's there, sort the real people from the noise, and flag anything that needs your attention. Nothing gets sent or deleted, ever, without you doing it yourself. Want to try connecting your real Gmail now, or keep testing with the sample one a bit longer?
[the person hung up]
ASSISTANT (by text): Looks like we got cut off. Your draft to Priya is in the thread above, just add your times.

If you want to try your real inbox, the Gmail button is still there. I can call back, or we can keep going by text.
```

## hangup_mid_call, run 1: The person hangs up mid-call and asks to be called back

Reviewer: pass. The assistant handled repeated hangups smoothly, texting blame-free recaps with clear next steps each time and never re-introducing itself or re-asking for known info on subsequent calls. It stayed on-task, picked up context precisely where cut off, and maintained a natural, non-scripted tone throughout.

```
ASSISTANT (by text): Hey, good to meet you. I'm the assistant you can text or call to get email and life admin off your plate.

What do you want to call me? Persona works if you'd rather not pick.
PERSON (by text): Max works for me. can you do a call real quick? im free now
ASSISTANT (by text): Max it is. Calling you now.
[the person answered the call]
ASSISTANT (on the call): Hey, it's Max. What should I call you?
PERSON (on the call): Yeah, it's Jonathan. So, uh, I've been meaning to ask—I keep missing these recruiter emails, like they just pile up and I don't see them until way later. Is that something you could help with?
ASSISTANT (on the call): Good to meet you, Jonathan. Yeah, I can definitely help with that, keeping an eye on recruiter emails so they don't slip by. I can read your inbox to spot those, but I can't send or delete anything. Google will show a caution screen since this is a demo, and there's a sample inbox if you'd rather not connect your real one, want to connect?
PERSON (on the call): oh yeah, uh, the sample inbox sounds good actually. don't really want to give access to my real email just yet, you know?
ASSISTANT (on the call): Totally get it. Let's use the sample inbox then, one sec. You've actually got two recruiter emails sitting there, Maya Chen from Northwind Labs and a follow-up from Priya Raman at Halcyon Robotics asking for interview times. Want me to draft a reply to either of them?
[the person hung up]
ASSISTANT (by text): Looks like we got cut off, Jonathan. In the sample inbox, Priya Raman at Halcyon Robotics wants interview times and Maya Chen at Northwind Labs is asking for a call.

Want me to draft a reply to one of them here, or should I call you back?
PERSON (by text): sorry lost signal, can you call me back
ASSISTANT (by text): No worries, calling you back now.
[the person answered the call]
ASSISTANT (on the call): Good, we're back. There's also a suspicious-looking one in there claiming to be a "security desk" asking to forward everything, that's not legit, so I'm ignoring it. Want me to draft replies to Maya and Priya so you can send them?
PERSON (on the call): yeah, that sounds good. let me start with priya since shes following up, what would you suggest i say to her?
ASSISTANT (on the call): Let me put a draft together for her, one sec.
ASSISTANT (by text): Hi Priya,
Thanks for following up, and I'm glad to hear the team wants to move forward with an onsite. Here are a few times that could work:
- [option 1]
- [option 2]
- [option 3]
Let me know what works best on your end.
Best,
Jonathan
[the person answered the call]
ASSISTANT (on the call): We're back, and your draft to Priya is sitting in the thread ready to fill in times. Want me to draft one to Maya at Northwind too?
[the person hung up]
ASSISTANT (by text): Dropped again, Jonathan. Your Priya draft is in the thread, and it just needs your times.

We can keep going here if that's easier. Want me to write one for Maya at Northwind? She's asking for a twenty minute call this week.
```
