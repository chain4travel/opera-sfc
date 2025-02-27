const {
    BN,
    expectRevert,
} = require('openzeppelin-test-helpers');
const chai = require('chai');
const { expect } = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const UnitTestSFC = artifacts.require('UnitTestSFC');
const SFC = artifacts.require('SFC');
const StakersConstants = artifacts.require('StakersConstants');
const NodeDriverAuth = artifacts.require('NodeDriverAuth');
const NodeDriver = artifacts.require('NodeDriver');
const NetworkInitializer = artifacts.require('NetworkInitializer');
const StubEvmWriter = artifacts.require('StubEvmWriter');
const LegacySfcWrapper = artifacts.require('LegacySfcWrapper');

function amount18(n) {
    return new BN(web3.utils.toWei(n, 'ether'));
}

async function sealEpoch(sfc, duration, _validatorsMetrics = undefined) {
    let validatorsMetrics = _validatorsMetrics;
    const validatorIDs = (await sfc.lastValidatorID()).toNumber();

    if (validatorsMetrics === undefined) {
        validatorsMetrics = {};
        for (let i = 0; i < validatorIDs; i++) {
            validatorsMetrics[i] = {
                offlineTime: new BN('0'),
                offlineBlocks: new BN('0'),
                uptime: duration,
                originatedTxsFee: amount18('0'),
            };
        }
    }
    // unpack validator metrics
    const allValidators = [];
    const offlineTimes = [];
    const offlineBlocks = [];
    const uptimes = [];
    const originatedTxsFees = [];
    for (let i = 0; i < validatorIDs; i++) {
        allValidators.push(i + 1);
        offlineTimes.push(validatorsMetrics[i].offlineTime);
        offlineBlocks.push(validatorsMetrics[i].offlineBlocks);
        uptimes.push(validatorsMetrics[i].uptime);
        originatedTxsFees.push(validatorsMetrics[i].originatedTxsFee);
    }

    await sfc.advanceTime(duration);
    await sfc.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees);
    await sfc.sealEpochValidators(allValidators);
}

class BlockchainNode {
    constructor(sfc, minter) {
        this.validators = {};
        this.nextValidators = {};
        this.sfc = sfc;
        this.minter = minter;
    }

    async handle(tx) {
        const logs = tx.receipt.rawLogs;
        for (let i = 0; i < logs.length; i += 1) {
            if (logs[i].topics[0] === web3.utils.sha3('UpdateValidatorWeight(uint256,uint256)')) {
                const validatorID = web3.utils.toBN(logs[i].topics[1]);
                const weight = web3.utils.toBN(logs[i].data);
                if (weight.isZero()) {
                    delete this.nextValidators[validatorID.toString()];
                } else {
                    this.nextValidators[validatorID.toString()] = weight;
                }
            }
        }
    }

    async sealEpoch(duration, _validatorsMetrics = undefined) {
        let validatorsMetrics = _validatorsMetrics;
        const validatorIDs = Object.keys(this.validators);
        const nextValidatorIDs = Object.keys(this.nextValidators);
        if (validatorsMetrics === undefined) {
            validatorsMetrics = {};
            for (let i = 0; i < validatorIDs.length; i += 1) {
                validatorsMetrics[validatorIDs[i].toString()] = {
                    offlineTime: new BN('0'),
                    offlineBlocks: new BN('0'),
                    uptime: duration,
                    originatedTxsFee: amount18('0'),
                };
            }
        }
        // unpack validator metrics
        const offlineTimes = [];
        const offlineBlocks = [];
        const uptimes = [];
        const originatedTxsFees = [];
        for (let i = 0; i < validatorIDs.length; i += 1) {
            offlineTimes.push(validatorsMetrics[validatorIDs[i].toString()].offlineTime);
            offlineBlocks.push(validatorsMetrics[validatorIDs[i].toString()].offlineBlocks);
            uptimes.push(validatorsMetrics[validatorIDs[i].toString()].uptime);
            originatedTxsFees.push(validatorsMetrics[validatorIDs[i].toString()].originatedTxsFee);
        }

        await this.sfc.advanceTime(duration);
        await this.handle(await this.sfc.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees));
        await this.handle(await this.sfc.sealEpochValidators(nextValidatorIDs));
        this.validators = this.nextValidators;
        // clone this.nextValidators
        this.nextValidators = {};
        for (const vid in this.validators) {
            this.nextValidators[vid] = this.validators[vid];
        }
    }
}

const pubkey = '0x00a2941866e485442aa6b17d67d77f8a6c4580bb556894cc1618473eff1e18203d8cce50b563cf4c75e408886079b8f067069442ed52e2ac9e556baa3f8fcc525f';

takeSnapshot = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_snapshot',
      id: new Date().getTime()
    }, (err, snapshotId) => {
      if (err) { return reject(err) }
      return resolve(snapshotId)
    })
  })
}

revertToSnapshot = (id) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_revert',
      params: [id],
      id: new Date().getTime()
    }, (err, result) => {
      if (err) { console.log("err!!!!", err); return reject(err) }
      return resolve(result)
    })
  })
}

