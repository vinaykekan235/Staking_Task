# 🏦 ERC20 Staking Contract

A secure and efficient staking smart contract that allows users to stake ERC20 tokens (USDT-compatible) and earn rewards based on a fixed 10% APY with automatic rollover functionality.

## 📋 Features

- **Fixed APY**: Earn 10% annual percentage yield on staked tokens
- **30-Day Lock Period**: Tokens are locked for a fixed period
- **Rollover Mechanism**: Compound rewards tax-free by rolling over stakes
- **Reward Claims**: Claim rewards independently without unstaking
- **Tax System**: 0.5% tax on withdrawals (unstake/claim) sent to treasury
- **Multiple Stakes**: Users can maintain multiple active stakes
- **Security**: Built with OpenZeppelin contracts, includes reentrancy protection and pausability

## 🏗️ Architecture

### Contract Parameters

| Parameter | Value |
|-----------|-------|
| Lock Period | 30 days |
| APY | 10% |
| Tax Rate | 0.5% |
| Minimum Stake | 100 tokens |
| Token Standard | ERC20 (6 decimals for USDT) |

### Reward Calculation

```
Daily Rate = 10% / 365 = 0.0274% per day
Rewards = Principal × (APY / 100) × (Days Staked / 365)

Example (30-day stake of 1000 USDT):
Rewards = 1000 × 0.1 × (30/365) = 8.22 USDT
```

### Tax Mechanism

- **Applied**: On unstake and reward claims
- **NOT Applied**: On rollover (enables tax-free compounding)
- **Rate**: 0.5% of total amount
- **Recipient**: Treasury address

## 🚀 Quick Start

### Prerequisites

- Node.js v20 + and npm
- Hardhat

### Installation

```bash
# Clone the repository
git clone https://github.com/vinaykekan235/Staking_Task.git
cd Staking_Task

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

Create a `.env` file:

```env
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
GOERLI_RPC_URL=https://goerli.infura.io/v3/YOUR_INFURA_KEY
ETHERSCAN_API_KEY=your_etherscan_api_key
STAKING_TOKEN_ADDRESS=0x... # USDT address
TREASURY_ADDRESS=0x... # Treasury wallet
REPORT_GAS=true
```

## 🧪 Testing

```bash
# Run all tests
npx hardhat test

```
## 📦 Deployment
```bash
# Deploy to Sepolia
npx hardhat run script/deploy.js --network sepolia

```

## 📖 Usage Guide

### For Users

#### 1. Stake Tokens

```javascript
// Approve tokens first
await stakingToken.approve(stakingContract.address, amount);

// Stake
await stakingContract.stake(amount);
```

#### 2. Check Rewards

```javascript
const rewards = await stakingContract.calculateRewards(userAddress, stakeId);
```

#### 3. Unstake (After 30 days)

```javascript
await stakingContract.unstake(stakeId);
```

#### 4. Rollover (Compound Rewards)

```javascript
// After 30 days, rollover to compound rewards
await stakingContract.rollover(stakeId);
```

#### 5. Claim Rewards Only

```javascript
// Claim rewards while keeping principal staked
await stakingContract.claimRewards(stakeId);
```

### For Admins

#### Update Treasury

```javascript
await stakingContract.setTreasury(newTreasuryAddress);
```

#### Pause/Unpause Contract

```javascript
await stakingContract.pause();
await stakingContract.unpause();
```

#### Deposit Rewards

```javascript
await stakingContract.depositRewards(amount);
```

## 🔒 Security Features

1. **ReentrancyGuard**: Prevents reentrancy attacks
2. **Pausable**: Emergency pause functionality
3. **Ownable**: Access control for admin functions
4. **SafeERC20**: Safe token transfer operations
5. **Overflow Protection**: Solidity 0.8+ built-in checks

### Security Considerations

- Always keep sufficient reward tokens in the contract
- Treasury address should be a secure multisig wallet
- Monitor contract for unusual activity
- Regular security audits recommended for production

## 📊 Contract Functions

### User Functions

| Function | Description |
|----------|-------------|
| `stake(uint256)` | Stake tokens for 30 days |
| `unstake(uint256)` | Unstake after lock period |
| `rollover(uint256)` | Compound rewards and restart |
| `claimRewards(uint256)` | Claim rewards only |
| `calculateRewards(address, uint256)` | Calculate pending rewards |
| `getStakeDetails(address, uint256)` | Get stake information |
| `getUserStakeIds(address)` | Get all user's stake IDs |

### Admin Functions

| Function | Description |
|----------|-------------|
| `setTreasury(address)` | Update treasury address |
| `pause()` | Pause contract |
| `unpause()` | Unpause contract |
| `depositRewards(uint256)` | Add reward tokens |
| `emergencyWithdraw(address, uint256)` | Emergency token recovery |

## 📈 Gas Optimization

The contract implements several gas optimization techniques:

- Efficient storage packing
- Minimal storage writes
- Optimized loops



## 🎯 Example Scenarios

### Scenario 1: Simple Stake and Unstake

```
Day 0: User stakes 1000 USDT
Day 30: User unstakes
Result: 1000 + 8.22 (rewards) - 5.04 (0.5% tax) = 1003.18 USDT
```

### Scenario 2: Stake with Rollover

```
Day 0: User stakes 1000 USDT
Day 30: User rolls over (new principal: 1008.22 USDT, NO TAX)
Day 60: User unstakes
Result: ~1016.61 USDT (compound effect)
```

### Scenario 3: Claim Rewards

```
Day 0: User stakes 1000 USDT
Day 15: User claims rewards (~4.11 USDT - 0.5% tax)
Day 30: Principal still earning, user can unstake or rollover
```


### Common Issues

**"Amount below minimum stake"**
- Ensure you're staking at least 100 tokens

**"Lock period not ended"**
- Wait for the full 30-day period

"Insufficient balance"
- Check your token balance and approve the contract

"Pausable: paused"
- Contract is paused by admin for maintenance

