import * as core from '@actions/core';
import {exportSecrets} from './action.js';

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
    try {
        await core.group('Get Infisical Secrets', exportSecrets);
    } catch (error) {
        const message = (error instanceof Error) ? error.message : JSON.stringify(error);
        core.setOutput("errorMessage", message);
        core.setFailed(message);
    }
}