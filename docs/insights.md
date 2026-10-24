# Spending insights

GET `/api/v1/reports/insights?month=YYYY-MM` returns deterministic insights for the
authenticated user's recorded expenses. Current-month comparisons match elapsed
calendar days, clamped to the previous month's length. Completed months compare
whole months. Future months are rejected. Boundaries use the user's timezone.

The response includes current/prior spending, exact signed change, average per day,
comparison dates/day counts and up to three largest absolute category changes.
The average rounds down to a currency minor unit and the UI labels it approximate.
Percentage change is null with a zero previous baseline, rather than infinity or
an invented growth percentage. Ratio strings avoid Number precision overflow.
Income, transfers and debt principal are excluded. Missing manual entries affect
the comparison; the UI explains this alongside the actual compared dates.

Reports shows the card for the This month and Last month presets. Custom/multi-month
reports retain their existing charts instead of presenting an unrelated monthly
comparison. No AI service, automatic financial advice or new analytics SDK is used.
