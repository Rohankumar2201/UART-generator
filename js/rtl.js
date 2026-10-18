// Verilog/SystemVerilog generation for the transmitter, receiver and top wrapper.
function gen(c,d){
  const sv=c.lang==='sv',P=c.par!=='none',N=c.bits,D=d.div,reg=sv?'logic':'reg',ff=sv?'always_ff @(posedge clk)':'always @(posedge clk)';
  const cw=clog(D),bw=clog(N),pex=v=>c.par==='even'?`^${v}`:`~^${v}`,pn=P?", PARITY = 3'd3":'';
  const hdr=(t)=>`// ${t}\n// Clock ${fmtHz(c.clk)}, target ${c.baud} baud, CLKS_PER_BIT = ${D} (actual ${d.actual.toFixed(2)} baud, error ${d.err.toFixed(3)}%)\n// Format ${fmt(c)}, LSB first. Reset: synchronous, active high.\n`;
  const out=[];
  const tx=hdr('uart_tx: sample "start" for one cycle while busy is low; data is latched then. done pulses 1 cycle after the last stop bit.')+`module uart_tx (
    input  wire clk,
    input  wire rst,
    input  wire start,
    input  wire [${N-1}:0] data,
    output ${reg} tx,
    output wire busy,
    output ${reg} done
);
    localparam CLKS_PER_BIT = ${D};
    localparam DATA_BITS    = ${N};
    localparam STOP_BITS    = ${c.stop};
    localparam [2:0] IDLE = 3'd0, START = 3'd1, DATA = 3'd2${pn}, STOP = 3'd4;

    ${reg} [2:0] state;
    ${reg} [${cw-1}:0] clk_cnt;
    ${reg} [${bw-1}:0] bit_idx;
    ${reg} [${N-1}:0] shreg;
    ${reg} stop_cnt;${P?`\n    ${reg} parity_bit;`:''}

    assign busy = (state != IDLE);

    ${ff} begin
        done <= 1'b0;
        if (rst) begin
            state <= IDLE; tx <= 1'b1; clk_cnt <= 0; bit_idx <= 0; shreg <= 0; stop_cnt <= 0;${P?' parity_bit <= 1\'b0;':''}
        end else begin
            case (state)
                IDLE: begin
                    tx <= 1'b1;
                    if (start) begin
                        shreg <= data;${P?`\n                        parity_bit <= ${pex('data')};`:''}
                        clk_cnt <= 0; bit_idx <= 0;
                        tx <= 1'b0;
                        state <= START;
                    end
                end
                START: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0; tx <= shreg[0]; state <= DATA;
                end else clk_cnt <= clk_cnt + 1'b1;
                DATA: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0;
                    if (bit_idx == DATA_BITS-1) begin
                        stop_cnt <= 0;
                        ${P?"tx <= parity_bit; state <= PARITY;":"tx <= 1'b1; state <= STOP;"}
                    end else begin
                        shreg <= shreg >> 1; tx <= shreg[1]; bit_idx <= bit_idx + 1'b1;
                    end
                end else clk_cnt <= clk_cnt + 1'b1;${P?`
                PARITY: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0; tx <= 1'b1; stop_cnt <= 0; state <= STOP;
                end else clk_cnt <= clk_cnt + 1'b1;`:''}
                STOP: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0;
                    if (stop_cnt == STOP_BITS-1) begin state <= IDLE; done <= 1'b1; end
                    else stop_cnt <= stop_cnt + 1'b1;
                end else clk_cnt <= clk_cnt + 1'b1;
                default: state <= IDLE;
            endcase
        end
    end
endmodule
`;
  const rx=hdr('uart_rx: two-flop synchronizer, start-bit detect, mid-bit sampling. valid pulses 1 cycle after a good frame.\n// data is only meaningful while valid is high. If the last stop bit is low (framing error or break) the receiver waits for the line to return high before looking for a new start bit.')+`module uart_rx (
    input  wire clk,
    input  wire rst,
    input  wire rx,
    output ${reg} [${N-1}:0] data,
    output ${reg} valid,
    output wire busy,
    output ${reg} frame_err${P?`,\n    output ${reg} parity_err`:''}
);
    localparam CLKS_PER_BIT = ${D};
    localparam DATA_BITS    = ${N};
    localparam STOP_BITS    = ${c.stop};
    // The 2-flop synchronizer and the IDLE->START step delay start-bit detection by about 4 clocks,
    // so wait that much less than half a bit to land near the middle of the start bit.
    localparam HALF_WAIT    = (CLKS_PER_BIT/2 > 3) ? CLKS_PER_BIT/2 - 3 : 0;
    localparam [2:0] IDLE = 3'd0, START = 3'd1, DATA = 3'd2${pn}, STOP = 3'd4, WAIT_HIGH = 3'd5;

    ${reg} rx_meta, rx_sync;
    ${reg} [2:0] state;
    ${reg} [${cw-1}:0] clk_cnt;
    ${reg} [${bw-1}:0] bit_idx;
    ${reg} [${N-1}:0] shreg;
    ${reg} stop_cnt, stop_bad;${P?`\n    ${reg} parity_bad;`:''}

    assign busy = (state != IDLE);

    ${ff} begin
        if (rst) begin rx_meta <= 1'b1; rx_sync <= 1'b1; end
        else begin rx_meta <= rx; rx_sync <= rx_meta; end
    end

    ${ff} begin
        valid <= 1'b0; frame_err <= 1'b0;${P?' parity_err <= 1\'b0;':''}
        if (rst) begin
            state <= IDLE; clk_cnt <= 0; bit_idx <= 0; shreg <= 0; data <= 0; stop_cnt <= 0; stop_bad <= 1'b0;${P?' parity_bad <= 1\'b0;':''}
        end else begin
            case (state)
                IDLE: if (!rx_sync) begin
                    clk_cnt <= 0; stop_bad <= 1'b0;${P?' parity_bad <= 1\'b0;':''} state <= START;
                end
                START: if (clk_cnt == HALF_WAIT) begin
                    clk_cnt <= 0; bit_idx <= 0;
                    state <= rx_sync ? IDLE : DATA;
                end else clk_cnt <= clk_cnt + 1'b1;
                DATA: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0; shreg <= {rx_sync, shreg[${N-1}:1]};
                    if (bit_idx == DATA_BITS-1) begin stop_cnt <= 0; state <= ${P?'PARITY':'STOP'}; end
                    else bit_idx <= bit_idx + 1'b1;
                end else clk_cnt <= clk_cnt + 1'b1;${P?`
                PARITY: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0; parity_bad <= (rx_sync != (${pex('shreg')})); state <= STOP;
                end else clk_cnt <= clk_cnt + 1'b1;`:''}
                STOP: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0;
                    if (stop_cnt == STOP_BITS-1) begin
                        state <= rx_sync ? IDLE : WAIT_HIGH; data <= shreg;   // last stop bit low: wait for the line to go high
                        frame_err <= stop_bad | ~rx_sync;
                        valid <= ~(stop_bad | ~rx_sync)${P?' & ~parity_bad':''};${P?'\n                        parity_err <= parity_bad;':''}
                    end else begin
                        if (!rx_sync) stop_bad <= 1'b1;
                        stop_cnt <= stop_cnt + 1'b1;
                    end
                end else clk_cnt <= clk_cnt + 1'b1;
                WAIT_HIGH: if (rx_sync) state <= IDLE;
                default: state <= IDLE;
            endcase
        end
    end
