/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITokenTransferList} HieroProto.proto.ITokenTransferList
 * @typedef {import("@hiero-ledger/proto").proto.IAccountAmount} HieroProto.proto.IAccountAmount
 * @typedef {import("@hiero-ledger/proto").proto.ITokenID} HieroProto.proto.ITokenID
 * @typedef {import("@hiero-ledger/proto").proto.IAccountID} HieroProto.proto.IAccountID
 */
/**
 * @typedef {import("bignumber.js").default} BigNumber
 */
/**
 * @augments {ObjectMap<TokenId, TokenTransferAccountMap>}
 */
export default class TokenTransferMap extends ObjectMap<TokenId, TokenTransferAccountMap> {
    /**
     * @param {HieroProto.proto.ITokenTransferList[]} transfers
     * @returns {TokenTransferMap}
     */
    static _fromProtobuf(transfers: HieroProto.proto.ITokenTransferList[]): TokenTransferMap;
    constructor();
    /**
     * @internal
     * @param {TokenId} tokenId
     * @param {AccountId} accountId
     * @param {Long | number | BigNumber | bigint} amount
     */
    __set(tokenId: TokenId, accountId: AccountId, amount: Long | number | BigNumber | bigint): void;
    /**
     * @returns {HieroProto.proto.ITokenTransferList[]}
     */
    _toProtobuf(): HieroProto.proto.ITokenTransferList[];
}
export namespace HieroProto {
    namespace proto {
        type ITokenTransferList = import("@hiero-ledger/proto").proto.ITokenTransferList;
        type IAccountAmount = import("@hiero-ledger/proto").proto.IAccountAmount;
        type ITokenID = import("@hiero-ledger/proto").proto.ITokenID;
        type IAccountID = import("@hiero-ledger/proto").proto.IAccountID;
    }
}
export type BigNumber = import("bignumber.js").default;
import TokenId from "../token/TokenId.js";
import TokenTransferAccountMap from "./TokenTransferAccountMap.js";
import ObjectMap from "../ObjectMap.js";
import AccountId from "../account/AccountId.js";
