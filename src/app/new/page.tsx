import { clients } from "@/clients";
import { BriefForm } from "@/components/BriefForm";
import { TopBar } from "@/components/TopBar";
import { PageBand, cn, wrap } from "@/components/ui/primitives";
import { isMock } from "@/lib/ai/models";
import { storageNotice } from "@/lib/store/runs";

export const dynamic = "force-dynamic";

export const metadata = { title: "New pack · HireLoop content desk" };

/** Where a pack starts: the brief on the left, the workflow it sets off on the right. */
export default function NewPack() {
  return (
    <>
      <TopBar current="new" mock={isMock()} notice={storageNotice()} />
      <main id="main">
        <PageBand eyebrow="● New content pack" title="What should HireLoop talk about this week?">
          <p className="m-0 max-w-[66ch]">
            Give the agent a topic or a news link. It researches, drafts a blog post, a LinkedIn post, an X thread, an Instagram caption, 3
            Meta ads, 3 Google ads and an image, checks every claim against the client&apos;s facts, and hands it all to you for review.
          </p>
        </PageBand>
        <div className={cn(wrap, "py-8")}>
          <BriefForm clients={clients().map(({ id, name, audiences }) => ({ id, name, audiences }))} />
        </div>
      </main>
    </>
  );
}
