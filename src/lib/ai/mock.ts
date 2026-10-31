/**
 * Offline mode (MOCK_AI=1). Returns a saved, hand-checked run so the team can
 * work on the UI, run tests, or rescue a live demo when the API is down.
 *
 * The first draft deliberately contains three mistakes (an over-long Google
 * headline, a banned "bias-free" claim and an invented statistic) so the
 * checker → revise loop has something real to catch.
 */
import type { CheckOutput, ContentPack, Plan, Research } from "@/lib/content/schemas";

export type MockTask = "research" | "plan" | "write" | "check" | "revise" | "browse" | "image";

export const MOCK_TOPIC = "Slow first-round interviews are costing BPOs their best applicants";

const research: Research = {
  topicSummary:
    "High-volume support hiring loses good applicants when the first round takes days to schedule. Faster, always-available first interviews in the candidate's language keep people in the process, while recruiters still decide who moves on.",
  sourceFacts: [],
  clientWebFacts: [],
  relevantClientFactIds: ["C9", "C2", "C4", "C8", "C12", "C7", "C21"],
  cautions: [
    "The 48-hour result is one BPO customer's outcome, not an industry average. Say \"one BPO customer\".",
    "There is no drop-off statistic in the fact sheet. Describe drop-off in words, without a number.",
  ],
};

const plan: Plan = {
  audience: "HR and talent acquisition heads at BPOs hiring support staff every week",
  angle: "Speed in the first round is a candidate-experience issue, not just a recruiter-workload issue.",
  keyMessage: "Run the first round 24×7 in the candidate's language, and your team still makes the call.",
  factIds: ["C9", "C2", "C4", "C12", "C21"],
  cta: "Try a sample AI interview",
};

const blogBody = `Every recruiter in a busy support centre knows the pattern. A strong applicant applies on Monday. Your team is buried in screening calls, so the first interview lands on Thursday. By then, that applicant has accepted another offer.

The first round is where high-volume hiring quietly leaks talent. Not because recruiters are slow, but because there are only so many calls a person can make in a day.

## Where the days go

Most first rounds follow the same steps: shortlist from the job portal, call to schedule, reschedule when the candidate is at their current job, run a short conversation, write notes, repeat. Multiply that by a few hundred applicants a week and the calendar fills up before anyone gets interviewed.

Candidates feel that delay. Many of the people applying for support roles are already working shifts. Their free time is late evening, which is exactly when your recruiters have gone home.

## Meet candidates when they are free

HireLoop runs your first round 24×7. Candidates get a link and interview by voice or video when it suits them, even at 11 PM after work.

They can also answer in their own language. HireLoop works in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali and Gujarati, so a strong Tamil-speaking applicant is judged on how they handle a customer, not on how quickly they found a call slot.

## Your rubric, your decision

Speed only helps if the conversation is useful. Your team sets the rubric: the role, the skills that matter and how to score them. The AI asks role-specific questions with follow-ups and scores each answer against that rubric.

Recruiters then get a report with the full transcript, the recording and highlights. They choose who moves on. The AI recommends; it never rejects a candidate on its own.

## What changes in practice

One BPO customer finished first-round interviews in 48 hours, down from 12 days. Recruiters stopped spending their mornings on scheduling and started their day with a set of reports to review.

That time goes back into the conversations that need a person: the second round, the offer call, the candidate who has a question about shift timings. By HireLoop's numbers, that is about 15 hours saved per recruiter every week.

It also changes how a hiring drive feels from the inside. Instead of chasing calendars, the team works from a shared rubric. When two recruiters disagree about a candidate, they can open the same transcript and the same scores, and talk about the evidence rather than their notes from a rushed call.

Candidates notice the difference too. Every interview begins by telling them they are speaking with an AI, and every candidate gets the same questions, scored on the same rubric, with the reasons shown.

## A fair first step

Faster does not have to mean colder. A first round that runs in the candidate's language, at a time that works for them, with a person making the decision, is a better experience on both sides of the table.

If your team is hiring every week, see it from the candidate's side first. Try a sample AI interview: ten minutes, by voice, exactly what your applicants would experience.`;

