# GTC Tax Pocket: Whitepaper

**A Self-Custody Tax Escrow Protocol for Digital Wallets**

Version 0.1 — Draft for Public Comment  
March 2026

---

## Abstract

We describe a wallet-native tax accrual and remittance system that preserves full user custody of tax funds between transaction time and remittance date, enables pre-payment reconciliation for refunds and voids, allows taxpayers to earn yield on tax reserves, and produces a minimal on-chain footprint — one transaction per remittance period rather than one per purchase. The system is compatible with any EVM wallet, requires no government participation to deploy, and mirrors the accrual accounting model used by every VAT-registered business on Earth.

---

## 1. Motivation

### 1.1 The Withholding Problem

Contemporary proposals for blockchain-native taxation typically route tax funds to jurisdiction vaults at the point of transaction. While conceptually clean, this model has significant practical deficiencies.

**It treats estimates as finals.** At transaction time, the tax amount is an estimate based on current rates and entity registration. The actual liability may differ — refunds reduce it, credits reduce it, void transactions eliminate it entirely. A system that routes funds before liability is confirmed requires complex on-chain reversal mechanisms that do not yet exist at scale.

**It eliminates float.** In every functioning VAT system in the world, the period between collection and remittance — typically 30 to 90 days — belongs to the collector. This float has real economic value. A retailer collecting €10,000 per month in VAT and remitting quarterly holds €30,000 for up to 90 days. At 4% annual yield, this is €300 of real value per quarter. Pay-per-transaction routing destroys this entirely.

**It inverts custody.** Funds that belong to the taxpayer until remittance date should remain in the taxpayer's custody until remittance date. Immediate routing transfers custody to an unverified vault address the moment the transaction confirms. If the vault is later found to be misconfigured, or the jurisdiction has not yet claimed it, funds sit in limbo with no obvious recovery path.

**It creates excessive on-chain noise.** A merchant processing 500 transactions per day would generate 500 tax routing events on-chain per day. At quarterly remittance, 45,000 on-chain routing events would be replaced by a single remittance transaction. The difference in gas costs alone is substantial.

### 1.2 The VAT Model

Value-Added Tax — the dominant commercial tax model in 170+ countries — operates precisely as follows:

1. **Collect** tax from customers at the point of sale
2. **Hold** collected tax in a segregated reserve
3. **Reconcile** against input credits, refunds, and voids during the period
4. **Remit** the net liability to the tax authority on a fixed schedule

This model has been refined over 60 years of practical implementation. It works. GTC Tax Pocket ports it directly to the digital wallet context.

---

## 2. System Design

### 2.1 The Two Layers

GTC Tax Pocket has two distinct layers, and it is important to understand which is mandatory and which is optional.

**Layer 1: Software Pocket (mandatory minimum)**

The software pocket is a segregated ledger maintained within the wallet application. It records tax accruals, tracks their state, handles reconciliation, and manages the remittance schedule. No on-chain transactions occur until remittance. No funds leave the user's wallet. This is the only layer that the vast majority of individual users will ever need.

**Layer 2: On-Chain Commitment (optional, for businesses)**

For entities that require auditable proof of tax reserves — corporations, DAOs, high-volume merchants — the software pocket can be promoted to an on-chain escrow via `TaxPocket.sol`. This is a personal smart contract instance (one per entity) that holds committed tax balances and ensures funds can only be released to verified GTC jurisdiction vaults. It is immutable, self-custodied, and produces receipt NFTs as proof of payment.

### 2.2 Accrual State Machine

Each tax accrual record moves through the following states:

```
PENDING → CONFIRMED → COMMITTED → REMITTED
                    ↘
                     VOIDED (at any pre-remittance state)
```

**PENDING**: Created at transaction time. The net amount equals the gross estimate. The user's Tax Pocket balance increases. No funds move. The reconciliation window is open.

**CONFIRMED**: The reconciliation window has closed. The net amount is finalized (may be less than gross if refunds or credits applied). The liability is real and the due date is confirmed. This is the state in which the wallet begins displaying remittance warnings.

