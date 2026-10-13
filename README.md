# Purser Relay on Arc

Task owners need to replace an unavailable AI worker without moving the task's payment or handing over their funding wallet. Payees need a way to collect an approved payment even if the task application disappears.

Purser Relay uses native USDC on Arc to escrow a fixed task payment. The owner can rotate workers before delivery, approve one submitted artifact, and grant an irrevocable payment credit to the original payee. The payee then withdraws independently. An unapproved task can expire and return its principal to its owner.

**Current release status: local implementation in progress. No Arc mainnet deployment or working mainnet lifecycle is claimed.** The deployment manifest will identify a verified contract and evidence when available. This build is not a grant submission until its mainnet requirements are satisfied.

## Roles and lifecycle

- Owner funds a task, rotates or revokes workers while Funded, and approves a submitted deliverable before the deadline.
- Worker submits a deliverable hash using the exact current authority epoch. It cannot change payment terms.
- Payee is fixed at funding, independent of the worker, and claims approved USDC at any later time.
- Anyone can mark a Funded or Submitted task expired at or after its deadline. Only the owner claims its refund.

`Funded → Submitted → Approved → Claimed`

`Funded / Submitted → Refundable → Refunded`

Approval performs no external payment. Approved credit cannot be reclaimed by the owner or expire. A failed payment or refund leaves its credit intact. One rejecting recipient does not consume another task's credit. There is no platform administrator, upgrade path, fee or centralized withdrawal backend.

## Arc integration

Arc mainnet chain ID is 5042. Task principal and gas share **one native USDC balance**, represented internally with 18 decimal integer units. The ERC-20 6-decimal interface represents the same asset; this application does not add both balances or approve an ERC-20 allowance. Fee quotes respect the 20 Gwei minimum, with per-action gas limits and explicit maximum USDC budgets.

Inclusion is final on Arc. Reconciliation checks the receipt, its block hash, this contract's events and the resulting order state. An unavailable or contradictory RPC produces UNKNOWN and never an automatic replacement payment.

## Recovery Kit

The independent `docs/recovery.html` and CLI read the contract directly. Recovery does not require the main application's backend, a worker's process or its local journal. The wallet must still have gas, the network must work, and the recipient must be eligible for native USDC transfers. A blocked or rejecting recipient cannot be promised unconditional withdrawal.

## Trust boundary

The owner is the sole acceptance authority. A hash binds content; it does not prove report accuracy, AI execution or real-world delivery. A worker can submit unusable content and stall the task until expiry, but cannot approve it or take its principal. The example report and demonstration role wallets are controlled engineering fixtures, with no external seller, production customer or revenue claim. This prototype is not audited and is not a fairness or arbitration system.

Each owner-intent pair can create only one task for the lifetime of a deployment. New intentional semantic duplicates under new intents are outside that guarantee. Handoffs bind chain, contract, code hash, order and epoch. All signatures are direct wallet EVM transactions; no offline permit or delegated treasury signing is introduced.

## Source and assistance

This is an independent Arc implementation continuing the Agent3 Purser design. The new state machine, permanent pull credits, native-USDC accounting and Arc recovery tooling are developed for this release. Earlier demonstrations on other networks are not Arc evidence. AI coding and testing assistance is disclosed; builder review remains responsible for the release.

License: MIT. Dependencies retain their own notices.

## Reproduce the local acceptance

Install Node.js 20+ and Foundry (Arc Foundry is required for Arc-specific local semantics), then run from this repository:

```sh
npm ci
npm run typecheck
npm run test:ts
forge test
arc-forge test --network arc
node docs/ui-guards.test.cjs
npx tsx scripts/precision-mutation.ts
npx tsx scripts/verify-report.ts
```

The checked-in `evidence/local-cold-recovery.json` is **local Arc-anvil evidence, not a mainnet transaction list**. To reproduce the independent-process recovery, start a local-only Arc node on port 18542 with chain ID 5042, then run `npx tsx scripts/local-cold-recovery.ts`. It creates random LOCAL_ONLY fixtures outside the repository, funds them solely through `anvil_setBalance`, and never uses those keys on mainnet. Two orders end with zero credits and zero remaining liabilities. Network transfer events are retained as supplementary audit evidence; business success is checked against the relay's own events.

Public mainnet recovery is read-only by default:

```sh
npm run recovery -- --contract YOUR_CONTRACT --codehash TRUSTED_RUNTIME_HASH --order YOUR_ORDER_ID
```

The browser Recovery Kit accepts the user's ordinary EIP-1193 wallet. The CLI's optional signer uses only project-scoped files outside the repository, with mode 600, explicit mainnet enablement and a per-action cap. Its journal lock covers processes sharing the same journal. Do not run another signing stream from the same wallet under a different journal. A crashed or uncertain action stays blocked until its original transaction is reconciled; do not delete a lock or spend ledger and assume nothing was sent. This is crash protection for cooperative local processes, not protection against a hostile operating system.

`prepare-action.ts` and `budget.ts` perform unsigned preflight. `provision-mainnet.ts` is a separately enabled fresh-key tool, never a test prerequisite. Creating wallets or signing does not constitute permission to spend: the mainnet deployment and task lifecycle require a concrete, separately approved funding budget. An unconfigured manifest means no deployment is claimed.
