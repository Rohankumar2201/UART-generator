// Pure logic: formatting, baud-rate calculation, validation, frame bits, byte parsing.
const fmtHz=h=>h>=1e6?h/1e6+' MHz':h/1e3+' kHz';
const fmt=c=>`${c.bits}${{none:'N',even:'E',odd:'O'}[c.par]}${c.stop}`;
const clog=n=>Math.max(1,Math.ceil(Math.log2(n)));

function calc(c){
  const errs=[],warns=[];let d=null;
  if(!Number.isFinite(c.clk)||c.clk<=0)errs.push('Clock frequency must be a positive number of MHz (for example 50 for 50 MHz).');
  else if(c.clk<1e3||c.clk>1e9)errs.push(`Clock of ${c.clk} Hz is outside the supported range of 1 kHz to 1 GHz.`);
  if(!Number.isFinite(c.baud)||c.baud<=0)errs.push('Baud rate must be a positive number (for example 115200).');
  else if(c.baud<50||c.baud>12e6)errs.push(`Baud rate ${c.baud} is outside the supported range of 50 to 12,000,000.`);
  if(!Number.isInteger(c.bits)||c.bits<5||c.bits>8)errs.push('Data bits must be 5, 6, 7 or 8.');
  if(!['none','even','odd'].includes(c.par))errs.push('Parity must be none, even or odd.');
  if(c.stop!==1&&c.stop!==2)errs.push('Stop bits must be 1 or 2.');
  if(!errs.length){
    const ideal=c.clk/c.baud,div=Math.round(ideal),actual=c.clk/div;
    d={ideal,div,actual,err:(actual-c.baud)/c.baud*100,us:div/c.clk*1e6};
    if(div<4)errs.push(`Clock / baud is only ${ideal.toFixed(2)}. The receiver needs at least 4 clock cycles per bit to find the middle of a bit. Use a faster clock or a lower baud rate.`);
    else if(Math.abs(d.err)>5)errs.push(`The divider must be a whole number of clock cycles. ${ideal.toFixed(2)} rounds to ${div}, giving ${d.actual.toFixed(1)} baud: ${d.err.toFixed(2)}% away from the ${c.baud} you asked for. That is too far off to communicate reliably, so no RTL was generated. Pick a clock that divides more evenly by the baud rate.`);
    else{
      if(div<16)warns.push(`Only ${div} clock cycles per bit. This works in simulation, but the receiver then has almost no tolerance for baud-rate mismatch or jitter. 16 or more cycles per bit is much safer for real hardware.`);
      if(Math.abs(d.err)>2)warns.push(`The divider rounds to ${div}, giving ${d.actual.toFixed(1)} baud (${d.err.toFixed(2)}% error). The two ends of a UART link must agree within a few percent, and your partner device has its own error too, so this may be unreliable.`);
    }
  }
  return{errs,warns,d};
}
function frame(c,byte){
  const b=[{l:'Start',v:0,k:'s'}];let ones=0;
  for(let i=0;i<c.bits;i++){const v=(byte>>i)&1;ones+=v;b.push({l:'D'+i,v})}
  if(c.par!=='none')b.push({l:'Parity',v:c.par==='even'?ones%2:1-ones%2,k:'p'});
  for(let i=0;i<c.stop;i++)b.push({l:c.stop>1?'Stop'+(i+1):'Stop',v:1,k:'t'});
  return b;
}
function parseByte(s,c){
  s=s.trim().toLowerCase();let v;
  if(/^0b[01]+$/.test(s))v=parseInt(s.slice(2),2);
  else if(/^(0x)?[0-9a-f]+$/.test(s))v=parseInt(s.replace(/^0x/,''),16);
  else return{err:'Enter a hex (0x41) or binary (0b01000001) value.'};
  if(v>=2**c.bits)return{err:`Value does not fit in ${c.bits} data bits (max 0x${(2**c.bits-1).toString(16)}).`};
  return{v};
}
