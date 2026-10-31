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
  /** Stable id stored on each run, e.g. "hireloop". */
  id: string;
  name: string;
  /** A made-up client for demos and tests. Shown as such, so its facts are never mistaken for real ones. */
  sample?: boolean;
  /** How the brand appears in the channel previews. */
  brand: { domain: string; handle: string; tagline: string };
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
  /** Regex source (case-insensitive) that counts as a call to action in a blog or post. */
  ctaPattern: string;
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
