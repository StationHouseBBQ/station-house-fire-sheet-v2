import { useEffect, useState } from "react";
import { onOverlayChange } from "./overlay";

/**
 * Bumps a counter whenever any catering overlay write happens, so components
 * reading overlay data (which lives outside TanStack Query) re-render.
 */
export function useOverlayVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => onOverlayChange(() => setV(n => n + 1)), []);
  return v;
}
