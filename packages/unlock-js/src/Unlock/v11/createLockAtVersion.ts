import ethersUtils from '../../utils'
import { ETHERS_MAX_UINT, UNLIMITED_KEYS_COUNT, ZERO } from '../../constants'

import { getErc20Decimals } from '../../erc20'

/**
 * Returns the key price in its currency, rather than its decimal representation (Ether vs. Wei for example)
 * @param {*} currencyContractAddress
 * @param {*} lock
 * @param {*} provider
 */
async function _getKeyPrice(lock, provider) {
  const currencyContractAddress = lock.currencyContractAddress || ZERO

  if (currencyContractAddress !== ZERO) {
    // We need to get the decimal value
    const erc20Decimals = await getErc20Decimals(
      currencyContractAddress,
      provider
    )
    return ethersUtils.toDecimal(lock.keyPrice, erc20Decimals)
  }
  return ethersUtils.toWei(lock.keyPrice, 'ether')
}

/**
 * Creates a lock at a specific version
 * @param {PropTypes.lock} lock
 * @param {number} lockVersion the version of the lock to create
 * @param {function} callback invoked with the transaction hash
 */
export default async function (lock, lockVersion, callback) {
  const unlockContract = await this.getUnlockContract()
  let { maxNumberOfKeys, expirationDuration } = lock
  if (maxNumberOfKeys === UNLIMITED_KEYS_COUNT) {
    maxNumberOfKeys = ETHERS_MAX_UINT
  }
  if (expirationDuration === -1) {
    maxNumberOfKeys = ETHERS_MAX_UINT
  }

  const decimalKeyPrice = await _getKeyPrice(lock, this.provider)

  const currencyContractAddress = lock.currencyContractAddress || ZERO

  const lockName = lock.name

  // get lock creator
  const lockCreator = this.signer.getAddress()
  if (!lockCreator) {
    throw new Error('No signer detected')
  }
  // parse calldata
  const calldata = await lock.interface.encodeFunctionData(
    'initialize(address,uint256,address,uint256,uint256,string)',
    [
      lockCreator,
      expirationDuration,
      currencyContractAddress,
      decimalKeyPrice,
      maxNumberOfKeys,
      lockName,
    ]
  )

  // pass calldata
  const transactionPromise = unlockContract.createLockAtVersion(
    calldata,
    lockVersion
  )

  const hash = await this._handleMethodCall(transactionPromise)
  if (callback) {
    callback(null, hash, await transactionPromise)
  }

  // Let's now wait for the lock to be deployed before we return its address
  const { logs } = await this.provider.waitForTransaction(hash)
  const parser = unlockContract.interface

  const newLockEvent = logs
    .map((log) => {
      try {
        // ignore events that we can not parse
        return parser.parseLog(log)
      } catch {
        return {}
      }
    })
    .filter((event) => event.name === 'NewLock')[0]

  if (newLockEvent) {
    return newLockEvent.args.newLockAddress
  }
  // There was no NewEvent log (transaction failed?)
  return null
}
