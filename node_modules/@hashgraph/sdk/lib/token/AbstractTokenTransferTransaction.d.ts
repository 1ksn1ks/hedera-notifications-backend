/**
 * @typedef {import("bignumber.js").default} BigNumber
 */
/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ITokenAirdropTransactionBody} HieroProto.proto.ITokenAirdropTransactionBody
 */
/**
 * @typedef {object} TransferTokensInput
 * @property {TokenId | string} tokenId
 * @property {AccountId | string} accountId
 * @property {Long | number | BigNumber | bigint} amount
 */
/**
 * @typedef {object} TransferNftInput
 * @property {TokenId | string} tokenId
 * @property {AccountId | string} sender
 * @property {AccountId | string} recipient
 * @property {Long | number} serial
 */
export default class AbstractTokenTransferTransaction extends Transaction {
    /**
     * @param {object} [props]
     * @param {(TransferTokensInput)[]} [props.tokenTransfers]
     * @param {(TransferNftInput)[]} [props.nftTransfers]
     */
    constructor(props?: {
        tokenTransfers?: TransferTokensInput[] | undefined;
        nftTransfers?: TransferNftInput[] | undefined;
    });
    /**
     * @protected
     * @type {TokenTransfer[]}
     */
    protected _tokenTransfers: TokenTransfer[];
    /**
     * @protected
     * @type {TokenNftTransfer[]}
     */
    protected _nftTransfers: TokenNftTransfer[];
    /**
     * @param {NftId | TokenId | string} tokenIdOrNftId
     * @param {AccountId | string | Long | number} senderAccountIdOrSerialNumber
     * @param {AccountId | string} receiverAccountIdOrSenderAccountId
     * @param {(AccountId | string)=} receiver
     * @returns {this}
     */
    addNftTransfer(tokenIdOrNftId: NftId | TokenId | string, senderAccountIdOrSerialNumber: AccountId | string | Long | number, receiverAccountIdOrSenderAccountId: AccountId | string, receiver?: (AccountId | string) | undefined): this;
    /**
     * @param {TokenId | string} tokenId
     * @param {AccountId | string} accountId
     * @param {number | Long | BigNumber | bigint} amount
     * @param {boolean} isApproved
     * @param {number | null} expectedDecimals
     * @returns {this}
     */
    _addTokenTransfer(tokenId: TokenId | string, accountId: AccountId | string, amount: number | Long | BigNumber | bigint, isApproved: boolean, expectedDecimals: number | null): this;
    /**
     * @param {TokenId | string} tokenId
     * @param {AccountId | string} accountId
     * @param {number | Long | BigNumber | bigint} amount
     * @returns {this}
     */
    addTokenTransfer(tokenId: TokenId | string, accountId: AccountId | string, amount: number | Long | BigNumber | bigint): this;
    /**
     * @param {boolean} isApproved
     * @param {NftId | TokenId | string} tokenIdOrNftId
     * @param {AccountId | string | Long | number} senderAccountIdOrSerialNumber
     * @param {AccountId | string} receiverAccountIdOrSenderAccountId
     * @param {(AccountId | string)=} receiver
     * @returns {this}
     */
    _addNftTransfer(isApproved: boolean, tokenIdOrNftId: NftId | TokenId | string, senderAccountIdOrSerialNumber: AccountId | string | Long | number, receiverAccountIdOrSenderAccountId: AccountId | string, receiver?: (AccountId | string) | undefined): this;
    /**
     * @param {NftId | TokenId | string} tokenIdOrNftId
     * @param {AccountId | string | Long | number} senderAccountIdOrSerialNumber
     * @param {AccountId | string} receiverAccountIdOrSenderAccountId
     * @param {(AccountId | string)=} receiver
     * @returns {this}
     */
    addApprovedNftTransfer(tokenIdOrNftId: NftId | TokenId | string, senderAccountIdOrSerialNumber: AccountId | string | Long | number, receiverAccountIdOrSenderAccountId: AccountId | string, receiver?: (AccountId | string) | undefined): this;
    /**
     * @param {TokenId | string} tokenId
     * @param {AccountId | string} accountId
     * @param {number | Long | BigNumber | bigint} amount
     * @returns {this}
     */
    addApprovedTokenTransfer(tokenId: TokenId | string, accountId: AccountId | string, amount: number | Long | BigNumber | bigint): this;
    /**
     * @param {TokenId | string} tokenId
     * @param {AccountId | string} accountId
     * @param {number | Long | BigNumber | bigint} amount
     * @param {number} decimals
     * @returns {this}
     */
    addTokenTransferWithDecimals(tokenId: TokenId | string, accountId: AccountId | string, amount: number | Long | BigNumber | bigint, decimals: number): this;
    /**
     * @returns {NullableTokenDecimalMap}
     */
    get tokenIdDecimals(): NullableTokenDecimalMap;
    /**
     * @returns {TokenNftTransferMap}
     */
    get nftTransfers(): TokenNftTransferMap;
    /**
     * @returns {TokenTransferMap}
     */
    get tokenTransfers(): TokenTransferMap;
    /**
     * @override
     * @protected
     * @returns {HieroProto.proto.ITokenAirdropTransactionBody}
     */
    protected override _makeTransactionData(): HieroProto.proto.ITokenAirdropTransactionBody;
}
export type BigNumber = import("bignumber.js").default;
export namespace HieroProto {
    namespace proto {
        type ITokenAirdropTransactionBody = import("@hiero-ledger/proto").proto.ITokenAirdropTransactionBody;
    }
}
export type TransferTokensInput = {
    tokenId: TokenId | string;
    accountId: AccountId | string;
    amount: Long | number | BigNumber | bigint;
};
export type TransferNftInput = {
    tokenId: TokenId | string;
    sender: AccountId | string;
    recipient: AccountId | string;
    serial: Long | number;
};
import Transaction from "../transaction/Transaction.js";
import TokenTransfer from "./TokenTransfer.js";
import TokenNftTransfer from "../token/TokenNftTransfer.js";
import NftId from "./NftId.js";
import TokenId from "./TokenId.js";
import AccountId from "../account/AccountId.js";
import NullableTokenDecimalMap from "../account/NullableTokenDecimalMap.js";
import TokenNftTransferMap from "../account/TokenNftTransferMap.js";
import TokenTransferMap from "../account/TokenTransferMap.js";