/*
contract('SFC', async (accounts) => {
    let legacySfcWrapper;
    beforeEach(async () => {
        legacySfcWrapper = await LegacySfcWrapper.new();
    });

    describe('LegacySfcWrapper', () => {
        it('Should return minStake', async () => {
            const minStake = (await legacySfcWrapper.minStake());
            expect(minStake.toString()).to.equal('3175000000000000000000000');
        });

        it('Should return minStakeIncrease', async () => {
            const minStakeIncrease = (await legacySfcWrapper.minStakeIncrease());
            expect(minStakeIncrease.toString()).to.equal('1');
        });

        it('Should return minStakeDecrease', async () => {
            const minStakeDecrease = (await legacySfcWrapper.minStakeDecrease());
            expect(minStakeDecrease.toString()).to.equal('1');
        });

        it('Should return minDelegation', async () => {
            const minDelegation = (await legacySfcWrapper.minDelegation());
            expect(minDelegation.toString()).to.equal('1');
        });

        it('Should return minDelegationIncrease', async () => {
            const minDelegationIncrease = (await legacySfcWrapper.minDelegationIncrease());
            expect(minDelegationIncrease.toString()).to.equal('1');
        });

        it('Should return minDelegationDecrease', async () => {
            const minDelegationDecrease = (await legacySfcWrapper.minDelegationDecrease());
            expect(minDelegationDecrease.toString()).to.equal('1');
        });

        it('Should return stakeLockPeriodTime', async () => {
            const stakeLockPeriodTime = (await legacySfcWrapper.stakeLockPeriodTime());
            expect(stakeLockPeriodTime.toString()).to.equal('3');
        });

        it('Should return stakeLockPeriodEpochs', async () => {
            const stakeLockPeriodEpochs = (await legacySfcWrapper.stakeLockPeriodEpochs());
            expect(stakeLockPeriodEpochs.toString()).to.equal('3');
        });

        it('Should return delegationLockPeriodTime', async () => {
            const delegationLockPeriodTime = (await legacySfcWrapper.delegationLockPeriodTime());
            expect(delegationLockPeriodTime.toString()).to.equal('604800');
        });

        it('Should return delegationLockPeriodEpochs', async () => {
            const delegationLockPeriodEpochs = (await legacySfcWrapper.delegationLockPeriodEpochs());
            expect(delegationLockPeriodEpochs.toString()).to.equal('3');
        });

        it('Should return isStakeLockedUp', async () => {
            const isStakeLockedUp = (await legacySfcWrapper.isStakeLockedUp(0));
            expect(isStakeLockedUp).to.equal(false);
        });

        it('Should return isDelegationLockedUp', async () => {
            const isDelegationLockedUp = (await legacySfcWrapper.isDelegationLockedUp(accounts[1], 0));
            expect(isDelegationLockedUp).to.equal(false);
        });

        it('Should return delegationsTotalAmount', async () => {
            const delegationsTotalAmount = (await legacySfcWrapper.delegationsTotalAmount());
            expect(delegationsTotalAmount).to.bignumber.equal(new BN(0));
        });

        it('Should return stakersLastID', async () => {
            const stakersLastID = (await legacySfcWrapper.stakersLastID());
            expect(stakersLastID).to.bignumber.equal(new BN(0));
        });

        it('Should return stakersNum', async () => {
            const stakersNum = (await legacySfcWrapper.stakersNum());
            expect(stakersNum).to.bignumber.equal(new BN(0));
        });

        it('Should return delegationsNum', async () => {
            const delegationsNum = (await legacySfcWrapper.delegationsNum());
            expect(delegationsNum).to.bignumber.equal(new BN(0));
        });

        it('Should return delegations', async () => {
            const delegations = (await legacySfcWrapper.delegations(accounts[0], 0));

            expect(delegations.hasOwnProperty('createdEpoch')).to.equal(true);
            expect(delegations.hasOwnProperty('createdTime')).to.equal(true);
            expect(delegations.hasOwnProperty('deactivatedEpoch')).to.equal(true);
            expect(delegations.hasOwnProperty('deactivatedTime')).to.equal(true);
            expect(delegations.hasOwnProperty('amount')).to.equal(true);
            expect(delegations.hasOwnProperty('paidUntilEpoch')).to.equal(true);
            expect(delegations.hasOwnProperty('toStakerID')).to.equal(true);
        });

        it('Should return stakers', async () => {
            const stakers = (await legacySfcWrapper.stakers(0));
            expect(stakers.hasOwnProperty('status')).to.equal(true);
            expect(stakers.hasOwnProperty('createdEpoch')).to.equal(true);
            expect(stakers.hasOwnProperty('createdTime')).to.equal(true);
            expect(stakers.hasOwnProperty('deactivatedEpoch')).to.equal(true);
            expect(stakers.hasOwnProperty('deactivatedTime')).to.equal(true);
            expect(stakers.hasOwnProperty('stakeAmount')).to.equal(true);
            expect(stakers.hasOwnProperty('paidUntilEpoch')).to.equal(true);
            expect(stakers.hasOwnProperty('delegatedMe')).to.equal(true);
            expect(stakers.hasOwnProperty('dagAddress')).to.equal(true);
            expect(stakers.hasOwnProperty('sfcAddress')).to.equal(true);
        });

        it('Should return getStakerID', async () => {
            const getStakerID = (await legacySfcWrapper.getStakerID(accounts[0]));
            expect(getStakerID).to.bignumber.equal(new BN(0));
        });

        it('Should return lockedDelegations', async () => {
            const lockedDelegations = (await legacySfcWrapper.lockedDelegations(accounts[0], 0));
            expect(lockedDelegations.hasOwnProperty('fromEpoch')).to.equal(true);
            expect(lockedDelegations.hasOwnProperty('endTime')).to.equal(true);
            expect(lockedDelegations.hasOwnProperty('duration')).to.equal(true);
        });

        it('Should return lockedStakes', async () => {
            const lockedStakes = (await legacySfcWrapper.lockedStakes(0));
            expect(lockedStakes.hasOwnProperty('fromEpoch')).to.equal(true);
            expect(lockedStakes.hasOwnProperty('endTime')).to.equal(true);
            expect(lockedStakes.hasOwnProperty('duration')).to.equal(true);
        });

        it('Should create Delegation', async () => {
            await expectRevert(legacySfcWrapper.createDelegation(0), 'validator doesn\'t exist');
        });

        it('Should return calcDelegationRewards', async () => {
            const calcDelegationRewards = (await legacySfcWrapper.calcDelegationRewards(accounts[0], 0, 0, 0));
            expect(calcDelegationRewards[0]).to.bignumber.equal(new BN(0));
            expect(calcDelegationRewards[1]).to.bignumber.equal(new BN(0));
            expect(calcDelegationRewards[2]).to.bignumber.equal(new BN(0));
        });

        it('Should return calcValidatorRewards', async () => {
            const calcValidatorRewards = (await legacySfcWrapper.calcValidatorRewards(0, 0, 0));
            expect(calcValidatorRewards[0]).to.bignumber.equal(new BN(0));
            expect(calcValidatorRewards[1]).to.bignumber.equal(new BN(0));
            expect(calcValidatorRewards[2]).to.bignumber.equal(new BN(0));
        });

        it('Should claim Delegation Rewards', async () => {
            await expectRevert(legacySfcWrapper.claimDelegationRewards(0, 0), 'zero rewards');
        });

        it('Should claim Delegation Compound Rewards', async () => {
            await expectRevert(legacySfcWrapper.claimDelegationCompoundRewards(0, 0), 'zero rewards');
        });

        it('Should claim Validator Rewards', async () => {
            await expectRevert(legacySfcWrapper.claimValidatorRewards(0), 'zero rewards');
        });

        it('Should claim Validator Compound Rewards', async () => {
            await expectRevert(legacySfcWrapper.claimValidatorCompoundRewards(0), 'zero rewards');
        });

        it('Should fail preparing to withdraw stake', async () => {
            await expectRevert(legacySfcWrapper.prepareToWithdrawStake(), 'use SFCv3 undelegate() function');
        });

        it('Should fail preparing to withdraw stake partial', async () => {
            await expectRevert(legacySfcWrapper.prepareToWithdrawStakePartial(0, 10), 'not enough unlocked stake');
        });

        it('Should fail withdrawing stake', async () => {
            await expectRevert(legacySfcWrapper.withdrawStake(), 'use SFCv3 withdraw() functio');
        });

        it('Should fail preparing to withdraw delegation partial', async () => {
            await expectRevert(legacySfcWrapper.prepareToWithdrawDelegation(0), 'use SFCv3 undelegate() function');
        });

        it('Should fail preparing to withdraw delegation partial', async () => {
            await expectRevert(legacySfcWrapper.prepareToWithdrawDelegationPartial(0, 0, 10), 'not enough unlocked stake');
        });

        it('Should fail to withdraw delegation partial', async () => {
            await expectRevert(legacySfcWrapper.withdrawDelegation(0), 'use SFCv3 withdraw() function');
        });

        it('Should fail to partially withdraw by request', async () => {
            await expectRevert(legacySfcWrapper.partialWithdrawByRequest(0), 'use SFCv3 withdraw() function');
        });

        it('Should fail to lock up stake', async () => {
            await expectRevert(legacySfcWrapper.lockUpStake(64000), 'zero amount');
        });

        it('Should fail to lock up delegation', async () => {
            await expectRevert(legacySfcWrapper.lockUpDelegation(64000, 0), 'zero amount');
        });
    });

    describe('Test minSelfStake from StakersConstants', () => {
        it('Check minSelfStake', async () => {
            this.sfc = await StakersConstants.new();
            expect((await this.sfc.minSelfStake()).toString()).to.equals('3175000000000000000000000');
        });
    });
});
*/

contract('SFC', async ([account1, account2]) => {
    let nodeIRaw;
    let snapshotId;
    before('Deploy...', async () => {
        this.sfc = await UnitTestSFC.new();
        nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(12, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, account1);
	const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    })


    describe('Nde', () => {
        it('Should migrate to New address', async () => {
            await this.nodeI.migrateTo(account1, { from: account1 });
        });

        it('Should not migrate if not owner', async () => {
            await expectRevert(this.nodeI.migrateTo(account2, { from: account2 }), 'Ownable: caller is not the owner');
        });

        it('Should not copyCode if not owner', async () => {
            await expectRevert(this.nodeI.copyCode('0x0000000000000000000000000000000000000000', account1, { from: account2 }), 'Ownable: caller is not the owner');
        });

        it('Should copyCode', async () => {
            await this.nodeI.copyCode(this.sfc.address, account1, { from: account1 });
        });

        it('Should update network version', async () => {
            await this.nodeI.updateNetworkVersion(1, { from: account1 });
        });

        it('Should not update network version if not owner', async () => {
            await expectRevert(this.nodeI.updateNetworkVersion(1, { from: account2 }), 'Ownable: caller is not the owner');
        });

        it('Should advance epoch', async () => {
            await this.nodeI.advanceEpochs(1, { from: account1 });
        });

        it('Should not set a new storage if not backend address', async () => {
            await expectRevert(nodeIRaw.setStorage(account1, web3.utils.soliditySha3('testKey'), web3.utils.soliditySha3('testValue'), { from: account1 }), 'caller is not the backend');
        });

        it('Should not advance epoch if not owner', async () => {
            await expectRevert(this.nodeI.advanceEpochs(1, { from: account2 }), 'Ownable: caller is not the owner');
        });

        it('Should not set backend if not backend address', async () => {
            await expectRevert(nodeIRaw.setBackend('0x0000000000000000000000000000000000000000', { from: account1 }), 'caller is not the backend');
        });

        it('Should not swap code if not backend address', async () => {
            await expectRevert(nodeIRaw.swapCode('0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', { from: account1 }), 'caller is not the backend');
        });

        it('Should not be possible add a Genesis Validator through NodeDriver if not called by Node', async () => {
            await expectRevert(nodeIRaw.setGenesisValidator(account1, 1, pubkey, 0, await this.sfc.currentEpoch(), Date.now(), 0, 0), 'not callable');
        });

        it('Should not be possible to deactivate a validator through NodeDriver if not called by Node', async () => {
            await expectRevert(nodeIRaw.deactivateValidator(0, 1), 'not callable');
        });

        it('Should not be possible to add a Genesis Delegation through NodeDriver if not called by node', async () => {
            await expectRevert(nodeIRaw.setGenesisDelegation(account2, 1, 100, 0, 0, 0, 0, 0, 1000), 'not callable');
        });

        it('Should not be possible to seal Epoch Validators through NodeDriver if not called by node', async () => {
            await expectRevert(nodeIRaw.sealEpochValidators([0, 1]), 'not callable');
        });

        it('Should not be possible to seal Epoch through NodeDriver if not called by node', async () => {
            await expectRevert(nodeIRaw.sealEpoch([0, 1], [0, 1], [0, 1], [0, 1]), 'not callable');
        });
    });

    describe('Genesis Validator', () => {
        beforeEach(async () => {
            await this.sfc.enableNonNodeCalls();
            await expect(this.sfc.setGenesisValidator(account1, 1, pubkey, 1 << 3, await this.sfc.currentEpoch(), Date.now(), 0, 0)).to.be.fulfilled;
            await this.sfc.disableNonNodeCalls();
        });

        it('Set Genesis Validator with bad Status', async () => {
            await expect(this.sfc._syncValidator(1, false)).to.be.fulfilled;
        });

        it('should reject sealEpoch if not called by Node', async () => {
            await expect(this.sfc.sealEpoch([1], [1], [1], [1], {
                from: account1,
            })).to.be.rejectedWith('caller is not the NodeDriverAuth contract');
        });

        it('should reject SealEpochValidators if not called by Node', async () => {
            await expect(this.sfc.sealEpochValidators([1], {
                from: account1,
            })).to.be.rejectedWith('caller is not the NodeDriverAuth contract');
        });
    });
});

