import * as core from '@actions/core';
import * as got from 'got';

/***
 * Authenticate with Infisical and retrieve a Bearer token that can be used for requests.
 * @param {import('got').Got} client
 */
async function retrieveToken(client) {
    const path = `api/v1/auth/universal-auth/login`
    const clientId = core.getInput('clientId', { required: true });
    const clientSecret = core.getInput('clientSecret', { required: true });
    return await getClientToken(client, path, { clientId: clientId, clientSecret: clientSecret });
}

/***
 * Call the appropriate login endpoint and parse out the token in the response.
 * @param {import('got').Got} client
 * @param {string} path
 * @param {any} payload
 */
async function getClientToken(client, path, payload) {
    const options = {
        json: payload,
    };

    core.debug(`Retrieving Auth Token from ${path} endpoint`);

    /** @type {import('got').Response<LoginResponse>} */
    let response;
    try {
        response = await client.post(`${path}`, options).json();
    } catch (err) {
        if (err instanceof got.HTTPError) {
            throw Error(`failed to retrieve auth token. code: ${err.code}, message: ${err.message}, loginResponse: ${JSON.stringify(err.response.body)}`)
        } else {
            throw err
        }
    }
    if (response?.body?.auth?.accessToken) {
        core.debug('✔ Auth Token successfully retrieved');

        return response.body.auth.accessToken;
    } else {
        throw Error(`Unable to retrieve token from Universal Auth endpoint.`);
    }
}

/***
 * @typedef {Object} LoginResponse
 * @property {{
 *  accessToken: string;
 *  tokenType: string;
 *  expiresIn: number;
 *  accessTokenMaxTTL: number;
 * }} auth
 */

export {
    retrieveToken,
};
