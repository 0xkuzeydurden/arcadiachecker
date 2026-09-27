# Arcadia Airdrop Checker

[![CI](https://github.com/0xkuzeydurden/arcadiachecker/actions/workflows/ci.yml/badge.svg)](https://github.com/0xkuzeydurden/arcadiachecker/actions/workflows/ci.yml)

A single-file browser tool for looking up Arcadia airdrop allocations. Paste one wallet address per line into `checker.html` to query them in parallel. The page shows each result, the combined ARCD amount, and counts of successful and failed queries. Displayed amounts are rounded to whole tokens using 18 decimals.

Open `checker.html` in a browser, or serve the repository locally with Python:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/checker.html`. No package installation, wallet connection, private key, or API key is required.

Queries go directly from the browser to `https://api.arcadia.finance/v1/api/airdrop/user?user_address=…`. Results depend on that external API remaining available and permitting browser requests; its current availability has not been verified. This tool displays the API response and does not submit an airdrop claim.

Each submitted wallet address is necessarily sent to the Arcadia API. The page has no application backend or browser-storage persistence, and per-query console logging has been removed. This does not control what the API provider receives or retains, so it is not a guarantee of third-party privacy. Address and error text are rendered as text rather than interpreted as HTML.
## Offline checks

The regression checks use Node.js 22 and its built-in test runner; no packages or live API requests are needed.

```sh
node --test tests/checker.test.cjs
```

They cover allocation rounding, the request URL, safe rendering of address and API-error text, result counters, and per-query console logging. GitHub Actions runs them on pushes and pull requests.
