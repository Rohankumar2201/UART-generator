// uart_rx: two-flop synchronizer, start-bit detect, mid-bit sampling. valid pulses 1 cycle after a good frame.
// data is only meaningful while valid is high. If the last stop bit is low (framing error or break) the receiver waits for the line to return high before looking for a new start bit.
// Clock 100 MHz, target 115200 baud, CLKS_PER_BIT = 868 (actual 115207.37 baud, error 0.006%)
// Format 8N1, LSB first. Reset: synchronous, active high.
module uart_rx (
    input  wire clk,
    input  wire rst,
    input  wire rx,
    output reg [7:0] data,
    output reg valid,
    output wire busy,
    output reg frame_err
);
    localparam CLKS_PER_BIT = 868;
    localparam DATA_BITS    = 8;
    localparam STOP_BITS    = 1;
    // The 2-flop synchronizer and the IDLE->START step delay start-bit detection by about 4 clocks,
    // so wait that much less than half a bit to land near the middle of the start bit.
    localparam HALF_WAIT    = (CLKS_PER_BIT/2 > 3) ? CLKS_PER_BIT/2 - 3 : 0;
    localparam [2:0] IDLE = 3'd0, START = 3'd1, DATA = 3'd2, STOP = 3'd4, WAIT_HIGH = 3'd5;

    reg rx_meta, rx_sync;
    reg [2:0] state;
    reg [9:0] clk_cnt;
    reg [2:0] bit_idx;
    reg [7:0] shreg;
    reg stop_cnt, stop_bad;

    assign busy = (state != IDLE);

    always @(posedge clk) begin
        if (rst) begin rx_meta <= 1'b1; rx_sync <= 1'b1; end
        else begin rx_meta <= rx; rx_sync <= rx_meta; end
    end

    always @(posedge clk) begin
        valid <= 1'b0; frame_err <= 1'b0;
        if (rst) begin
            state <= IDLE; clk_cnt <= 0; bit_idx <= 0; shreg <= 0; data <= 0; stop_cnt <= 0; stop_bad <= 1'b0;
        end else begin
            case (state)
                IDLE: if (!rx_sync) begin
                    clk_cnt <= 0; stop_bad <= 1'b0; state <= START;
                end
                START: if (clk_cnt == HALF_WAIT) begin
                    clk_cnt <= 0; bit_idx <= 0;
                    state <= rx_sync ? IDLE : DATA;
                end else clk_cnt <= clk_cnt + 1'b1;
                DATA: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0; shreg <= {rx_sync, shreg[7:1]};
                    if (bit_idx == DATA_BITS-1) begin stop_cnt <= 0; state <= STOP; end
                    else bit_idx <= bit_idx + 1'b1;
                end else clk_cnt <= clk_cnt + 1'b1;
                STOP: if (clk_cnt == CLKS_PER_BIT-1) begin
                    clk_cnt <= 0;
                    if (stop_cnt == STOP_BITS-1) begin
                        state <= rx_sync ? IDLE : WAIT_HIGH; data <= shreg;   // last stop bit low: wait for the line to go high
                        frame_err <= stop_bad | ~rx_sync;
                        valid <= ~(stop_bad | ~rx_sync);
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
