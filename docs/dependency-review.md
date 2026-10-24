# Dependency security review

Reviewed 20 October 2026 with `pnpm audit --prod --json`. An audit result is a
package inventory, not a reachability analysis or a security certification.

The original inventory reported four advisories. A scoped `xcode>uuid` override
to patched CommonJS-compatible 11.1.1 removed the UUID advisory. The installed
Xcode helper calls `uuid.v4()`; Expo configuration and prebuild remain verified.
Finora entity and operation IDs use Node/Expo crypto rather than this helper.

The repeat inventory still reports these upstream advisories, with no patched
published versions listed by the advisory database at review time:

| Package          | Advisory                                                                                   | Observed dependency path and exposure                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node-forge 1.4.0 | [High: RSA verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv)                | Expo CLI and Expo code-signing tools. Finora uses Node crypto for API tokens and JDK signing for AABs; it has no EAS Update/code-signing flow. Do not use the affected tool to verify untrusted certificates. |
| braces 3.0.3     | [High: nested-pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Metro file matching/build tooling. Patterns come from the trusted checkout configuration. User report/search values never become glob expressions.                                                            |
| sprintf-js 1.1.3 | [Moderate: unbounded format precision](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)  | Jest/NYC configuration loading through argparse. Financial input is not passed to these format strings.                                                                                                       |

Expo includes CLI dependencies under its runtime package, so `--prod` still lists
build/test tools. Do not expose Metro/Expo development servers to the public
internet, execute untrusted project configuration, or deploy this monorepo's dev
server as the production API. Deploy only the API application and build mobile
artifacts from a trusted checkout. Native dependency and platform SDK risks need
their own review; npm audit cannot assess them.
The checked Android Hermes export's source map contains no node-forge, braces,
sprintf-js or xcode module paths. This is evidence about that JavaScript bundle,
not a claim that development tools or native dependencies are vulnerability-free.

These findings are retained openly rather than suppressed or declared fixed by
changing audit thresholds. Check the advisories and compatible Expo updates again
before release. A downstream risk decision and follow-up remain release tasks.
No custom cryptographic patch has been introduced.

On 22 October 2026, Expo's compatibility check began requiring SDK 58 patch
updates. The mobile workspace was aligned to Expo 58.0.17 and its recommended
constants, linking, network, router, sharing, splash, status-bar and Jest patches.
The Metro runtime is an explicit compatible peer. Strict peer validation remains
enabled; pnpm's release-age exceptions list exact package versions for this
resolved Expo update rather than disabling the release-age policy globally.
These compatibility updates do not claim to resolve the advisories above.

`pnpm exec tsx scripts/check-secrets.ts` compares the actual locally configured
server URI/password and secret values against nonignored source files and the
generated mobile export. It reports paths only on a match. A clean comparison
does not prove the absence of unknown, encoded or historical secrets; review Git
history and hosting secrets independently before distribution.

On 24 October, Expo compatibility advanced to 58.0.19 and the matching dev-client,
file-system, font, router and SQLite patches. The workspace records exact-version
release-age exceptions for the resolved Expo patch dependency set; the general
release-age policy and strict peer validation remain enabled. The same install
policy must be committed for clean CI to reproduce the verified local build.
