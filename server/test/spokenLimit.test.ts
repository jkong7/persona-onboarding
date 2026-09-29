import { describe, expect, it } from 'vitest';
import { singleQuestion, SpokenLimiter, splitSentences, withoutSelfAddress } from '../src/agent/spokenLimit.ts';

function feed(text: string, size = 7): { heard: string; spoken: string; overflow: string } {
  const chunks: string[] = [];
  const limiter = new SpokenLimiter((part) => chunks.push(part));
  for (let index = 0; index < text.length; index += size) {
    limiter.push(text.slice(index, index + size));
  }
  const result = limiter.finish();
  return { heard: chunks.join('').replace(/\s+/g, ' ').trim(), ...result };
}

describe('splitting sentences', () => {
  it('splits on sentence endings and keeps the last fragment', () => {
    expect(splitSentences('Hi there. How are you? Fine')).toEqual(['Hi there.', 'How are you?', 'Fine']);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ...   ')).toEqual([]);
  });
});

describe('limiting what is spoken', () => {
  it('passes a short reply through untouched', () => {
    const result = feed('Got it, Jon. Did I hear that right?');
    expect(result.heard).toBe('Got it, Jon. Did I hear that right?');
    expect(result.spoken).toBe(result.heard);
    expect(result.overflow).toBe('');
  });

  it('allows three sentences', () => {
    const result = feed('One thing. Two things. Three things?');
    expect(result.spoken).toBe('One thing. Two things. Three things?');
    expect(result.overflow).toBe('');
  });

  it('speaks the opening and the closing question, and moves the middle to the thread', () => {
    const result = feed(
      'Let me look. Maya at Northwind wants a call this week. Priya at Halcyon wants interview times. There is also a mass mailing. And a scam. Want me to draft a reply to Priya?',
    );
    expect(result.spoken).toBe(
      'Let me look. Maya at Northwind wants a call this week. Want me to draft a reply to Priya?',
    );
    expect(result.heard).toBe(result.spoken);
    expect(result.overflow).toBe(
      'Priya at Halcyon wants interview times. There is also a mass mailing. And a scam.',
    );
  });

  it('speaks up to the limit and moves the tail to the thread', () => {
    const result = feed('First. Second. Third. Fourth. Fifth.');
    expect(result.spoken).toBe('First. Second. Third.');
    expect(result.overflow).toBe('Fourth. Fifth.');
  });

  it('speaks each sentence as soon as it is complete', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('Hey, it ');
    expect(chunks).toEqual([]);
    limiter.push('is Max. What should ');
    expect(chunks).toEqual(['Hey, it is Max. ']);
    limiter.push('I call you?');
    expect(chunks).toEqual(['Hey, it is Max. ']);
    limiter.settle();
    expect(chunks).toEqual(['Hey, it is Max. ', 'What should I call you? ']);
    expect(limiter.finish().spoken).toBe('Hey, it is Max. What should I call you?');
  });

  it('never speaks about its own workings', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push(
      "Perfect, I'll look at the sample inbox for you. Let me move you into the main experience so we can work through this together. I will call update_profile now. Is that J-O-N-A-T-H-A-N?",
    );
    expect(limiter.finish().spoken).toBe("Perfect, I'll look at the sample inbox for you.");
  });

  it('says something sooner than nothing', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('You have finished onboarding.');
    expect(limiter.finish().spoken).toBe('You have finished onboarding.');
  });

  it('drops narration after a lookup', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push("Perfect, I'll use the sample inbox to show you how this works.");
    limiter.breakBetweenReplies();
    limiter.push(
      "I've got your sample inbox loaded. Two recruiters are waiting on you. Priya needs interview times by Friday. Should I draft a reply to her?",
    );
    expect(limiter.finish()).toEqual({
      spoken:
        "Perfect, I'll use the sample inbox to show you how this works. Two recruiters are waiting on you. Priya needs interview times by Friday. Should I draft a reply to her?",
      overflow: '',
    });
  });

  it('flattens paragraph breaks', () => {
    const result = feed('Sure.\n\nHere you go.');
    expect(result.spoken).toBe('Sure. Here you go.');
  });

  it('counts sentences across a lookup', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('Let me look');
    limiter.breakBetweenReplies();
    limiter.push('Priya wants times by Friday. Maya wants a call. Sam wants dinner. Shall I draft Priya a reply?');
    const result = limiter.finish();
    expect(result.spoken).toBe('Let me look Priya wants times by Friday. Shall I draft Priya a reply?');
    expect(result.overflow).toBe('Maya wants a call. Sam wants dinner.');
  });

  it('holds one limit across every part of a reply', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part), { bridge: 'The rest is in the thread.' });
    limiter.push('Perfect, Noor. Let me look at the sample inbox.');
    limiter.breakBetweenReplies();
    limiter.push(
      'So I see a couple of real recruiters. The main one is Maya Chen from Northwind. Priya wants times. Which do you want first?',
    );
    const result = limiter.finish();
    expect(result.spoken).toBe(
      'Perfect, Noor. Let me look at the sample inbox. So I see a couple of real recruiters. The rest is in the thread. Which do you want first?',
    );
    expect(result.overflow).toBe('The main one is Maya Chen from Northwind. Priya wants times.');
    expect(chunks.join('').replace(/\s+/g, ' ').trim()).toBe(result.spoken);
  });

  it('drops filler before what was found and still says what matters', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part), { bridge: 'The rest is in the thread.' });
    limiter.push("Perfect, I'll use the sample inbox. Let me load that up for you.");
    limiter.breakBetweenReplies();
    for (const part of ['Got', ' it. Okay. I can see two recruiters', ' trying to reach you. Maya wants twenty minutes. Priya wants times.']) {
      limiter.push(part);
    }
    const result = limiter.finish();
    expect(result.spoken).toBe(
      "Perfect, I'll use the sample inbox. Let me load that up for you. I can see two recruiters trying to reach you. Maya wants twenty minutes. Priya wants times.",
    );
    expect(result.overflow).toBe('');
    expect(chunks.join('').replace(/\s+/g, ' ').trim()).toBe(result.spoken);
  });

  it('drops an announcement that it has arrived in the inbox', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push('Smart way to try it out. Let me pull that up.');
    limiter.breakBetweenReplies();
    limiter.push(
      "Okay Dana, I'm in the sample inbox now. Two recruiters are worth your time. Priya has been waiting six days. Maya wants twenty minutes. Want me to draft a reply to Priya first?",
    );
    expect(limiter.finish()).toEqual({
      spoken:
        'Smart way to try it out. Let me pull that up. Two recruiters are worth your time. The rest is in the thread. Want me to draft a reply to Priya first?',
      overflow: 'Priya has been waiting six days. Maya wants twenty minutes.',
    });
  });

  it('drops an announcement when the first step said nothing', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.afterLookup();
    limiter.push("Got it, I'm in the sample inbox. Priya has been waiting six days for interview times.");
    expect(limiter.finish().spoken).toBe('Priya has been waiting six days for interview times.');
  });

  it('says the announcement sooner than nothing at all', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.afterLookup();
    limiter.push("Okay, I'm in the sample inbox now.");
    expect(limiter.finish().spoken).toBe("Okay, I'm in the sample inbox now.");
  });

  it('keeps a spoken turn inside its word budget and sends the rest to the thread', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.', maxWords: 40 });
    limiter.push(
      'Got it, staying on top of bills. A lot of that lives in email, so I would need to read your inbox to find what is due and when it is due, and I can only read, never send or delete anything at all. Google will show a caution screen first. Want to give it a go?',
    );
    expect(limiter.finish()).toEqual({
      spoken: 'Got it, staying on top of bills. The rest is in the thread. Want to give it a go?',
      overflow:
        'A lot of that lives in email, so I would need to read your inbox to find what is due and when it is due, and I can only read, never send or delete anything at all. Google will show a caution screen first.',
    });
  });

  it('lets a short reply through whole, and never cuts the first sentence', () => {
    const short = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.', maxWords: 40 });
    short.push('Good to meet you, Lee. What can I take off your plate?');
    expect(short.finish()).toEqual({ spoken: 'Good to meet you, Lee. What can I take off your plate?', overflow: '' });

    const long = new SpokenLimiter(() => undefined, { maxWords: 10 });
    long.push('This single opening sentence runs well past the ten word budget that was set for it.');
    expect(long.finish().spoken).toBe(
      'This single opening sentence runs well past the ten word budget that was set for it.',
    );
  });

  it('keeps a short answer that is not filler', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('One sec.');
    limiter.breakBetweenReplies();
    limiter.push('Nothing from Priya yet.');
    expect(limiter.finish().spoken).toBe('One sec. Nothing from Priya yet.');
  });

  it('sends everything after the pointer to the thread', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push('One. Two. Three. Four. Five.');
    limiter.settle();
    limiter.push('Six. Seven.');
    expect(limiter.finish()).toEqual({
      spoken: 'One. Two. Three. The rest is in the thread.',
      overflow: 'Four. Five. Six. Seven.',
    });
  });

  it('releases what it held as soon as the words are complete', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('One. Two. Three.');
    expect(chunks.join('').trim()).toBe('One. Two.');
    limiter.settle();
    expect(chunks.join('').replace(/\s+/g, ' ').trim()).toBe('One. Two. Three.');
  });

  it('says the rest is in the thread when it moves something there', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part), { bridge: 'The rest is in the thread.' });
    limiter.push('Maya wants a call. Priya wants times. A staffing firm sent a blast. There is a scam too. Shall I draft one?');
    const result = limiter.finish();
    expect(result.spoken).toBe(
      'Maya wants a call. Priya wants times. The rest is in the thread. Shall I draft one?',
    );
    expect(result.overflow).toBe('A staffing firm sent a blast. There is a scam too.');
    expect(chunks.join('').replace(/\s+/g, ' ').trim()).toBe(result.spoken);
  });

  it('speaks one extra sentence sooner than replace it with a pointer to the thread', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push('One. Two. Three. Four?');
    expect(limiter.finish()).toEqual({ spoken: 'One. Two. Three. Four?', overflow: '' });
  });

  it('gives what was found after a lookup its own allowance', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push('Good, Johnny it is. Let me look at the sample inbox.');
    limiter.breakBetweenReplies();
    limiter.push('Sam is asking about dinner on Friday, and a recruiter wants twenty minutes. Which one is on your mind?');
    expect(limiter.finish()).toEqual({
      spoken:
        'Good, Johnny it is. Let me look at the sample inbox. Sam is asking about dinner on Friday, and a recruiter wants twenty minutes. Which one is on your mind?',
      overflow: '',
    });
  });

  it('reports what was heard so far when cut off', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('I can read your mail. I cannot send anything. There is also');
    expect(limiter.spokenSoFar()).toBe('I can read your mail. I cannot send anything.');
  });

  it('counts only whole sentences as said when cut off', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('So the first thing I would');
    expect(chunks).toEqual([]);
    expect(limiter.spokenSoFar()).toBe('');
    limiter.push(' do is look. Then I would');
    expect(limiter.spokenSoFar()).toBe('So the first thing I would do is look.');
  });

  it('never splits a sentence across the spoken part and the thread', () => {
    for (const size of [1, 2, 3, 5, 11, 40, 400]) {
      const result = feed('Alpha beta. Gamma delta. Epsilon zeta. Eta theta. Iota kappa.', size);
      expect(result.spoken).toBe('Alpha beta. Gamma delta. Epsilon zeta.');
      expect(result.overflow).toBe('Eta theta. Iota kappa.');
    }
  });
});

