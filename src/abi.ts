export const ABI = [
 'function createOrder(bytes32 intent,bytes32 requestHash,bytes32 acceptanceRuleHash,address payee,uint256 principal,uint64 deadline,address workerA,address workerB) payable returns (bytes32)',
 'function replaceWorker(bytes32,address,address)', 'function revokeWorker(bytes32,address)',
 'function submitDeliverable(bytes32,uint64,bytes32,bytes32)', 'function approve(bytes32,bytes32,bytes32)',
 'function claimPayment(bytes32)', 'function expire(bytes32)', 'function claimRefund(bytes32)',
] as const;
