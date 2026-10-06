import * as sdk from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-lite.js';
import { meter } from './read-meter-core.js?v=20261006_reads1';
export * from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-lite.js';
export const getDoc = meter.wrapRead(sdk.getDoc, `getDoc / Lite`);
export const getDocs = meter.wrapRead(sdk.getDocs, `getDocs / Lite`);
export const runTransaction = meter.wrapTransaction(sdk.runTransaction);
