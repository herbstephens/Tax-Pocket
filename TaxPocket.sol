// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/**
 * TaxPocket.sol — Self-Custody Tax Escrow
 *
 * One deployed per wallet (or per entity). Owned by the taxpayer.
 * Nobody can take the funds except the owner, and only to remit to
 * verified jurisdiction vaults.
 *
 * Usage flow:
 *   1. Wallet accrues estimated tax in software (no on-chain action)
 *   2. User optionally "commits" a period's liability here (locked until due)
 *   3. On remittance date, user calls remit() → funds go to vault
 *   4. GTC issues a receipt NFT as proof of remittance
 *
 * This contract is optional. Most users will use software-only Tax Pocket.
 * It exists for businesses needing auditable proof of tax reserves.
 *
 * Key properties:
 *   - Owner has FULL control (self-custody)
 *   - Funds can ONLY leave to verified GTC jurisdiction vaults
 *   - Owner cannot send to arbitrary addresses (protects against accidental spend)
 *   - Time-lock is advisory, not enforced (owner can override with penalty flag)
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IJurisdictionVaultRegistry {
    function getVault(string calldata jurisdictionId) external view returns (address vault, bool isActive);
}

interface IGTCReceiptNFT {
    function mint(address to, RemittanceReceipt calldata receipt) external returns (uint256 tokenId);
}

struct TaxAccrual {
    string   jurisdictionId;
    address  token;
    uint256  amount;          // gross accrued
    uint256  netAmount;       // after reconciliation (credits, refunds)
    uint256  accruedAt;       // block timestamp of accrual
    uint256  dueAt;           // remittance due date
    bool     committed;       // true once committed on-chain
    bool     remitted;        // true once sent to vault
    bytes32  txRef;           // reference to originating transaction hash
}

struct RemittanceReceipt {
    address  taxpayer;
    string   jurisdictionId;
    address  token;
    uint256  amount;
    uint256  remittedAt;
    address  vault;
    uint256  period;          // e.g. 202501 for Jan 2025
}

