import type {
  IdentityProfile,
  Layer1Outcome,
  Layer1Provider,
} from "@/lib/types/verification";

export interface Layer1Verifier {
  verify(profile: IdentityProfile): Promise<Layer1Outcome>;
}

export class MockCreditBureauVerifier implements Layer1Verifier {
  constructor(private readonly provider: Layer1Provider) {}

  async verify(profile: IdentityProfile): Promise<Layer1Outcome> {
    const signal = `${profile.firstName}${profile.lastName}${profile.documentNumber}`
      .toLowerCase()
      .replace(/\s+/g, "");

    if (signal.includes("fraud") || signal.includes("flag")) {
      return "flagged";
    }

    if (signal.length % 2 === 0) {
      return "match";
    }

    return "no_match";
  }

  getProvider(): Layer1Provider {
    return this.provider;
  }
}
