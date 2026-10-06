import * as sdk from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { meter } from './read-meter-core.js?v=20261006_reads1';
export * from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
export const getDoc = meter.wrapRead(sdk.getDoc, `getDoc`);
export const getDocs = meter.wrapRead(sdk.getDocs, `getDocs`);
export const getDocFromServer = meter.wrapRead(sdk.getDocFromServer, `getDocFromServer`);
export const getDocsFromServer = meter.wrapRead(sdk.getDocsFromServer, `getDocsFromServer`);
export const onSnapshot = meter.wrapListen(sdk.onSnapshot);
export const runTransaction = meter.wrapTransaction(sdk.runTransaction);
