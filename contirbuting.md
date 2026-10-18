# Contributing to UART Generator

Thanks for helping. This is a small, dependency-free tool, so contributions should keep it that way.

## Ground rules

- Correct UART behavior comes first, then testbench reliability, then input validation, then documentation, then visual polish.
- No frameworks, build tools or runtime dependencies. The app must keep opening by double-clicking `index.html`.
- Do not add features that don't serve generating or checking UART RTL.
- Do not claim a test passed unless you ran it. Say which tool and version you used.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `css/style.css` | Layout and light/dark theme |
| `js/calc.js` | Baud calculation, validation, frame bits, byte parsing |
| `js/rtl.js` | Verilog/SystemVerilog generation |
| `js/testbench.js` | Testbench generation |
| `js/ui.js` | State, DOM wiring, highlighting, waveform, copy/download |
| `examples/` | Generated files for the default configuration (Verilog, 100 MHz, 115200, 8N1, TX + RX) |

Scripts load in the order `calc`, `rtl`, `testbench`, `ui` using plain `<script>` tags.

## Running the app

Open `index.html` in a browser.

## Testing a change

If you change anything in `js/rtl.js` or `js/testbench.js`, regenerate and simulate with Icarus Verilog (version 12 or later):

1. Open the app and choose a configuration.
2. Download the generated files into one folder (remove any `.txt` suffix).
3. Run:

```
iverilog -g2012 -Wall -o sim uart_tx.v uart_rx.v uart_top.v tb_uart.sv
vvp sim
```

The last output line must be `PASS: <n> checks`. For receiver-only or transmitter-only output, list just that module's file plus `tb_uart.sv`. For SystemVerilog output, use the `.sv` names. To check the Verilog RTL as Verilog-2005:

```
iverilog -g2005 -Wall -o rtl.vvp uart_tx.v uart_rx.v uart_top.v
```

Please test more than the default. At minimum, try one configuration with parity, one with 2 stop bits, one with fewer than 8 data bits, and both HDL modes. If you change the receiver or transmitter, also check that the testbench still catches a deliberately broken version of the part you changed (for example, flip a parity polarity and confirm the testbench reports `FAIL`).

If you change `js/calc.js` or the UI, check these by hand in the browser: changing parity, data bits, stop bits, clock and baud updates the code, frame and summary; invalid values (zero, negative, text, out of range) show a clear message and generate no RTL; copy and download give the same text as the code panel.

## Pull requests

- Keep each pull request to one change.
- Describe what changed and why, and list the exact tests you ran with tool versions.
- List anything you did not test.
- Update `README.md` if behavior, supported options or limitations change.
- If you change the generated output, refresh the files in `examples/`.

## Reporting bugs

Open an issue with: the configuration you chose (clock, baud, data bits, parity, stop bits, module, HDL), the simulator and version, the command you ran, and the full output.

## License

By contributing, you agree that your contribution is licensed under the MIT License in `LICENSE`.