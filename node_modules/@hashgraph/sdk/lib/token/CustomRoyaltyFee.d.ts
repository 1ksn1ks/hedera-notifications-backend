/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.IFraction} HieroProto.proto.IFraction
 * @typedef {import("@hiero-ledger/proto").proto.IRoyaltyFee} HieroProto.proto.IRoyaltyFee
 * @typedef {import("@hiero-ledger/proto").proto.ICustomFee} HieroProto.proto.ICustomFee
 * @typedef {import("@hiero-ledger/proto").proto.IFixedFee} HieroProto.proto.IFixedFee
 */
export default class CustomRoyalyFee extends CustomFee {
    /**
     * @param {object} props
     * @param {AccountId | string} [props.feeCollectorAccountId]
     * @param {boolean} [props.allCollectorsAreExempt]
     * @param {Long | number} [props.numerator]
     * @param {Long | number} [props.denominator]
     * @param {CustomFixedFee} [props.fallbackFee]
     */
    constructor(props?: {
        feeCollectorAccountId?: string | AccountId | undefined;
        allCollectorsAreExempt?: boolean | undefined;
        numerator?: number | Long | undefined;
        denominator?: number | Long | undefined;
        fallbackFee?: CustomFixedFee | undefined;
    });
    /**
     * @type {?CustomFixedFee}
     */
    _fallbackFee: CustomFixedFee | null;
    /**
     * @type {?Long}
     */
    _numerator: Long | null;
    /**
     * @type {?Long}
     */
    _denominator: Long | null;
    /**
     * @returns {?CustomFixedFee}
     */
    get fallbackFee(): CustomFixedFee | null;
    /**
     * @param {CustomFixedFee} fallbackFee
     * @returns {CustomRoyalyFee}
     */
    setFallbackFee(fallbackFee: CustomFixedFee): CustomRoyalyFee;
    /**
     * @returns {?Long}
     */
    get numerator(): Long | null;
    /**
     * @param {Long | number} numerator
     * @returns {CustomRoyalyFee}
     */
    setNumerator(numerator: Long | number): CustomRoyalyFee;
    /**
     * @returns {?Long}
     */
    get denominator(): Long | null;
    /**
     * @param {Long | number} denominator
     * @returns {CustomRoyalyFee}
     */
    setDenominator(denominator: Long | number): CustomRoyalyFee;
}
export namespace HieroProto {
    namespace proto {
        type IFraction = import("@hiero-ledger/proto").proto.IFraction;
        type IRoyaltyFee = import("@hiero-ledger/proto").proto.IRoyaltyFee;
        type ICustomFee = import("@hiero-ledger/proto").proto.ICustomFee;
        type IFixedFee = import("@hiero-ledger/proto").proto.IFixedFee;
    }
}
import CustomFee from "./CustomFee.js";
import CustomFixedFee from "./CustomFixedFee.js";
import Long from "long";
import AccountId from "../account/AccountId.js";
