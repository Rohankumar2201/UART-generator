// SystemVerilog testbench generation (TX, RX and loopback variants).
function genTb(c,d,P,pex){
  const N=c.bits,m=c.mod,hex=v=>`${N}'h${(v&(2**N-1)).toString(16).toUpperCase()}`;
  const vals=[0x41,0xFF,0x00,0x55].map(hex);
  const W='repeat (CLKS_PER_BIT) @(posedge clk);';
  let h=`// Self-checking testbench for ${fmt(c)} at ${c.baud} baud, ${fmtHz(c.clk)} clock (CLKS_PER_BIT = ${d.div})
// Prints PASS or FAIL. Run: iverilog -g2012 -o sim <rtl files> tb_uart.sv && vvp sim
\`timescale 1ns/1ps
module tb_uart;
    localparam CLKS_PER_BIT = ${d.div};
    localparam DATA_BITS    = ${N};
    localparam STOP_BITS    = ${c.stop};
    localparam real CLK_NS  = ${(1e9/c.clk).toFixed(4)};

    logic clk = 0, rst = 1;
    int errors = 0, checks = 0, v0, f0${P?', p0':''};
    string cur = "";
    logic [DATA_BITS-1:0] VALS [0:3];
    always #(CLK_NS/2) clk = ~clk;
    initial begin #(CLK_NS * CLKS_PER_BIT * (DATA_BITS + 6) * 300); $display("FAIL: timeout"); $finish; end

    task automatic check(input bit ok, input string msg);
        checks++;
        if (!ok) begin errors++; $display("ERROR [%s] %s", cur, msg); end
    endtask
${P?`    function automatic logic par_of(input logic [DATA_BITS-1:0] d); return ${pex('d')}; endfunction\n`:''}
`;
  const fin=body=>`    initial begin
        ${vals.map((v,i)=>`VALS[${i}] = ${v};`).join(' ')}
        repeat (5) @(posedge clk); rst <= 0; repeat (2) @(posedge clk);
${body}
        if (errors == 0) $display("PASS: %0d checks", checks); else $display("FAIL: %0d of %0d checks", errors, checks);
        $finish;
    end
endmodule
`;
  const rxSide=line=>`
    int n_rx = 0, n_ferr = 0${P?', n_perr = 0':''};
    logic [DATA_BITS-1:0] rx_log [0:63];
    always @(posedge clk) begin
        if (valid) begin if (n_rx < 64) rx_log[n_rx] <= data; n_rx <= n_rx + 1; end
        if (frame_err) n_ferr <= n_ferr + 1;${P?'\n        if (parity_err) n_perr <= n_perr + 1;':''}
    end

    task automatic bitout(input logic v, input int per);
        ${line} <= v; repeat (per) @(posedge clk);
    endtask

    // bad_stop = k drives stop bit k low (1..STOP_BITS); per = clocks per bit; gap = idle clocks afterwards
    task automatic send_frame(input logic [DATA_BITS-1:0] d, input bit bad_par, input int bad_stop, input int per, input int gap);
        bitout(0, per);
        for (int i = 0; i < DATA_BITS; i++) bitout(d[i], per);${P?'\n        bitout(par_of(d) ^ bad_par, per);':''}
        for (int s = 1; s <= STOP_BITS; s++) begin
            if (bad_stop == s) begin bitout(0, per*3/4); bitout(1, per - per*3/4); end
            else bitout(1, per);
        end
        if (gap > 0) bitout(1, gap);
    endtask

    task automatic expect_frame(input logic [DATA_BITS-1:0] d, input bit bad_par, input int bad_stop, input int per, input int gap, input string name);
        cur = name; v0 = n_rx; f0 = n_ferr;${P?' p0 = n_perr;':''}
        send_frame(d, bad_par, bad_stop, per, gap);
        if (bad_stop == 0${P?' && !bad_par':''}) begin
            check(n_rx == v0 + 1, "expected exactly one valid pulse");
            check(n_rx > v0 && rx_log[v0] === d, "received data differs from sent data");
            check(n_ferr == f0, "false framing error");${P?'\n            check(n_perr == p0, "false parity error");':''}
        end else begin
            check(n_rx == v0, "valid pulse on a bad frame");
            check(n_ferr == f0 + (bad_stop != 0 ? 1 : 0), "framing error flag wrong");${P?'\n            check(n_perr == p0 + ((bad_stop == 0 && bad_par) ? 1 : 0), "parity error flag wrong");':''}
        end
    endtask
`;
  const rxTests=`        for (int i = 0; i < 4; i++) expect_frame(VALS[i], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "single frame");
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
        bitout(0, CLKS_PER_BIT * (DATA_BITS + ${P?1:0} + STOP_BITS + 3)); bitout(1, CLKS_PER_BIT * 2);
        check(n_rx == v0, "valid pulse during break");
        check(n_ferr == f0 + 1, "break should give exactly one framing error");
        for (int s = 1; s <= STOP_BITS; s++) begin
            expect_frame(VALS[0], 0, s, CLKS_PER_BIT, CLKS_PER_BIT, "bad stop bit");
            expect_frame(VALS[1], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "good frame after bad stop bit");
        end${P?`
        expect_frame(VALS[0], 1, 0, CLKS_PER_BIT, CLKS_PER_BIT, "bad parity");
        expect_frame(VALS[1], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "good frame after bad parity");`:''}
        cur = "reset mid-frame";
        bitout(0, CLKS_PER_BIT); bitout(1, CLKS_PER_BIT); bitout(0, CLKS_PER_BIT);
        rst <= 1; repeat (2) @(posedge clk); check(!busy, "busy while in reset"); rst <= 0;
        bitout(1, CLKS_PER_BIT*2);
        expect_frame(VALS[2], 0, 0, CLKS_PER_BIT, CLKS_PER_BIT, "frame after reset");`;
  if(m==='tx'){
    h+=`    logic start = 0, tx, busy, done;
    logic [DATA_BITS-1:0] data = 0;
    uart_tx dut (.clk(clk), .rst(rst), .start(start), .data(data), .tx(tx), .busy(busy), .done(done));

    localparam real FRAME_NS = CLK_NS * CLKS_PER_BIT * (1 + DATA_BITS + ${P?1:0} + STOP_BITS);
    realtime t0, t1;

    task automatic send_and_check(input logic [DATA_BITS-1:0] exp);
        cur = "transmit";
        @(posedge clk); data <= exp; start <= 1; @(posedge clk); start <= 0;
        @(negedge tx); t0 = $realtime;
        repeat (CLKS_PER_BIT/2) @(posedge clk);
        check(tx === 1'b0, "start bit not low");
        check(busy === 1'b1, "busy not high during frame");
        for (int i = 0; i < DATA_BITS; i++) begin
            ${W}
            check(tx === exp[i], "data bit wrong (LSB first expected)");
        end${P?`
        ${W}
        check(tx === par_of(exp), "parity bit wrong");`:''}
        for (int s = 0; s < STOP_BITS; s++) begin
            ${W}
            check(tx === 1'b1, "stop bit not high");
        end
        wait (done); t1 = $realtime; @(negedge clk);
        check((t1 - t0) > FRAME_NS - CLK_NS/2 && (t1 - t0) < FRAME_NS + CLK_NS/2, "frame length differs from (start + data + parity + stop) x CLKS_PER_BIT");
        check(!busy, "busy still high when done pulses");
        @(negedge clk);
        check(!done, "done longer than one clock");
        check(tx === 1'b1, "line not idle-high after frame");
    endtask

`+fin(`        cur = "reset";
        check(tx === 1'b1 && !busy && !done, "outputs not idle after reset");
        for (int i = 0; i < 4; i++) send_and_check(VALS[i]);
        cur = "reset mid-frame";
        @(posedge clk); data <= VALS[0]; start <= 1; @(posedge clk); start <= 0;
        repeat (CLKS_PER_BIT * 2) @(posedge clk); rst <= 1; repeat (2) @(posedge clk);
        check(tx === 1'b1 && !busy, "reset did not return transmitter to idle");
        rst <= 0; repeat (2) @(posedge clk);
        send_and_check(VALS[3]);`);
  }else if(m==='rx'){
    h+=`    logic rx = 1, valid, busy, frame_err${P?', parity_err':''};
    logic [DATA_BITS-1:0] data;
    uart_rx dut (.clk(clk), .rst(rst), .rx(rx), .data(data), .valid(valid), .busy(busy), .frame_err(frame_err)${P?', .parity_err(parity_err)':''});
${rxSide('rx')}
`+fin(`        cur = "reset"; check(!busy && !valid, "receiver not idle after reset");
`+rxTests);
  }else{
    h+=`    logic tx_start = 0, inj_sel = 0, inj = 1, line;
    logic [DATA_BITS-1:0] tx_data = 0;
    wire tx_busy, tx_done, rx_busy, rx_valid, rx_frame_err${P?', rx_parity_err':''};
    wire [DATA_BITS-1:0] rx_data;
    wire rx_in = inj_sel ? inj : line;
    wire [DATA_BITS-1:0] data = rx_data;
    wire valid = rx_valid, busy = rx_busy, frame_err = rx_frame_err${P?', parity_err = rx_parity_err':''};
    uart_top dut (.clk(clk), .rst(rst), .tx_start(tx_start), .tx_data(tx_data), .tx_serial(line), .tx_busy(tx_busy), .tx_done(tx_done),
                  .rx_serial(rx_in), .rx_data(rx_data), .rx_valid(rx_valid), .rx_busy(rx_busy), .rx_frame_err(rx_frame_err)${P?', .rx_parity_err(rx_parity_err)':''});
${rxSide('inj')}
    task automatic tx_send(input logic [DATA_BITS-1:0] d);
        @(posedge clk); tx_data <= d; tx_start <= 1; @(posedge clk); tx_start <= 0;
        wait (tx_done);
    endtask

`+fin(`        cur = "loopback";
        for (int i = 0; i < 4; i++) begin
            v0 = n_rx; tx_send(VALS[i]); @(negedge clk);
            check(!tx_busy, "tx_busy high when tx_done pulses");
            repeat (4) @(negedge clk);   // receiver valid can trail tx_done at very small dividers
            check(n_rx == v0 + 1 && rx_log[v0] === VALS[i], "loopback data mismatch");
            check(n_ferr == 0${P?' && n_perr == 0':''}, "error flag during clean loopback");
        end
        cur = "loopback back-to-back"; v0 = n_rx;
        for (int i = 0; i < 4; i++) tx_send(VALS[i]);
        repeat (CLKS_PER_BIT + 4) @(posedge clk);
        check(n_rx == v0 + 4, "expected four received frames");
        for (int i = 0; i < 4; i++) check(rx_log[v0+i] === VALS[i], "wrong data in back-to-back loopback");
        check(!tx_busy && !rx_busy, "busy stuck high");
        inj_sel = 1;   // receiver tests below drive rx_serial directly
${rxTests}
        inj_sel = 0;`);
  }
  return h;
}
