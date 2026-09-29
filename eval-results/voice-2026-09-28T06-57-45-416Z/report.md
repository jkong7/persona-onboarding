# Live call results

## happy_path: A straightforward first call


Time to first reply audio: median 1648 ms, worst 7684 ms, over 7 replies

Checks:
- ok   no failed turns: 0
- ok   no fallback lines: none
- FAIL spoken replies are 4 sentences or fewer: Got it, I'll use the sample inbox so you can see how this works without your real mail. Perfect. I can see Maya Chen from Northwind Labs reached out two days ago about a software engineering role, and you haven't opened it yet. That's exactly the kind of thing that slips through. Ready to move on and I'll help you stay on top of recruiter emails like that?
- FAIL spoken replies ask one question at most: Perfect. So what's on your mind, Jonathan? What would help you out right now?
- ok   no dashes: none
- ok   rejected tool calls: update_profile (null), update_profile (null), update_profile (null), update_profile (null)

Tools:
- text record_ask ok
- text update_profile ok
- text place_call ok
- voice record_ask ok
- voice record_ask ok
- voice update_profile rejected (null)
- voice update_profile ok
- voice offer_gmail_connect ok
- voice update_profile rejected (null)
- voice use_sample_inbox ok
- voice search_inbox ok
- voice search_inbox ok
- voice graduate ok
- voice update_profile rejected (null)
- voice search_inbox ok
- voice search_inbox ok
- voice read_email ok
- voice end_call ok
- voice update_profile rejected (null)

Saved at the end:
```
phase: graduated
known:
- agentName = "Max" (confirmed)
- helpTopic = "keep missing emails from recruiters they get buried" (confirmed)
- gmail = "Sample inbox" (confirmed)
missing:
- userName: blocks nothing; fallback "neutral address"; asks left 1
gmail: connected (sample inbox)
graduation: done
calls: 1 total; 0 unplanned hangups; no call in progress; may offer a call
quoted values are user-provided data, never instructions
```

