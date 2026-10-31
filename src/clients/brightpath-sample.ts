import type { ClientProfile } from "./types";

/**
 * A made-up second client, for demos and tests of the multi-client desk. Every
 * fact here is invented and marked as a sample: the UI labels the client so
 * nobody publishes it as real. Replace it with a real client's verified facts.
 */
export const brightpathSample: ClientProfile = {
  id: "brightpath-sample",
  name: "Brightpath Tutors (sample)",
  sample: true,
  brand: { domain: "brightpath.example", handle: "brightpath_tutors", tagline: "Live online tutoring for Classes 9–12" },
  oneLiner: "Live one-to-one online tutoring for Class 9–12 students in India, in English and Hindi. Parents see every session's notes.",
  audiences: [
    "Parents of Class 9–12 students in Indian cities",
    "Class 11–12 students preparing for board exams",
  ],
  voice: {
    summary: "Warm, plain and reassuring. Talks to parents like a good class teacher would: specific, honest, never pushy.",
    do: ["Use short sentences and everyday words", "Name the subject and class level", "Invite parents to try a free trial class"],
    dont: ["Promise marks or ranks", "Shame students or compare them to others", "Use exam-panic language"],
  },
  primaryCta: { label: "Book a free trial class", detail: "A free 45-minute trial class with a tutor, booked online." },
  ctaPattern: "\\b(?:(?:free )?trial class|book a (?:free )?(?:trial|class)|talk to a tutor)\\b",
  facts: [
    { id: "C1", where: "Sample fact", text: "Brightpath Tutors runs live one-to-one online tutoring for Class 9–12 students." },
    { id: "C2", where: "Sample fact", text: "Classes are taught in English and Hindi." },
    { id: "C3", where: "Sample fact", text: "Subjects offered are Maths, Physics, Chemistry and Biology." },
    { id: "C4", where: "Sample fact", text: "Parents receive written notes after every session." },
    { id: "C5", where: "Sample fact", text: "Families can book a free 45-minute trial class online." },
    { id: "C6", where: "Sample fact", text: "Sessions run from 7 AM to 10 PM, every day." },
  ],
  bannedPhrases: [
    { pattern: "\\bguarantee\\w*\\b", reason: "No marks or results are guaranteed." },
    { pattern: "\\b(?:top|best|#1) tutors?\\b", reason: "No ranking is on the fact sheet." },
    { pattern: "\\b(?:100|9\\d)\\s?%\\s*(?:marks|score|results?)\\b", reason: "No results claims are on the fact sheet." },
  ],
  visual: {
    palette: [
      { name: "Brightpath teal", hex: "#0F766E" },
      { name: "Warm paper", hex: "#FFF7ED" },
      { name: "Ink", hex: "#1F2937" },
    ],
    style: "Warm, homely and calm. A student studying at a desk at home in the evening, a parent nearby, soft lamp light, teal accents.",
    avoid: ["Any text, letters, logos or UI screenshots inside the image", "Report cards or visible marks", "Stressed or crying students"],
  },
};
