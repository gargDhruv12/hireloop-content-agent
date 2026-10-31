# Eval baseline — 31 October 2026

The reference point for every prompt, model or checker change. Re-run before merging one and compare against this.

```bash
npm run eval            # 8 live packs, about 8 minutes and ₹55 with the models below
npm run eval:checker    # plants 4 known problems in a sample pack
```

**Models:** `gemini-3.8-flash` (research, plan, writing, checks), `gemini-nano-banana-2.1` (image), thinking level `low`, fallbacks `gemini-3.5-flash, gemini-3.7-flash` (not used in this run).

## Pipeline: 8 packs

| Case | Blocking (first → final) | Revised | Hard limits OK | Numbers traced | Pieces citing facts | Blog words | Research facts | Article cited | Tokens in/out | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| bpo-speed | 3 → 0 | google-1 google-2 | 28/28 | 49/50 | 10/10 | 797 | 22 kept, 0 dropped | no link | 20k / 8k | 70s |
| ai-disclosure | 0 → 0 | none | 28/28 | 19/19 | 10/10 | 916 | 22 kept, 0 dropped | no link | 13k / 6k | 44s |
| regional-languages | 0 → 0 | none | 28/28 | 35/35 | 10/10 | 796 | 22 kept, 0 dropped | no link | 13k / 6k | 40s |
| trap-overclaim | 1 → 0 | x | 29/29 | 32/32 | 10/10 | 722 | 22 kept, 0 dropped | no link | 16k / 6k | 55s |
| link-recruitment | 1 → 0 | blog | 28/28 | 36/36 | 10/10 | 963 | 28 kept, 2 dropped | yes | 22k / 8k | 64s |
| link-ats | 2 → 0 | instagram meta-3 | 28/28 | 27/27 | 10/10 | 852 | 26 kept, 0 dropped | yes | 19k / 7k | 53s |
| link-interview | 0 → 0 | none | 28/28 | 30/30 | 10/10 | 703 | 30 kept, 0 dropped | yes | 17k / 6k | 44s |
| link-bpo-india | 0 → 0 | none | 29/29 | 45/45 | 10/10 | 864 | 24 kept, 5 dropped | yes | 17k / 6k | 44s |

All 8 packs produced an image.

**What this says**

- **Every pack ended with nothing blocking.** 4 of 8 first drafts had blocking problems (7 in total), and self-revision fixed all of them. The trap brief ("tell HR teams HireLoop removes all bias") ended with no banned phrases.
- **Platform limits: 230 of 230 hard-limited fields fit.**
- **Numbers: 273 of 274 traced to a fact.** The one untraced number (bpo-speed) was flagged to the reviewer as a warning, which is the intended behaviour.
- **Every pack with a link cited the article** (S facts). This is the fix from b18bf98 working; before it, packs ignored the supplied article.
- **Blog length: 703–963 words, average 827.** Two blogs ran over the 700–900 brief (916, 963), and none were under it. Over-length only gets a warning above 1,100.
- **Cost:** 136.6k input and 54.2k output tokens for 8 packs, plus 8 images. At Google's listed Standard prices for these models (until 31 December 2026), that is about **$0.57, or ₹7 per pack** at ₹95/$. Prices double from 1 January 2027 for Gemini 3.8 Flash.
- **Time:** 40–70 s per pack, average 52 s.

## Facts the quote check dropped (7)

| Pack | Why dropped | Right call? |
|---|---|---|
| link-bpo-india | Fact adds "2021" and "27" (states) that its quote doesn't contain | Yes, by design |
| link-bpo-india | Fact adds "23 June 2021", which its quote doesn't contain | Yes, by design |
| link-bpo-india | Quote rewords the page ("STPI put India's share…") | Yes: not a real quote |
| link-bpo-india | Quote stitched from two passages with "..." | **No.** Fixed in this PR: ellipsis quotes now pass when every part is on the page, in order |
| link-bpo-india | Quote stitched with "..." | **No.** Same fix |
| link-recruitment | Fact adds "$25,000" and "$100,000" | Yes. But "20%" was also flagged because the quote said "20–25%" (fixed in #34) |
| link-recruitment | Fact adds "2013" (survey year) | Yes, by design |

5 of 7 drops were right. The 2 wrong drops are fixed in this PR, and the range bug in #34.

## Checker: 3 of 4 planted problems caught

| Planted problem | Piece | Caught by | Severity |
|---|---|---|---|
| Invented statistic (70% drop-off) | linkedin | rules | block |
| Overclaim ("bias-free") | meta-2 | rules | block |
| Google headline over 30 characters | google-2 | rules | block |
| Off-tone hook (pressure on candidates) | instagram | **missed** | |

- **The miss:** tone is left entirely to the AI reviewer, and it missed the pressure-on-candidates hook in this run. In earlier runs it caught it, so tone checks are not reliable from one run alone. A person still approves every piece.
- **The one other finding** was the sample blog being 534 words. That is correct, since the sample is short on purpose, not a false alarm.

## How to compare

Re-run both evals and look for:

- any **final blocking > 0**, any **hard limit** under 100%, or **untraced numbers** above 1 in 274
- **article cited** dropping below 4/4
- a **drop** you'd call wrong (read `rejectedFacts` in the run JSON)
- **blog words** outside 650–1,100
- **tokens per pack** rising by more than about 20%
