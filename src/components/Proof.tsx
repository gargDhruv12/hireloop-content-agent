import type { ContentPack } from "@/lib/content/schemas";
import type { Field, Piece } from "@/lib/content/pieces";
import { Marked, MarkdownMarked, type Mark } from "./Marked";

/**
 * Shows a draft in the shape of the channel it will run on, so reviewers
 * judge it as readers will see it: the fold on LinkedIn, the 280 limit on
 * X, the headline strip on a Meta ad, the blue link on Google.
 */
export interface ProofProps {
  piece: Piece;
  pack: ContentPack;
  marks: Record<string, Mark[]>;
  imageUrl?: string;
  imageAlt: string;
  activeId?: string | null;
  onSelect?: (id: string) => void;
}

export function Proof(props: ProofProps) {
  switch (props.piece.channel) {
    case "blog":
      return <BlogProof {...props} />;
    case "linkedin":
      return <LinkedInProof {...props} />;
    case "x":
      return <XProof {...props} />;
    case "instagram":
      return <InstagramProof {...props} />;
    case "meta":
      return <MetaProof {...props} />;
    case "google":
      return <GoogleProof {...props} />;
  }
}

export function Counter({ field }: { field: Field }) {
  if (!field.limit) return null;
  const n = field.value.length;
  const over = n > field.limit.max ? (field.limit.hard ? "hard" : "soft") : undefined;
  return (
    <span className="counter" data-over={over}>
      {n}/{field.limit.max}
    </span>
  );
}

function useText(props: ProofProps) {
  const f = (path: string) => props.piece.fields.find((x) => x.path === path)!;
  const t = (path: string) => (
    <Marked text={f(path).value} marks={props.marks[path] ?? []} activeId={props.activeId} onSelect={props.onSelect} />
  );
  return { f, t };
}

const FOLD = { linkedin: 210, instagram: 125 };

/** Split text at the point the platform hides it behind "See more". */
function splitAtFold(text: string, at: number): [string, string] {
  if (text.length <= at) return [text, ""];
  const cut = text.lastIndexOf(" ", at);
  const i = cut > at * 0.6 ? cut : at;
  return [text.slice(0, i), text.slice(i).replace(/^\s+/, "")];
}

function Author({ square = false, handle }: { square?: boolean; handle: string }) {
  return (
    <div className="post__author">
      <span className={`avatar${square ? " avatar--square" : ""}`} aria-hidden />
      <div>
        <div className="post__name">HireLoop</div>
        <div className="post__handle">{handle}</div>
      </div>
    </div>
  );
}

function BlogProof(props: ProofProps) {
  const { f, t } = useText(props);
  return (
    <article className="proof proof--blog">
      <div className="serp" aria-label="How the post looks in search results">
        <div className="serp__url">hireloop.in › blog</div>
        <div className="serp__title">
          {t("blog.title")}
        </div>
        <div className="serp__desc">
          {t("blog.metaDescription")}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          <Counter field={f("blog.title")} />
          <Counter field={f("blog.metaDescription")} />
        </div>
      </div>
      <div className="article">
        <h1>
          {t("blog.title")}
        </h1>
        <MarkdownMarked source={f("blog.body").value} marks={props.marks["blog.body"] ?? []} activeId={props.activeId} onSelect={props.onSelect} />
      </div>
    </article>
  );
}

function LinkedInProof(props: ProofProps) {
  const field = props.piece.fields[0];
  const [above, below] = splitAtFold(field.value, FOLD.linkedin);
  const marks = props.marks[field.path] ?? [];
  return (
    <article className="proof post">
      <Author handle="Company · AI interviews for first-round hiring" />
      <div className="copy">
        <Marked text={above} marks={marks} activeId={props.activeId} onSelect={props.onSelect} />
      </div>
      {below && (
        <>
          <div className="fold" role="separator">
            <span>LinkedIn shows “…see more” here</span>
          </div>
          <div className="copy">
            <Marked text={below} marks={marks} activeId={props.activeId} onSelect={props.onSelect} />
          </div>
        </>
      )}
      <div style={{ marginTop: 12 }}>
        <Counter field={field} />
      </div>
    </article>
  );
}

