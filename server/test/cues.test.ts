import { describe, expect, it } from 'vitest';
import {
  askedForSample,
  cuesFor,
  MAX_CUES,
  misheardNameCue,
  refusesCall,
  shouldAskName,
  staysOnSample,
  staysQuietAboutInbox,
} from '../src/agent/cues.ts';
import { SpokenLimiter } from '../src/agent/spokenLimit.ts';
import { runTurn } from '../src/agent/turn.ts';
import { lastUserText, scriptedModel } from './agentHelpers.ts';
import { memoryService } from './helpers.ts';

describe('cues in what the person said', () => {
  it('notices a goodbye', () => {
    for (const line of ["That's all for now, bye.", 'Okay I gotta go', 'talk to you later', 'Thanks, see you']) {
      expect(cuesFor(line).join(' ')).toContain('intent completed');
    }
  });

  it('notices a request to be called back, to text, or to wait', () => {
    expect(cuesFor("I'm driving, can you call me back later?").join(' ')).toContain('callback_later');
    expect(cuesFor("Can we just text instead? I'm in a meeting.").join(' ')).toContain('switch_to_text');
    expect(cuesFor('Hold on a second, someone is at the door').join(' ')).toContain('Take your time');
  });

  it('stays quiet for ordinary talk', () => {
    for (const line of ['I keep missing emails from recruiters', "It's Jonathan", 'What can you see in my email?']) {
      expect(cuesFor(line)).toEqual([]);
    }
  });

  it('never gives more than two hints', () => {
    expect(cuesFor('hold on, bye, call me back, text me instead').length).toBe(MAX_CUES);
  });

  it('reaches the model as a hint on a call and never in text', async () => {
    const { service } = memoryService();
    const id = service.create().id;
    const typed = scriptedModel([{ text: 'Bye for now.' }]);
    await runTurn(service, typed, { onboardingId: id, channel: 'text', trigger: { type: 'user_message', text: 'ok bye' } });
    expect(lastUserText(typed.requests[0]!)).not.toContain('hint from what they just said');

    service.startCall(id, 'call_1');
    const spoken = scriptedModel([{ text: 'Bye.', tools: [{ name: 'end_call', input: { intent: 'completed' } }] }]);
    await runTurn(service, spoken, {
      onboardingId: id,
      channel: 'voice',
      trigger: { type: 'user_message', text: 'ok bye' },
      callId: 'call_1',
    });
    expect(lastUserText(spoken.requests[0]!)).toContain(
      'hint from what they just said: they may be ending the call.',
    );
  });
});

describe('a build without a Google connection', () => {
  it('tells the agent to offer only the sample inbox, until an inbox is connected', async () => {
    const { service } = memoryService();
    const id = service.create().id;
    const without = scriptedModel([{ text: 'a' }]);
    await runTurn(service, without, {
      onboardingId: id,
      channel: 'text',
      trigger: { type: 'user_message', text: 'help with email' },
      realGmail: false,
    });
    expect(lastUserText(without.requests[0]!)).toContain('a real account cannot be connected');

    const withGoogle = scriptedModel([{ text: 'b' }]);
    await runTurn(service, withGoogle, {
      onboardingId: id,
      channel: 'text',
      trigger: { type: 'user_message', text: 'help with email' },
      realGmail: true,
    });
    expect(lastUserText(withGoogle.requests[0]!)).not.toContain('a real account cannot be connected');

    service.applyGmail(id, { type: 'connected', mode: 'sample' });
    const connected = scriptedModel([{ text: 'c' }]);
    await runTurn(service, connected, {
      onboardingId: id,
      channel: 'text',
      trigger: { type: 'user_message', text: 'ok' },
      realGmail: false,
    });
    expect(lastUserText(connected.requests[0]!)).not.toContain('a real account cannot be connected');
  });
});

describe('a name that was heard as a fragment', () => {
  it('is flagged so the agent asks again', () => {
    expect(misheardNameCue("Okay. Okay. I'm b, and I need help with a dentist appointment.")).toContain('"b"');
    expect(misheardNameCue('My name is K.')).toContain('"K"');
    expect(cuesFor("I'm b").join(' ')).toContain('Ask them to say their name again or spell it');
  });

  it('leaves real names, initials and ordinary talk alone', () => {
    for (const line of ["I'm Bea", "It's Jonathan", 'Call me DJ', "I'm in a meeting", "It's a long story", "I'm on it", "it's ok"]) {
      expect(misheardNameCue(line)).toBeNull();
    }
  });

});

