# Dielemma Solana Contract - Security Audit Report
**Date**: 2026-01-15
**Auditor**: Claude (Sonnet 4.5)
**Contract**: Dielemma Proof-of-Life Smart Contract
**Program ID**: 3uT7JEnRZ4pc4bwYvJ9PHsw579YLfNBr3xQvTiXBkGyC

---

## Executive Summary

This audit identified **1 CRITICAL** and **2 MEDIUM** severity vulnerabilities in the Dielemma smart contract after changes to allow any token deposit. The contract is **NOT READY FOR PRODUCTION** until these issues are fixed.

### Severity Breakdown
- 🔴 **CRITICAL**: 1 issues
- 🟡 **MEDIUM**: 2 issues
- 🟢 **LOW**: 0 issues
- ✅ **INFO**: 1 observation

---

## 🔴 CRITICAL SEVERITY ISSUES

### 1. Missing Token Account Ownership Validation in Withdraw and Claim

**Severity**: CRITICAL
**Status**: 🔴 NOT FIXED
**Location**:
- [process_withdraw](dielemma-program/src/lib.rs#L680-L683) - lines 680-683
- [process_claim](dielemma-program/src/lib.rs#L760-L763) - lines 760-763

#### Description
The `process_withdraw` and `process_claim` functions do not verify that the destination token accounts (`depositor_token_account` and `receiver_token_account`) are owned by the signer. This allows an attacker to redirect token transfers to arbitrary token accounts.

#### Vulnerable Code

**In Withdraw (lines 680-684)**:
```rust
let depositor = next_account_info(account_info_iter)?;
let deposit_account = next_account_info(account_info_iter)?;
let depositor_token_account = next_account_info(account_info_iter)?;  // ❌ No validation
let deposit_token_account = next_account_info(account_info_iter)?;
let token_program = next_account_info(account_info_iter)?;
```

**In Claim (lines 760-764)**:
```rust
let receiver = next_account_info(account_info_iter)?;
let deposit_account = next_account_info(account_info_iter)?;
let receiver_token_account = next_account_info(account_info_iter)?;  // ❌ No validation
let deposit_token_account = next_account_info(account_info_iter)?;
let token_program = next_account_info(account_info_iter)?;
```

#### Comparison with Deposit (CORRECT)

The deposit function correctly validates token account ownership (lines 392-399):
```rust
// Verify token account ownership
let token_account_data = depositor_token_account.data.borrow();
let token_account_state = TokenAccount::unpack(&token_account_data)
    .map_err(|_| ProgramError::InvalidAccountData)?;
if token_account_state.owner != *depositor.key {
    msg!("Token account must be owned by depositor");
    return Err(ProgramError::InvalidAccountData);
}
```

#### Attack Scenarios

**Scenario 1: Unintended Token Transfer**
1. Attacker deposits tokens into the contract
2. Attacker calls `withdraw` but provides a victim's token account as `depositor_token_account`
3. Contract transfers tokens to victim's account (potential tax implications, manipulation, etc.)

**Scenario 2: Fund Loss in Claim**
1. Receiver attempts to claim expired deposit
2. Attacker front-runs or provides incorrect token account
3. Tokens are transferred to wrong account, causing permanent loss

#### Impact
- Users can lose funds permanently if tokens are sent to incorrect accounts
- Potential for tax fraud or manipulation
- Violation of user intent and security expectations

#### Recommended Fix

Add token account ownership validation in both functions:

**For Withdraw (after line 683)**:
```rust
let depositor_token_account = next_account_info(account_info_iter)?;

// ⭐ ADD THIS: Verify token account ownership
let token_account_data = depositor_token_account.data.borrow();
let token_account_state = TokenAccount::unpack(&token_account_data)
    .map_err(|_| ProgramError::InvalidAccountData)?;
if token_account_state.owner != *depositor.key {
    msg!("Token account must be owned by depositor");
    return Err(ProgramError::InvalidAccountData);
}
drop(token_account_data);
```

**For Claim (after line 762)**:
```rust
let receiver_token_account = next_account_info(account_info_iter)?;

// ⭐ ADD THIS: Verify token account ownership
let token_account_data = receiver_token_account.data.borrow();
let token_account_state = TokenAccount::unpack(&token_account_data)
    .map_err(|_| ProgramError::InvalidAccountData)?;
if token_account_state.owner != *receiver.key {
    msg!("Token account must be owned by receiver");
    return Err(ProgramError::InvalidAccountData);
}
drop(token_account_data);
```

---

## 🟡 MEDIUM SEVERITY ISSUES

### 2. Missing Token Account Mint Validation in Withdraw and Claim

**Severity**: MEDIUM
**Status**: 🟡 NOT FIXED
**Location**:
- [process_withdraw](dielemma-program/src/lib.rs#L722-L730) - lines 722-730
- [process_claim](dielemma-program/src/lib.rs#L834-L842) - lines 834-842

#### Description
The withdraw and claim functions do not verify that the destination token account matches the mint of the deposited tokens. While not a critical fund loss issue (the transfer would fail with wrong mint), it creates poor user experience and could be used for griefing.

#### Attack Scenario
1. User deposits USDC
2. User attempts to withdraw but provides a USDT token account
3. Transfer fails with cryptic error
4. User pays transaction fee for failed transaction
5. Attacker could grief users by tricking them into using wrong token accounts

#### Recommended Fix

**For Withdraw (before transfer at line 722)**:
```rust
// ⭐ ADD THIS: Verify destination token account matches deposit mint
let dest_token_data = depositor_token_account.data.borrow();
let dest_token_state = TokenAccount::unpack(&dest_token_data)
    .map_err(|_| ProgramError::InvalidAccountData)?;
if dest_token_state.mint != deposit_state.token_mint {
    msg!("Destination token account mint does not match deposit mint");
    msg!("Expected: {}", deposit_state.token_mint);
    msg!("Got: {}", dest_token_state.mint);
    return Err(ProgramError::InvalidAccountData);
}
drop(dest_token_data);
```

**For Claim (before transfer at line 834)**:
```rust
// ⭐ ADD THIS: Verify destination token account matches deposit mint
let dest_token_data = receiver_token_account.data.borrow();
let dest_token_state = TokenAccount::unpack(&dest_token_data)
    .map_err(|_| ProgramError::InvalidAccountData)?;
if dest_token_state.mint != deposit_state.token_mint {
    msg!("Destination token account mint does not match deposit mint");
    msg!("Expected: {}", deposit_state.token_mint);
    msg!("Got: {}", dest_token_state.mint);
    return Err(ProgramError::InvalidAccountData);
}
drop(dest_token_data);
```

---

### 3. Missing Signer Check in Close Account

**Severity**: MEDIUM
**Status**: 🟡 NOT FIXED
**Location**: [process_close_account](dielemma-program/src/lib.rs#L872-L894) - lines 872-894

#### Description
The `process_close_account` function verifies the authority is either the depositor or receiver (line 891), but does NOT verify that the authority is a signer. This allows anyone to close someone else's deposit account if they know the account structure.

#### Vulnerable Code (lines 890-894)**
```rust
// Verify authority (must be depositor or receiver)
if deposit_state.depositor != *authority.key && deposit_state.receiver != *authority.key {
    msg!("Only depositor or receiver can close the account");
    return Err(ProgramError::MissingRequiredSignature);
}
// ❌ Missing: if !authority.is_signer { ... }
```

#### Attack Scenario
1. Attacker finds a deposit account that has been withdrawn/claimed
2. Attacker calls `close_account` providing themselves as `refund_recipient`
3. The lamports that should go to depositor/receiver are stolen

#### Impact
- Loss of rent exemption lamports (usually small amount, but still a vulnerability)
- Violation of security expectations

#### Recommended Fix

**Add signer check after line 894**:
```rust
// Verify authority (must be depositor or receiver)
if deposit_state.depositor != *authority.key && deposit_state.receiver != *authority.key {
    msg!("Only depositor or receiver can close the account");
    return Err(ProgramError::MissingRequiredSignature);
}

// ⭐ ADD THIS: Verify authority is signer
if !authority.is_signer {
    msg!("Authority must sign the transaction");
    return Err(ProgramError::MissingRequiredSignature);
}
```

---

## ✅ INFO OBSERVATIONS

### 1. Proof-of-Life Token Account Not Validated Against Deposit

**Severity**: INFO
**Status**: ℹ️ OBSERVATION
**Location**: [process_proof_of_life](dielemma-program/src/lib.rs#L574-L575) - lines 574-575

#### Observation
The proof-of-life function accepts `depositor_token_account` but does not verify:
1. That the account is owned by the depositor
2. That the account contains the DLM mint

However, the token program will reject the burn instruction if the mint is wrong, and the user would only be griefing themselves if they use the wrong account.

#### Recommendation
Consider adding validation for better user experience:
```rust
let depositor_token_account = next_account_info(account_info_iter)?;

// Optional: Verify ownership
let token_data = depositor_token_account.data.borrow();
let token_state = TokenAccount::unpack(&token_data)
    .map_err(|_| ProgramError::InvalidAccountData)?;
if token_state.owner != *depositor.key {
    msg!("Token account must be owned by depositor");
    return Err(ProgramError::InvalidAccountData);
}
drop(token_data);
```

---

## ✅ POSITIVE SECURITY FINDINGS

The following security measures are correctly implemented:

1. ✅ **PDA Validation**: All functions correctly validate PDAs
2. ✅ **Double-Spend Protection**: `is_closed` flag prevents double withdrawal/claim
3. ✅ **Race Condition Prevention**: State is marked closed before token transfers
4. ✅ **Timestamp Validation**: Claim function validates timestamps (lines 800-811)
5. ✅ **Signer Checks in Deposit**: Depositor signature is verified (line 349)
6. ✅ **Program ID Validation**: System and token programs are validated
7. ✅ **Amount Validation**: Deposit amounts are validated (lines 373-382)
8. ✅ **Timeout Validation**: Timeout ranges are enforced (lines 384-390)
9. ✅ **DLM Mint Verification**: Proof-of-life correctly validates DLM mint (lines 615-624)
10. ✅ **Balance Check**: Proof-of-life checks sufficient DLM balance (lines 629-639)

---

## RECOMMENDATIONS SUMMARY

### Must Fix Before Production
1. 🔴 **CRITICAL**: Add token account ownership validation in Withdraw
2. 🔴 **CRITICAL**: Add token account ownership validation in Claim
3. 🟡 **MEDIUM**: Add signer check in Close Account

### Should Fix
4. 🟡 **MEDIUM**: Add mint validation in Withdraw
5. 🟡 **MEDIUM**: Add mint validation in Claim

### Nice to Have
6. ℹ️ **INFO**: Add token account validation in Proof-of-Life

---

## TESTING RECOMMENDATIONS

After implementing fixes, test the following scenarios:

1. **Withdraw to wrong account**: Attempt to withdraw to token account not owned by depositor
2. **Claim to wrong account**: Attempt to claim to token account not owned by receiver
3. **Withdraw with wrong mint**: Attempt to withdraw USDC to USDT account
4. **Claim with wrong mint**: Attempt to claim USDC to USDT account
5. **Close without signature**: Attempt to close account without signing
6. **Close as wrong user**: Attempt to close someone else's deposit
7. **Deposit with any token**: Verify USDC, USDT, SOL, and custom tokens work
8. **Proof-of-life with DLM**: Verify DLM burning works correctly

---

## CONCLUSION

The contract has **1 CRITICAL vulnerability** that must be fixed before production deployment. The missing token account ownership validation in Withdraw and Claim functions could lead to permanent fund loss.

**Current Status**: 🔴 **NOT READY FOR PRODUCTION**

**After Critical Fixes**: 🟡 **READY WITH RECOMMENDATIONS**

**After All Fixes**: 🟢 **PRODUCTION READY**

---

## APPENDIX: Code Locations Reference

| Function | Issue | Line Range | Severity |
|----------|-------|-----------|----------|
| process_withdraw | Missing ownership check | 680-683 | CRITICAL |
| process_claim | Missing ownership check | 760-763 | CRITICAL |
| process_withdraw | Missing mint validation | 722-730 | MEDIUM |
| process_claim | Missing mint validation | 834-842 | MEDIUM |
| process_close_account | Missing signer check | 890-894 | MEDIUM |
| process_proof_of_life | Missing ownership check | 574-575 | INFO |
