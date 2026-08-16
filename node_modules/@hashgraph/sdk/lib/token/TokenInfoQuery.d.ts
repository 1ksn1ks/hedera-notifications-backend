/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IQuery} HieroProto.proto.IQuery
 * @typedef {import("@hiero-ledger/proto").proto.IQueryHeader} HieroProto.proto.IQueryHeader
 * @typedef {import("@hiero-ledger/proto").proto.IResponse} HieroProto.proto.IResponse
 * @typedef {import("@hiero-ledger/proto").proto.IResponseHeader} HieroProto.proto.IResponseHeader
 * @typedef {import("@hiero-ledger/proto").proto.ITokenInfo} HieroProto.proto.ITokenInfo
 * @typedef {import("@hiero-ledger/proto").proto.ITokenGetInfoQuery} HieroProto.proto.ITokenGetInfoQuery
 * @typedef {import("@hiero-ledger/proto").proto.ITokenGetInfoResponse} HieroProto.proto.ITokenGetInfoResponse
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../client/Client.js").default<*, *>} Client
 * @typedef {import("../account/AccountId.js").default} AccountId
 */
/**
 * Retrieve the detail characteristics for a token.
 * @augments {Query<TokenInfo>}
 */
export default class TokenInfoQuery extends Query<TokenInfo> {
    /**
     * @internal
     * @param {HieroProto.proto.IQuery} query
     * @returns {TokenInfoQuery}
     */
    static _fromProtobuf(query: HieroProto.proto.IQuery): TokenInfoQuery;
    /**
     * @param {object} properties
     * @param {TokenId | string} [properties.tokenId]
     */
    constructor(properties?: {
        tokenId?: string | TokenId | undefined;
    });
    /**
     * @private
     * @type {?TokenId}
     */
    private _tokenId;
    /**
     * @returns {?TokenId}
     */
    get tokenId(): TokenId | null;
    /**
     * Set the token ID for which the info is being requested.
     *
     * @param {TokenId | string} tokenId
     * @returns {TokenInfoQuery}
     */
    setTokenId(tokenId: TokenId | string): TokenInfoQuery;
}
export namespace HieroProto {
    namespace proto {
        type IQuery = import("@hiero-ledger/proto").proto.IQuery;
        type IQueryHeader = import("@hiero-ledger/proto").proto.IQueryHeader;
        type IResponse = import("@hiero-ledger/proto").proto.IResponse;
        type IResponseHeader = import("@hiero-ledger/proto").proto.IResponseHeader;
        type ITokenInfo = import("@hiero-ledger/proto").proto.ITokenInfo;
        type ITokenGetInfoQuery = import("@hiero-ledger/proto").proto.ITokenGetInfoQuery;
        type ITokenGetInfoResponse = import("@hiero-ledger/proto").proto.ITokenGetInfoResponse;
    }
}
export type Channel = import("../channel/Channel.js").default;
export type Client = import("../client/Client.js").default<any, any>;
export type AccountId = import("../account/AccountId.js").default;
import TokenInfo from "./TokenInfo.js";
import Query from "../query/Query.js";
import TokenId from "./TokenId.js";
