/**
 * @typedef {object} EthereumTransactionDataEip7702JSON
 * @property {string} chainId
 * @property {string} nonce
 * @property {string} maxPriorityGas
 * @property {string} maxGas
 * @property {string} gasLimit
 * @property {string} to
 * @property {string} value
 * @property {string} callData
 * @property {Array<[string, string, string, string, string, string]>} authorizationList - Array of [chainId, contractAddress, nonce, yParity, r, s] tuples
 * @property {string[]} accessList
 * @property {string} recId
 * @property {string} r
 * @property {string} s
 */
export default class EthereumTransactionDataEip7702 extends EthereumTransactionData {
    /**
     * @private
     * @param {object} props
     * @param {Uint8Array} props.chainId
     * @param {Uint8Array} props.nonce
     * @param {Uint8Array} props.maxPriorityGas
     * @param {Uint8Array} props.maxGas
     * @param {Uint8Array} props.gasLimit
     * @param {Uint8Array} props.to
     * @param {Uint8Array} props.value
     * @param {Uint8Array} props.callData
     * @param {Array<[Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array]>} props.authorizationList - Array of [chainId, contractAddress, nonce, yParity, r, s] tuples
     * @param {Uint8Array[]} props.accessList
     * @param {Uint8Array} props.recId
     * @param {Uint8Array} props.r
     * @param {Uint8Array} props.s
     */
    private constructor();
    chainId: Uint8Array<ArrayBufferLike>;
    nonce: Uint8Array<ArrayBufferLike>;
    maxPriorityGas: Uint8Array<ArrayBufferLike>;
    maxGas: Uint8Array<ArrayBufferLike>;
    gasLimit: Uint8Array<ArrayBufferLike>;
    to: Uint8Array<ArrayBufferLike>;
    value: Uint8Array<ArrayBufferLike>;
    authorizationList: [Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>][];
    accessList: Uint8Array<ArrayBufferLike>[];
    recId: Uint8Array<ArrayBufferLike>;
    r: Uint8Array<ArrayBufferLike>;
    s: Uint8Array<ArrayBufferLike>;
    /**
     * @returns {EthereumTransactionDataEip7702JSON}
     */
    toJSON(): EthereumTransactionDataEip7702JSON;
}
export type EthereumTransactionDataEip7702JSON = {
    chainId: string;
    nonce: string;
    maxPriorityGas: string;
    maxGas: string;
    gasLimit: string;
    to: string;
    value: string;
    callData: string;
    /**
     * - Array of [chainId, contractAddress, nonce, yParity, r, s] tuples
     */
    authorizationList: Array<[string, string, string, string, string, string]>;
    accessList: string[];
    recId: string;
    r: string;
    s: string;
};
import EthereumTransactionData from "./EthereumTransactionData.js";
