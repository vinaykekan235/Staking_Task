// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract StakingContract is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    
    IERC20 public immutable stakingToken;
    address public treasury;

     // constants
    uint256 public constant LOCK_PERIOD = 30 days;
    uint256 public constant APY = 10; 
    uint256 public constant TAX_RATE = 50; 
    uint256 public constant MIN_STAKE = 100 * 10**6; 
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    
    //state variables
    uint256 public totalStaked;
    uint256 public totalRewardsPaid;
    uint256 public stakeCounter;
    
    //structs
    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 endTime;
        uint256 lastRewardClaim;
        bool active;
    }
    
 // mappings   
    mapping(address => mapping(uint256 => Stake)) public stakes;
    mapping(address => uint256[]) public userStakeIds;
    mapping(address => uint256) public userTotalStaked;
    
//Events    
    event Staked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 indexed stakeId, uint256 principal, uint256 rewards, uint256 tax);
    event Rollover(address indexed user, uint256 indexed stakeId, uint256 newPrincipal, uint256 newEndTime);
    event RewardsClaimed(address indexed user, uint256 indexed stakeId, uint256 rewards, uint256 tax);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event RewardsDeposited(uint256 amount);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    
    
    constructor(address _stakingToken, address _treasury) Ownable(msg.sender) {
        require(_stakingToken != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");
        
        stakingToken = IERC20(_stakingToken);
        treasury = _treasury;
    }
    
    
    
    function stake(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount >= MIN_STAKE, "Amount below minimum stake");
        require(stakingToken.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        stakeCounter++;
        uint256 stakeId = stakeCounter;
        
        stakes[msg.sender][stakeId] = Stake({
            amount: _amount,
            startTime: block.timestamp,
            endTime: block.timestamp + LOCK_PERIOD,
            lastRewardClaim: block.timestamp,
            active: true
        });
        
        userStakeIds[msg.sender].push(stakeId);
        userTotalStaked[msg.sender] += _amount;
        totalStaked += _amount;
        
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        
        emit Staked(msg.sender, stakeId, _amount, block.timestamp);
    }
    

    function unstake(uint256 _stakeId) external nonReentrant {
        Stake storage userStake = stakes[msg.sender][_stakeId];
        require(userStake.active, "Stake not active");
        require(block.timestamp >= userStake.endTime, "Lock period not ended");
        
        uint256 principal = userStake.amount;
        uint256 rewards = calculateRewards(msg.sender, _stakeId);
        uint256 totalAmount = principal + rewards;
        
        uint256 tax = (totalAmount * TAX_RATE) / BASIS_POINTS;
        uint256 amountAfterTax = totalAmount - tax;
        
        userStake.active = false;
        userTotalStaked[msg.sender] -= principal;
        totalStaked -= principal;
        totalRewardsPaid += rewards;
        
        if (tax > 0) {
            stakingToken.safeTransfer(treasury, tax);
        }
        stakingToken.safeTransfer(msg.sender, amountAfterTax);
        
        emit Unstaked(msg.sender, _stakeId, principal, rewards, tax);
    }
    
 
    function rollover(uint256 _stakeId) external nonReentrant whenNotPaused {
        Stake storage userStake = stakes[msg.sender][_stakeId];
        require(userStake.active, "Stake not active");
        require(block.timestamp >= userStake.endTime, "Lock period not ended");
        
        uint256 rewards = calculateRewards(msg.sender, _stakeId);
        uint256 newPrincipal = userStake.amount + rewards;
        
        userStake.amount = newPrincipal;
        userStake.startTime = block.timestamp;
        userStake.endTime = block.timestamp + LOCK_PERIOD;
        userStake.lastRewardClaim = block.timestamp;
        
        userTotalStaked[msg.sender] += rewards;
        totalStaked += rewards;
        
        emit Rollover(msg.sender, _stakeId, newPrincipal, userStake.endTime);
    }
    
  
    function claimRewards(uint256 _stakeId) external nonReentrant {
        Stake storage userStake = stakes[msg.sender][_stakeId];
        require(userStake.active, "Stake not active");
        
        uint256 rewards = calculateRewards(msg.sender, _stakeId);
        require(rewards > 0, "No rewards to claim");
        
        // Calculate tax
        uint256 tax = (rewards * TAX_RATE) / BASIS_POINTS;
        uint256 rewardsAfterTax = rewards - tax;
        
        // Update last claim time
        userStake.lastRewardClaim = block.timestamp;
        totalRewardsPaid += rewards;
        
        // Transfer tokens
        if (tax > 0) {
            stakingToken.safeTransfer(treasury, tax);
        }
        stakingToken.safeTransfer(msg.sender, rewardsAfterTax);
        
        emit RewardsClaimed(msg.sender, _stakeId, rewards, tax);
    }
    
    
// View functions
    function calculateRewards(address _user, uint256 _stakeId) public view returns (uint256) {
        Stake memory userStake = stakes[_user][_stakeId];
        if (!userStake.active) return 0;
        
        uint256 stakingDuration = block.timestamp - userStake.lastRewardClaim;
        
       
        uint256 rewards = (userStake.amount * APY * stakingDuration) / (100 * SECONDS_PER_YEAR);
        
        return rewards;
    }
   
    function getStakeDetails(address _user, uint256 _stakeId) external view returns (
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        uint256 pendingRewards,
        bool active
    ) {
        Stake memory userStake = stakes[_user][_stakeId];
        return (
            userStake.amount,
            userStake.startTime,
            userStake.endTime,
            calculateRewards(_user, _stakeId),
            userStake.active
        );
    }
    
  
    function getUserStakeIds(address _user) external view returns (uint256[] memory) {
        return userStakeIds[_user];
    }
    
  
    function getContractStats() external view returns (
        uint256 _totalStaked,
        uint256 _totalStakers,
        uint256 _totalRewardsPaid
    ) {
        return (totalStaked, stakeCounter, totalRewardsPaid);
    }
    
  
    function can_Unstake(address _user, uint256 _stakeId) external view returns (bool) {
        Stake memory userStake = stakes[_user][_stakeId];
        return userStake.active && block.timestamp >= userStake.endTime;
    }
    
  //admin functions
    function setTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury address");
        address oldTreasury = treasury;
        treasury = _newTreasury;
        emit TreasuryUpdated(oldTreasury, _newTreasury);
    }
    

    function depositRewards(uint256 _amount) external onlyOwner {
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit RewardsDeposited(_amount);
    }
 
    function pause() external onlyOwner {
        _pause();
    }
    
    
 
    function unpause() external onlyOwner {
        _unpause();
    }
  
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(stakingToken) || _amount <= IERC20(_token).balanceOf(address(this)) - totalStaked, 
                "Cannot withdraw staked tokens");
        IERC20(_token).safeTransfer(owner(), _amount);
        emit EmergencyWithdraw(_token, _amount);
    }
}