import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import type { z } from "zod";

export const AI_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Streams a structured Responses call through Lovable AI Gateway and returns the parsed object. */
export async function runStructured<T>(schema: z.ZodType<T>, instructions: string, prompt: string): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (missing LOVABLE_API_KEY).");
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      if (!res.ok) {
        const body = await res.clone().text();
        const msg =
          res.status === 402
            ? "AI credits are exhausted. Add credits in Settings → Plans & credits."
            : res.status === 429
              ? "AI is rate limited right now. Please try again in a minute."
              : `AI request failed [${res.status}]: ${body.slice(0, 300)}`;
        throw new Error(msg);
      }
      return res;
    },
  });
  const result = streamText({
    model: provider.responses(AI_MODEL),
    instructions,
    prompt,
    output: Output.object({ schema }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  try {
    return (await result.output) as T;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error("AI returned an unreadable result. Please try again.");
    throw e;
  }
}