endmodule
`;
  const top=hdr('uart_top: independent transmitter and receiver sharing clk/rst.')+`module uart_top (
    input  wire clk,
    input  wire rst,
    input  wire tx_start,
    input  wire [${N-1}:0] tx_data,
    output wire tx_serial,
    output wire tx_busy,
    output wire tx_done,
    input  wire rx_serial,
    output wire [${N-1}:0] rx_data,
    output wire rx_valid,
    output wire rx_busy,
    output wire rx_frame_err${P?',\n    output wire rx_parity_err':''}
);
    uart_tx u_tx (.clk(clk), .rst(rst), .start(tx_start), .data(tx_data), .tx(tx_serial), .busy(tx_busy), .done(tx_done));
    uart_rx u_rx (.clk(clk), .rst(rst), .rx(rx_serial), .data(rx_data), .valid(rx_valid), .busy(rx_busy), .frame_err(rx_frame_err)${P?', .parity_err(rx_parity_err)':''});
endmodule
`;
  const ext=sv?'sv':'v';
  if(c.mod!=='rx')out.push([`uart_tx.${ext}`,tx]);
  if(c.mod!=='tx')out.push([`uart_rx.${ext}`,rx]);
  if(c.mod==='both')out.push([`uart_top.${ext}`,top]);
  out.push(['tb_uart.sv',genTb(c,d,P,pex)]);
  return out;
}