describe('one question per spoken reply', () => {
  function speak(text: string, size = 5): string {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    for (let index = 0; index < text.length; index += size) {
      limiter.push(text.slice(index, index + size));
    }
    return limiter.finish().spoken;
  }

  it('drops a second question', () => {
    expect(speak("Perfect. So what's on your mind, Jonathan? What would help you out right now?")).toBe(
      "Perfect. So what's on your mind, Jonathan?",
    );
  });

  it('stops at the question', () => {
    expect(speak('Did I get that right? I want to be sure.')).toBe('Did I get that right?');
    expect(speak('Still there? No rush, just checking in.')).toBe('Still there?');
  });

  it('keeps a single question at the end', () => {
    expect(speak('Got it. What should I call you?')).toBe('Got it. What should I call you?');
  });

  it('drops everything after the first question, held back or not', () => {
    expect(speak('One. Two? Three. Four? Five?')).toBe('One. Two?');
  });

  it('gives the same result however the text is split', () => {
    const text = "Perfect. So what's on your mind? What would help? Anything at all?";
    for (const size of [1, 2, 3, 7, 20, 200]) {
      expect(speak(text, size)).toBe("Perfect. So what's on your mind?");
    }
  });
});

describe('two questions in one breath', () => {
  it('keeps the first', () => {
    expect(singleQuestion("What's your name, and what can I help take off your plate today?")).toBe("What's your name?");
    expect(singleQuestion('Who owes you, and how much is it?')).toBe('Who owes you?');
  });

  it('leaves a single question or a choice alone', () => {
    for (const sentence of [
      'What can I take off your plate?',
      'Want to connect Gmail, or would you rather use the sample inbox?',
      'Should I draft a reply to Priya and put it in the thread?',
      'I looked at the power bill and what it says is due Friday.',
    ]) {
      expect(singleQuestion(sentence)).toBe(sentence);
    }
  });

  it('is applied to what is spoken', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push("Hi there. What's your name, and what can I take off your plate today?");
    expect(limiter.finish().spoken).toBe("Hi there. What's your name?");
  });
});

