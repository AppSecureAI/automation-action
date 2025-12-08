# Contributing to Automation Action

## Code Standards

### Copyright Header

All source files must include the following copyright header at the top of the
file:

```
# path/to/file.ts
# Copyright (c) 2025 AppSecAI, Inc. All rights reserved.
# This software and its source code are the proprietary information of AppSecAI, Inc.
# Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.
```

Adjust the comment syntax as appropriate for the file type (e.g., `//` for
TypeScript/JavaScript, `#` for Python/Shell).

## Initial Setup

After you've cloned the repository to your local machine or codespace, you'll
need to perform some initial setup steps before you can develop your action.

> [!NOTE]
>
> You'll need to have a reasonably modern version of
> [Node.js](https://nodejs.org) handy (20.x or later should work!). If you are
> using a version manager like [`nodenv`](https://github.com/nodenv/nodenv) or
> [`fnm`](https://github.com/Schniz/fnm), this repository has a `.node-version`
> file at the root that can be used to automatically switch to the correct
> version when you `cd` into the repository. Additionally, this `.node-version`
> file is used by GitHub Actions in any `actions/setup-node` actions.

1. :hammer_and_wrench: Install the dependencies

   ```bash
   npm install
   ```

1. :building_construction: Package the TypeScript for distribution

   ```bash
   npm run bundle
   ```

1. :white_check_mark: Run the tests

   ```bash
   npm test
   ```

## Update the Action Metadata

The [`action.yml`](action.yml) file defines metadata about your action, such as
input(s) and output(s). For details about this file, see
[Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions).

## Update the Action Code

The [`src/`](./src/) directory is the heart of your action! This contains the
source code that will be run when your action is invoked.

There are a few things to keep in mind when writing your action code:

- Most GitHub Actions toolkit and CI/CD operations are processed asynchronously.
  In `main.ts`, you will see that the action is run in an `async` function.

  ```javascript
  import * as core from '@actions/core'
  //...

  async function run() {
    try {
      //...
    } catch (error) {
      core.setFailed(error.message)
    }
  }
  ```

  For more information about the GitHub Actions toolkit, see the
  [documentation](https://github.com/actions/toolkit/blob/master/README.md).

## Development Workflow

1. Create a new branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Format, test, and build the action

   ```bash
   npm run all
   ```

   > This step is important! It will run [`rollup`](https://rollupjs.org/) to
   > build the final JavaScript action code with all dependencies included. If
   > you do not run this step, your action will not work correctly when it is
   > used in a workflow.

3. (Optional) Test your action locally

   The [`@github/local-action`](https://github.com/github/local-action) utility
   can be used to test your action locally. It is a simple command-line tool
   that "stubs" (or simulates) the GitHub Actions Toolkit. This way, you can run
   your TypeScript action locally without having to commit and push your changes
   to a repository.

   ### Preparing your environment for local testing
   1. **Copy the example environment file:**

      The `.env.example` file in the root of this repository provides a template
      for the environment variables required to test your action. Copy it to
      create your own `.env` file:

      ```bash
      cp .env.example .env
      ```

   2. **Customize your `.env` file:**

      Edit `.env` to set the inputs and environment variables your action
      expects. For this action, you need to set the following:

      ```env
      # The SARIF or JSON file to be processed (required)
      INPUT_FILE=results.sarif
      ```

      - All action inputs should be prefixed with `INPUT_` and be uppercase.
      - See the
        [GitHub Actions Documentation](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables)
        for more information about environment variables.

   3. **Run your action locally:**

      Use the following command to run your action with the local environment:

      ```bash
      npx @github/local-action . src/main.ts .env
      ```

      This will execute your action as if it were running in a GitHub Actions
      workflow, using the environment variables from your `.env` file.

4. Commit your changes

   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

5. Push them to your repository

   ```bash
   git push -u origin feature/your-feature-name
   ```

6. Create a pull request and get feedback on your changes
7. Merge the pull request into the `main` branch

## Validate the Action

You can validate the action by referencing it in a workflow file. For example,
[`ci.yml`](./.github/workflows/ci.yml) demonstrates how to reference an action
in the same repository.

```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v4

  - name: Run Automation Action
    id: automation-action
    uses: ./
    with:
      file: results.sarif

  - name: Print Output
    id: output
    run: echo "${{ steps.automation-action.outputs.message }}"
```

For workflow runs, check out the
[Actions tab](https://github.com/AppSecureAI/automation-action/actions)!

## Usage

After testing, you can create version tag(s) that developers can use to
reference different stable versions of your action. For more information, see
[Versioning](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)
in the GitHub Actions toolkit.

To include the action in a workflow in another repository, you can use the
`uses` syntax with the `@` symbol to reference a specific branch, tag, or commit
hash.

```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v4

  - name: Run Automation Action
    id: automation-action
    uses: AppSecureAI/automation-action@v1
    with:
      file: results.sarif

  - name: Print Output
    id: output
    run: echo "${{ steps.automation-action.outputs.message }}"
```

## Publishing a New Release

This project includes a helper script, [`script/release`](./script/release)
designed to streamline the process of tagging and pushing new releases for
GitHub Actions.

GitHub Actions allows users to select a specific version of the action to use,
based on release tags. This script simplifies this process by performing the
following steps:

1. **Retrieving the latest release tag:** The script starts by fetching the most
   recent SemVer release tag of the current branch, by looking at the local data
   available in your repository.
1. **Prompting for a new release tag:** The user is then prompted to enter a new
   release tag. To assist with this, the script displays the tag retrieved in
   the previous step, and validates the format of the inputted tag (vX.X.X). The
   user is also reminded to update the version field in package.json.
1. **Tagging the new release:** The script then tags a new release and syncs the
   separate major tag (e.g. v1, v2) with the new release tag (e.g. v1.0.0,
   v2.1.2). When the user is creating a new major release, the script
   auto-detects this and creates a `releases/v#` branch for the previous major
   version.
1. **Pushing changes to remote:** Finally, the script pushes the necessary
   commits, tags and branches to the remote repository. From here, you will need
   to create a new release in GitHub so users can easily reference the new tags
   in their workflows.

## Dependency License Management

This template includes a GitHub Actions workflow,
[`licensed.yml`](./.github/workflows/licensed.yml), that uses
[Licensed](https://github.com/licensee/licensed) to check for dependencies with
missing or non-compliant licenses. This workflow is initially disabled. To
enable the workflow, follow the below steps.

1. Open [`licensed.yml`](./.github/workflows/licensed.yml)
1. Uncomment the following lines:

   ```yaml
   # pull_request:
   #   branches:
   #     - main
   # push:
   #   branches:
   #     - main
   ```

1. Save and commit the changes

Once complete, this workflow will run any time a pull request is created or
changes pushed directly to `main`. If the workflow detects any dependencies with
missing or non-compliant licenses, it will fail the workflow and provide details
on the issue(s) found.

### Updating Licenses

Whenever you install or update dependencies, you can use the Licensed CLI to
update the licenses database. To install Licensed, see the project's
[Readme](https://github.com/licensee/licensed?tab=readme-ov-file#installation).

To update the cached licenses, run the following command:

```bash
licensed cache
```

To check the status of cached licenses, run the following command:

```bash
licensed status
```
