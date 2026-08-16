/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IQuery} HieroProto.proto.IQuery
 * @typedef {import("@hiero-ledger/proto").proto.IQueryHeader} HieroProto.proto.IQueryHeader
 * @typedef {import("@hiero-ledger/proto").proto.IResponse} HieroProto.proto.IResponse
 * @typedef {import("@hiero-ledger/proto").proto.IResponseHeader} HieroProto.proto.IResponseHeader
 * @typedef {import("@hiero-ledger/proto").proto.INetworkGetVersionInfoQuery} HieroProto.proto.INetworkGetVersionInfoQuery
 * @typedef {import("@hiero-ledger/proto").proto.INetworkGetVersionInfoResponse} HieroProto.proto.INetworkGetVersionInfoResponse
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 */
/**
 *
 * A query to retrieve version information about the Hedera network.
 *
 * This query returns information about the versions of both the Hedera Services software
 * and the protobuf schema in use by the network. This information is useful for ensuring
 * client-network compatibility and debugging version-related issues.
 *
 * @augments {Query<NetworkVersionInfo>}
 */
export default class NetworkVersionInfoQuery extends Query<NetworkVersionInfo> {
    /**
     * @param {HieroProto.proto.IQuery} query
     * @returns {NetworkVersionInfoQuery}
     */
    static _fromProtobuf(query: HieroProto.proto.IQuery): NetworkVersionInfoQuery;
    constructor();
    /**
     * @protected
     * @override
     * @param {HieroProto.proto.IResponse} response
     * @returns {Promise<NetworkVersionInfo>}
     */
    protected override _mapResponse(response: HieroProto.proto.IResponse): Promise<NetworkVersionInfo>;
}
export namespace HieroProto {
    namespace proto {
        type IQuery = import("@hiero-ledger/proto").proto.IQuery;
        type IQueryHeader = import("@hiero-ledger/proto").proto.IQueryHeader;
        type IResponse = import("@hiero-ledger/proto").proto.IResponse;
        type IResponseHeader = import("@hiero-ledger/proto").proto.IResponseHeader;
        type INetworkGetVersionInfoQuery = import("@hiero-ledger/proto").proto.INetworkGetVersionInfoQuery;
        type INetworkGetVersionInfoResponse = import("@hiero-ledger/proto").proto.INetworkGetVersionInfoResponse;
    }
}
export type Channel = import("../channel/Channel.js").default;
import NetworkVersionInfo from "./NetworkVersionInfo.js";
import Query from "../query/Query.js";
