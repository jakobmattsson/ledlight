# Journal performance benchmark

Run `npm run benchmark` to generate and measure a large, entirely synthetic
journal. Pass an output path to write the JSON expected by
`benchmark-action/github-action-benchmark`, for example
`npm run benchmark -- benchmark-results.json`.

The generator creates approximately 4,500 transactions, 10,400 postings,
31,000 market prices, 210 accounts, and 45 commodities over six calendar years.
It includes 800 instrument trades, 250 sales, seven tags, and 55 accounts with
zero ending balances. All identifiers, dates, descriptions, and amounts are
synthetic. The journal and its SQLite cache are created in a temporary directory
and removed after each run.

The runner measures a cold database build, a cached open, and an aggregate
report separately. Each operation runs three times, and the median is reported.
The benchmark verifies its fixture's size and accounting shape, but does not
fail on elapsed time. GitHub Actions records the values on pushes to `main` and
manual workflow runs. The history is stored on the `gh-pages` branch under
`dev/bench` and published at
`https://jakobmattsson.github.io/ledlight/dev/bench/`.

Compare trends from the same CI runner type. Shared CI runners can vary between
runs, so investigate a sustained change before treating it as a regression.
