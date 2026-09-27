const ONBOARDING_KEY = 'persona.onboardingId';
const SOUND_KEY = 'persona.ringtoneMuted';
const REVIEWER_KEY = 'persona.reviewerTools';
const ACTIVITY_PREFIX = 'persona.activity.';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

export function loadReviewerTools(): boolean {
  return read(REVIEWER_KEY) === 'on';
}

export function saveReviewerTools(on: boolean): void {
  write(REVIEWER_KEY, on ? 'on' : 'off');
}

export function loadOnboardingId(): string | null {
  const value = read(ONBOARDING_KEY);
  return value !== null && value.length > 0 && value.length <= 128 ? value : null;
}

export function saveOnboardingId(id: string): void {
  write(ONBOARDING_KEY, id);
}

export function clearOnboardingId(): void {
  remove(ONBOARDING_KEY);
}

export function loadRingtoneMuted(): boolean {
  return read(SOUND_KEY) === 'true';
}

export function saveRingtoneMuted(muted: boolean): void {
  write(SOUND_KEY, muted ? 'true' : 'false');
}

export function loadJson<T>(key: string, guard: (value: unknown) => value is T): T | null {
  const raw = read(key);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    write(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function activityKey(id: string): string {
  return `${ACTIVITY_PREFIX}${id}`;
}

export function clearActivity(id: string): void {
  remove(activityKey(id));
}
