/**
 * Replaces any dot chars to __ and removes non-ascii charts
 * @param {string} dataKey
 * @param {boolean=} isEnvVar
 */
function normalizeOutputKey(dataKey: string, isEnvVar: boolean = false) {
    let outputKey = dataKey
        .replace(".", "__")
        .replace(new RegExp("-", "g"), "")
        .replace(/[^\p{L}\p{N}_-]/gu, "");
    if (isEnvVar) {
        outputKey = outputKey.toUpperCase();
    }
    return outputKey;
}

export {
    normalizeOutputKey
};
