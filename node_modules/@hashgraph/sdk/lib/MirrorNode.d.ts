/**
 * @typedef {import("./channel/MirrorChannel.js").default} MirrorChannel
 * @typedef {import("./ManagedNodeAddress.js").default} ManagedNodeAddress
 */
/**
 * @typedef {object} NewNode
 * @property {string} address
 * @property {(address: string, cert?: string) => MirrorChannel} channelInitFunction
 */
/**
 * @typedef {object} CloneNode
 * @property {MirrorNode} node
 * @property {ManagedNodeAddress} address
 */
/**
 * @augments {ManagedNode<MirrorChannel>}
 */
export default class MirrorNode extends ManagedNode<import("./channel/MirrorChannel.js").default> {
    /**
     * @param {object} props
     * @param {NewNode=} [props.newNode]
     * @param {CloneNode=} [props.cloneNode]
     */
    constructor(props?: {
        newNode?: NewNode | undefined;
        cloneNode?: CloneNode | undefined;
    });
    /**
     * Gets the base URL for this mirror node's REST API.
     *
     * @returns {string} The base URL for the mirror node REST API
     * @throws {Error} When the mirror node has invalid address configuration
     */
    get mirrorRestApiBaseUrl(): string;
    /**
     * Determines the appropriate scheme (http/https) based on the host and port.
     *
     * @private
     * @param {string} host - The host address
     * @param {number} port - The port number
     * @returns {string} - The scheme ('http' or 'https')
     */
    private _getSchemeFromHostAndPort;
}
export type MirrorChannel = import("./channel/MirrorChannel.js").default;
export type ManagedNodeAddress = import("./ManagedNodeAddress.js").default;
export type NewNode = {
    address: string;
    channelInitFunction: (address: string, cert?: string) => MirrorChannel;
};
export type CloneNode = {
    node: MirrorNode;
    address: ManagedNodeAddress;
};
import ManagedNode from "./ManagedNode.js";
