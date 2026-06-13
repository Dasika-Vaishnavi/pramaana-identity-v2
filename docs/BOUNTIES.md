# ETHGlobal New York — Bounty Integration Plan

Event: ETHGlobal New York 2025 (Aug 15–17, 2025). Total pool: $275,000 across 28 sponsors.
This document maps the highest-fit bounties to Pramaana's architecture.

**Constraint**: no integration may weaken the V3 crypto spine (PALC, VOPRF, TEE gates,
Semaphore, transient erasure). See CLAUDE.md §2.

---

## Summary Table

| Priority | Sponsor | Prize | Fit | Integration Surface | Effort | V3 Components Touched |
|---|---|---|---|---|---|---|
| 🥇 | **LayerZero** | $20,000 | ★★★★★ | Cross-chain Φ mirroring | Medium | `contracts/`, new `LayerZeroAdapter.sol` |
| 🥇 | **Coinbase CDP** | $20,000 | ★★★★★ | Gasless enrollment via Smart Wallet + Paymaster | Medium | `web/`, SDK config |
| 🥈 | **ENS** | $11,000 | ★★★★☆ | Φ → ENS text record binding | Low | `web/`, read-only ENS calls |
| 🥈 | **Circle** | $10,000 | ★★★★☆ | USDC Sybil-resistant airdrops + CCTP V2 | Medium | `contracts/`, `web/` |
| 🥈 | **Dynamic** | $9,999 | ★★★★☆ | Embedded wallet for frictionless onboarding | Low | `web/` only |
| 🥈 | **The Graph** | $10,000 | ★★★★☆ | Subgraph indexing identity events | Low–Med | New `subgraph/`, `web/` |
| | **Total** | **$80,999** | | | | |

---

## Bounty Details

### 1. LayerZero — $20,000 "Best Omnichain Interaction"

**Why it fits**: Pramaana's core value prop is "enroll once, verify everywhere."
LayerZero makes this literal — enroll on one chain, verify identity on any other.
Cross-chain identity portability is a natural extension of the Φ commitment model.

**What Pramaana already provides**:
- `Registry.sol` records Φ commitments and dedup tags on-chain
- `NullifierRegistry.sol` tracks per-service nullifier spending
- V2 already had "multichain identity mirroring" as a UI concept (Ethereum/Arbitrum/Base)

**What to build**:
- `contracts/src/LayerZeroAdapter.sol`: OApp that sends Φ commitments cross-chain via
  `_lzSend()`. Receives on destination and calls `Registry.register()` there.
- Cross-chain nullifier verification: user proves on chain A, verifier checks on chain B
  via LayerZero message.
- `web/src/integrations/bounties/layerzero/`: UI for selecting destination chain,
  showing cross-chain tx status.

**Crypto-spine safety**: ✅ Does not touch PALC, VOPRF, TEE, or Semaphore. Φ is a
public commitment — mirroring it cross-chain reveals nothing that isn't already on-chain.

**Prize structure**: $12,500 (1st) / $7,500 (2nd)

---

### 2. Coinbase Developer Platform — $20,000 "Best Use of CDP"

**Why it fits**: The biggest UX barrier in crypto-native identity is gas. A new user
enrolling for the first time shouldn't need ETH to register their identity. Coinbase
Smart Wallet + Paymaster eliminates this friction entirely.

**What Pramaana already provides**:
- SDK's `enroll()` / `claim()` flow that ends with on-chain transactions
  (`Registry.register()`, `NullifierRegistry.spend()`)
- The airdrop demo already shows the claim flow

**What to build**:
- Smart Wallet integration in `web/`: use Coinbase's SDK for wallet creation
  (email/passkey-based, no browser extension needed)
- Paymaster configuration: sponsor `Registry.register()` and `NullifierRegistry.spend()`
  transactions so users pay zero gas
- Deploy to Base (Coinbase L2) for low-cost identity operations
- `web/src/integrations/bounties/coinbase/`: Paymaster setup, Smart Wallet connector

**Crypto-spine safety**: ✅ Paymaster and Smart Wallet are transaction-execution concerns.
The cryptographic enrollment (PALC, VOPRF, TEE) runs server-side in Rust, untouched.

**Prize structure**: Best Use of OnchainKit / Smart Wallet / AgentKit / Paymaster

---

### 3. ENS — $11,000 "Best Use of ENS"

**Why it fits**: Pramaana creates anonymous identities (Φ), but Φ is a 64-byte hash —
not human-readable. ENS bridges the gap: a user can optionally bind their Pramaana
identity to their ENS name, making it discoverable without revealing their real identity.

**What Pramaana already provides**:
- Φ commitment registered on-chain (public, pseudonymous)
- Per-service unlinkable nullifiers

**What to build**:
- After enrollment, let users set an ENS text record `pramaana.phi = keccak256(Φ64)`
  on their ENS name. This proves "this ENS name holds a verified Pramaana identity"
  without revealing which Aadhaar or which person.
- Reverse lookup: given an ENS name, check if the owner has a Pramaana enrollment
  (read the text record, verify it matches a registered Φ in the Registry).
- `web/src/integrations/bounties/ens/`: ENS name resolution, text record setter,
  verification badge component.

**Crypto-spine safety**: ✅ ENS binding is optional and post-enrollment. Φ is already
public on-chain; binding it to an ENS name reveals no additional information.
The user explicitly opts in.

**Prize structure**: $5,000 / $3,000 / $2,000 / $1,000

---

