import type { IdentityProfile, LlmExtraction } from "@/lib/types/verification";

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
};

const DEFAULT_MODEL = process.env.QWEN_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct";

function makeFallbackExtraction(profile: IdentityProfile): LlmExtraction {
  return {
    confidence: 0.5,
    extracted: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      dob: profile.dob,
      documentNumber: profile.documentNumber,
      documentType: profile.documentType,
    },
    rawSummary: "Fallback extraction used because Qwen API is not configured.",
  };
}

export async function extractIdentityWithQwen(args: {
  applicant: IdentityProfile;
  documentImageBase64: string;
  duplicateExactly?: boolean;
}): Promise<LlmExtraction> {
  if (args.duplicateExactly) {
    return {
      confidence: 1,
      extracted: {
        firstName: args.applicant.firstName,
        lastName: args.applicant.lastName,
        dob: args.applicant.dob,
        documentNumber: args.applicant.documentNumber,
        documentType: args.applicant.documentType,
      },
      rawSummary: "Exact duplication mode enabled: identity fields copied exactly as submitted.",
    };
  }

  const baseUrl = process.env.QWEN_BASE_URL;
  const apiKey = process.env.QWEN_API_KEY;

  if (!baseUrl || !apiKey) {
    return makeFallbackExtraction(args.applicant);
  }

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content:
        "You are a strict identity document parser. Return JSON only with keys: firstName,lastName,dob,documentNumber,documentType,confidence,summary.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Extract identity fields from this document image and return only JSON. If uncertain, set null values and lower confidence.",
        },
        {
          type: "image_url",
          image_url: {
            // Accepts a full data URL or bare base64, so the original mime type survives.
            url: args.documentImageBase64.startsWith("data:")
              ? args.documentImageBase64
              : `data:image/jpeg;base64,${args.documentImageBase64}`,
          },
        },
      ],
    },
  ];

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0,
      messages,
    }),
  });

  if (!res.ok) {
    return makeFallbackExtraction(args.applicant);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw = data.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(raw) as {
      firstName?: string;
      lastName?: string;
      dob?: string;
      documentNumber?: string;
      documentType?: "passport" | "driver_license" | "id_card";
      confidence?: number;
      summary?: string;
    };

    return {
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
      extracted: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        dob: parsed.dob,
        documentNumber: parsed.documentNumber,
        documentType: parsed.documentType,
      },
      rawSummary: parsed.summary || "Qwen extraction completed.",
    };
  } catch {
    return {
      confidence: 0.55,
      extracted: {},
      rawSummary: "Model response was not valid JSON; extraction marked uncertain.",
    };
  }
}
