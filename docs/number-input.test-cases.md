# number-input helper cases

Run with `npx tsx` against `src/lib/number-input.ts` (no unit runner in the app).
`sanitizeNumeric(input, opts)` -> raw, then `formatNumericDisplay(raw)` -> display.

| input | opts | raw | display |
| --- | --- | --- | --- |
| `1500000` | d=0 | `1500000` | `1,500,000` |
| `1,234,567.89` (paste) | d=2 | `1234567.89` | `1,234,567.89` |
| `1,234,567.89` (paste) | d=0 | `1234567` | `1,234,567` |
| `1 234 567` (paste) | d=0 | `1234567` | `1,234,567` |
| `007` | d=2 | `7` | `7` |
| `00` | d=2 | `0` | `0` |
| `0.` | d=2 | `0.` | `0.` |
| `.5` | d=2 | `0.5` | `0.5` |
| `1234.` | d=4 | `1234.` | `1,234.` |
| `1.23456` | d=4 | `1.2345` | `1.2345` |
| `1.2.3` | d=4 | `1.23` | `1.23` |
| `abc12x3` | d=0 | `123` | `123` |
| `-12` | d=0, no neg | `12` | `12` |
| `-1234.5` | d=2, neg | `-1234.5` | `-1,234.5` |
| `-` | d=2, neg | `-` | `-` |
| `` | d=2 | `` | `` |
| `1500000.5` | d=2 | `1500000.5` | `1,500,000.5` |

Caret (`caretAfterFormat(prevDisplay, prevCaret, nextDisplay)`):

| prevDisplay | caret | nextDisplay | result |
| --- | --- | --- | --- |
| `1,2345` | 6 | `12,345` | 6 |
| `1234` | 2 | `1,234` | 3 |
| `12,3456` | 3 | `123,456` | 2 |
| `` | 0 | `` | 0 |
