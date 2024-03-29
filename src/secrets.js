import core from '@actions/core';
import {WILDCARD} from './constants.js';
import {normalizeOutputKey} from './utils.js';

/**
 * @typedef {Object} SecretRequest
 * @property {string} path
 * @property {string} selector
 */

/**
 * @template {SecretRequest} TRequest
 * @typedef {Object} SecretResponse
 * @property {TRequest} request
 * @property {string} value
 * @property {boolean} cachedResponse
 */

/**
 * @template TRequest
 * @param {Array<TRequest>} secretRequests
 * @param {import('got').Got} client
 * @param ignoreNotFound
 * @return {Promise<SecretResponse<TRequest>[]>}
 */
async function getSecrets(secretRequests, client, ignoreNotFound) {
    const responseCache = new Map();
    let results = [];

    for (const secretRequest of secretRequests) {
        let {path, selector} = secretRequest;

        const pathSelector = selector !== WILDCARD ? normalizeOutputKey(selector, true) : '';
        const requestPath = `api/v3/secrets/raw/${pathSelector}?secretPath=${encodeURIComponent(path)}`;
        /** @type {any} */
        let body;
        let cachedResponse = false;
        if (responseCache.has(requestPath)) {
            body = responseCache.get(requestPath);
            cachedResponse = true;
        } else {
            try {
                const result = await client.extend('', {
                    searchParams: {
                        secretPath: path
                    }
                }).get(requestPath)
                body = result.body;
                responseCache.set(requestPath, body);
            } catch (error) {
                const {response} = error;
                if (response?.statusCode === 400) {
                    let notFoundMsg = `Unable to retrieve result for "${path}/${pathSelector}" because it was not found: ${response.body.trim()}`;
                    if (ignoreNotFound) {
                        core.error(`✘ ${notFoundMsg}`);
                        continue;
                    } else {
                        throw Error(notFoundMsg)
                    }
                }
                throw error
            }
        }

        body = JSON.parse(body);

        if (selector === WILDCARD) {
            /** @type {InfisicalSecret[]} */
            const secrets = body.secrets;
            for (const secret of secrets) {
                let newRequest = Object.assign({}, secretRequest);
                newRequest.selector = secret.secretKey;

                if (secretRequest.selector === secretRequest.outputVarName) {
                    newRequest.outputVarName = secret.secretKey;
                    newRequest.envVarName = secret.secretKey;
                } else {
                    newRequest.outputVarName = secretRequest.outputVarName + secret.secretKey;
                    newRequest.envVarName = secretRequest.envVarName + secret.secretKey;
                }

                newRequest.outputVarName = normalizeOutputKey(newRequest.outputVarName);
                newRequest.envVarName = normalizeOutputKey(newRequest.envVarName, true);

                results.push({
                    request: newRequest,
                    value: secret.secretValue,
                    cachedResponse,
                });
            }
        } else {
            /** @type {InfisicalSecret} */
            const secret = body.secret;
            results.push({
                request: secretRequest,
                value: secret.secretValue,
                cachedResponse,
            });
        }
    }

    return results;
}

/***
 * @typedef {Object} InfisicalSecret
 * @property {string} environment
 * @property {string} id
 * @property {string} secretComment
 * @property {string} secretKey
 * @property {string} secretValue
 * @property {string} type
 * @property {string} version
 * @property {string} workspace
 */

export {
    getSecrets
}
