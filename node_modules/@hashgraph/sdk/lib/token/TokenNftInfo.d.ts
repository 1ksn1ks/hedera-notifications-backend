/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.TokenFreezeStatus} HieroProto.proto.TokenFreezeStatus
 * @typedef {import("@hiero-ledger/proto").proto.TokenKycStatus} HieroProto.proto.TokenKycStatus
 * @typedef {import("@hiero-ledger/proto").proto.TokenPauseStatus} HieroProto.proto.TokenPauseStatus
 * @typedef {import("@hiero-ledger/proto").proto.ITokenNftInfo} HieroProto.proto.ITokenNftInfo
 * @typedef {import("@hiero-ledger/proto").proto.INftID} HieroProto.proto.INftID
 * @typedef {import("@hiero-ledger/proto").proto.ITimestamp} HieroProto.proto.ITimestamp
 * @typedef {import("@hiero-ledger/proto").proto.ITokenID} HieroProto.proto.ITokenID
 * @typedef {import("@hiero-ledger/proto").proto.IAccountID} HieroProto.proto.IAccountID
 * @typedef {import("@hiero-ledger/proto").proto.IKey} HieroProto.proto.IKey
 * @typedef {import("@hiero-ledger/proto").proto.IDuration} HieroProto.proto.IDuration
 */
export default class TokenNftInfo {
    /**
     * @internal
     * @param {HieroProto.proto.ITokenNftInfo} info
     * @returns {TokenNftInfo}
     */
    static _fromProtobuf(info: HieroProto.proto.ITokenNftInfo): TokenNftInfo;
    /**
     * @private
     * @param {object} props
     * @param {NftId} props.nftId
     * @param {AccountId} props.accountId
     * @param {Timestamp} props.creationTime
     * @param {Uint8Array | null} props.metadata
     * @param {LedgerId|null} props.ledgerId
     * @param {AccountId|null} props.spenderId
     */
    private constructor();
    /**
     * ID of the nft instance
     *
     * @readonly
     */
    readonly nftId: NftId;
    /**
     * @readonly
     */
    readonly accountId: AccountId;
    /**
     * @readonly
     */
    readonly creationTime: Timestamp;
    /**
     * @readonly
     */
    readonly metadata: Uint8Array<ArrayBufferLike> | null;
    ledgerId: LedgerId | null;
    spenderId: AccountId | null;
    /**
     * @returns {HieroProto.proto.ITokenNftInfo}
     */
    _toProtobuf(): HieroProto.proto.ITokenNftInfo;
    /**
     * @typedef {object} TokenNftInfoJson
     * @property {string} nftId
     * @property {string} accountId
     * @property {string} creationTime
     * @property {string | null} metadata
     * @property {string | null} ledgerId
     * @property {string | null} spenderId
     * @returns {TokenNftInfoJson}
     */
    toJson(): {
        nftId: string;
        accountId: string;
        creationTime: string;
        metadata: string | null;
        ledgerId: string | null;
        spenderId: string | null;
    };
    /**
     * @returns {string}
     */
    toString(): string;
}
export namespace HieroProto {
    namespace proto {
        type TokenFreezeStatus = import("@hiero-ledger/proto").proto.TokenFreezeStatus;
        type TokenKycStatus = import("@hiero-ledger/proto").proto.TokenKycStatus;
        type TokenPauseStatus = import("@hiero-ledger/proto").proto.TokenPauseStatus;
        type ITokenNftInfo = import("@hiero-ledger/proto").proto.ITokenNftInfo;
        type INftID = import("@hiero-ledger/proto").proto.INftID;
        type ITimestamp = import("@hiero-ledger/proto").proto.ITimestamp;
        type ITokenID = import("@hiero-ledger/proto").proto.ITokenID;
        type IAccountID = import("@hiero-ledger/proto").proto.IAccountID;
        type IKey = import("@hiero-ledger/proto").proto.IKey;
        type IDuration = import("@hiero-ledger/proto").proto.IDuration;
    }
}
import NftId from "./NftId.js";
import AccountId from "../account/AccountId.js";
import Timestamp from "../Timestamp.js";
import LedgerId from "../LedgerId.js";
