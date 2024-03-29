# Infisical GitHub Action

---

A helper action for easily pulling secrets from Infisical Vault.

Note: The Infisical Vault Github Action is a read-only action, and in general
is not meant to modify Vault’s state.

<!-- TOC -->

- [Infisical GitHub Action](#infisical-github-action)
    - [Example Usage](#example-usage)
    - [Universal Auth](#universal-auth)
    - [Key Syntax](#key-syntax)
        - [Simple Key](#simple-key)
        - [Set Output Variable Name](#set-output-variable-name)
        - [Multiple Secrets](#multiple-secrets)
    - [Adding Extra Headers](#adding-extra-headers)
    - [Reference](#reference)
    - [Masking - Hiding Secrets from Logs](#masking---hiding-secrets-from-logs)
    - [Normalization](#normalization)
    - [Contributing](#contributing)

<!-- /TOC -->

## Example Usage

```yaml
jobs:
    build:
        # ...
        steps:
            # ...
            - name: Import Secrets
              id: import-secrets
              uses: amaneshi/infisical-action@master
              with:
                url: https://infisical.mycompany.com
                clientId: ${{ secrets.CLIENT_ID }}
                clientSecret: ${{ secrets.CLIENT_SECRET }}
                workspaceId: ${{ secrets.WORKSPACE_ID }}
                environment: ${{ inputs.ENVIRONMENT }}
                secrets: |
                    /secret/data/ci/aws accessKey | AWS_ACCESS_KEY_ID ;
                    /secret/data/ci/aws secretKey | AWS_SECRET_ACCESS_KEY ;
                    /secret/data/ci npm_token
            # ...
```

Retrieved secrets are available as environment variables or outputs for subsequent steps:
```yaml
#...
            - name: Step following 'Import Secrets'
              run: |
                ACCESS_KEY_ID = "${{ env.AWS_ACCESS_KEY_ID }}"
                SECRET_ACCESS_KEY = "${{ steps.import-secrets.outputs.AWS_SECRET_ACCESS_KEY }}"
            # ...
```

If your project needs a format other than env vars and step outputs, you can use additional steps to transform them into the desired format.
For example, a common pattern is to save all the secrets in a JSON file:
```yaml
#...
            - name: Step following 'Import Secrets'
              run: |
                touch secrets.json
                echo '${{ toJson(steps.import-secrets.outputs) }}' >> secrets.json
            # ...
```

Which with our example would yield a file containing:
```json
{
  "ACCESS_KEY_ID": "MY_KEY_ID",
  "SECRET_ACCESS_KEY": "MY_SECRET_KEY",
  "NPM_TOKEN": "MY_NPM_TOKEN"
}
```

Note that all secrets are masked so programs need to read the file themselves otherwise all values will be replaced with a `***` placeholder.


## Universal Auth

The [Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) allows
to authenticate to Infisical Vault with a pre-defined identity.
Set the client ID and client secret as GitHub secrets and pass them to the
`clientId` and `clientSecret` parameters.

```yaml
with:
  url: https://infisical.mycompany.com
  clientId: ${{ secrets.INFISICAL_CLIENT_ID }}
  clientSecret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
```

## Key Syntax

The `secrets` parameter is a set of multiple secret requests separated by the `;` character.

Each secret request consists of the `path` and the `key` of the desired secret, and optionally the desired Env Var output name.

```raw
{{ Secret Path }} {{ Secret Key or Selector }} | {{ Env/Output Variable Name }}
```

### Simple Key

To retrieve a key `npmToken` from path `/secret/data/ci` that has value `somelongtoken` from vault you could do:

```yaml
with:
    secrets: /secret/data/ci npmToken
```

`infisical-action` will automatically normalize the given secret selector key, and set the follow as environment variables for the following steps in the current job:

```bash
NPMTOKEN=somelongtoken
```

You can also access the secret via outputs:

```yaml
steps:
    # ...
    - name: Import Secrets
      id: secrets
      # Import config...
    - name: Sensitive Operation
      run: "my-cli --token '${{ steps.secrets.outputs.npmToken }}'"
```

_**Note:** If you'd like to only use outputs and disable automatic environment variables, you can set the `exportEnv` option to `false`._

### Set Output Variable Name

However, if you want to set it to a specific name, say `NPM_TOKEN`, you could do this instead:

```yaml
with:
    secrets: /secret/data/ci npmToken | NPM_TOKEN
```

With that, `infisical-action` will now use your requested name and output:

```bash
NPM_TOKEN=somelongtoken
```

```yaml
steps:
  # ...
  - name: Import Secrets
    id: secrets
    # Import config...
  - name: Sensitive Operation
    run: "my-cli --token '${{ steps.secrets.outputs.NPM_TOKEN }}'"

```

### Multiple Secrets

This action can take multi-line input, so say you had your AWS keys stored in a path and wanted to retrieve both of them. You can do:

```yaml
with:
    secrets: |
        /secret/data/ci/aws accessKey | AWS_ACCESS_KEY_ID ;
        /secret/data/ci/aws secretKey | AWS_SECRET_ACCESS_KEY
```
You can specify a wildcard * for the key name to get all keys in the path.  If you provide an output name with the wildcard, the name will be prepended to the key name:

```yaml
with:
    secrets: |
        /secret/data/ci/aws * | MYAPP_ ;
```
## Adding Extra Headers

If you ever need to add extra headers to the request, say if you need to authenticate with a firewall, all you need to do is set `extraHeaders`:

```yaml
with:
    secrets: |
        /secret/ci/aws accessKey | AWS_ACCESS_KEY_ID ;
        /secret/ci/aws secretKey | AWS_SECRET_ACCESS_KEY
    extraHeaders: |
      X-Secure-Id: ${{ secrets.SECURE_ID }}
      X-Secure-Secret: ${{ secrets.SECURE_SECRET }}
```

This will automatically add the `x-secure-id` and `x-secure-secret` headers to every request to Infisical Vault.

## Reference

Here are all the inputs available through `with`:

### `url`

**Type: `string`**

Infisical API URL (defaults to https://app.infisical.com).

### `secrets`

**Type: `string`**

A semicolon-separated list of secrets to retrieve. These will automatically be
converted to environmental variable keys. See [Key Syntax](#key-syntax) for
more details.

### `workspaceId`

**Type: `string`**\
**Required**

Infisical Project ID.

### `environment`

**Type: `string`**\
**Required**

The environment slug to fetch secrets for (e.g., staging, prod).

### `clientId`

**Type: `string`**\
**Required**

The client ID for Universal authentication.

### `clientSecret`

**Type: `string`**\
**Required**

The client secret for Universal authentication.

### `extraHeaders`

**Type: `string`**

A string of newline separated extra headers to include on every request.

### `exportEnv`

**Type: `string`**\
**Default: `true`**

Whether to export secrets as environment variables.

### `tlsSkipVerify`

**Type: `string`**\
**Default: `false`**

When set to true, disables verification of server certificates when testing the action.

### `ignoreNotFound`

**Type: `string`**\
**Default: `false`**

When set to true, prevents the action from failing when a secret does not exist.

## Masking - Hiding Secrets from Logs

This action uses GitHub Action's built-in masking, so all variables will automatically be masked (aka hidden) if printed to the console or to logs.
**This only obscures secrets from output logs.** If someone has the ability to edit your workflows, then they are able to read and therefore write secrets to somewhere else just like normal GitHub Secrets.

## Normalization

To make it simpler to consume certain secrets as env vars, if no Env/Output Var Name is specified `infisical-action` will replace and `.` chars with `__`, remove any other non-letter or number characters. If you're concerned about the result, it's recommended to provide an explicit Output Var Key.

## Contributing

If you wish to contribute to this project, the following dependencies are recommended for local development:
- [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) to install dependencies and build project
- [act](https://github.com/nektos/act) to run the vault-action locally

### Build

Use npm to install dependencies and build the project:

```sh
$ npm install && npm run build
```

### Running the action locally

You can use the [act](https://github.com/nektos/act) command to test your changes locally.

Edit the ./.github/workflows/build.yaml file and add any steps necessary
to test your changes.

Run your feature branch locally:

```sh
act workflow_dispatch -j build
```
