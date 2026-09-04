import type { AnchorFixture } from "./types.ts";

/**
 * Stable Storefront discovery anchors. These are search terms plus canonical
 * MTG printing identity; runtime validation must resolve the tuple against the
 * local printing catalog before treating an observation as positive.
 */
export const MTG_ANCHOR_FIXTURES: readonly AnchorFixture[] = [
  { key: "lightning-bolt-m10-146", cardName: "Lightning Bolt", setCode: "m10", collectorNumber: "146", aliases: ["Lightning Bolt"] },
  { key: "sol-ring-c21-263", cardName: "Sol Ring", setCode: "c21", collectorNumber: "263", aliases: ["Sol Ring"] },
  { key: "ragavan-mh2-138", cardName: "Ragavan, Nimble Pilferer", setCode: "mh2", collectorNumber: "138", aliases: ["Ragavan, Nimble Pilferer", "Ragavan"] },
  { key: "swords-a25-35", cardName: "Swords to Plowshares", setCode: "a25", collectorNumber: "35", aliases: ["Swords to Plowshares"] },
  { key: "counterspell-2xm-47", cardName: "Counterspell", setCode: "2xm", collectorNumber: "47", aliases: ["Counterspell"] },
  { key: "birds-m11-165", cardName: "Birds of Paradise", setCode: "m11", collectorNumber: "165", aliases: ["Birds of Paradise"] },
  { key: "path-2xm-25", cardName: "Path to Exile", setCode: "2xm", collectorNumber: "25", aliases: ["Path to Exile"] },
  { key: "command-tower-c21-319", cardName: "Command Tower", setCode: "c21", collectorNumber: "319", aliases: ["Command Tower"] },
  { key: "teferi-dominaria-207", cardName: "Teferi, Hero of Dominaria", setCode: "dom", collectorNumber: "207", aliases: ["Teferi, Hero of Dominaria", "Teferi"] },
  { key: "urzas-saga-mh2-259", cardName: "Urza's Saga", setCode: "mh2", collectorNumber: "259", aliases: ["Urza's Saga", "Urzas Saga"] },
  { key: "fabled-passage-eld-244", cardName: "Fabled Passage", setCode: "eld", collectorNumber: "244", aliases: ["Fabled Passage"] },
  { key: "arcane-signet-eld-331", cardName: "Arcane Signet", setCode: "eld", collectorNumber: "331", aliases: ["Arcane Signet"] },
] as const;
