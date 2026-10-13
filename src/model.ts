import { AbiCoder, getAddress, keccak256 } from 'ethers';
export const CHAIN_ID = 5042n;
export const FEE_FLOOR = 20_000_000_000n;
export const UNIT = 10n ** 18n;
export function parseUSDC(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value)) throw new Error('Use a nonnegative decimal string with at most 18 places');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(18, '0'));
}
export function formatUSDC(value: bigint): string {
  if (value < 0n) throw new Error('Negative amount');
  const fraction = (value % UNIT).toString().padStart(18, '0').replace(/0+$/, '');
  return `${value / UNIT}${fraction ? '.' + fraction : ''}`;
}
export function erc20ViewToNative(value: bigint): bigint { if (value < 0n) throw new Error('Negative amount'); return value * 10n ** 12n; }
export function hash(value: string): string { if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid bytes32'); return value.toLowerCase(); }
export function address(value: string): string { const a = getAddress(value); if (a === '0x0000000000000000000000000000000000000000') throw new Error('Zero address'); return a; }
export function orderId(contract: string, owner: string, intent: string, chain = CHAIN_ID): string {
 return keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address','address','bytes32'], [chain,address(contract),address(owner),hash(intent)]));
}
export interface Handoff { schema: 'purser-arc-v1'; chainId: string; contract: string; codehash: string; owner: string; intent: string; orderId: string; requestHash: string; acceptanceRuleHash: string; payee: string; principal18: string; deadline: string; authorityEpoch: string; }
export function validateHandoff(h: Handoff, expected: {contract: string; codehash: string; orderId: string; epoch: bigint; owner:string; requestHash:string; acceptanceRuleHash:string; payee:string; principal:bigint; deadline:bigint}): void {
 if (h.schema !== 'purser-arc-v1' || h.chainId !== CHAIN_ID.toString()) throw new Error('Wrong schema/chain');
 if (address(h.contract) !== address(expected.contract) || hash(h.codehash) !== hash(expected.codehash)) throw new Error('Wrong deployment domain');
 if (hash(h.orderId) !== hash(expected.orderId) || hash(h.orderId) !== orderId(h.contract,h.owner,h.intent)) throw new Error('Wrong order domain');
 if (!/^[1-9][0-9]*$/.test(h.authorityEpoch) || BigInt(h.authorityEpoch) !== expected.epoch) throw new Error('Stale authority epoch');
 if(address(h.owner)!==address(expected.owner)||address(h.payee)!==address(expected.payee)||hash(h.requestHash)!==hash(expected.requestHash)||hash(h.acceptanceRuleHash)!==hash(expected.acceptanceRuleHash))throw new Error('Immutable owner/payee/request/rule mismatch');
 if (!/^[1-9][0-9]*$/.test(h.principal18) || !/^[1-9][0-9]*$/.test(h.deadline) || BigInt(h.principal18)>=(1n<<256n) || BigInt(h.deadline)>=(1n<<64n) || BigInt(h.authorityEpoch)>=(1n<<64n)) throw new Error('Invalid principal/deadline/epoch bounds');
 if(BigInt(h.principal18)!==expected.principal||BigInt(h.deadline)!==expected.deadline)throw new Error('Immutable principal/deadline mismatch');
}
export function budget(gasLimit: bigint, maxFeePerGas: bigint, principal = 0n, reserve = 0n): bigint {
 if (gasLimit <= 0n || maxFeePerGas < FEE_FLOOR || principal < 0n || reserve < 0n) throw new Error('Invalid gas floor or budget');
 return gasLimit * maxFeePerGas + principal + reserve;
}
export function guardSpend(input: {enabled: boolean; chain: bigint; balance: bigint; gasLimit: bigint; maxFee: bigint; principal: bigint; reserve: bigint; cap: bigint}): bigint {
 if (!input.enabled || input.chain !== CHAIN_ID) throw new Error('Mainnet spending disabled or wrong chain');
 const total = budget(input.gasLimit,input.maxFee,input.principal,input.reserve);
 if (total > input.cap || total > input.balance) throw new Error('Budget cap/balance exceeded'); return total;
}