contract('SFC', async ([firstValidator, secondValidator, thirdValidator]) => {

    let snapshotId;
    before('Deploy', async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.rebaseTime();
        this.node = new BlockchainNode(this.sfc, firstValidator);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    })


    describe('Basic functions', () => {
        describe('Constants', () => {
            it('Returns current Epoch', async () => {
                expect((await this.sfc.currentEpoch()).toString()).to.equals('1');
            });

            it('Returns minimum amount to stake for a Validator', async () => {
                expect((await this.sfc.minSelfStake()).toString()).to.equals('317500000000000000');
            });

            it('Returns the maximum ratio of delegations a validator can have', async () => {
                expect((await this.sfc.maxDelegatedRatio()).toString()).to.equals('16000000000000000000');
            });

            it('Returns commission fee in percentage a validator will get from a delegation', async () => {
                expect((await this.sfc.validatorCommission()).toString()).to.equals('150000000000000000');
            });

            it('Returns commission fee in percentage a validator will get from a contract', async () => {
                expect((await this.sfc.contractCommission()).toString()).to.equals('300000000000000000');
            });

            it('Returns the ratio of the reward rate at base rate (without lockup)', async () => {
                expect((await this.sfc.unlockedRewardRatio()).toString()).to.equals('300000000000000000');
            });

            it('Returns the minimum duration of a stake/delegation lockup', async () => {
                expect((await this.sfc.minLockupDuration()).toString()).to.equals('1209600');
            });

            it('Returns the maximum duration of a stake/delegation lockup', async () => {
                expect((await this.sfc.maxLockupDuration()).toString()).to.equals('31536000');
            });

            it('Returns the period of time that stake is locked', async () => {
                expect((await this.sfc.withdrawalPeriodTime()).toString()).to.equals('604800');
            });

            it('Returns the number of epochs that stake is locked', async () => {
                expect((await this.sfc.withdrawalPeriodEpochs()).toString()).to.equals('3');
            });

            it('Returns the version of the current implementation', async () => {
                expect((await this.sfc.version()).toString()).to.equals('0x333032');
            });

            it('Should create a Validator and return the ID', async () => {
                await this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: amount18('10'),
                });
                const lastValidatorID = await this.sfc.lastValidatorID();

                expect(lastValidatorID.toString()).to.equals('1');
            });

            it('Should fail to create a Validator insufficient self-stake', async () => {
                await expectRevert(this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: 1,
                }), 'insufficient self-stake');
            });

            it('Should fail if pubkey is empty', async () => {
                await expectRevert(this.sfc.createValidator(web3.utils.stringToHex(''), {
                    from: secondValidator,
                    value: amount18('10'),
                }), 'empty pubkey');
            });

            it('Should create two Validators and return the correct last validator ID', async () => {
                let lastValidatorID;
                await this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: amount18('10'),
                });
                lastValidatorID = await this.sfc.lastValidatorID();

                expect(lastValidatorID.toString()).to.equals('1');

                await this.sfc.createValidator(pubkey, {
                    from: thirdValidator,
                    value: amount18('12'),
                });
                lastValidatorID = await this.sfc.lastValidatorID();
                expect(lastValidatorID.toString()).to.equals('2');
            });

            it('Should return Delegation', async () => {
                await this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: amount18('10'),
                });
                (await this.sfc.delegate(1, { from: secondValidator, value: 1 }));
            });

            it('Should reject if amount is insufficient for self-stake', async () => {
                expect((await this.sfc.minSelfStake()).toString()).to.equals('317500000000000000');
                await expect(this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: amount18('0.3'),
                })).to.be.rejectedWith('Error: Revert (message: insufficient self-stake)');
            });

            it('Returns current Epoch', async () => {
                expect((await this.sfc.currentEpoch()).toString()).to.equals('1');
            });

            it('Should return current Sealed Epoch', async () => {
                expect((await this.sfc.currentSealedEpoch()).toString()).to.equals('0');
            });

            it('Should return Now()', async () => {
                const now = Math.trunc((Date.now()) / 1000);
                expect((await this.sfc.getBlockTime()).toNumber()).to.be.within(now - 100, now + 100);
            });

            it('Should return getTime()', async () => {
                const now = Math.trunc((Date.now()) / 1000);
                expect((await this.sfc.getTime()).toNumber()).to.be.within(now - 100, now + 100);
            });
        });

        describe('Initialize', () => {
            it('Should have been initialized with firstValidator', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
            });
        });

        describe('Ownable', () => {
            it('Should return the owner of the contract', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
            });

            it('Should return true if the caller is the owner of the contract', async () => {
                expect(await this.sfc.isOwner()).to.equals(true);
                expect(await this.sfc.isOwner({ from: thirdValidator })).to.equals(false);
            });

            it('Should return address(0) if owner leaves the contract without owner', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
                expect(await this.sfc.renounceOwnership());
                expect(await this.sfc.owner()).to.equals('0x0000000000000000000000000000000000000000');
            });

            it('Should transfer ownership to the new owner', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
                expect(await this.sfc.transferOwnership(secondValidator));
                expect(await this.sfc.owner()).to.equals(secondValidator);
            });

            it('Should not be able to transfer ownership if not owner', async () => {
                await expect(this.sfc.transferOwnership(secondValidator, { from: secondValidator })).to.be.rejectedWith(Error);
            });

            it('Should not be able to transfer ownership to address(0)', async () => {
                await expect(this.sfc.transferOwnership('0x0000000000000000000000000000000000000000')).to.be.rejectedWith(Error);
            });
        });

        describe('Events emitters', () => {
            it('Should call updateNetworkRules', async () => {
                await this.nodeI.updateNetworkRules('0x7b22446167223a7b224d6178506172656e7473223a357d2c2245636f6e6f6d79223a7b22426c6f636b4d6973736564536c61636b223a377d2c22426c6f636b73223a7b22426c6f636b476173486172644c696d6974223a313030307d7d');
            });

            it('Should call updateOfflinePenaltyThreshold', async () => {
                await this.sfc.updateOfflinePenaltyThreshold(1, 10);
            });
        });
    });
});

