function R = drag_procesar(gps, accd, cfg)
%DRAG_PROCESAR  Calcula los tiempos de una corrida a partir de los logs crudos.
%
%   R = drag_procesar(gps, accd, cfg)
%
%   gps.t [s], gps.v [m/s]; opcionales: gps.hacc [m], gps.lat, gps.lon [deg]
%   accd.t [s], accd.a (Nx3, m/s^2, con gravedad). accd = [] -> solo GPS.
%   cfg  = drag_config() (con distancia_final ajustada)
%
%   Método:
%    1. Encuentra el arranque real con el GPS (ignora burnout, alineación y stage).
%    2. Calibra la gravedad con el acelerómetro justo antes del arranque.
%    3. Detecta el instante de arranque (t0) con el acelerómetro y lo afina:
%       recta del frente de subida de la aceleración + gravedad medida en el
%       reposo justo antes (auto en stage).
%    4. Halla el eje longitudinal (no importa cómo esté montado el teléfono).
%    5. Fusión: integra la aceleración desde el reposo y la corrige con un
%       modelo suave ajustado a todo el GPS (deriva + escala), descartando
%       lecturas GPS atípicas.
%    6. Distancia = integral de la velocidad (no la posición GPS).
%    7. Interpola el instante exacto de cada hito y aplica el rollout.

if nargin < 3 || isempty(cfg), cfg = drag_config(); end
R = struct('ok', false, 'mensaje', '', 'avisos', {{}});
avisos = {};
dt = 1/cfg.fs;

%% 1) GPS: limpiar y ubicar la corrida
tG = gps.t(:); vG = gps.v(:); nG = numel(tG);
hG   = campo(gps, 'hacc', nG);
latG = campo(gps, 'lat',  nG);
lonG = campo(gps, 'lon',  nG);
ok = isfinite(tG) & isfinite(vG) & vG >= 0;   % iOS manda -1 si la velocidad no es válida
tG = tG(ok); vG = vG(ok); hG = hG(ok); latG = latG(ok); lonG = lonG(ok);
[tG, iu] = unique(tG);
vG = vG(iu); hG = hG(iu); latG = latG(iu); lonG = lonG(iu);

if numel(tG) < 3
    R.mensaje = 'Muy pocos datos de GPS.'; return
end
[iRun, iQ] = buscar_arranque(tG, vG, cfg);
if isempty(iRun)
    vm = max([vG(tG >= cfg.t_inicio_busqueda); 0]) * 3.6;
    R.mensaje = sprintf(['No se detectó un arranque: ningún movimiento llegó a %.0f km/h ' ...
        'en menos de %.0f s desde detenido (vel. máxima registrada %.0f km/h).'], ...
        cfg.v_confirma*3.6, cfg.t_confirma, vm);
    return
end
tRun = tG(iRun);
tQ = tG(iQ);                                         % última lectura casi detenido
[nIgn, vIgn] = movimientos_previos(tG, vG, iQ, cfg);
t0g = t0_por_gps(tG, vG, iQ, iRun);

%% 2-4) Acelerómetro: gravedad, arranque y eje longitudinal
usarAcc = cfg.usar_acc && isstruct(accd) && isfield(accd, 'a') && size(accd.a, 1) >= 20;
ruido = NaN; gvec = nan(1,3); u = nan(1,3); tA = []; tIni = NaN; descartadas = 0;
if usarAcc
    tA = accd.t(:); A = double(accd.a);
    okA = isfinite(tA) & all(isfinite(A), 2);
    tA = tA(okA); A = A(okA, :);
    [tA, iu] = unique(tA); A = A(iu, :);
    if numel(tA) < 20 || tA(1) > tQ - 0.5 || tA(end) < tRun + 1.0
        usarAcc = false;
        avisos{end+1} = 'El acelerómetro no cubre el arranque; se usó solo GPS.';
    end
