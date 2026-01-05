import type { PlayerActions } from "./ActionSchema";

/**
 * InputTape = deterministický zdroj actions per tick.
 * MVP: jen rozhraní – umožní později replay bez refaktoru.
 */
export interface InputTape {
  /** Pokud vrátí object, Loop použije tohle místo live inputu. */
  getActionsForTick(tick: number): PlayerActions | null;
}
