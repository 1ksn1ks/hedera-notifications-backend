/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IQuery} HieroProto.proto.IQuery
 * @typedef {import("@hiero-ledger/proto").proto.IQueryHeader} HieroProto.proto.IQueryHeader
 * @typedef {import("@hiero-ledger/proto").proto.IResponse} HieroProto.proto.IResponse
 * @typedef {import("@hiero-ledger/proto").proto.IResponseHeader} HieroProto.proto.IResponseHeader
 * @typedef {import("@hiero-ledger/proto").proto.IContractGetInfoQuery} HieroProto.proto.IContractGetInfoQuery
 * @typedef {import("@hiero-ledger/proto").proto.IContractGetInfoResponse} HieroProto.proto.IContractGetInfoResponse
 * @typedef {import("@hiero-ledger/proto").proto.ContractGetInfoResponse.IContractInfo} HieroProto.proto.ContractGetInfoResponse.IContractInfo
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../client/Client.js").default<*, *>} Client
 * @typedef {import("../account/AccountId.js").default} AccountId
 */
/**
 * A query that returns information about a smart contract instance.
 * This includes the account that it owns, the contract's bytecode, and the timestamp when it will expire.
 * @augments {Query<ContractInfo>}
 */
export default class ContractInfoQuery extends Query<ContractInfo> {
    /**
     * @internal
     * @param {HieroProto.proto.IQuery} query
     * @returns {ContractInfoQuery}
     */
    static _fromProtobuf(query: HieroProto.proto.IQuery): ContractInfoQuery;
    /**
     * @param {object} [props]
     * @param {ContractId | string} [props.contractId]
     */
    constructor(props?: {
        contractId?: string | ContractId | undefined;
    });
    /**
     * @type {?ContractId}
     * @private
     */
    private _contractId;
    /**
     * @returns {?ContractId}
     */
    get contractId(): ContractId | null;
    /**
     * Set the contract ID for which the info is being requested.
     *
     * @param {ContractId | string} contractId
     * @returns {ContractInfoQuery}
     */
    setContractId(contractId: ContractId | string): ContractInfoQuery;
}
export namespace HieroProto {
    namespace proto {
        type IQuery = import("@hiero-ledger/proto").proto.IQuery;
        type IQueryHeader = import("@hiero-ledger/proto").proto.IQueryHeader;
        type IResponse = import("@hiero-ledger/proto").proto.IResponse;
        type IResponseHeader = import("@hiero-ledger/proto").proto.IResponseHeader;
        type IContractGetInfoQuery = import("@hiero-ledger/proto").proto.IContractGetInfoQuery;
        type IContractGetInfoResponse = import("@hiero-ledger/proto").proto.IContractGetInfoResponse;
        namespace ContractGetInfoResponse {
            type IContractInfo = import("@hiero-ledger/proto").proto.ContractGetInfoResponse.IContractInfo;
        }
    }
}
export type Channel = import("../channel/Channel.js").default;
export type Client = import("../client/Client.js").default<any, any>;
export type AccountId = import("../account/AccountId.js").default;
import ContractInfo from "./ContractInfo.js";
import Query from "../query/Query.js";
import ContractId from "./ContractId.js";
