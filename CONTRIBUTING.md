# Contributing to GTC Tax Pocket

Welcome. This project is open infrastructure. All contributions are valuable.

---

## Priority Contributions Right Now

### 1. Wallet Developer Feedback
**This is the highest-value contribution possible right now.**

If you build or maintain a wallet (MetaMask, Rainbow, Trust, Argent, Coinbase Wallet, or any WalletConnect-compatible wallet), we want to hear from you:

- Is the SDK ergonomics right? Would you actually integrate this?
- What would block you from integrating?
- Does the `TaxPocketDashboard` UI component work in your design system?

Open an issue tagged `wallet-feedback` with your wallet name and thoughts.

### 2. Contract Review
`TaxPocket.sol` is unaudited. The logic is straightforward but any eye is valuable.

Key areas to scrutinize:
- The `commit()` / `remit()` flow — are there reentrancy risks?
- The `reconcile()` function — can net amounts be manipulated?
- The vault verification in `remit()` — is the registry call safe?

Open issues tagged `security` for any findings.

### 3. Test Coverage
The Hardhat test suite in `contracts/test/` and `sdk/test/` needs expansion.

Critical test cases still needed:
- Full refund after partial remittance
- Threshold-based remittance trigger
- Multi-jurisdiction reconciliation
- Yield withdrawal before remittance
- Factory deployment on multiple chains

### 4. Mobile (React Native)
The `examples/react-native/` directory is a stub. We need a working React Native implementation of the TaxPocketDashboard component.

### 5. Translations
`docs/` should be available in at least: Portuguese, German, Spanish, French, Japanese. Open a PR to add a `docs/translations/` directory.

---

## How to Contribute

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/gtc-tax-pocket
cd gtc-tax-pocket
npm install

# Run tests
npx hardhat test
npm run test:sdk

# Open a branch
git checkout -b feature/your-contribution

# Make changes, then open a PR
```

### PR Guidelines

- One concern per PR
- Tests required for any contract or SDK changes
- Update relevant docs if behavior changes
- Describe *why* not just *what* in the PR description

### Issue Guidelines

Use the issue templates. Tag issues appropriately:

- `contract` — Solidity / on-chain
- `sdk` — TypeScript SDK
- `ui` — React components
- `security` — Security findings (consider responsible disclosure for critical issues)
- `wallet-feedback` — Integration feedback from wallet developers
- `docs` — Documentation improvements
- `good-first-issue` — Suitable for first-time contributors

---

## Code Standards

**Solidity**
- Compiler: `^0.8.23`
- Style: OpenZeppelin conventions
- NatSpec: 100% required for all public/external functions
- Tests: Hardhat + Chai, 100% line coverage for all contracts

**TypeScript**
- Strict mode, no `any`
- Fully typed public interfaces
- Tests: Vitest
- Document all public methods with JSDoc

**React**
- Functional components only
- No external dependencies beyond `react` and `ethers`
- Must support both light and dark themes
- Accessible: ARIA labels, keyboard navigation

---

## License

By contributing, you agree your work is licensed under GPL-3.0.

This means: if you build something on top of this, you must keep it open. That's the deal.

---

## Questions?

Open an issue. We'll respond.
