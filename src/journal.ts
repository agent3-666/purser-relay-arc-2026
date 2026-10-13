import { open, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
export interface RecordEntry { phase: 'prepared'|'signed'|'broadcast'|'confirmed'|'unknown'; orderId: string; chainId: string; contract: string; action: string; txHash?: string; nonce?: number; timestamp: string; }
export async function appendJournal(path: string, entry: RecordEntry): Promise<void> {
 await mkdir(dirname(resolve(path)), {recursive:true, mode:0o700});
 const file = await open(path,'a',0o600); if ((await file.stat()).mode & 0o077) { await file.close(); throw new Error('Journal permissions must be 600 or stricter'); } try { await file.write(JSON.stringify(entry)+'\n'); await file.sync(); } finally {await file.close();}
 // Persist the directory entry as well as the file content.
 const directory = await open(dirname(resolve(path)),'r'); try {await directory.sync();} finally {await directory.close();}
}
export async function readJournal(path: string): Promise<RecordEntry[]> {
 if ((await stat(path)).mode & 0o077) throw new Error('Journal permissions must be 600 or stricter');
 const data = await readFile(path,'utf8'); if (!data.endsWith('\n')) throw new Error('Truncated journal: UNKNOWN; no retry');
 return data.trim() ? data.trim().split('\n').map(line => { const r=JSON.parse(line); if(!['prepared','signed','broadcast','confirmed','unknown'].includes(r.phase)||!/^0x[0-9a-fA-F]{64}$/.test(r.orderId)||r.chainId!=='5042'||!/^0x[0-9a-fA-F]{40}$/.test(r.contract)||!['createOrder','replaceWorker','revokeWorker','submitDeliverable','approve','claimPayment','expire','claimRefund'].includes(r.action)||typeof r.timestamp!=='string'||Number.isNaN(Date.parse(r.timestamp))||!Number.isSafeInteger(r.nonce)||r.nonce<0||(['signed','broadcast','confirmed','unknown'].includes(r.phase)&&typeof r.txHash!=='string')||(r.txHash!==undefined&&!/^0x[0-9a-fA-F]{64}$/.test(r.txHash)))throw new Error('Malformed journal: UNKNOWN'); return r as RecordEntry; }) : [];
}
export function maySign(records: RecordEntry[], order: string, action: string): boolean {
 return !records.some(r => r.orderId === order && r.action === action && ['prepared','signed','broadcast','unknown','confirmed'].includes(r.phase));
}