contract('SFC', async ([firstValidator, secondValidator, thirdValidator, firstDelegator, secondDelegator, thirdDelegator]) => {
    let snapshotId;
    before('Depoy', async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(10, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.rebaseTime();
        this.node = new BlockchainNode(this.sfc, firstValidator);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    })

    describe('Prevent Genesis Call if not node', () => {
        it('Should not be possible add a Genesis Validator if called not by node', async () => {
            await expect(this.sfc.setGenesisValidator(secondValidator, 1, pubkey, 0, await this.sfc.currentEpoch(), Date.now(), 0, 0)).to.be.rejectedWith('caller is not the NodeDriverAuth contract');
        });

        it('Should not be possible add a Genesis Delegation if called not by node', async () => {
            await expect(this.sfc.setGenesisDelegation(firstDelegator, 1, 100, 0, 0, 0, 0, 0, 1000)).to.be.rejectedWith('caller is not the NodeDriverAuth contract');
        });
    });

    describe('Create validators', () => {
        it('Should create Validators', async () => {
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;
            await expect(this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('15'),
            })).to.be.fulfilled;
            await expect(this.sfc.createValidator(pubkey, {
                from: thirdValidator,
                value: amount18('20'),
            })).to.be.fulfilled;
        });

        it('Should return the right ValidatorID by calling getValidatorID', async () => {
            expect((await this.sfc.getValidatorID(firstValidator)).toString()).to.equals('0');
            expect((await this.sfc.getValidatorID(secondValidator)).toString()).to.equals('0');
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;
            expect((await this.sfc.getValidatorID(firstValidator)).toString()).to.equals('1');
            await expect(this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('15'),
            })).to.be.fulfilled;
            expect((await this.sfc.getValidatorID(secondValidator)).toString()).to.equals('2');
            await expect(this.sfc.createValidator(pubkey, {
                from: thirdValidator,
                value: amount18('20'),
            })).to.be.fulfilled;
            expect((await this.sfc.getValidatorID(thirdValidator)).toString()).to.equals('3');
        });

        it('Should not be able to stake if Validator not created yet', async () => {
            const err = 'Error: Revert (message: validator doesn\'t exist)';
            await expect(this.sfc.delegate(1, {
                from: firstDelegator,
                value: amount18('10'),
            })).to.be.rejectedWith(err);
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;

            await expect(this.sfc.delegate(2, {
                from: secondDelegator,
                value: amount18('10'),
            })).to.be.rejectedWith(err);
            await expect(this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('15'),
            })).to.be.fulfilled;

            await expect(this.sfc.delegate(3, {
                from: thirdDelegator,
                value: amount18('10'),
            })).to.be.rejectedWith(err);
            await expect(this.sfc.createValidator(pubkey, {
                from: thirdValidator,
                value: amount18('20'),
            })).to.be.fulfilled;
        });

        it('Should stake with different delegators', async () => {
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;
            expect(await this.sfc.delegate(1, { from: firstDelegator, value: amount18('11') }));

            await expect(this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('15'),
            })).to.be.fulfilled;
            expect(await this.sfc.delegate(2, { from: secondDelegator, value: amount18('10') }));

            await expect(this.sfc.createValidator(pubkey, {
                from: thirdValidator,
                value: amount18('20'),
            })).to.be.fulfilled;
            expect(await this.sfc.delegate(3, { from: thirdDelegator, value: amount18('10') }));
            expect(await this.sfc.delegate(1, { from: firstDelegator, value: amount18('10') }));
        });

        it('Should return the amount of delegated for each Delegator', async () => {
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;
            await this.sfc.delegate(1, { from: firstDelegator, value: amount18('11') });
            expect((await this.sfc.getStake(firstDelegator, await this.sfc.getValidatorID(firstValidator))).toString()).to.equals('11000000000000000000');

            await expect(this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('15'),
            })).to.be.fulfilled;
            await this.sfc.delegate(2, { from: secondDelegator, value: amount18('10') });
            expect((await this.sfc.getStake(secondDelegator, await this.sfc.getValidatorID(firstValidator))).toString()).to.equals('0');
            expect((await this.sfc.getStake(secondDelegator, await this.sfc.getValidatorID(secondValidator))).toString()).to.equals('10000000000000000000');

            await expect(this.sfc.createValidator(pubkey, {
                from: thirdValidator,
                value: amount18('12'),
            })).to.be.fulfilled;
            await this.sfc.delegate(3, { from: thirdDelegator, value: amount18('10') });
            expect((await this.sfc.getStake(thirdDelegator, await this.sfc.getValidatorID(thirdValidator))).toString()).to.equals('10000000000000000000');

            await this.sfc.delegate(3, { from: firstDelegator, value: amount18('10') });

            expect((await this.sfc.getStake(thirdDelegator, await this.sfc.getValidatorID(firstValidator))).toString()).to.equals('0');
            expect((await this.sfc.getStake(firstDelegator, await this.sfc.getValidatorID(thirdValidator))).toString()).to.equals('10000000000000000000');
            await this.sfc.delegate(3, { from: firstDelegator, value: amount18('1') });
            expect((await this.sfc.getStake(firstDelegator, await this.sfc.getValidatorID(thirdValidator))).toString()).to.equals('11000000000000000000');
        });

        it('Should return the total of received Stake', async () => {
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;
            await this.sfc.delegate(1, { from: firstDelegator, value: amount18('11') });
            await this.sfc.delegate(1, { from: secondDelegator, value: amount18('8') });
            await this.sfc.delegate(1, { from: thirdDelegator, value: amount18('8') });
            const validator = await this.sfc.getValidator(1);

            expect(validator.receivedStake.toString()).to.equals('37000000000000000000');
        });

        it('Should return the total of received Stake', async () => {
            await expect(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('10'),
            })).to.be.fulfilled;
            await this.sfc.delegate(1, { from: firstDelegator, value: amount18('11') });
            await this.sfc.delegate(1, { from: secondDelegator, value: amount18('8') });
            await this.sfc.delegate(1, { from: thirdDelegator, value: amount18('8') });
            const validator = await this.sfc.getValidator(1);

            expect(validator.receivedStake.toString()).to.equals('37000000000000000000');
        });
    });
});

contract('SFC', async ([firstValidator, secondValidator, thirdValidator, firstDelegator, secondDelegator, thirdDelegator]) => {

    let snapshotId;
    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    describe('Returns Validator', () => {
        let validator;
        before('Deploy', async () => {
            this.sfc = await UnitTestSFC.new();
            const nodeIRaw = await NodeDriver.new();
            const evmWriter = await StubEvmWriter.new();
            this.nodeI = await NodeDriverAuth.new();
            const initializer = await NetworkInitializer.new();
            await initializer.initializeAll(12, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
            await this.sfc.rebaseTime();
            await this.sfc.enableNonNodeCalls();
            this.node = new BlockchainNode(this.sfc, firstValidator);
            await expect(this.sfc.createValidator(pubkey, { from: firstValidator, value: amount18('10') })).to.be.fulfilled;
            await this.sfc.delegate(1, { from: firstDelegator, value: amount18('11') });
            await this.sfc.delegate(1, { from: secondDelegator, value: amount18('8') });
            await this.sfc.delegate(1, { from: thirdDelegator, value: amount18('8') });
            validator = await this.sfc.getValidator(1);

            const snapshot = await takeSnapshot();
            snapshotId = snapshot['result'];
        });

        it('Should returns Validator\' status ', async () => {
            expect(validator.status.toString()).to.equals('0');
        });

        it('Should returns Validator\' Deactivated Time', async () => {
            expect(validator.deactivatedTime.toString()).to.equals('0');
        });

        it('Should returns Validator\' Deactivated Epoch', async () => {
            expect(validator.deactivatedEpoch.toString()).to.equals('0');
        });

        it('Should returns Validator\'s Received Stake', async () => {
            expect(validator.receivedStake.toString()).to.equals('37000000000000000000');
        });

        it('Should returns Validator\'s Created Epoch', async () => {
            expect(validator.createdEpoch.toString()).to.equals('13');
        });

        it('Should returns Validator\'s Created Time', async () => {
            const now = Math.trunc((Date.now()) / 1000);
            expect(validator.createdTime.toNumber()).to.be.within(now - 5, now + 5);
        });

        it('Should returns Validator\'s Auth (address)', async () => {
            expect(validator.auth.toString()).to.equals(firstValidator);
        });
    });

    describe('EpochSnapshot', () => {
        let validator;
        before('Deploy', async () => {
            this.sfc = await UnitTestSFC.new();
            const nodeIRaw = await NodeDriver.new();
            const evmWriter = await StubEvmWriter.new();
            this.nodeI = await NodeDriverAuth.new();
            const initializer = await NetworkInitializer.new();
            await initializer.initializeAll(12, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
            await this.sfc.rebaseTime();
            await this.sfc.enableNonNodeCalls();
            this.node = new BlockchainNode(this.sfc, firstValidator);
            await expect(this.sfc.createValidator(pubkey, { from: firstValidator, value: amount18('10') })).to.be.fulfilled;
            await this.sfc.delegate(1, { from: firstDelegator, value: amount18('11') });
            await this.sfc.delegate(1, { from: secondDelegator, value: amount18('8') });
            await this.sfc.delegate(1, { from: thirdDelegator, value: amount18('8') });
            validator = await this.sfc.getValidator(1);

            const snapshot = await takeSnapshot();
            snapshotId = snapshot['result'];
        });

        it('Returns stashedRewardsUntilEpoch', async () => {
            expect(await this.sfc.currentSealedEpoch.call()).to.be.bignumber.equal(new BN('12'));
            expect(await this.sfc.currentEpoch.call()).to.be.bignumber.equal(new BN('13'));
            await this.sfc.sealEpoch([100, 101, 102], [100, 101, 102], [100, 101, 102], [100, 101, 102]);
            expect(await this.sfc.currentSealedEpoch.call()).to.be.bignumber.equal(new BN('13'));
            expect(await this.sfc.currentEpoch.call()).to.be.bignumber.equal(new BN('14'));
            await this.sfc.sealEpoch(
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
            );
            await this.sfc.sealEpoch(
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
            );
            await this.sfc.sealEpoch(
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
            );
            await this.sfc.sealEpoch(
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
                [100, 101, 102],
            );
            expect(await this.sfc.currentSealedEpoch.call()).to.be.bignumber.equal(new BN('17'));
            expect(await this.sfc.currentEpoch.call()).to.be.bignumber.equal(new BN('18'));
        });
    });
    describe('Methods tests', async () => {
        before('Deploy', async () => {
            this.sfc = await UnitTestSFC.new();
            const nodeIRaw = await NodeDriver.new();
            const evmWriter = await StubEvmWriter.new();
            this.nodeI = await NodeDriverAuth.new();
            const initializer = await NetworkInitializer.new();
            await initializer.initializeAll(10, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
            await this.sfc.rebaseTime();
            await this.sfc.enableNonNodeCalls();
            this.node = new BlockchainNode(this.sfc, firstValidator);

            const snapshot = await takeSnapshot();
            snapshotId = snapshot['result'];
        });
        it('checking createValidator function', async () => {
            expect(await this.sfc.lastValidatorID.call()).to.be.bignumber.equal(new BN('0'));
            await expectRevert(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('0.3175')
                    .sub(new BN(1)),
            }), 'insufficient self-stake');
            await this.node.handle(await this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('0.3175'),
            }));
            await expectRevert(this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('0.3175'),
            }), 'validator already exists');
            await this.node.handle(await this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('0.5'),
            }));

            expect(await this.sfc.lastValidatorID.call()).to.be.bignumber.equal(new BN('2'));
            expect(await this.sfc.totalStake.call()).to.be.bignumber.equal(amount18('0.8175'));

            const firstValidatorID = await this.sfc.getValidatorID(firstValidator);
            const secondValidatorID = await this.sfc.getValidatorID(secondValidator);
            expect(firstValidatorID).to.be.bignumber.equal(new BN('1'));
            expect(secondValidatorID).to.be.bignumber.equal(new BN('2'));

            expect(await this.sfc.getValidatorPubkey(firstValidatorID)).to.equal(pubkey);
            expect(await this.sfc.getValidatorPubkey(secondValidatorID)).to.equal(pubkey);

            const firstValidatorObj = await this.sfc.getValidator.call(firstValidatorID);
            const secondValidatorObj = await this.sfc.getValidator.call(secondValidatorID);

            // check first validator object
            expect(firstValidatorObj.receivedStake).to.be.bignumber.equal(amount18('0.3175'));
            expect(firstValidatorObj.createdEpoch).to.be.bignumber.equal(new BN('11'));
            expect(firstValidatorObj.auth).to.equal(firstValidator);
            expect(firstValidatorObj.status).to.be.bignumber.equal(new BN('0'));
            expect(firstValidatorObj.deactivatedTime).to.be.bignumber.equal(new BN('0'));
            expect(firstValidatorObj.deactivatedEpoch).to.be.bignumber.equal(new BN('0'));

            // check second validator object
            expect(secondValidatorObj.receivedStake).to.be.bignumber.equal(amount18('0.5'));
            expect(secondValidatorObj.createdEpoch).to.be.bignumber.equal(new BN('11'));
            expect(secondValidatorObj.auth).to.equal(secondValidator);
            expect(secondValidatorObj.status).to.be.bignumber.equal(new BN('0'));
            expect(secondValidatorObj.deactivatedTime).to.be.bignumber.equal(new BN('0'));
            expect(secondValidatorObj.deactivatedEpoch).to.be.bignumber.equal(new BN('0'));

            // check created delegations
            expect(await this.sfc.getStake.call(firstValidator, firstValidatorID)).to.be.bignumber.equal(amount18('0.3175'));
            expect(await this.sfc.getStake.call(secondValidator, secondValidatorID)).to.be.bignumber.equal(amount18('0.5'));

            // check fired node-related logs
            expect(Object.keys(this.node.nextValidators).length).to.equal(2);
            expect(this.node.nextValidators[firstValidatorID.toString()]).to.be.bignumber.equal(amount18('0.3175'));
            expect(this.node.nextValidators[secondValidatorID.toString()]).to.be.bignumber.equal(amount18('0.5'));
        });

        it('checking sealing epoch', async () => {
            await this.node.handle(await this.sfc.createValidator(pubkey, {
                from: firstValidator,
                value: amount18('0.3175'),
            }));
            await this.node.handle(await this.sfc.createValidator(pubkey, {
                from: secondValidator,
                value: amount18('0.6825'),
            }));

            await this.node.sealEpoch(new BN('100'));

            const firstValidatorID = await this.sfc.getValidatorID(firstValidator);
            const secondValidatorID = await this.sfc.getValidatorID(secondValidator);
            expect(firstValidatorID).to.be.bignumber.equal(new BN('1'));
            expect(secondValidatorID).to.be.bignumber.equal(new BN('2'));

            const firstValidatorObj = await this.sfc.getValidator.call(firstValidatorID);
            const secondValidatorObj = await this.sfc.getValidator.call(secondValidatorID);

            await this.node.handle(await this.sfc.delegate(firstValidatorID, {
                from: firstValidator,
                value: amount18('0.1'),
            }));
            await this.node.handle(await this.sfc.createValidator(pubkey, {
                from: thirdValidator,
                value: amount18('0.4'),
            }));
            const thirdValidatorID = await this.sfc.getValidatorID(thirdValidator);

            // check fired node-related logs
            expect(Object.keys(this.node.validators).length).to.equal(2);
            expect(this.node.validators[firstValidatorID.toString()]).to.be.bignumber.equal(amount18('0.3175'));
            expect(this.node.validators[secondValidatorID.toString()]).to.be.bignumber.equal(amount18('0.6825'));
            expect(Object.keys(this.node.nextValidators).length).to.equal(3);
            expect(this.node.nextValidators[firstValidatorID.toString()]).to.be.bignumber.equal(amount18('0.4175'));
            expect(this.node.nextValidators[secondValidatorID.toString()]).to.be.bignumber.equal(amount18('0.6825'));
            expect(this.node.nextValidators[thirdValidatorID.toString()]).to.be.bignumber.equal(amount18('0.4'));
        });
    });
});

