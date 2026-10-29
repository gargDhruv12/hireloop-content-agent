# Friday demo script

About 8 minutes. The brief asks for four things: the agent working on the shared topic, the facts it retrieved, the image brief and visual, and one evaluation result, one failure and one limitation.

## Before the demo

- [ ] `npm run dev` with a real key, and one full run done that morning (warm-up, and a fallback to show)
- [ ] Credits topped up in Google AI Studio; spend cap set
- [ ] Shared test link added to `evals/cases.json` → `shared-news-link`, and `npm run eval -- --only shared` run once
- [ ] `npm run eval:checker` run once, report open
- [ ] Backup: `npm run demo -- -p 3001` in a second terminal (offline sample on port 3001) in case the API is slow

## 1. The problem (30 seconds)

HireLoop sells AI interviews to HR teams. Hiring is sensitive: one overclaim ("bias-free", "the AI decides") is a real risk for the client. So the agent's job isn't just to write. It's to write things that are **true to HireLoop's own facts**, and hand them to a person.

## 2. Run the shared topic (2 minutes)

Paste the shared link, pick the audience, press **Write the content pack**. While it runs, narrate the progress list: research, plan, write, check, revise, image.

## 3. Show what it retrieved (1 minute)

**Research and plan** page: the summary, the angle, the cautions passed to the writer, and the fact table. Point out the ids: `S` facts came from the article, `C` facts from the client site.

## 4. Show the content (2 minutes)

- LinkedIn: the "see more" fold, the facts in the margin
- Google ad: the per-line character counts
- Open one piece with a note and show the mark, the margin note and who flagged it (rules or AI reviewer)
- Approve one piece; edit another and show the rules re-checking as you type

## 5. Image brief and visual (1 minute)

**Image** page: the brief (idea, scene, framing, colour, what to avoid), the picture, and the exact prompt sent. Mention that the brief bans text in images and robot clichés.

## 6. Evaluation, failure, limitation (1.5 minutes)

Pick real ones from your own runs. Templates:

- **Evaluation result:** "We planted 4 problems in a draft. The checker caught N: the rules caught the invented 70% statistic, the 'bias-free' claim and the 37-character headline; the AI reviewer caught the off-tone hook." (`npm run eval:checker`)
  Or from `npm run eval`: "Across 4 topics, blocking problems went from X in first drafts to Y after one self-revision, and 100% of numbers traced to a fact."
- **One failure:** show a real one from your runs. Common ones: the writer returned a 31-character Google headline even after revision; the reviewer flagged a claim that was actually on the fact sheet; the image had text in it.
- **One limitation:** pages that need JavaScript can't be read; or topic-only runs don't search the web; or number tracing is literal ("two days" vs "48 hours").

## Likely questions

- *Why not let it publish?* Hiring claims need a human. The brief also says no auto-publishing.
- *Why two checkers?* Code is exact but literal; the model understands meaning but can be wrong. Together, with a person deciding.
- *What would you add next?* Web search for topic-only runs, a database for runs, and a style memory from the reviewer's edits.
