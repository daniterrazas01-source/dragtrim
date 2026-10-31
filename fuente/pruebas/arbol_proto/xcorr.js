'use strict';
// Calibración cámara↔giroscopio: el usuario mece el teléfono/soporte unos segundos; desplazamiento global de la imagen vs ángulo integrado del giroscopio
const {mulberry32}=require('./sim.js');
function run(fps,dur,seed,chrome){
  const rnd=mulberry32(seed);const randn=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd());};
  // movimiento: suma de senos 0.7–4 Hz, ~1–2°
  const comps=[];for(let i=0;i<8;i++)comps.push({f:0.7+3.3*rnd(),a:(0.3+0.5*rnd())*Math.PI/180,p:2*Math.PI*rnd()});
  const th=t=>comps.reduce((s,c)=>s+c.a*Math.sin(2*Math.PI*c.f*t+c.p),0);
  const w=t=>comps.reduce((s,c)=>s+c.a*2*Math.PI*c.f*Math.cos(2*Math.PI*c.f*t+c.p),0);
  const d0=0.020+0.04*rnd(); // retraso verdadero (marca cámara − marca giroscopio)
  // giroscopio: evento a 60 Hz; marca = instante de entrega; muestra tomada hasta 5 ms antes (chrome) o en la marca
  const gt=[],gw=[];for(let t=0.0;t<dur;t+=1/60){const lag=chrome?0.002+0.005*rnd():0.001*rnd();gt.push(t);gw.push(w(t-lag)+0.005*randn());}
  // integrar a ángulo
  const ga=[0];for(let i=1;i<gt.length;i++)ga.push(ga[i-1]+(gw[i]+gw[i-1])/2*(gt[i]-gt[i-1]));
  const interp=(x)=>{if(x<=gt[0])return ga[0];if(x>=gt[gt.length-1])return ga[ga.length-1];const i=Math.floor((x-gt[0])*60);const j=Math.min(Math.max(i,0),gt.length-2);const f=(x-gt[j])/(gt[j+1]-gt[j]);return ga[j]+f*(ga[j+1]-ga[j]);};
  // cámara: posición del árbol/escena en px = f·θ(t_exposición) + ruido 0.15 px; marca de la cámara = exposición + d0 (más jitter ya quitado por la envolvente)
  const F=1000,ct=[],cx=[];for(let t=0.3;t<dur-0.3;t+=1/fps){ct.push(t+d0);cx.push(F*th(t)+0.15*randn());}
  // buscar δ: cx ≈ a + b·θg(ct − δ) + c·t
  const sse=(dl)=>{const x=ct.map(t=>interp(t-dl));const n=x.length;let S=[[0,0,0],[0,0,0],[0,0,0]],r=[0,0,0];
    for(let i=0;i<n;i++){const v=[1,x[i],ct[i]];for(let a=0;a<3;a++){r[a]+=v[a]*cx[i];for(let b=0;b<3;b++)S[a][b]+=v[a]*v[b];}}
    // resolver 3x3
    const M=S.map((row,i)=>row.concat([r[i]]));for(let i=0;i<3;i++){let p=i;for(let k=i+1;k<3;k++)if(Math.abs(M[k][i])>Math.abs(M[p][i]))p=k;[M[i],M[p]]=[M[p],M[i]];for(let k=i+1;k<3;k++){const f=M[k][i]/M[i][i];for(let c=i;c<4;c++)M[k][c]-=f*M[i][c];}}
    const c=[0,0,0];for(let i=2;i>=0;i--){let s=M[i][3];for(let k=i+1;k<3;k++)s-=M[i][k]*c[k];c[i]=s/M[i][i];}
    let e=0;for(let i=0;i<n;i++){const d=cx[i]-c[0]-c[1]*x[i]-c[2]*ct[i];e+=d*d;}return e;};
  let best=0,bv=Infinity;for(let dl=-0.1;dl<=0.15;dl+=0.001){const v=sse(dl);if(v<bv){bv=v;best=dl;}}
  const a=sse(best-0.001),b=bv,c=sse(best+0.001);const off=(a-c)/(2*(a-2*b+c))*0.001;
  return (best+off-d0)*1000;
}
for(const chrome of [false,true])for(const fps of [30,60])for(const dur of [3,6]){const e=[];for(let s=0;s<60;s++)e.push(run(fps,dur,100+s,chrome));
  const m=e.reduce((a,b)=>a+b,0)/e.length,sd=Math.sqrt(e.reduce((a,b)=>a+(b-m)**2,0)/e.length);
  console.log(`${chrome?'Chrome':'iOS  '} ${fps} fps ${dur} s: error δ ${m.toFixed(2)} ± ${sd.toFixed(2)} ms`);}
