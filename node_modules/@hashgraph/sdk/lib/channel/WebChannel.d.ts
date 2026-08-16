export default class WebChannel extends Channel {
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
     * Promise that resolves when the health check is complete
     * Used to prevent multiple concurrent health checks
     *
     * @type {Promise<void>|null}
     * @private
     */
    private _healthCheckPromise;
    /**
     * Determines whether to use HTTPS based on the address
     * @param {string} address - The address to check
     * @returns {boolean} - True if HTTPS should be used, false for HTTP
     * @private
     */
    private _shouldUseHttps;
    /**
     * Builds the full URL with appropriate scheme (http/https)
     * @param {string} address - The base address
     * @returns {string} - The full URL with scheme
     * @private
     */
    private _buildUrl;
    /**
     * Check if the gRPC-Web proxy is reachable and healthy
     * Performs a POST request and verifies the response has gRPC-Web headers,
     * which indicates the proxy is running and processing gRPC requests.
     * Results are cached per address for the entire lifecycle.
     * Uses promise-based synchronization to prevent multiple concurrent health checks.
     *
     * @param {Date} deadline - Deadline for the health check
     * @returns {Promise<void>}
     * @private
     */
    private _waitForReady;
    /**
     * Performs the actual health check request
     * @param {Date} deadline - Deadline for the health check
     * @returns {Promise<void>}
     * @private
     */
    private _performHealthCheck;
}
import Channel from "./Channel.js";
