// Slow-trend BTC bot: buy a strong multi-hour uptrend, hold it, exit only on a
// wide trailing stop or a hard stop. Long only, one position, full size.
//
// Idea (my own design): on 1-minute bars the pool price is mostly noise — a
// 1-minute move has a standard deviation of only ~8 bps while a full-size
// round trip costs ~26 bps in fees, slippage and impact. Frequent trading
// therefore bleeds money. This bot trades rarely: it waits until the trend
// is unmistakable on a 4-hour horizon (the 240-bar return above 1.5% with
// the fast EMA above the slow EMA), buys the whole stake once, and then
// holds through the noise until the price pulls back 3% from its peak since
// entry (or 5% below the entry). A second, lower entry threshold opens in
// the second half of the window so a moderately trending window still gets
// at least one trade instead of sitting out entirely. No entry is taken in
// the last 60 bars (a fill there would be flattened almost immediately for
// another round trip of cost), and after any exit the bot waits 60 bars
// before re-entering, so a stop-out cannot whipsaw it straight back in.
//
// Indicators, per bar over closes (a gap adds nothing):
//   - EMA(40) and EMA(100), each starting as the mean of its first span of
//     closes, then moving 2 / (span + 1) of the way to each new close.
//   - Momentum: the return of the latest close over the close 240 bars ago.
// Entry, on a bar's close (filled at the next bar's open), on a symbol not
// held: EMA(40) above EMA(100) and momentum above the tier threshold.
// Exit, the whole position: the close 3% or more below the highest close
// since entry (trailing stop), or 5% or more below the entry fill's close
// (hard stop). Each is read again on every bar, so a sell the market
// refuses is sent again on the next bar while its reason still holds.
// Sizing: one position, up to 100% of equity; a buy spends all cash.
// A reply carries at most one order. Each order caps its slippage at 150
// bps (1.5%) past the close it was decided on, so a fill into a liquidity
// gap is refused (and retried) rather than filled far from the close.
// All arithmetic is float64 on + - * / alone, each correctly rounded
// (IEEE 754), and the only inputs are the bars the harness sends, so the
// same bars give the same orders, run after run. No clock, no randomness,
// no environment, no files, no network.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const FAST_BARS = 40;
const SLOW_BARS = 100;
const MOM_BARS = 240;
const TIER1_MOM = 0.015;
const TIER2_MOM = 0.008;
const TIER2_FROM_BAR = 720;
const LAST_ENTRY_BAR = 1380;
const REENTRY_COOLDOWN_BARS = 60;
const TRAIL_DROP = 0.97;
const HARD_STOP = 0.95;
const MAX_SLIPPAGE_BPS = 150;

interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Series {
  fast: Ema;
  slow: Ema;
  closes: number[];
  entryClose: number | null;
  peakClose: number | null;
  cooldownUntil: number;
}

const series = new Map<string, Series>();

function stepEma(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) {
    e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
  }
}

function push(bar: Bar): Series {
  let s = series.get(bar.symbol);
  if (s === undefined) {
    s = {
      fast: { span: FAST_BARS, warm: [], value: null },
      slow: { span: SLOW_BARS, warm: [], value: null },
      closes: [],
      entryClose: null,
      peakClose: null,
      cooldownUntil: -1,
    };
    series.set(bar.symbol, s);
  }
  const c = Number(bar.c);
  stepEma(s.fast, c);
  stepEma(s.slow, c);
  s.closes.push(c);
  if (s.closes.length > MOM_BARS + 1) s.closes.shift();
  if (s.peakClose !== null && c > s.peakClose) s.peakClose = c;
  return s;
}

function momentum(s: Series): number | null {
  if (s.closes.length < MOM_BARS + 1) return null;
  const now = s.closes[s.closes.length - 1];
  const then = s.closes[0];
  if (then === 0) return null;
  return now / then - 1;
}

await runBars({
  onBatch(state, batch) {
    const fresh = new Set<string>();
    for (const bar of batch.bars) {
      push(bar);
      fresh.add(bar.symbol);
    }
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const orders: (SellInput | BuyInput)[] = [];
    for (const { symbol } of state.hello.symbols) {
      if (!fresh.has(symbol)) continue;
      const s = series.get(symbol);
      if (s === undefined) continue;
      const held = state.positions.get(symbol);
      const close = Number(state.latest.get(symbol)!.c);
      if (held !== undefined) {
        // Track the entry reference from the position's cost basis on the
        // first bar after the fill; peak is maintained in push().
        if (s.entryClose === null) {
          s.entryClose = close;
          s.peakClose = close;
        }
        const entryClose = s.entryClose;
        const peakClose = s.peakClose;
        if (
          (peakClose !== null && close <= peakClose * TRAIL_DROP) ||
          close <= entryClose * HARD_STOP
        ) {
          orders.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          s.entryClose = null;
          s.peakClose = null;
          s.cooldownUntil = state.seq + REENTRY_COOLDOWN_BARS;
        }
        continue;
      }
      // Flat: consider an entry.
      s.entryClose = null;
      s.peakClose = null;
      if (state.seq > LAST_ENTRY_BAR) continue;
      if (state.seq <= s.cooldownUntil) continue;
      if (s.fast.value === null || s.slow.value === null) continue;
      if (s.fast.value <= s.slow.value) continue;
      const mom = momentum(s);
      if (mom === null) continue;
      const threshold = state.seq >= TIER2_FROM_BAR ? TIER2_MOM : TIER1_MOM;
      if (mom <= threshold) continue;
      const stake = state.cash;
      if (stake < BigInt(fees.min_notional_quote_units)) continue;
      const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / 10000n;
      const size = stake < byWeight ? stake : byWeight;
      if (size < BigInt(fees.min_notional_quote_units)) continue;
      orders.push({ side: 'buy', symbol, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS });
      if (orders.length >= caps.max_orders_per_bar) break;
    }
    return orders.slice(0, caps.max_orders_per_bar);
  },
});
