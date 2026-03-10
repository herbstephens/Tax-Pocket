# GTC Tax Pocket

> Self-custody tax escrow for digital wallets. Accrue now. Reconcile freely. Remit when due.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Part of GTC](https://img.shields.io/badge/Part%20of-Global%20Tax%20Clearinghouse-orange.svg)](https://github.com/global-tax-clearinghouse)
[![Status: Draft](https://img.shields.io/badge/Status-Draft-yellow.svg)]()

---

## The Problem with Immediate Tax Routing

The naive approach to on-chain taxation routes tax funds to jurisdiction vaults at the moment of every transaction. This is wrong for the same reason payroll withholding is wrong:

- Tax liability at transaction time is an **estimate**, not a final amount
- Refunds and voids become complex on-chain reversals after the fact
- The taxpayer loses time-value-of-money immediately
- On-chain footprint is enormous — one routing event per transaction
- It breaks the reconciliation model that every real-world VAT system uses

**Every VAT-registered business on Earth operates on accrual + remittance**, not pay-per-transaction. GTC Tax Pocket brings this model to digital wallets.

---

## How It Works

```
TRANSACTION OCCURS
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  STATE 1: PENDING                                          │
│  Estimated tax is segregated in the Tax Pocket.            │
│  User retains full custody. Nothing leaves their wallet.   │
│  Funds are earmarked, not locked.                          │
└───────────────────────────────────────────────────────────┘
        │
        │  reconciliation window (refunds, voids, credits)
        ▼
┌───────────────────────────────────────────────────────────┐
│  STATE 2: CONFIRMED                                        │
│  Liability is finalized. Remittance date is known.         │
│  User may optionally lock on-chain via TaxPocket.sol.      │
└───────────────────────────────────────────────────────────┘
        │
        │  remittance date (monthly / quarterly / annual)
        ▼
┌───────────────────────────────────────────────────────────┐
│  STATE 3: REMITTED                                         │
│  Funds released to jurisdiction vault.                     │
│  Receipt NFT minted as cryptographic proof of payment.     │
└───────────────────────────────────────────────────────────┘
```

---

## Key Principles

**Self-custody, always.** Funds never leave the user's wallet until they choose to remit. No third party can seize, freeze, or redirect tax funds before the remittance date. The user holds their keys. The user holds their tax reserves.

**Accrual, not withholding.** Tax is recorded at transaction time but paid on schedule — monthly, quarterly, or annually. This matches how every legitimate business handles VAT and sales tax.

**Reconciliation before remittance.** Refunds, voids, credits, and disputes adjust the pocket balance before any on-chain payment occurs. The remittance amount is always the net confirmed liability, not the sum of gross estimates.

**Yield belongs to the taxpayer.** The float between accrual and remittance is yours. T-bill yield tokens, lending protocols, or whatever you choose. The jurisdiction receives the same principal on remittance date regardless.

**On-chain commitment is optional.** Most users never need a smart contract. The Tax Pocket is a software-layer segregation within the wallet. Businesses that want auditable proof of reserves can deploy `TaxPocket.sol` — their own personal instance with cryptographic guarantees.

---

## Repo Structure

```
gtc-tax-pocket/
├── README.md                  ← You are here
├── WHITEPAPER.md              ← Full technical specification
├── CONTRIBUTING.md            ← How to contribute
├── CHANGELOG.md               ← Version history
├── LICENSE                    ← GPL-3.0
│
├── contracts/
│   ├── TaxPocket.sol          ← Self-custody escrow contract (optional on-chain layer)
│   ├── TaxPocketFactory.sol   ← CREATE2 factory for deterministic pocket addresses
│   ├── RemittanceReceipt.sol  ← ERC-721 receipt NFT contract
│   ├── interfaces/
│   │   ├── ITaxPocket.sol
│   │   └── IRemittanceReceipt.sol
│   └── test/
│       ├── TaxPocket.test.ts
│       └── RemittanceReceipt.test.ts
│
├── sdk/
│   ├── src/
│   │   ├── TaxPocketManager.ts    ← Core software-layer pocket manager
│   │   ├── AccrualEngine.ts       ← Accrual calculation and reconciliation
│   │   ├── RemittanceScheduler.ts ← Schedule management and due-date logic
│   │   ├── YieldIntegration.ts    ← Optional yield on pocket balances
│   │   └── types.ts               ← All TypeScript types
│   └── test/
│       └── TaxPocketManager.test.ts
│
├── examples/
│   ├── TaxPocketUI.jsx            ← Full React wallet UI demo
│   ├── vanilla-integration.html   ← Zero-dependency HTML example
│   └── react-native/              ← Mobile wallet example
│
└── docs/
    ├── ARCHITECTURE.md            ← System design and rationale
    ├── INTEGRATION_GUIDE.md       ← Step-by-step wallet integration
    ├── CONTRACT_REFERENCE.md      ← Solidity contract documentation
    ├── SDK_REFERENCE.md           ← TypeScript SDK documentation
    └── diagrams/
        ├── state-machine.svg
        └── contract-architecture.svg
```

---

## Quick Integration

### For Wallet Developers

The minimum viable integration is four lines in your transaction flow:

```typescript
import { TaxPocketManager } from '@gtc/tax-pocket';

// Initialize once per wallet
const pocket = new TaxPocketManager(walletAddress);

// After any payment to a registered entity is signed:
pocket.accrueFromRoute(gtcRoute, txHash);

// That's it. The pocket UI handles everything else.
```

The user sees a Tax Pocket balance in their wallet. They reconcile refunds. They remit on schedule.

### Full Integration

```typescript
import { TaxPocketManager } from '@gtc/tax-pocket';
import { TaxPocketUI } from '@gtc/tax-pocket/ui';

// Initialize
const pocket = new TaxPocketManager(walletAddress, {
  schedule: 'quarterly',
  yieldEnabled: false,
  reminderDaysBefore: 7,
});

// Accrue on commercial transactions
const accrualIds = pocket.accrueFromRoute(route, txHash);

// Handle refunds
pocket.reconcileByTxHash(originalTxHash, 'refund', newAmount);

// Check what's due
const summary = pocket.getBalance();
// { totalOutstanding: BigNumber, nextDueDate: timestamp, daysUntilDue: 21 }

// Preview remittance
const preview = pocket.getRemittancePreview();
// [{ jurisdictionId: 'PT-11', amount: BigNumber, ... }]

// After remittance tx is confirmed
pocket.markRemitted('PT-11', USDC_ADDRESS, remittanceTxHash);
```

### React UI Component

```tsx
import { TaxPocketDashboard } from '@gtc/tax-pocket/ui';

// Drop into any React wallet — fully styled, fully functional
<TaxPocketDashboard
  walletAddress={userAddress}
  tokenSymbol="USDC"
  theme="dark"
/>
```

---

## Smart Contract (Optional)

For businesses needing auditable proof of tax reserves:

```solidity
// Deploy your own TaxPocket instance
TaxPocketFactory factory = TaxPocketFactory(GTC_FACTORY_ADDRESS);
address myPocket = factory.deploy(msg.sender);

// Commit confirmed liabilities on-chain
TaxPocket(myPocket).commit("PT-11", USDC_ADDRESS);

// Remit on due date
TaxPocket(myPocket).remit("PT-11", USDC_ADDRESS, 202601);
// → Sends to verified vault
// → Mints receipt NFT
```

Deployed contract addresses:

| Network | Factory | Receipt NFT |
|---|---|---|
| World Chain | `pending` | `pending` |
| Ethereum | `pending` | `pending` |
| Base | `pending` | `pending` |

---

## Comparison

| | Pay-Per-Transaction | GTC Tax Pocket |
|---|---|---|
| When does tax leave wallet? | Immediately | On remittance date |
| Who holds funds? | Jurisdiction vault | Taxpayer (self-custody) |
| Refund handling | Complex on-chain reversal | Simple pocket adjustment |
| Time value of money | Lost at transaction | Retained by taxpayer |
| Yield on float | Zero | Taxpayer earns it |
| On-chain tx per purchase | 1 routing tx | 0 (software only) |
| On-chain tx per period | — | 1 remittance tx total |
| Dispute handling | Post-payment | Pre-payment |
| Real-world VAT model? | ❌ | ✅ |

---

## Relationship to GTC

This repo is part of the [Global Tax Clearinghouse](https://github.com/global-tax-clearinghouse) ecosystem.

| Repo | Purpose |
|---|---|
| [`global-tax-clearinghouse`](https://github.com/global-tax-clearinghouse/global-tax-clearinghouse) | Canonical spec, jurisdiction registry, vault contracts |
| [`gtc-wallet-sdk`](https://github.com/global-tax-clearinghouse/gtc-wallet-sdk) | Wallet integration SDK (detection, routing, UI) |
| **`gtc-tax-pocket`** ← you are here | Self-custody tax escrow layer |
| [`gtc-jurisdiction-repos`](https://github.com/global-tax-clearinghouse) | Per-jurisdiction claim repos (auto-generated) |

---

## Status

This project is in active draft. Contracts are unaudited. Do not use in production.

Current priorities:
- [ ] Finalize `TaxPocket.sol` interface
- [ ] Implement `RemittanceReceipt.sol` (ERC-721)
- [ ] Complete `TaxPocketManager.ts` SDK
- [ ] Hardhat test suite
- [ ] First wallet integration (target: a WalletConnect-compatible mobile wallet)
- [ ] Security audit

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All contributions welcome.

Most needed right now: wallet developers willing to integrate and give feedback on the SDK ergonomics.

---

## License

GPL-3.0. Build on this freely. Keep it open.

---

*Part of the Global Tax Clearinghouse · github.com/global-tax-clearinghouse*
