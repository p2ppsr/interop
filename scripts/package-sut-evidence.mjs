#!/usr/bin/env node
import path from 'node:path';
import { packageSutEvidence, verifyNativeObservation, verifyWalletRun, verifyWalletRunSeries } from '../src/sut-evidence.mjs';

const [command, ...args] = process.argv.slice(2);
if (command === 'package-native' && args.length === 3) {
  const result = packageSutEvidence(...args.map(item => path.resolve(item)));
  console.log(JSON.stringify({ verified: true, runId: result.runId, outcome: result.outcome }));
} else if (command === 'verify-native' && args.length === 1) {
  const result = verifyNativeObservation(path.resolve(args[0]));
  console.log(JSON.stringify({ verified: true, runId: result.runId, outcome: result.outcome }));
} else if (command === 'verify-wallet' && args.length === 1) {
  const result = verifyWalletRun(path.resolve(args[0]));
  console.log(JSON.stringify({ verified: true, runId: result.runId, outcome: result.outcome }));
} else if (command === 'verify-wallet-series' && args.length === 1) {
  const result = verifyWalletRunSeries(path.resolve(args[0]));
  console.log(JSON.stringify({ verified: true, repetitions: result.repetitions.length, outcome: result.outcome }));
} else {
  throw new Error('Usage: package-sut-evidence <package-native SUMMARY INPUT OUTPUT | verify-native DIRECTORY | verify-wallet DIRECTORY | verify-wallet-series DIRECTORY>');
}
