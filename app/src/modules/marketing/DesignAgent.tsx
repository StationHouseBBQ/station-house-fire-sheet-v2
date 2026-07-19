import { BriefQueue } from "./BriefQueue";

/**
 * Marketing · Design Agent — real creative brief board for design work
 * (story templates, one-pagers, graphics). Renders the shared BriefQueue for
 * the "design" kind. AI generation attaches in a later connector phase.
 */
export function DesignAgentView() {
  return <BriefQueue kind="design" title="Design Agent" accent="#60a5fa" />;
}
