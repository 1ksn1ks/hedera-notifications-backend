/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITokenBalance} HieroProto.proto.ITokenBalance
 * @typedef {import("@hiero-ledger/proto").proto.ITokenID} HieroProto.proto.ITokenID
 */
/**
 * @augments {ObjectMap<TokenId, number>}
 */
export default class TokenDecimalMap extends ObjectMap<TokenId, number> {
    constructor();
}
export namespace HieroProto {
    namespace proto {
        type ITokenBalance = import("@hiero-ledger/proto").proto.ITokenBalance;
        type ITokenID = import("@hiero-ledger/proto").proto.ITokenID;
    }
}
import TokenId from "../token/TokenId.js";
import ObjectMap from "../ObjectMap.js";
