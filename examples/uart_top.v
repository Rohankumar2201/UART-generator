// uart_top: independent transmitter and receiver sharing clk/rst.
// Clock 100 MHz, target 115200 baud, CLKS_PER_BIT = 868 (actual 115207.37 baud, error 0.006%)
// Format 8N1, LSB first. Reset: synchronous, active high.
module uart_top (
    input  wire clk,
    input  wire rst,
    input  wire tx_start,
    input  wire [7:0] tx_data,
    output wire tx_serial,
    output wire tx_busy,
    output wire tx_done,
    input  wire rx_serial,
    output wire [7:0] rx_data,
    output wire rx_valid,
    output wire rx_busy,
    output wire rx_frame_err
);
    uart_tx u_tx (.clk(clk), .rst(rst), .start(tx_start), .data(tx_data), .tx(tx_serial), .busy(tx_busy), .done(tx_done));
    uart_rx u_rx (.clk(clk), .rst(rst), .rx(rx_serial), .data(rx_data), .valid(rx_valid), .busy(rx_busy), .frame_err(rx_frame_err));
endmodule
