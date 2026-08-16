/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IFixedFee} HieroProto.proto.IFixedFee
 * @typedef {import("@hiero-ledger/proto").proto.ICustomFeeLimit} HieroProto.proto.ICustomFeeLimit
 */
export default class CustomFeeLimit {
    /**
     * @static
     * @param {HieroProto.proto.ICustomFeeLimit} customFeeLimit
     * @returns {CustomFeeLimit}
     */
    static _fromProtobuf(customFeeLimit: HieroProto.proto.ICustomFeeLimit): CustomFeeLimit;
    /**
     *
     * @param {object} props
     * @param {?AccountId | string} [props.accountId]
     * @param {?CustomFixedFee[]} [props.fees]
     */
    constructor(props?: {
        accountId?: string | AccountId | null | undefined;
        fees?: CustomFixedFee[] | null | undefined;
    });
    /**
     * @type {?AccountId}
     */
    _accountId: AccountId | null;
    /**
     * @type {?CustomFixedFee[]}
     */
    _fees: CustomFixedFee[] | null;
    /**
     * @returns {?AccountId}
     */
    getAccountId(): AccountId | null;
    /**
     *
     * @param {AccountId | string} accountId
     * @returns {this}
     */
    setAccountId(accountId: AccountId | string): this;
    /**
     * @returns {?CustomFixedFee[]}
     */
    getFees(): CustomFixedFee[] | null;
    /**
     *
     * @param {CustomFixedFee[]} fees
     * @returns {this}
     */
    setFees(fees: CustomFixedFee[]): this;
    /**
     *
     * @returns {HieroProto.proto.ICustomFeeLimit}
     */
    _toProtobuf(): HieroProto.proto.ICustomFeeLimit;
}
export namespace HieroProto {
    namespace proto {
        type IFixedFee = import("@hiero-ledger/proto").proto.IFixedFee;
        type ICustomFeeLimit = import("@hiero-ledger/proto").proto.ICustomFeeLimit;
    }
}
import AccountId from "../account/AccountId.js";
import CustomFixedFee from "../token/CustomFixedFee.js";
