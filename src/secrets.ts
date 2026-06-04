import * as core from '@actions/core';
import * as got from 'got';
import {WILDCARD} from './constants.js';
import {normalizeOutputKey} from './utils.js';

interface SecretRequest {
    path: string;
    selector: string;
    outputVarName?: string;
    envVarName?: string;
}

interface SecretResponse {
    request: SecretRequest;
    value: string;
    cachedResponse: boolean;
}

/**
 * @param {Array<SecretRequest>} secretRequests
 * @param {import('got').Got} client
 * @param {boolean} ignoreNotFound
 * @return {Promise<SecretResponse[]>}
 */
async function getSecrets(secretRequests: Array<SecretRequest>, client: import('got').Got, ignoreNotFound: boolean): Promise<SecretResponse[]> {
    const responseCache = new Map();
    let results = [];

    for (const secretRequest of secretRequests) {
        let {path, selector} = secretRequest;

        const pathSelector = selector !== WILDCARD ? normalizeOutputKey(selector, true) : '';
        const requestPath = `api/v3/secrets/raw/${pathSelector}`;
        let body: InfisicalSecretResponse;
        let cachedResponse = false;
        if (responseCache.has(requestPath)) {
            body = responseCache.get(requestPath);
            cachedResponse = true;
        } else {
            try {
                body = await client.extend({
                    searchParams: {
                        secretPath: path
                    }
                }).get(requestPath).json();
                responseCache.set(requestPath, body);
            } catch (error) {
                if (error instanceof got.HTTPError) {
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
                }
                throw error
            }
        }

        if (selector === WILDCARD) {
            const secrets: InfisicalSecret[] = body.secrets;
            for (const secret of secrets) {
                let newRequest = {...secretRequest};
                newRequest.selector = secret.secretKey;

                if (secretRequest.selector === secretRequest.outputVarName) {
                    newRequest.outputVarName = secret.secretKey;
                    newRequest.envVarName = secret.secretKey;
                } else {
                    newRequest.outputVarName = secretRequest.outputVarName + secret.secretKey;
                    newRequest.envVarName = secretRequest.envVarName + secret.secretKey;
                }

                if (newRequest.outputVarName === undefined || newRequest.envVarName === undefined) {
                    core.error(`Unable to retrieve result for "${path}/${pathSelector}" because it was not found`);
                    continue;
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
            const secret: InfisicalSecret = body.secret;
            results.push({
                request: secretRequest,
                value: secret.secretValue,
                cachedResponse,
            });
        }
    }

    return results;
}

interface InfisicalSecretResponse {
    secret: InfisicalSecret; // for single secret
    secrets: InfisicalSecret[]; // for multiple secrets (wildcard)
}

interface InfisicalSecret {
    environment: string;
    id: string;
    secretComment: string;
    secretKey: string;
    secretValue: string;
    type: string;
    version: string;
    workspace: string;
}

export {
    getSecrets
}
