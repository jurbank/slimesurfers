import type { EditorBlastPad } from "../../types.ts";

export type BlastPadEditMode = "place" | "move" | "delete";

/** State the right-sidebar panel hands to the 3D tool every time it changes.
 *  Phase E: pads have no target planet — they're aim-and-fire launchers. */
export interface BlastPadToolState {
  mode: BlastPadEditMode | null;
  sourcePlanetId: string;
  pads: EditorBlastPad[];
  selectedPadId: string | null;
}

export function createBlastPadId(existing: ReadonlySet<string>): string {
  for (let i = 1; ; i++) {
    const candidate = `blast-pad-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
}