const draft: ContentPack = {
  blog: {
    title: "Slow first rounds are costing you your best applicants",
    metaDescription:
      "High-volume support hiring loses good applicants in the first round. Here is how 24×7 interviews in their own language keep them, while recruiters decide.",
    body: blogBody,
    factIds: ["C1", "C2", "C4", "C5", "C6", "C7", "C9", "C12", "C13", "C14", "C21"],
  },
  linkedin: {
    body: `Your best applicant for that support role probably applied after 9 PM.

And by the time your team calls back on Thursday, 70% of applicants have already moved on.

The first round is where high-volume hiring leaks talent. Not because recruiters are slow. Because there are only so many calls in a day.

What we see working instead:
→ Candidates interview by voice or video when it suits them, even at 11 PM after work
→ They answer in their own language, from Hindi to Gujarati
→ Your rubric scores every answer the same way
→ Recruiters review the transcript and decide who moves on

One BPO customer finished first-round interviews in 48 hours, down from 12 days.

See what your candidates would experience: try a 10-minute sample AI interview.`,
    factIds: ["C2", "C3", "C4", "C6", "C7", "C9", "C21"],
  },
  xThread: {
    posts: [
      "Strong applicants for support roles rarely wait a week for a first-round call. Here's what high-volume hiring teams can change. 🧵",
      "1/ The delay isn't recruiter effort. It's maths: scheduling, rescheduling and short calls, a few hundred times a week.",
      "2/ Candidates are often working shifts. Their free time is late evening. Let them interview by voice or video then, even at 11 PM.",
      "3/ Let them answer in their own language. HireLoop runs first rounds in 9 Indian languages, from Hindi and Tamil to Bengali.",
      "4/ Keep people in charge. Your rubric scores every answer; recruiters read the transcript and choose who moves on. The AI only recommends.",
      "5/ One BPO customer went from 12 days to 48 hours for first-round interviews. See the candidate side yourself: try the sample AI interview. #HiringIndia",
    ],
    factIds: ["C2", "C3", "C4", "C6", "C7", "C9", "C12", "C21"],
  },
  instagram: {
    caption: `Hiring doesn't sleep. Neither does HireLoop. 🌙

Your next great support hire might only be free at 11 PM, after their shift. Let them interview then, by voice or video, in their own language.

Your rubric scores every answer. Your recruiters decide who moves on.

Try a 10-minute sample AI interview, link in bio.`,
    hashtags: ["HiringIndia", "TalentAcquisition", "BPOHiring", "Recruitment", "HRTech"],
    factIds: ["C2", "C3", "C6", "C7", "C21"],
  },
  metaAds: [
    {
      primaryText: "Your applicants are free at 11 PM. Your recruiters aren't. Run first-round interviews 24×7, in 9 Indian languages.",
      headline: "First rounds that never wait",
      description: "Your team decides",
      cta: "Learn more",
      factIds: ["C1", "C2", "C4", "C12"],
    },
    {
      primaryText: "Bias-free first rounds: every candidate gets the same questions, scored on your rubric, with the reasons shown.",
      headline: "Same questions. Same rubric.",
      description: "Recruiters choose",
      cta: "Learn more",
      factIds: ["C14", "C7"],
    },
    {
      primaryText: "One BPO customer cut first-round interviews from 12 days to 48 hours. See what candidates experience in 10 minutes.",
      headline: "Try a sample AI interview",
      description: "10 minutes, by voice",
      cta: "Sign up",
      factIds: ["C9", "C21"],
    },
  ],
  googleAds: [
    {
      headlines: ["AI First-Round Interviews", "Interviews in 9 Languages", "Your Team Makes the Call"],
      descriptions: [
        "Candidates interview 24×7 by voice or video. Recruiters review transcripts and decide.",
        "From ₹250 per AI interview. No setup fee. Try a 10-minute sample interview today.",
      ],
      path1: "ai-interviews",
      path2: "bpo-hiring",
      factIds: ["C1", "C3", "C4", "C7", "C16", "C21"],
    },
    {
      headlines: ["Hire Support Staff Faster", "Shortlist Candidates in 48 Hours Flat", "Works With Naukri"],
      descriptions: [
        "One BPO customer finished first rounds in 48 hours, down from 12 days.",
        "Role-specific questions, scored on your rubric. People make the final decision.",
      ],
      path1: "bpo-hiring",
      path2: "48-hours",
      factIds: ["C8", "C9", "C6", "C12", "C20"],
    },
    {
      headlines: ["Candidates Interview at 11 PM", "Hindi, Tamil, Telugu & More", "Try a Sample AI Interview"],
      descriptions: [
        "Let applicants answer in their own language, any time. Your rubric scores every answer.",
        "Candidates are always told they're speaking with an AI. Data stored in India.",
      ],
      path1: "languages",
      path2: "sample",
      factIds: ["C2", "C3", "C4", "C6", "C13", "C15", "C21"],
    },
  ],
  imageBrief: {
    concept:
      "The moment the first round fits the candidate's life: a support-role applicant taking a voice interview at home after their shift.",
    scene:
      "A young Indian woman in her mid-20s sits at a small table by a window in a modest, tidy apartment at night, speaking into her phone with earphones in, relaxed and focused. A cup of chai beside her; city lights soft through the window.",
    composition:
      "Medium shot from a slight side angle at eye level. Subject on the left third, generous calm space on the right for ad copy to be added later. Shallow depth of field.",
    lighting: "Warm indoor lamp light on her face, cool blue evening light from the window.",
    palette:
      "Violet (#5B45D0) appears naturally in her cushion and phone case; soft lavender wall; touches of mint. No harsh saturation.",
    avoid: [
      "Text, letters, logos or app screens",
      "Robots or glowing AI imagery",
      "An office or interview panel",
      "Visible brand names",
    ],
    aspectRatio: "1:1",
    channel: "Instagram and Meta ads",
    altText: "A young woman at home in the evening, speaking into her phone with earphones, calm and focused.",
  },
};

