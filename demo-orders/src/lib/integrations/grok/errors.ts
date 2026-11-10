import type { GrokLogOutcome } from "@/types";

/** An expected failure whose message is safe to return to the bot. */
export class GrokCommandError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly outcome: Extract<GrokLogOutcome, "denied" | "error"> = "error",
  ) {
    super(message);
  }
}
