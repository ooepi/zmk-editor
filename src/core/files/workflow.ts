/**
 * `.github/workflows/build.yml`. The reusable workflow ref is the ZMK version
 * from `west.yml`, so the two always match.
 */
export function generateWorkflow(zmkVersion: string): string {
  return `name: Build ZMK firmware

on: [push, pull_request, workflow_dispatch]

jobs:
  build:
    uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@${zmkVersion}
`;
}
