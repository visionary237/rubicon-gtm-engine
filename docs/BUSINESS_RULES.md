# Business rules

Each rule lists where it is enforced. "Engine" means a tested function in `engine/rubicon.cjs`.

## Qualification (adapted from Outbound Blueprint, MIT)
| Rule | Enforced in |
|---|---|
| One vertical per campaign; first client from the network when no reference exists | skill `outbound-setup` |
| Company-first: qualify accounts before paying for contacts | engine L2 → L4 |
| Verdicts `oui`, `oui, en partie`, `partiel`, `indirect`, `non`, `INCONNU`; only the first two reach enrichment | engine `qualifyAccounts` |
| `INCONNU` is a question, not a negative → validation lane | engine |
| B2B customers only; competitors excluded with a reason | engine |
| Domain is a merge hint, not an identity: same domain + different SIRET = distinct establishments | engine `normalizeAccounts` |
| First manual control batch of 50 before scaling | engine `firstBatchReview`, skill |
| Title dictionary per vertical × offer, with exclusions and false positives | engine `buyingRole`, skill `icp-builder` |
| Default 2 contacts per account, 1 when relevant team > 30 (configurable); order by team size | engine `qualifyContacts` |
| Dedupe people on normalized profile URL **and** first+last+domain | engine |

## Cost control
| Rule | Enforced in |
|---|---|
| Reuse known data before any purchase | engine L4 |
| Quote = targets, units, unit cost, max cost, balance, expected return (hypothesis), immutable ID | engine `enrichmentPlan` |
| No execution without an approved quote ID **and** live mode **and** an implemented adapter | `adapters.cjs` |
| Failed enrichment is logged and never re-quoted automatically | engine |
| Insufficient balance blocks the quote | engine |
| Country filter ≠ country guarantee: verify country/type of every returned number; foreign/personal → review | engine `phoneReview` |
| Same number on two companies → review both | engine |

## CRM and post-call
| Rule | Enforced in |
|---|---|
| No contact without a company | `sql/schema.sql` (NOT NULL FK) |
| Write to an ID after a name check, never to a row number | engine `postCallSync` identity guard |
| Statuses: Rappeler · Réponse négative · Ne pas contacter · Réponse positive · Qualifié (+ À valider) | engine |
| Never `Rappeler` on zero real calls; not-called rows get no call increment | engine + DB CHECK |
| Meeting claimed without a calendar event → `Rappeler`, no deal | engine |
| Sent email not in the note → the email prevails | engine |
| Email claimed but not in the sent box → ask before classifying | engine (validation queue) |
| Deal only on a confirmed discovery meeting; unique `account:offer` key | engine |
| No lost deal without a reason | DB CHECK |
| Notes append with ` | `, never overwrite; last contact always updated | engine patches |
| Idempotent sync via processed event IDs | engine |
| Opposition is durable and beats any later status; extending it to the account is **proposed**, not applied | engine |
| CRM order: account → contact → deal | engine `crmOps.order` |

## Allocation and people
| Rule | Enforced in |
|---|---|
| Constraints (opposition, capacity, expertise, complexity, language, exclusions, owner) before priority | engine `allocate` |
| A promised follow-up is never displaced by a better new lead; if it cannot be placed → manager escalation | engine |
| ISP uses declared professional dimensions only; other fields are dropped with a warning | engine `prepare` |
| No inference of emotion, fatigue, motivation or personality; no discriminatory criteria | engine guard + skills |
| Every recommendation is explainable (`parts`), contestable (`alternatives`) and overridable | engine output |
| Goal gap boosts new calls only and never creates artificial pressure on promises | engine |

## Conversation
| Rule | Enforced in |
|---|---|
| Six-block ~25 s script, closed two-slot question | engine `buildBrief` |
| Reason to call only from a verified, approved CVA; social proof only if verified and citable | engine |
| Icebreaker priority: last exchange → verified company signal → declared non-sensitive interest with consent → neutral | engine |
| Personal interests never feed scoring or routing | engine (tested) |
| Never hide the commercial nature of a call | skills |

## Learning
Explicit denominators · small samples (< 30) flagged · correlation ≠ causation · experiments proposed, rules never changed automatically · `ruleVersion` on every output.

## Legal topics to review before any commercial use (not legal advice)
GDPR (lawful basis for B2B prospecting, information, right to object, minimization, retention) · French rules on B2B telephone prospecting and Bloctel scope · provider terms (data reuse, scraping prohibitions) · n8n license (Sustainable Use License: check before reselling a hosted service built on it) · trademark availability of "RUBICON" · **EU AI Act**: AI systems used to allocate tasks to workers are listed in Annex III (employment) and may be high-risk; assess before deploying `sales-matching` in an employer context.
