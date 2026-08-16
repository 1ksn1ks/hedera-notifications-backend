/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IQuery} HieroProto.proto.IQuery
 * @typedef {import("@hiero-ledger/proto").proto.IQueryHeader} HieroProto.proto.IQueryHeader
 * @typedef {import("@hiero-ledger/proto").proto.IResponse} HieroProto.proto.IResponse
 * @typedef {import("@hiero-ledger/proto").proto.IResponseHeader} HieroProto.proto.IResponseHeader
 * @typedef {import("@hiero-ledger/proto").proto.IFileGetContentsQuery} HieroProto.proto.IFileGetContentsQuery
 * @typedef {import("@hiero-ledger/proto").proto.IFileGetContentsResponse} HieroProto.proto.IFileGetContentsResponse
 * @typedef {import("@hiero-ledger/proto").proto.FileGetContentsResponse.IFileContents} HieroProto.proto.FileGetContentsResponse.IFileContents
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../client/Client.js").default<*, *>} Client
 * @typedef {import("../account/AccountId.js").default} AccountId
 */
/**
 * @augments {Query<Uint8Array>}
 * Retrieve the content of a file in HFS.<br/>
 * Note that this query retrieves _only_ the file content, not any of
 * the metadata for the file.
 */
export default class FileContentsQuery extends Query<Uint8Array<ArrayBufferLike>> {
    /**
     * @internal
     * @param {HieroProto.proto.IQuery} query
     * @returns {FileContentsQuery}
     */
    static _fromProtobuf(query: HieroProto.proto.IQuery): FileContentsQuery;
    /**
     * @param {object} [props]
     * @param {FileId | string} [props.fileId]
     */
    constructor(props?: {
        fileId?: string | FileId | undefined;
    });
    /**
     * @type {?FileId}
     * @private
     */
    private _fileId;
    /**
     * @returns {?FileId}
     */
    get fileId(): FileId | null;
    /**
     * Set the file ID for which the info is being requested.
     *
     * @param {FileId | string} fileId
     * @returns {FileContentsQuery}
     */
    setFileId(fileId: FileId | string): FileContentsQuery;
    /**
     * @protected
     * @override
     * @param {HieroProto.proto.IResponse} response
     * @returns {Promise<Uint8Array>}
     */
    protected override _mapResponse(response: HieroProto.proto.IResponse): Promise<Uint8Array>;
}
export namespace HieroProto {
    namespace proto {
        type IQuery = import("@hiero-ledger/proto").proto.IQuery;
        type IQueryHeader = import("@hiero-ledger/proto").proto.IQueryHeader;
        type IResponse = import("@hiero-ledger/proto").proto.IResponse;
        type IResponseHeader = import("@hiero-ledger/proto").proto.IResponseHeader;
        type IFileGetContentsQuery = import("@hiero-ledger/proto").proto.IFileGetContentsQuery;
        type IFileGetContentsResponse = import("@hiero-ledger/proto").proto.IFileGetContentsResponse;
        namespace FileGetContentsResponse {
            type IFileContents = import("@hiero-ledger/proto").proto.FileGetContentsResponse.IFileContents;
        }
    }
}
export type Channel = import("../channel/Channel.js").default;
export type Client = import("../client/Client.js").default<any, any>;
export type AccountId = import("../account/AccountId.js").default;
import Query from "../query/Query.js";
import FileId from "./FileId.js";
