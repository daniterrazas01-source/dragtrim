'use strict';
// 1) Marca de tiempo de cuadros: llegada = captura + L0 + jitter (exp) + atascos; recuperar la rejilla con envolvente inferior
const {mulberry32}=require('./sim.js');
const C=require('/home/user/dragtrim/fuente/app/src/dragcore.js');
function envolvente(k,a){ // recta a ≈ c0 + c1·k por debajo de casi todos los puntos (programa lineal aproximado: iterar MC sobre los puntos más bajos)
  let w=k.map(()=>1),c0=0,c1=0;
  for(let it=0;it<8;it++){let S=0,Sk=0,Sa=0,Skk=0,Ska=0;for(let i=0;i<k.length;i++){if(!w[i])continue;S++;Sk+=k[i];Sa+=a[i];Skk+=k[i]*k[i];Ska+=k[i]*a[i];}
    c1=(S*Ska-Sk*Sa)/(S*Skk-Sk*Sk);c0=(Sa-c1*Sk)/S;const r=a.map((x,i)=>x-c0-c1*k[i]);const srt=r.slice().sort((p,q)=>p-q);const q=srt[Math.floor(r.length*Math.max(0.05,0.5/(it+1)))];w=r.map(x=>x<=q?1:0);}
  // bajar la recta hasta el percentil 2 de los residuos
  const r=a.map((x,i)=>x-c0-c1*k[i]).sort((p,q)=>p-q);return [c0+r[Math.floor(r.length*0.02)],c1];
}
for(const fps of [30,60]){const rnd=mulberry32(9+fps);const T=1/fps;const E=[];
  for(let n=0;n<200;n++){const k=[],a=[],s=[];const L0=0.03;const drift=1+(rnd()-0.5)*1e-4;
    for(let i=0,kk=0;i<fps*6;i++,kk++){if(rnd()<0.02)kk++; // cuadro perdido
      const si=kk*T*drift;let j=-Math.log(rnd())*0.004;if(rnd()<0.03)j+=0.02+0.02*rnd();k.push(kk);s.push(si);a.push(si+L0+j);}
    const [c0,c1]=envolvente(k,a);const i=Math.floor(k.length*0.7);E.push((c0+c1*k[i]-s[i]-0.03)*1000);}
  const m=E.reduce((x,y)=>x+y,0)/E.length,sd=Math.sqrt(E.reduce((x,y)=>x+(y-m)**2,0)/E.length);
  console.log(`reloj de cuadros ${fps} fps: envolvente inferior → error ${m.toFixed(2)} ± ${sd.toFixed(2)} ms (jitter de llegada medio 4 ms + atascos)`);}

// 2) tRo de procesar(): error contra la verdad, y con marcas del acelerómetro tipo Chrome (evento a 60 Hz con la última lectura)
for(const caso of ['ideal','chrome60']){const e=[];
  for(let n=0;n<60;n++){const s=C.simularSesion({gps_hz:1,lag_gps:0.3,seed:7000+n,acc_hz:caso==='ideal'?60:200});
    let acc=s.acc;
    if(caso==='chrome60'){ // el sensor muestrea a 200 Hz; el navegador emite cada 16.7 ms con la última muestra y la marca de entrega
      const rnd=mulberry32(n);const t=[],ax=[],ay=[],az=[];let j=0;const ph=rnd()/60;
      for(let te=ph;te<acc.t[acc.t.length-1];te+=1/60){while(j<acc.t.length-1&&acc.t[j+1]<=te-0.002)j++;t.push(te+0.001*rnd());ax.push(acc.ax[j]);ay.push(acc.ay[j]);az.push(acc.az[j]);}
      acc={t,ax,ay,az};}
    const R=C.procesar(s.gps,acc,{});e.push((R.tRo-s.verdad.t_ro_abs)*1000);}
  const m=e.reduce((x,y)=>x+y,0)/e.length,sd=Math.sqrt(e.reduce((x,y)=>x+(y-m)**2,0)/e.length);
  console.log(`tRo (${caso}): sesgo ${m.toFixed(1)} ms, σ ${sd.toFixed(1)} ms, peor ${Math.max(...e.map(Math.abs)).toFixed(0)} ms`);}
