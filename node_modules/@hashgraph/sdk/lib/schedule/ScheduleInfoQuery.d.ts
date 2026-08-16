/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IQuery} HieroProto.proto.IQuery
 * @typedef {import("@hiero-ledger/proto").proto.IQueryHeader} HieroProto.proto.IQueryHeader
 * @typedef {import("@hiero-ledger/proto").proto.IResponse} HieroProto.proto.IResponse
 * @typedef {import("@hiero-ledger/proto").proto.IResponseHeader} HieroProto.proto.IResponseHeader
 * @typedef {import("@hiero-ledger/proto").proto.IScheduleInfo} HieroProto.proto.IScheduleInfo
 * @typedef {import("@hiero-ledger/proto").proto.IScheduleGetInfoQuery} HieroProto.proto.IScheduleGetInfoQuery
 * @typedef {import("@hiero-ledger/proto").proto.IScheduleGetInfoResponse} HieroProto.proto.IScheduleGetInfoResponse
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../client/Client.js").default<*, *>} Client
 * @typedef {import("../account/AccountId.js").default} AccountId
 */
/**
 * Retrieve the metadata for a schedule.
 * @augments {Query<ScheduleInfo>}
 */
export default class ScheduleInfoQuery extends Query<ScheduleInfo> {
    /**
     * @internal
     * @param {HieroProto.proto.IQuery} query
     * @returns {ScheduleInfoQuery}
     */
    static _fromProtobuf(query: HieroProto.proto.IQuery): ScheduleInfoQuery;
    /**
     * @param {object} properties
     * @param {ScheduleId | string} [properties.scheduleId]
     */
    constructor(properties?: {
        scheduleId?: string | ScheduleId | undefined;
    });
    /**
     * @private
     * @type {?ScheduleId}
     */
    private _scheduleId;
    /**
     * @returns {?ScheduleId}
     */
    get scheduleId(): ScheduleId | null;
    /**
     *
     * @param {ScheduleId | string} scheduleId
     * @returns {ScheduleInfoQuery}
     */
    setScheduleId(scheduleId: ScheduleId | string): ScheduleInfoQuery;
}
export namespace HieroProto {
    namespace proto {
        type IQuery = import("@hiero-ledger/proto").proto.IQuery;
        type IQueryHeader = import("@hiero-ledger/proto").proto.IQueryHeader;
        type IResponse = import("@hiero-ledger/proto").proto.IResponse;
        type IResponseHeader = import("@hiero-ledger/proto").proto.IResponseHeader;
        type IScheduleInfo = import("@hiero-ledger/proto").proto.IScheduleInfo;
        type IScheduleGetInfoQuery = import("@hiero-ledger/proto").proto.IScheduleGetInfoQuery;
        type IScheduleGetInfoResponse = import("@hiero-ledger/proto").proto.IScheduleGetInfoResponse;
    }
}
export type Channel = import("../channel/Channel.js").default;
export type Client = import("../client/Client.js").default<any, any>;
export type AccountId = import("../account/AccountId.js").default;
import ScheduleInfo from "./ScheduleInfo.js";
import Query from "../query/Query.js";
import ScheduleId from "./ScheduleId.js";
