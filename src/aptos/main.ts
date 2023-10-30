import {
  AptosAccount,
  AptosClient,
  BCS,
  HexString,
  OptionalTransactionArgs,
  TxnBuilderTypes
} from "aptos";
import axios, {AxiosResponse} from "axios";
import {SDK} from "@pontem/liquidswap-sdk";
import {
  createLogger, getCurrentDateTime,
  getProjectConfigFilePath,
  randomInt,
  readLines,
  shuffle,
  sleepSeconds
} from "../common/util.js";
import assert from "node:assert";
import {getSwapPool, randomSwapPool} from "./pontemUtil.js";
import {TxLog, TxLogEntry} from "../common/txLog.js";
import {CurveType} from "@pontem/liquidswap-sdk/dist/tsc/types/aptos";
import {APSCAN, APTOS_COIN_CONTRACT, APTOS_DECIMALS, PONTEM_SWAP_ADDRESS} from "./constant.js";
import PropertiesReader from "properties-reader"
import https from "https";

const {
  EntryFunction,
  StructTag,
  TypeTagStruct,
  TransactionPayloadEntryFunction
} = TxnBuilderTypes

interface CoinData {
  contract: string;
  balance: number;
  decimals: number;
}

interface AptosConfig {
  sidPhrasesFile: string;
  minDelayBetweenSwapsSeconds: number;
  maxDelayBetweenSwapsSeconds: number;
  minRegisterTokenDelaySeconds: number;
  maxRegisterTokenDelaySeconds: number;
  minSwapsPerAccount: number;
  maxSwapsPerAccount: number;
  aptosBalanceMin: number;
  aptosBalanceMax: number;
  swapMinPercent: number;
  swapMaxPercent: number;
  slippageMinPercent: number;
  slippageMaxPercent: number;
  minGasAmount: number;
  maxGasAmount: number;
  minGasPrice: number;
  maxGasPrice: number;
  rpc: string;
  logFilePerExecution: boolean
}

const CURRENT_DATE_TIME = getCurrentDateTime();
const CONFIG = createConfig();
const LOGGER = createLogger("aptos", CURRENT_DATE_TIME, CONFIG.logFilePerExecution);
const TX_LOG = new TxLog(CURRENT_DATE_TIME, CONFIG.logFilePerExecution);
const CLIENT = new AptosClient(CONFIG.rpc);
const AXIOS_INSTANCE = axios.create({
  validateStatus: () => true
});

async function main() {
  registerAppListeners();
  LOGGER.info(`Starting app with ${JSON.stringify(CONFIG)} config`);

  const walletsMap = getWalletsMap(CONFIG.sidPhrasesFile);

  const walletAddressesSwapSequence = createWalletAddressesSwapSequence(walletsMap);
  let sequenceLength = walletAddressesSwapSequence.length;
  LOGGER.info(`Wallet addresses swap sequence: ${walletAddressesSwapSequence}.\nSwaps amount: ${sequenceLength}`);

  for (let i = 0; i < sequenceLength; i++) {
    LOGGER.info(`Processing ${i + 1}th swap out of ${sequenceLength} total.`);
    const walletAddress = walletAddressesSwapSequence[i];
    try {
      const wallet = walletsMap.get(walletAddress)!;
      await randomSwap(wallet);
    } catch (e: any) {
      LOGGER.error(`Failed performing swap transaction for ${walletAddress} wallet`, e)
    }
  }
}

function registerAppListeners() {
  process.on('beforeExit', async () => {
    await onExit();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await onExit();
  });
}

async function onExit() {
  await TX_LOG.toCsv();
}

function createWalletAddressesSwapSequence(walletsMap: Map<string, AptosAccount>) {
  const walletAddressesSwapSequence = [];
  const warmUpWalletsPath = getProjectConfigFilePath("aptos", "wallets.txt");
  let warmUpWalletAddresses = readLines(warmUpWalletsPath);
  if (warmUpWalletAddresses.length == 0) {
    LOGGER.info("No wallets provided in wallets.txt. Using all wallets")
    warmUpWalletAddresses = Array.from(walletsMap.keys());
  }
  LOGGER.info(`Warm up wallets: ${warmUpWalletAddresses}`);
  for (const walletAddress of warmUpWalletAddresses) {
    const swapsNumber = randomInt(CONFIG.minSwapsPerAccount, CONFIG.maxSwapsPerAccount);
    for (let i = 0; i < swapsNumber; i++) {
      walletAddressesSwapSequence.push(walletAddress);
    }
  }

  return shuffle(walletAddressesSwapSequence);
}

