# Scoring, matching and allocation

All weights live in `config.weights` and `config.thresholds`. They are **working hypotheses**, not calibrated or scientifically validated values. Every score is returned with its contributions (`parts[]`), and tests check that each score equals the sum of its parts.

## 1. Offer Fit (IOP) — `matchOffers`
`OfferFit = 100 × (0.50·problem + 0.30·sector + 0.20·persona)`
- `problem` = share of the offer's `problemsSolved` found on the account **with an `evidenceId`**, capped at 1 after 2 matches. When the account has no verified problem the value is `null`: it contributes 0 and is listed in `missing`.
- `sector` ∈ {0,1}: account sector is in `offer.icpSectors`.
- `persona` ∈ {0,1}: contact buying role is in `offer.personas`.
- A promised follow-up keeps its offer (continuity). Below `minOfferFit`, the NBA becomes `qualify`.
- Cross-sell: existing customer (`ownedOfferIds`) **or** a complementary offer backed by a verified problem → `suggestion_requires_validation`, never routed.

## 2. Opportunity — `scoreOpportunity`
`O = 0.45·ICP_fit + 0.25·persona_fit + 0.30·intent_timing` (each 0–100)
- `ICP_fit`: per-account score from qualification.
- `persona_fit`: `contact.personaFit` if provided, else `personaScores[buyingRole]`.
- `intent_timing` = Σ verified signal weights × linear decay (100 % → 50 % over `signals.maxAgeDays`) + `promised_follow_up` when due, capped at 100. Unverified, unsourced, future or expired signals are **ignored and listed**. No signal → `null` (flagged), not 0 presented as fact.
- `dataCompleteness` = share of non-missing components.

## 3. Ideal Timing Window — `timingWindow`
`open` · `due_today` · `overdue_promise` · `future_promise`, plus offer seasonality (`seasonalityMonths`), contract renewal within 90 days, and business hours. Today ITW drives NBA ordering. Calendar availability is a documented limit.

## 4. Next Best Action — `nextBestActions` (first rule that matches)
1. no offer above threshold → `qualify`
2. confirmed meeting within 48 h → `prepare_meeting`
3. promise in the future → `hold`
4. promise due/overdue → `callback` / `followup_email`
5. phone issue (foreign, personal, shared) → `qualify`
6. no phone, previous enrichment failed → `qualify` (manual research, never repaid)
7. no phone → `enrich` (linked to a quote awaiting approval)
8. ≥ `maxAttempts` attempts within `attemptWindowDays` → `hold`
9. last qualified/positive contact older than `reactivationDays` → `reactivate`
10. existing customer with a cross-sell suggestion → `propose_offer` (validation)
11. `O ≥ minOpportunityScore` → `call` / `send_email`, otherwise `hold`
Opposition → `do_not_contact` before everything.

## 5. Sales Match (ISP) — `salesMatch`
`M = 0.55·offer_expertise + 0.30·industry_expertise + 0.15·declared_task_preference` (an undeclared preference counts as a neutral 50 and is labelled as such).

## 6. Priority and allocation — `allocate`
`P = 0.55·O + 0.30·M + 15·promise_due + 5·overdue + 5·goal_gap` where `goal_gap = max(0, target − done)/target`, applied to **new calls only**, so a quota never pushes a rep's promise aside.
Ceilings: 105 for an overdue promise, 100 for a due promise, 90 for a new call. P is a ranking, not a probability or a euro value.

**Order:** promises (oldest due first) → meeting prep → opportunity desc → id.
**Hard constraints before priority:** capacity (minutes), `minOfferExpertise`, `maxComplexity`, language, rep account exclusions, relationship owner.
**No eligible rep** → a promise becomes a `high` escalation; anything else goes to `unassigned`. Nothing is silently reassigned.
**Tie-break:** priority, then remaining capacity, then rep id (deterministic).

### Target formulation (not implemented)
Maximize Σᵢⱼ xᵢⱼ·EVᵢⱼ subject to Σⱼ xᵢⱼ ≤ 1 (one owner per action), Σᵢ xᵢⱼ·durationᵢ ≤ capacityⱼ, xᵢⱼ = 0 if a constraint fails, plus coverage of all due promises. EV needs calibrated outcome data (expected value = P(meeting)·P(win)·margin), which does not exist yet. The current greedy heuristic is deterministic and tested, but **it is not optimal**: it can lock capacity on an early task that a global solver would move. Next step: an ILP/assignment solver (e.g. OR-Tools), verified against the same fixtures.

## 7. Roadmap
08:00 promised follow-ups → meeting prep → from `outboundStart`, prospecting blocks of `prospectingBlockMinutes` (or the rep's declared `prefersBlockMinutes`), separated by `recoveryBlockMinutes` of note-taking → closing (notes + post-call sync). This is organisational help based on declared preferences, never on inferred fatigue or emotion.

## 8. Script length
`estimatedSeconds = words / speechWordsPerSecond` (3.0, calibrated on Scalon's 25-second reference script). Above 25 s → warning. The real test stays reading it aloud with a stopwatch.