describe('filler after a repair', () => {
  it('is dropped, with or without their name', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('Good to meet you, Sam.');
    limiter.breakBetweenReplies();
    limiter.push('No rush, Sam. Fair enough. What is cluttering it up most?');
    expect(limiter.finish().spoken).toBe('Good to meet you, Sam. What is cluttering it up most?');
  });
});

describe('calling the person by its own name', () => {
  it('is removed', () => {
    expect(withoutSelfAddress('You still there, Max?', 'Max')).toBe('You still there?');
    expect(withoutSelfAddress('Sounds good, Max.', 'Max')).toBe('Sounds good.');
    expect(withoutSelfAddress('Hey Max, what can I take off your plate?', 'Max')).toBe(
      'Hey, what can I take off your plate?',
    );
  });

  it('leaves its own introduction and other names alone', () => {
    expect(withoutSelfAddress("Hey, it's Max.", 'Max')).toBe("Hey, it's Max.");
    expect(withoutSelfAddress('Hey, Max here.', 'Max')).toBe('Hey, Max here.');
    expect(withoutSelfAddress('Good to meet you, Theo.', 'Max')).toBe('Good to meet you, Theo.');
    expect(withoutSelfAddress('Maximum effort, then.', 'Max')).toBe('Maximum effort, then.');
    expect(withoutSelfAddress('You still there?', null)).toBe('You still there?');
  });

  it('is applied to what is spoken', () => {
    const limiter = new SpokenLimiter(() => undefined, { agentName: 'Max' });
    limiter.push('You still there, Max?');
    expect(limiter.finish().spoken).toBe('You still there?');
  });
});

describe('saying the same thing twice in one turn', () => {
  it('is said once', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('Good to meet you, Sam.');
    limiter.breakBetweenReplies();
    limiter.push('Good to meet you, Sam. What is piling up most?');
    expect(limiter.finish().spoken).toBe('Good to meet you, Sam. What is piling up most?');
  });
});

describe('praise for asking', () => {
  it('is dropped', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('Good one. A lot of it comes down to spotting renewal emails. Which subscription bugs you most?');
    expect(limiter.finish().spoken).toBe(
      'A lot of it comes down to spotting renewal emails. Which subscription bugs you most?',
    );
  });

  it('leaves ordinary sentences alone', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('Good to meet you, Lee. That is a fair point about the rent.');
    expect(limiter.finish().spoken).toBe('Good to meet you, Lee. That is a fair point about the rent.');
  });
});
