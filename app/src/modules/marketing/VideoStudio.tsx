import { BriefQueue } from "./BriefQueue";

/**
 * Marketing · Video Studio — real creative brief board for video work
 * (reels, mini-docs, hype loops). Renders the shared BriefQueue for the
 * "video" kind. AI generation attaches in a later connector phase.
 */
export function VideoStudioView() {
  return <BriefQueue kind="video" title="Video Studio" accent="#c084fc" />;
}
