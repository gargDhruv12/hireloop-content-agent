/**
 * A client profile is everything the agent is allowed to "know" about a
 * client before it reads anything new. Each fact has a stable id (C1, C2…)
 * so drafts can cite it and reviewers can trace every claim back.
 */
export interface ClientFact {
  id: string;
  text: string;
  /** Where on the client's site the fact comes from, for the reviewer. */
  where: string;
}

export interface ClientProfile {
  name: string;
  oneLiner: string;
  siteUrl?: string;
  /** Who the content is for. The first entry is the default audience. */
  audiences: string[];
  voice: {
    summary: string;
    do: string[];
    dont: string[];
  };
  /** The call to action the brand uses most. */
  primaryCta: { label: string; detail: string };
  facts: ClientFact[];
  /**
   * Phrases that must never appear. Each is a case-insensitive regex source
   * plus the reason a reviewer sees when it is caught.
   */
  bannedPhrases: { pattern: string; reason: string }[];
  visual: {
    palette: { name: string; hex: string }[];
    style: string;
    avoid: string[];
  };
}
