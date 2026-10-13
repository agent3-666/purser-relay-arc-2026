import { JsonRpcProvider, keccak256 } from 'ethers';
import { address, CHAIN_ID, hash } from './model.js';
export async function verifyChain(provider: JsonRpcProvider, contract: string, expectedHash: string): Promise<{codehash: string; block: number}> {
 const chain = BigInt(await provider.send('eth_chainId',[])); if (chain !== CHAIN_ID) throw new Error('Wrong chain: UNKNOWN');
 const block = await provider.getBlockNumber(); const code = await provider.getCode(address(contract),block);
 if (code === '0x' || keccak256(code) !== hash(expectedHash)) throw new Error('Wrong codehash: UNKNOWN');
 return {codehash:keccak256(code),block};
}
// Inclusion-only diagnostic. INCLUDED_UNVERIFIED is never a payment or delivery confirmation.
export async function reconcileReceipt(provider: JsonRpcProvider, txHash: string, contract: string): Promise<object> {
 try {
 const receipt = await provider.getTransactionReceipt(hash(txHash)); if (!receipt) return {status:'UNKNOWN',reason:'Missing receipt; never create a replacement intent automatically'};
 const block = await provider.getBlock(receipt.blockNumber); if (!block || block.hash !== receipt.blockHash) return {status:'UNKNOWN',reason:'Receipt block mismatch'};
 if (receipt.to?.toLowerCase() !== address(contract).toLowerCase()) return {status:'UNKNOWN',reason:'Wrong target'};
 return {status:receipt.status === 1 ? 'INCLUDED_UNVERIFIED':'INCLUDED_REVERTED',txHash,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.gasPrice.toString(),fee18:(receipt.gasUsed*receipt.gasPrice).toString(),businessLogs:receipt.logs.filter(l=>l.address.toLowerCase()===contract.toLowerCase()).map(l=>({topics:l.topics,data:l.data}))};
 } catch {return {status:'UNKNOWN',reason:'RPC unavailable or malformed; no automatic retry/payment'};}
}
