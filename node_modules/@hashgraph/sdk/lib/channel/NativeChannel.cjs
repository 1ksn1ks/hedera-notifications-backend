"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Channel = _interopRequireWildcard(require("./Channel.cjs"));
var base64 = _interopRequireWildcard(require("../encoding/base64.native.cjs"));
var _HttpError = _interopRequireDefault(require("../http/HttpError.cjs"));
var _HttpStatus = _interopRequireDefault(require("../http/HttpStatus.cjs"));
var _version = require("../version.cjs");
var _GrpcServiceError = _interopRequireDefault(require("../grpc/GrpcServiceError.cjs"));
var _GrpcStatus = _interopRequireDefault(require("../grpc/GrpcStatus.cjs"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
// SPDX-License-Identifier: Apache-2.0

class NativeChannel extends _Channel.default {
  /**
   * @param {string} address
   * @param {number=} grpcDeadline
   */
  constructor(address, grpcDeadline) {
    super(grpcDeadline);

    /**
     * @type {string}
     * @private
     */
    this._address = address;

    /**
     * Flag indicating if the connection is ready (health check has passed)
     * Set to true after the first successful health check
     *
     * @type {boolean}
     * @private
     */
    this._isReady = false;
  }

  /**
   * @override
   * @returns {void}
   */
  close() {
    // do nothing
  }

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
  async _waitForReady(deadline) {
    // Check if we've already validated this address
    if (this._isReady) {
      return; // Health check already passed for this address
    }
    const shouldUseHttps = !(this._address.includes("localhost") || this._address.includes("127.0.0.1"));
    const address = shouldUseHttps ? `https://${this._address}` : `http://${this._address}`;

    // Calculate remaining time until deadline
    const timeoutMs = deadline.getTime() - Date.now();
    if (timeoutMs <= 0) {
      throw new _GrpcServiceError.default(_GrpcStatus.default.Timeout);
    }
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      // Make a POST request to verify the gRPC-Web proxy is running
      // We use a minimal gRPC-Web compatible request
      //eslint-disable-next-line n/no-unsupported-features/node-builtins
      const response = await fetch(address, {
        method: "POST",
        headers: {
          "content-type": "application/grpc-web-text",
          "x-user-agent": `${_version.SDK_NAME}/${_version.SDK_VERSION}`,
          "x-grpc-web": "1"
        },
        body: base64.encode(new Uint8Array(0)),
        // Empty body for health check
        signal: abortController.signal
      });
      clearTimeout(timeoutId);

      // Check if response is successful (200) and has gRPC headers
      if (response.status === 200) {
        const grpcStatus = response.headers.get("grpc-status");
        const grpcMessage = response.headers.get("grpc-message");

        // If gRPC headers exist, the proxy is running and processing requests
        if (grpcStatus != null || grpcMessage != null) {
          // Mark this connection as ready
          this._isReady = true;
          return; //  Healthy - gRPC-Web proxy is responding
        }
      }

      // If we get here, either status isn't 200 or no gRPC headers present
      // This means the proxy might not be configured correctly or not running
      throw new _GrpcServiceError.default(_GrpcStatus.default.Unavailable);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new _GrpcServiceError.default(_GrpcStatus.default.Timeout);
      }
      if (error instanceof _GrpcServiceError.default) {
        throw error;
      }

      // Network error - server is not reachable
      throw new _GrpcServiceError.default(_GrpcStatus.default.Unavailable);
    }
  }

  /**
   * @override
   * @protected
   * @param {string} serviceName
   * @returns {import("protobufjs").RPCImpl}
   */
  _createUnaryClient(serviceName) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return async (method, requestData, callback) => {
      // Calculate deadline for connection check
      const deadline = new Date();
      const milliseconds = this._grpcDeadline;
      deadline.setMilliseconds(deadline.getMilliseconds() + milliseconds);
      try {
        // Wait for connection to be ready (similar to gRPC waitForReady)
        await this._waitForReady(deadline);
        const data = base64.encode(new Uint8Array((0, _Channel.encodeRequest)(requestData)));
        const shouldUseHttps = !(this._address.includes("localhost") || this._address.includes("127.0.0.1"));
        const address = shouldUseHttps ? `https://${this._address}` : `http://${this._address}`;
        // this will be executed in react native environment sho
        // fetch should be available
        //eslint-disable-next-line n/no-unsupported-features/node-builtins
        const response = await fetch(`${address}/proto.${serviceName}/${method.name}`, {
          method: "POST",
          headers: {
            "content-type": "application/grpc-web-text",
            "x-user-agent": `${_version.SDK_NAME}/${_version.SDK_VERSION}`,
            "x-accept-content-transfer-encoding": "base64",
            "x-grpc-web": "1"
          },
          body: data
        });
        if (!response.ok) {
          const error = new _HttpError.default(_HttpStatus.default._fromValue(response.status));
          callback(error, null);
        }
        const blob = await response.blob();

        /** @type {string} */
        const responseData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            resolve(/** @type {string} */reader.result);
          };
          reader.onerror = reject;
        });
        let responseBuffer;
        if (responseData.startsWith("data:application/octet-stream;base64,")) {
          responseBuffer = base64.decode(responseData.split("data:application/octet-stream;base64,")[1]);
        } else if (responseData.startsWith("data:application/grpc-web+proto;base64,")) {
          responseBuffer = base64.decode(responseData.split("data:application/grpc-web+proto;base64,")[1]);
        } else {
          throw new Error(`Expected response data to be base64 encode with a 'data:application/octet-stream;base64,' or 'data:application/grpc-web+proto;base64,' prefix, but found: ${responseData}`);
        }
        const unaryResponse = (0, _Channel.decodeUnaryResponse)(
        // @ts-ignore
        responseBuffer.buffer, responseBuffer.byteOffset, responseBuffer.byteLength);
        callback(null, unaryResponse);
      } catch (error) {
        if (error instanceof _GrpcServiceError.default) {
          callback(error, null);
          return;
        }
        callback(/** @type {Error} */error, null);
      }
    };
  }
}
exports.default = NativeChannel;