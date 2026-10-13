// Read-only deployment estimate. No wallet access, signing, or broadcast.
import { readFile } from 'node:fs/promises';
import { JsonRpcProvider, getAddress } from 'ethers';
import { CHAIN_ID, FEE_FLOOR, budget, formatUSDC } from '../src/model.js';
const [artifactPath, owner, rpc = 'https://rpc.mainnet.arc.io'] = process.argv.slice(2);
if (!artifactPath || !owner) throw new Error('Usage: npm run budget -- artifact.json OWNER [RPC]');
const provider = new JsonRpcProvider(rpc);
if (BigInt(await provider.send('eth_chainId',[])) !== CHAIN_ID) throw new Error('Wrong chain');
const artifact = JSON.parse(await readFile(artifactPath,'utf8'));
const data = artifact.bytecode.object.startsWith('0x') ? artifact.bytecode.object : '0x'+artifact.bytecode.object;
const from = getAddress(owner);
const [gas, price, balance] = await Promise.all([provider.estimateGas({from,data,value:0n}),provider.send('eth_gasPrice',[]).then(BigInt),provider.getBalance(from)]);
const maxFee = price > FEE_FLOOR ? price * 2n : FEE_FLOOR * 2n;
const gasLimit = (gas*120n+99n)/100n;
console.log(JSON.stringify({readOnly:true,chainId:CHAIN_ID.toString(),from,gasEstimate:gas.toString(),gasLimit:gasLimit.toString(),maxFeePerGas:maxFee.toString(),deploymentCap18:budget(gasLimit,maxFee).toString(),deploymentCapUSDC:formatUSDC(budget(gasLimit,maxFee)),balance18:balance.toString(),balanceUSDC:formatUSDC(balance),observedAt:new Date().toISOString()},null,2));
