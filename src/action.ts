import * as core from '@actions/core';
import * as got from 'got';
import {Buffer} from 'node:buffer';

import {normalizeOutputKey} from './utils.js';
import {retrieveToken} from './auth.js';
import {getSecrets} from './secrets.js';

const ENCODING_TYPES = ['base64', 'hex', 'utf8'];

async function exportSecrets() {
    const backendUrl = core.getInput('url', {required: true});
    const workspaceId = core.getInput('workspaceId', {required: true});
    const environment = core.getInput('environment', {required: true});
    const extraHeaders = parseHeadersInput('extraHeaders', {required: false});
    const exportEnv = core.getInput('exportEnv', {required: false}) !== 'false';

    const secretsInput = core.getInput('secrets', {required: false});
    const secretRequests = parseSecretsInput(secretsInput);

    const secretEncodingType = core.getInput('secretEncodingType', {required: false});
    const ignoreNotFound = (core.getInput('ignoreNotFound', {required: false}) || 'false').toLowerCase() !== 'false';

    const defaultOptions = {
        prefixUrl: backendUrl,
        headers: {} as got.Headers,
        https: {} as got.HttpsOptions,
        searchParams: {} as got.SearchParameters,
        retry: {
            statusCodes: [
                ...(got.default.defaults.options.retry.statusCodes ?? []),
                // Backend returns 412 when the token in use hasn't yet been replicated
                // to the performance replica queried. See issue #332.
                412,
            ]
        } as got.RetryOptions
    }

    const tlsSkipVerify = (core.getInput('tlsSkipVerify', {required: false}) || 'false').toLowerCase() !== 'false';
    if (tlsSkipVerify) {
        defaultOptions.https.rejectUnauthorized = false;
    }

    for (const [headerName, headerValue] of extraHeaders) {
        defaultOptions.headers[headerName] = headerValue;
    }

    const authToken = await retrieveToken(got.default.extend(defaultOptions));
    core.setSecret(authToken)
    defaultOptions.headers['Authorization'] = "Bearer " + authToken;
    defaultOptions.searchParams = {projectId: workspaceId, environment: environment};
    const client = got.default.extend(defaultOptions);

    const results = await getSecrets(secretRequests, client, ignoreNotFound);


    for (const result of results) {
        // Output the result

        let value = result.value;
        const request = result.request;

        // if a secret is encoded, decode it
        if (ENCODING_TYPES.includes(secretEncodingType) && Buffer.isEncoding(secretEncodingType)) {
            value = Buffer.from(value, secretEncodingType).toString();
        }

        for (const line of value.replace(/\r/g, '').split('\n')) {
            if (line.length > 0) {
                core.setSecret(line);
            }
        }
        if (exportEnv) {
            core.exportVariable(request.envVarName!, `${value}`);
        }
        core.setOutput(request.outputVarName!, `${value}`);
        core.debug(`✔ ${request.path} => outputs.${request.outputVarName}${exportEnv ? ` | env.${request.envVarName}` : ''}`);
    }
}

interface SecretRequest {
    path: string;
    envVarName: string;
    outputVarName: string;
    selector: string;
}

/**
 * Parses a secrets input string into key paths and their resulting environment variable name.
 * @param {string} secretsInput
 */
function parseSecretsInput(secretsInput: string): SecretRequest[] {
    if (!secretsInput) {
        return []
    }

    const secrets = secretsInput
        .split(';')
        .filter(key => !!key)
        .map(key => key.trim())
        .filter(key => key.length !== 0);

    const output: SecretRequest[] = [];
    for (const secret of secrets) {

        const secretParts = secret
            .split('|')
            .map(part => part.trim())
            .filter(part => part.length !== 0);

        let pathSpec = secretParts[0];

        const pathParts = pathSpec
            .split(/\s+/)
            .map(part => part.trim())
            .filter(part => part.length !== 0);

        if (pathParts.length !== 2) {
            throw Error(`You must provide a valid path and key. Input: "${secret}"`);
        }

        const [path, selector] = pathParts;

        let outputVarName = secretParts.length > 1 ? secretParts[1] : normalizeOutputKey(selector);
        let envVarName = secretParts.length > 1 ? secretParts[1] : normalizeOutputKey(selector, true);

        output.push({
            path,
            envVarName,
            outputVarName,
            selector
        });
    }
    return output;
}

/**
 * @param {string} inputKey
 * @param {any} inputOptions
 */
function parseHeadersInput(inputKey: string, inputOptions: any) {
    const rawHeadersString: string = core.getInput(inputKey, inputOptions) || '';
    const headerStrings = rawHeadersString
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');
    return headerStrings
        .reduce((map, line) => {
            const separator = line.indexOf(':');
            const key = line.substring(0, separator).trim().toLowerCase();
            const value = line.substring(separator + 1).trim();
            if (map.has(key)) {
                map.set(key, [map.get(key), value].join(', '));
            } else {
                map.set(key, value);
            }
            return map;
        }, new Map());
}

export {
    exportSecrets,
    parseSecretsInput,
    parseHeadersInput,
}
