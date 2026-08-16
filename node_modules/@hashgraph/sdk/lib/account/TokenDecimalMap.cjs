"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _TokenId = _interopRequireDefault(require("../token/TokenId.cjs"));
var _ObjectMap = _interopRequireDefault(require("../ObjectMap.cjs"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// SPDX-License-Identifier: Apache-2.0

/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITokenBalance} HieroProto.proto.ITokenBalance
 * @typedef {import("@hiero-ledger/proto").proto.ITokenID} HieroProto.proto.ITokenID
 */

/**
 * @augments {ObjectMap<TokenId, number>}
 */
class TokenDecimalMap extends _ObjectMap.default {
  constructor() {
    super(s => _TokenId.default.fromString(s));
  }
}
exports.default = TokenDecimalMap;