import type { ImageBrief } from "@/lib/content/schemas";
import { generateImage } from "@/lib/ai/gemini";
import { saveImage } from "@/lib/store/runs";
import { imagePrompt } from "./prompts";

/** Step 6 · Image: the writer's brief becomes a prompt for a separate image model. */
export async function makeImage(runId: string, brief: ImageBrief): Promise<{ file: string; mediaType: string; prompt: string }> {
  const prompt = imagePrompt(brief);
  const { bytes, mediaType } = await generateImage({ prompt, aspectRatio: brief.aspectRatio });
  const file = await saveImage(runId, bytes, mediaType);
  return { file, mediaType, prompt };
}