end
if usarAcc
    % Algunos dispositivos reportan en g en lugar de m/s^2
    if norm(median(A(tA <= tQ, :), 1)) < 3
        A = A * 9.80665;
        avisos{end+1} = 'El acelerómetro reportaba en g; se convirtió a m/s^2.';
    end
    tq = (max(tA(1), tQ - 5) : dt : tA(end)).';
    Af = interp1(tA, A, tq, 'linear');
    Af = movmean(Af, max(1, round(cfg.suavizado_s*cfg.fs)), 1);

    win = tq >= tQ - 3.0 & tq <= tQ - 1.0;              % reposo antes del arranque
    if nnz(win) < 0.3*cfg.fs, win = tq <= tQ - 0.5; end
    if nnz(win) < 10
        usarAcc = false;
        avisos{end+1} = 'No hubo reposo suficiente para calibrar la gravedad; se usó solo GPS.';
    end
end
if usarAcc
    gvec = median(Af(win, :), 1);
    Dyn  = Af - gvec;                                    % aceleración sin gravedad
    dmag = sqrt(sum(Dyn.^2, 2));
    ruido = std(dmag(win));
    if abs(norm(gvec) - 9.81) > 1.0
        avisos{end+1} = sprintf('Gravedad medida rara (%.2f m/s^2): ¿se movió el teléfono?', norm(gvec));
    end
    umbral = max(cfg.umbral_mov, 4*ruido);

    % Arranque: pico de aceleración entre el último reposo y la corrida,
    % y desde ahí hacia atrás hasta que la aceleración vuelve a ~0.
    zona = find(tq >= tQ - 1.0 & tq <= tRun);
    [pk, iPk] = max(dmag(zona));
    if isempty(zona) || pk < umbral
        usarAcc = false;
        avisos{end+1} = 'No se distinguió el arranque en el acelerómetro; se usó solo GPS.';
    else
        kPk = zona(iPk);
        k0 = find(dmag(1:kPk) < umbral/2, 1, 'last');
        if isempty(k0), k0 = kPk; end
        t0 = tq(k0);
        wF = tq >= t0 & tq <= t0 + cfg.ventana_fwd_s;
        u = mean(Dyn(wF, :), 1); u = u / norm(u);       % eje "hacia adelante"
        aL = Dyn * u.';                                  % aceleración longitudinal
        tIni = t0;
        if cfg.refinar_inicio
            [t0r, gr, ur, aLr] = refinar_inicio(tq, Af, gvec, kPk, cfg);
            if isfinite(t0r)
                t0 = t0r; gvec = gr; u = ur; aL = aLr;
                tIni = max(tq(1), t0 - cfg.pre_integracion_s);   % integrar desde el reposo
            else
                avisos{end+1} = 'No se pudo afinar el instante de arranque; se usó la detección básica.';
            end
        end
        if abs(t0 - t0g) > 1.5
            avisos{end+1} = sprintf('El arranque del acelerómetro y el del GPS difieren %.1f s.', t0 - t0g);
        end
    end
end

%% 5) Velocidad
if usarAcc
    sel = tq >= tIni;
    t = tq(sel); a = aL(sel);
    vAcc = cumtrapz(t, a);
    modelo = strcmp(cfg.fusion, 'modelo');
    lag = cfg.latencia_gps_s;
    if isnan(lag), lag = estimar_latencia(tG, vG, t, vAcc, t0, t0 + 20, cfg.latencia_max_s, modelo); end
    tGl = tG - lag;                                     % GPS alineado en el tiempo
    selG = tGl > t0 + 1e-3 & tGl < t(end);
    tc = [t(1); tGl(selG)];
    ec = [0; vG(selG) - interp1(t, vAcc, tGl(selG))];  % error en cada punto GPS
    if modelo && numel(tc) >= 4
        % error = deriva lineal + error de escala (inclinación del auto, eje)
        vc = interp1(t, vAcc, tc);
        x1 = max(tc - t0, 0);
        p = mc2(x1, vc, ec);
        r0 = ec - p(1)*x1 - p(2)*vc;                    % descartar saltos del GPS
        lim = max(0.5, 4*1.4826*median(abs(r0)));
        okp = abs(r0) <= lim; okp(1) = true;
        if nnz(okp) >= 4 && nnz(okp) < numel(okp)
            descartadas = nnz(~okp);
            tc = tc(okp); x1 = x1(okp); vc = vc(okp); ec = ec(okp);
            p = mc2(x1, vc, ec);
        end
        res = (ec - p(1)*x1 - p(2)*vc) * cfg.peso_residuo;
        res(1) = 0;
        rr = interp1(tc, res, t, 'linear');
        rr(t > tc(end)) = res(end);
        c = p(1)*max(t - t0, 0) + p(2)*vAcc + rr;
    else
        c = interp1(tc, ec, t, 'linear');
        c(t > tc(end)) = ec(end);
    end
    v = max(vAcc + c, 0);
    metodo = 'GPS + acelerómetro';
