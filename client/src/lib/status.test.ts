import { describe, expect, it } from 'vitest';
import { snapshot } from '../test/factory.ts';
import { agentName, endReasonLabel, fieldRows, phaseLabel, statusLabel, statusTone, userName } from './status.ts';

describe('statusLabel', () => {
  it('uses plain words for every status', () => {
    expect(statusLabel('provisional')).toBe('Heard');
    expect(statusLabel('confirmed')).toBe('Confirmed');
    expect(statusLabel('deferred')).toBe('Skipped');
    expect(statusLabel('declined')).toBe('Declined');
    expect(statusLabel('empty')).toBe('Not yet');
  });

  it('gives each status a tone', () => {
    expect(statusTone('confirmed')).toBe('good');
    expect(statusTone('provisional')).toBe('pending');
    expect(statusTone('declined')).toBe('warn');
    expect(statusTone('deferred')).toBe('muted');
    expect(statusTone('empty')).toBe('muted');
  });
});

describe('fieldRows', () => {
  it('always lists the four items in a fixed order', () => {
    const rows = fieldRows(snapshot().state);
    expect(rows.map((row) => row.field)).toEqual(['agentName', 'userName', 'helpTopic', 'gmail']);
    expect(rows.every((row) => row.value === null && row.status === 'Not yet')).toBe(true);
  });

  it('shows a name heard by voice as heard, then confirmed', () => {
    const heard = fieldRows(snapshot({ known: { userName: { value: 'Jonathan', status: 'provisional' } } }).state);
    expect(heard.find((row) => row.field === 'userName')).toMatchObject({
      value: 'Jonathan',
      status: 'Heard',
      tone: 'pending',
    });
    const confirmed = fieldRows(snapshot({ known: { userName: { value: 'Jonathan' } } }).state);
    expect(confirmed.find((row) => row.field === 'userName')).toMatchObject({ status: 'Confirmed', tone: 'good' });
  });

  it('shows skipped and declined items', () => {
    const rows = fieldRows(snapshot({ missing: { agentName: 'deferred', gmail: 'declined' } }).state);
    expect(rows.find((row) => row.field === 'agentName')?.status).toBe('Skipped');
    expect(rows.find((row) => row.field === 'gmail')).toMatchObject({ status: 'Declined', tone: 'warn' });
  });

  it('labels the sample inbox so it is not mistaken for real mail', () => {
    const rows = fieldRows(
      snapshot({ known: { gmail: { value: 'Sample inbox' } }, gmail: { connected: true, mode: 'sample' } }).state,
    );
    const gmail = rows.find((row) => row.field === 'gmail');
    expect(gmail).toMatchObject({ value: 'Sample inbox', status: 'In use' });
    expect(gmail?.note).toContain('not connected');
  });

  it('shows a real account as connected', () => {
    const rows = fieldRows(
      snapshot({ known: { gmail: { value: 'jon@example.com' } }, gmail: { connected: true, mode: 'real' } }).state,
    );
    expect(rows.find((row) => row.field === 'gmail')).toMatchObject({ value: 'jon@example.com', status: 'Connected' });
  });

  it('shows an offer that has not been answered and the last failure', () => {
    const offered = fieldRows(snapshot({ gmail: { offered: true } }).state).find((row) => row.field === 'gmail');
    expect(offered).toMatchObject({ status: 'Offered', tone: 'pending' });
    const failed = fieldRows(snapshot({ gmail: { offered: true, failureReason: 'popup_closed' } }).state).find(
      (row) => row.field === 'gmail',
    );
    expect(failed?.note).toBe('The Google window was closed.');
  });
});

describe('names and phases', () => {
  it('falls back to Persona until a name is chosen', () => {
    expect(agentName(null)).toBe('Persona');
    expect(agentName(snapshot())).toBe('Persona');
    expect(agentName(snapshot({ known: { agentName: { value: 'Max' } } }))).toBe('Max');
  });

  it('has no user name until one is captured', () => {
    expect(userName(snapshot())).toBeNull();
    expect(userName(snapshot({ known: { userName: { value: 'Jon', status: 'provisional' } } }))).toBe('Jon');
  });

  it('labels phases and call endings', () => {
    expect(phaseLabel('onboarding')).toBe('Getting set up');
    expect(phaseLabel('graduated')).toBe('Main experience');
    expect(endReasonLabel('user_hangup')).toBe('You hung up');
    expect(endReasonLabel('network_drop')).toBe('The connection dropped');
    expect(endReasonLabel(null)).toBeNull();
  });
});
