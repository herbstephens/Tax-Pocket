# Contract Reference

Technical documentation for all GTC Tax Pocket smart contracts.

---

## TaxPocket.sol

**Purpose:** Self-custody tax escrow. One instance per entity (wallet or business). Deployed by the user. Owned entirely by the user.

**Key invariant:** Funds deposited via `commit()` can *only* exit via `remit()` to a verified GTC jurisdiction vault. No other withdrawal path exists.

---

### State Variables

| Variable | Type | Description |
|---|---|---|
| `jurisdictionVaultRegistry` | `IJurisdictionVaultRegistry` | GTC registry for verifying vault addresses |
| `receiptNFT` | `IGTCReceiptNFT` | Contract that mints receipt NFTs on remittance |
| `accruals` | `mapping(bytes32 => TaxAccrual)` | All accrual records by ID |
| `pendingBalance` | `mapping(string => mapping(address => uint256))` | Pending balance per jurisdiction per token |
| `committedBalance` | `mapping(string => mapping(address => uint256))` | On-chain committed balance per jurisdiction per token |
| `remittanceInterval` | `uint256` | Default remittance interval in seconds |
| `yieldVault` | `address` | Optional yield integration address |

---

### Structs

#### TaxAccrual

```solidity
struct TaxAccrual {
    string   jurisdictionId;   // GTC jurisdiction ID, e.g. "PT-11"
    address  token;            // ERC-20 token address
    uint256  amount;           // Original gross amount
    uint256  netAmount;        // After reconciliation
    uint256  accruedAt;        // Block timestamp
    uint256  dueAt;            // Remittance due date
    bool     committed;        // True after commit()
    bool     remitted;         // True after remit()
    bytes32  txRef;            // Originating transaction hash
}
```

#### RemittanceReceipt

```solidity
struct RemittanceReceipt {
    address  taxpayer;
    string   jurisdictionId;
    address  token;
    uint256  amount;
    uint256  remittedAt;
    address  vault;
    uint256  period;           // e.g. 202601 = January 2026
}
```

---

### Functions

#### `accrueFromTransaction(jurisdictionId, token, amount, dueAt, txRef)`

Records a new tax accrual. Does NOT transfer any tokens. Updates `pendingBalance`.

Called by the wallet SDK after a commercial transaction confirms.

```solidity
function accrueFromTransaction(
    string  calldata jurisdictionId,
    address          token,
    uint256          amount,
    uint256          dueAt,
    bytes32          txRef
) external onlyOwner returns (bytes32 accrualId)
```

**Access:** Owner only

---

#### `reconcile(accrualId, newAmount, reason)`

Adjusts the net amount of an accrual before remittance. Used for refunds, voids, and credits.

```solidity
function reconcile(
    bytes32         accrualId,
    uint256         newAmount,   // Must be <= original amount
    string calldata reason
) external onlyOwner
```

**Constraints:**
- `newAmount` must not exceed `accruals[accrualId].amount`
- Cannot reconcile a remitted accrual
- Proportionally updates the running balance (pending or committed)

**Access:** Owner only

---

#### `commit(jurisdictionId, token)`

Promotes all pending accruals for a jurisdiction to on-chain committed state. Transfers actual tokens into this contract.

```solidity
function commit(
    string calldata jurisdictionId,
    address         token
) external onlyOwner nonReentrant
```

**Preconditions:**
- Owner must have approved this contract for at least `pendingBalance[jurisdictionId][token]`
- `pendingBalance[jurisdictionId][token]` must be > 0

**Effects:**
- Transfers tokens from owner to this contract
- Moves balance from `pendingBalance` to `committedBalance`
- Marks all affected accruals as `committed = true`
- Emits `TaxCommitted` for each affected accrual

**Access:** Owner only

---

#### `remit(jurisdictionId, token, period)`

Releases committed tax funds to the jurisdiction vault. Mints a receipt NFT.

```solidity
function remit(
    string calldata jurisdictionId,
    address         token,
    uint256         period
) external onlyOwner nonReentrant
```

**Preconditions:**
- `committedBalance[jurisdictionId][token]` must be > 0
- `vaultRegistry.getVault(jurisdictionId)` must return an active vault

**Effects:**
- Clears `committedBalance[jurisdictionId][token]`
- Marks all committed accruals for this jurisdiction as `remitted = true`
- Transfers tokens to jurisdiction vault
- Mints `RemittanceReceipt` NFT to owner
- Emits `TaxRemitted`

**Security:** The vault address is verified against the live `JurisdictionVaultRegistry` at execution time. Stale or misconfigured vault addresses will cause the call to revert.

**Access:** Owner only

---

#### `remitAll(jurisdictionIds, tokens, period)`

Batch remittance — remits all committed balances in a single transaction.

```solidity
function remitAll(
    string[] calldata jurisdictionIds,
    address[] calldata tokens,
    uint256 period
) external onlyOwner nonReentrant
```

**Access:** Owner only

---

#### `getDueAccruals()`

Returns all accrual IDs that are committed and past their due date.

```solidity
function getDueAccruals() 
    external view 
    returns (bytes32[] memory due)
```

---

#### `nextRemittanceDate()`

Returns the next remittance due date based on the configured interval.

```solidity
function nextRemittanceDate() external view returns (uint256)
```

---

### Events

| Event | Parameters | When emitted |
|---|---|---|
| `TaxAccrued` | `accrualId, jurisdictionId, token, amount, dueAt, txRef` | On `accrueFromTransaction()` |
| `TaxReconciled` | `accrualId, oldAmount, newAmount, reason` | On `reconcile()` |
| `TaxCommitted` | `accrualId, jurisdictionId, amount, dueAt` | On `commit()` per accrual |
| `TaxRemitted` | `jurisdictionId, vault, token, amount, period, receiptTokenId` | On `remit()` |
| `RemittanceScheduleUpdated` | `newInterval` | On `setRemittanceInterval()` |

---

## TaxPocketFactory.sol (planned v0.2)

Deploys TaxPocket instances at deterministic addresses via CREATE2.

```solidity
function deploy(address owner) external returns (address pocket)
function computeAddress(address owner) external view returns (address)
```

The pocket address for any `owner` is identical across all EVM chains.

---

## RemittanceReceipt.sol (planned v0.2)

ERC-721 soulbound (non-transferable) NFT minted on each remittance.

**Metadata includes:**
- Taxpayer address
- Jurisdiction ID
- Token and amount
- Remittance timestamp  
- Period (e.g. `202601`)
- Vault address

**Transfer restriction:** `_beforeTokenTransfer` reverts on any transfer. Receipts are permanently bound to the taxpayer's address. They prove *you* paid, not that some token holder paid.

---

## Deployed Addresses

All contracts pending first deployment. Addresses will be listed here after audit.

Target deployment: World Chain mainnet, with mirrors on Ethereum and Base.
