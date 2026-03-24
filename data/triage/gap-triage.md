# Coverage Gap Triage Report (Updated)

Updated: 2026-03-23 after Plan 02 parser improvements

## Coverage Progress

| Metric | Initial (Plan 01) | After Plan 02 | Change |
|--------|-------------------|---------------|--------|
| Global coverage | 74.6% (25,588/34,313) | 76.1% (26,118/34,313) | +1.5% (+530 cards) |
| Standard coverage | 79.3% | 83.3% (3,623/4,348) | +4.0% (+177 cards) |

## Implemented Patterns

### Cost Parser Extensions
- Exile this card from graveyard/hand/battlefield (73+41+6 = 120 cards)
- Pay energy {E} variants (44 cards)
- Return land to owner's hand (14 cards)
- Reveal this card from hand, Exert, Mill (22 cards)
- Collect evidence N, Forage (10+ cards)
- Ability-word cost prefixes (Cohort, Boast, Metalcraft, Exhaust, Renew, Delirium, etc.)
- Ticket costs, vehicle tier costs

### Replacement Parser Extensions
- Bond lands: "unless a player has N or less life" (12 cards)
- Battlebond lands: "unless you have two or more opponents" (6 cards)
- Generic "enters tapped unless [condition]" fallback (30+ cards)

### Static Condition Parser Extensions
- Graveyard threshold: "there are N or more cards in your graveyard"
- Delirium: "there are N or more card types among cards in your graveyard"
- Controls N or more: "you control N or more [type]"
- Entered this turn: "N or more [type] entered the battlefield"
- Player tracking: "you've committed a crime/gained life this turn"

### Effect Parser Extensions
- Keyword actions: suspect, blight, forage, collect evidence, endure
- Vehicle tier lines recognized and skipped
- Extended keyword cost line recognition (20+ new keywords)

## Remaining Gap Analysis

Standard unsupported: 725 cards (16.7%)

The remaining gaps are highly fragmented:
- 350+ single-gap cards across ~200 unique patterns
- Most patterns affect only 1-3 cards each
- Top remaining patterns: "become an artifact creature" (7), "Delirium conditional" (4), "gain flashback" (3)

## Targets Assessment

| Target | Required | Achieved | Gap |
|--------|----------|----------|-----|
| Global >= 80% | 27,450 | 26,118 | -1,332 cards |
| Standard >= 90% | 3,913 | 3,623 | -290 cards |

Reaching 90% Standard requires implementing ~290 more patterns, most affecting 1-3 cards each.
Reaching 80% global requires ~1,332 more cards from the pool of ~8,195 unsupported.
