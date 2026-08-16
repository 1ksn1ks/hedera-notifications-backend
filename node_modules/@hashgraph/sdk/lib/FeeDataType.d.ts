/**
 * @namespace proto
 * @typedef {import("@hiero-ledger/proto").proto.SubType} HieroProto.proto.SubType
 */
declare class FeeDataType {
    /**
     * @internal
     * @param {number} code
     * @returns {FeeDataType}
     */
    static _fromCode(code: number): FeeDataType;
    /**
     * @hideconstructor
     * @internal
     * @param {number} code
     */
    constructor(code: number);
    /** @readonly */
    readonly _code: number;
    /**
     * @returns {string}
     */
    toString(): string;
    /**
     * @returns {HieroProto.proto.SubType}
     */
    valueOf(): HieroProto.proto.SubType;
}
declare namespace FeeDataType {
    let Default: FeeDataType;
    let TokenFungibleCommon: FeeDataType;
    let TokenNonFungibleUnique: FeeDataType;
    let TokenFungibleCommonWithCustomFees: FeeDataType;
    let TokenNonFungibleUniqueWithCustomFees: FeeDataType;
    let ScheduleCreateContractCall: FeeDataType;
    let TopicCreateWithCustomFees: FeeDataType;
    let SubmitMessageWithCustomFees: FeeDataType;
    let CryptoTransferWithHooks: FeeDataType;
}
export default FeeDataType;
export namespace HieroProto {
    namespace proto {
        type SubType = import("@hiero-ledger/proto").proto.SubType;
    }
}
