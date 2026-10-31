import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Sans for the tool, serif for the copy being reviewed.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "HireLoop content desk",
  description: "Research a topic, draft a reviewed content pack and a matching image for HireLoop.",
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the script below sets data-theme before React loads.
    <html lang="en-IN" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before the first paint, so the page doesn't flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
