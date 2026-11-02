import { z } from "zod";
import { AppError } from "./errors";
import type { Draft, PropertyDetails } from "./types";

export const proposalRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    sourceVersion: z.number().int().positive(),
  })
  .strict();
export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
const draftSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(40)
      .max(1600)
      .refine(
        (value) => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value),
      ),
  })
  .strict();
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string", minLength: 40, maxLength: 1600 },
  },
  required: ["description"],
  additionalProperties: false,
};
function invalidDraft(): never {
  throw new AppError(
    "INVALID_AI_OUTPUT",
    "The model returned an invalid proposal. Your listing is unchanged; please retry.",
    502,
  );
}
export function parseDraft(value: unknown, facts: PropertyDetails): Draft {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      invalidDraft();
    }
  }
  const parsed = draftSchema.safeParse(candidate);
  if (!parsed.success) invalidDraft();
  const { description } = parsed.data;
  // Narrow checks for known failures. Human review still owns factual accuracy.
  if (
    (facts.beds > 0 && /\bstudio\b/i.test(description)) ||
    /[$£€]|\bavailable now\b|\bper month\b|\bper week\b/i.test(description)
  ) {
    throw new AppError(
      "UNSUPPORTED_AI_CLAIM",
      "The proposal included an unsupported claim. Your listing is unchanged; please retry.",
      502,
    );
  }
  const counts: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  for (const match of description.matchAll(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)[\s-]*(bedrooms?|beds?|bathrooms?|baths?)\b/gi,
  )) {
    const raw = match[1];
    const label = match[2];
    if (raw === undefined || label === undefined) continue;
    if (
      (counts[raw.toLowerCase()] ?? Number(raw)) !==
      (/^bed/i.test(label) ? facts.beds : facts.baths)
    ) {
      throw new AppError(
        "UNSUPPORTED_AI_CLAIM",
        "The proposal changed a room count. Your listing is unchanged; please retry.",
        502,
      );
    }
  }
  for (const match of description.matchAll(
    /\b(\d+(?:\.\d+)?)\s*(square metres?|square meters?|sqm|sq\.?\s*m|m²)\b/gi,
  )) {
    if (Number(match[1]) !== facts.sizeSqm)
      throw new AppError(
        "UNSUPPORTED_AI_CLAIM",
        "The proposal changed the floor area. Your listing is unchanged; please retry.",
        502,
      );
  }
  return { description };
}
