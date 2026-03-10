# Changelog

All notable changes to GTC Tax Pocket are documented here.

Format: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added
- `TaxPocket.sol` — self-custody escrow contract with commit/remit flow
- `TaxPocketManager.ts` — software-layer pocket manager (no on-chain required)
- `TaxPocketUI.jsx` — full React wallet dashboard component
- `ARCHITECTURE.md` — system design rationale
- `WHITEPAPER.md` — full technical specification
- Initial repo structure

### Planned for v0.2
- `RemittanceReceipt.sol` — ERC-721 soulbound receipt NFT
- `TaxPocketFactory.sol` — CREATE2 deterministic factory
- `AccrualEngine.ts` — standalone accrual calculation module
- `RemittanceScheduler.ts` — schedule management with due-date logic
- `YieldIntegration.ts` — AAVE/USYC yield adapter
- Complete Hardhat test suite
- SDK npm package scaffold

---

## Version History

*First public release pending. Tracking begins at v0.1.*
