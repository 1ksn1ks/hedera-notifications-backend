/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITransaction} HieroProto.proto.ITransaction
 * @typedef {import("@hiero-ledger/proto").proto.ISignedTransaction} HieroProto.proto.ISignedTransaction
 * @typedef {import("@hiero-ledger/proto").proto.TransactionBody} HieroProto.proto.TransactionBody
 * @typedef {import("@hiero-ledger/proto").proto.ITransactionBody} HieroProto.proto.ITransactionBody
 * @typedef {import("@hiero-ledger/proto").proto.ITransactionResponse} HieroProto.proto.ITransactionResponse
 * @typedef {import("@hiero-ledger/proto").proto.ISystemDeleteTransactionBody} HieroProto.proto.ISystemDeleteTransactionBody
 * @typedef {import("@hiero-ledger/proto").proto.IContractID} HieroProto.proto.IContractID
 * @typedef {import("@hiero-ledger/proto").proto.IFileID} HieroProto.proto.IFileID
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../account/AccountId.js").default} AccountId
 * @typedef {import("../transaction/TransactionId.js").default} TransactionId
 */
/**
 * Deprecated: Do not use.
 * @deprecated
 */
export default class SystemDeleteTransaction extends Transaction {
    /**
     * @internal
     * @param {HieroProto.proto.ITransaction[]} transactions
     * @param {HieroProto.proto.ISignedTransaction[]} signedTransactions
     * @param {TransactionId[]} transactionIds
     * @param {AccountId[]} nodeIds
     * @param {HieroProto.proto.ITransactionBody[]} bodies
     * @returns {SystemDeleteTransaction}
     */
    static _fromProtobuf(transactions: HieroProto.proto.ITransaction[], signedTransactions: HieroProto.proto.ISignedTransaction[], transactionIds: TransactionId[], nodeIds: AccountId[], bodies: HieroProto.proto.ITransactionBody[]): SystemDeleteTransaction;
    /**
     * @param {object} [props]
     * @param {FileId | string} [props.fileId]
     * @param {ContractId | string} [props.contractId]
     * @param {Timestamp} [props.expirationTime]
     */
    constructor(props?: {
        fileId?: string | FileId | undefined;
        contractId?: string | ContractId | undefined;
        expirationTime?: Timestamp | undefined;
    });
    /**
     * @private
     * @type {?FileId}
     */
    private _fileId;
    /**
     * @private
     * @type {?ContractId}
     */
    private _contractId;
    /**
     * @private
     * @type {?Timestamp}
     */
    private _expirationTime;
    /**
     * @returns {?FileId}
     */
    get fileId(): FileId | null;
    /**
     * @param {FileId | string} fileId
     * @returns {this}
     */
    setFileId(fileId: FileId | string): this;
    /**
     * @returns {?ContractId}
     */
    get contractId(): ContractId | null;
    /**
     * @param {ContractId | string} contractId
     * @returns {this}
     */
    setContractId(contractId: ContractId | string): this;
    /**
     * @returns {?Timestamp}
     */
    get expirationTime(): Timestamp | null;
    /**
     * @param {Timestamp} expirationTime
     * @returns {SystemDeleteTransaction}
     */
    setExpirationTime(expirationTime: Timestamp): SystemDeleteTransaction;
    /**
     * @override
     * @protected
     * @returns {HieroProto.proto.ISystemDeleteTransactionBody}
     */
    protected override _makeTransactionData(): HieroProto.proto.ISystemDeleteTransactionBody;
}
export namespace HieroProto {
    namespace proto {
        type ITransaction = import("@hiero-ledger/proto").proto.ITransaction;
        type ISignedTransaction = import("@hiero-ledger/proto").proto.ISignedTransaction;
        type TransactionBody = import("@hiero-ledger/proto").proto.TransactionBody;
        type ITransactionBody = import("@hiero-ledger/proto").proto.ITransactionBody;
        type ITransactionResponse = import("@hiero-ledger/proto").proto.ITransactionResponse;
        type ISystemDeleteTransactionBody = import("@hiero-ledger/proto").proto.ISystemDeleteTransactionBody;
        type IContractID = import("@hiero-ledger/proto").proto.IContractID;
        type IFileID = import("@hiero-ledger/proto").proto.IFileID;
    }
}
export type Channel = import("../channel/Channel.js").default;
export type AccountId = import("../account/AccountId.js").default;
export type TransactionId = import("../transaction/TransactionId.js").default;
import Transaction from "../transaction/Transaction.js";
import FileId from "../file/FileId.js";
import ContractId from "../contract/ContractId.js";
import Timestamp from "../Timestamp.js";