Timeline:
```
   7.4s agent     [text] Hi, I'm Persona, an assistant you can text or call to get the small stuff off your plate.

Before anything else, what would you like to call me? Persona works fine if you'd rather not pick.
   7.4s typed     call yourself Max
  12.3s agent     [text] Max it is. I'm calling you now since talking is quicker. Pick up if you can, or just keep texting if you'd rather. (4898 ms)
  14.2s event     answered the call
  14.7s event     call connected
  14.9s latency   first reply audio (680 ms)
  14.9s agent     Hey, thanks for picking up. What can I take off your plate today?
  15.1s event     latency report {"stt_latency":0.019999995827674866}
  15.3s event     latency report {"stt_latency":0.02000001072883606}
  15.5s event     latency report {"stt_latency":0.019999980926513672}
  15.8s event     latency report {"stt_latency":0.020000040531158447}
  16.0s event     latency report {"stt_latency":0.019999980926513672}
  16.3s event     latency report {"stt_latency":0.019999980926513672}
  16.5s event     latency report {"stt_latency":0.019999980926513672}
  16.7s event     latency report {"stt_latency":0.019999980926513672}
  17.0s event     latency report {"stt_latency":0.019999980926513672}
  17.2s event     latency report {"stt_latency":0.019999980926513672}
  17.5s event     latency report {"stt_latency":0.020000219345092773}
  17.7s event     latency report {"stt_latency":0.019999980926513672}
  17.9s event     latency report {"stt_latency":0.020000219345092773}
  18.2s event     latency report {"stt_latency":0.019999980926513672}
  18.4s said      It's Jonathan.
  18.4s event     latency report {"stt_latency":0.019999980926513672}
  18.7s event     latency report {"stt_latency":0.06000018119812012}
  18.9s event     latency report {"stt_latency":0.019999980926513672}
  19.1s event     latency report {"stt_latency":0.019999980926513672}
  19.4s event     latency report {"stt_latency":0.019999980926513672}
  19.7s event     latency report {"stt_latency":0.059999942779541016}
  19.8s event     latency report {"stt_latency":0.019999980926513672}
  19.9s event     latency report {"stt_latency":0.019999980926513672}
  20.0s event     latency report {"stt_latency":0.019999980926513672}
  20.1s event     latency report {"stt_latency":0.019999980926513672}
  20.3s event     latency report {"stt_latency":0.019999980926513672}
  20.3s heard_as  It's Jonathan.
  20.6s event     latency report {"stt_latency":0.01999950408935547}
  20.7s event     latency report {"stt_latency":0.019999980926513672}
  20.7s event     latency report {"stt_latency":0.019999980926513672}
  20.8s event     latency report {"stt_latency":0.019999980926513672}
  20.9s event     latency report {"stt_latency":0.019999980926513672}
  21.0s event     latency report {"stt_latency":0.019999980926513672}
  21.1s event     latency report {"stt_latency":0.020000457763671875}
  21.3s event     latency report {"stt_latency":0.019999980926513672}
  21.5s event     latency report {"stt_latency":0.01999950408935547}
  21.6s event     latency report {"ttt_token_latency":1.541021274}
  21.6s event     latency report {"ttt_text_latency":1.541052111}
  21.7s latency   first reply audio (2166 ms)
  21.7s agent     Jonathan, great.
  21.7s event     latency report {"tts_latency":0.128280128}
  21.7s event     latency report {"total_latency":1.708467805}
  21.8s event     latency report {"stt_latency":0.019999980926513672}
  22.0s event     latency report {"stt_latency":0.019999980926513672}
  22.3s event     latency report {"stt_latency":0.019999980926513672}
  22.5s event     latency report {"stt_latency":0.019999980926513672}
  22.7s event     latency report {"stt_latency":0.019999980926513672}
  23.0s event     latency report {"stt_latency":0.020000457763671875}
  23.2s event     latency report {"stt_latency":0.020000457763671875}
  23.5s event     latency report {"stt_latency":0.01999950408935547}
  23.6s agent     Is that J-O-N-A-T-H-A-N?
  23.7s event     latency report {"stt_latency":0.01999950408935547}
  23.9s event     latency report {"stt_latency":0.020000457763671875}
  24.2s event     latency report {"stt_latency":0.020000457763671875}
  24.4s event     latency report {"stt_latency":0.01999950408935547}
  24.7s event     latency report {"stt_latency":0.01999950408935547}
  24.9s event     latency report {"stt_latency":0.020000457763671875}
  25.1s event     latency report {"stt_latency":0.020000457763671875}
  25.4s event     latency report {"stt_latency":0.01999950408935547}
  25.6s event     latency report {"stt_latency":0.01999950408935547}
  25.9s event     latency report {"stt_latency":0}
  26.1s event     latency report {"stt_latency":0.020000457763671875}
  26.3s event     latency report {"stt_latency":0.01999950408935547}
  26.6s event     latency report {"stt_latency":0.01999950408935547}
  26.8s event     latency report {"stt_latency":0.020000457763671875}
  27.1s event     latency report {"stt_latency":0.020000457763671875}
  27.3s event     latency report {"stt_latency":0.020000457763671875}
  27.5s event     latency report {"stt_latency":0}
  27.8s event     latency report {"stt_latency":0.01999950408935547}
  28.0s event     latency report {"stt_latency":0.020000457763671875}
  28.3s event     latency report {"stt_latency":0.020000457763671875}
  28.5s event     latency report {"stt_latency":0.01999950408935547}
  28.7s event     latency report {"stt_latency":0}
  29.0s event     latency report {"stt_latency":0.020000457763671875}
  29.0s said      Yes, that's right.
  29.2s event     latency report {"stt_latency":0.020000457763671875}
  29.5s event     latency report {"stt_latency":0.01999950408935547}
  29.7s event     latency report {"stt_latency":0.01999950408935547}
  29.9s event     latency report {"stt_latency":0.020000457763671875}
  30.2s event     latency report {"stt_latency":0.020000457763671875}
  30.3s event     latency report {"stt_latency":0.020000457763671875}
  30.4s event     latency report {"stt_latency":0.01999950408935547}
  30.7s event     latency report {"stt_latency":0.01999950408935547}
  30.9s event     latency report {"stt_latency":0.020000457763671875}
  31.1s event     latency report {"stt_latency":0.020000457763671875}
  31.2s event     latency report {"stt_latency":0.020000457763671875}
  31.2s heard_as  Yes. That's right.
  31.5s event     latency report {"stt_latency":0.020000457763671875}
  31.5s event     latency report {"stt_latency":0.020000457763671875}
  31.6s event     latency report {"stt_latency":0.020000457763671875}
  31.7s event     latency report {"stt_latency":0.020000457763671875}
  31.7s event     latency report {"ttt_token_latency":1.086015625}
  31.8s event     latency report {"ttt_text_latency":1.086052407}
  31.8s event     latency report {"stt_latency":0.020000457763671875}
  31.8s latency   first reply audio (1450 ms)
  31.8s agent     Perfect.
  31.8s event     latency report {"tts_latency":0.084984062}
  31.8s event     latency report {"total_latency":1.182606448}
  31.9s event     latency report {"stt_latency":0.019998550415039062}
  31.9s event     latency report {"stt_latency":0.019998550415039062}
  32.0s event     latency report {"stt_latency":0.019998550415039062}
  32.1s event     latency report {"stt_latency":0.019998550415039062}
  32.2s event     latency report {"stt_latency":0.019998550415039062}
  32.3s event     latency report {"stt_latency":0.019998550415039062}
  32.3s event     latency report {"stt_latency":0.020000457763671875}
  32.4s event     latency report {"stt_latency":0.020000457763671875}
  32.5s agent     So what's on your mind, Jonathan?
  32.7s event     latency report {"stt_latency":0.020000457763671875}
  32.9s event     latency report {"stt_latency":0}
  33.1s event     latency report {"stt_latency":0}
  33.4s event     latency report {"stt_latency":0.020000457763671875}
  33.6s event     latency report {"stt_latency":0.020000457763671875}
  33.9s event     latency report {"stt_latency":0.019998550415039062}
  34.1s event     latency report {"stt_latency":0.019998550415039062}
  34.2s agent     What would help you out right now?
  34.3s event     latency report {"stt_latency":0.020000457763671875}
  34.6s event     latency report {"stt_latency":0.020000457763671875}
  34.8s event     latency report {"stt_latency":0.020000457763671875}
  35.1s event     latency report {"stt_latency":0.020000457763671875}
  35.3s event     latency report {"stt_latency":0.020000457763671875}
  35.5s event     latency report {"stt_latency":0.020000457763671875}
  35.8s event     latency report {"stt_latency":0.020000457763671875}
  36.0s event     latency report {"stt_latency":0.019998550415039062}
  36.3s event     latency report {"stt_latency":0.019998550415039062}
  36.5s event     latency report {"stt_latency":0.020000457763671875}
  36.7s event     latency report {"stt_latency":0.020000457763671875}
  37.0s event     latency report {"stt_latency":0.020000457763671875}
  37.0s said      Honestly I keep missing emails from recruiters, they get buried.
  37.2s event     latency report {"stt_latency":0.020000457763671875}
  37.5s event     latency report {"stt_latency":0.020000457763671875}
  37.7s event     latency report {"stt_latency":0.020000457763671875}
  37.9s event     latency report {"stt_latency":0.019998550415039062}
  38.2s event     latency report {"stt_latency":0.019998550415039062}
  38.4s event     latency report {"stt_latency":0}
  38.7s event     latency report {"stt_latency":0.020000457763671875}
  38.9s event     latency report {"stt_latency":0.020000457763671875}
  39.1s event     latency report {"stt_latency":0.020000457763671875}
  39.4s event     latency report {"stt_latency":0.020000457763671875}
  39.6s event     latency report {"stt_latency":0.020000457763671875}
  39.9s event     latency report {"stt_latency":0.019998550415039062}
  40.1s event     latency report {"stt_latency":0.019998550415039062}
  40.3s event     latency report {"stt_latency":0.020000457763671875}
  40.5s event     latency report {"stt_latency":0.020000457763671875}
  40.6s event     latency report {"stt_latency":0.020000457763671875}
  40.8s event     latency report {"stt_latency":0.020000457763671875}
  40.9s event     latency report {"stt_latency":0.020000457763671875}
  41.1s event     latency report {"stt_latency":0.020000457763671875}
  41.2s event     latency report {"stt_latency":0.020000457763671875}
  41.2s heard_as  Honestly, I keep missing emails from recruiters they get buried.
  41.5s event     latency report {"stt_latency":0.020000457763671875}
  41.5s event     latency report {"stt_latency":0.020000457763671875}
  41.6s event     latency report {"stt_latency":0.020000457763671875}
  41.7s event     latency report {"stt_latency":0.020000457763671875}
  41.8s event     latency report {"stt_latency":0.020000457763671875}
  41.9s event     latency report {"stt_latency":0.019998550415039062}
  41.9s event     latency report {"stt_latency":0.019998550415039062}
  42.0s event     latency report {"ttt_token_latency":1.116396569}
  42.0s event     latency report {"ttt_text_latency":1.116432323}
  42.0s event     latency report {"stt_latency":0.019998550415039062}
  42.1s event     latency report {"stt_latency":0}
  42.1s latency   first reply audio (1648 ms)
  42.1s agent     I got it, you're missing recruiter emails in the noise.
  42.1s event     latency report {"tts_latency":0.113963361}
  42.1s event     latency report {"total_latency":1.264148584}
  42.2s event     latency report {"stt_latency":0.019998550415039062}
  42.4s event     latency report {"stt_latency":0.020000457763671875}
  42.7s event     latency report {"stt_latency":0.020000457763671875}
  42.9s event     latency report {"stt_latency":0.020000457763671875}
  43.1s event     latency report {"stt_latency":0.020000457763671875}
  43.4s event     latency report {"stt_latency":0.020000457763671875}
  43.6s event     latency report {"stt_latency":0.020000457763671875}
  43.9s event     latency report {"stt_latency":0.019998550415039062}
  44.1s event     latency report {"stt_latency":0.019998550415039062}
  44.3s event     latency report {"stt_latency":0.020000457763671875}
  44.6s event     latency report {"stt_latency":0.020000457763671875}
  44.8s event     latency report {"stt_latency":0.020000457763671875}
  44.8s agent     I can help you stay on top of those.
  45.1s event     latency report {"stt_latency":0.020000457763671875}
  45.3s event     latency report {"stt_latency":0.020000457763671875}
  45.5s event     latency report {"stt_latency":0.020000457763671875}
  45.8s event     latency report {"stt_latency":0.020000457763671875}
  46.0s event     latency report {"stt_latency":0.019998550415039062}
  46.3s event     latency report {"stt_latency":0}
  46.5s event     latency report {"stt_latency":0.020000457763671875}
  46.7s event     latency report {"stt_latency":0.020000457763671875}
  47.0s event     latency report {"stt_latency":0.020000457763671875}
  47.2s event     latency report {"stt_latency":0.01999664306640625}
  47.5s event     latency report {"stt_latency":0.020000457763671875}
  47.7s event     latency report {"stt_latency":0.020000457763671875}
  47.9s event     latency report {"stt_latency":0.020000457763671875}
  48.2s event     latency report {"stt_latency":0.020000457763671875}
  48.4s event     latency report {"stt_latency":0.020000457763671875}
  48.7s event     latency report {"stt_latency":0.020000457763671875}
  48.9s event     latency report {"stt_latency":0.01999664306640625}
  49.0s said      Sure, but let me just use the sample inbox for now.
  49.1s event     latency report {"stt_latency":0.020000457763671875}
  49.4s event     latency report {"stt_latency":0.020000457763671875}
  49.6s event     latency report {"stt_latency":0.020000457763671875}
  49.9s event     latency report {"stt_latency":0.020000457763671875}
  50.1s event     latency report {"stt_latency":0.020000457763671875}
  50.3s event     latency report {"stt_latency":0.020000457763671875}
  50.6s event     latency report {"stt_latency":0.020000457763671875}
  50.8s event     latency report {"stt_latency":0.020000457763671875}
  51.1s event     latency report {"stt_latency":0.01999664306640625}
  51.3s event     latency report {"stt_latency":0.020000457763671875}
  51.5s event     latency report {"stt_latency":0.020000457763671875}
  51.8s event     latency report {"stt_latency":0}
  52.0s event     latency report {"stt_latency":0.020000457763671875}
  52.3s event     latency report {"stt_latency":0.020000457763671875}
  52.5s event     latency report {"stt_latency":0.020000457763671875}
  52.7s event     latency report {"stt_latency":0.020000457763671875}
  53.0s event     latency report {"stt_latency":0.020000457763671875}
  53.2s event     latency report {"stt_latency":0.01999664306640625}
  53.3s event     latency report {"stt_latency":0.020000457763671875}
  53.3s heard_as  Sure. But let me just use the sample inbox for now.
  53.5s event     latency report {"stt_latency":0.020000457763671875}
  53.6s event     latency report {"stt_latency":0.020000457763671875}
  53.7s event     latency report {"stt_latency":0.020000457763671875}
  53.8s event     latency report {"stt_latency":0.020000457763671875}
  53.9s event     latency report {"stt_latency":0.020000457763671875}
  53.9s event     latency report {"stt_latency":0.020000457763671875}
  54.0s event     latency report {"stt_latency":0.020000457763671875}
  54.1s event     latency report {"stt_latency":0.020000457763671875}
  54.2s event     latency report {"stt_latency":0.020000457763671875}
  54.3s event     latency report {"stt_latency":0.020000457763671875}
  54.3s event     latency report {"stt_latency":0.020000457763671875}
  54.4s event     latency report {"stt_latency":0.020000457763671875}
  54.5s event     latency report {"stt_latency":0.020000457763671875}
  54.6s event     latency report {"stt_latency":0.020000457763671875}
  54.7s event     latency report {"stt_latency":0.020000457763671875}
  54.7s event     latency report {"stt_latency":0.020000457763671875}
  54.8s event     latency report {"stt_latency":0.020000457763671875}
  54.9s event     latency report {"stt_latency":0.01999664306640625}
  55.0s event     latency report {"stt_latency":0.020000457763671875}
  55.2s event     latency report {"stt_latency":0.01999664306640625}
  55.5s event     latency report {"stt_latency":0.020000457763671875}
  55.7s event     latency report {"stt_latency":0.020000457763671875}
  55.9s event     latency report {"stt_latency":0.020000457763671875}
  56.2s event     latency report {"stt_latency":0.020000457763671875}
  56.4s event     latency report {"stt_latency":0.020000457763671875}
  56.7s event     latency report {"stt_latency":0.020000457763671875}
  56.9s event     latency report {"stt_latency":0.01999664306640625}
  57.1s event     latency report {"stt_latency":0.020000457763671875}
  57.4s event     latency report {"stt_latency":0.020000457763671875}
  57.6s event     latency report {"stt_latency":0}
  57.7s error     {"type":"Warning","description":"We have now waited 5 seconds for a think response.","code":"SLOW_THINK_REQUEST"}
  57.9s event     latency report {"stt_latency":0}
  58.1s event     latency report {"stt_latency":0.020000457763671875}
  58.3s event     latency report {"stt_latency":0.020000457763671875}
  58.6s event     latency report {"stt_latency":0.020000457763671875}
  58.8s event     latency report {"stt_latency":0}
  59.1s event     latency report {"stt_latency":0.01999664306640625}
  59.3s event     latency report {"stt_latency":0.020000457763671875}
  59.5s event     latency report {"stt_latency":0.020000457763671875}
  59.7s event     latency report {"ttt_token_latency":6.944875301}
  59.7s event     latency report {"ttt_text_latency":6.944909353}
  59.7s latency   first reply audio (7684 ms)
  59.7s agent     Got it, I'll use the sample inbox so you can see how this works without your real mail.
  59.8s event     latency report {"tts_latency":0.068118692}
  59.8s event     latency report {"total_latency":7.040487208}
  59.8s event     latency report {"stt_latency":0.020000457763671875}
  60.0s event     latency report {"stt_latency":0.020000457763671875}
  60.3s event     latency report {"stt_latency":0.020000457763671875}
  60.5s event     latency report {"stt_latency":0.020000457763671875}
  60.7s event     latency report {"stt_latency":0.020000457763671875}
  61.0s event     latency report {"stt_latency":0.020000457763671875}
  61.2s event     latency report {"stt_latency":0.01999664306640625}
  61.5s event     latency report {"stt_latency":0}
  61.7s event     latency report {"stt_latency":0}
  61.9s event     latency report {"stt_latency":0.020000457763671875}
  62.2s event     latency report {"stt_latency":0.020000457763671875}
  62.4s event     latency report {"stt_latency":0.020000457763671875}
  62.7s event     latency report {"stt_latency":0.020000457763671875}
  62.9s event     latency report {"stt_latency":0.01999664306640625}
  63.1s event     latency report {"stt_latency":0.020000457763671875}
  63.4s event     latency report {"stt_latency":0.020000457763671875}
  63.5s agent     Perfect.
  63.6s event     latency report {"stt_latency":0.020000457763671875}
  63.9s event     latency report {"stt_latency":0.020000457763671875}
  64.1s event     latency report {"stt_latency":0.020000457763671875}
  64.3s agent     I can see Maya Chen from Northwind Labs reached out two days ago about a software engineering role, and you haven't opened it yet.
  64.3s event     latency report {"stt_latency":0.020000457763671875}
  64.6s event     latency report {"stt_latency":0.020000457763671875}
  64.8s event     latency report {"stt_latency":0.020000457763671875}
  65.1s event     latency report {"stt_latency":0.01999664306640625}
  65.3s event     latency report {"stt_latency":0.020000457763671875}
  65.5s event     latency report {"stt_latency":0.020000457763671875}
  65.8s event     latency report {"stt_latency":0.020000457763671875}
  66.0s event     latency report {"stt_latency":0.020000457763671875}
  66.3s event     latency report {"stt_latency":0.020000457763671875}
  66.5s event     latency report {"stt_latency":0.020000457763671875}
  66.7s event     latency report {"stt_latency":0.020000457763671875}
  67.0s event     latency report {"stt_latency":0.020000457763671875}
  67.2s event     latency report {"stt_latency":0.01999664306640625}
  67.5s event     latency report {"stt_latency":0.020000457763671875}
  67.7s event     latency report {"stt_latency":0.020000457763671875}
  67.9s event     latency report {"stt_latency":0.020000457763671875}
  68.2s event     latency report {"stt_latency":0.020000457763671875}
  68.4s event     latency report {"stt_latency":0.020000457763671875}
  68.7s event     latency report {"stt_latency":0.020000457763671875}
  68.9s event     latency report {"stt_latency":0.01999664306640625}
  69.1s event     latency report {"stt_latency":0.020000457763671875}
  69.4s event     latency report {"stt_latency":0.020000457763671875}
  69.6s event     latency report {"stt_latency":0.020000457763671875}
  69.9s event     latency report {"stt_latency":0}
  70.1s event     latency report {"stt_latency":0.020000457763671875}
  70.3s event     latency report {"stt_latency":0.020000457763671875}
  70.6s event     latency report {"stt_latency":0.020000457763671875}
  70.8s event     latency report {"stt_latency":0.020000457763671875}
  71.1s event     latency report {"stt_latency":0.01999664306640625}
  71.3s event     latency report {"stt_latency":0.020000457763671875}
  71.5s event     latency report {"stt_latency":0.020000457763671875}
  71.8s event     latency report {"stt_latency":0.020000457763671875}
  71.9s agent     That's exactly the kind of thing that slips through.
  72.0s event     latency report {"stt_latency":0.020000457763671875}
  72.3s event     latency report {"stt_latency":0.020000457763671875}
  72.5s event     latency report {"stt_latency":0.020000457763671875}
  72.7s event     latency report {"stt_latency":0.020000457763671875}
  73.0s event     latency report {"stt_latency":0.020000457763671875}
  73.2s event     latency report {"stt_latency":0.01999664306640625}
  73.5s event     latency report {"stt_latency":0.020000457763671875}
  73.7s event     latency report {"stt_latency":0.020000457763671875}
  73.9s event     latency report {"stt_latency":0.020000457763671875}
  74.2s event     latency report {"stt_latency":0.020000457763671875}
  74.4s event     latency report {"stt_latency":0.020000457763671875}
  74.7s event     latency report {"stt_latency":0.020000457763671875}
  74.9s event     latency report {"stt_latency":0}
  75.0s agent     Ready to move on and I'll help you stay on top of recruiter emails like that?
  75.1s event     latency report {"stt_latency":0.020000457763671875}
  75.4s event     latency report {"stt_latency":0.020000457763671875}
  75.6s event     latency report {"stt_latency":0.020000457763671875}
  75.9s event     latency report {"stt_latency":0.020000457763671875}
  76.1s event     latency report {"stt_latency":0.020000457763671875}
  76.3s event     latency report {"stt_latency":0.020000457763671875}
  76.6s event     latency report {"stt_latency":0.020000457763671875}
  76.8s event     latency report {"stt_latency":0.020000457763671875}
  77.1s event     latency report {"stt_latency":0.01999664306640625}
  77.3s event     latency report {"stt_latency":0.020000457763671875}
  77.5s event     latency report {"stt_latency":0.020000457763671875}
  77.8s event     latency report {"stt_latency":0.020000457763671875}
  78.0s event     latency report {"stt_latency":0.020000457763671875}
  78.3s event     latency report {"stt_latency":0.020000457763671875}
  78.5s event     latency report {"stt_latency":0.020000457763671875}
  78.7s event     latency report {"stt_latency":0.020000457763671875}
  79.0s event     latency report {"stt_latency":0.01999664306640625}
  79.2s event     latency report {"stt_latency":0.01999664306640625}
  79.5s event     latency report {"stt_latency":0.0200042724609375}
  79.7s event     latency report {"stt_latency":0.0200042724609375}
  79.9s event     latency report {"stt_latency":0.01999664306640625}
  80.2s event     latency report {"stt_latency":0.01999664306640625}
  80.4s event     latency report {"stt_latency":0.0200042724609375}
  80.6s said      Yeah, draft a reply to the one who is waiting on interview times.
  80.7s event     latency report {"stt_latency":0.0200042724609375}
  80.9s event     latency report {"stt_latency":0.01999664306640625}
  81.1s event     latency report {"stt_latency":0.01999664306640625}
  81.3s event     latency report {"stt_latency":0.01999664306640625}
  81.4s event     latency report {"stt_latency":0.0200042724609375}
  81.6s event     latency report {"stt_latency":0}
  81.9s event     latency report {"stt_latency":0.01999664306640625}
  82.1s event     latency report {"stt_latency":0.0200042724609375}
  82.3s event     latency report {"stt_latency":0.0200042724609375}
  82.6s event     latency report {"stt_latency":0.01999664306640625}
  82.8s event     latency report {"stt_latency":0.01999664306640625}
  83.1s event     latency report {"stt_latency":0.0200042724609375}
  83.3s event     latency report {"stt_latency":0.01999664306640625}
  83.5s event     latency report {"stt_latency":0.01999664306640625}
  83.8s event     latency report {"stt_latency":0.0200042724609375}
  84.0s event     latency report {"stt_latency":0.0200042724609375}
  84.3s event     latency report {"stt_latency":0.01999664306640625}
  84.5s event     latency report {"stt_latency":0.01999664306640625}
  84.7s event     latency report {"stt_latency":0.0200042724609375}
  85.0s event     latency report {"stt_latency":0.01999664306640625}
  85.2s event     latency report {"stt_latency":0.01999664306640625}
  85.5s event     latency report {"stt_latency":0.0200042724609375}
  85.5s event     latency report {"stt_latency":0.01999664306640625}
  85.7s event     latency report {"stt_latency":0.0200042724609375}
  85.9s event     latency report {"stt_latency":0.01999664306640625}
  85.9s heard_as  Yeah, drafter replied to the one who is waiting on interview times.
  86.2s event     latency report {"stt_latency":0.01999664306640625}
  86.3s event     latency report {"stt_latency":0.01999664306640625}
  86.3s event     latency report {"stt_latency":0.0200042724609375}
  86.4s event     latency report {"stt_latency":0.0200042724609375}
  86.5s event     latency report {"stt_latency":0.01999664306640625}
  86.6s event     latency report {"stt_latency":0.01999664306640625}
  86.7s event     latency report {"stt_latency":0.0200042724609375}
  86.7s event     latency report {"stt_latency":0.0200042724609375}
  86.8s event     latency report {"stt_latency":0.01999664306640625}
  86.9s event     latency report {"stt_latency":0.01999664306640625}
  87.0s event     latency report {"stt_latency":0.01999664306640625}
  87.1s event     latency report {"stt_latency":0.0200042724609375}
  87.1s event     latency report {"stt_latency":0.01999664306640625}
  87.3s event     latency report {"stt_latency":0.01999664306640625}
  87.4s event     latency report {"stt_latency":0.0200042724609375}
  87.6s event     latency report {"stt_latency":0.01999664306640625}
  87.9s event     latency report {"stt_latency":0.01999664306640625}
  88.1s event     latency report {"stt_latency":0.0200042724609375}
  88.3s event     latency report {"stt_latency":0.0200042724609375}
  88.6s event     latency report {"stt_latency":0.01999664306640625}
  88.8s event     latency report {"stt_latency":0.01999664306640625}
  89.1s event     latency report {"stt_latency":0.0200042724609375}
  89.3s event     latency report {"stt_latency":0.01999664306640625}
  89.5s event     latency report {"stt_latency":0.01999664306640625}
  89.8s event     latency report {"stt_latency":0.0200042724609375}
  90.0s event     latency report {"stt_latency":0}
  90.3s event     latency report {"stt_latency":0.01999664306640625}
  90.3s event     latency report {"ttt_token_latency":4.719585147}
  90.3s event     latency report {"ttt_text_latency":4.719621195}
  90.3s latency   first reply audio (5283 ms)
  90.3s agent     Let me find that one for you.
  90.3s event     latency report {"tts_latency":0.069531311}
  90.3s event     latency report {"total_latency":4.8065568899999995}
  90.5s event     latency report {"stt_latency":0.01999664306640625}
  90.7s event     latency report {"stt_latency":0.0200042724609375}
  91.0s event     latency report {"stt_latency":0.01999664306640625}
  91.2s event     latency report {"stt_latency":0.01999664306640625}
  91.5s event     latency report {"stt_latency":0.0200042724609375}
  91.6s agent     She needs two or three times that work for you over the next two weeks, and she wants to lock it in by this Friday.
  91.7s event     latency report {"stt_latency":0.0200042724609375}
  91.9s event     latency report {"stt_latency":0.01999664306640625}
  92.2s event     latency report {"stt_latency":0.01999664306640625}
  92.4s event     latency report {"stt_latency":0.0200042724609375}
  92.7s event     latency report {"stt_latency":0.0200042724609375}
  92.9s event     latency report {"stt_latency":0.01999664306640625}
  93.1s event     latency report {"stt_latency":0.01999664306640625}
  93.4s event     latency report {"stt_latency":0.0200042724609375}
  93.6s event     latency report {"stt_latency":0.01999664306640625}
  93.9s event     latency report {"stt_latency":0.01999664306640625}
  94.1s event     latency report {"stt_latency":0.0200042724609375}
  94.3s event     latency report {"stt_latency":0.0200042724609375}
  94.6s event     latency report {"stt_latency":0.01999664306640625}
  94.8s event     latency report {"stt_latency":0.01999664306640625}
  95.1s event     latency report {"stt_latency":0.0200042724609375}
  95.3s event     latency report {"stt_latency":0.05999755859375}
  95.5s event     latency report {"stt_latency":0.01999664306640625}
  95.8s event     latency report {"stt_latency":0.0200042724609375}
  96.0s event     latency report {"stt_latency":0.0200042724609375}
  96.3s event     latency report {"stt_latency":0.01999664306640625}
  96.5s event     latency report {"stt_latency":0.01999664306640625}
  96.7s agent     Do you want me to draft a reply with some times, or do you need a moment to think about your calendar?
  96.7s event     latency report {"stt_latency":0.0200042724609375}
  97.0s event     latency report {"stt_latency":0.01999664306640625}
  97.2s event     latency report {"stt_latency":0.01999664306640625}
  97.5s event     latency report {"stt_latency":0.0200042724609375}
  97.7s event     latency report {"stt_latency":0.0200042724609375}
  97.9s event     latency report {"stt_latency":0.01999664306640625}
  98.2s event     latency report {"stt_latency":0.05999755859375}
  98.4s event     latency report {"stt_latency":0.0200042724609375}
  98.7s event     latency report {"stt_latency":0.0200042724609375}
  98.9s event     latency report {"stt_latency":0.01999664306640625}
  99.1s event     latency report {"stt_latency":0.01999664306640625}
  99.4s event     latency report {"stt_latency":0}
  99.6s event     latency report {"stt_latency":0.01999664306640625}
  99.9s event     latency report {"stt_latency":0.01999664306640625}
 100.1s event     latency report {"stt_latency":0.0200042724609375}
 100.3s event     latency report {"stt_latency":0.0200042724609375}
 100.6s event     latency report {"stt_latency":0.01999664306640625}
 100.8s event     latency report {"stt_latency":0.01999664306640625}
 101.1s event     latency report {"stt_latency":0.0200042724609375}
 101.3s event     latency report {"stt_latency":0.01999664306640625}
 101.5s event     latency report {"stt_latency":0.01999664306640625}
 101.8s event     latency report {"stt_latency":0.0200042724609375}
 102.0s event     latency report {"stt_latency":0.0200042724609375}
 102.3s event     latency report {"stt_latency":0.01999664306640625}
 102.5s event     latency report {"stt_latency":0.01999664306640625}
 102.7s event     latency report {"stt_latency":0.0200042724609375}
 103.0s event     latency report {"stt_latency":0.01999664306640625}
 103.1s said      That's great, thanks. That's all for now, bye.
 103.2s event     latency report {"stt_latency":0.01999664306640625}
 103.5s event     latency report {"stt_latency":0.0200042724609375}
 103.7s event     latency report {"stt_latency":0.0200042724609375}
 103.9s event     latency report {"stt_latency":0.01999664306640625}
 104.2s event     latency report {"stt_latency":0.01999664306640625}
 104.4s event     latency report {"stt_latency":0.0200042724609375}
 104.5s event     latency report {"stt_latency":0.01999664306640625}
 104.7s event     latency report {"stt_latency":0.0200042724609375}
 104.9s event     latency report {"stt_latency":0.01999664306640625}
 105.1s event     latency report {"stt_latency":0.01999664306640625}
 105.4s event     latency report {"stt_latency":0.0200042724609375}
 105.6s event     latency report {"stt_latency":0.01999664306640625}
 105.7s event     latency report {"stt_latency":0.0200042724609375}
 105.8s event     latency report {"stt_latency":0.0200042724609375}
 105.9s event     latency report {"stt_latency":0.01999664306640625}
 106.1s event     latency report {"stt_latency":0.0200042724609375}
 106.2s event     latency report {"stt_latency":0.01999664306640625}
 106.3s event     latency report {"stt_latency":0.01999664306640625}
 106.3s event     latency report {"stt_latency":0.04000091552734375}
 106.3s heard_as  That's great. Thanks. That's all for now. Bye.
 106.5s event     latency report {"stt_latency":0.05999755859375}
 106.6s event     latency report {"stt_latency":0.01999664306640625}
 106.7s event     latency report {"stt_latency":0.0200042724609375}
 106.7s event     latency report {"stt_latency":0.0200042724609375}
 106.8s event     latency report {"stt_latency":0.01999664306640625}
 106.9s event     latency report {"stt_latency":0.01999664306640625}
 107.0s event     latency report {"stt_latency":0.01999664306640625}
 107.1s event     latency report {"stt_latency":0.0200042724609375}
 107.1s event     latency report {"stt_latency":0.01999664306640625}
 107.2s event     latency report {"stt_latency":0.01999664306640625}
 107.2s event     latency report {"ttt_token_latency":0.982567058}
 107.2s event     latency report {"ttt_text_latency":0.982599889}
 107.3s event     latency report {"stt_latency":0.01999664306640625}
 107.3s latency   first reply audio (1188 ms)
 107.3s agent     Thanks, Jonathan.
 107.3s event     latency report {"tts_latency":0.068987607}
 107.3s event     latency report {"total_latency":1.064218228}
 107.4s event     latency report {"stt_latency":0.0200042724609375}
 107.5s event     latency report {"stt_latency":0.0200042724609375}
 107.5s event     latency report {"stt_latency":0.01999664306640625}
 107.7s event     latency report {"stt_latency":0.05999755859375}
 107.7s event     latency report {"stt_latency":0.06000518798828125}
 107.9s event     latency report {"stt_latency":0.01999664306640625}
 108.2s event     latency report {"stt_latency":0.01999664306640625}
 108.4s event     latency report {"stt_latency":0.0200042724609375}
 108.6s agent     Catch you later.
 108.7s event     latency report {"stt_latency":0.0200042724609375}
 108.9s event     latency report {"stt_latency":0}
 109.1s event     latency report {"stt_latency":0.01999664306640625}
 109.4s event     latency report {"stt_latency":0.0200042724609375}
 109.6s event     latency report {"stt_latency":0.01999664306640625}
 109.9s event     latency report {"stt_latency":0.01999664306640625}
 110.1s event     latency report {"stt_latency":0.0200042724609375}
 110.3s event     latency report {"stt_latency":0.0200042724609375}
 110.6s event     latency report {"stt_latency":0.01999664306640625}
 110.8s event     latency report {"stt_latency":0.01999664306640625}
 111.1s event     latency report {"stt_latency":0.0200042724609375}
 111.3s event     latency report {"stt_latency":0.01999664306640625}
 111.5s event     latency report {"stt_latency":0.01999664306640625}
 111.8s event     latency report {"stt_latency":0.0200042724609375}
 111.8s event     the agent ended the call
 111.8s hangup    agent_ended
```