**COMMITTED**: The user has called `commit()` on their on-chain TaxPocket.sol instance. Actual tokens have been transferred to the contract. On-chain proof of reserves now exists.

**REMITTED**: Funds have been sent to the jurisdiction vault. A receipt NFT has been minted. The accrual is archived.

**VOIDED**: The underlying transaction was refunded, cancelled, or determined non-taxable. The accrual is archived with zero net amount. No remittance will occur.

### 2.3 Reconciliation

Reconciliation events may occur at any time before remittance:

| Event | Effect on Net Amount |
|---|---|
| Full refund | Reduced to zero (voided) |
| Partial refund | Reduced proportionally across all jurisdiction layers |
| Credit applied | Reduced by credit amount |
| Dispute hold | Frozen at current net, excluded from next remittance |
| Dispute resolved (taxpayer) | Voided |
| Dispute resolved (jurisdiction) | Confirmed at current net |

Reconciliation is applied proportionally across all jurisdiction layers. If a transaction generated accruals for PT-11 (local), PT (national), and GLOBAL (commons), a 50% refund reduces all three accruals by 50%.

### 2.4 Remittance Schedule

The taxpayer controls their remittance schedule. Available options:

| Schedule | Remittance Trigger |
|---|---|
| Monthly | Last calendar day of each month |
| Quarterly | Last day of Q1/Q2/Q3/Q4 |
| Annual | December 31 |
| On-Demand | Only when user explicitly initiates |
| Threshold | When pocket balance exceeds configurable amount |

The default schedule is quarterly. Wallets should display a reminder notification 7 days before each due date.

GTC does not enforce remittance timing. The user's legal obligations to their jurisdiction are independent of this protocol. GTC provides the infrastructure; compliance is the user's responsibility.

### 2.5 Yield Integration

Tax Pocket balances represent idle capital during the remittance window. The protocol supports optional integration with yield-bearing instruments:

**Supported yield sources:**
- AAVE / Compound (lending protocol deposit)
- USYC / TBILL (tokenized T-bills, currently ~4.5% APY)
- GTC Commons Yield Pool (future — protocol-native yield pool for Tax Pocket balances)

Yield accrues entirely to the wallet owner. The jurisdiction receives exactly the confirmed principal on remittance date, regardless of yield earned. This is economically equivalent to how businesses treat collected VAT — the float belongs to them.

To enable: user selects a yield vault in Tax Pocket settings. Confirmed balances are automatically deposited. On remittance, the protocol withdraws principal + yield, remits principal to jurisdiction vault, returns yield to user wallet.

---

## 3. Smart Contract Design

### 3.1 TaxPocket.sol

One instance per entity. Deployed by the user via `TaxPocketFactory`. Owned entirely by the user — no admin keys, no upgradeability, no pause function.

Key invariants:
- Funds can only exit to verified GTC jurisdiction vault addresses
- Verification is performed against the live `JurisdictionVaultRegistry`
- Owner may withdraw uncommitted funds at any time (they are not locked until `commit()`)
- A receipt NFT is minted on every successful `remit()` call

### 3.2 RemittanceReceipt.sol (ERC-721)

A non-transferable (soulbound) NFT minted on each remittance event. Contains:
- Taxpayer address
- Jurisdiction ID
- Token and amount remitted
- Remittance timestamp
- Period identifier (e.g., `202601` for Q1 2026)
- Vault address received

This NFT constitutes cryptographic proof of tax payment. It can be presented to any party requiring evidence of tax compliance without revealing the taxpayer's full transaction history.

### 3.3 TaxPocketFactory.sol

Deploys TaxPocket instances at deterministic addresses via CREATE2:

```
pocketAddress = CREATE2(
  deployer: GTC_FACTORY,
  salt: keccak256(ownerAddress),
  bytecode: TaxPocket_bytecode
)
```

Any entity can compute their own pocket address before deploying. The address is the same across all EVM chains.

---

## 4. Privacy Considerations

The software layer (Layer 1) has no on-chain footprint until remittance. Individual transaction-level tax accruals are never published to any chain.

