// PWM: rasgo = máximo sobre las filas del foco (rolling shutter "barre" el PWM) + verosimilitud de mezcla
'use strict';
const {mulberry32,arbol}=require('./sim.js');
function median(a){const b=Array.from(a).sort((p,q)=>p-q);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;}
function sim(o,rnd){
  const randn=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd());};
  const A=arbol(o.tipo),T=1/o.fps,R=o.ro*T,E=o.E,tau=1+rnd()*T,ph=rnd(),phi=rnd()*T;
  const fr=[];for(let k=0;;k++){const s=tau-1.2+phi+k*T;if(s>tau+A.D+A.last+0.8)break;fr.push(s);}
  const nr=9,h=o.h; // filas por foco y alto relativo del foco
  const val=(f,t)=>{let on=0;for(const[a,c]of f.on)if(t>=tau+a&&t<tau+c)on=1;const p=((t*o.pwm+ph)%1+1)%1;return on*(p<o.duty?1:0);};
  const y=A.focos.map(f=>fr.map(s=>{let mx=0,mean=0;for(let r=0;r<nr;r++){const yy=f.y-h/2+h*r/(nr-1);const t0=s+yy*R;
      // exposición corta: integrar con 8 subpasos
      let v=0;for(let q=0;q<8;q++)v+=val(f,t0+E*(q+0.5)/8);v/=8;const z=1+3*v*(1+0.02*randn())+0.02*randn();mx=Math.max(mx,z);mean+=z/nr;}
    return o.rasgo==='max'?mx:mean;}));
  return {A,T,R,E,tau,fr,y};
}
function est(S,o){
  const {A,T,R,fr,y}=S;const tL=A.last;
  // por foco: niveles; d = fracción de cuadros "encendidos" en la meseta
  let nll=null;const cand=[];const gru=[];
  A.focos.forEach((f,i)=>{const r=y[i];const lo=median(r.slice(0,15));const hi=Math.max(...r);const th=(lo+hi)/2;
    const j=r.findIndex(v=>v>th);gru.push(fr[j]-f.on[0][0]);});
  const tauG=Math.min(...gru); // con PWM el primer visto puede llegar tarde: tomar el más temprano
  for(let x=tauG-4*T;x<=tauG+T;x+=2e-4)cand.push(x);
  nll=new Float64Array(cand.length);
  A.focos.forEach((f,i)=>{const r=y[i];const lo=median(r.slice(0,15));const [a0,c0]=f.on[0];
    const jOn=fr.map((s,j)=>j).filter(j=>fr[j]>tauG+a0+0.05&&fr[j]<tauG+Math.min(c0,a0+0.4)-0.03);
    const hiV=jOn.map(j=>r[j]).sort((p,q)=>p-q);const hi=hiV[Math.floor(hiV.length*0.9)];const th=(lo+hi)/2;
    const d=Math.min(0.98,Math.max(0.3,jOn.filter(j=>r[j]>th).length/jOn.length));
    const sg=Math.max(0.02,1.4826*median(fr.slice(0,15).map((_,j)=>Math.abs(r[j]-lo))));
    const js=fr.map((s,j)=>j).filter(j=>Math.abs(fr[j]-(tauG+a0))<6*T||Math.abs(fr[j]-(tauG+c0))<6*T);
    cand.forEach((tc,ci)=>{let L=0;for(const j of js){const s=fr[j]+f.y*R-tc;const on=s>=a0&&s<c0;
      const pOff=Math.exp(-0.5*((r[j]-lo)/sg)**2),pOn=Math.exp(-0.5*((r[j]-hi)/(sg*3))**2);
      const lik=on?d*pOn+(1-d)*pOff:pOff+1e-3*pOn;L-=Math.log(lik+1e-12);}nll[ci]+=L;});});
  const mn=Math.min(...nll);let sw=0,st=0;cand.forEach((tc,ci)=>{const w=Math.exp(-(nll[ci]-mn));sw+=w;st+=w*tc;});return st/sw;
}
for(const pwm of [200,400,1000])for(const rasgo of ['media','max'])for(const fps of [30,60,120])for(const tipo of ['pro','full']){
  const o={pwm,duty:0.5,E:3e-4,fps,tipo,ro:0.7,h:0.06,rasgo};const rnd=mulberry32(77+fps+pwm);const e=[];
  for(let n=0;n<60;n++){const S=sim(o,rnd);e.push((est(S,o)-S.tau)*1000);}
  const m=e.reduce((a,b)=>a+b,0)/e.length,sd=Math.sqrt(e.reduce((a,b)=>a+(b-m)**2,0)/e.length),p95=e.map(Math.abs).sort((a,b)=>a-b)[57];
  console.log(`PWM ${pwm} Hz rasgo ${rasgo.padEnd(5)} ${fps}fps ${tipo.padEnd(4)}: ${m.toFixed(1)}±${sd.toFixed(1)} p95 ${p95.toFixed(1)} ms`);}
