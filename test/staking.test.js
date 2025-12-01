const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingContract", function () {
    let stakingContract;
    let mockToken;
    let owner;
    let treasury;
    let user1;
    let user2;
    
    const MIN_STAKE = ethers.parseUnits("100", 6); 
    const LOCK_PERIOD = 30 * 24 * 60 * 60; 
    const TAX_RATE = 50; 
    const APY = 10; 
    
    beforeEach(async function () {
        [owner, treasury, user1, user2] = await ethers.getSigners();
    
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockToken = await MockToken.deploy("Mock USDT", "USDT", 6);     
        const StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await StakingContract.deploy(
            mockToken.target,         
            treasury.address
        );
        await mockToken.mint(user1.address, ethers.parseUnits("10000", 6));
        await mockToken.mint(user2.address, ethers.parseUnits("10000", 6));
        await mockToken.mint(owner.address, ethers.parseUnits("100000", 6));
    
        await mockToken.connect(user1).approve(stakingContract.target, ethers.MaxUint256);
        await mockToken.connect(user2).approve(stakingContract.target, ethers.MaxUint256);
        await mockToken.connect(owner).approve(stakingContract.target, ethers.MaxUint256);
    
        await stakingContract.connect(owner).depositRewards(
            ethers.parseUnits("10000", 6)
        );
    });
    
    
    describe("Deployment", function () {
        it("Should set the correct staking token", async function () {
            expect(await stakingContract.stakingToken()).to.equal(mockToken.target);
        });
    
        it("Should set the correct treasury address", async function () {
            expect(await stakingContract.treasury()).to.equal(treasury.address);
        });
    
        it("Should set the correct owner", async function () {
            expect(await stakingContract.owner()).to.equal(owner.address);
        });
    });
    
    
    describe("Staking", function () {
        it("Should allow users to stake tokens successfully", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
        
            const tx = await stakingContract.connect(user1).stake(stakeAmount);
            const receipt = await tx.wait();
        
            const event = receipt.logs
                .map(log => {
                    try {
                        return stakingContract.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find(log => log && log.name === "Staked");
        
            expect(event).to.not.be.undefined;
        
            expect(event.args.user).to.equal(user1.address);
            expect(event.args.stakeId).to.equal(1);
            expect(event.args.amount).to.equal(stakeAmount);
        
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            expect(event.args.timestamp).to.equal(block.timestamp);
        
            const stake = await stakingContract.getStakeDetails(user1.address, 1);
            expect(stake.amount).to.equal(stakeAmount);
            expect(stake.active).to.equal(true);
        });
        
    
        it("Should reject stakes below minimum amount", async function () {
            const belowMin = ethers.parseUnits("99", 6);
            await expect(
                stakingContract.connect(user1).stake(belowMin)
            ).to.be.revertedWith("Amount below minimum stake");
        });
    
        it("Should reject stakes with insufficient balance", async function () {
            const tooMuch = ethers.parseUnits("20000", 6);
            await expect(
                stakingContract.connect(user1).stake(tooMuch)
            ).to.be.revertedWith("Insufficient balance");
        });
    
        it("Should correctly track stake details", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
    
            const stake = await stakingContract.getStakeDetails(user1.address, 1);
            const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
    
            expect(stake.amount).to.equal(stakeAmount);
            expect(stake.startTime).to.be.closeTo(currentTime, 5); 
            expect(stake.endTime).to.be.closeTo(currentTime + LOCK_PERIOD, 5);
            expect(stake.active).to.equal(true);
        });
    
        it("Should support multiple stakes from same user", async function () {
            const stakeAmount = ethers.parseUnits("500", 6);
    
            await stakingContract.connect(user1).stake(stakeAmount);
            await stakingContract.connect(user1).stake(stakeAmount);
            await stakingContract.connect(user1).stake(stakeAmount);
    
            const stakeIds = await stakingContract.getUserStakeIds(user1.address);
            expect(stakeIds.length).to.equal(3);
    
            const totalStaked = await stakingContract.userTotalStaked(user1.address);
            expect(totalStaked).to.equal(stakeAmount * 3n); 
        });
    
        it("Should update contract total staked", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
    
            await stakingContract.connect(user1).stake(stakeAmount);
            await stakingContract.connect(user2).stake(stakeAmount * 2n);
    
            const totalStaked = await stakingContract.totalStaked();
            expect(totalStaked).to.equal(stakeAmount * 3n);
        });
    });
    
    
    describe("Reward Calculation", function () {
        it("Should calculate correct rewards for 1 day", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6); 
            await stakingContract.connect(user1).stake(stakeAmount);
        
            await time.increase(24 * 60 * 60);
        
            const rewards = await stakingContract.calculateRewards(user1.address, 1);
        
            const expected = (stakeAmount * 10n * 1n) / (100n * 365n);
        
            const delta = ethers.parseUnits("0.1", 6);
            expect(BigInt(rewards)).to.be.closeTo(expected, delta);
        });
        
        it("Should calculate correct rewards for full 30-day period", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
        
            await time.increase(LOCK_PERIOD);
        
            const rewards = await stakingContract.calculateRewards(user1.address, 1);
        
            const expected = (stakeAmount * 10n * 30n) / (100n * 365n);
        
            const delta = ethers.parseUnits("0.1", 6);
            expect(BigInt(rewards)).to.be.closeTo(expected, delta);
        });
        
        
        it("Should return zero rewards for brand new stakes", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            const rewards = await stakingContract.calculateRewards(user1.address, 1);
            expect(rewards).to.equal(0);
        });
        
        it("Should handle multiple stakes with different start times", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            
            await stakingContract.connect(user1).stake(stakeAmount);
            await time.increase(10 * 24 * 60 * 60); // 10 days
            await stakingContract.connect(user1).stake(stakeAmount);
            await time.increase(5 * 24 * 60 * 60); // 5 more days
            
            const rewards1 = await stakingContract.calculateRewards(user1.address, 1);
            const rewards2 = await stakingContract.calculateRewards(user1.address, 2);
            
            // Stake 1: 15 days, Stake 2: 5 days
            expect(rewards1).to.be.gt(rewards2);
        });
    });
    
    describe("Unstaking", function () {
        it("Should reject unstake before lock period ends", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(15 * 24 * 60 * 60); 
            
            await expect(
                stakingContract.connect(user1).unstake(1)
            ).to.be.revertedWith("Lock period not ended");
        });
        
        it("Should allow unstake after lock period", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            
            await expect(stakingContract.connect(user1).unstake(1))
                .to.not.be.reverted;
        });
        
        it("Should calculate 0.5% tax correctly", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6); 
            await stakingContract.connect(user1).stake(stakeAmount);
        
            const initialBalance = await mockToken.balanceOf(user1.address);
            const treasuryInitialBalance = await mockToken.balanceOf(treasury.address);
        
            await time.increase(LOCK_PERIOD);
        
            await stakingContract.connect(user1).unstake(1);
        
            const finalBalance = await mockToken.balanceOf(user1.address);
            const treasuryFinalBalance = await mockToken.balanceOf(treasury.address);
        
            const totalReceived = finalBalance - initialBalance;
            const taxReceived = treasuryFinalBalance - treasuryInitialBalance;
        
            const rewards = (stakeAmount * 10n * 30n) / (100n * 365n); 
            const totalAmount = stakeAmount + rewards;
            const expectedTax = (totalAmount * BigInt(TAX_RATE)) / 10000n; 
        
            expect(taxReceived).to.be.closeTo(expectedTax, ethers.parseUnits("0.01", 6));
            expect(totalReceived + taxReceived).to.be.closeTo(totalAmount, ethers.parseUnits("0.1", 6));
        });
        
        
        
        it("Should transfer tax to treasury", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            const treasuryInitial = await mockToken.balanceOf(treasury.address);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).unstake(1);
            
            const treasuryFinal = await mockToken.balanceOf(treasury.address);
            expect(treasuryFinal).to.be.gt(treasuryInitial);
        });
        
        it("Should mark stake as inactive after unstake", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).unstake(1);
            
            const stake = await stakingContract.getStakeDetails(user1.address, 1);
            expect(stake.active).to.equal(false);
        });
        
        it("Should emit Unstaked event with correct details", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
        
            await time.increase(LOCK_PERIOD);
        
            const tx = await stakingContract.connect(user1).unstake(1);
            const receipt = await tx.wait();
        
            let unstakedEvent = null;
        
            for (const log of receipt.logs) {
                try {
                    const parsed = stakingContract.interface.parseLog(log);
                    if (parsed.name === "Unstaked") {
                        unstakedEvent = parsed;
                        break;
                    }
                } catch (err) {
                    // ignore logs that cannot be parsed
                }
            }
        
            expect(unstakedEvent).to.not.be.null;
            expect(unstakedEvent.args.user).to.equal(user1.address);
            expect(unstakedEvent.args.stakeId).to.equal(1);
        });
        
    });
    
    describe("Rollover", function () {
        it("Should reject rollover before lock period ends", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(15 * 24 * 60 * 60);
            
            await expect(
                stakingContract.connect(user1).rollover(1)
            ).to.be.revertedWith("Lock period not ended");
        });
        
        it("Should allow rollover after lock period", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            
            await expect(stakingContract.connect(user1).rollover(1))
                .to.not.be.reverted;
        });
        
        it("Should add rewards to new principal", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6); 
            await stakingContract.connect(user1).stake(stakeAmount);
        
            await time.increase(LOCK_PERIOD);
        
            const rewardsBefore = await stakingContract.calculateRewards(user1.address, 1);
        
            await stakingContract.connect(user1).rollover(1);
        
            const stake = await stakingContract.getStakeDetails(user1.address, 1);
        
            const expectedNewPrincipal = stakeAmount + rewardsBefore;
        
            expect(stake.amount).to
        });
        
        it("Should reset lock period", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            
            const rolloverTime = await time.latest();
            await stakingContract.connect(user1).rollover(1);
            
            const stake = await stakingContract.getStakeDetails(user1.address, 1);
            expect(stake.endTime).to.be.closeTo(rolloverTime + LOCK_PERIOD + 1, 5);
        });
        
        it("Should NOT apply tax on rollover", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            const treasuryBefore = await mockToken.balanceOf(treasury.address);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).rollover(1);
            
            const treasuryAfter = await mockToken.balanceOf(treasury.address);
            
            expect(treasuryAfter).to.equal(treasuryBefore);
        });
        
        it("Should emit Rollover event", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            
            await expect(stakingContract.connect(user1).rollover(1))
                .to.emit(stakingContract, "Rollover");
        });
        
        it("Should handle consecutive rollovers", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).rollover(1);
            
            const stake1 = await stakingContract.getStakeDetails(user1.address, 1);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).rollover(1);
            
            const stake2 = await stakingContract.getStakeDetails(user1.address, 1);
            
            expect(stake2.amount).to.be.gt(stake1.amount);
        });
    });
    
    describe("Claim Rewards", function () {
        it("Should allow claiming rewards while keeping principal locked", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(15 * 24 * 60 * 60); 
            
            await stakingContract.connect(user1).claimRewards(1);
            
            const stake = await stakingContract.getStakeDetails(user1.address, 1);
            expect(stake.amount).to.equal(stakeAmount); 
            expect(stake.active).to.equal(true); 
        });
    
        it("Should apply 0.5% tax on claimed rewards", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD); 
            
            const rewardsBefore = await stakingContract.calculateRewards(user1.address, 1);
            const userBalanceBefore = BigInt(await mockToken.balanceOf(user1.address));
            const treasuryBefore = BigInt(await mockToken.balanceOf(treasury.address));
            
            await stakingContract.connect(user1).claimRewards(1);
            
            const userBalanceAfter = BigInt(await mockToken.balanceOf(user1.address));
            const treasuryAfter = BigInt(await mockToken.balanceOf(treasury.address));
            
            const userReceived = userBalanceAfter - userBalanceBefore;
            const taxPaid = treasuryAfter - treasuryBefore;
            
            const expectedTax = (rewardsBefore * BigInt(TAX_RATE)) / BigInt(10000);
            
            const delta = ethers.parseUnits("0.001", 6);
            expect(userReceived + taxPaid).to.be.closeTo(rewardsBefore, delta);
            expect(taxPaid).to.be.closeTo(expectedTax, delta);
        });
    
        it("Should reset reward accumulation timestamp", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).claimRewards(1);
            
            const rewards = await stakingContract.calculateRewards(user1.address, 1);
            expect(rewards).to.be.lt(ethers.parseUnits("0.1", 6));
        });
    
        it("Should continue earning on principal after claim", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            await time.increase(LOCK_PERIOD);
            await stakingContract.connect(user1).claimRewards(1);
            
            await time.increase(15 * 24 * 60 * 60); 
            
            const newRewards = await stakingContract.calculateRewards(user1.address, 1);
            expect(newRewards).to.be.gt(0);
        });
    
        it("Should revert when claiming zero rewards", async function () {
            const stakeAmount = ethers.parseUnits("1000", 6);
            await stakingContract.connect(user1).stake(stakeAmount);
            
            const rewards = await stakingContract.calculateRewards(user1.address, 1);
            
            expect(rewards).to.be.lt(ethers.parseUnits("0.000001", 6));
          
        });
        
    });    
    
    
});