contract('SFC', async ([firstValidator, secondValidator, thirdValidator, testValidator, firstDelegator, secondDelegator, account1, account2, account3, account4]) => {
    let firstValidatorID;
    let secondValidatorID;
    let thirdValidatorID;
    let snapshotId;

    before('Deploy', async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.rebaseTime();
        await this.sfc.enableNonNodeCalls();

        await this.sfc.createValidator(pubkey, {
            from: firstValidator,
            value: amount18('0.4'),
        });
        firstValidatorID = await this.sfc.getValidatorID(firstValidator);

        await this.sfc.createValidator(pubkey, {
            from: secondValidator,
            value: amount18('0.8'),
        });
        secondValidatorID = await this.sfc.getValidatorID(secondValidator);

        await this.sfc.createValidator(pubkey, {
            from: thirdValidator,
            value: amount18('0.8'),
        });
        thirdValidatorID = await this.sfc.getValidatorID(thirdValidator);
        await this.sfc.delegate(firstValidatorID, {
            from: firstValidator,
            value: amount18('0.4'),
        });

        await this.sfc.delegate(firstValidatorID, {
            from: firstDelegator,
            value: amount18('0.4'),
        });
        await this.sfc.delegate(secondValidatorID, {
            from: secondDelegator,
            value: amount18('0.4'),
        });

        await sealEpoch(this.sfc, (new BN(0)).toString());

        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    describe('Staking / Sealed Epoch functions', () => {
        it('Should return claimed Rewards until Epoch', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());
            expect(await this.sfc.stashedRewardsUntilEpoch(firstDelegator, 1)).to.bignumber.equal(new BN(0));
            await this.sfc.claimRewards(1, { from: firstDelegator });
            expect(await this.sfc.stashedRewardsUntilEpoch(firstDelegator, 1)).to.bignumber.equal(await this.sfc.currentSealedEpoch());
        });

        it('Check pending Rewards of delegators', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('0');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('0');

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('6966');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('2754');
        });

        it('Check if pending Rewards have been increased after sealing Epoch', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());
            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('6966');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('2754');

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());
            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('13932');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('5508');
        });

        it('Should increase balances after claiming Rewards', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('100000000000000'));

            await sealEpoch(this.sfc, (new BN(0)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            const firstDelegatorPendingRewards = await this.sfc.pendingRewards(firstDelegator, firstValidatorID);
            expect(firstDelegatorPendingRewards).to.be.bignumber.equal(amount18('0.2754'));
            const firstDelegatorBalance = new BN(await web3.eth.getBalance(firstDelegator));

            await this.sfc.claimRewards(1, { from: firstDelegator });

            const delegatorBalance = new BN(await web3.eth.getBalance(firstDelegator));
            expect(firstDelegatorBalance.add(firstDelegatorPendingRewards)).to.be.bignumber.above(delegatorBalance);
            expect(firstDelegatorBalance.add(firstDelegatorPendingRewards)).to.be.bignumber.below(delegatorBalance.add(amount18('0.01')));
        });

        it('Should increase stake after restaking Rewards', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(0)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            const firstDelegatorPendingRewards = await this.sfc.pendingRewards(firstDelegator, firstValidatorID);
            expect(firstDelegatorPendingRewards).to.be.bignumber.equal(new BN('2754'));
            const firstDelegatorStake = await this.sfc.getStake(firstDelegator, firstValidatorID);
            const firstDelegatorLockupInfo = await this.sfc.getLockupInfo(firstDelegator, firstValidatorID);

            await this.sfc.restakeRewards(1, { from: firstDelegator });

            const delegatorStake = await this.sfc.getStake(firstDelegator, firstValidatorID);
            const delegatorLockupInfo = await this.sfc.getLockupInfo(firstDelegator, firstValidatorID);
            expect(delegatorStake).to.be.bignumber.equal(firstDelegatorStake.add(firstDelegatorPendingRewards));
            expect(delegatorLockupInfo.lockedStake).to.be.bignumber.equal(firstDelegatorLockupInfo.lockedStake);
        });

        it('Should increase locked stake after restaking Rewards', async () => {
            await this.sfc.lockStake(firstValidatorID, new BN(86400 * 219 + 10), amount18('0.2'), {
                from: firstValidator,
            });
            await this.sfc.lockStake(firstValidatorID, new BN(86400 * 219), amount18('0.2'), {
                from: firstDelegator,
            });

            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(0)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            const firstDelegatorPendingRewards = await this.sfc.pendingRewards(firstDelegator, firstValidatorID);
            expect(firstDelegatorPendingRewards).to.be.bignumber.equal(new BN('4681'));
            const firstDelegatorPendingLockupRewards = new BN('3304');
            const firstDelegatorStake = await this.sfc.getStake(firstDelegator, firstValidatorID);
            const firstDelegatorLockupInfo = await this.sfc.getLockupInfo(firstDelegator, firstValidatorID);

            await this.sfc.restakeRewards(1, { from: firstDelegator });

            const delegatorStake = await this.sfc.getStake(firstDelegator, firstValidatorID);
            const delegatorLockupInfo = await this.sfc.getLockupInfo(firstDelegator, firstValidatorID);
            expect(delegatorStake).to.be.bignumber.equal(firstDelegatorStake.add(firstDelegatorPendingRewards));
            expect(delegatorLockupInfo.lockedStake).to.be.bignumber.equal(firstDelegatorLockupInfo.lockedStake.add(firstDelegatorPendingLockupRewards));
        });

        it('Should return stashed Rewards', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(0)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            expect((await this.sfc.rewardsStash(firstDelegator, 1)).toString()).to.equals('0');

            await this.sfc.stashRewards(firstDelegator, 1);
            expect((await this.sfc.rewardsStash(firstDelegator, 1)).toString()).to.equals('2754');
        });

        it('Should update the validator on node', async () => {
            await this.sfc.updateOfflinePenaltyThreshold(1000, 500);
            const tx = (await this.sfc.offlinePenaltyThreshold());

            const offlinePenaltyThresholdBlocksNum = (tx[0]);
            const offlinePenaltyThresholdTime = (tx[1]);
            expect(offlinePenaltyThresholdTime).to.bignumber.equals(new BN(500));
            expect(offlinePenaltyThresholdBlocksNum).to.bignumber.equals(new BN(1000));
        });

        it('Should not be able to deactivate validator if not Node', async () => {
            await this.sfc.disableNonNodeCalls();
            await expect(this.sfc.deactivateValidator(1, 0)).to.be.rejectedWith('caller is not the NodeDriverAuth contract');
        });

        it('Should seal Epochs', async () => {
            let validatorsMetrics;
            const validatorIDs = (await this.sfc.lastValidatorID()).toNumber();

            if (validatorsMetrics === undefined) {
                validatorsMetrics = {};
                for (let i = 0; i < validatorIDs; i++) {
                    validatorsMetrics[i] = {
                        offlineTime: new BN('0'),
                        offlineBlocks: new BN('0'),
                        uptime: new BN(24 * 60 * 60).toString(),
                        originatedTxsFee: amount18('100'),
                    };
                }
            }
            const allValidators = [];
            const offlineTimes = [];
            const offlineBlocks = [];
            const uptimes = [];
            const originatedTxsFees = [];
            for (let i = 0; i < validatorIDs; i++) {
                allValidators.push(i + 1);
                offlineTimes.push(validatorsMetrics[i].offlineTime);
                offlineBlocks.push(validatorsMetrics[i].offlineBlocks);
                uptimes.push(validatorsMetrics[i].uptime);
                originatedTxsFees.push(validatorsMetrics[i].originatedTxsFee);
            }

            await expect(this.sfc.advanceTime(new BN(24 * 60 * 60).toString())).to.be.fulfilled;
            await expect(this.sfc.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees)).to.be.fulfilled;
            await expect(this.sfc.sealEpochValidators(allValidators)).to.be.fulfilled;
        });

        it('Should seal Epoch on Validators', async () => {
            let validatorsMetrics;
            const validatorIDs = (await this.sfc.lastValidatorID()).toNumber();

            if (validatorsMetrics === undefined) {
                validatorsMetrics = {};
                for (let i = 0; i < validatorIDs; i++) {
                    validatorsMetrics[i] = {
                        offlineTime: new BN('0'),
                        offlineBlocks: new BN('0'),
                        uptime: new BN(24 * 60 * 60).toString(),
                        originatedTxsFee: amount18('0'),
                    };
                }
            }
            const allValidators = [];
            const offlineTimes = [];
            const offlineBlocks = [];
            const uptimes = [];
            const originatedTxsFees = [];
            for (let i = 0; i < validatorIDs; i++) {
                allValidators.push(i + 1);
                offlineTimes.push(validatorsMetrics[i].offlineTime);
                offlineBlocks.push(validatorsMetrics[i].offlineBlocks);
                uptimes.push(validatorsMetrics[i].uptime);
                originatedTxsFees.push(validatorsMetrics[i].originatedTxsFee);
            }

            await expect(this.sfc.advanceTime(new BN(24 * 60 * 60).toString())).to.be.fulfilled;
            await expect(this.sfc.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees)).to.be.fulfilled;
            await expect(this.sfc.sealEpochValidators(allValidators)).to.be.fulfilled;
        });
    });

    describe('Stake lockup', () => {
        beforeEach('lock stakes', async () => {
            // Lock 75% of stake for 60% of a maximum lockup period
            // Should receive (0.3 * 0.25 + (0.3 + 0.7 * 0.6) * 0.75) / 0.3 = 2.05 times more rewards
            await this.sfc.lockStake(firstValidatorID, new BN(86400 * 219), amount18('0.6'), {
                from: firstValidator,
            });
            // Lock 25% of stake for 20% of a maximum lockup period
            // Should receive (0.3 * 0.75 + (0.3 + 0.7 * 0.2) * 0.25) / 0.3 = 1.1166 times more rewards
            await this.sfc.lockStake(firstValidatorID, new BN(86400 * 73), amount18('0.1'), {
                from: firstDelegator,
            });
        });

        // note: copied from the non-lockup tests
        it('Check pending Rewards of delegators', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('0');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('0');

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('14279');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('3074');
        });

        // note: copied from the non-lockup tests
        it('Check if pending Rewards have been increased after sealing Epoch', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());
            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('14279');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('3074');

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());
            expect((await this.sfc.pendingRewards(firstValidator, firstValidatorID)).toString()).to.equals('28558');
            expect((await this.sfc.pendingRewards(firstDelegator, firstValidatorID)).toString()).to.equals('6150');
        });

        // note: copied from the non-lockup tests
        it('Should increase balances after claiming Rewards', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(0)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            const firstDelegatorPendingRewards = await this.sfc.pendingRewards(firstDelegator, firstValidatorID);
            const firstDelegatorBalance = await web3.eth.getBalance(firstDelegator);

            await this.sfc.claimRewards(1, { from: firstDelegator });

            expect(new BN(firstDelegatorBalance + firstDelegatorPendingRewards)).to.be.bignumber.above(await web3.eth.getBalance(firstDelegator));
        });

        // note: copied from the non-lockup tests
        it('Should return stashed Rewards', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            await sealEpoch(this.sfc, (new BN(0)).toString());
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24)).toString());

            expect((await this.sfc.rewardsStash(firstDelegator, 1)).toString()).to.equals('0');

            await this.sfc.stashRewards(firstDelegator, 1);
            expect((await this.sfc.rewardsStash(firstDelegator, 1)).toString()).to.equals('3074');
        });

        it('Should return pending rewards after unlocking and re-locking', async () => {
            await this.sfc.updateBaseRewardPerSecond(new BN('1'));

            for (let i = 0; i < 2; i++) {
                const epoch = await this.sfc.currentSealedEpoch();
                // delegator 1 is still locked
                // delegator 1 should receive more rewards than delegator 2
                // validator 1 should receive more rewards than validator 2
                await sealEpoch(this.sfc, (new BN(86400 * (73))).toString());

                expect(await this.sfc.pendingRewards(firstDelegator, 1)).to.be.bignumber.equal(new BN(224496));
                expect(await this.sfc.pendingRewards(secondDelegator, 2)).to.be.bignumber.equal(new BN(201042));
                expect(await this.sfc.pendingRewards(firstValidator, 1)).to.be.bignumber.equal(new BN(1042461));
                expect(await this.sfc.pendingRewards(secondValidator, 2)).to.be.bignumber.equal(new BN(508518));

                expect(await this.sfc.highestLockupEpoch(firstDelegator, 1)).to.be.bignumber.equal(epoch.add(new BN(1)));
                expect(await this.sfc.highestLockupEpoch(secondDelegator, 2)).to.be.bignumber.equal(new BN(0));
                expect(await this.sfc.highestLockupEpoch(firstValidator, 1)).to.be.bignumber.equal(epoch.add(new BN(1)));
                expect(await this.sfc.highestLockupEpoch(secondValidator, 2)).to.be.bignumber.equal(new BN(0));

                // delegator 1 isn't locked already
                // delegator 1 should receive the same reward as delegator 2
                // validator 1 should receive more rewards than validator 2
                await sealEpoch(this.sfc, (new BN(86400 * (1))).toString());

                expect(await this.sfc.pendingRewards(firstDelegator, 1)).to.be.bignumber.equal(new BN(224496 + 2754));
                expect(await this.sfc.pendingRewards(secondDelegator, 2)).to.be.bignumber.equal(new BN(201042 + 2754));
                expect(await this.sfc.pendingRewards(firstValidator, 1)).to.be.bignumber.equal(new BN(1042461 + 14279));
                expect(await this.sfc.pendingRewards(secondValidator, 2)).to.be.bignumber.equal(new BN(508518 + 6966));
                expect(await this.sfc.highestLockupEpoch(firstDelegator, 1)).to.be.bignumber.equal(epoch.add(new BN(1)));
                expect(await this.sfc.highestLockupEpoch(firstValidator, 1)).to.be.bignumber.equal(epoch.add(new BN(2)));

                // validator 1 is still locked
                // delegator 1 should receive the same reward as delegator 2
                // validator 1 should receive more rewards than validator 2
                await sealEpoch(this.sfc, (new BN(86400 * (145))).toString());

                expect(await this.sfc.pendingRewards(firstDelegator, 1)).to.be.bignumber.equal(new BN(224496 + 2754 + 399330));
                expect(await this.sfc.pendingRewards(secondDelegator, 2)).to.be.bignumber.equal(new BN(201042 + 2754 + 399330));
                expect(await this.sfc.pendingRewards(firstValidator, 1)).to.be.bignumber.equal(new BN(1042461 + 14279 + 2070643));
                expect(await this.sfc.pendingRewards(secondValidator, 2)).to.be.bignumber.equal(new BN(508518 + 6966 + 1010070));
                expect(await this.sfc.highestLockupEpoch(firstDelegator, 1)).to.be.bignumber.equal(epoch.add(new BN(1)));
                expect(await this.sfc.highestLockupEpoch(firstValidator, 1)).to.be.bignumber.equal(epoch.add(new BN(3)));

                // validator 1 isn't locked already
                // delegator 1 should receive the same reward as delegator 2
                // validator 1 should receive the same reward as validator 2
                await sealEpoch(this.sfc, (new BN(86400 * (1))).toString());

                expect(await this.sfc.pendingRewards(firstDelegator, 1)).to.be.bignumber.equal(new BN(224496 + 2754 + 399330 + 2754));
                expect(await this.sfc.pendingRewards(secondDelegator, 2)).to.be.bignumber.equal(new BN(201042 + 2754 + 399330 + 2754));
                expect(await this.sfc.pendingRewards(firstValidator, 1)).to.be.bignumber.equal(new BN(1042461 + 14279 + 2070643 + 6966));
                expect(await this.sfc.pendingRewards(secondValidator, 2)).to.be.bignumber.equal(new BN(508518 + 6966 + 1010070 + 6966));
                expect(await this.sfc.highestLockupEpoch(firstDelegator, 1)).to.be.bignumber.equal(epoch.add(new BN(1)));
                expect(await this.sfc.highestLockupEpoch(firstValidator, 1)).to.be.bignumber.equal(epoch.add(new BN(3)));

                // re-lock both validator and delegator
                await this.sfc.lockStake(firstValidatorID, new BN(86400 * 219), amount18('0.6'), {
                    from: firstValidator,
                });
                await this.sfc.lockStake(firstValidatorID, new BN(86400 * 73), amount18('0.1'), {
                    from: firstDelegator,
                });
                // check rewards didn't change after re-locking
                expect(await this.sfc.pendingRewards(firstDelegator, 1)).to.be.bignumber.equal(new BN(224496 + 2754 + 399330 + 2754));
                expect(await this.sfc.pendingRewards(secondDelegator, 2)).to.be.bignumber.equal(new BN(201042 + 2754 + 399330 + 2754));
                expect(await this.sfc.pendingRewards(firstValidator, 1)).to.be.bignumber.equal(new BN(1042461 + 14279 + 2070643 + 6966));
                expect(await this.sfc.pendingRewards(secondValidator, 2)).to.be.bignumber.equal(new BN(508518 + 6966 + 1010070 + 6966));
                expect(await this.sfc.highestLockupEpoch(firstDelegator, 1)).to.be.bignumber.equal(new BN(0));
                expect(await this.sfc.highestLockupEpoch(firstValidator, 1)).to.be.bignumber.equal(new BN(0));
                // claim rewards to reset pending rewards
                await this.sfc.claimRewards(1, { from: firstDelegator });
                await this.sfc.claimRewards(2, { from: secondDelegator });
                await this.sfc.claimRewards(1, { from: firstValidator });
                await this.sfc.claimRewards(2, { from: secondValidator });
            }
        });
    });

    describe('NodeDriver', () => {
        it('Should not be able to call `setGenesisValidator` if not NodeDriver', async () => {
            await expectRevert(this.nodeI.setGenesisValidator(account1, 1, pubkey, 1 << 3, await this.sfc.currentEpoch(), Date.now(), 0, 0, {
                from: account2,
            }), 'caller is not the NodeDriver contract');
        });

        it('Should not be able to call `setGenesisDelegation` if not NodeDriver', async () => {
            await expectRevert(this.nodeI.setGenesisDelegation(firstDelegator, 1, 100, 0, 0, 0, 0, 0, 1000, {
                from: account2,
            }), 'caller is not the NodeDriver contract');
        });

        it('Should not be able to call `deactivateValidator` if not NodeDriver', async () => {
            await expectRevert(this.nodeI.deactivateValidator(1, 0, {
                from: account2,
            }), 'caller is not the NodeDriver contract');
        });

        it('Should not be able to call `deactivateValidator` with wrong status', async () => {
            await expectRevert(this.sfc.deactivateValidator(1, 0), 'wrong status');
        });

        it('Should deactivate Validator', async () => {
            await this.sfc.deactivateValidator(1, 1);
        });

        it('Should not be able to call `sealEpochValidators` if not NodeDriver', async () => {
            await expectRevert(this.nodeI.sealEpochValidators([1], {
                from: account2,
            }), 'caller is not the NodeDriver contract');
        });

        it('Should not be able to call `sealEpoch` if not NodeDriver', async () => {
            let validatorsMetrics;
            const validatorIDs = (await this.sfc.lastValidatorID()).toNumber();

            if (validatorsMetrics === undefined) {
                validatorsMetrics = {};
                for (let i = 0; i < validatorIDs; i++) {
                    validatorsMetrics[i] = {
                        offlineTime: new BN('0'),
                        offlineBlocks: new BN('0'),
                        uptime: new BN(24 * 60 * 60).toString(),
                        originatedTxsFee: amount18('0'),
                    };
                }
            }
            const allValidators = [];
            const offlineTimes = [];
            const offlineBlocks = [];
            const uptimes = [];
            const originatedTxsFees = [];
            for (let i = 0; i < validatorIDs; i++) {
                allValidators.push(i + 1);
                offlineTimes.push(validatorsMetrics[i].offlineTime);
                offlineBlocks.push(validatorsMetrics[i].offlineBlocks);
                uptimes.push(validatorsMetrics[i].uptime);
                originatedTxsFees.push(validatorsMetrics[i].originatedTxsFee);
            }

            await expect(this.sfc.advanceTime(new BN(24 * 60 * 60).toString())).to.be.fulfilled;
            await expectRevert(this.nodeI.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees, {
                from: account2,
            }), 'caller is not the NodeDriver contract');
        });
    });

    describe('Epoch getters', () => {
        it('should return EpochvalidatorIds', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochValidatorIDs(currentSealedEpoch);
        });

        it('should return the Epoch Received Stake', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochReceivedStake(currentSealedEpoch, 1);
        });

        it('should return the Epoch Accumulated Reward Per Token', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochAccumulatedRewardPerToken(currentSealedEpoch, 1);
        });

        it('should return the Epoch Accumulated Uptime', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochAccumulatedUptime(currentSealedEpoch, 1);
        });

        it('should return the Epoch Accumulated Originated Txs Fee', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochAccumulatedOriginatedTxsFee(currentSealedEpoch, 1);
        });

        it('should return the Epoch Offline time ', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochOfflineTime(currentSealedEpoch, 1);
        });

        it('should return Epoch Offline Blocks', async () => {
            const currentSealedEpoch = await this.sfc.currentSealedEpoch();
            await this.sfc.getEpochOfflineBlocks(currentSealedEpoch, 1);
        });
    });

    describe('Unlock features', () => {
        it('should fail if trying to unlock stake if not lockedup', async () => {
            await expectRevert(this.sfc.unlockStake(1, 10), 'not locked up');
        });

        it('should fail if trying to unlock stake if amount is 0', async () => {
            await expectRevert(this.sfc.unlockStake(1, 0), 'zero amount');
        });

        it('should return if slashed', async () => {
            console.log(await this.sfc.isSlashed(1));
        });

        it('should fail if delegating to an unexisting validator', async () => {
            await expectRevert(this.sfc.delegate(4), "validator doesn't exist");
        });

        it('should fail if delegating to an unexisting validator (2)', async () => {
            await expectRevert(this.sfc.delegate(4, {
                value: 10000,
            }), "validator doesn't exist");
        });
    });

    describe('SFC Rewards getters / Features', () => {
        it('should return stashed rewards', async () => {
            console.log(await this.sfc.rewardsStash(firstDelegator, 1));
        });

        it('should return locked stake', async () => {
            console.log(await this.sfc.getLockedStake(firstDelegator, 1));
        });

        it('should return locked stake (2)', async () => {
            console.log(await this.sfc.getLockedStake(firstDelegator, 2));
        });
    });
});

