pragma solidity >=0.4.24 <0.7.0;


/**
 * @title Initializable
 *
 * @dev Helper contract to support initializer functions. To use it, replace
 * the constructor with a function that has the `initializer` modifier.
 * WARNING: Unlike constructors, initializer functions must be manually
 * invoked. This applies both to deploying an Initializable contract, as well
 * as extending an Initializable contract via inheritance.
 * WARNING: When used with inheritance, manual care must be taken to not invoke
 * a parent initializer twice, or ensure that all initializers are idempotent,
 * because this is not dealt with automatically as with constructors.
 */
contract Initializable {

  /**
   * @dev Indicates that the contract is in the process of being initialized.
   */
  uint256 private constant INITIALIZING = 1;

  /**
   * @dev Indicates that the contract has been initialized.
   */
  uint256 private constant INITIALIZED = 2;

  uint256 private state = 0;

  /**
   * @dev Modifier to use in the initializer function of a contract.
   */
  modifier initializer() {
    require((state & INITIALIZING) != 0|| isConstructor() || (state & INITIALIZED) == 0, "Initializable: already initialized");

    bool isTopLevelCall = (state & INITIALIZING) == 0;
    if (isTopLevelCall) {
      state = INITIALIZING | INITIALIZED;
    }

    _;

    if (isTopLevelCall) {
      state &= ~INITIALIZING;
    }
  }

  /// @dev Returns true if and only if the function is running in the constructor
  function isConstructor() private view returns (bool) {
    // extcodesize checks the size of the code stored in an address, and
    // address returns the current address. Since the code is still not
    // deployed when running a constructor, any checks on its code size will
    // yield zero, making it an effective way to detect if a contract is
    // under construction or not.
    address self = address(this);
    uint256 cs;
    assembly { cs := extcodesize(self) }
    return cs == 0;
  }

  // Reserved storage space to allow for layout changes in the future.
  uint256[50] private ______gap;
}
