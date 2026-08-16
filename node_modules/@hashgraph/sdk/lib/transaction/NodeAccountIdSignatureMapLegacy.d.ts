/**
 * @deprecated
 * @augments {ObjectMap<PublicKey, Uint8Array>}
 */
export default class NodeAccountIdSignatureMap extends ObjectMap<PublicKey, Uint8Array<ArrayBufferLike>> {
    /**
     * @param {import("@hiero-ledger/proto").proto.ISignatureMap} sigMap
     * @returns {NodeAccountIdSignatureMap}
     */
    static _fromTransactionSigMap(sigMap: import("@hiero-ledger/proto").proto.ISignatureMap): NodeAccountIdSignatureMap;
    constructor();
}
import PublicKey from "../PublicKey.js";
import ObjectMap from "../ObjectMap.js";