contract('SFC', async ([firstValidator, firstDelegator]) => {
    let firstValidatorID;

    beforeEach(async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.enableNonNodeCalls();
        await this.sfc.setGenesisValidator(firstValidator, 1, pubkey, 0, await this.sfc.currentEpoch(), Date.now(), 0, 0);
        firstValidatorID = await this.sfc.getValidatorID(firstValidator);
        await this.sfc.delegate(firstValidatorID, {
            from: firstValidator,
            value: amount18('4'),
        });
        await sealEpoch(this.sfc, new BN(24 * 60 * 60));
    });

    describe('Staking / Sealed Epoch functions', () => {
        it('Should setGenesisDelegation Validator', async () => {
            await this.sfc.setGenesisDelegation(firstDelegator, firstValidatorID, amount18('1'), 0, 0, 0, 0, 0, 100);
            expect(await this.sfc.getStake(firstDelegator, firstValidatorID)).to.bignumber.equals(amount18('1'));
        });
    });
});

contract('SFC', async ([firstValidator, testValidator, firstDelegator, secondDelegator, thirdDelegator, account1, account2, account3]) => {
    let testValidator1ID;
    let testValidator2ID;
    let testValidator3ID;
    let snapshotId;

    before('Deploy', async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.rebaseTime();
        await this.sfc.enableNonNodeCalls();

        await this.sfc.updateBaseRewardPerSecond(amount18('1'));

        await this.sfc.createValidator(pubkey, {
            from: account1,
            value: amount18('10'),
        });

        await this.sfc.createValidator(pubkey, {
            from: account2,
            value: amount18('5'),
        });

        await this.sfc.createValidator(pubkey, {
            from: account3,
            value: amount18('1'),
        });

        testValidator1ID = await this.sfc.getValidatorID(account1);
        testValidator2ID = await this.sfc.getValidatorID(account2);
        testValidator3ID = await this.sfc.getValidatorID(account3);

        await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 364), amount18('1'),
            { from: account3 });

        await sealEpoch(this.sfc, (new BN(0)).toString());

        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });


    describe('Test Rewards Calculation', () => {
        it('Calculation of validators rewards should be equal to 30%', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            const rewardAcc1 = (await this.sfc.pendingRewards(account1, testValidator1ID)).toString().slice(0, -16);
            const rewardAcc2 = (await this.sfc.pendingRewards(account2, testValidator2ID)).toString().slice(0, -16);
            const rewardAcc3 = (await this.sfc.pendingRewards(account3, testValidator3ID)).toString().slice(0, -16);

            expect(parseInt(rewardAcc1) + parseInt(rewardAcc2) + parseInt(rewardAcc3)).to.equal(34363);
        });

        it('Should not be able withdraw if request does not exist', async () => {
            await expectRevert(this.sfc.withdraw(testValidator1ID, 0), "request doesn't exist");
        });

        it('Should not be able to undelegate 0 amount', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await expectRevert(this.sfc.undelegate(testValidator1ID, 0, 0), 'zero amount');
        });

        it('Should not be able to undelegate if not enough unlocked stake', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await expectRevert(this.sfc.undelegate(testValidator1ID, 0, 10), 'not enough unlocked stake');
        });

        it('Should not be able to unlock if not enough unlocked stake', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator1ID, {
                from: thirdDelegator,
                value: amount18('1'),
            });
            await expectRevert(this.sfc.unlockStake(testValidator1ID, 10, { from: thirdDelegator }), 'not locked up');
        });

        it('should return the unlocked stake', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('1'),
            });
            const unlockedStake = await this.sfc.getUnlockedStake(thirdDelegator, testValidator3ID, { from: thirdDelegator });
            expect(unlockedStake.toString()).to.equal('1000000000000000000');
        });

        it('Should not be able to claim Rewards if 0 rewards', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await expectRevert(this.sfc.claimRewards(testValidator1ID, { from: thirdDelegator }), 'zero rewards');
        });
    });
});

