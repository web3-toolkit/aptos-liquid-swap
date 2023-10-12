import {createObjectCsvWriter} from "csv-writer";
import {getProjectLogFilePath} from "./util.js";

export interface TxLogEntry {
  walletAddress: string;
  time: string;
  txStatus: "success" | "failure";
  txType: "simulation" | "on-chain";
  vmStatus: string;
  hash: string;
  gasUsed: string;
  maxGas: string;
  gasPrice: string;
  payloadArgs: string
  error?: string;
}

export class TxLog {

  logs: TxLogEntry[] = [];
  dateTime: string;
  logFilePerExecution: boolean;

  constructor(dateTime: string, logFilePerExecution: boolean) {
    this.dateTime = dateTime;
    this.logFilePerExecution = logFilePerExecution;
  }

  appendLog(log: TxLogEntry): void {
    this.logs.push(log);
  }

  async toCsv() {
    let logsSorted = this.logs
    .sort((a,b) => a.walletAddress.localeCompare(b.walletAddress));
    const headers = [
      {id: 'walletAddress', title: 'Wallet Address'},
      {id: 'time', title: 'Tx time'},
      {id: 'txStatus', title: 'Tx status'},
      {id: 'txType', title: 'Tx type'},
      {id: 'vmStatus', title: 'Vm status'},
      {id: 'hash', title: 'Tx hash'},
      {id: 'gasUsed', title: 'Gas used'},
      {id: 'maxGas', title: 'Max gas'},
      {id: 'gasPrice', title: 'Gas price'},
      {id: 'payloadArgs', title: 'Tx payload args'},
      {id: 'error', title: 'Error message'}
    ];
    const filePrefix = this.logFilePerExecution ? `-${this.dateTime}` : "";
    const csvWriter = createObjectCsvWriter({
      path: getProjectLogFilePath("aptos", `execution${filePrefix}.csv`),
      header: headers
    });
    const csvData = logsSorted.map(log => {
      return {
        "walletAddress": log.walletAddress,
        "time": log.time,
        "txStatus": log.txStatus,
        "txType": log.txType,
        "vmStatus": log.vmStatus,
        "hash": log.hash,
        "gasUsed": log.gasUsed,
        "maxGas": log.maxGas,
        "gasPrice": log.gasPrice,
        "payloadArgs": log.payloadArgs,
        "error": log.error,
      }
    });
    await csvWriter.writeRecords(csvData);
  }
}