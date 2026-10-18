# UART Generator

A single-file browser tool that generates Verilog or SystemVerilog UART RTL and a matching self-checking testbench from a configuration. Open `index.html` in any browser. There is no build step, no backend and no dependencies. Plain script tags are used (not ES modules) so it also works from `file://`.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `css/style.css` | Layout and light/dark theme |
| `js/calc.js` | Baud-rate calculation, validation, frame bits, byte parsing |
| `js/rtl.js` | Verilog/SystemVerilog generation (TX, RX, top) |
| `js/testbench.js` | Testbench generation |
| `js/ui.js` | State, DOM wiring, highlighting, waveform, copy/download |

Scripts load in that order; `ui.js` is last.

## What it does

- Calculates the clock divider, the actual baud rate, the baud error and the bit time. The divider shown is the one the generated RTL uses.
- Generates a UART transmitter, a receiver, or both with a small `uart_top` wrapper.
- Generates a SystemVerilog testbench for the selected configuration.
- Draws the frame (start, data LSB first, optional parity, stop bits) for any byte you enter. This is a frame/timing visualization, not a hardware simulation.
- Lets you copy or download each generated file.

## Supported configurations

| Setting | Options |
|---|---|
| Clock | 10, 25, 50, 100 MHz or custom (1 kHz to 1 GHz) |
| Baud | 9600, 19200, 38400, 57600, 115200 or custom (50 to 12,000,000) |
| Data bits | 5, 6, 7, 8 |
| Parity | none, even, odd |
| Stop bits | 1, 2 |
| Module | transmitter, receiver, transmitter + receiver |
| HDL | Verilog (2005 style) or SystemVerilog |

Divider = round(clock / baud). Generation is blocked if the divider is below 4 or the baud error exceeds 5%. Warnings appear for error above 2% and for fewer than 16 clock cycles per bit.

## Generated files

| File | Purpose |
|---|---|
| `uart_tx.v` / `.sv` | Transmitter. Pulse `start` for one clock while `busy` is low. `done` pulses one clock after the last stop bit. |
| `uart_rx.v` / `.sv` | Receiver. Two-flop synchronizer, start-bit check, mid-bit sampling. `valid` pulses one clock after a good frame. `frame_err` (and `parity_err` if parity is on) pulse on a bad frame. |
| `uart_top.v` / `.sv` | Wrapper instantiating both, with separate TX and RX ports (TX + RX mode only). |
| `tb_uart.sv` | Self-checking testbench (always SystemVerilog). Prints `PASS: N checks` or `FAIL: ...`. |

Conventions: synchronous active-high reset; idle line is high; data is sent least-significant bit first; the transmitter ignores `start` while `busy` is high; the receiver re-arms only after the line returns high following a framing error.

## Simulating with Icarus Verilog

Install Icarus Verilog (the Windows installer from bleyer.org/icarus adds `iverilog` and `vvp` to PATH). Put the downloaded files in one folder. If a browser or viewer adds a `.txt` suffix to a downloaded file, remove it.

```
iverilog -g2012 -Wall -o sim uart_tx.v uart_rx.v uart_top.v tb_uart.sv
vvp sim
```

Use the file names for the module you generated (transmitter only: `uart_tx.v tb_uart.sv`; receiver only: `uart_rx.v tb_uart.sv`). For SystemVerilog output use the `.sv` names. To check only that the Verilog RTL compiles as Verilog-2005:

```
iverilog -g2005 -Wall -o rtl.vvp uart_tx.v uart_rx.v uart_top.v
```

The testbench needs `-g2012`. Expected last line of output: `PASS: <n> checks`.

## What the testbenches check

- Transmitter: idle after reset, start bit, data bits LSB first, parity bit, stop bits, exact frame length, `busy`/`done` behavior, consecutive frames, reset in the middle of a frame.
- Receiver: single frames, four back-to-back frames with no idle gap, a sender 2.5% fast and 2.5% slow (when divider >= 40), a short start-bit glitch, a line held low (break), a bad stop bit at each stop position, bad parity, recovery after errors, reset in the middle of a frame.
- TX + RX: transmitter-to-receiver loopback, back-to-back loopback, then the receiver tests above driven directly onto the receiver input.

## Verified test coverage

Run with Icarus Verilog 12.0 on Linux:

- 756 generated configurations compiled and reported PASS with no `-Wall` warnings. They cover Verilog and SystemVerilog, TX, RX and TX + RX, 5 to 8 data bits, all parity modes and 1 or 2 stop bits at 10 MHz/115200, 25 MHz/115200, and dividers 4, 5 and 7 (10 MHz at 2.5M, 2M, 1.5M baud), plus 36 sampled configurations at 10 MHz/9600, 50 MHz/1M and 100 MHz/115200. Verilog RTL also compiled with `-g2005`.
- The testbench was checked against deliberately broken RTL (wrong parity polarity, MSB-first, no parity check, no stop-bit check, early sampling, a framing error on the first of two stop bits going unnoticed, missing `done`, a start bit one clock short, missing break handling). Each was detected.
- The page logic (configuration, validation, presets, file lists, copy, download-all) was exercised in a headless DOM. Real-browser behavior was not tested.

## Known limitations

- Not run: synthesis, place-and-route, FPGA hardware, Verilator, Vivado/Questa simulators, or the commands on Windows. Synthesizability is by inspection only.
- The receiver samples once per bit near the middle; there is no oversampling. Tolerance to baud mismatch is limited, especially at small dividers.
- Data is held in the receiver's `data` register after every frame, including bad ones. Use it only while `valid` is high.
- No FIFOs, flow control, break generation, 9-bit frames or runtime baud change.
- The testbench is SystemVerilog and uses constructs (tasks, `string`, `int`) that need `-g2012`.
