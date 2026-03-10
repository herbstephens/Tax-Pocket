# GTC Tax Pocket — Architecture Specification

> Self-custody tax escrow. Accrual at transaction time. Remittance when due.

---

## The Core Insight

Immediate tax routing (pay-at-transaction) is wrong for the same reason
withholding tax is wrong: it removes money from the taxpayer before the
liability is actually determined, finalized, or due.

The correct model — used by every VAT-registered business on Earth — is:

  1. **Accrue** — estimate tax at transaction time, segregate into escrow
  2. **Reconcile** — adjust for refunds, voids, credits before remittance
  3. **Remit** — pay the actual net liability on schedule

GTC Tax Pocket implements this model at the wallet level.

---

## The Three States of Tax Liability

```
TRANSACTION OCCURS
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  STATE 1: PENDING                                        │
│  Estimated tax is segregated into the Tax Pocket.        │
│  User retains full custody. Nothing leaves their wallet. │
│  Funds are earmarked, not locked.                        │
└─────────────────────────────────────────────────────────┘
       │
       │  (reconciliation period — refunds, voids, credits)
       ▼
┌─────────────────────────────────────────────────────────┐
│  STATE 2: CONFIRMED                                      │
│  Liability is finalized. Amount is now confirmed due.    │
│  User may choose to lock it on-chain (optional).         │
│  Remittance date is known and displayed.                 │
└─────────────────────────────────────────────────────────┘
       │
       │  (remittance trigger: date, user action, or auto)
       ▼
┌─────────────────────────────────────────────────────────┐
│  STATE 3: REMITTED                                       │
│  Funds released from Tax Pocket to jurisdiction vault.   │
│  Transaction is on-chain. Vault balance updates.         │
│  Receipt stored in wallet history.                       │
└─────────────────────────────────────────────────────────┘
```

---

## What "Self-Custody Escrow" Means

Self-custody escrow means:

- The funds never leave your wallet until YOU release them
- No third party can take them
- No government can seize them before remittance date
- You earn yield on them if you choose (held in your wallet, investable)
- If the jurisdiction hasn't registered their vault yet, you simply hold
  until they do — there is no rush

The Tax Pocket is not a smart contract lock by default. It is a **wallet-level
segregation**: a separate internal balance that the wallet UI treats distinctly
from spendable funds. The user can see it, the user controls it, but the wallet
strongly discourages spending from it.

Optional: the user can promote a Tax Pocket balance to an **on-chain escrow**
(TaxPocket.sol) for additional assurance — useful for businesses that want
auditable proof of tax reserves.

---

## Tax Pocket Structure

```
Wallet
├── 🟢 Spendable Balance
│     2,847.50 USDC
│
├── 🏛️ Tax Pocket (self-custody escrow)
│     Total: 312.40 USDC
│     │
│     ├── 📍 PT-11 (Lisbon Local)
│     │     Pending:   87.20 USDC  ← not yet due
│     │     Confirmed: 43.10 USDC  ← due Mar 31
│     │
│     ├── 🇵🇹 PT (Portugal National)
│     │     Pending:   31.50 USDC
│     │     Confirmed: 18.40 USDC  ← due Mar 31
│     │
│     ├── 🌐 GLOBAL (Commons)
│     │     Pending:   12.60 USDC
│     │     Confirmed:  7.20 USDC
│     │
│     └── ⏳ Next remittance: March 31, 2026 (21 days)
│
└── 📜 Tax History
      └── [view all remittances]
```

---

## Remittance Schedules

Each jurisdiction sets its own remittance schedule (or the user sets one).
Options:

| Schedule | Description | Best for |
|---|---|---|
| **Monthly** | Remit on the last day of each month | High-volume merchants |
| **Quarterly** | Remit on standard VAT quarters | Most businesses |
| **Annual** | Remit once per year | Low-volume / individuals |
| **On-demand** | Remit when user chooses | Power users |
| **Threshold** | Remit when balance exceeds X | Automators |

Default for new wallets: **Quarterly**, with a 7-day warning before due date.

---

## The Reconciliation Window

Between a transaction and its remittance date, the following can reduce liability:

- **Refund** — merchant issues refund → tax accrual reversed
- **Void** — transaction cancelled before settlement → full reversal
- **Credit** — jurisdiction applies credit (e.g., first-time exemption) → partial reduction
- **Dispute** — transaction under dispute → accrual frozen until resolved

The Tax Pocket tracks all of these automatically. The remittance amount is
always the **net confirmed liability**, not the sum of gross accruals.

---

## On-Chain Commitment (Optional)

For users or businesses who want cryptographic proof of tax reserves:

1. User calls `TaxPocket.commit(jurisdictionId, amount, dueDate)`
2. Funds are transferred to `TaxPocket.sol` (their own deployed instance)
3. Funds are time-locked until `dueDate`
4. On `dueDate` or after, user calls `TaxPocket.remit(jurisdictionId)`
5. Funds released to jurisdiction vault

This creates a public, auditable record: "This entity has X USDC committed
for tax remittance on Y date to jurisdiction Z." Useful for business accounting,
investor disclosure, or regulatory compliance.

---

## Yield on Tax Pocket (Optional)

Because the Tax Pocket holds funds for days to months, it can earn yield.
Options:

- **AAVE / Compound deposit** — earn lending APY on confirmed balances
- **T-bill yield tokens** — USDC → USYC or TBILL while awaiting remittance
- **Protocol-native** — GTC can offer a yield pool specifically for Tax Pocket balances

The yield belongs to the wallet owner. Not the government. Not GTC.
You earned the float. You keep it.

This is philosophically important: it inverts the current system where
withholding tax gives governments interest-free loans from taxpayers.

---

## Non-Payment Handling

What if a user never remits?

The Tax Pocket is self-custody. GTC cannot force payment. This is by design.

However:

1. **Transparency** — the wallet clearly shows outstanding liability
2. **Jurisdiction visibility** — if a jurisdiction claims their vault, they can
   query the `EntityRegistry` to see which registered entities have outstanding
   Tax Pocket balances and by how much (aggregate, not individual)
3. **Social pressure** — GTC may publish jurisdiction-level non-remittance rates
4. **Legal overlay** — jurisdictions may require proof of remittance for license
   renewal, permit issuance, etc. — GTC provides the receipt infrastructure

The protocol does not enforce payment. The jurisdiction's legal authority does.
GTC provides the clean interface between the two.

---

## Summary: Immediate Routing vs. Tax Pocket

| | Immediate Routing | Tax Pocket |
|---|---|---|
| When does tax leave wallet? | At transaction time | At remittance date |
| Who holds funds? | Jurisdiction vault | Taxpayer (self-custody) |
| Refund handling | Complex on-chain reversal | Simple pocket adjustment |
| Time value of money | Lost immediately | Retained by taxpayer |
| Yield on float | Zero | Taxpayer earns it |
| Dispute resolution | Post-payment | Pre-payment |
| Regulatory model | Withholding | VAT / business remittance |
| User experience | Invisible but final | Transparent and controllable |
| On-chain footprint | Every transaction | One tx per remittance period |
| **Correct?** | ❌ | ✅ |
