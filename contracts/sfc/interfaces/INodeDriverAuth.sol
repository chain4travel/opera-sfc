// SPDX-License-Identifier: MIT

pragma solidity ^0.5.0;

interface INodeDriverAuth {
    function incBalance(address acc, uint256 diff) external;

    function updateValidatorWeight(uint256 validatorID, uint256 value) external;

    function updateValidatorPubkey(uint256 validatorID, bytes calldata pubkey) external;
}