describe('not nagging about the inbox', () => {
  const offered = { offered: true, connected: false, replies: ['Those sneak up. When is the power bill due?'] };
  const asked = { ...offered, replies: ['Want to connect Gmail or try a sample inbox first?'] };

  it('stays quiet when they are talking about something else', () => {
    expect(staysQuietAboutInbox({ ...offered, utterance: 'Mostly my power bill, I always pay it late.' })).toBe(true);
    expect(staysQuietAboutInbox({ ...offered, utterance: 'Can you just pay them for me?' })).toBe(true);
    expect(
      staysQuietAboutInbox({ ...asked, utterance: 'Mostly my power bill and my phone bill, I always pay them late.' }),
    ).toBe(true);
  });

  it('counts an offer made in words even when the button was never shown', () => {
    expect(
      staysQuietAboutInbox({
        offered: false,
        connected: false,
        replies: ['Want to connect your inbox?', 'Those sneak up on everyone.'],
        utterance: 'Can you just pay them for me?',
      }),
    ).toBe(true);
  });

  it('speaks freely when they bring it up, or are answering a question about it', () => {
    expect(staysQuietAboutInbox({ ...offered, utterance: 'What can you see in my email?' })).toBe(false);
    expect(staysQuietAboutInbox({ ...offered, utterance: 'ok how do I connect it' })).toBe(false);
    expect(staysQuietAboutInbox({ ...offered, utterance: 'Fine. What should I do first?' })).toBe(false);
    expect(staysQuietAboutInbox({ ...asked, utterance: 'Sure, go ahead.' })).toBe(false);
    expect(staysQuietAboutInbox({ ...asked, utterance: 'Not right now, maybe later.' })).toBe(false);
  });

  it('does not apply before any offer or once an inbox is connected', () => {
    expect(staysQuietAboutInbox({ offered: false, connected: false, replies: ['Hi.'], utterance: 'my bills' })).toBe(
      false,
    );
    expect(staysQuietAboutInbox({ ...offered, connected: true, utterance: 'my bills' })).toBe(false);
  });

  it('drops a spoken nudge and keeps the rest', () => {
    const limiter = new SpokenLimiter(() => undefined, { quietAboutInbox: true });
    limiter.push(
      'That makes sense, those sneak up. Once you connect, I can spot due dates for you. When is the power bill due?',
    );
    expect(limiter.finish().spoken).toBe('That makes sense, those sneak up. When is the power bill due?');
  });

  it('reaches the model as a hint in text too', async () => {
    const { service } = memoryService();
    const id = service.create().id;
    service.callTool(id, { name: 'offer_gmail_connect', input: { userRequested: false }, channel: 'text' });
    service.logMessage(id, { role: 'agent', channel: 'text', text: 'When is the bill due?', callId: null });
    const model = scriptedModel([{ text: 'Noted.' }]);
    await runTurn(service, model, {
      onboardingId: id,
      channel: 'text',
      trigger: { type: 'user_message', text: 'the fifth of each month' },
    });
    expect(lastUserText(model.requests[0]!)).toContain('Do not mention Gmail, the inbox, the button or connecting');
  });
});

describe('asking for the sample inbox', () => {
  it('counts a request in any wording or language', () => {
    for (const line of [
      'Okay, use the sample inbox.',
      "I don't want to connect my real Gmail so just use the sample inbox.",
      'ok use the sample one',
      'dale, usa la bandeja de ejemplo porfa. no quiero conectar mi gmail',
      'sí, ándale Luz',
      'Sure, go ahead.',
    ]) {
      expect(askedForSample(line)).toBe(true);
    }
  });

  it('does not count a question or a refusal of everything', () => {
    expect(askedForSample("No, I don't want to connect anything, not even a sample.")).toBe(false);
    expect(askedForSample('Hang on, what was that about Google?')).toBe(false);
    expect(askedForSample('Can you actually send emails for me?')).toBe(false);
  });
});

describe('after choosing the sample inbox', () => {
  it('keeps the agent off their real account unless they raise it', () => {
    expect(staysOnSample('can you help me figure out which ones are worth responding to', 'sample')).toBe(true);
    expect(staysOnSample('ok fine, how do I connect my real one', 'sample')).toBe(false);
    expect(staysOnSample('which ones matter', null)).toBe(false);
    expect(staysOnSample('which ones matter', 'real')).toBe(false);
  });

  it('drops a spoken push towards the real account', () => {
    const limiter = new SpokenLimiter(() => undefined, { quietAboutRealInbox: true });
    limiter.push(
      "I can help you sort those. To tackle the real pile, I'd need to connect your actual Gmail. Which one first, Maya or Priya?",
    );
    expect(limiter.finish().spoken).toBe('I can help you sort those. Which one first, Maya or Priya?');
  });
});

describe('asking for a name in text', () => {
  it('waits a few messages, asks once, and never when it is known or refused', () => {
    expect(shouldAskName({ known: false, asks: 0, mayAsk: true, userTurns: 3 })).toBe(true);
    expect(shouldAskName({ known: false, asks: 0, mayAsk: true, userTurns: 1 })).toBe(false);
    expect(shouldAskName({ known: false, asks: 1, mayAsk: true, userTurns: 5 })).toBe(false);
    expect(shouldAskName({ known: true, asks: 0, mayAsk: true, userTurns: 5 })).toBe(false);
    expect(shouldAskName({ known: false, asks: 0, mayAsk: false, userTurns: 5 })).toBe(false);
  });
});

describe('asking to skip setup', () => {
  it('is noticed', () => {
    for (const line of [
      "Look, I don't want to answer a bunch of questions. Can I just start using this?",
      'No, nothing specific right now. Just let me in.',
      'can we skip this',
    ]) {
      expect(cuesFor(line).join(' ')).toContain('userRequestedSkip true');
    }
  });
});

describe('hang on, followed by a question', () => {
  it('is a question, not a request to wait', () => {
    expect(cuesFor('Hang on, what was that about Google?')).toEqual([]);
    expect(cuesFor('Hold on. Can you actually send emails for me?')).toEqual([]);
    expect(cuesFor('Hey, hold on a second, someone is at the door.').join(' ')).toContain('Take your time');
  });
});

describe('refusing a call in words', () => {
  it('is recognised', () => {
    for (const line of [
      'actually no calls, im on a train',
      "don't call me",
      'cant talk right now',
      'id rather text',
      'lets just type',
      'text only please',
    ]) {
      expect(refusesCall(line)).toBe(true);
    }
  });

  it('is not read into ordinary messages', () => {
    for (const line of ['bo', 'i need to cancel my gym membership', 'call me Lex', 'sure give me a call', 'my phone bill is late']) {
      expect(refusesCall(line)).toBe(false);
    }
  });
});
