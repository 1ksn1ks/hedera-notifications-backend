export default class NativeChannel extends Channel {
    /**
     * @param {string} address
     * @param {number=} grpcDeadline
     */
    constructor(address: string, grpcDeadline?: number | undefined);
    /**
     * @type {string}
     * @private
     */
    private _address;
    /**
     * Flag indicating if the connection is ready (health check has passed)
     * Set to true after the first successful health check
     *
     * @type {boolean}
     * @private
     */
    private _isReady;
    /**
     * Check if the gRPC-Web proxy is reachable and healthy
     * Performs a POST request and verifies the response has gRPC-Web headers,
     * which indicates the proxy is running and processing gRPC requests.
     * Results are cached per address for the entire lifecycle.
     *
     * @param {Date} deadline - Deadline for the health check
     * @returns {Promise<void>}
     * @private
     */
    private _waitForReady;
}
import Channel from "./Channel.js";
