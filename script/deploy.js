const  {ethers} =require("hardhat");
 require("dotenv").config();


async function main() {
 
  const STAKING_TOKEN = process.env.STAKING_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_ADDRESS;

  if (!STAKING_TOKEN || !TREASURY) {
    throw new Error("Please set STAKING_TOKEN_ADDRESS and TREASURY_ADDRESS in .env");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  
  const Staking = await ethers.getContractFactory("StakingContract");
  const stakingContract = await Staking.deploy(STAKING_TOKEN, TREASURY);
  await stakingContract.waitForDeployment();

  console.log("StakingContract deployed to:", await stakingContract.getAddress());
  console.log("Staking Token Address:", STAKING_TOKEN);
  console.log("Treasury Address:", TREASURY);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