else
    t0 = t0g;
    selG = tG > t0 + 1e-3;
    tc = [t0; tG(selG)]; vc = [0; vG(selG)];
    t = (t0 : dt : tc(end)).';
    v = max(interp1(tc, vc, t, 'pchip'), 0);
    a = gradient(v, dt);
    lag = 0;      % sin acelerómetro el retraso no se puede medir (y casi no afecta)
    metodo = 'Solo GPS';
end

%% 6) Distancia y rollout
d = cumtrapz(t, v);
ro = cfg.rollout_ft * 0.3048;
if ro > 0, tRo = cruce(t, d, ro); else, tRo = t0; end
if ~isfinite(tRo)
    R.mensaje = 'El vehículo no avanzó ni el rollout.'; return
end

%% 7) Hitos
H = cfg.hitos;
hitos = struct('nombre', H(:,1), 'dist_m', H(:,2), 't', NaN, 'v_kmh', NaN);
for k = 1:numel(hitos)
    tk = cruce(t, d, hitos(k).dist_m);
    if isfinite(tk)
        hitos(k).t = tk - tRo;
        hitos(k).v_kmh = interp1(t, v, tk) * 3.6;
    end
end
t_0_100   = cruce(t, v, 100/3.6) - t0;    % sin rollout (desde que se mueve)
t_0_60mph = cruce(t, v, 26.8224) - t0;

Df = cfg.distancia_final;
tF1 = cruce(t, d, Df - cfg.dist_trampa_m);
tFin = cruce(t, d, Df);
trampa = cfg.dist_trampa_m / (tFin - tF1) * 3.6;        % NaN si no llegó
completo = isfinite(tFin);
if ~completo, tFin = t(end); end

%% Estadísticas y calidad
seg = t <= tFin;
est.tiempo_total    = tFin - tRo;
est.distancia_total = d(end);
est.v_max_kmh       = max(v) * 3.6;
est.a_max_g         = max(a(seg)) / 9.80665;
est.a_prom_g        = mean(a(seg)) / 9.80665;

segG = tG >= t0 & tG <= tFin;
cal.metodo         = metodo;
cal.gps_hz         = 1 / median(diff(tG));
cal.acc_hz         = NaN;
if numel(tA) > 1, cal.acc_hz = 1 / median(diff(tA)); end
cal.n_gps_corrida  = nnz(segG);
cal.hacc_mediana_m = median(hG(segG), 'omitnan');
cal.ruido_reposo   = ruido;
cal.g_medida       = norm(gvec);
cal.eje_adelante   = u;
cal.t0_menos_t0gps = t0 - t0g;
cal.latencia_gps_s = lag;
cal.gps_descartadas = descartadas;
cal.t_inicio_integracion = tIni;
cal.mov_ignorados  = nIgn;        % movimientos previos descartados (burnout, alineación...)
cal.v_max_ignorado_kmh = vIgn * 3.6;
cal.dist_pos_m     = NaN;   % distancia en línea recta según la posición GPS
if any(isfinite(latG))
    la = interp1(tG, latG, [t0 tFin]); lo = interp1(tG, lonG, [t0 tFin]);
    cal.dist_pos_m = haversine(la(1), lo(1), la(2), lo(2));
end
cal.dist_integrada_m = interp1(t, d, tFin);

if cal.gps_hz < 2 && ~usarAcc
    avisos{end+1} = 'GPS a ~1 Hz sin acelerómetro: los tiempos son solo aproximados.';
end
if descartadas > 0
    avisos{end+1} = sprintf('Se descartaron %d lecturas GPS atípicas.', descartadas);
end
if cal.hacc_mediana_m > 10
    avisos{end+1} = sprintf('Precisión GPS baja (%.0f m).', cal.hacc_mediana_m);
end