function getWalletsMap(filePath: string): Map<string, AptosAccount> {
  const wallets = new Map<string, AptosAccount>();
  for (const sidOrKey of readLines(filePath)) {
      const wallet = sidOrKey.split(" ").length > 1
          ? AptosAccount.fromDerivePath("m/44'/637'/0'/0'/0'", sidOrKey)
          : new AptosAccount(HexString.ensure(sidOrKey).toUint8Array());
    wallets.set(wallet.address().toString(), wallet);
  }
  return wallets;
}

async function randomSwap(wallet: AptosAccount) {
  const aptosMinimumBalance = randomInt(CONFIG.aptosBalanceMin, CONFIG.aptosBalanceMax);
  LOGGER.info(
      `Starting warmup for ${wallet.address()}. ` +
      `Randomly chosen minimum aptos balance: ${aptosMinimumBalance}`
  );

  const {swapFromContract, swapToContract} = await createSwapPair(wallet, aptosMinimumBalance);
  const swapAmount = await createSwapAmount(wallet.address().toString(), swapFromContract, aptosMinimumBalance);

  await swap(wallet, swapFromContract, swapToContract, swapAmount);
  LOGGER.info(`Finished warmup for ${wallet.address()}\n`);
}

async function createSwapPair(wallet: AptosAccount, aptosMinimumBalance: number): Promise<any> {
  const aptosInfo = await getWalletCoin(wallet.address().toString(), APTOS_COIN_CONTRACT);
  if (aptosInfo.balance < aptosMinimumBalance) {
    return await createRandomToAptosPair(wallet);
  } else {
    return await createRandomAnyPair(wallet);
  }
}

async function createRandomToAptosPair(wallet: AptosAccount): Promise<any> {
  let contractsWithBalance = await getAllAssetContractsWithBalance(wallet.address().toString());
  contractsWithBalance = contractsWithBalance.filter(c => c !== APTOS_COIN_CONTRACT);
  const coinX = shuffle(contractsWithBalance).find(c => getSwapPool(APTOS_COIN_CONTRACT, c) !== undefined);
  const coinY = APTOS_COIN_CONTRACT;
  assert(coinX, `Not enough balance at wallet ${wallet.address().toString()}`);
  LOGGER.info(`Aptos balance is small. Choosing ${coinX} - ${coinY} pool`);

  return {
    swapFromContract: coinX,
    swapToContract: coinY
  }
}

async function createRandomAnyPair(wallet: AptosAccount): Promise<any> {
  let swapPool = randomSwapPool();
  LOGGER.info(`Randomly chosen ${JSON.stringify(swapPool)} pool`);
  let coinX = swapPool.coinX;
  let coinY = swapPool.coinY;
  const swapAssetContractsPair = [coinX, coinY];
  let assetContractsWithBalance = await getAssetContractsWithBalance(
      wallet.address().toString(), swapAssetContractsPair
  );

  if (assetContractsWithBalance.length == 0) {
    coinX = APTOS_COIN_CONTRACT;
    coinY = shuffle(swapAssetContractsPair).find(c => getSwapPool(coinX, c) !== undefined);
    assert(coinY, `No pool found for ${coinX} - ${coinY} token contracts`);
  } else if (assetContractsWithBalance.length == 1 && assetContractsWithBalance[0] !== coinX) {
    coinX = swapAssetContractsPair[1];
    coinY = swapAssetContractsPair[0];
  } else if (assetContractsWithBalance.length == 2) {
    assetContractsWithBalance = shuffle(assetContractsWithBalance);
    coinX = assetContractsWithBalance[0];
    coinY = assetContractsWithBalance[1];
  }
  return {
    swapFromContract: coinX,
    swapToContract: coinY
  }
}

async function createSwapAmount(walletAddress: string, swapFromContract: string, aptosMinimumBalance: number) {
  const coinData = await getWalletCoins(walletAddress);
  const swapFromCoinData = coinData.find(w => w.contract === swapFromContract);
  const coinBalance = swapFromCoinData!.balance;
  let swapAmount = coinBalance;
  if (swapFromContract === APTOS_COIN_CONTRACT) {
    swapAmount = coinBalance - aptosMinimumBalance;
    assert(
        swapAmount > 0,
        `${coinBalance / 10 ^ APTOS_DECIMALS} native balance is not enough for swap at ${walletAddress}`
    );
  }
  return swapAmount * randomInt(CONFIG.swapMinPercent, CONFIG.swapMaxPercent) / 100;
}

