import { StageConfig } from '../types';
import { STAGES } from './stageData';

/**
 * Which slice of the campaign this build ships.
 *
 * `STAGES` is the whole thing and stays the whole thing — this module never
 * edits it, only picks from it. Everything that used to read `STAGES` reads
 * `ACTIVE_STAGES` instead, so a cut is one build flag rather than a branch to
 * keep in sync, and there is no divergence to reconcile when the cut is
 * retired. Deleting this file and putting `STAGES` back in the five call sites
 * is the entire undo.
 *
 * Worth being honest about what the flag does and does not do. It decides what
 * is reachable, not what is shipped: stageData is one module, so a demo bundle
 * still contains the data, dialogue and colours of every stage, and anyone who
 * opens the JavaScript can read them. That is fine for a promotional build and
 * would not be fine if the content were ever meant to be secret, which would
 * need the stages split across files and imported by path — a different and
 * much larger change.
 */

/** True when this build is a cut rather than the whole campaign. */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

/**
 * The demo cut: Stage 1, start to Sayonara.
 *
 * It ends on the highest point the game has to offer this early — she goes
 * down and the collar stays on, which is the debt the full campaign exists to
 * collect. Ending a promotional cut on an unresolved hook is the one thing
 * every piece of advice on demos agrees about.
 */
const DEMO_CUT = 1;

export const ACTIVE_STAGES: StageConfig[] = IS_DEMO ? STAGES.slice(0, DEMO_CUT) : STAGES;

/**
 * The stage that ends the run, whichever cut is active.
 *
 * Not the same question as `isFinalStage`, which marks the end of the *story* —
 * Mizydia's fall — and is what the engine watches to declare the campaign won.
 * A cut that stops before her has a last stage and no final one, and conflating
 * the two is how a demo would either never end or end by announcing a victory
 * that did not happen.
 */
export const LAST_ACTIVE_STAGE = ACTIVE_STAGES[ACTIVE_STAGES.length - 1];

/** Whether the given index is the last stage of the active cut. */
export function isLastActiveStage(stageIndex: number): boolean {
  return stageIndex === ACTIVE_STAGES.length - 1;
}
