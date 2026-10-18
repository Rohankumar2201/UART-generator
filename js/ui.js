// Page state, DOM wiring, syntax highlighting, waveform drawing, downloads.
const $=id=>document.getElementById(id);
const S={clk:100e6,baud:115200,bits:8,par:'none',stop:1,mod:'both',lang:'v'};
let files=[],cur=0;
const CLKS=[10,25,50,100],BAUDS=[9600,19200,38400,57600,115200];
const PRESETS=[['Standard 8N1 @ 115200',{baud:115200,bits:8,par:'none',stop:1}],['8E1 even parity',{baud:115200,bits:8,par:'even',stop:1}],['7O1 odd parity',{baud:115200,bits:7,par:'odd',stop:1}],['Low speed 9600 8N1',{baud:9600,bits:8,par:'none',stop:1}],['Custom',null]];
const fill=(el,o)=>el.innerHTML=o.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
fill($('clk'),[...CLKS.map(m=>[m,m+' MHz']),['c','Custom']]);
fill($('baud'),[...BAUDS.map(b=>[b,b]),['c','Custom']]);
fill($('bits'),[5,6,7,8].map(b=>[b,b]));
fill($('preset'),PRESETS.map((p,i)=>[i,p[0]]));
function hl(t){
  const e=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return e.replace(/(\/\/.*)|(\b(?:module|endmodule|input|output|wire|reg|logic|assign|always|always_ff|posedge|negedge|begin|end|if|else|case|endcase|default|localparam|parameter|task|endtask|function|endfunction|automatic|for|foreach|repeat|wait|return|int|real|bit|initial)\b)|(\b\d+'[sS]?[bhdBHD][0-9a-fA-F_]+|\b\d+\b)/g,(m,c,k,n)=>c?`<span class="c">${c}</span>`:k?`<span class="k">${k}</span>`:`<span class="n">${n}</span>`);
}

function wave(bits,c,r){
  const u=38,pad=u,w=pad*2+bits.length*u,hi=18,lo=58;let x=pad,path=`M0 ${hi}H${x}`,y=hi,g='';
  bits.forEach((b,i)=>{
    const ny=b.v?hi:lo;if(ny!==y)path+=`V${ny}`;path+=`H${x+u}`;y=ny;
    g+=`<line x1="${x}" y1="6" x2="${x}" y2="90" stroke="var(--bd)" stroke-dasharray="3 3"/><text x="${x+u/2}" y="76" text-anchor="middle" font-size="11" fill="var(--mu)">${b.l}</text><text x="${x+u/2}" y="${hi-6}" text-anchor="middle" font-size="10" fill="var(--tx)">${b.v}</text>`;x+=u;
  });
  path+=`V${hi}H${w}`;
  return`<svg width="${w}" height="100" viewBox="0 0 ${w} 100" role="img" aria-label="UART frame waveform"><text x="4" y="12" font-size="10" fill="var(--mu)">idle</text>${g}<line x1="${x}" y1="6" x2="${x}" y2="90" stroke="var(--bd)" stroke-dasharray="3 3"/><path d="${path}" fill="none" stroke="var(--ac)" stroke-width="2"/></svg>`;
}

function render(){
  const c=S,{errs,warns,d}=calc(c),m=[];
  errs.forEach(t=>m.push(`<div class="msg e">${t}</div>`));warns.forEach(t=>m.push(`<div class="msg w">${t}</div>`));
  $('msgs').innerHTML=m.join('');
  const bad=errs.length>0;
  $('sum').innerHTML=bad?'<tr><td>Fix the errors above</td></tr>':[['Clock',fmtHz(c.clk)],['Baud (target)',c.baud],['Ideal divider',d.ideal.toFixed(2)],['Divider used',d.div],['Actual baud',d.actual.toFixed(2)],['Baud error',d.err.toFixed(3)+'%'],['Bit time',d.us.toFixed(3)+' µs'],['Data',c.bits+' bits'],['Parity',c.par],['Stop bits',c.stop],['Format',fmt(c)],['Frame time',((c.bits+1+(c.par!=='none'?1:0)+c.stop)*d.us).toFixed(2)+' µs']].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
  const pb=parseByte($('byte').value,c);
  $('bmsg').innerHTML=pb.err?`<div class="msg e">${pb.err}</div>`:'';
  const bits=frame(c,pb.err?0:pb.v);
  $('frame').innerHTML='<div class="bit"><b>Idle</b>1</div>'+bits.map(b=>`<div class="bit ${b.k||''}"><b>${b.l}</b>${b.v}</div>`).join('');
  $('fexp').innerHTML=`Idle: line held high. Start: one low bit that begins the frame. D0 is the LSB, sent first.${c.par!=='none'?` Parity: makes the count of 1s in data+parity ${c.par==='even'?'even':'odd'}.`:''} Stop: ${c.stop} high bit${c.stop>1?'s':''} before the next frame. (Frame shown for the byte entered below.)`;
  $('wave').innerHTML=pb.err?'':wave(bits,c);
  if(bad){files=[];$('code').textContent='No RTL generated: fix the configuration errors.';$('tabs').innerHTML='';return}
  files=gen({...c},d);if(cur>=files.length)cur=0;
  $('tabs').innerHTML=files.map((f,i)=>`<button class="${i===cur?'on':''}" data-i="${i}">${f[0]}</button>`).join('');
  $('code').innerHTML=hl(files[cur][1]);
}

async function save(name,text){
  const dl=window.claude?await claude.use('downloads'):null,blob=new Blob([text],{type:'text/plain'});
  if(dl){try{await dl.save({filename:name+'.txt',data:blob})}catch(e){}return}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
}
function readCfg(){
  S.clk=$('clk').value==='c'?parseFloat($('clkc').value)*1e6:+$('clk').value*1e6;
  S.baud=$('baud').value==='c'?parseFloat($('baudc').value):+$('baud').value;
  S.bits=+$('bits').value;S.par=$('par').value;S.stop=+$('stop').value;S.mod=$('mod').value;S.lang=$('lang').value;
  $('clkc').hidden=$('clk').value!=='c';$('baudc').hidden=$('baud').value!=='c';
}
function setCfg(p){
  if(p.baud){$('baud').value=BAUDS.includes(p.baud)?p.baud:'c';$('baudc').value=p.baud}
  $('bits').value=p.bits;$('par').value=p.par;$('stop').value=p.stop;
}
['clk','clkc','baud','baudc','bits','par','stop','mod','lang','byte'].forEach(id=>$(id).addEventListener('input',()=>{if(id!=='byte'&&id!=='mod'&&id!=='lang')$('preset').value=4;readCfg();render()}));
$('preset').onchange=()=>{const p=PRESETS[+$('preset').value][1];if(p)setCfg(p);readCfg();render()};
$('tabs').onclick=e=>{if(e.target.dataset.i){cur=+e.target.dataset.i;render()}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(files[cur][1]);$('copy').textContent='Copied'}catch{$('copy').textContent='Copy blocked: select text manually'}setTimeout(()=>$('copy').textContent='Copy',1500)};
$('dl').onclick=()=>files.length&&save(files[cur][0],files[cur][1]);
$('dlall').onclick=async()=>{for(const f of files)await save(f[0],f[1])};
$('theme').onclick=()=>{const r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;r.dataset.theme=dark?'light':'dark'};
$('clk').value=100;$('baud').value=115200;$('bits').value=8;$('mod').value='both';$('preset').value=0;
readCfg();render();