async function swap(wallet: AptosAccount, swapFromContract: string, swapToContract: string, swapAmount: number) {
  LOGGER.info(`Swapping ${swapAmount} ${swapFromContract} to ${swapToContract}.`);

  const toTokenStore = await getCoinStore(wallet.address(), swapToContract);
  if (!toTokenStore.data.hasOwnProperty("data")) {
    await register(wallet, swapToContract);
  }

  const payload = await createLiquidSwapPayload(swapFromContract, swapToContract, swapAmount);
  const sleepSeconds = randomInt(CONFIG.minDelayBetweenSwapsSeconds, CONFIG.maxDelayBetweenSwapsSeconds);
  await submitTransaction(wallet, payload, sleepSeconds, createGasParams());
}

async function getAllAssetContractsWithBalance(walletAddress: string): Promise<string[]> {
  return getAssetContractsWithBalance(walletAddress, [])
}

async function getAssetContractsWithBalance(walletAddress: string, swapAssetContracts: string[]): Promise<string[]> {
  const swapAssetContractsSet = new Set(swapAssetContracts);
  const walletCoins = await getWalletCoins(walletAddress);
  return walletCoins
  .filter(c => c.balance > 0 && (swapAssetContractsSet.size == 0 || swapAssetContractsSet.has(c.contract)))
  .map(c => c.contract);
}

async function getCoinStore(accountAddress: HexString, contract: string): Promise<AxiosResponse> {
  return await getResource(accountAddress, `0x1::coin::CoinStore<${contract}>`);
}

async function getResource(accountAddress: HexString, resourceType: string): Promise<AxiosResponse> {
  return await AXIOS_INSTANCE.get(
      `${CONFIG.rpc}/accounts/${accountAddress}/resource/${resourceType}`
  )
}

async function register(wallet: AptosAccount, tokenAddress: string) {
  const payload = new TransactionPayloadEntryFunction(EntryFunction.natural(
      "0x1::managed_coin",
      "register",
      [new TypeTagStruct(StructTag.fromString(tokenAddress))],
      []
  ));
  let sleepSeconds = randomInt(
      CONFIG.minRegisterTokenDelaySeconds, CONFIG.maxRegisterTokenDelaySeconds
  );
  await submitTransaction(wallet, payload, sleepSeconds, createGasParams());
}

async function submitTransaction(wallet: AptosAccount, payload: any, sleepTimeSeconds: number,
                                 extraArgs?: OptionalTransactionArgs) {
  const rawTransaction = await CLIENT.generateRawTransaction(wallet.address(), payload, extraArgs);
  let result: any = (await CLIENT.simulateTransaction(wallet, rawTransaction))[0];
  let isSimulation = true;
  if (result["success"]) {
    const signedTx = await CLIENT.signTransaction(wallet, rawTransaction);
    const pendingTx = await CLIENT.submitTransaction(signedTx);
    result = await CLIENT.waitForTransactionWithResult(pendingTx.hash);
    isSimulation = false;
  }
  let log = createTxLog(wallet, result, isSimulation);
  TX_LOG.appendLog(log);
  LOGGER.info(`Tx result ${JSON.stringify(log)}`);

  if (!isSimulation) {
    await sleepSeconds(sleepTimeSeconds);
  }
}

function createTxLog(wallet: AptosAccount, result: any, isSimulation: boolean): TxLogEntry {
  return {
    walletAddress: wallet.address().toString(),
    time: new Date(Number(result["timestamp"]) / 1000).toISOString(),
    txStatus: result["success"] ? "success" : "failure",
    txType: isSimulation ? "simulation" : "on-chain",
    vmStatus: result["vm_status"],
    hash: result["hash"],
    gasUsed: result["gas_used"],
    maxGas: result["max_gas_amount"],
    gasPrice: result["gas_unit_price"],
    payloadArgs: JSON.stringify(result["payload"]),
  };
}

function createGasParams(): any {
  const maxGasAmount = BigInt(randomInt(CONFIG.minGasAmount, CONFIG.maxGasAmount));
  const gasUnitPrice = BigInt(randomInt(CONFIG.minGasPrice, CONFIG.maxGasPrice));
  LOGGER.info(`Gas amount ${maxGasAmount}, gas price ${gasUnitPrice}`);
  return {
    maxGasAmount: maxGasAmount,
    gasUnitPrice: gasUnitPrice
  }
}

