# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/aqolbi488/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/aqolbi488/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A slow-trend BTC trading bot: it waits for a strong multi-hour uptrend (240-bar return above 1.5% with EMA(40) above EMA(100)), buys once with the full stake, and holds through the noise until a 3% trailing stop or a 5% hard stop fires. It trades rarely on purpose — a full-size round trip costs about 26 bps, while a typical 1-minute move is only ~8 bps, so frequent trading bleeds money.

## Run it

```sh
/home/hatch/workspace/tools/node22/bin/node /home/hatch/workspace/makefun/kits/btc-race-24h-20261123-0511/btc-race-24h-20261123-0511-kit/cli/makefun.mjs grade-local --kit /home/hatch/workspace/makefun/kits/btc-race-24h-20261123-0511/btc-race-24h-20261123-0511-kit --bot /home/hatch/workspace/makefun/btc-race-24h-20261123-0511 --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=msc0ap6f&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
