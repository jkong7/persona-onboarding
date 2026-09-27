export class VersionConflictError extends Error {
  readonly onboardingId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(onboardingId: string, expectedVersion: number, actualVersion: number) {
    super(`version conflict on ${onboardingId}: expected ${expectedVersion}, found ${actualVersion}`);
    this.name = 'VersionConflictError';
    this.onboardingId = onboardingId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class OnboardingNotFoundError extends Error {
  readonly onboardingId: string;

  constructor(onboardingId: string) {
    super(`onboarding ${onboardingId} not found`);
    this.name = 'OnboardingNotFoundError';
    this.onboardingId = onboardingId;
  }
}

export class EventTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventTargetError';
  }
}