async function createLiquidSwapPayload(swapFromContract: string, swapToContract: string, swapAmount: number): Promise<any> {
  const sdk = new SDK({
    nodeUrl: CONFIG.rpc
  });

  const swapPool = getSwapPool(swapFromContract, swapToContract)!;

  const curveType: CurveType = swapPool.curve === "stable" ? swapPool.curve : "uncorrelated";
  const coinsIn = await sdk.Swap.calculateRates({
    fromToken: swapFromContract,
    toToken: swapToContract,
    amount: swapAmount,
    curveType: curveType,
    interactiveToken: 'from',
    version: swapPool.contract,
  });

  let slippage = randomInt(CONFIG.slippageMinPercent, CONFIG.slippageMaxPercent) / 100;
  LOGGER.info(`Using ${slippage} slippage`);
  const swapTransactionPayload = sdk.Swap.createSwapTransactionPayload({
    fromToken: swapFromContract,
    toToken: swapToContract,
    fromAmount: swapAmount,
    toAmount: Number(coinsIn),
    interactiveToken: 'from',
    slippage: slippage,
    stableSwapType: 'normal',
    curveType: curveType
  });
  const functionName = swapTransactionPayload.function.split("::scripts_v2::")[1];
  return new TransactionPayloadEntryFunction(EntryFunction.natural(
      `${PONTEM_SWAP_ADDRESS}::scripts_v2`,
      functionName,
      swapTransactionPayload.type_arguments.map(a => new TypeTagStruct(StructTag.fromString(a))),
      swapTransactionPayload.arguments.map(a => BCS.bcsSerializeUint64(Math.round(Number(a))))
  ));
}

async function getWalletCoin(walletAddress: string, coinContractAddress: string): Promise<CoinData> {
  return (await getWalletCoins(walletAddress)).find(c => c.contract === coinContractAddress)!;
}

async function getWalletCoins(walletAddress: string): Promise<CoinData[]> {
  let addressWithoutTrailingZero = walletAddress.replace('0x0', '0x');
  const requestUrl = `${APSCAN}/accounts?address=eq.${addressWithoutTrailingZero}`;
  let requestConfig = {
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  };
  const response = await AXIOS_INSTANCE.get(requestUrl, requestConfig);
  const balancesResponse = response.data[0]["all_balances"];
  if (balancesResponse === undefined) {
    LOGGER.error(`Bad response from ${requestUrl}. Response ${response.data}`);
  }
  return balancesResponse.map((w: any) => {
    const contract = w["move_resource_generic_type_params"][0];
    const balance = Number(w["balance"]);
    const decimals = Number(w["coin_info"]["decimals"]);
    return {
      contract: contract,
      balance: balance,
      decimals: decimals
    }
  });
}

function createConfig(): AptosConfig {
  const properties = PropertiesReader(getProjectConfigFilePath("aptos", ".properties"));
  const aptosBalanceMin = Number(properties.get("APTOS_BALANCE_MIN")!)
      * Math.pow(10, APTOS_DECIMALS);
  const aptosBalanceMax = Number(properties.get("APTOS_BALANCE_MAX")!)
      * Math.pow(10, APTOS_DECIMALS);
  return {
    sidPhrasesFile: properties.get("SID_PHRASES_FILE")!,
    minDelayBetweenSwapsSeconds: properties.get("MIN_DELAY_BETWEEN_SWAPS_SECONDS")!,
    maxDelayBetweenSwapsSeconds: properties.get("MAX_DELAY_BETWEEN_SWAPS_SECONDS")!,
    minRegisterTokenDelaySeconds: properties.get("MIN_REGISTER_TOKEN_DELAY_SECONDS")!,
    maxRegisterTokenDelaySeconds: properties.get("MAX_REGISTER_TOKEN_DELAY_SECONDS")!,
    minSwapsPerAccount: properties.get("MIN_SWAPS_PER_ACCOUNT")!,
    maxSwapsPerAccount: properties.get("MAX_SWAPS_PER_ACCOUNT")!,
    aptosBalanceMin: aptosBalanceMin,
    aptosBalanceMax: aptosBalanceMax,
    swapMinPercent: properties.get("SWAP_MIN_PERCENT")!,
    swapMaxPercent: properties.get("SWAP_MAX_PERCENT")!,
    slippageMinPercent: properties.get("SLIPPAGE_MIN_PERCENT")!,
    slippageMaxPercent: properties.get("SLIPPAGE_MAX_PERCENT")!,
    minGasAmount: properties.get("MIN_GAS_AMOUNT")!,
    maxGasAmount: properties.get("MAX_GAS_AMOUNT")!,
    minGasPrice: properties.get("MIN_GAS_PRICE")!,
    maxGasPrice: properties.get("MAX_GAS_PRICE")!,
    rpc: properties.get("RPC")!,
    logFilePerExecution: properties.get("LOG_FILE_PER_EXECUTION")!
  } as AptosConfig;
}

(async () => {
  await main();
})();