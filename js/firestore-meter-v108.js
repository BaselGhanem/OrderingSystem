import * as sdk from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { meter } from './read-meter-core.js?v=20261006_reads1';
export * from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
export const getDoc = meter.wrapRead(sdk.getDoc, `getDoc / v10.8`);
export const getDocs = meter.wrapRead(sdk.getDocs, `getDocs / v10.8`);
export const onSnapshot = meter.wrapListen(sdk.onSnapshot);
export const runTransaction = meter.wrapTransaction(sdk.runTransaction);
