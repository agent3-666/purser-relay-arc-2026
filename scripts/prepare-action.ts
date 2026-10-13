// Public-data-only preflight. This tool never opens wallets, signs, or broadcasts.
import {readFile} from 'node:fs/promises';import {Contract,Interface,JsonRpcProvider} from 'ethers';
import {verifyChain} from '../src/chain.js';import {address,hash,CHAIN_ID,FEE_FLOOR,budget} from '../src/model.js';
const [planPath]=process.argv.slice(2);if(!planPath)throw new Error('Usage: tsx scripts/prepare-action.ts public-action-plan.json');
const p=JSON.parse(await readFile(planPath,'utf8'));const provider=new JsonRpcProvider(p.rpc??'https://rpc.mainnet.arc.io');
await verifyChain(provider,p.contract,p.codehash);const abi=JSON.parse(await readFile(new URL('../contracts/abi.json',import.meta.url),'utf8'));
const allowed=['createOrder','replaceWorker','revokeWorker','submitDeliverable','approve','claimPayment','expire','claimRefund'];if(!allowed.includes(p.action))throw new Error('Unsupported action');
const data=new Interface(abi).encodeFunctionData(p.action,p.args);const value=BigInt(p.value18??'0');if(value<0n)throw new Error('Negative value');if(p.action!=='createOrder'&&value!==0n)throw new Error('Unexpected principal');if(p.action==='createOrder'&&value!==BigInt(p.args[4]))throw new Error('Exact principal required');
const tx={from:address(p.from),to:address(p.contract),data,value};await provider.call(tx);const estimate=await provider.estimateGas(tx);
const gasLimit=(estimate*120n+99n)/100n;const price=BigInt(await provider.send('eth_gasPrice',[]));const maxFeePerGas=price>FEE_FLOOR?price*2n:FEE_FLOOR*2n;
const reserve=BigInt(p.reserve18??'0');const upper=budget(gasLimit,maxFeePerGas,value,reserve);const balance=await provider.getBalance(p.from);
console.log(JSON.stringify({readOnly:true,chainId:CHAIN_ID.toString(),action:p.action,from:tx.from,to:tx.to,data,value18:value.toString(),gasEstimate:estimate.toString(),gasLimit:gasLimit.toString(),maxFeePerGas:maxFeePerGas.toString(),reserve18:reserve.toString(),totalCap18:upper.toString(),balance18:balance.toString(),sufficient:balance>=upper,observedAt:new Date().toISOString()},null,2));