contract('SFC', async ([firstValidator, testValidator, firstDelegator, secondDelegator, thirdDelegator, account1, account2, account3]) => {
    let testValidator1ID;
    let testValidator2ID;
    let testValidator3ID;
    let snapshotId;

    before('Deploy', async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.rebaseTime();
        await this.sfc.enableNonNodeCalls();

        await this.sfc.updateBaseRewardPerSecond(amount18('1'));

        await this.sfc.createValidator(pubkey, {
            from: account1,
            value: amount18('10'),
        });

        await this.sfc.createValidator(pubkey, {
            from: account2,
            value: amount18('5'),
        });

        await this.sfc.createValidator(pubkey, {
            from: account3,
            value: amount18('1'),
        });

        await sealEpoch(this.sfc, (new BN(0)).toString());

        testValidator1ID = await this.sfc.getValidatorID(account1);
        testValidator2ID = await this.sfc.getValidatorID(account2);
        testValidator3ID = await this.sfc.getValidatorID(account3);

        await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 364), amount18('1'),
            { from: account3 });

        await sealEpoch(this.sfc, (new BN(0)).toString());

        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });


    describe('Test Calculation Rewards with Lockup', () => {
        it('Should not be able to lock 0 amount', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await expectRevert(this.sfc.lockStake(testValidator1ID, (2 * 60 * 60 * 24 * 365), amount18('0'), {
                from: thirdDelegator,
            }), 'zero amount');
        });

        it('Should not be able to lock more than a year', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await expectRevert(this.sfc.lockStake(testValidator3ID, (2 * 60 * 60 * 24 * 365), amount18('1'), {
                from: thirdDelegator,
            }), 'incorrect duration');
        });

        it('Should not be able to lock more than validator lockup period', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await expectRevert(this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 365), amount18('1'),
                { from: thirdDelegator }), 'validator lockup period will end earlier');
        });

        it('Should not be able to lock more than validator lockup period', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await expectRevert(this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 365), amount18('1'),
                { from: thirdDelegator }), 'validator lockup period will end earlier');
        });

        it('Should be able to lock for 1 month', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 14), amount18('1'),
                { from: thirdDelegator });

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24 * 14)).toString());
        });

        it('Should not unlock if not locked up FTM', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 14), amount18('1'),
                { from: thirdDelegator });

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24 * 14)).toString());

            await expectRevert(this.sfc.unlockStake(testValidator3ID, amount18('10')), 'not locked up');
        });

        it('Should not be able to unlock more than locked stake', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 14), amount18('1'),
                { from: thirdDelegator });

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24 * 14)).toString());

            await expectRevert(this.sfc.unlockStake(testValidator3ID, amount18('10'), { from: thirdDelegator }), 'not enough locked stake');
        });

        it('Should unlock after period ended and stash rewards', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await this.sfc.delegate(testValidator3ID, {
                from: thirdDelegator,
                value: amount18('10'),
            });

            let unlockedStake = await this.sfc.getUnlockedStake(thirdDelegator, testValidator3ID, { from: thirdDelegator });
            let pendingRewards = await this.sfc.pendingRewards(thirdDelegator, testValidator3ID, { from: thirdDelegator });

            expect(unlockedStake.toString()).to.equal('10000000000000000000');
            expect(web3.utils.fromWei(pendingRewards.toString(), 'ether')).to.equal('0');
            await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 14), amount18('1'),
                { from: thirdDelegator });

            unlockedStake = await this.sfc.getUnlockedStake(thirdDelegator, testValidator3ID, { from: thirdDelegator });
            pendingRewards = await this.sfc.pendingRewards(thirdDelegator, testValidator3ID, { from: thirdDelegator });

            expect(unlockedStake.toString()).to.equal('9000000000000000000');
            expect(web3.utils.fromWei(pendingRewards.toString(), 'ether')).to.equal('0');
            await sealEpoch(this.sfc, (new BN(60 * 60 * 24 * 14)).toString());

            unlockedStake = await this.sfc.getUnlockedStake(thirdDelegator, testValidator3ID, { from: thirdDelegator });
            pendingRewards = await this.sfc.pendingRewards(thirdDelegator, testValidator3ID, { from: thirdDelegator });

            expect(unlockedStake.toString()).to.equal('9000000000000000000');
            expect(web3.utils.fromWei(pendingRewards.toString(), 'ether')).to.equal('17682.303362391033619905');

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24 * 14)).toString());
            pendingRewards = await this.sfc.pendingRewards(thirdDelegator, testValidator3ID, { from: thirdDelegator });

            unlockedStake = await this.sfc.getUnlockedStake(thirdDelegator, testValidator3ID, { from: thirdDelegator });
            expect(unlockedStake.toString()).to.equal('10000000000000000000');
            expect(web3.utils.fromWei(pendingRewards.toString(), 'ether')).to.equal('136316.149516237187466057');

            await this.sfc.stashRewards(thirdDelegator, testValidator3ID, { from: thirdDelegator });
        });
    });
});