function XProof(props: ProofProps) {
  return (
    <div className="thread">
      {props.piece.fields.map((field) => (
        <article className="proof post" key={field.path}>
          <Author square handle="@hireloop" />
          <div className="copy">
            <Marked text={field.value} marks={props.marks[field.path] ?? []} activeId={props.activeId} onSelect={props.onSelect} />
          </div>
          <div style={{ paddingLeft: 50, marginTop: 6 }}>
            <Counter field={field} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Media({ url, alt }: { url?: string; alt: string }) {
  if (!url) return <div className="media media--empty">No image yet. Generate one from the Image page.</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="media" src={url} alt={alt} />;
}

function InstagramProof(props: ProofProps) {
  const { f, t } = useText(props);
  const caption = f("instagram.caption");
  const [above, below] = splitAtFold(caption.value, FOLD.instagram);
  const marks = props.marks[caption.path] ?? [];
  return (
    <article className="proof proof--ig">
      <div className="post" style={{ paddingBottom: 10 }}>
        <Author handle="hireloop" />
      </div>
      <Media url={props.imageUrl} alt={props.imageAlt} />
      <div className="post">
        <div className="copy" style={{ fontSize: 15.5 }}>
          <b style={{ fontFamily: "var(--sans)" }}>hireloop</b>{" "}
          <Marked text={above} marks={marks} activeId={props.activeId} onSelect={props.onSelect} />
        </div>
        {below && (
          <>
            <div className="fold" role="separator">
              <span>“… more”</span>
            </div>
            <div className="copy" style={{ fontSize: 15.5 }}>
              <Marked text={below} marks={marks} activeId={props.activeId} onSelect={props.onSelect} />
            </div>
          </>
        )}
        <p className="copy tags" style={{ fontSize: 15, margin: "10px 0 0" }}>
          {t("instagram.hashtags")}
        </p>
        <div style={{ marginTop: 10 }}>
          <Counter field={caption} />
        </div>
      </div>
    </article>
  );
}

function MetaProof(props: ProofProps) {
  const fields = props.piece.fields;
  const [primary, headline, description, cta] = fields;
  const { t } = useText(props);
  return (
    <article className="proof proof--meta">
      <div className="post" style={{ paddingBottom: 12 }}>
        <Author handle="Sponsored" />
        <div className="copy" style={{ fontSize: 15.5 }}>
          {t(primary.path)}
        </div>
      </div>
      <Media url={props.imageUrl} alt={props.imageAlt} />
      <div className="meta-strip">
        <div className="meta-strip__text">
          <div className="meta-strip__domain">hireloop.in</div>
          <div className="meta-strip__headline">
            {t(headline.path)}
          </div>
          <div className="meta-strip__desc">
            {t(description.path)}
          </div>
        </div>
        <span className="btn" aria-hidden>
          {cta.value}
        </span>
      </div>
      <table className="gad__table" style={{ margin: 0, padding: "0 16px" }}>
        <tbody>
          {[primary, headline, description].map((field) => (
            <tr key={field.path}>
              <td style={{ paddingLeft: 16 }}>{field.label}</td>
              <td />
              <td style={{ paddingRight: 16 }}>
                <Counter field={field} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function GoogleProof(props: ProofProps) {
  const heads = props.piece.fields.filter((f) => f.path.includes(".headlines."));
  const descs = props.piece.fields.filter((f) => f.path.includes(".descriptions."));
  const p1 = props.piece.fields.find((f) => f.path.endsWith("path1"))!;
  const p2 = props.piece.fields.find((f) => f.path.endsWith("path2"))!;
  const tf = (field: Field) => (
    <Marked text={field.value} marks={props.marks[field.path] ?? []} activeId={props.activeId} onSelect={props.onSelect} />
  );
  return (
    <article className="proof proof--google">
      <div className="gad__top">
        <b>Sponsored</b>
      </div>
      <div className="gad__url">
        hireloop.in › {p1.value} › {p2.value}
      </div>
      <div className="gad__headline">
        {heads.map((h, i) => (
          <span key={h.path}>
            {i > 0 && " | "}
            {tf(h)}
          </span>
        ))}
      </div>
      <div className="gad__desc">
        {descs.map((d, i) => (
          <span key={d.path}>
            {i > 0 && " "}
            {tf(d)}
          </span>
        ))}
      </div>
      <table className="gad__table">
        <tbody>
          {[...heads, ...descs, p1, p2].map((field) => (
            <tr key={field.path} data-over={field.limit && field.value.length > field.limit.max ? "hard" : undefined}>
              <td>{field.label}</td>
              <td>
                {tf(field)}
              </td>
              <td>
                <Counter field={field} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
