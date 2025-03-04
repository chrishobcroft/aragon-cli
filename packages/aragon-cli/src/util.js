const findUp = require('find-up')
const path = require('path')
const execa = require('execa')
const net = require('net')
const fs = require('fs')

let cachedProjectRoot

const PGK_MANAGER_BIN_NPM = 'npm'

const findProjectRoot = () => {
  if (!cachedProjectRoot) {
    try {
      cachedProjectRoot = path.dirname(findUp.sync('arapp.json'))
    } catch (_) {
      throw new Error('This directory is not an Aragon project')
      // process.exit(1)
    }
  }
  return cachedProjectRoot
}

const isPortTaken = async (port, opts) => {
  opts = Object.assign({ timeout: 1000 }, opts)

  return new Promise(resolve => {
    const socket = new net.Socket()

    const onError = () => {
      socket.destroy()
      resolve(false)
    }

    socket.setTimeout(opts.timeout)
    socket.on('error', onError)
    socket.on('timeout', onError)

    socket.connect(port, opts.host, () => {
      socket.end()
      resolve(true)
    })
  })
}

const getNodePackageManager = () => {
  return PGK_MANAGER_BIN_NPM
}

const installDeps = (cwd, task) => {
  const bin = getNodePackageManager()
  const installTask = execa(bin, ['install'], { cwd })
  installTask.stdout.on('data', log => {
    if (!log) return
    task.output = log
  })

  return installTask.catch(err => {
    throw new Error(
      `${err.message}\n${err.stderr}\n\nFailed to install dependencies. See above output.`
    )
  })
}

const getDependentBinary = (binaryName, projectRoot) => {
  if (!projectRoot) {
    // __dirname evaluates to the directory of this file (util.js)
    // e.g.: `../dist/` or `../src/`
    projectRoot = path.join(__dirname, '..')
  }

  // check local node_modules
  let binaryPath = path.join(projectRoot, 'node_modules', '.bin', binaryName)

  if (fs.existsSync(binaryPath)) {
    return binaryPath
  }

  // check parent node_modules
  binaryPath = path.join(projectRoot, '..', '.bin', binaryName)

  if (fs.existsSync(binaryPath)) {
    return binaryPath
  }

  // check parent node_modules if this module is scoped (e.g.: @scope/package)
  binaryPath = path.join(projectRoot, '..', '..', '.bin', binaryName)

  if (fs.existsSync(binaryPath)) {
    return binaryPath
  }

  throw new Error(
    `Cannot find the ${binaryName} dependency. Has this module installed correctly?`
  )
}

const getContract = (pkg, contract) => {
  const artifact = require(`${pkg}/build/contracts/${contract}.json`)
  return artifact
}

const ANY_ENTITY = '0xffffffffffffffffffffffffffffffffffffffff'
const NO_MANAGER = '0x0000000000000000000000000000000000000000'
const DEFAULT_GAS_FUZZ_FACTOR = 1.5
const LAST_BLOCK_GAS_LIMIT_FACTOR = 0.95

/**
 *
 * Calculate the recommended gas limit
 *
 * @param {*} web3 eth provider to get the last block gas limit
 * @param {number} estimatedGas estimated gas
 * @param {number} gasFuzzFactor defaults to 1.5
 * @returns {number} gasLimit
 */
const getRecommendedGasLimit = async (
  web3,
  estimatedGas,
  gasFuzzFactor = DEFAULT_GAS_FUZZ_FACTOR
) => {
  // TODO print these values if --debug is passed
  const latestBlock = await web3.eth.getBlock('latest')
  const blockGasLimit = latestBlock.gasLimit

  const upperGasLimit = Math.round(blockGasLimit * LAST_BLOCK_GAS_LIMIT_FACTOR)
  if (estimatedGas > upperGasLimit) return estimatedGas // TODO print a warning?

  const bufferedGasLimit = Math.round(estimatedGas * gasFuzzFactor)

  if (bufferedGasLimit < upperGasLimit) return bufferedGasLimit
  return upperGasLimit
}

module.exports = {
  findProjectRoot,
  isPortTaken,
  installDeps,
  getNodePackageManager,
  getDependentBinary,
  getContract,
  ANY_ENTITY,
  NO_MANAGER,
  getRecommendedGasLimit,
}
