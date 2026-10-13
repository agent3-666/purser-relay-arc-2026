// Standalone Recovery Kit: defaults to read-only; no app or worker journal needed.
import { readFile, realpath, mkdir, open, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Contract, Interface, JsonRpcProvider, Wallet, keccak256 } from 'ethers';
import { verifyChain } from '../src/chain.js';
import { address,hash,CHAIN_ID,FEE_FLOOR,guardSpend,formatUSDC } from '../src/model.js';
import { appendJournal, readJournal, maySign, RecordEntry } from '../src/journal.js';
import { checkApproval, planHash, reserveSpend, Spend } from '../src/spend.js';
import { canonicalPrivatePath, acquireLock } from '../src/lock.js';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);const opt=(n:string)=>{const i=args.indexOf(n);return i>=0?args[i+1]:undefined;};
const contract=address(opt('--contract')??'');const id=hash(opt('--order')??'');const codehash=hash(opt('--codehash')??'');
const rpc=opt('--rpc')??'https://rpc.mainnet.arc.io';const provider=new JsonRpcProvider(rpc);
const abi=JSON.parse(await readFile(new URL('../contracts/abi.json',import.meta.url),'utf8'));
const verified=await verifyChain(provider,contract,codehash);const instance=new Contract(contract,abi,provider);
const order=await instance.getOrder(id,{blockTag:verified.block});
const status=['None','Funded','Submitted','Approved','Claimed','Refundable','Refunded'][Number(order.status)];
const result={readOnly:true,chainId:CHAIN_ID.toString(),contract,orderId:id,codehash,block:verified.block,status,owner:order.owner,payee:order.payee,workerA:order.workerA,workerB:order.workerB,epoch:order.authorityEpoch.toString(),principal18:order.principal.toString(),principalUSDC:formatUSDC(order.principal),credit18:order.credit.toString(),deadline:order.deadline.toString(),observedAt:new Date().toISOString()};
console.log(JSON.stringify(result,null,2));
const local=args.includes('--execute-local');const mainnet=args.includes('--execute-mainnet');if(!local&&!mainnet)process.exit(0);if(local&&mainnet)throw new Error('Choose exactly one execution mode');if(local&&!['127.0.0.1','localhost','[::1]'].includes(new URL(rpc).hostname))throw new Error('Local execution requires loopback RPC');
const action=opt('--action');if(!action||!['claimPayment','expire','claimRefund'].includes(action))throw new Error('Recovery only permits claimPayment/expire/claimRefund');
const walletPath=opt('--wallet');const journalPath=opt('--journal');const cap=opt('--cap18');
if(!walletPath||!journalPath||!cap||!/^\d+$/.test(cap))throw new Error('Explicit wallet, outside-repo journal, and action cap18 required');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const walletFile=await realpath(walletPath);const journal=await canonicalPrivatePath(journalPath,root);
if(walletFile.startsWith(root+'/')||journal.startsWith(root+'/'))throw new Error('Wallet/journal must stay outside source repository');
const block=await provider.getBlock(verified.block);if(!block)throw new Error('UNKNOWN block');
if(action==='claimPayment'&&status!=='Approved')throw new Error('Not Approved');
if(action==='claimRefund'&&status!=='Refundable')throw new Error('Not Refundable; expire independently first');
if(action==='expire'&&(!['Funded','Submitted'].includes(status)||BigInt(block.timestamp)<order.deadline))throw new Error('Not expired');
if((await stat(walletFile)).mode&0o077)throw new Error('Wallet must have mode 600 or stricter');
const release=await acquireLock(journal);let releaseGlobal:(()=>Promise<void>)|undefined;let globalPath:string|undefined;let globalReservation:Spend|undefined;
async function globalAppend(row:Spend){const file=await open(globalPath!,'a',0o600);try{if((await file.stat()).mode&0o077)throw Error('Global ledger mode600 required');await file.write(JSON.stringify(row)+'\n');await file.sync();}finally{await file.close();}const folder=await open(dirname(globalPath!),'r');try{await folder.sync();}finally{await folder.close();}}
try {
const secret=JSON.parse(await readFile(walletFile,'utf8'));if(secret.project!=='purser-relay-arc'||secret.scope!==(local?'LOCAL_ONLY':'ARC_MAINNET_5042'))throw new Error('Wallet project/scope mismatch; old testnet keys forbidden');const wallet=new Wallet(secret.privateKey,provider);
const globalLedger=opt('--global-ledger'),approvalFile=opt('--approval'),actionId=opt('--action-id');if(mainnet&&(!globalLedger||!approvalFile||!actionId))throw Error('Mainnet recovery requires same global ledger, human approval, and unique actionId');
let globalRows:Spend[]=[];let globalPlan:object|undefined;if(globalLedger||approvalFile||actionId){if(!globalLedger||!approvalFile||!actionId)throw Error('All global approval/ledger/actionId flags required');const af=await realpath(approvalFile);if(af.startsWith(root+'/')||((await stat(af)).mode&0o077))throw Error('Private mode600 approval outside repo required');const approval=JSON.parse(await readFile(af,'utf8'));globalPlan={actionId,action,rpc,from:wallet.address,to:contract,orderId:id,runtimeHash:codehash,actionCap18:cap};checkApproval(approval,globalPlan,local);if(!approval.roleAddresses.map((x:string)=>address(x)).includes(wallet.address))throw Error('Unapproved recovery role');globalPath=await canonicalPrivatePath(globalLedger,root);if(globalPath!==await canonicalPrivatePath(approval.globalLedgerPath,root))throw Error('Approval binds a different global ledger');releaseGlobal=await acquireLock(globalPath);try{if((await stat(globalPath)).mode&0o077)throw Error('Global ledger mode600 required');const text=await readFile(globalPath,'utf8');if(text&&!text.endsWith('\n'))throw Error('Truncated global ledger');globalRows=text.trim()?text.trim().split('\n').map(x=>JSON.parse(x)):[];}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
if(action==='claimPayment'&&wallet.address.toLowerCase()!==order.payee.toLowerCase())throw new Error('Payee role required');
if(action==='claimRefund'&&wallet.address.toLowerCase()!==order.owner.toLowerCase())throw new Error('Owner role required');
let records:RecordEntry[]=[];try{records=await readJournal(journal);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(!maySign(records,id,action))throw new Error('Prior signed/unknown/confirmed action: reconcile; do not resign automatically');
const data=new Interface(abi).encodeFunctionData(action,[id]);const tx={to:contract,from:wallet.address,data,value:0n};
await provider.call(tx);const estimate=await provider.estimateGas(tx);const gasLimit=(estimate*120n+99n)/100n;
const price=BigInt(await provider.send('eth_gasPrice',[]));const maxFeePerGas=price>FEE_FLOOR?price*2n:FEE_FLOOR*2n;
const total=guardSpend({enabled:true,chain:BigInt(await provider.send('eth_chainId',[])),balance:await provider.getBalance(wallet.address),gasLimit,maxFee:maxFeePerGas,principal:0n,reserve:0n,cap:BigInt(cap)});
const beforeWallet=await provider.getBalance(wallet.address);const beforeContract=await provider.getBalance(contract);
const nonce=await provider.getTransactionCount(wallet.address,'pending');
const base={orderId:id,chainId:CHAIN_ID.toString(),contract,action,nonce,timestamp:new Date().toISOString()};
if(globalPath){const reserved=reserveSpend(globalRows,actionId!,0n,gasLimit,maxFeePerGas,beforeWallet);globalReservation={actionId:actionId!,planHash:planHash(globalPlan),reserved18:reserved.toString(),phase:'prepared',nonce,timestamp:base.timestamp};await globalAppend(globalReservation);}
await appendJournal(journal,{...base,phase:'prepared'});
const raw=await wallet.signTransaction({to:contract,data,value:0n,chainId:CHAIN_ID,nonce,gasLimit,maxFeePerGas,maxPriorityFeePerGas:0n,type:2});const txHash=keccak256(raw);
// Private raw is fsynced before broadcast. Never put this directory into public evidence.
await mkdir(dirname(journal),{recursive:true,mode:0o700});const rawFile=await open(`${journal}.${txHash}.raw`,'wx',0o600);try{await rawFile.write(raw);await rawFile.sync();}finally{await rawFile.close();}
await appendJournal(journal,{...base,phase:'signed',txHash});if(globalReservation){globalReservation={...globalReservation,phase:'signed',txHash};await globalAppend(globalReservation);}
try {
 await provider.broadcastTransaction(raw);await appendJournal(journal,{...base,phase:'broadcast',txHash});if(globalReservation){globalReservation={...globalReservation,phase:'broadcast'};await globalAppend(globalReservation);}
 let receipt=await provider.getTransactionReceipt(txHash);for(let probe=0;!receipt&&probe<60;probe++){await new Promise(resolve=>setTimeout(resolve,1000));receipt=await provider.getTransactionReceipt(txHash);}if(!receipt)throw new Error('Missing receipt');
 const confirmedBlock=await provider.getBlock(receipt.blockNumber);if(confirmedBlock?.hash!==receipt.blockHash)throw new Error('Block mismatch');
 const after=await instance.getOrder(id,{blockTag:receipt.blockNumber});const expected=action==='claimPayment'?4:action==='expire'?5:6;
 const eventName=action==='claimPayment'?'PaymentClaimed':action==='expire'?'OrderExpired':'RefundClaimed';const iface=new Interface(abi);const events=receipt.logs.filter(l=>l.address.toLowerCase()===contract.toLowerCase()).map(l=>{try{return iface.parseLog(l);}catch{return null;}}).filter(e=>e?.name===eventName);const event=events[0];const amount=action==='expire'?after.credit:order.credit;const role=action==='claimPayment'?order.payee:order.owner;
if(receipt.status!==1||Number(after.status)!==expected||events.length!==1||!event||event.args[0]!==id||event.args[1].toLowerCase()!==role.toLowerCase()||event.args[2]!==amount||after.credit!==(action==='expire'?order.principal:0n))throw new Error('Receipt/event/order/role/amount/credit mismatch');
const fee=receipt.gasUsed*receipt.gasPrice;const [afterWallet,afterContract]=await Promise.all([provider.getBalance(wallet.address,receipt.blockNumber),provider.getBalance(contract,receipt.blockNumber)]);const transfer=action==='expire'?0n:order.credit;
if(afterWallet-beforeWallet!==transfer-fee||beforeContract-afterContract!==transfer)throw new Error('Balance/fee mismatch: UNKNOWN');
 await appendJournal(journal,{...base,phase:'confirmed',txHash});if(globalReservation){globalReservation={...globalReservation,phase:'confirmed'};await globalAppend(globalReservation);}
 console.log(JSON.stringify({status:'CONFIRMED',action,txHash,gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.gasPrice.toString(),actualFee18:(receipt.gasUsed*receipt.gasPrice).toString(),cap18:total.toString()}));
} catch(error) {if(globalReservation)await globalAppend({...globalReservation,phase:'unknown'});await appendJournal(journal,{...base,phase:'unknown',txHash});throw new Error(`UNKNOWN; stop and reconcile ${txHash}: ${String(error)}`);}

} finally {if(releaseGlobal)await releaseGlobal();await release();}
