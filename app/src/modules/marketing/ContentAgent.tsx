import { BriefQueue } from "./BriefQueue";

/**
 * Marketing · Content Agent — real creative brief board for written/social
 * content (captions, hooks, series). Renders the shared BriefQueue for the
 * "content" kind. AI generation attaches in a later connector phase.
 */
export function ContentAgentView() {
  return <BriefQueue kind="content" title="Content Agent" accent="#ff8a3d" />;
}
