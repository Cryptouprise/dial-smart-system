# S7. A predictable deal engine: funnel math, unit economics and the forecast model

Read 00-common.md (attached) first.

TASK: Make the business predictable. Build the funnel math from list record -> valid phone -> contact (answer or reply) -> conversation ->
appointment/offer -> contract -> close/assignment, with INDUSTRY benchmark ranges (confidence) for cold-call, AI-call and text outreach in
single-family distressed/absentee segments. Give unit economics: cost per record (data + skip trace), per dial minute (telephony + AI),
per text, per contract, per close; assignment fee ranges for a Nashville-type market; team cost. Derive how many dials/texts per day one
market needs for N contracts a month and the cash-flow timeline (lag from first contact to fee). Then specify a simple forecast model the
dashboard can run from Dial Smart data: inputs (which tables/columns, FACT), outputs, update cadence, and the early-warning indicators
(leading metrics that move 2-4 weeks before revenue).

OUTPUT FORMAT (markdown):
1. `## Funnel table` : Stage | Benchmark conversion (range, confidence) | Where Dial Smart records it (FACT/IDEA) | Lever that moves it.
2. `## Unit economics` : table with assumptions and a worked example for one market at a stated volume.
3. `## Daily/weekly targets` : dials, texts, conversations, offers for 2, 4 and 8 contracts per month.
4. `## Forecast model spec` : inputs, formulae, outputs, cadence, how to backtest against history.
5. `## Early-warning indicators` : the 5 leading metrics, thresholds, and the response.
6. `## Assumptions`.
Max 2,500 words. Label every claim FACT (path:line) / INDUSTRY (confidence) / IDEA.