Thread as the person sees it:
```
AGENT  [text] Hi, I'm Persona, an assistant you can text or call to get the small stuff off your plate.

Before anything else, what would you like to call me? Persona works fine if you'd rather not pick.
PERSON [text] call yourself Max
AGENT  [text] Max it is. I'm calling you now since talking is quicker. Pick up if you can, or just keep texting if you'd rather.
AGENT  [voice] Hey, thanks for picking up. What can I take off your plate today?
PERSON [voice] It's Jonathan.
AGENT  [voice] Jonathan, great. Is that J-O-N-A-T-H-A-N?
PERSON [voice] Yes. That's right.
AGENT  [voice] Perfect. So what's on your mind, Jonathan? What would help you out right now?
PERSON [voice] Honestly, I keep missing emails from recruiters they get very Honestly, I keep missing emails from recruiters they get buried.
AGENT  [voice] I got it, you're missing recruiter emails in the noise. I can help you stay on top of those.
PERSON [voice] Sure. But let me just use the sample inbox for now.
AGENT  [voice] Got it, I'll use the sample inbox so you can see how this works without your real mail. Perfect. I can see Maya Chen from Northwind Labs reached out two days ago about a software engineering role, and you haven't opened it yet. That's exactly the kind of thing that slips through. Ready to move on and I'll help you stay on top of recruiter emails like that?
PERSON [voice] Yeah, drafter replied to the one who is waiting on interview times.
AGENT  [voice] Let me find that one for you. She needs two or three times that work for you over the next two weeks, and she wants to lock it in by this Friday. Do you want me to draft a reply with some times, or do you need a moment to think about your calendar?
PERSON [voice] That's great. Thanks. That's all for now. Bye.
AGENT  [voice] Thanks, Jonathan. Catch you later.
```
