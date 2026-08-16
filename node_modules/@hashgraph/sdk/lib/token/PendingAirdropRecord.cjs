"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _long = _interopRequireDefault(require("long"));
var _PendingAirdropId = _interopRequireDefault(require("./PendingAirdropId.cjs"));
var _util = require("../util.cjs");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// SPDX-License-Identifier: Apache-2.0
/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.PendingAirdropRecord} HieroProto.proto.PendingAirdropRecord
 */

/**
 * @typedef {import("bignumber.js").default} BigNumber
 */

class PendingAirdropRecord {
  /**
   * @param {object} props
   * @param {PendingAirdropId} props.airdropId
   * @param {Long | number | BigNumber | bigint} props.amount
   */
  constructor(props) {
    this.airdropId = props.airdropId;
    this.amount = (0, _util.convertAmountToLong)(props.amount);
  }

  /**
   * @returns {HieroProto.proto.PendingAirdropRecord}
   */
  toBytes() {
    return {
      pendingAirdropId: this.airdropId.toBytes(),
      pendingAirdropValue: {
        amount: this.amount
      }
    };
  }

  /**
   * @param {HieroProto.proto.PendingAirdropRecord} pb
   * @returns {PendingAirdropRecord}
   */
  static fromBytes(pb) {
    if (pb.pendingAirdropId == null) {
      throw new Error("pendingAirdropId is required");
    }
    const airdropId = _PendingAirdropId.default.fromBytes(pb.pendingAirdropId);
    const amount = pb.pendingAirdropValue?.amount;
    return new PendingAirdropRecord({
      airdropId: airdropId,
      amount: amount ? amount : _long.default.ZERO
    });
  }
}
exports.default = PendingAirdropRecord;