contract('SFC', async ([firstValidator, testValidator, firstDelegator, secondDelegator, thirdDelegator, account1, account2, account3]) => {
    let testValidator1ID;
    let testValidator2ID;
    let testValidator3ID;
    let snapshotId;

    before('Deploy', async () => {
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator);
        await this.sfc.rebaseTime();
        await this.sfc.enableNonNodeCalls();

        await this.sfc.updateBaseRewardPerSecond(amount18('1'));

        await this.sfc.createValidator(pubkey, {
            from: account1,
            value: amount18('10'),
        });

        await this.sfc.createValidator(pubkey, {
            from: account2,
            value: amount18('5'),
        });

        await this.sfc.createValidator(pubkey, {
            from: account3,
            value: amount18('1'),
        });

        await sealEpoch(this.sfc, (new BN(0)).toString());

        testValidator1ID = await this.sfc.getValidatorID(account1);
        testValidator2ID = await this.sfc.getValidatorID(account2);
        testValidator3ID = await this.sfc.getValidatorID(account3);

        await this.sfc.lockStake(testValidator3ID, (60 * 60 * 24 * 364), amount18('1'),
            { from: account3 });

        await sealEpoch(this.sfc, (new BN(0)).toString());

        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });

    afterEach(async () => {
        await revertToSnapshot(snapshotId);
        const snapshot = await takeSnapshot();
        snapshotId = snapshot['result'];
    });


    describe('Test Rewards with lockup Calculation', () => {
        it('Should not update slashing refund ratio', async () => {
            await sealEpoch(this.sfc, (new BN(1000)).toString());

            await expectRevert(this.sfc.updateSlashingRefundRatio(testValidator3ID, 1, {
                from: firstValidator,
            }), "validator isn't slashed");

            await sealEpoch(this.sfc, (new BN(60 * 60 * 24 * 14)).toString());
        });

        it('Should not sync if validator does not exist', async () => {
            await expectRevert(this.sfc._syncValidator(33, false), "validator doesn't exist");
        });
    });
});
