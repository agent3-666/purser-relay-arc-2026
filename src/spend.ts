import {createHash} from 'node:crypto';import {budget,CHAIN_ID} from './model.js';
export const TOTAL_CAP=250000000000000000n;
export interface Approval {project:string;chainId:string;scope:string;humanApprovalReference:string;approvedTotalCap18:string;actions:Record<string,string>;roleAddresses:string[];globalLedgerPath:string;}
export function planHash(plan:unknown):string{return createHash('sha256').update(JSON.stringify(plan)).digest('hex');}
export function checkApproval(a:Approval,p:any,local:boolean):void{
 if(a.project!=='purser-relay-arc'||a.chainId!==CHAIN_ID.toString()||a.scope!==(local?'LOCAL_ONLY':'ARC_MAINNET_5042')||typeof a.humanApprovalReference!=='string'||!a.humanApprovalReference.trim()||a.approvedTotalCap18!==TOTAL_CAP.toString()||!a.actions||a.actions[p.actionId]!==planHash(p)||!Array.isArray(a.roleAddresses)||typeof a.globalLedgerPath!=='string'||!a.globalLedgerPath.startsWith('/'))throw Error('Missing or mismatched human approval / plan binding / total cap');
}
export interface Spend {actionId:string;planHash:string;reserved18:string;phase:'prepared'|'signed'|'broadcast'|'confirmed'|'unknown';txHash?:string;nonce:number;timestamp:string;}
export function reserveSpend(rows:Spend[],actionId:string,value:bigint,gas:bigint,fee:bigint,balance:bigint):bigint{
 if(typeof actionId!=='string'||!actionId||rows.some(r=>r.actionId===actionId))throw Error('Prior actionId: no automatic resign');
 const unique=new Map<string,bigint>();for(const r of rows){if(typeof r.actionId!=='string'||!r.actionId||!['prepared','signed','broadcast','confirmed','unknown'].includes(r.phase)||!/^\d+$/.test(r.reserved18)||!Number.isSafeInteger(r.nonce)||r.nonce<0||typeof r.timestamp!=='string'||Number.isNaN(Date.parse(r.timestamp))||(['signed','broadcast','confirmed'].includes(r.phase)&&!/^0x[0-9a-fA-F]{64}$/.test(r.txHash??''))||(r.txHash!==undefined&&!/^0x[0-9a-fA-F]{64}$/.test(r.txHash))||typeof r.planHash!=='string'||! /^[0-9a-f]{64}$/.test(r.planHash))throw Error('Malformed global ledger: UNKNOWN');const amount=BigInt(r.reserved18);if(unique.has(r.actionId)&&unique.get(r.actionId)!==amount)throw Error('Contradictory reservation');unique.set(r.actionId,amount);}
 const cap=budget(gas,fee,value);const used=[...unique.values()].reduce((a,b)=>a+b,0n);if(cap>balance||used+cap>TOTAL_CAP)throw Error('Role balance or global total budget exceeded');return cap;
}
