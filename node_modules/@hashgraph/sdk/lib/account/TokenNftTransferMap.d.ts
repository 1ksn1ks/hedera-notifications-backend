/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITokenTransferList} HieroProto.proto.ITokenTransferList
 * @typedef {import("@hiero-ledger/proto").proto.INftTransfer} HieroProto.proto.INftTransfer
 * @typedef {import("@hiero-ledger/proto").proto.IAccountAmount} HieroProto.proto.IAccountAmount
 * @typedef {import("@hiero-ledger/proto").proto.ITokenID} HieroProto.proto.ITokenID
 * @typedef {import("@hiero-ledger/proto").proto.IAccountID} HieroProto.proto.IAccountID
 */
/**
 * @typedef {object} NftTransfer
 * @property {AccountId} sender
 * @property {AccountId} recipient
 * @property {Long} serial
 * @property {boolean} isApproved
 */
/**
 * @augments {ObjectMap<TokenId, NftTransfer[]>}
 */
export default class TokenNftTransferMap extends ObjectMap<TokenId, NftTransfer[]> {
    /**
     * @param {HieroProto.proto.ITokenTransferList[]} transfers
     * @returns {TokenNftTransferMap}
     */
    static _fromProtobuf(transfers: HieroProto.proto.ITokenTransferList[]): TokenNftTransferMap;
    constructor();
    /**
     * @internal
     * @param {TokenId} tokenId
     * @param {NftTransfer} nftTransfer
     */
    __set(tokenId: TokenId, nftTransfer: NftTransfer): void;
    /**
     * @returns {HieroProto.proto.ITokenTransferList[]}
     */
    _toProtobuf(): HieroProto.proto.ITokenTransferList[];
}
export namespace HieroProto {
    namespace proto {
        type ITokenTransferList = import("@hiero-ledger/proto").proto.ITokenTransferList;
        type INftTransfer = import("@hiero-ledger/proto").proto.INftTransfer;
        type IAccountAmount = import("@hiero-ledger/proto").proto.IAccountAmount;
        type ITokenID = import("@hiero-ledger/proto").proto.ITokenID;
        type IAccountID = import("@hiero-ledger/proto").proto.IAccountID;
    }
}
export type NftTransfer = {
    sender: AccountId;
    recipient: AccountId;
    serial: Long;
    isApproved: boolean;
};
import TokenId from "../token/TokenId.js";
import ObjectMap from "../ObjectMap.js";
import AccountId from "../account/AccountId.js";
import Long from "long";
