import type {
  Layer2Outcome,
  Layer2Provider,
  VerificationRecord,
} from "@/lib/types/verification";

export interface Layer2BiometricVerifier {
  verifyBiometric(record: VerificationRecord): Promise<Layer2Outcome>;
}

export class MockBiometricVerifier implements Layer2BiometricVerifier {
  constructor(private readonly provider: Layer2Provider) {}

  async verifyBiometric(record: VerificationRecord): Promise<Layer2Outcome> {
    const input = `${record.applicant.firstName}${record.applicant.documentNumber}`
      .toLowerCase()
      .replace(/\s+/g, "");

    if (input.includes("fraud")) {
      return "fraud";
    }

    if (record.selfieImageBase64 && input.length % 3 !== 0) {
      return "verified_match";
    }

    return "fail";
  }

  getProvider(): Layer2Provider {
    return this.provider;
  }
}
