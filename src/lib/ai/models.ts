/** Model choices come from .env so the team can swap models without touching code. */
export const models = {
  text: process.env.TEXT_MODEL || "gemini-3.8-flash",
  writer: process.env.WRITER_MODEL || process.env.TEXT_MODEL || "gemini-3.8-flash",
  image: process.env.IMAGE_MODEL || "gemini-nano-banana-2.1",
};

export function isMock(): boolean {
  return process.env.MOCK_AI === "1" || process.env.MOCK_AI === "true";
}

export function assertConfigured(): void {
  if (isMock()) return;
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "No Gemini API key found. Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local, or set MOCK_AI=1 to try the app with sample output.",
    );
  }
}