% Campos compatibles con el paquete DRAGPACK de la v1
[res.t_60ft,  res.v_60ft]  = buscar_hito(hitos, 18.288);
res.t_0_100 = t_0_100;
[res.t_101m,  res.v_101m]  = buscar_hito(hitos, 100.584);
[res.t_201m,  res.v_201m]  = buscar_hito(hitos, 201.168);
[res.t_305m,  res.v_305m]  = buscar_hito(hitos, 304.8);
res.t_1_8mi = res.t_201m; res.v_1_8mi = res.v_201m;
[res.t_1_4mi, res.v_1_4mi] = buscar_hito(hitos, 402.336);
res.t_0_60mph = t_0_60mph;
res.trampa_kmh = trampa;
res.rollout_ft = cfg.rollout_ft;

R.ok = true;
R.mensaje = 'OK';
R.t = t; R.v = v; R.d = d; R.a = a;
R.t0 = t0; R.tRo = tRo; R.tFin = tFin;
R.hitos = hitos;
R.t_0_100 = t_0_100; R.t_0_60mph = t_0_60mph;
R.trampa_kmh = trampa; R.completo = completo;
R.est = est; R.calidad = cal; R.res = res;
R.gps = struct('t', tG - lag, 'v', vG);
R.avisos = avisos;
R.cfg = cfg;
end

%% ------------------------------------------------------------------------
function x = campo(s, nombre, n)
if isfield(s, nombre) && numel(s.(nombre)) == n
    x = double(s.(nombre)(:));
else
    x = nan(n, 1);
end
end

function tc = cruce(t, y, Y)
% Instante (interpolado) en que y alcanza Y por primera vez. NaN si nunca.
k = find(y >= Y, 1);
if isempty(k), tc = NaN; return, end
if k == 1, tc = t(1); return, end
tc = t(k-1) + (Y - y(k-1)) / (y(k) - y(k-1)) * (t(k) - t(k-1));
end

function [iRun, iQ] = buscar_arranque(tG, vG, cfg)
% Arranque real: saliendo de casi detenido (v <= v_baja), el auto llega a
% v_confirma en menos de t_confirma sin volver a detenerse en medio.
% Burnout, salida del burnout, alineación y stage no cumplen esto.
iRun = []; iQ = [];
cand = find(vG >= cfg.v_confirma & tG >= cfg.t_inicio_busqueda);
for kc = cand.'
    kb = find(vG(1:kc) <= cfg.v_baja, 1, 'last');
    if isempty(kb) || tG(kb) < cfg.t_inicio_busqueda, continue, end
    if tG(kc) - tG(kb) <= cfg.t_confirma
        iQ = kb;
        iRun = kb + find(vG(kb+1:kc) >= cfg.v_corrida, 1);
        return
    end
end
end

function [n, vmax] = movimientos_previos(tG, vG, iQ, cfg)
% Cuenta los movimientos de más de v_corrida que se ignoraron antes del arranque.
n = 0; vmax = 0;
v = vG(tG >= cfg.t_inicio_busqueda & tG <= tG(iQ));
if numel(v) < 2, return, end
mov = v > cfg.v_baja;
ini = find(mov & [true; ~mov(1:end-1)]);
fin = find(mov & [~mov(2:end); true]);
for j = 1:numel(ini)
    vm = max(v(ini(j):fin(j)));
    if vm >= cfg.v_corrida, n = n + 1; vmax = max(vmax, vm); end
end
end

function t0 = t0_por_gps(tG, vG, iQ, iRun)
% Extrapola hacia atrás las primeras velocidades para hallar cuándo era 0.
if isempty(iQ), i1 = iRun; else, i1 = iQ + 1; end
i1 = min(i1, numel(tG) - 1);
t1 = tG(i1); v1 = vG(i1);
acc = (vG(i1+1) - v1) / (tG(i1+1) - t1);
if acc > 0.5
    t0 = t1 - v1/acc;
else
    t0 = t1 - 0.5;
end
if ~isempty(iQ), t0 = max(t0, tG(iQ)); end
t0 = min(t0, t1);
end

