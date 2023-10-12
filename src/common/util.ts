import {randomInt as randomIntCrypto} from "crypto";
import fs from "fs";
import path from "path";
import winston, {Logger} from "winston";

export const sleep = async (millis: number) => new Promise(resolve => setTimeout(resolve, millis));

export function randomElement(array: any[]): any {
  if (array.length == 0) {
    throw Error("Empty array provided");
  }
  return array[randomInt(0, array.length - 1)];
}

export function shuffle(array: any[]): any[] {
  return array.sort(() => Math.random() - 0.5);
}

export async function sleepSeconds(seconds: number) {
  console.log(`Sleeping for ${seconds} seconds`);
  await sleep(seconds * 1000);
}

export function readLines(filePath: string): string[] {
  const file = fs.readFileSync(filePath, 'utf-8');
  return file.split(/\r?\n/);
}

export function getProjectLogFilePath(project: string, file: string) {
  return getProjectLogPath(project) + path.sep + file;
}

export function getProjectLogPath(project: string) {
  return [process.cwd(), "resource", "log", project].join(path.sep);
}

export function getProjectConfigFilePath(project: string, file: string) {
  return getProjectConfigPath(project) + path.sep + file;
}

export function getProjectConfigPath(project: string) {
  return [process.cwd(), "resource", "config", project].join(path.sep)
}

export function randomInt(min: number, max: number): number {
  return randomIntCrypto(min, max + 1);
}

export function createLogger(project: string, executionTime: string, logFilePerExecution: boolean): Logger {
  let format = winston.format.combine(
      winston.format.errors({stack: true}),
      winston.format.simple()
  );
  const logPrefix = logFilePerExecution ? `-${executionTime}` : "";
  return winston.createLogger({
    transports: [
      new winston.transports.File({
        filename: getProjectLogFilePath(project, `execution${logPrefix}.logs`),
        options: {flags: 'w'},
        format: format
      }),
      new winston.transports.Console({
        format: winston.format.combine(format, winston.format.simple())
      })
    ]
  })
}

export function getCurrentDateTime(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const second = date.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day}-${hour}-${minute}-${second}`;
}