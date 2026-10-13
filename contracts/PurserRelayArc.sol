// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Native USDC escrow on Arc. Owner approval is a trusted acceptance decision.
/// No admin, upgrade, fees, arbitration or quality oracle. Amounts use native 18 decimals.
contract PurserRelayArc {
    enum Status { None, Funded, Submitted, Approved, Claimed, Refundable, Refunded }
    struct Order {
        address owner;
        address payee;
        address workerA;
        address workerB;
        bytes32 requestHash;
        bytes32 acceptanceRuleHash;
        bytes32 deliverableHash;
        uint256 principal;
        uint64 deadline;
        uint64 authorityEpoch;
        uint64 submittedEpoch;
        uint64 submittedAt;
        address submitter;
        Status status;
        uint256 credit;
    }
    mapping(bytes32 => Order) private orders;
    mapping(bytes32 => mapping(address => bool)) public everAuthorized;
    uint256 public totalPrincipal;
    uint256 public totalLocked;
    uint256 public totalApproved;
    uint256 public totalClaimed;
    uint256 public totalRefunded;
    uint256 private entered;

    error InvalidInput();
    error DuplicateIntent();
    error Unauthorized();
    error WrongState();
    error Expired();
    error NotExpired();
    error EpochMismatch();
    error HashMismatch();
    error TransferFailed();
    error Reentrancy();

    event OrderCreated(bytes32 indexed orderId, address indexed owner, address indexed payee, bytes32 intent, bytes32 requestHash, bytes32 acceptanceRuleHash, uint256 principal, uint64 deadline, address workerA, address workerB);
    event WorkerReplaced(bytes32 indexed orderId, address indexed oldWorker, address indexed newWorker, uint64 epoch);
    event WorkerRevoked(bytes32 indexed orderId, address indexed worker, uint64 epoch);
    event DeliverableSubmitted(bytes32 indexed orderId, address indexed worker, bytes32 requestHash, bytes32 deliverableHash, uint64 epoch);
    event OrderApproved(bytes32 indexed orderId, address indexed payee, bytes32 deliverableHash, bytes32 acceptanceRuleHash, uint256 credit);
    event PaymentClaimed(bytes32 indexed orderId, address indexed payee, uint256 amount);
    event OrderExpired(bytes32 indexed orderId, address indexed owner, uint256 credit);
    event RefundClaimed(bytes32 indexed orderId, address indexed owner, uint256 amount);

    modifier nonReentrant() { if (entered != 0) revert Reentrancy(); entered = 1; _; entered = 0; }

    function computeOrderId(address owner, bytes32 intent) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), owner, intent));
    }
    function getOrder(bytes32 id) external view returns (Order memory) { return orders[id]; }
    function liabilities() public view returns (uint256) { return totalLocked + totalApproved; }
    function surplus() external view returns (uint256) { return address(this).balance - liabilities(); }
    function accounting(bytes32 id) external view returns (uint256 unapprovedLocked, uint256 approvedUnclaimed, uint256 payeeClaimed, uint256 ownerRefunded) {
        Order storage o = orders[id];
        if (o.status == Status.Funded || o.status == Status.Submitted || o.status == Status.Refundable) unapprovedLocked = o.principal;
        else if (o.status == Status.Approved) approvedUnclaimed = o.credit;
        else if (o.status == Status.Claimed) payeeClaimed = o.principal;
        else if (o.status == Status.Refunded) ownerRefunded = o.principal;
    }
    function createOrder(bytes32 intent, bytes32 requestHash, bytes32 acceptanceRuleHash, address payee, uint256 principal, uint64 deadline, address workerA, address workerB) external payable nonReentrant returns (bytes32 id) {
        if (intent == 0 || requestHash == 0 || acceptanceRuleHash == 0 || payee == address(0) || principal == 0 || msg.value != principal || deadline <= block.timestamp || workerA == address(0) || workerB == address(0) || workerA == workerB) revert InvalidInput();
        id = computeOrderId(msg.sender, intent);
        if (orders[id].status != Status.None) revert DuplicateIntent();
        orders[id] = Order(msg.sender, payee, workerA, workerB, requestHash, acceptanceRuleHash, 0, principal, deadline, 1, 0, 0, address(0), Status.Funded, 0);
        everAuthorized[id][workerA] = true;
        everAuthorized[id][workerB] = true;
        totalPrincipal += principal;
        totalLocked += principal;
        emit OrderCreated(id, msg.sender, payee, intent, requestHash, acceptanceRuleHash, principal, deadline, workerA, workerB);
    }
    function _editable(bytes32 id) private view returns (Order storage o) {
        o = orders[id];
        if (msg.sender != o.owner) revert Unauthorized();
        if (o.status != Status.Funded) revert WrongState();
        if (block.timestamp >= o.deadline) revert Expired();
    }
    function replaceWorker(bytes32 id, address oldWorker, address newWorker) external nonReentrant {
        Order storage o = _editable(id);
        if (newWorker == address(0) || everAuthorized[id][newWorker]) revert InvalidInput();
        if (oldWorker == o.workerA && oldWorker != address(0)) o.workerA = newWorker;
        else if (oldWorker == o.workerB && oldWorker != address(0)) o.workerB = newWorker;
        else revert Unauthorized();
        everAuthorized[id][newWorker] = true;
        o.authorityEpoch++;
        emit WorkerReplaced(id, oldWorker, newWorker, o.authorityEpoch);
    }
    function revokeWorker(bytes32 id, address worker) external nonReentrant {
        Order storage o = _editable(id);
        if (worker == o.workerA && worker != address(0)) o.workerA = address(0);
        else if (worker == o.workerB && worker != address(0)) o.workerB = address(0);
        else revert Unauthorized();
        o.authorityEpoch++;
        emit WorkerRevoked(id, worker, o.authorityEpoch);
    }
    function submitDeliverable(bytes32 id, uint64 epoch, bytes32 requestHash, bytes32 deliverableHash) external nonReentrant {
        Order storage o = orders[id];
        if (o.status != Status.Funded) revert WrongState();
        if (block.timestamp >= o.deadline) revert Expired();
        if (msg.sender != o.workerA && msg.sender != o.workerB) revert Unauthorized();
        if (epoch != o.authorityEpoch) revert EpochMismatch();
        if (requestHash != o.requestHash || deliverableHash == 0) revert HashMismatch();
        o.deliverableHash = deliverableHash;
        o.submitter = msg.sender;
        o.submittedEpoch = epoch;
        o.submittedAt = uint64(block.timestamp);
        o.status = Status.Submitted;
        emit DeliverableSubmitted(id, msg.sender, requestHash, deliverableHash, epoch);
    }
    function approve(bytes32 id, bytes32 deliverableHash, bytes32 acceptanceRuleHash) external nonReentrant {
        Order storage o = orders[id];
        if (msg.sender != o.owner) revert Unauthorized();
        if (o.status != Status.Submitted) revert WrongState();
        if (block.timestamp >= o.deadline) revert Expired();
        if (deliverableHash != o.deliverableHash || acceptanceRuleHash != o.acceptanceRuleHash) revert HashMismatch();
        o.status = Status.Approved;
        o.credit = o.principal;
        totalLocked -= o.principal;
        totalApproved += o.principal;
        emit OrderApproved(id, o.payee, deliverableHash, acceptanceRuleHash, o.principal);
    }
    function claimPayment(bytes32 id) external nonReentrant {
        Order storage o = orders[id];
        if (msg.sender != o.payee) revert Unauthorized();
        if (o.status != Status.Approved) revert WrongState();
        uint256 amount = o.credit;
        o.credit = 0;
        o.status = Status.Claimed;
        totalApproved -= amount;
        totalClaimed += amount;
        (bool ok,) = payable(o.payee).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit PaymentClaimed(id, o.payee, amount);
    }
    function expire(bytes32 id) external nonReentrant {
        Order storage o = orders[id];
        if (o.status != Status.Funded && o.status != Status.Submitted) revert WrongState();
        if (block.timestamp < o.deadline) revert NotExpired();
        o.status = Status.Refundable;
        o.credit = o.principal;
        emit OrderExpired(id, o.owner, o.principal);
    }
    function claimRefund(bytes32 id) external nonReentrant {
        Order storage o = orders[id];
        if (msg.sender != o.owner) revert Unauthorized();
        if (o.status != Status.Refundable) revert WrongState();
        uint256 amount = o.credit;
        o.credit = 0;
        o.status = Status.Refunded;
        totalLocked -= amount;
        totalRefunded += amount;
        (bool ok,) = payable(o.owner).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RefundClaimed(id, o.owner, amount);
    }
}
