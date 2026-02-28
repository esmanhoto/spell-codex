#!/usr/bin/env node
// Script to populate effects[] for 1st.json
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const filePath = join(import.meta.dir, "../cards/1st.json");
const cards = JSON.parse(readFileSync(filePath, "utf-8")) as Array<{
  cardNumber: number;
  effects: unknown[];
  [key: string]: unknown;
}>;

// Map of cardNumber → effects array
const effectsMap: Record<number, unknown[]> = {
  1: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" }],
  2: [{ type: "RESTRICTED_ATTACKERS", attribute: "Flyer" }],
  4: [
    { type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" },
    { type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" },
  ],
  7: [{ type: "HOLDING_BONUS", value: 3 }],
  8: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" }],
  10: [{ type: "RESTRICTED_ATTACKERS", attribute: "Flyer" }],
  11: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" }],
  12: [{ type: "RESTRICTED_ATTACKERS", attribute: "Flyer" }],
  13: [
    { type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" },
    { type: "HAND_SIZE_BONUS", count: 1 },
  ],
  19: [{ type: "HOLDING_BONUS", value: 1 }],
  28: [{ type: "DRAW_ON_REALM_PLAY", count: 1 }],
  29: [
    { type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" },
    { type: "RESTRICTED_ATTACKERS", attribute: "Flyer" },
  ],
  34: [{ type: "HOLDING_BONUS", value: 3 }],
  35: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" }],
  37: [{ type: "HOLDING_BONUS", value: 2 }],
  38: [{ type: "HOLDING_BONUS", value: 3 }],
  39: [{ type: "RESTRICTED_ATTACKERS", attribute: "Undead" }],
  41: [{ type: "IMMUNE_TO_SPELLS", scope: "offensive" }],
  44: [{ type: "IMMUNE_TO_SPELLS", scope: "offensive" }],
  49: [{ type: "LEVEL_BONUS_VS_TYPE", value: 2, typeId: 10 }],
  51: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  53: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  57: [{ type: "LEVEL_BONUS_VS_TYPE", value: 4, typeId: 10 }],
  72: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
  73: [{ type: "LEVEL_BONUS_VS_TYPE", value: 3, typeId: 10 }],
  74: [{ type: "LEVEL_BONUS_VS_TYPE", value: 3, typeId: 10 }],
  76: [{ type: "LEVEL_BONUS_VS_TYPE", value: 3, typeId: 10 }],
  79: [{ type: "LEVEL_BONUS_VS_TYPE", value: 4, typeId: 10 }],
  80: [
    { type: "LEVEL_BONUS_VS", value: 4, targetAttribute: "Dragon" },
    { type: "LEVEL_BONUS_VS", value: 4, targetAttribute: "Undead" },
  ],
  87: [{ type: "IMMUNE_TO_SPELLS", scope: "offensive" }],
  100: [{ type: "DRAW_CARD", count: 5 }],
  103: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
  111: [
    { type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" },
    { type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" },
  ],
  112: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 19, window: "defense" }],
  121: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" }],
  123: [
    { type: "RESTRICTED_ATTACKERS", attribute: "Undead" },
    { type: "HAND_SIZE_BONUS", count: 2 },
  ],
  124: [{ type: "DRAW_ON_REALM_PLAY", count: 3 }],
  129: [{ type: "RESTRICTED_ATTACKERS", typeId: 7 }],
  134: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" }],
  141: [{ type: "HOLDING_BONUS", value: 2 }],
  143: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" }],
  147: [{ type: "RESTRICTED_ATTACKERS", typeId: 10 }],
  148: [{ type: "HOLDING_BONUS", value: 4 }],
  156: [
    { type: "LEVEL_BONUS", value: 5, condition: { when: "attacking" } },
    { type: "LEVEL_BONUS", value: 2, condition: { when: "defending" } },
  ],
  159: [{ type: "LEVEL_BONUS", value: 3 }],
  161: [{ type: "LEVEL_BONUS_VS_TYPE", value: 3, typeId: 20 }],
  164: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  166: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  167: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
  185: [
    { type: "LEVEL_BONUS_VS_TYPE", value: 3, typeId: 10 },
    { type: "LEVEL_BONUS_VS", value: 3, targetAttribute: "Undead" },
    { type: "LEVEL_BONUS_VS", value: 3, targetAttribute: "Flyer" },
  ],
  188: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
  206: [{ type: "LEVEL_BONUS_VS", value: 5, targetAttribute: "Undead" }],
  207: [{ type: "LEVEL_BONUS_VS", value: 3, targetAttribute: "Flyer" }],
  222: [{ type: "HOLDING_BONUS", value: 1 }],
  224: [{ type: "DRAW_PER_TURN", count: 1 }],
  228: [{ type: "HAND_SIZE_BONUS", count: 2 }],
  231: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" }],
  232: [{ type: "RESTRICTED_ATTACKERS", typeId: 10 }],
  234: [{ type: "HOLDING_BONUS", value: 1 }],
  236: [{ type: "DRAW_PER_TURN", count: 1 }],
  237: [{ type: "HOLDING_BONUS", value: 2 }],
  238: [{ type: "RESTRICTED_ATTACKERS", attribute: "Flyer" }],
  243: [{ type: "HOLDING_BONUS", value: 5 }],
  250: [{ type: "REALM_GRANTS_SPELL_ACCESS", spellTypeId: 4, window: "defense" }],
  304: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
  305: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  320: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
  321: [{ type: "IMMUNE_TO_SPELLS", scope: "offensive" }],
  323: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  356: [{ type: "LEVEL_BONUS", value: 2, condition: { when: "defending" } }],
  370: [{ type: "IMMUNE_TO_ATTRIBUTE", attribute: "Undead" }],
  405: [
    { type: "RESTRICTED_ATTACKERS", typeId: 5 },
    { type: "RESTRICTED_ATTACKERS", typeId: 20 },
  ],
  422: [{ type: "IMMUNE_TO_SPELLS", scope: "offensive" }],
  431: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  432: [{ type: "RESTRICTED_ATTACKERS", attribute: "Swimmer" }],
  434: [
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 4, window: "both" },
    { type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" },
  ],
  452: [
    { type: "LEVEL_BONUS_VS_TYPE", value: 2, typeId: 5 },
    { type: "LEVEL_BONUS_VS_TYPE", value: 2, typeId: 20 },
  ],
  453: [{ type: "IMMUNE_TO_ALL_MAGIC" }],
  454: [{ type: "LEVEL_BONUS_VS_TYPE", value: 4, typeId: 10 }],
  465: [{ type: "GRANT_SPELL_ACCESS", spellTypeId: 19, window: "both" }],
};

let updated = 0;
for (const card of cards) {
  if (card.effects.length === 0 && effectsMap[card.cardNumber]) {
    card.effects = effectsMap[card.cardNumber];
    updated++;
  }
}

writeFileSync(filePath, JSON.stringify(cards, null, 2));
console.log(`Updated ${updated} cards.`);
