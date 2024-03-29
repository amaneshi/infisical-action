import core from '@actions/core';
import { exportSecrets } from './action.js';

(async () => {
    try {
        await core.group('Get Infisical Secrets', exportSecrets);
    } catch (error) {
        core.setOutput("errorMessage", error.message);
        core.setFailed(error.message);
    }
})();
