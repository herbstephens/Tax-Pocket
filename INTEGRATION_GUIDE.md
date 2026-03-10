# Integration Guide

Step-by-step guide for wallet developers integrating GTC Tax Pocket.

Estimated time: **1–3 hours** for a working integration.

---

## Prerequisites

You need:
- A wallet that already integrates with `@gtc/sdk` for entity detection and routing
- A React-based wallet UI (for the dashboard component)
- Node 18+

If you haven't done the base GTC SDK integration, start here:
[gtc-wallet-sdk Integration Guide](https://github.com/global-tax-clearinghouse/gtc-wallet-sdk#readme)

---

## Step 1: Install

```bash
npm install @gtc/tax-pocket @gtc/sdk ethers
```

---

## Step 2: Initialize the Pocket Manager

Create one `TaxPocketManager` instance per connected wallet. Persist it for the session.

```typescript
import { TaxPocketManager } from '@gtc/tax-pocket';

// On wallet connect:
const pocket = new TaxPocketManager(connectedWalletAddress, {
  schedule: 'quarterly',       // monthly | quarterly | annual | on_demand
  reminderDaysBefore: 7,       // show warning N days before due date
  yieldEnabled: false,         // off by default — user enables in settings
});
```

---

## Step 3: Accrue on Commercial Transactions

After any transaction to a registered entity is signed and confirmed, record the accrual:

```typescript
import { GTCRouter } from '@gtc/sdk';

const router = new GTCRouter();

// In your send transaction flow:
async function sendPayment(to, amount, token) {
  const route = await router.resolve({ from: userAddress, to, amount, token });

  // Show TaxBreakdown UI (from @gtc/sdk) for user confirmation
  const txHash = await wallet.sendTransaction(route.calldata);

  // Record accrual after tx confirms
  if (route.isTaxed) {
    pocket.accrueFromRoute(route, txHash);
    // Pocket balance updates. User sees it in Tax Pocket tab.
  }
}
```

That's the minimum integration. Everything else is refinement.

---

## Step 4: Handle Refunds

When a merchant issues a refund, reduce the corresponding accrual:

```typescript
// Full refund
pocket.reconcileByTxHash(originalTxHash, 'void', BigNumber.from(0));

// Partial refund (50%)
const originalAccruals = pocket.getAccrualsByTx(originalTxHash);
for (const accrual of originalAccruals) {
  pocket.reconcileByTxHash(
    originalTxHash,
    'refund',
    accrual.netAmount.div(2),
    '50% refund applied'
  );
}
```

---

## Step 5: Add the Dashboard UI

Drop the Tax Pocket dashboard into your wallet as a tab or modal:

```tsx
import { TaxPocketDashboard } from '@gtc/tax-pocket/ui';

// In your wallet's main view:
<TaxPocketDashboard
  walletAddress={userAddress}
  pocket={pocket}              // your TaxPocketManager instance
  tokenSymbol="USDC"
  tokenDecimals={6}
  theme="dark"                 // 'light' | 'dark' | 'auto'
  onRemitRequest={handleRemit} // called when user initiates remittance
/>
```

The dashboard includes four tabs automatically:
- **Balance** — per-jurisdiction breakdown, pending vs confirmed, next due date
- **Accruals** — transaction-level accrual list with void controls
- **Remit** — remittance preview and confirm flow
- **Settings** — schedule, yield, on-chain commitment options

---

## Step 6: Handle Remittance

When the user confirms a remittance in the dashboard:

```typescript
async function handleRemit(preview: RemittancePreview[]) {
  for (const item of preview) {
    // Build the remittance transaction
    // Option A: Software-only pocket (no on-chain TaxPocket.sol)
    // Route directly to jurisdiction vault via GTCTaxRouter:
    const tx = await taxRouter.routePayment(
      item.tokenAddress,
      vaultRegistry.getVault(item.jurisdictionId),
      item.amount
    );
    const receipt = await tx.wait();
    pocket.markRemitted(item.jurisdictionId, item.tokenAddress, receipt.transactionHash);

    // Option B: On-chain TaxPocket.sol (user has deployed it)
    // pocket.onChainAddress is set if the user deployed TaxPocket.sol
    if (pocket.onChainAddress) {
      const pocketContract = TaxPocket__factory.connect(pocket.onChainAddress, signer);
      await pocketContract.remit(item.jurisdictionId, item.tokenAddress, currentPeriod());
      // Receipt NFT auto-minted, markRemitted called via event listener
    }
  }
}
```

---

## Step 7: Remittance Reminders

Show a notification when the due date is approaching:

```typescript
// On app load or wallet reconnect:
const summary = pocket.getBalance();

if (summary.isOverdue) {
  showNotification({
    type: 'warning',
    title: 'Tax Pocket Overdue',
    body: `${summary.totalConfirmed} USDC in tax is overdue for remittance.`,
    action: () => openTaxPocketTab(),
  });
} else if (summary.daysUntilDue !== null && summary.daysUntilDue <= 7) {
  showNotification({
    type: 'info',
    title: `Tax Pocket due in ${summary.daysUntilDue} days`,
    body: `${summary.totalConfirmed} USDC due ${formatDate(summary.nextDueDate)}.`,
    action: () => openTaxPocketTab(),
  });
}
```

---

## Step 8: Address Book Enhancement

Show Tax Pocket status in your address book and recipient field:

```tsx
import { TaxBadge } from '@gtc/sdk/ui';

// In your send flow, next to the recipient address:
<AddressDisplay address={recipient} />
<TaxBadge address={recipient} />
// Renders: 🏛️ PT-11 · 5.5%   OR   🟢 P2P
```

When the badge shows a jurisdiction, the wallet knows to accrue after this payment confirms.

---

## Optional: On-Chain Commitment

For power users and businesses wanting auditable proof:

```typescript
// Deploy TaxPocket.sol for the user (one-time)
async function deployOnChainPocket() {
  const factory = TaxPocketFactory__factory.connect(GTC_FACTORY_ADDRESS, signer);
  const tx = await factory.deploy(userAddress);
  const receipt = await tx.wait();
  const pocketAddress = receipt.events?.[0].args?.pocket;

  // Link to software pocket
  pocket.linkOnChainPocket(pocketAddress);

  showSuccess(`On-chain Tax Pocket deployed at ${pocketAddress}`);
}

// Commit confirmed balances on-chain
async function commitToChain(jurisdictionId: string, token: string) {
  const pocketContract = TaxPocket__factory.connect(pocket.onChainAddress!, signer);
  const amount = pocket.getBalance().jurisdictions
    .find(j => j.jurisdictionId === jurisdictionId)?.confirmedAmount;

  await IERC20__factory.connect(token, signer).approve(pocket.onChainAddress!, amount);
  await pocketContract.commit(jurisdictionId, token);
}
```

---

## Testing Your Integration

```typescript
import { TaxPocketManager } from '@gtc/tax-pocket';
import { MockGTCRoute } from '@gtc/sdk/testing';

describe('Tax Pocket integration', () => {
  const pocket = new TaxPocketManager('0xTestWallet');

  it('accrues from a taxed route', () => {
    const route = MockGTCRoute.taxed({
      jurisdictionId: 'PT-11',
      amount: parseUnits('100', 6),
    });
    const ids = pocket.accrueFromRoute(route, '0xTEST_TX');
    expect(ids).toHaveLength(4); // local, regional, national, global
    expect(pocket.getBalance().totalOutstanding.gt(0)).toBe(true);
  });

  it('does not accrue from a P2P route', () => {
    const route = MockGTCRoute.p2p();
    const ids = pocket.accrueFromRoute(route, '0xTEST_TX_2');
    expect(ids).toHaveLength(0);
  });

  it('voids accrual on full refund', () => {
    pocket.reconcileByTxHash('0xTEST_TX', 'void', BigNumber.from(0));
    const accruals = pocket.getAccrualsByTx('0xTEST_TX');
    expect(accruals.every(a => a.state === 'voided')).toBe(true);
  });
});
```

---

## FAQ

**Q: What if the user never remits?**
GTC cannot force remittance. The user's legal obligations exist independently of this SDK. The pocket is a tool to make compliance easy — not a compliance enforcement system.

**Q: Does this work on chains other than World Chain?**
Yes. The SDK is chain-agnostic. The on-chain `TaxPocket.sol` deployment and `remit()` call can happen on any EVM chain where the jurisdiction vault is deployed.

**Q: What if a jurisdiction vault doesn't exist yet?**
Accruals for unclaimed jurisdictions accumulate in the software pocket normally. When the jurisdiction registers, the vault address resolves and remittance can proceed. The user holds the funds in self-custody until then.

**Q: Can the user spend from their Tax Pocket?**
The software pocket is not technically locked — the wallet just strongly discourages it. The on-chain version (`TaxPocket.sol`) committed funds can only go to jurisdiction vaults — not to arbitrary addresses.

---

*Questions? Open an issue on [GitHub](https://github.com/global-tax-clearinghouse/gtc-tax-pocket/issues).*
