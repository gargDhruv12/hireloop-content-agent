# Channel rules

The limits the rules checker enforces (`src/lib/content/pieces.ts`). **Hard** limits are where a platform cuts or rejects text, so they block approval. **Soft** limits are where text gets hidden behind "See more" or stops reading well, so they only warn.

Platforms change these. Check each platform's help pages before a real campaign and update `LIMITS` in one place.

| Channel | Field | Limit | Type |
|---|---|---|---|
| Google responsive search ad | Headline | 30 characters | Hard |
| | Description | 90 characters | Hard |
| | Display path | 15 characters, no spaces | Hard |
| Meta ad | Primary text | 125 characters before "See more" | Soft |
| | Headline | 40 characters | Soft |
| | Description | 30 characters | Soft |
| X | Post | 280 characters | Hard |
| LinkedIn | Post | 3,000 characters | Hard |
| | Post | 1,300 characters read well; ~210 show before "see more" | Soft |
| Instagram | Caption | 2,200 characters | Hard |
| | Caption | ~125 characters show before "more" | Soft |
| | Hashtags | 30 maximum; 3–6 recommended | Hard / Soft |
| Blog | Title | 70 characters (search results) | Soft |
| | Meta description | 155 characters | Soft |
| | Body | 450–1,300 words, with subheadings | Soft |

## Brand rules (HireLoop)

From `src/clients/hireloop.ts`. These block approval:

- The AI decides / rejects / hires / picks candidates → the AI only recommends; recruiters decide
- Automatically reject / shortlist / hire
- Bias-free, unbiased, eliminates bias, removes bias → the site says "helps reduce bias"
- Replaces recruiters
- Guarantees, "100%", "#1", "best in India"
- Hype words: revolutionary, game-changer, 10x, disrupt
