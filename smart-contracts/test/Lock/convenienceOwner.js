const { ethers } = require('hardhat')
const { expectRevert } = require('@openzeppelin/test-helpers')
const { getProxyAddress } = require('../../helpers/deployments')
const createLockHash = require('../helpers/createLockCalldata')

const keyPrice = ethers.utils.parseEther('0.01')

contract('Lock / mimick owner()', () => {
  let unlock
  let lock
  let deployer

  beforeEach(async () => {
    const chainId = 31337
    const unlockAddress = getProxyAddress(chainId, 'Unlock')

    // parse unlock
    ;[deployer] = await ethers.getSigners()

    const Unlock = await ethers.getContractFactory('Unlock')
    unlock = Unlock.attach(unlockAddress)

    // create a new lock
    const tokenAddress = web3.utils.padLeft(0, 40)
    const args = [60 * 30, tokenAddress, keyPrice, 10, 'Test lock']

    const calldata = await createLockHash({ args, from: deployer.address })
    const tx = await unlock.createUpgradeableLock(calldata)
    const { events } = await tx.wait()
    const {
      args: { newLockAddress },
    } = events.find(({ event }) => event === 'NewLock')

    const PublicLock = await ethers.getContractFactory('PublicLock')
    lock = PublicLock.attach(newLockAddress)
  })

  describe('owner()', () => {
    it('default should be set as deployer', async () => {
      assert.equal(await lock.owner(), deployer.address)
    })
  })

  describe('setOwner()', () => {
    it('should set any address as owner', async () => {
      const wallet = await ethers.Wallet.createRandom()
      const tx = await lock.connect(deployer).setOwner(wallet.address)
      await tx.wait()
      assert.equal(await lock.owner(), wallet.address)
    })
    it('should revert on address zero', async () => {
      await expectRevert(
        lock.connect(deployer).setOwner(ethers.constants.AddressZero),
        'OWNER_CANT_BE_ADDRESS_ZERO'
      )
    })
    it('should revert if not lock manager', async () => {
      const [, notManager, anotherAddress] = await ethers.getSigners()
      await expectRevert(
        lock.connect(notManager).setOwner(notManager.address),
        'ONLY_LOCK_MANAGER'
      )
      await expectRevert(
        lock.connect(notManager).setOwner(anotherAddress.address),
        'ONLY_LOCK_MANAGER'
      )
    })
  })

  describe('isOwner()', () => {
    it('should return true when owner address is passed', async () => {
      // check default
      assert.equal(await lock.isOwner(deployer.address), true)
      // check random address
      const wallet = await ethers.Wallet.createRandom()
      const tx = await lock.connect(deployer).setOwner(wallet.address)
      await tx.wait()
      assert.equal(await lock.isOwner(wallet.address), true)
    })
    it('should return false when another address is passed', async () => {
      const wallet = await ethers.Wallet.createRandom()
      // check default
      assert.equal(await lock.isOwner(wallet.address), false)

      // check random address
      const tx = await lock.connect(deployer).setOwner(wallet.address)
      await tx.wait()
      assert.equal(await lock.isOwner(wallet.address), true)
      assert.equal(await lock.isOwner(deployer.address), false)
    })
  })

  describe('OwnershipTransferred event', () => {
    it('should be emitted when new owner is set', async () => {
      const wallet = await ethers.Wallet.createRandom()
      const tx = await lock.connect(deployer).setOwner(wallet.address)
      const { events } = await tx.wait()
      const {
        args: { previousOwner, newOwner },
      } = events.find(({ event }) => event === 'OwnershipTransferred')
      assert.equal(previousOwner, deployer.address)
      assert.equal(newOwner, wallet.address)
      assert.equal(await lock.owner(), wallet.address)
    })
  })
})
