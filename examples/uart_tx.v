// uart_tx: sample "start" for one cycle while busy is low; data is latched then. done pulses 1 cycle after the last stop bit.
// Clock 100 MHz, target 115200 baud, CLKS_PER_BIT = 868 (actual 115207.37 baud, error 0.006%)
// Format 8N1, LSB first. Reset: synchronous, active high.
module uart_tx (
    input  wire clk,
    input  wire rst,
    input  wire start,
    input  wire [7:0] data,
    output reg tx,
    output wire busy,
    output reg done
);
    localparam CLKS_PER_BIT = 868;
    localparam DATA_BITS    = 8;
    localparam STOP_BITS    = 1;
    localparam [2:0] IDLE = 3'd0, START = 3'd1, DATA = 3'd2, STOP = 3'd4;

    reg [2:0] state;
    reg [9:0] clk_cnt;
    reg [2:0] bit_idx;
    reg [7:0] shreg;
    reg stop_cnt;

    assign busy = (state != IDLE);

    always @(posedge clk) begin
        done <= 1'b0;
        if (rst) begin
            state <= IDLE; tx <= 1'b1; clk_cnt <= 0; bit_idx <= 0; shreg <= 0; stop_cnt <= 0;
        end else begin
            case (state)
                IDLE: begin
                    tx <= 1'b1;
                    if (start) begin
                        shreg <= data;
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
                        tx <= 1'b1; state <= STOP;
                    end else begin
                        shreg <= shreg >> 1; tx <= shreg[1]; bit_idx <= bit_idx + 1'b1;
                    end
                end else clk_cnt <= clk_cnt + 1'b1;
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
