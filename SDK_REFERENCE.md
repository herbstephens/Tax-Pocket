# SDK Reference

TypeScript/JavaScript SDK for GTC Tax Pocket.

---

## Installation

```bash
npm install @gtc/tax-pocket
```

---

## TaxPocketManager

The core class. One instance per connected wallet. Manages accruals, reconciliations, scheduling, and history. Runs entirely in-memory / local storage — no on-chain transactions until remittance.

### Constructor

```typescript
new TaxPocketManager(walletAddress: string, options?: TaxPocketOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `schedule` | `RemittanceInterval` | `'quarterly'` | Remittance frequency |
| `reminderDaysBefore` | `number` | `7` | Days before due date to surface a warning |
| `yieldEnabled` | `boolean` | `false` | Enable yield on committed balances |
| `yieldVaultAddress` | `string` | `undefined` | Yield vault contract address |
| `storage` | `Storage` | `localStorage` | Storage backend (override for React Native / server) |

---

### `accrueFromRoute(route, txHash?)`

Record tax accrual from a GTC route. Call after a commercial transaction confirms.

```typescript
accrueFromRoute(route: GTCRoute, txHash?: string): string[]
```

**Returns:** Array of accrual IDs (one per jurisdiction layer).

**P2P safety:** If `route.isTaxed === false`, returns an empty array and makes no changes.

```typescript
const ids = pocket.accrueFromRoute(route, txHash);
// ids = ['acc_abc123', 'acc_def456', 'acc_ghi789', 'acc_jkl012']
// (local, regional, national, global)
```

---

### `reconcileByTxHash(txHash, reason, newAmount, note?)`

Adjust all accruals associated with a transaction. Use for refunds, voids, and credits.

```typescript
reconcileByTxHash(
  txHash: string,
  reason: 'refund' | 'void' | 'credit' | 'dispute_hold' | 'dispute_resolved',
  newAmount: BigNumber,
  note?: string
): AccrualRecord[]
```

**For full reversal (void):** Pass `BigNumber.from(0)` as `newAmount`.

**Proportional scaling:** If the transaction generated 4 accruals (local, regional, national, global), the `newAmount` is interpreted as the new *total* net for that transaction. Each accrual is scaled proportionally from the original gross.

```typescript
// Full refund
pocket.reconcileByTxHash('0xABC', 'void', BigNumber.from(0));

// 50% partial refund — pass 50% of the original amount
pocket.reconcileByTxHash('0xABC', 'refund', originalAmount.div(2));
```

---

### `getBalance()`

Returns the current Tax Pocket balance summary.

```typescript
getBalance(): TaxPocketSummary
```

```typescript
interface TaxPocketSummary {
  jurisdictions: JurisdictionPocketBalance[];  // Per-jurisdiction breakdown
  totalPending: BigNumber;                     // Sum of all PENDING accruals
  totalConfirmed: BigNumber;                   // Sum of all CONFIRMED accruals
  totalOutstanding: BigNumber;                 // pending + confirmed
  nextDueDate: number | null;                  // Unix timestamp
  daysUntilDue: number | null;                 // Positive = future, ≤0 = overdue
  isOverdue: boolean;
  accrualCount: number;                        // Active (non-remitted) accruals
}
```

---

### `getRemittancePreview()`

Returns what would be remitted if the user triggered remittance right now.

```typescript
getRemittancePreview(): RemittancePreview[]
```

```typescript
interface RemittancePreview {
  jurisdictionId: string;    // e.g. 'PT-11'
  tokenAddress: string;
  amount: BigNumber;          // Net confirmed amount
  accrualIds: string[];       // Which accruals would be cleared
  period: number;             // e.g. 202601
}
```

Only includes CONFIRMED and COMMITTED accruals (not pending).

---

### `markRemitted(jurisdictionId, tokenAddress, txHash)`

Record that a remittance has been sent on-chain. Call after the remittance transaction confirms.

```typescript
markRemitted(jurisdictionId: string, tokenAddress: string, txHash: string): void
```

Marks all CONFIRMED/COMMITTED accruals for the jurisdiction as REMITTED. Updates `lastRemittanceAt`.

---

### `getHistory(limit?)`

Returns accrual history sorted by date descending.

```typescript
getHistory(limit?: number): AccrualRecord[]
// Default limit: 50
```

---

### `getAccrualsByTx(txHash)`

Returns all accruals associated with a specific transaction.

```typescript
getAccrualsByTx(txHash: string): AccrualRecord[]
```

---

### `setSchedule(schedule)`

Update the remittance schedule.

```typescript
setSchedule(schedule: Partial<RemittanceSchedule>): void

interface RemittanceSchedule {
  interval: 'monthly' | 'quarterly' | 'annual' | 'on_demand' | 'threshold';
  thresholdAmount: BigNumber | null;  // For 'threshold' interval
  reminderDaysBefore: number;
  autoRemit: boolean;
}
```

---

### `getNextDueDate()`

Returns the Unix timestamp of the next remittance due date, or `null` for on-demand schedules.

```typescript
getNextDueDate(): number | null
```

---

### `linkOnChainPocket(contractAddress)`

Associate this software pocket with a deployed `TaxPocket.sol` instance.

```typescript
linkOnChainPocket(contractAddress: string): void
```

After linking, `pocket.onChainAddress` is set and wallet UIs can offer on-chain commitment flows.

---

## Types

### AccrualRecord

```typescript
interface AccrualRecord {
  id: string;
  jurisdictionId: string;
  tokenAddress: string;
  grossAmount: BigNumber;
  netAmount: BigNumber;
  accruedAt: number;          // Unix timestamp
  dueAt: number;              // When due for remittance
  txHash?: string;
  merchantAddress?: string;
  merchantName?: string;
  state: 'pending' | 'confirmed' | 'committed' | 'remitted' | 'voided';
  reconciliations: ReconciliationEvent[];
}
```

### ReconciliationEvent

```typescript
interface ReconciliationEvent {
  reason: 'refund' | 'void' | 'credit' | 'dispute_hold' | 'dispute_resolved';
  adjustedAmount: BigNumber;
  timestamp: number;
  note?: string;
}
```

---

## UI Components

### `TaxPocketDashboard`

Full wallet dashboard. Includes Balance, Accruals, Remit, and Settings tabs.

```tsx
import { TaxPocketDashboard } from '@gtc/tax-pocket/ui';

<TaxPocketDashboard
  pocket={pocket}              // TaxPocketManager instance
  tokenSymbol="USDC"           // Display symbol
  tokenDecimals={6}            // Token decimals for formatting
  theme="dark"                 // 'light' | 'dark' | 'auto'
  onRemitRequest={handleRemit} // (preview: RemittancePreview[]) => void
  onDeployOnChain={handleDeploy} // Optional: () => Promise<string>
/>
```

### `TaxPocketBadge`

Compact badge showing current pocket balance and next due date. For wallet header or footer.

```tsx
import { TaxPocketBadge } from '@gtc/tax-pocket/ui';

<TaxPocketBadge
  pocket={pocket}
  tokenSymbol="USDC"
  tokenDecimals={6}
  onClick={() => openTaxPocketTab()}
/>
// Renders: 🏛️ 312.40 USDC · 21d
```

---

## Error Handling

The SDK never throws on network errors. All on-chain lookups fail gracefully:

- Entity registry unavailable → treat as P2P (no accrual)
- Rate oracle unavailable → use default rates
- Storage unavailable → use in-memory fallback

Always safe to call `accrueFromRoute()` — worst case is no accrual on a P2P transaction.