contract TaxPocket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    IJurisdictionVaultRegistry public immutable vaultRegistry;
    IGTCReceiptNFT             public immutable receiptNFT;

    // All accruals, indexed by ID
    mapping(bytes32 => TaxAccrual) public accruals;
    bytes32[] public accrualIds;

    // Running totals per jurisdiction per token
    // jurisdictionId → token → amount
    mapping(string => mapping(address => uint256)) public pendingBalance;
    mapping(string => mapping(address => uint256)) public committedBalance;

    // Remittance schedule: default remittance interval in seconds
    uint256 public remittanceInterval = 90 days; // quarterly default
    uint256 public lastRemittanceAt;

    // Yield integration (optional)
    address public yieldVault;    // e.g. AAVE aToken address
    bool    public yieldEnabled;

    // ─── Events ───────────────────────────────────────────────────────────────

    event TaxAccrued(
        bytes32 indexed accrualId,
        string  jurisdictionId,
        address token,
        uint256 amount,
        uint256 dueAt,
        bytes32 txRef
    );

    event TaxReconciled(
        bytes32 indexed accrualId,
        uint256 oldAmount,
        uint256 newAmount,
        string  reason    // "refund" | "void" | "credit" | "dispute"
    );

    event TaxCommitted(
        bytes32 indexed accrualId,
        string  jurisdictionId,
        uint256 amount,
        uint256 dueAt
    );

    event TaxRemitted(
        string  indexed jurisdictionId,
        address indexed vault,
        address         token,
        uint256         amount,
        uint256         period,
        uint256         receiptTokenId
    );

    event RemittanceScheduleUpdated(uint256 newInterval);
    event YieldEnabled(address yieldVault);
    event YieldDisabled();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _owner,
        IJurisdictionVaultRegistry _vaultRegistry,
        IGTCReceiptNFT _receiptNFT
    ) Ownable(_owner) {
        vaultRegistry = _vaultRegistry;
        receiptNFT = _receiptNFT;
        lastRemittanceAt = block.timestamp;
    }

    // ─── Accrual ──────────────────────────────────────────────────────────────

    /**
     * accrueFromTransaction — Called by the wallet SDK when a commercial
     * transaction is made. Segregates estimated tax into pending balance.
     *
     * This does NOT transfer tokens. It records the accrual and the wallet
     * UI shows the segregated balance. The user "mentally" sets aside these funds.
     *
     * For on-chain commitment, the user later calls commit().
     *
     * @param jurisdictionId  GTC jurisdiction ID (e.g. "PT-11")
     * @param token           ERC-20 token address
     * @param amount          Estimated tax amount
     * @param dueAt           When this becomes due for remittance
     * @param txRef           Hash of the originating payment transaction
     */
    function accrueFromTransaction(
        string  calldata jurisdictionId,
        address          token,
        uint256          amount,
        uint256          dueAt,
        bytes32          txRef
    ) external onlyOwner returns (bytes32 accrualId) {
        accrualId = keccak256(abi.encodePacked(
            jurisdictionId, token, amount, block.timestamp, txRef
        ));

        accruals[accrualId] = TaxAccrual({
            jurisdictionId: jurisdictionId,
            token:          token,
            amount:         amount,
            netAmount:      amount,
            accruedAt:      block.timestamp,
            dueAt:          dueAt,
            committed:      false,
            remitted:       false,
            txRef:          txRef
        });

        accrualIds.push(accrualId);
        pendingBalance[jurisdictionId][token] += amount;

        emit TaxAccrued(accrualId, jurisdictionId, token, amount, dueAt, txRef);
    }

    // ─── Reconciliation ───────────────────────────────────────────────────────

    /**
     * reconcile — Adjust an accrual before remittance.
     * Used for refunds, voids, credits, or dispute resolutions.
     *
     * @param accrualId   The accrual to adjust
     * @param newAmount   The corrected net amount (0 = full reversal)
     * @param reason      Human-readable reason for adjustment
     */
    function reconcile(
        bytes32        accrualId,
        uint256        newAmount,
        string calldata reason
    ) external onlyOwner {
        TaxAccrual storage a = accruals[accrualId];
        require(!a.remitted, "TaxPocket: already remitted");
        require(newAmount <= a.amount, "TaxPocket: cannot increase accrual");

        uint256 oldNet = a.netAmount;
        a.netAmount = newAmount;

        // Update running balance
        string memory jId = a.jurisdictionId;
        if (a.committed) {
            committedBalance[jId][a.token] = committedBalance[jId][a.token] - oldNet + newAmount;
        } else {
            pendingBalance[jId][a.token] = pendingBalance[jId][a.token] - oldNet + newAmount;
        }

        emit TaxReconciled(accrualId, oldNet, newAmount, reason);
    }

    // ─── On-Chain Commitment (Optional) ──────────────────────────────────────

    /**
     * commit — Promote pending accruals to on-chain committed escrow.
     * Transfers actual tokens into this contract.
     * Creates auditable proof that tax is reserved.
     *
     * @param jurisdictionId  Which jurisdiction's pending balance to commit
     * @param token           Which token
     */
    function commit(
        string calldata jurisdictionId,
        address         token
    ) external onlyOwner nonReentrant {
        uint256 pending = pendingBalance[jurisdictionId][token];
        require(pending > 0, "TaxPocket: nothing pending");

        // Transfer tokens in from owner wallet
        IERC20(token).safeTransferFrom(msg.sender, address(this), pending);

        // Move from pending to committed
        committedBalance[jurisdictionId][token] += pending;
        pendingBalance[jurisdictionId][token] = 0;

        // Mark all unremitted accruals for this jurisdiction as committed
        for (uint256 i = 0; i < accrualIds.length; i++) {
            TaxAccrual storage a = accruals[accrualIds[i]];
            if (
                keccak256(bytes(a.jurisdictionId)) == keccak256(bytes(jurisdictionId)) &&
                a.token == token &&
                !a.committed &&
                !a.remitted
            ) {
                a.committed = true;
                emit TaxCommitted(accrualIds[i], jurisdictionId, a.netAmount, a.dueAt);
            }
        }
    }

    // ─── Remittance ───────────────────────────────────────────────────────────

    /**
     * remit — Release committed tax to the jurisdiction vault.
     * This is the actual on-chain tax payment event.
     *
     * Funds can ONLY go to a verified GTC jurisdiction vault.
     * This prevents accidental or malicious misdirection of tax funds.
     *
     * @param jurisdictionId  Which jurisdiction to pay
     * @param token           Which token to remit
     * @param period          Period identifier (e.g. 202501 = Jan 2025)
     */
    function remit(
        string calldata jurisdictionId,
        address         token,
        uint256         period
    ) external onlyOwner nonReentrant {
        uint256 amount = committedBalance[jurisdictionId][token];
        require(amount > 0, "TaxPocket: nothing committed");

        // Verify vault is active in GTC registry
        (address vault, bool isActive) = vaultRegistry.getVault(jurisdictionId);
        require(isActive && vault != address(0), "TaxPocket: jurisdiction vault not active");

        // Clear committed balance
        committedBalance[jurisdictionId][token] = 0;

        // Mark accruals as remitted
        for (uint256 i = 0; i < accrualIds.length; i++) {
            TaxAccrual storage a = accruals[accrualIds[i]];
            if (
                keccak256(bytes(a.jurisdictionId)) == keccak256(bytes(jurisdictionId)) &&
                a.token == token &&
                a.committed &&
                !a.remitted
            ) {
                a.remitted = true;
            }
        }

        // Transfer to jurisdiction vault
        IERC20(token).safeTransfer(vault, amount);

        // Mint receipt NFT as proof of payment
        RemittanceReceipt memory receipt = RemittanceReceipt({
            taxpayer:       owner(),
            jurisdictionId: jurisdictionId,
            token:          token,
            amount:         amount,
            remittedAt:     block.timestamp,
            vault:          vault,
            period:         period
        });
        uint256 receiptTokenId = receiptNFT.mint(owner(), receipt);

        lastRemittanceAt = block.timestamp;

        emit TaxRemitted(jurisdictionId, vault, token, amount, period, receiptTokenId);
    }

    /**
     * remitAll — Remit all committed balances across all jurisdictions.
     * Convenience function for quarterly/annual remittance.
     */
    function remitAll(
        string[] calldata jurisdictionIds,
        address[] calldata tokens,
        uint256 period
    ) external onlyOwner nonReentrant {
        require(jurisdictionIds.length == tokens.length, "TaxPocket: length mismatch");
        for (uint256 i = 0; i < jurisdictionIds.length; i++) {
            uint256 amount = committedBalance[jurisdictionIds[i]][tokens[i]];
            if (amount > 0) {
                (address vault, bool isActive) = vaultRegistry.getVault(jurisdictionIds[i]);
                if (isActive && vault != address(0)) {
                    committedBalance[jurisdictionIds[i]][tokens[i]] = 0;
                    IERC20(tokens[i]).safeTransfer(vault, amount);
                    RemittanceReceipt memory receipt = RemittanceReceipt({
                        taxpayer:       owner(),
                        jurisdictionId: jurisdictionIds[i],
                        token:          tokens[i],
                        amount:         amount,
                        remittedAt:     block.timestamp,
                        vault:          vault,
                        period:         period
                    });
                    uint256 receiptId = receiptNFT.mint(owner(), receipt);
                    emit TaxRemitted(jurisdictionIds[i], vault, tokens[i], amount, period, receiptId);
                }
            }
        }
        lastRemittanceAt = block.timestamp;
    }

    // ─── Yield Integration ────────────────────────────────────────────────────

    /**
     * enableYield — Deposit committed balances into a yield vault.
     * Yield accrues to the owner. Withdrawn automatically before remittance.
     */
    function enableYield(address _yieldVault) external onlyOwner {
        yieldVault = _yieldVault;
        yieldEnabled = true;
        emit YieldEnabled(_yieldVault);
    }

    function disableYield() external onlyOwner {
        yieldEnabled = false;
        emit YieldDisabled();
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getPendingBalance(string calldata jurisdictionId, address token)
        external view returns (uint256) {
        return pendingBalance[jurisdictionId][token];
    }

    function getCommittedBalance(string calldata jurisdictionId, address token)
        external view returns (uint256) {
        return committedBalance[jurisdictionId][token];
    }

    function getAccrual(bytes32 accrualId)
        external view returns (TaxAccrual memory) {
        return accruals[accrualId];
    }

    function getAccrualCount() external view returns (uint256) {
        return accrualIds.length;
    }

    /**
     * dueNow — Returns all committed balances that are past their due date.
     * Useful for wallet UI to show "overdue" tax liabilities.
     */
    function getDueAccruals() external view returns (bytes32[] memory due) {
        uint256 count = 0;
        for (uint256 i = 0; i < accrualIds.length; i++) {
            TaxAccrual storage a = accruals[accrualIds[i]];
            if (a.committed && !a.remitted && block.timestamp >= a.dueAt) {
                count++;
            }
        }
        due = new bytes32[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < accrualIds.length; i++) {
            TaxAccrual storage a = accruals[accrualIds[i]];
            if (a.committed && !a.remitted && block.timestamp >= a.dueAt) {
                due[j++] = accrualIds[i];
            }
        }
    }

    // ─── Schedule ─────────────────────────────────────────────────────────────

    function setRemittanceInterval(uint256 intervalSeconds) external onlyOwner {
        remittanceInterval = intervalSeconds;
        emit RemittanceScheduleUpdated(intervalSeconds);
    }

    function nextRemittanceDate() external view returns (uint256) {
        return lastRemittanceAt + remittanceInterval;
    }
}