function lag = estimar_latencia(tG, vG, t, vAcc, t0, tLim, lmax, modelo)
% Busca el retraso del GPS que mejor explica la diferencia acelerómetro-GPS
% con el modelo de error (deriva + escala). Un retraso mal puesto produce
% errores proporcionales a la aceleración, que el modelo no puede explicar.
lag = 0; mejor = Inf;
tEnd = min(t(end), tLim);
for L = 0:0.02:lmax+1e-9
    tg = tG - L;
    if modelo
        s = tg > t0 + 1e-3 & tg < tEnd;
        if nnz(s) < 4, continue, end
        va = interp1(t, vAcc, tg(s));
        x1 = tg(s) - t0; e = vG(s) - va;
        p = mc2(x1, va, e);
        r = mean((e - p(1)*x1 - p(2)*va).^2);
    else
        s = tg > t(1) + 1e-3 & tg < tEnd;
        if nnz(s) < 4, continue, end
        tc = [0; tg(s) - t(1)];
        ec = [0; vG(s) - interp1(t, vAcc, tg(s))];
        pp = polyfit(tc, ec, 1);
        r = sum((ec - polyval(pp, tc)).^2);
    end
    if r < mejor, mejor = r; lag = round(L*100)/100; end
end
end

function p = mc2(x1, x2, e)
% Mínimos cuadrados sin término independiente: e ~ p(1)*x1 + p(2)*x2
a = sum(x1.^2); b = sum(x1.*x2); c = sum(x2.^2); d = sum(x1.*e); f = sum(x2.*e);
dt_ = a*c - b^2;
if abs(dt_) < 1e-12
    if a > 0, p = [d/a, 0]; else, p = [0, 0]; end
else
    p = [(d*c - b*f)/dt_, (a*f - b*d)/dt_];
end
end

function [tOn, g, u, aL] = refinar_inicio(tq, Af, g0, kPk, cfg)
% Afina el instante de arranque:
%  - eje "adelante" alrededor del pico de aceleración
%  - inicio = donde la recta del frente de subida (20%-80% del pico) cruza 0
%  - gravedad = mediana del reposo justo antes de ese inicio (auto en stage)
% Se repite para que gravedad e inicio se ajusten entre sí.
fs = cfg.fs; n = numel(tq);
g = g0; tOn = NaN; u = nan(1,3); aL = [];
for it = 1:3
    Dyn = Af - g;
    i1 = max(1, kPk - round(0.2*fs)); i2 = min(n, kPk + fs);
    s = sum(Dyn(i1:i2, :), 1);
    if ~(norm(s) > 0), tOn = NaN; return, end
    u = s / norm(s);
    aL = Dyn * u.';
    j1 = max(1, kPk - round(0.3*fs)); j2 = min(n, kPk + round(0.3*fs));
    [pk, ip] = max(aL(j1:j2)); kp = j1 + ip - 1;
    if ~(pk > cfg.umbral_mov), tOn = NaN; return, end
    k50 = find(aL(1:kp-1) < 0.5*pk, 1, 'last');
    if isempty(k50), tOn = NaN; return, end
    k50 = k50 + 1;
    k20 = k50;
    while k20 > 1 && aL(k20) >= 0.2*pk, k20 = k20 - 1; end
    k80 = k50;
    while k80 < kp && aL(k80) < 0.8*pk, k80 = k80 + 1; end
    x = tq(k20:k80) - tq(k50); y = aL(k20:k80);
    m = numel(x); sx = sum(x); sy = sum(y); sxx = sum(x.^2); sxy = sum(x.*y);
    den = m*sxx - sx^2;
    if den > 0, p1 = (m*sxy - sx*sy)/den; else, p1 = 0; end
    p0 = (sy - p1*sx)/m;
    if p1 > 0, tOn = tq(k50) - p0/p1; else, tOn = tq(k20); end
    tOn = min(max(tOn, tq(k20) - 0.2), tq(k50));
    if it == 3, break, end
    w = tq >= tOn - cfg.reposo_s & tq <= tOn - 0.1;
    if nnz(w) < 10, break, end
    g = median(Af(w, :), 1);
end
end

function [th, vh] = buscar_hito(hitos, D)
k = find(abs([hitos.dist_m] - D) < 0.01, 1);
if isempty(k), th = NaN; vh = NaN; else, th = hitos(k).t; vh = hitos(k).v_kmh; end
end

function d = haversine(lat1, lon1, lat2, lon2)
R = 6371000;
p1 = deg2rad(lat1); p2 = deg2rad(lat2);
dp = deg2rad(lat2 - lat1); dl = deg2rad(lon2 - lon1);
a = sin(dp/2).^2 + cos(p1).*cos(p2).*sin(dl/2).^2;
d = 2*R*atan2(sqrt(a), sqrt(1 - a));
end