/** Fixed versions of the three pieces the checker should block. */
const fixed: Partial<Record<string, unknown>> = {
  // The draft blog is short of the 650-word floor on purpose, so offline runs show the expansion.
  blog: {
    ...draft.blog,
    body: blogBody.replace(
      /\n## /,
      `
## Fair by design, not by promise

Fairness in a first round usually depends on who picks up the phone and how their day is going. By the fortieth call, questions drift, notes get shorter and two candidates with the same answer can walk away with different outcomes. Nobody intends it; it is simply what happens when people repeat the same conversation all week.

A structured first round removes most of that drift. Every candidate gets the same questions and is scored on the same rubric, with the reasons shown next to each score. Your team decides what the rubric rewards, so the standard is theirs, applied the same way at 10 AM and at 11 PM.

The practical takeaway: write the rubric before the drive starts, and review a handful of scored transcripts in the first week. If a score looks wrong, change the rubric, not the candidate.

## `,
    ),
  },
  linkedin: {
    ...draft.linkedin,
    body: draft.linkedin.body.replace(
      "And by the time your team calls back on Thursday, 70% of applicants have already moved on.",
      "By the time your team calls back on Thursday, many strong applicants have already moved on.",
    ),
  },
  "meta-2": {
    ...draft.metaAds[1],
    primaryText:
      "A fairer first round: every candidate gets the same questions, scored on your rubric, with the reasons shown.",
  },
  "google-2": {
    ...draft.googleAds[1],
    headlines: ["Hire Support Staff Faster", "Shortlists in 48 Hours", "Works With Naukri"],
  },
};

/** AI-reviewer findings. Each only "fires" while its excerpt is still in the draft. */
const aiFindings: CheckOutput["findings"] = [
  {
    pieceId: "linkedin",
    excerpt: "70% of applicants have already moved on",
    kind: "unsupported_claim",
    severity: "block",
    message: "No source supports a 70% drop-off figure. Neither the fact sheet nor an article mentions it.",
    suggestion: "many strong applicants have already moved on",
  },
  {
    pieceId: "meta-2",
    excerpt: "Bias-free first rounds",
    kind: "misleading",
    severity: "block",
    message: "HireLoop helps reduce bias (C14). Calling it bias-free overstates it, which is risky in hiring ads.",
    suggestion: "A fairer first round",
  },
  {
    pieceId: "instagram",
    excerpt: "Hiring doesn't sleep. Neither does HireLoop.",
    kind: "tone",
    severity: "warn",
    message: "Fun hook, but it can read as round-the-clock pressure on candidates. The site frames 24×7 as flexibility for them.",
    suggestion: "Interview when it suits you. Even at 11 PM.",
  },
];

export function mockStructured(task: MockTask, prompt: string): unknown {
  switch (task) {
    case "research":
      return research;
    case "plan":
      return plan;
    case "write":
      return structuredClone(draft);
    case "check":
      return { findings: aiFindings.filter((f) => prompt.includes(f.excerpt)) };
    case "revise": {
      const id = /PIECE_ID: ([a-z0-9-]+)/.exec(prompt)?.[1] ?? "";
      // A person's request ("make it warmer"): change the current piece visibly, so
      // the before-and-after view has something to show offline, for any piece.
      const note = /Reviewer's request: (.+)/.exec(prompt)?.[1];
      // The piece is pretty-printed JSON; its closing brace is the only "}" at the start of a line.
      const current = /Current version \(JSON\):\n(\{[\s\S]*?\n\})\n/.exec(prompt)?.[1];
      if (note && current) return offlineRewrite(JSON.parse(current), note);
      const revised = fixed[id];
      if (revised) return structuredClone(revised);
      // No stored fix (for example another client's rules flagged the sample text): keep the piece.
      if (current) return JSON.parse(current);
      throw new Error(`Mock has no revised version of ${id}.`);
    }
    default:
      throw new Error(`Mock has no output for ${task}.`);
  }
}

