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
}

/**
 * @param {Array<SecretRequest>} secretRequests
 * @param {import('got').Got} client
 * @param {boolean} ignoreNotFound
 * @return {Promise<SecretResponse[]>}
 */
async function getSecrets(secretRequests: SecretRequest[], client: got.Got, ignoreNotFound: boolean): Promise<SecretResponse[]> {
    const secretGroups = new Map<string, SecretRequest[]>();
    let results: SecretResponse[] = [];

    for (const secretRequest of secretRequests) {
        if (secretGroups.has(secretRequest.path)) {
            secretGroups.set(secretRequest.path, [...secretGroups.get(secretRequest.path)!, secretRequest]);
            continue;
        }
        secretGroups.set(secretRequest.path, [secretRequest]);
    }
    for (const [secretPath, secretRequests] of secretGroups) {
        try {
            if (secretRequests.length === 1 && secretRequests[0].selector !== WILDCARD) {
                await getSingleSecret(secretRequests[0], client).then((responses) => {
                    responses.forEach((result) => {
                        results.push(result);
                    });
                });
                continue;
            }
            await getMultipleSecrets(secretPath, secretRequests, client).then((responses) => {
                responses.forEach((result) => {
                    results.push(result);
                });
            });
        } catch (error) {
            if (error instanceof got.HTTPError) {
                const {response} = error;
                if (response?.statusCode === 400) {
                    let notFoundMsg = `Unable to retrieve result for "${secretPath}}" because it was not found: ${response.body.trim()}`;
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

    return results;
}

/***
 * Retrieve a single secret.
 * @param {SecretRequest} secretRequest
 * @param {import('got').Got} client
 */
async function getSingleSecret(secretRequest: SecretRequest, client: got.Got): Promise<SecretResponse[]> {
    let {path, selector} = secretRequest;

    const pathSelector = normalizeOutputKey(selector, true);
    const requestPath = `api/v4/secrets/${pathSelector}`;
    return await client.extend({
        searchParams: {
            secretPath: path
        }
    }).get(requestPath).json<InfisicalSecretResponse>().then((body) => {
        return [{
            request: secretRequest,
            value: body.secret.secretValue,
        }];
    }).catch((error) => {
        throw error
    });
}

/***
 * Retrieve a multiple secrets.
 * @param {string} path
 * @param {SecretRequest[]} secretRequests
 * @param {import('got').Got} client
 */
async function getMultipleSecrets(path: string, secretRequests: SecretRequest[], client: got.Got): Promise<SecretResponse[]> {
    const requestsMap = new Map<string, SecretRequest>();
    for (const secretRequest of secretRequests) {
        if (requestsMap.has(secretRequest.selector)) {
            throw Error(`Duplicate key found: "${path}/${secretRequest.selector}"`);
        }
        requestsMap.set(secretRequest.selector, secretRequest);
    }

    const requestPath = `api/v4/secrets`;
    return await client.extend({
        searchParams: {secretPath: path}
    }).get(requestPath).json<InfisicalSecretsResponse>().then((body) => {
        const secrets: InfisicalSecret[] = body.secrets;
        if (requestsMap.has(WILDCARD)) {
            return secrets?.map(secret => ({
                request: {
                    path: secret.secretKey,
                    selector: secret.secretKey,
                    outputVarName: normalizeOutputKey(secret.secretKey)!,
                    envVarName: normalizeOutputKey(secret.secretKey, true)!,
                },
                value: secret.secretValue,
            }));
        }
        return secrets?.filter(
            secret => requestsMap.has(secret.secretKey)
        )?.map(secret => ({
                request: requestsMap.get(secret.secretKey)!,
                value: secret.secretValue,
            })
        )
    }).catch((error) => {
        throw error
    });
}

interface InfisicalSecretResponse {
    secret: InfisicalSecret;
}

interface InfisicalSecretsResponse {
    secrets: InfisicalSecret[];
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
