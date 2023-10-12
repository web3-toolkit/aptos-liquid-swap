import {createRequire} from "module";
import {randomElement} from "../common/util.js";
const require = createRequire(import.meta.url);

const ALL_SWAP_POOLS: PontemSwapPool[] = require("./pontemSwapPools.json");
const COIN_PAIR_TO_POOL = new Map<string, PontemSwapPool>();

for (const swapPool of ALL_SWAP_POOLS) {
  COIN_PAIR_TO_POOL.set(createCoinPairKey(swapPool.coinX, swapPool.coinY), swapPool);
  COIN_PAIR_TO_POOL.set(createCoinPairKey(swapPool.coinY, swapPool.coinX), swapPool);
}

export interface PontemSwapPool {
  "coinX": string,
  "coinY": string,
  "curve": "stable" | "unstable",
  "contract": 0 | 0.5,
  "networkId": number
}

export function randomSwapPool() : PontemSwapPool {
  return randomElement(ALL_SWAP_POOLS);
}

export function getSwapPool(coinX: string, coinY: string): PontemSwapPool | undefined {
  return COIN_PAIR_TO_POOL.get(createCoinPairKey(coinX, coinY))!;
}

function createCoinPairKey(coinX: string, coinY: string): string {
  return `${coinX}-${coinY}`;
}