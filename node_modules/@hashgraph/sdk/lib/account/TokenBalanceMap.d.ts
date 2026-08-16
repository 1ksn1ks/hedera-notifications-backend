/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITokenBalance} HieroProto.proto.ITokenBalance
 * @typedef {import("@hiero-ledger/proto").proto.ITokenID} HieroProto.proto.ITokenID
 */
/**
 * @typedef {import("long")} Long
 */
/**
 * @augments {ObjectMap<TokenId, Long>}
 */
export default class TokenBalanceMap extends ObjectMap<TokenId, import("long")> {
    constructor();
}
export namespace HieroProto {
    namespace proto {
        type ITokenBalance = import("@hiero-ledger/proto").proto.ITokenBalance;
        type ITokenID = import("@hiero-ledger/proto").proto.ITokenID;
    }
}
export type Long = import("long");
import TokenId from "../token/TokenId.js";
import ObjectMap from "../ObjectMap.js";