/** A brand-coloured placeholder so the image panel has something to show offline. */
export function mockImage(aspectRatio: "1:1" | "4:5" | "16:9"): { bytes: Uint8Array; mediaType: string } {
  const [w, h] = aspectRatio === "16:9" ? [1600, 900] : aspectRatio === "4:5" ? [1080, 1350] : [1080, 1080];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26215C"/><stop offset="1" stop-color="#16142E"/>
    </linearGradient>
    <radialGradient id="lamp" cx="0.3" cy="0.45" r="0.55">
      <stop offset="0" stop-color="#FFD9A8" stop-opacity="0.55"/><stop offset="1" stop-color="#FFD9A8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#night)"/>
  <rect x="${w * 0.52}" y="${h * 0.1}" width="${w * 0.38}" height="${h * 0.52}" rx="10" fill="#2E2870"/>
  ${Array.from({ length: 26 }, (_, i) => `<rect x="${w * 0.55 + ((i * 67) % (w * 0.32))}" y="${h * 0.42 - ((i * 41) % (h * 0.26))}" width="${w * 0.012}" height="${h * 0.2}" fill="#16142E" opacity="0.55"/><circle cx="${w * 0.555 + ((i * 97) % (w * 0.33))}" cy="${h * 0.18 + ((i * 53) % (h * 0.36))}" r="${2 + (i % 3)}" fill="#FFD9A8" opacity="${0.35 + (i % 4) * 0.15}"/>`).join("")}
  <rect width="${w}" height="${h}" fill="url(#lamp)"/>
  <rect x="0" y="${h * 0.74}" width="${w}" height="${h * 0.26}" fill="#3B3480"/>
  <rect x="${w * 0.22}" y="${h * 0.46}" width="${w * 0.15}" height="${w * 0.27}" rx="${w * 0.02}" fill="#F3F1FD" transform="rotate(-8 ${w * 0.3} ${h * 0.6})"/>
  <rect x="${w * 0.235}" y="${h * 0.48}" width="${w * 0.12}" height="${w * 0.22}" rx="${w * 0.012}" fill="#5B45D0" transform="rotate(-8 ${w * 0.3} ${h * 0.6})"/>
  ${[0, 1, 2].map((k) => `<path d="M ${w * (0.42 + k * 0.05)} ${h * 0.5} q ${w * 0.03} ${h * 0.06} 0 ${h * 0.12}" stroke="#E6F4EC" stroke-width="${w * 0.006}" fill="none" stroke-linecap="round" opacity="${0.9 - k * 0.25}"/>`).join("")}
  <rect x="${w * 0.66}" y="${h * 0.66}" width="${w * 0.09}" height="${h * 0.1}" rx="6" fill="#E6F4EC"/>
  <text x="${w / 2}" y="${h - 32}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(h * 0.022)}" fill="#F3F1FD" opacity="0.7">Offline sample image (MOCK_AI=1)</text>
</svg>`;
  return { bytes: new TextEncoder().encode(svg), mediaType: "image/svg+xml" };
}

export const mockFixtures = { research, plan, draft, fixed, aiFindings };

/** The longest text in the piece gets a labelled sentence, so the change is easy to spot. */
function offlineRewrite(piece: Record<string, unknown>, note: string): Record<string, unknown> {
  const out = structuredClone(piece);
  let best: { obj: Record<string, unknown> | unknown[]; key: string | number; len: number } | null = null;
  const walk = (obj: Record<string, unknown> | unknown[]) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "factIds") continue;
      if (typeof v === "string" && v.length > (best?.len ?? 0)) best = { obj, key: Array.isArray(obj) ? Number(k) : k, len: v.length };
      else if (v && typeof v === "object") walk(v as Record<string, unknown>);
    }
  };
  walk(out);
  const target = best as { obj: Record<string, unknown>; key: string } | null;
  if (target) target.obj[target.key] = `${target.obj[target.key] as string} (Offline sample rewrite: ${note.trim()}.)`;
  return out;
}
