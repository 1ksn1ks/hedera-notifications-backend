"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _MirrorNode = _interopRequireDefault(require("../MirrorNode.cjs"));
var _ManagedNetwork = _interopRequireDefault(require("./ManagedNetwork.cjs"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// SPDX-License-Identifier: Apache-2.0

/**
 * @typedef {import("../channel/MirrorChannel.js").default} MirrorChannel
 */

/**
 * @augments {ManagedNetwork<MirrorChannel, MirrorNode, string>}
 */
class MirrorNetwork extends _ManagedNetwork.default {
  /**
   * @param {(address: string) => MirrorChannel} channelInitFunction
   */
  constructor(channelInitFunction) {
    super(channelInitFunction);
  }

  /**
   * @param {string[]} network
   */
  setNetwork(network) {
    // eslint-disable-next-line ie11/no-collection-args
    this._setNetwork(new Map(network.map(address => [address, address])));
  }

  /**
   * @returns {string[]}
   */
  get network() {
    /**
     * @type {string[]}
     */
    var n = [];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const node of this._nodes) {
      n.push(node.address.toString());
    }
    return n;
  }

  /**
   * @abstract
   * @param {[string, string]} entry
   * @returns {MirrorNode}
   */
  _createNodeFromNetworkEntry(entry) {
    return new _MirrorNode.default({
      newNode: {
        address: entry[1],
        channelInitFunction: this._createNetworkChannel
      }
    }).setMinBackoff(this._minBackoff);
  }

  /**
   * @abstract
   * @param {Map<string, string>} network
   * @returns {number[]}
   */
  _getNodesToRemove(network) {
    const indexes = [];
    const values = Object.values(network);
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const node = this._nodes[i];
      if (!values.includes(node.address.toString())) {
        indexes.push(i);
      }
    }
    return indexes;
  }

  /**
   * @returns {MirrorNode}
   */
  getNextMirrorNode() {
    return this._getNumberOfMostHealthyNodes(1)[0];
  }

  /**
   * Gets the base URL for the mirror node REST API.
   *
   * @returns {string} The base URL for the mirror node REST API
   * @throws {Error} When no mirror network is configured or available
   */
  get mirrorRestApiBaseUrl() {
    try {
      const mirrorNode = this.getNextMirrorNode();
      return mirrorNode.mirrorRestApiBaseUrl;
    } catch (error) {
      // Re-throw with a more descriptive error message
      throw new Error("Client has no mirror network configured or no healthy mirror nodes are available");
    }
  }
}
exports.default = MirrorNetwork;