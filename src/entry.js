import * as core from '@actions/core';
import { exportSecrets } from './action.js';

(async () => {
    try {
        await core.group('Get Infisical Secrets', exportSecrets);
    } catch (error) {
        const message = (error instanceof Error) ? error.message : JSON.stringify(error);
        core.setOutput("errorMessage", message);
        core.setFailed(message);
    }
})();
