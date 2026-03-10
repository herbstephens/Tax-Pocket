/**
 * TaxPocketManager — Software-layer Tax Pocket
 *
 * This runs entirely in the wallet. No on-chain transactions.
 * No gas. No smart contract required (unless user opts into on-chain commitment).
 *
 * The Tax Pocket is:
 * - A segregated balance tracker per jurisdiction
 * - An accrual ledger per transaction
 * - A reconciliation engine for refunds/voids
 * - A remittance scheduler and reminder
 *
 * Data is stored in wallet-local storage (encrypted, user-owned).
 * The on-chain TaxPocket.sol is optional — used only when the user
 * wants cryptographic proof of their tax reserves.
 */

import { BigNumber, ethers } from 'ethers';
import type {
  GTCRoute,
  TaxAccrual,
  TaxPocketBalance,
  RemittanceSchedule,
  RemittancePeriod,
  PocketSummary,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReconciliationReason = 'refund' | 'void' | 'credit' | 'dispute_hold' | 'dispute_resolved';
export type RemittanceInterval = 'monthly' | 'quarterly' | 'annual' | 'on_demand' | 'threshold';

export interface AccrualRecord {
  id: string;
  jurisdictionId: string;
  tokenAddress: string;
  grossAmount: BigNumber;
  netAmount: BigNumber;        // After reconciliation
  accruedAt: number;           // Unix timestamp
  dueAt: number;               // When this becomes due
  txHash?: string;             // Originating transaction
  merchantAddress?: string;
  merchantName?: string;
  state: 'pending' | 'confirmed' | 'committed' | 'remitted' | 'voided';
  reconciliations: Array<{
    reason: ReconciliationReason;
    adjustedAmount: BigNumber;
    timestamp: number;
    note?: string;
  }>;
}

export interface PocketState {
  accruals: AccrualRecord[];
  schedule: RemittanceSchedule;
  lastRemittanceAt?: number;
  onChainPocketAddress?: string;  // Set if user has deployed TaxPocket.sol
}

const STORAGE_KEY = 'gtc_tax_pocket_v1';

// ─── TaxPocketManager ─────────────────────────────────────────────────────────

export class TaxPocketManager {
  private state: PocketState;
  private storage: Storage;

  constructor(
    private walletAddress: string,
    storage?: Storage,
    defaultSchedule?: Partial<RemittanceSchedule>
  ) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : new MemoryStorage());
    this.state = this.load() || {
      accruals: [],
      schedule: {
        interval: 'quarterly',
        thresholdAmount: null,
        reminderDaysBefore: 7,
        autoRemit: false,
        ...defaultSchedule,
      },
    };
  }

  // ─── Accrual ───────────────────────────────────────────────────────────────

  /**
   * accrueFromRoute — Record tax accrual from a completed transaction.
   * Called by the wallet after a payment to a registered entity is signed.
   *
   * This does NOT move any funds. It records the obligation
   * and updates the wallet's Tax Pocket display balance.
   *
   * @returns Array of accrual IDs (one per jurisdiction layer)
   */
  accrueFromRoute(route: GTCRoute, txHash?: string): string[] {
    if (!route.isTaxed) return [];

    const dueAt = this.calculateDueDate();
    const accrualIds: string[] = [];

    for (const split of route.jurisdictions) {
      const id = generateId(split.jurisdictionId, txHash || '', Date.now());

      const accrual: AccrualRecord = {
        id,
        jurisdictionId: split.jurisdictionId,
        tokenAddress: route.entity.tokenAddress || 'native',
        grossAmount: split.amount,
        netAmount: split.amount,
        accruedAt: Math.floor(Date.now() / 1000),
        dueAt,
        txHash,
        merchantAddress: route.entity.address,
        merchantName: route.entity.entityType,
        state: 'pending',
        reconciliations: [],
      };

      this.state.accruals.push(accrual);
      accrualIds.push(id);
    }

    this.save();
    return accrualIds;
  }

  // ─── Reconciliation ────────────────────────────────────────────────────────

  /**
   * reconcile — Adjust an accrual before remittance.
   * Use for refunds, voids, or credits.
   *
   * @param txHash     The original transaction hash
   * @param reason     Why the adjustment is being made
   * @param newAmount  New net amount (pass BigNumber.from(0) for full reversal)
   * @param note       Optional human-readable note
   */
  reconcileByTxHash(
    txHash: string,
    reason: ReconciliationReason,
    newAmount: BigNumber,
    note?: string
  ): AccrualRecord[] {
    const affected = this.state.accruals.filter(
      (a) => a.txHash === txHash && a.state !== 'remitted' && a.state !== 'voided'
    );

    for (const accrual of affected) {
      accrual.reconciliations.push({
        reason,
        adjustedAmount: newAmount,
        timestamp: Math.floor(Date.now() / 1000),
        note,
      });

      if (newAmount.isZero() && reason === 'void') {
        accrual.state = 'voided';
        accrual.netAmount = BigNumber.from(0);
      } else {
        // Scale proportionally if multiple jurisdictions
        const scale = newAmount.mul(10_000).div(accrual.grossAmount);
        accrual.netAmount = accrual.grossAmount.mul(scale).div(10_000);
        accrual.state = 'confirmed';
      }
    }

    this.save();
    return affected;
  }

  // ─── Balances ──────────────────────────────────────────────────────────────

  /**
   * getBalance — Get the Tax Pocket balance breakdown.
   * This is what the wallet UI displays.
   */
  getBalance(): TaxPocketSummary {
    const byJurisdiction = new Map<string, { pending: BigNumber; confirmed: BigNumber; token: string }>();

    for (const accrual of this.state.accruals) {
      if (accrual.state === 'remitted' || accrual.state === 'voided') continue;

      const key = `${accrual.jurisdictionId}:${accrual.tokenAddress}`;
      if (!byJurisdiction.has(key)) {
        byJurisdiction.set(key, {
          pending: BigNumber.from(0),
          confirmed: BigNumber.from(0),
          token: accrual.tokenAddress,
        });
      }

      const entry = byJurisdiction.get(key)!;
      if (accrual.state === 'pending') {
        entry.pending = entry.pending.add(accrual.netAmount);
      } else if (accrual.state === 'confirmed' || accrual.state === 'committed') {
        entry.confirmed = entry.confirmed.add(accrual.netAmount);
      }
    }

    const jurisdictions: JurisdictionPocketBalance[] = [];
    let totalPending = BigNumber.from(0);
    let totalConfirmed = BigNumber.from(0);

    for (const [key, value] of byJurisdiction.entries()) {
      const [jurisdictionId] = key.split(':');
      jurisdictions.push({
        jurisdictionId,
        tokenAddress: value.token,
        pendingAmount: value.pending,
        confirmedAmount: value.confirmed,
        totalAmount: value.pending.add(value.confirmed),
      });
      totalPending = totalPending.add(value.pending);
      totalConfirmed = totalConfirmed.add(value.confirmed);
    }

    const nextDue = this.getNextDueDate();
    const daysUntilDue = nextDue
      ? Math.ceil((nextDue - Date.now() / 1000) / 86400)
      : null;

    return {
      jurisdictions,
      totalPending,
      totalConfirmed,
      totalOutstanding: totalPending.add(totalConfirmed),
      nextDueDate: nextDue,
      daysUntilDue,
      isOverdue: nextDue ? nextDue < Date.now() / 1000 : false,
      accrualCount: this.state.accruals.filter(
        (a) => a.state !== 'remitted' && a.state !== 'voided'
      ).length,
    };
  }

  /**
   * getRemittancePreview — What would be sent if we remitted right now?
   * Used to build the remittance transaction.
   */
  getRemittancePreview(): RemittancePreview[] {
    const byJurisdiction = new Map<string, RemittancePreview>();

    for (const accrual of this.state.accruals) {
      if (accrual.state !== 'confirmed' && accrual.state !== 'committed') continue;

      const key = `${accrual.jurisdictionId}:${accrual.tokenAddress}`;
      if (!byJurisdiction.has(key)) {
        byJurisdiction.set(key, {
          jurisdictionId: accrual.jurisdictionId,
          tokenAddress: accrual.tokenAddress,
          amount: BigNumber.from(0),
          accrualIds: [],
          period: getCurrentPeriod(),
        });
      }

      const preview = byJurisdiction.get(key)!;
      preview.amount = preview.amount.add(accrual.netAmount);
      preview.accrualIds.push(accrual.id);
    }

    return Array.from(byJurisdiction.values()).filter((p) => p.amount.gt(0));
  }

  // ─── Remittance ────────────────────────────────────────────────────────────

  /**
   * markRemitted — Record that a remittance has been sent.
   * Called after the on-chain remittance transaction is confirmed.
   *
   * @param jurisdictionId  Which jurisdiction was paid
   * @param tokenAddress    Which token was remitted
   * @param txHash          The remittance transaction hash
   */
  markRemitted(
    jurisdictionId: string,
    tokenAddress: string,
    txHash: string
  ): void {
    const affected = this.state.accruals.filter(
      (a) =>
        a.jurisdictionId === jurisdictionId &&
        a.tokenAddress === tokenAddress &&
        (a.state === 'confirmed' || a.state === 'committed')
    );

    for (const accrual of affected) {
      accrual.state = 'remitted';
    }

    this.state.lastRemittanceAt = Math.floor(Date.now() / 1000);
    this.save();
  }

  // ─── Schedule ──────────────────────────────────────────────────────────────

  setSchedule(schedule: Partial<RemittanceSchedule>): void {
    this.state.schedule = { ...this.state.schedule, ...schedule };
    this.save();
  }

  getSchedule(): RemittanceSchedule {
    return this.state.schedule;
  }

  getNextDueDate(): number | null {
    const { interval, lastRemittanceAt } = {
      lastRemittanceAt: this.state.lastRemittanceAt,
      ...this.state.schedule,
    };

    const base = lastRemittanceAt || Math.floor(Date.now() / 1000);

    const intervals: Record<string, number> = {
      monthly:   30 * 86400,
      quarterly: 90 * 86400,
      annual:    365 * 86400,
      on_demand: Infinity,
    };

    if (interval === 'on_demand') return null;
    return base + (intervals[interval] || 90 * 86400);
  }

  // ─── History ───────────────────────────────────────────────────────────────

  getHistory(limit = 50): AccrualRecord[] {
    return [...this.state.accruals]
      .sort((a, b) => b.accruedAt - a.accruedAt)
      .slice(0, limit);
  }

  getAccrualsByTx(txHash: string): AccrualRecord[] {
    return this.state.accruals.filter((a) => a.txHash === txHash);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private save(): void {
    const key = `${STORAGE_KEY}:${this.walletAddress}`;
    this.storage.setItem(key, JSON.stringify(this.state, bigNumberReplacer));
  }

  private load(): PocketState | null {
    const key = `${STORAGE_KEY}:${this.walletAddress}`;
    const raw = this.storage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw, bigNumberReviver);
    } catch {
      return null;
    }
  }

  // ─── On-Chain Upgrade ──────────────────────────────────────────────────────

  /**
   * linkOnChainPocket — Connect this software pocket to a deployed TaxPocket.sol
   * After linking, commit() calls will write to the smart contract.
   */
  linkOnChainPocket(contractAddress: string): void {
    this.state.onChainPocketAddress = contractAddress;
    this.save();
  }

  get onChainAddress(): string | undefined {
    return this.state.onChainPocketAddress;
  }

  private calculateDueDate(): number {
    const nextDue = this.getNextDueDate();
    return nextDue || Math.floor(Date.now() / 1000) + 90 * 86400;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JurisdictionPocketBalance {
  jurisdictionId: string;
  tokenAddress: string;
  pendingAmount: BigNumber;
  confirmedAmount: BigNumber;
  totalAmount: BigNumber;
}

export interface TaxPocketSummary {
  jurisdictions: JurisdictionPocketBalance[];
  totalPending: BigNumber;
  totalConfirmed: BigNumber;
  totalOutstanding: BigNumber;
  nextDueDate: number | null;
  daysUntilDue: number | null;
  isOverdue: boolean;
  accrualCount: number;
}

export interface RemittancePreview {
  jurisdictionId: string;
  tokenAddress: string;
  amount: BigNumber;
  accrualIds: string[];
  period: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(jurisdictionId: string, txHash: string, ts: number): string {
  return ethers.utils.id(`${jurisdictionId}:${txHash}:${ts}`).slice(0, 18);
}

function getCurrentPeriod(): number {
  const d = new Date();
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

// BigNumber JSON serialization
function bigNumberReplacer(_key: string, value: unknown) {
  if (value && typeof value === 'object' && (value as any)._isBigNumber) {
    return { _type: 'BigNumber', _hex: (value as BigNumber).toHexString() };
  }
  return value;
}

function bigNumberReviver(_key: string, value: unknown) {
  if (value && typeof value === 'object' && (value as any)._type === 'BigNumber') {
    return BigNumber.from((value as any)._hex);
  }
  return value;
}

// Fallback in-memory storage for environments without localStorage
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  getItem(key: string) { return this.map.get(key) || null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  key(index: number) { return [...this.map.keys()][index] || null; }
}
