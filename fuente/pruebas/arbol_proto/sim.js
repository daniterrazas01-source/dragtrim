// Simulador de cuadros de un árbol de arrancones + estimadores (prueba de concepto del presupuesto de error)
'use strict';
function mulberry32(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Árbol: lista de focos {nombre, fila (0..1 de la altura), tramos:[[on,off],...] relativos a tau}
function arbol(tipo){
  const fila={pre:0.30,stg:0.34,a1:0.40,a2:0.45,a3:0.50,g:0.56};
  if(tipo==='pro') return {D:0.4, last:0, focos:[
    {n:'a1',y:fila.a1,on:[[0,0.4]]},{n:'a2',y:fila.a2,on:[[0,0.4]]},{n:'a3',y:fila.a3,on:[[0,0.4]]},{n:'g',y:fila.g,on:[[0.4,9]]}]};
  return {D:0.5, last:1.0, focos:[
    {n:'a1',y:fila.a1,on:[[0,0.5]]},{n:'a2',y:fila.a2,on:[[0.5,1.0]]},{n:'a3',y:fila.a3,on:[[1.0,1.5]]},{n:'g',y:fila.g,on:[[1.5,9]]}]};
}
// forma de onda de un foco en rejilla fina (dt) desde t0: brillo 0..1 con subida/bajada exponencial (tr/tf=0 → LED)
function onda(on, t0, n, dt, tr, tf, pwm){
  const b=new Float64Array(n); let B=0;
  for(let i=0;i<n;i++){const t=t0+i*dt; let tgt=0; for(const [a,c] of on) if(t>=a&&t<c) tgt=1;
    const tau=tgt>B?tr:tf; B = tau>0 ? B+(tgt-B)*(1-Math.exp(-dt/tau)) : tgt;
    let x=B; if(pwm){const ph=((t*pwm.f+pwm.ph)%1+1)%1; x*= ph<pwm.duty?1:0;} b[i]=x;}
  const C=new Float64Array(n+1); for(let i=0;i<n;i++) C[i+1]=C[i]+b[i]*dt; return C;
}
function cumAt(C,t0,dt,t){const x=(t-t0)/dt; if(x<=0) return 0; const n=C.length-1; if(x>=n) return C[n]+(x-n)*dt*(C[n]-C[n-1])/dt; const i=Math.floor(x), f=x-i; return C[i]+f*(C[i+1]-C[i]);}

// Genera la serie por cuadro de cada foco. Devuelve cuadros {s: inicio exposición fila 0 (verdad), arr: llegada}, y[foco][k]
function simular(o, rnd){
  const randn=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd());};
  const A=arbol(o.tipo), T=1/o.fps, R=o.ro*T, E=Math.min(o.E, T*0.98);
  const tau=1.0+rnd()*T;  // activación del árbol (verdad)
  const tStart=tau-1.2, tEnd=tau+A.D+A.last+0.8; const dt=1e-4; const n=Math.ceil((tEnd-tStart)/dt)+10;
  const pwm=o.pwm?{f:o.pwm,duty:0.5,ph:rnd()}:null;
  const Cs=A.focos.map(f=>onda(f.on.map(([a,c])=>[a+tau,c+tau]),tStart,n,dt,o.tr,o.tf,pwm));
  const fr=[]; const phi=rnd()*T; let g=1;
  for(let k=0;;k++){const s=tStart+phi+k*T*(o.fpsErr||1); if(s+T>tEnd) break; fr.push({k,s}); }
  const y=A.focos.map(()=>new Float64Array(fr.length)), yb=new Float64Array(fr.length);
  for(let j=0;j<fr.length;j++){
    g*=Math.exp(0.004*randn()); // autoexposición: ganancia que deriva
    if(o.aeStep && j===Math.floor(fr.length*0.5)) g*=0.7;
    const glitch = rnd()<o.pGlitch ? (rnd()-0.5)*0.6 : 0;
    A.focos.forEach((f,i)=>{const s=fr[j].s+f.y*R; const v=(cumAt(Cs[i],tStart,dt,s+E)-cumAt(Cs[i],tStart,dt,s))/E;
      const base=o.fondo, amp=o.amp; y[i][j]=g*(base+amp*v)*(1+o.ruido*randn())+glitch*amp*(i===0?1:rnd()<0.5?1:0);});
    yb[j]=g*o.fondo*(1+0.005*randn());
  }
  return {A,T,R,E,tau,fr,y,yb};
}

