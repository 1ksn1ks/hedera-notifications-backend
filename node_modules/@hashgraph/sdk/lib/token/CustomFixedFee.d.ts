/**
 * @typedef {import("bignumber.js").default} BigNumber
 */
/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.ICustomFee} HieroProto.proto.ICustomFee
 * @typedef {import("@hiero-ledger/proto").proto.IFixedFee} HieroProto.proto.IFixedFee
 * @typedef {import("@hiero-ledger/proto").proto.IFixedCustomFee} HieroProto.proto.IFixedCustomFee
 */
export default class CustomFixedFee extends CustomFee {
    /**
     * @internal
     * @override
     * @param {HieroProto.proto.ICustomFee} info
     * @returns {CustomFixedFee}
     */
    static override _fromProtobuf(info: HieroProto.proto.ICustomFee): CustomFixedFee;
    /**
     * @param {object} props
     * @param {AccountId | string} [props.feeCollectorAccountId]
     * @param {boolean} [props.allCollectorsAreExempt]
     * @param {TokenId | string} [props.denominatingTokenId]
     * @param {Long | number | BigNumber | bigint} [props.amount]
     */
    constructor(props?: {
        feeCollectorAccountId?: string | AccountId | undefined;
        allCollectorsAreExempt?: boolean | undefined;
        denominatingTokenId?: string | TokenId | undefined;
        amount?: number | bigint | import("long") | import("bignumber.js").BigNumber | undefined;
    });
    /**
     * @type {?TokenId}
     */
    _denominatingTokenId: TokenId | null;
    /**
     * @type {?Long}
     */
    _amount: Long | null;
    /**
     * @param {Hbar} amount
     * @returns {CustomFixedFee}
     */
    setHbarAmount(amount: Hbar): CustomFixedFee;
    /**
     * @returns {TokenId | Hbar | null}
     */
    get hbarAmount(): TokenId | Hbar | null;
    /**
     * @returns {CustomFixedFee}
     */
    setDenominatingTokenToSameToken(): CustomFixedFee;
    /**
     * @returns {?TokenId}
     */
    get denominatingTokenId(): TokenId | null;
    /**
     * @param {TokenId | string} denominatingTokenId
     * @returns {CustomFixedFee}
     */
    setDenominatingTokenId(denominatingTokenId: TokenId | string): CustomFixedFee;
    /**
     * @returns {?Long}
     */
    get amount(): Long | null;
    /**
     * @param {Long | number | BigNumber | bigint} amount
     * @returns {CustomFixedFee}
     */
    setAmount(amount: Long | number | BigNumber | bigint): CustomFixedFee;
    /**
     * @internal
     * @abstract
     * @returns {HieroProto.proto.IFixedCustomFee}
     */
    _toTopicFeeProtobuf(): HieroProto.proto.IFixedCustomFee;
}
export type BigNumber = import("bignumber.js").default;
export namespace HieroProto {
    namespace proto {
        type ICustomFee = import("@hiero-ledger/proto").proto.ICustomFee;
        type IFixedFee = import("@hiero-ledger/proto").proto.IFixedFee;
        type IFixedCustomFee = import("@hiero-ledger/proto").proto.IFixedCustomFee;
    }
}
import CustomFee from "./CustomFee.js";
import TokenId from "./TokenId.js";
import Hbar from "../Hbar.js";
import AccountId from "../account/AccountId.js";
