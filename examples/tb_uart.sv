// Self-checking testbench for 8N1 at 115200 baud, 100 MHz clock (CLKS_PER_BIT = 868)
// Prints PASS or FAIL. Run: iverilog -g2012 -o sim <rtl files> tb_uart.sv && vvp sim
`timescale 1ns/1ps
module tb_uart;
    localparam CLKS_PER_BIT = 868;
    localparam DATA_BITS    = 8;
    localparam STOP_BITS    = 1;
    localparam real CLK_NS  = 10.0000;

    logic clk = 0, rst = 1;
    int errors = 0, checks = 0, v0, f0;
    string cur = "";
    logic [DATA_BITS-1:0] VALS [0:3];
    always #(CLK_NS/2) clk = ~clk;
    initial begin #(CLK_NS * CLKS_PER_BIT * (DATA_BITS + 6) * 300); $display("FAIL: timeout"); $finish; end

    task automatic check(input bit ok, input string msg);
        checks++;
        if (!ok) begin errors++; $display("ERROR [%s] %s", cur, msg); end
    endtask

    logic tx_start = 0, inj_sel = 0, inj = 1, line;
    logic [DATA_BITS-1:0] tx_data = 0;
    wire tx_busy, tx_done, rx_busy, rx_valid, rx_frame_err;
    wire [DATA_BITS-1:0] rx_data;
    wire rx_in = inj_sel ? inj : line;
    wire [DATA_BITS-1:0] data = rx_data;
    wire valid = rx_valid, busy = rx_busy, frame_err = rx_frame_err;
    uart_top dut (.clk(clk), .rst(rst), .tx_start(tx_start), .tx_data(tx_data), .tx_serial(line), .tx_busy(tx_busy), .tx_done(tx_done),
                  .rx_serial(rx_in), .rx_data(rx_data), .rx_valid(rx_valid), .rx_busy(rx_busy), .rx_frame_err(rx_frame_err));

    int n_rx = 0, n_ferr = 0;
    logic [DATA_BITS-1:0] rx_log [0:63];
    always @(posedge clk) begin
        if (valid) begin if (n_rx < 64) rx_log[n_rx] <= data; n_rx <= n_rx + 1; end
        if (frame_err) n_ferr <= n_ferr + 1;
    end

    task automatic bitout(input logic v, input int per);
        inj <= v; repeat (per) @(posedge clk);
    endtask

    // bad_stop = k drives stop bit k low (1..STOP_BITS); per = clocks per bit; gap = idle clocks afterwards
    task automatic send_frame(input logic [DATA_BITS-1:0] d, input bit bad_par, input int bad_stop, input int per, input int gap);
        bitout(0, per);
        for (int i = 0; i < DATA_BITS; i++) bitout(d[i], per);
        for (int s = 1; s <= STOP_BITS; s++) begin
            if (bad_stop == s) begin bitout(0, per*3/4); bitout(1, per - per*3/4); end
            else bitout(1, per);
        end
        if (gap > 0) bitout(1, gap);
    endtask

    task automatic expect_frame(input logic [DATA_BITS-1:0] d, input bit bad_par, input int bad_stop, input int per, input int gap, input string name);
        cur = name; v0 = n_rx; f0 = n_ferr;
        send_frame(d, bad_par, bad_stop, per, gap);
        if (bad_stop == 0) begin
            check(n_rx == v0 + 1, "expected exactly one valid pulse");
            check(n_rx > v0 && rx_log[v0] === d, "received data differs from sent data");
            check(n_ferr == f0, "false framing error");
        end else begin
            check(n_rx == v0, "valid pulse on a bad frame");
            check(n_ferr == f0 + (bad_stop != 0 ? 1 : 0), "framing error flag wrong");
        end
    endtask

    task automatic tx_send(input logic [DATA_BITS-1:0] d);
        @(posedge clk); tx_data <= d; tx_start <= 1; @(posedge clk); tx_start <= 0;
        wait (tx_done);
    endtask

    initial begin
        VALS[0] = 8'h41; VALS[1] = 8'hFF; VALS[2] = 8'h0; VALS[3] = 8'h55;
        repeat (5) @(posedge clk); rst <= 0; repeat (2) @(posedge clk);
        cur = "loopback";
        for (int i = 0; i < 4; i++) begin
            v0 = n_rx; tx_send(VALS[i]); @(negedge clk);
            check(!tx_busy, "tx_busy high when tx_done pulses");
            repeat (4) @(negedge clk);   // receiver valid can trail tx_done at very small dividers
            check(n_rx == v0 + 1 && rx_log[v0] === VALS[i], "loopback data mismatch");
            check(n_ferr == 0, "error flag during clean loopback");
        end
        cur = "loopback back-to-back"; v0 = n_rx;
        for (int i = 0; i < 4; i++) tx_send(VALS[i]);
        repeat (CLKS_PER_BIT + 4) @(posedge clk);
        check(n_rx == v0 + 4, "expected four received frames");
        for (int i = 0; i < 4; i++) check(rx_log[v0+i] === VALS[i], "wrong data in back-to-back loopback");
        check(!tx_busy && !rx_busy, "busy stuck high");
        inj_sel = 1;   // receiver tests below drive rx_serial directly
        for (int i = 0; i < 4; i++) expect_frame(VALS[i], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "single frame");
        cur = "back-to-back frames"; v0 = n_rx;
        for (int i = 0; i < 4; i++) send_frame(VALS[i], 0, 0, CLKS_PER_BIT, 0);
        bitout(1, CLKS_PER_BIT);
        check(n_rx == v0 + 4, "expected four valid pulses");
        for (int i = 0; i < 4; i++) check(rx_log[v0+i] === VALS[i], "wrong data in back-to-back stream");
        if (CLKS_PER_BIT >= 40) begin
            expect_frame(VALS[0], 0, 0, CLKS_PER_BIT - CLKS_PER_BIT/40, CLKS_PER_BIT, "sender 2.5% fast");
            expect_frame(VALS[1], 0, 0, CLKS_PER_BIT + CLKS_PER_BIT/40, CLKS_PER_BIT, "sender 2.5% slow");
        end
        cur = "start-bit glitch"; v0 = n_rx; f0 = n_ferr;
        bitout(0, CLKS_PER_BIT/4); bitout(1, CLKS_PER_BIT*2);
        check(n_rx == v0 && n_ferr == f0, "short glitch accepted as a frame");
        check(!busy, "receiver stuck busy after glitch");
        cur = "break (line held low)"; v0 = n_rx; f0 = n_ferr;
        bitout(0, CLKS_PER_BIT * (DATA_BITS + 0 + STOP_BITS + 3)); bitout(1, CLKS_PER_BIT * 2);
        check(n_rx == v0, "valid pulse during break");
        check(n_ferr == f0 + 1, "break should give exactly one framing error");
        for (int s = 1; s <= STOP_BITS; s++) begin
            expect_frame(VALS[0], 0, s, CLKS_PER_BIT, CLKS_PER_BIT, "bad stop bit");
            expect_frame(VALS[1], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "good frame after bad stop bit");
        end
        cur = "reset mid-frame";
        bitout(0, CLKS_PER_BIT); bitout(1, CLKS_PER_BIT); bitout(0, CLKS_PER_BIT);
        rst <= 1; repeat (2) @(posedge clk); check(!busy, "busy while in reset"); rst <= 0;
        bitout(1, CLKS_PER_BIT*2);
        expect_frame(VALS[2], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "frame after reset");
        inj_sel = 0;
        if (errors == 0) $display("PASS: %0d checks", checks); else $display("FAIL: %0d of %0d checks", errors, checks);
        $finish;
    end
endmodule