The on-chain layer (Layer 2) reveals:
- That a specific address has committed tax reserves for a specific jurisdiction
- The total committed amount per token
- When and how much was remitted

It does not reveal:
- Which transactions generated the accruals
- The counterparties to those transactions
- Any information about the underlying commercial activity

The RemittanceReceipt NFT is soulbound (non-transferable) and reveals only the remittance event — not the underlying transaction history.

---

## 5. Non-Payment and Enforcement

GTC Tax Pocket does not enforce payment. The protocol has no mechanism to compel remittance, freeze funds, or penalize non-payment. This is by design: self-custody means the user controls their funds.

The enforcement layer is entirely external to this protocol:

1. **Transparency pressure**: Any observer can query a deployed TaxPocket.sol to see outstanding committed balances and whether remittance is overdue.

2. **Jurisdiction integration**: Jurisdictions that have claimed their GTC vault may require GTC remittance receipts as part of business license renewals, permit applications, or regulatory filings.

3. **Legal obligation**: The user's legal tax obligations exist independently of GTC. Using GTC Tax Pocket to accrue and remit creates an auditable record that the user took their obligations seriously. Not using it creates no additional legal exposure — the obligation exists regardless.

4. **Social contract**: The GTC system works because voluntary participation is in everyone's rational self-interest. The alternative — the current opaque, friction-heavy, capture-prone tax system — is worse for everyone.

---

## 6. Relationship to TIME Protocol

GTC Tax Pocket and TIME Protocol are complementary layers of the same vision.

TIME Protocol denominates human labor in time and creates a universal economic primitive for work compensation. Labor-derived income is **not taxed** under GTC rules — Rule 2 of the Global Tax Clearinghouse is zero income tax.

GTC Tax Pocket handles the commercial layer: when registered entities receive payment for goods and services, tax accrues automatically, is held in self-custody, and remitted on schedule.

Together:
- Earn in TIME → zero tax
- Spend at a merchant → commercial tax accrues in Tax Pocket
- Merchant holds tax in self-custody → remits quarterly
- Jurisdiction vault receives net confirmed liability
- Citizens see the balance in the jurisdiction's GitHub repo

This is the complete economic loop. January 1, 2034 is the target date for both protocols to function as the default infrastructure for the global economy.

---

## 7. Implementation Roadmap

| Milestone | Description | Target |
|---|---|---|
| v0.1 | Spec, contracts draft, SDK skeleton | Q1 2026 |
| v0.2 | Full SDK, React UI component, Hardhat test suite | Q2 2026 |
| v0.3 | First wallet integration (WalletConnect mobile) | Q3 2026 |
| v0.4 | On-chain contract audit | Q3 2026 |
| v1.0 | Production-ready, first live remittance on World Chain | Q4 2026 |
| v1.5 | Yield integration (USYC/TBILL) | Q1 2027 |
| v2.0 | GTC Commons Yield Pool | 2027 |

---

## Appendix: Key Differences from Immediate Routing

This document has argued throughout that accrual-based remittance is superior to pay-per-transaction routing. For completeness, here is the full comparison:

| Dimension | Immediate Routing | Tax Pocket |
|---|---|---|
| Tax leaves wallet | At transaction | At remittance date |
| Custody of tax funds | Jurisdiction vault | Taxpayer |
| Refund mechanism | On-chain reversal | Pre-payment reconciliation |
| Dispute mechanism | Post-payment recovery | Pre-payment freeze |
| Float / yield | Zero | Taxpayer earns it |
| On-chain tx per purchase | 1 routing tx | 0 |
| On-chain tx per period | N/A | 1 remittance tx |
| Gas cost per period | ~50k × N txns | ~50k × 1 txn |
| Auditable proof | Each transaction | Receipt NFT per period |
| Matches real-world VAT | No | Yes |
| Correct model | ❌ | ✅ |

---

*GTC Tax Pocket v0.1 — GPL-3.0 — github.com/global-tax-clearinghouse/gtc-tax-pocket*
