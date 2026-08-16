/**
 * @typedef {import("bignumber.js").default} BigNumber
 */
export default class PendingAirdropRecord {
    /**
     * @param {HieroProto.proto.PendingAirdropRecord} pb
     * @returns {PendingAirdropRecord}
     */
    static fromBytes(pb: HieroProto.proto.PendingAirdropRecord): PendingAirdropRecord;
    /**
     * @param {object} props
     * @param {PendingAirdropId} props.airdropId
     * @param {Long | number | BigNumber | bigint} props.amount
     */
    constructor(props: {
        airdropId: PendingAirdropId;
        amount: Long | number | BigNumber | bigint;
    });
    airdropId: PendingAirdropId;
    amount: Long;
    /**
     * @returns {HieroProto.proto.PendingAirdropRecord}
     */
    toBytes(): HieroProto.proto.PendingAirdropRecord;
}
export namespace HieroProto {
    namespace proto {
        type PendingAirdropRecord = import("@hiero-ledger/proto").proto.PendingAirdropRecord;
    }
}
export type BigNumber = import("bignumber.js").default;
import PendingAirdropId from "./PendingAirdropId.js";
import Long from "long";