// ---------- estimadores
function median(a){const b=Array.from(a).sort((p,q)=>p-q);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;}
function estimar(S, o, modo){
  const {A,T,R,E,fr}=S; const nF=fr.length;
  const ts=fr.map(f=>f.s); // marcas de tiempo (se asume ya mapeadas y sin jitter; ver otra prueba)
  // normalizar por el fondo (quita la autoexposición)
  const yn=S.y.map(row=>row.map((v,j)=>v/S.yb[j]));
  // eventos esperados por foco: [t relativo a tau, signo]
  const ev=A.focos.map(f=>{const e=[];for(const [a,c] of f.on){e.push([a,1]); if(c<5) e.push([c,-1]);} return e;});
  // grueso: primer cuadro sobre el 50% (sostenido 2 cuadros) en cada foco → tau grueso
  const gru=[];
  A.focos.forEach((f,i)=>{const r=yn[i]; const lo=median(r.slice(0,15)), hi=Math.max(...r); const th=(lo+hi)/2;
    for(let j=1;j<nF-1;j++) if(r[j]>th&&r[j+1]>th&&r[j-1]<=th){gru.push(ts[j]-f.on[0][0]); break;}});
  const tauG=median(gru);
  if(modo==='primero'){ // ingenuo: marca del primer cuadro encendido del último ámbar
    const iL=A.focos.findIndex(f=>Math.abs(f.on[0][0]-A.last)<1e-9);
    const r=yn[iL]; const lo=median(r.slice(0,15)); const j0=ts.findIndex(t=>t>tauG+A.last+0.15); const hi=median(r.slice(j0,j0+5)); const th=(lo+hi)/2;
    for(let j=1;j<nF;j++) if(r[j]>th && ts[j]>tauG+A.last-2*T) return ts[j]-A.last; return NaN; }
  if(modo==='medio'){ // punto medio entre último apagado y primer encendido del último ámbar
    const iL=A.focos.findIndex(f=>Math.abs(f.on[0][0]-A.last)<1e-9); const f=A.focos[iL];
    const r=yn[iL]; const lo=median(r.slice(0,15)); let hi; { const j0=ts.findIndex(t=>t>tauG+A.last+0.15); hi=median(r.slice(j0,j0+5)); }
    const th=(lo+hi)/2;
    for(let j=1;j<nF;j++) if(r[j]>th && ts[j]>tauG+A.last-2*T){ const s1=ts[j-1]+f.y*R, s2=ts[j]+f.y*R; return (s1+E+s2)/2 - A.last; } return NaN; }
  // ajuste por modelo (posterior en rejilla de tau). conjunto: 'ultimo' (solo último ámbar) o 'todos'
  const usar = modo==='modelo1' ? A.focos.map(f=>Math.abs(f.on[0][0]-A.last)<1e-9) : A.focos.map(()=>true);
  const trs = o.fitTr ? [0,0.005,0.01,0.02,0.03,0.045,0.06,0.08] : [0];
  const Rfit = o.Rfit!=null ? o.Rfit*T : R;
  let best={sse:Infinity}; const grids=[];
  for(const tr of trs){
    const tf = tr*0.6;
    const dtw=2e-4, t0w=-0.4, nW=Math.ceil((A.D+A.last+1.4)/dtw);
    const Cu=A.focos.map(f=>onda(f.on,t0w,nW,dtw,tr,tf,null));
    const cand=[]; for(let x=tauG-Math.max(2*T,o.fitTr?0.09:0); x<=tauG+2*T; x+=1e-4) cand.push(x);
    const sseArr=new Float64Array(cand.length); let nObs=0;
    // cuadros útiles: cerca de cada flanco
    const sel=A.focos.map((f,i)=>{if(!usar[i]) return []; const out=[]; for(let j=0;j<nF;j++){const rel=ts[j]-tauG; if(ev[i].some(([te])=>rel>te-6*T-0.02&&rel<te+Math.max(6*T,0.25))) out.push(j);} return out;});
    cand.forEach((tc,ci)=>{let sse=0; nObs=0;
      A.focos.forEach((f,i)=>{ if(!usar[i]) return; const js=sel[i]; if(!js.length) return;
        const p=js.map(j=>{const s=ts[j]+f.y*Rfit-tc; return (cumAt(Cu[i],t0w,dtw,s+E)-cumAt(Cu[i],t0w,dtw,s))/E;});
        const q=js.map(j=>yn[i][j]);
        // regresión lineal q = a + b p (niveles de apagado/encendido de cada foco)
        let sp=0,sq=0,spp=0,spq=0,m=js.length; for(let u=0;u<m;u++){sp+=p[u];sq+=q[u];spp+=p[u]*p[u];spq+=p[u]*q[u];}
        const den=m*spp-sp*sp; const b=den>1e-12?(m*spq-sp*sq)/den:0, a=(sq-b*sp)/m;
        const res=q.map((qq,u)=>qq-a-b*p[u]); const sc=Math.max(1e-6,1.4826*median(res.map(Math.abs)));
        for(const r of res){const z=Math.abs(r)/(2.5*sc); sse+= z<1? r*r : (2.5*sc)*(2*Math.abs(r)-2.5*sc);} nObs+=m; });
      sseArr[ci]=sse;});
    const mn=Math.min(...sseArr); grids.push({tr,cand,sseArr,nObs});
    if(mn<best.sse) best={sse:mn,tr,cand,sseArr,nObs};
  }
  const {cand,sseArr,nObs}=best; const mn=best.sse; const s2=Math.max(mn/Math.max(1,nObs-2*A.focos.length-1),1e-10);
  let sw=0,st=0; cand.forEach((tc,ci)=>{const w=Math.exp(-(sseArr[ci]-mn)/(2*s2)); sw+=w; st+=w*tc;});
  return st/sw;
}

