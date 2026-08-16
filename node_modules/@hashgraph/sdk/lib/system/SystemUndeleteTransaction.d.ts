/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITransaction} HieroProto.proto.ITransaction
 * @typedef {import("@hiero-ledger/proto").proto.ISignedTransaction} HieroProto.proto.ISignedTransaction
 * @typedef {import("@hiero-ledger/proto").proto.TransactionBody} HieroProto.proto.TransactionBody
 * @typedef {import("@hiero-ledger/proto").proto.ITransactionBody} HieroProto.proto.ITransactionBody
 * @typedef {import("@hiero-ledger/proto").proto.ITransactionResponse} HieroProto.proto.ITransactionResponse
 * @typedef {import("@hiero-ledger/proto").proto.ISystemUndeleteTransactionBody} HieroProto.proto.ISystemUndeleteTransactionBody
 * @typedef {import("@hiero-ledger/proto").proto.IContractID} HieroProto.proto.IContractID
 * @typedef {import("@hiero-ledger/proto").proto.IFileID} HieroProto.proto.IFileID
 */
/**
 * @typedef {import("../channel/Channel.js").default} Channel
 * @typedef {import("../Timestamp.js").default} Timestamp
 * @typedef {import("../account/AccountId.js").default} AccountId
 * @typedef {import("../transaction/TransactionId.js").default} TransactionId
 */
/**
 * Deprecated: Do not use.
 * @deprecated
 */
export default class SystemUndeleteTransaction extends Transaction {
    /**
     * @internal
     * @param {HieroProto.proto.ITransaction[]} transactions
     * @param {HieroProto.proto.ISignedTransaction[]} signedTransactions
     * @param {TransactionId[]} transactionIds
     * @param {AccountId[]} nodeIds
     * @param {HieroProto.proto.ITransactionBody[]} bodies
     * @returns {SystemUndeleteTransaction}
     */
    static _fromProtobuf(transactions: HieroProto.proto.ITransaction[], signedTransactions: HieroProto.proto.ISignedTransaction[], transactionIds: TransactionId[], nodeIds: AccountId[], bodies: HieroProto.proto.ITransactionBody[]): SystemUndeleteTransaction;
    /**
     * @param {object} [props]
     * @param {FileId | string} [props.fileId]
     * @param {ContractId | string} [props.contractId]
     * @param {Timestamp} [props.expirationTime]
     */
    constructor(props?: {
        fileId?: string | FileId | undefined;
        contractId?: string | ContractId | undefined;
        expirationTime?: import("../Timestamp.js").default | undefined;
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
     * @override
     * @protected
     * @returns {HieroProto.proto.ISystemUndeleteTransactionBody}
     */
    protected override _makeTransactionData(): HieroProto.proto.ISystemUndeleteTransactionBody;
}
export namespace HieroProto {
    namespace proto {
        type ITransaction = import("@hiero-ledger/proto").proto.ITransaction;
        type ISignedTransaction = import("@hiero-ledger/proto").proto.ISignedTransaction;
        type TransactionBody = import("@hiero-ledger/proto").proto.TransactionBody;
        type ITransactionBody = import("@hiero-ledger/proto").proto.ITransactionBody;
        type ITransactionResponse = import("@hiero-ledger/proto").proto.ITransactionResponse;
        type ISystemUndeleteTransactionBody = import("@hiero-ledger/proto").proto.ISystemUndeleteTransactionBody;
        type IContractID = import("@hiero-ledger/proto").proto.IContractID;
        type IFileID = import("@hiero-ledger/proto").proto.IFileID;
    }
}
export type Channel = import("../channel/Channel.js").default;
export type Timestamp = import("../Timestamp.js").default;
export type AccountId = import("../account/AccountId.js").default;
export type TransactionId = import("../transaction/TransactionId.js").default;
import Transaction from "../transaction/Transaction.js";
import FileId from "../file/FileId.js";
import ContractId from "../contract/ContractId.js";