### 4. Circle — $10,000 "Best Use of CCTP V2 or Paymaster"

**Why it fits**: Pramaana's demo use case is Sybil-resistant airdrops. Circle makes
the airdrop payload real — USDC instead of mock tokens. CCTP V2 enables cross-chain
USDC delivery.

**What Pramaana already provides**:
- `claim(proof)` flow: user proves membership + spends nullifier on-chain
- Demo shows "claim Alpha" → "claim Alpha again → BLOCKED" → "claim Beta → different nullifier"

**What to build**:
- Replace the demo's mock airdrop with real USDC payouts (testnet/devnet)
- Circle Paymaster: gasless claim transactions (user receives USDC without spending ETH)
- CCTP V2: if airdrop sponsor is on chain A and user is on chain B, bridge USDC
  cross-chain via Circle's protocol
- `web/src/integrations/bounties/circle/`: USDC balance display, gasless claim UI,
  cross-chain delivery status

**Crypto-spine safety**: ✅ Circle integration is in the airdrop/claim layer, which
is downstream of enrollment. The Semaphore proof and nullifier spending are unchanged.

**Prize structure**: $5,000 / $3,000 / $2,000

---

### 5. Dynamic — $9,999 "Best Use of Dynamic"

**Why it fits**: Dynamic's embedded wallet and social login solve the hardest onboarding
problem: requiring MetaMask. With Dynamic, users sign up with email or social auth,
get an embedded wallet automatically, and enroll — no browser extension needed.

**What Pramaana already provides**:
- V2 has MetaMask integration (WalletConnect page)
- V3's SDK is wallet-agnostic (takes an ethers signer)

**What to build**:
- Replace V2's raw MetaMask connection with Dynamic's universal wallet connector
- Support email + social login → embedded wallet → enrollment
- Dynamic's user management for session persistence (remember enrolled users)
- `web/src/integrations/bounties/dynamic/`: Dynamic SDK setup, wallet connector
  component, session management

**Crypto-spine safety**: ✅ Dynamic is a wallet/auth layer. The wallet provides a
signer for on-chain transactions; it does not interact with PALC, VOPRF, or TEE.

**Prize structure**: $5,000 / $2,500 / $2,499

---

### 6. The Graph — $10,000 "Best Use of The Graph"

**Why it fits**: Pramaana emits on-chain events (`Registered`, `NullifierSpent`) that
are ideal for indexing. A subgraph makes this data queryable for dashboards, analytics,
and third-party integrations.

**What Pramaana already provides**:
- `Registry.sol` emits `Registered(bytes32 phi, bytes32 dedupTag)` events
- `NullifierRegistry.sol` emits `NullifierSpent(uint256 nullifier)` events
- V2 has a Dashboard page with mock data

**What to build**:
- `subgraph/`: Graph protocol subgraph indexing Registry + NullifierRegistry events
  - Entities: `Identity` (phi, dedupTag, blockNumber, timestamp),
    `NullifierSpend` (nullifier, serviceId, blockNumber, timestamp)
  - Queries: total enrollments, recent activity, nullifier history per service
- `web/src/integrations/bounties/the-graph/`: GraphQL client, dashboard data source
- Replace V2 Dashboard's mock data with live subgraph queries

**Crypto-spine safety**: ✅ The Graph reads publicly emitted on-chain events. It does
not interact with any secret material (no k, no sk_IdR, no PII).

**Prize structure**: $5,000 / $2,500 / $2,500

---

## Integration Order (recommended)

Bounties are independent and can be parallelized. Recommended order if sequential:

1. **Dynamic** (Low effort, immediate UX payoff — unblocks all other UX)
2. **ENS** (Low effort, high visibility — "identity + naming" is a strong narrative)
3. **The Graph** (Low–Med effort, makes the dashboard real)
4. **Coinbase CDP** (Medium effort, high prize — gasless enrollment is a killer feature)
5. **LayerZero** (Medium effort, highest prize — cross-chain identity is the endgame)
6. **Circle** (Medium effort, builds on LayerZero for cross-chain USDC delivery)

## Non-Fit Bounties (excluded)

| Sponsor | Prize | Why excluded |
|---|---|---|
| Flow | $20K | Requires Flow blockchain (Cadence, non-EVM) — V3 is EVM-native |
| Chiliz | $10K | Sports fan engagement — no natural identity fit |
| katana | $10K | Gaming/entertainment focus |
| Saga | $5K | Chainlet infrastructure — too niche |
| Nora | $5K | Consumer social — different target audience |
| OpenSea | $10K | NFT marketplace — tangential at best |
| Hardhat | $5K | Dev tooling prize — V3 uses Foundry, not Hardhat |
| Gemini | $5K | Exchange-specific integration |
| Fern | $5K | API documentation tooling |
| Ledger | $6K | Hardware wallet — could fit but lower ROI than Dynamic |
| Flare Network | $10K | Oracle-focused — identity doesn't need price feeds |
| Hedera | $10K | Non-EVM (Hashgraph) |
| Walrus | $10K | Sui ecosystem (non-EVM) |
| PayPal USD | $10K | Similar to Circle but less developer tooling |
| Privy | $5K | Similar to Dynamic but smaller prize |
| Hyperlane | $10K | Cross-chain similar to LayerZero but smaller ecosystem |
| Lit Protocol | $3.5K | Vincent delegation framework — tangential |
| ASI Alliance | $10K | AI agent focus — possible fit with V2's agent but lower priority |