module.exports={simular,estimar,mulberry32,arbol};
if(require.main===module){
  const N=+process.argv[2]||80;
  const reg={
    'día LED (E 0.3 ms)':{E:3e-4,tr:0,tf:0,ruido:0.02,amp:3,fondo:1,pGlitch:0.03},
    'sombra LED (E 8 ms)':{E:8e-3,tr:0,tf:0,ruido:0.02,amp:3,fondo:1,pGlitch:0.03},
    'noche LED (E ≈ T)':{E:1,tr:0,tf:0,ruido:0.03,amp:3,fondo:1,pGlitch:0.03},
    'día incand. τ 40 ms':{E:3e-4,tr:0.04,tf:0.025,ruido:0.02,amp:3,fondo:1,pGlitch:0.03,fitTr:true},
    'día LED PWM 400 Hz':{E:3e-4,tr:0,tf:0,ruido:0.02,amp:3,fondo:1,pGlitch:0.03,pwm:400},
    'sol de frente (contraste 0.3)':{E:3e-4,tr:0,tf:0,ruido:0.04,amp:0.3,fondo:1,pGlitch:0.05},
  };
  const only=process.argv[3];
  for(const [nm,base] of Object.entries(reg)){
    if(only && !nm.includes(only)) continue;
    for(const fps of [30,60,120]) for(const tipo of ['pro','full']){
      const o=Object.assign({fps,tipo,ro:0.7},base); const rnd=mulberry32(1234+fps);
      const err={primero:[],medio:[],modelo1:[],todos:[]};
      for(let n=0;n<N;n++){const S=simular(o,rnd); const tl=S.tau+S.A.last;
        for(const m of Object.keys(err)){const e=estimar(S,o,m)+S.A.last-tl; err[m].push(e*1000);} }
      const f=(e)=>{const m=e.reduce((a,b)=>a+b,0)/e.length; const sd=Math.sqrt(e.reduce((a,b)=>a+(b-m)**2,0)/e.length); const p95=e.map(Math.abs).sort((a,b)=>a-b)[Math.floor(e.length*0.95)];
        return `${m.toFixed(1).padStart(6)}±${sd.toFixed(1).padStart(4)} p95 ${p95.toFixed(1).padStart(5)}`;};
      console.log(`${nm.padEnd(30)} ${String(fps).padStart(3)}fps ${tipo.padEnd(4)} | 1er cuadro ${f(err.primero)} | medio ${f(err.medio)} | modelo últ. ${f(err.modelo1)} | modelo todos ${f(err.todos)}`);
    }
  }
}
