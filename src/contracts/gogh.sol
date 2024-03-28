// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount)
        external
        returns (bool);
    function allowance(address owner, address spender)
        external
        view
        returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool);
}

library SafeMath {
  function mul(uint256 a, uint256 b) internal pure returns (uint256 c) {
    if (a == 0) {
      return 0;
    }
    c = a * b;
    assert(c / a == b);
    return c;
  }
  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    return a / b;
  }
  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    assert(b <= a);
    return a - b;
  }
  function add(uint256 a, uint256 b) internal pure returns (uint256 c) {
    c = a + b;
    assert(c >= a);
    return c;
  }
}

struct Escrow{
    uint256 uid;
    address escrowId;
    address token;
    uint256 amount;
    address recipient;
    address owner;
    bool released;
    bool canceled;
}

contract Gogh {
    using SafeMath for uint256;
    address admin;
    address beneficiary;
    uint256 fee = 0;
    bool enabled = false;
    bool entry = false;
    mapping(uint256 => mapping(address => address)) hasEscrow;
    mapping(address => uint256) nonces;
    mapping(address => Escrow) escrows;
    mapping(address => mapping(address => uint256)) balances;
    mapping(address => mapping(address => uint256)) inEscrow;
    mapping(address => bool) tokens;
    event created(uint256 _uid, address _escrowId, address _owner, address _recipient, address _token, uint256 _amount);
    event released(address _escrowId, address _owner, address _recipient, uint256 _amount, address _token, bytes _ownerSignature, bytes _recipientSignature);
    event canceled(address _escrowId, address _owner, address _recipient, uint256 _amount);
    event tokenState(address _token, bool _enabled);
    event contractState(bool _enabled);
    event feeState(uint256 _fee);
    event withdrawDetails(address _client, uint256 _amount);
    event depositDetails(address _client, uint256 _amount);
    event ownership(address _admin);
    event beneficiaryState(address _beneficiary);
    event emergencyWithdrawDetails(address _token, uint256 _amount);

    modifier onlyAdmin {
        require(msg.sender == admin);
        _;
    }

    modifier reentrancy {
        require(entry == false);
        entry = true;
        _;
        entry = false;
    }

    constructor() payable {
        admin = msg.sender;
        beneficiary = address(0xCA430AD5C04Afe38A4388e88A67Ca35fd405b773);
    }

    function createEscrow(uint256 _uid, address _recipient, address _token, uint256 _amount) public payable reentrancy {
        require(tokens[_token] == true, "Error: token is currently disabled.");
        require(enabled == true, "Error: contract is currently disabled.");
        require(hasEscrow[_uid][msg.sender] == address(0), "Error: your escrow for this product is already active.");
        uint256 userNonce = nonces[msg.sender];
        address escrowId = createEscrowId(userNonce, _recipient, _token, _amount, msg.sender);
        require(escrows[escrowId].owner == address(0x0), "Error: escrow already exists.");
        Escrow memory newEscrow = Escrow(_uid, escrowId, _token, _amount, _recipient, msg.sender, false, false);
        inEscrow[msg.sender][_token] = inEscrow[msg.sender][_token].add(_amount);
        _escrow(newEscrow);
        nonces[msg.sender]++;
        deposit(_token, _amount);
        hasEscrow[_uid][msg.sender] = escrowId;
        emit created(_uid, escrowId, msg.sender, _recipient, _token, _amount);
    }

    function _escrow(Escrow memory _escrowData) private {
        escrows[_escrowData.escrowId] = _escrowData;
    }

    function releaseEscrow(address _escrowId, bytes memory _ownerSignature, bytes memory _recipientSignature) public reentrancy {
        require(enabled == true, "Error: contract is currently disabled.");
        require(escrows[_escrowId].recipient == msg.sender || escrows[_escrowId].owner == msg.sender || msg.sender == admin, "Error: invalid escrow, or sender is not escrow owner or administrator.");
        require(escrows[_escrowId].canceled == false, "Error: escrow has already been canceled.");
        require(escrows[_escrowId].released == false, "Error: escrow has already been released.");
        Escrow memory escrow = escrows[_escrowId];
        require(validateSignatures(escrow, _ownerSignature, _recipientSignature) == true, "Error: signatures mismatch.");
        uint256 earnedBalance = escrow.amount;
        if(fee > 0){
            uint256 houseFee = earnedBalance.div(100).mul(fee);
            earnedBalance = earnedBalance.sub(houseFee);
        }
        escrow.released = true;
        balances[escrow.recipient][escrow.token] = balances[escrow.recipient][escrow.token].add(earnedBalance);
        inEscrow[escrow.owner][escrow.token] = inEscrow[escrow.owner][escrow.token].sub(escrow.amount);
        withdraw(escrow);
        emit released(escrow.escrowId, escrow.owner, escrow.recipient, escrow.amount, escrow.token, _ownerSignature, _recipientSignature);
    }

    function cancelEscrow(address _escrowId) public reentrancy {
        require(enabled == true, "Error: contract is currently disabled.");
        require(escrows[_escrowId].owner == msg.sender || msg.sender == admin, "Error: invalid escrow, or sender is not escrow owner or administrator.");
        require(escrows[_escrowId].released == false, "Error: escrow has already been released.");
        escrows[_escrowId].canceled = true;
        Escrow memory escrow = escrows[_escrowId];
        require(tokens[escrow.token] == true, "Error: token is currently disabled.");
        balances[escrow.owner][escrow.token] = balances[escrow.owner][escrow.token].add(escrows[_escrowId].amount);
        inEscrow[msg.sender][escrow.token] = inEscrow[msg.sender][escrow.token].sub(escrow.amount);
        if(escrow.token == address(0x0)){
            payable(escrow.owner).transfer(escrow.amount);
        } else {
            IERC20(escrow.token).transfer(escrow.owner, escrow.amount);   
        }
        emit canceled(escrow.escrowId, escrow.owner, escrow.recipient, escrow.amount);
    }

    function getEscrowDetails(address _escrowId) public view returns(Escrow memory){
        require(enabled == true, "Error: contract is currently disabled.");
        return escrows[_escrowId];
    }

    function getBalance(address _token, address _client) public view returns(uint256) {
        return balances[_client][_token];
    }

    function createEscrowId(uint256 _userNonce, address _recipient, address _token, uint256 _amount, address _owner) private view returns(address) {
        return address(uint160(uint(keccak256(abi.encodePacked(blockhash(block.number), block.timestamp, _userNonce,  _recipient, _token, _amount, _owner)))));
    }

    function deposit(address _token, uint256 _amount) private {
        require(tokens[_token] == true, "Error: token is currently disabled.");
        require(enabled == true, "Error: contract is currently disabled.");
        if(_token == address(0x0)){
            require(msg.sender.balance >= _amount, "Error: insufficient funds to deposit.");
            require(msg.value >= _amount, "Error: insufficient funds to deposit.");
        } else {
            require(IERC20(_token).balanceOf(msg.sender) >= _amount, "Error: insufficient funds to deposit.");
            IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        }
        balances[msg.sender][_token] = balances[msg.sender][_token].add(_amount);
        emit depositDetails(msg.sender, _amount);
    }

    function withdraw(Escrow memory _escrowData) private {
        require(tokens[_escrowData.token] == true, "Error: token is currently disabled.");
        require(enabled == true, "Error: contract is currently disabled.");
        uint256 earnedBalance = _escrowData.amount;
        uint256 houseFee = 0;
        if(fee > 0){
            houseFee = earnedBalance.div(100).mul(fee);
            earnedBalance = earnedBalance.sub(houseFee); 
        }
        require(balances[_escrowData.recipient][_escrowData.token] >= earnedBalance, "Error: not enough balance in the contract.");
        balances[_escrowData.recipient][_escrowData.token] = balances[_escrowData.recipient][_escrowData.token].sub(earnedBalance);
        if(_escrowData.token == address(0x0)){
            payable(_escrowData.recipient).transfer(earnedBalance);
            if(fee > 0){
                payable(beneficiary).transfer(houseFee);
            }
        } else {
            IERC20(_escrowData.token).transfer(_escrowData.recipient, earnedBalance);  
            if(fee > 0){
                IERC20(_escrowData.token).transfer(beneficiary, houseFee); 
            }
        }
        emit withdrawDetails(_escrowData.recipient, _escrowData.amount);
    }
    
    function validateSignatures(Escrow memory _escrowData,  bytes memory _ownerSignature, bytes memory _recipientSignature) public pure returns(bool){
        bytes32 escrowMessagePayload = keccak256(abi.encode(_escrowData.escrowId, _escrowData.token, _escrowData.amount, _escrowData.recipient, _escrowData.owner));
        bytes32 escrowMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", escrowMessagePayload));
        address signerOwnerSignature = recoverSigner(escrowMessageHash, _ownerSignature);
        address signerRecipientSignature = recoverSigner(escrowMessageHash, _recipientSignature);
        if(signerOwnerSignature != _escrowData.owner){
            return false;
        }
        if(signerRecipientSignature != _escrowData.recipient){
            return false;
        }
        return true;
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature
    ) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        public
        pure
        returns (bytes32 r, bytes32 s, uint8 v)
    {
        require(sig.length == 65, "Error: invalid signature length.");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    function emergencyWithdraw(address _token) public onlyAdmin reentrancy {
        if(_token == address(0x0)){
            payable(admin).transfer(address(this).balance);
            emit emergencyWithdrawDetails(_token, address(this).balance);
        } else {
            IERC20(_token).transfer(admin, IERC20(_token).balanceOf(address(this)));
            emit emergencyWithdrawDetails(_token, IERC20(_token).balanceOf(address(this)));
        }
        tokens[_token] = false;
    }

    function transferOwner(address _admin) public onlyAdmin {
        admin = _admin;
        emit ownership(_admin);
    }

    function disable() public onlyAdmin {
        enabled = false;
        emit contractState(false);
    }

    function enable() public onlyAdmin {
        enabled = true;
        emit contractState(true);
    }

    function enableToken(address _token) public onlyAdmin {
        tokens[_token] = true;
        emit tokenState(_token, true);
    }

    function disableToken(address _token) public onlyAdmin {
        tokens[_token] = false;
        emit tokenState(_token, false);
    }

    function changeFee(uint256 _fee) public onlyAdmin {
        fee = _fee;
        emit feeState(_fee);
    }

    function setBeneficiary(address _beneficiary) public onlyAdmin {
        beneficiary = _beneficiary;
        emit beneficiaryState(_beneficiary);
    }
}