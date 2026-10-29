import type { ClientProfile } from "./types";

/**
 * HireLoop (fictional client). Every fact below was copied from the client's
 * website. If it isn't here, or in the article the user supplied, the agent
 * must not claim it.
 */
export const hireloop: ClientProfile = {
  name: "HireLoop",
  oneLiner:
    "An AI interviewer that runs the first round of hiring 24×7, by voice or video, in 9 Indian languages. Recruiters make the decision.",
  siteUrl: process.env.CLIENT_SITE_URL || undefined,
  audiences: [
    "HR and talent acquisition heads at BPOs and customer support centres hiring at volume",
    "Recruiters and recruitment managers at Indian companies that hire every week",
    "Founders and HR leads at growing Indian companies starting to hire at scale",
  ],
  voice: {
    summary:
      "Calm, clear and practical. Talks to busy HR teams like a colleague who has run hiring drives. Confident about speed, careful about fairness. No hype.",
    do: [
      "Lead with the recruiter's problem: slow first rounds, piles of applicants, candidates who drop off.",
      "Say plainly that recruiters make the final decision; the AI recommends.",
      "Mention that candidates are told they are speaking with an AI when the post is about the candidate experience.",
      "Use Indian context naturally: rupees, Indian languages, BPO and support hiring, Naukri.",
      "Use short sentences and concrete numbers from the fact sheet.",
    ],
    dont: [
      "Never say the AI decides, rejects, hires or picks candidates.",
      "Never claim HireLoop removes or eliminates bias. The site says it helps reduce bias.",
      "Never say HireLoop replaces recruiters.",
      "No invented statistics, customer names, quotes or awards.",
      "No fear-based or hype language (\"revolutionary\", \"game-changer\", \"10x\").",
    ],
  },
  primaryCta: {
    label: "Try a sample AI interview",
    detail: "A 10-minute sample interview by voice, so teams see exactly what candidates experience.",
  },
  facts: [
    { id: "C1", where: "Hero", text: "HireLoop is an AI interviewer that runs a company's first round of interviews 24×7." },
    { id: "C2", where: "Hero", text: "Candidates can interview when it suits them, even at 11 PM after work." },
    { id: "C3", where: "How it works", text: "Candidates interview by voice or video, any time, in their own language." },
    { id: "C4", where: "How it works", text: "HireLoop works in 9 languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali and Gujarati." },
    { id: "C5", where: "How it works", text: "Teams set the rubric: they pick the role, the skills that matter and how to score them. Rubric templates are included." },
    { id: "C6", where: "How it works", text: "The AI asks role-specific questions with follow-ups and scores each answer against the team's rubric." },
    { id: "C7", where: "How it works", text: "Recruiters get a report with the full transcript, the recording and highlights, and they choose who moves on." },
    { id: "C8", where: "How it works", text: "HireLoop takes teams from applicant to shortlist in 48 hours." },
    { id: "C9", where: "Results", text: "One BPO customer finished first-round interviews in 48 hours, down from 12 days." },
    { id: "C10", where: "Results", text: "HireLoop saves about 15 hours per recruiter every week." },
    { id: "C11", where: "Results", text: "Candidates rate the AI interview 4.4 out of 5 on average." },
    { id: "C12", where: "Fairness", text: "People make the decision: the AI recommends and never rejects a candidate on its own." },
    { id: "C13", where: "Fairness", text: "Every interview starts by telling the candidate they are speaking with an AI." },
    { id: "C14", where: "Fairness", text: "HireLoop helps reduce bias: every candidate gets the same questions and is scored on the same rubric, with the reasons shown." },
    { id: "C15", where: "Fairness", text: "Candidate data is stored in India and handled in line with the Digital Personal Data Protection Act, 2023." },
    { id: "C16", where: "Pricing", text: "Pricing starts from ₹250 per AI interview, with no setup fee." },
    { id: "C17", where: "Pricing", text: "Starter costs ₹24,999 a month and includes 100 AI interviews a month, 9 languages with voice and video, and rubric templates." },
    { id: "C18", where: "Pricing", text: "Growth costs ₹99,999 a month and includes 500 AI interviews a month, AI resume screening, interview scheduling and reminders, and ATS integrations." },
    { id: "C19", where: "Pricing", text: "Enterprise has custom pricing for high-volume and multi-location hiring, with custom interview volume, SSO and audit logs, and a dedicated success manager." },
    { id: "C20", where: "Pricing", text: "HireLoop works with Naukri, LinkedIn Jobs, Google Calendar, Outlook, Zoho People and Darwinbox." },
    { id: "C21", where: "Call to action", text: "Teams can sit a 10-minute sample AI interview by voice to see exactly what candidates experience." },
  ],
  bannedPhrases: [
    { pattern: "\\b(?:the )?ai (?:decides|rejects|hires|selects|picks|chooses|filters out)\\b", reason: "The AI only recommends. Recruiters make every decision (C12)." },
    { pattern: "\\b(?:automatically|auto-?)\\s*(?:reject|shortlist|hire)s?\\b", reason: "Nothing is automatic about decisions. Recruiters choose who moves on (C7, C12)." },
    { pattern: "\\b(?:bias[- ]free|unbiased|zero bias|eliminat\\w* bias|remov\\w* (?:all )?bias|no more bias|without bias)\\b", reason: "The site only says HireLoop helps reduce bias (C14)." },
    { pattern: "\\breplac\\w* (?:your |the |human )?recruiters?\\b", reason: "HireLoop supports recruiters; it doesn't replace them." },
    { pattern: "\\bguarantee[ds]?\\b", reason: "No guarantees are made on the site." },
    { pattern: "\\b100\\s?%", reason: "Absolute claims aren't supported by the fact sheet." },
    { pattern: "(?:#1\\b|\\bnumber one\\b|\\bbest in (?:india|the world|class)\\b)", reason: "No ranking or award is on the fact sheet." },
    { pattern: "\\b(?:revolutionary|game[- ]chang\\w*|10x|disrupt\\w*)\\b", reason: "Hype words are off-voice for HireLoop." },
  ],
  visual: {
    palette: [
      { name: "HireLoop violet", hex: "#5B45D0" },
      { name: "Lavender wash", hex: "#F3F1FD" },
      { name: "Deep night", hex: "#16142E" },
      { name: "Soft mint", hex: "#E6F4EC" },
      { name: "White", hex: "#FFFFFF" },
    ],
    style:
      "Clean, modern and calm. Soft natural light, lots of white space, violet as the accent colour. Real Indian workplaces and people in everyday moments: a support centre floor, a recruiter at a laptop, a candidate on a phone at home in the evening.",
    avoid: [
      "Any text, letters, logos or UI screenshots inside the image",
      "Robots, glowing brains, circuit boards or sci-fi AI clichés",
      "Fake product dashboards with readable numbers",
      "Real brand logos (Naukri, LinkedIn and others)",
      "Anything suggesting a machine judging or rejecting a person",
    ],
  },
};
