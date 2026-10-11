%% drag_simular.m
% Prueba el algoritmo sin salir a la calle. Simula corridas con ruido realista:
%  - GPS a 1 Hz (configurable) con ruido en velocidad y posición
%  - Acelerómetro a 100 Hz con ruido, sesgo, vibración del motor y
%    teléfono montado en cualquier ángulo
%  - Cambios de velocidad y "sentada" del auto al arrancar
%  - Antes del arranque: burnout, salida del burnout, alineación y stage
% Compara contra la verdad tres métodos: v1 (en su mejor caso), v2 solo GPS
% y v2 GPS + acelerómetro.

clc; clear;
cfg = drag_config();
cfg.distancia_final = 402.336;

N      = 30;   % corridas simuladas
gps_hz = 1;    % prueba 1, 5 o 10 Hz
lag_gps = 0.25; % s de retraso simulado en la velocidad GPS (los celulares filtran)
rng(1);        % misma semilla = mismos resultados

D  = cell2mat(cfg.hitos(:, 2)).';
nH = numel(D);
e_v1 = nan(N, nH); e_gps = nan(N, nH); e_fus = nan(N, nH);
err_t0 = nan(N, 1);   % error al ubicar el arranque (s)
cfgG = cfg; cfgG.usar_acc = false;

for n = 1:N
    [gps, accd, verdad] = simular_corrida(gps_hz, lag_gps, cfg.rollout_ft*0.3048, D);
    R  = drag_procesar(gps, accd, cfg);
    Rg = drag_procesar(gps, [], cfgG);
    if R.ok
        e_fus(n, :) = [R.hitos.t] - verdad.t_hitos;
        err_t0(n) = R.t0 - verdad.t_arranque;
    end
    if Rg.ok, e_gps(n, :) = [Rg.hitos.t] - verdad.t_hitos; end
    e_v1(n, :) = metodo_v1(gps, D) - verdad.t_hitos_sin_ro;
end

fprintf('Error de tiempo vs la verdad: %d corridas, GPS a %g Hz, retraso GPS %.2f s\n', N, gps_hz, lag_gps);
fprintf('(promedio del error absoluto / peor caso, en segundos)\n\n');
fprintf('%-16s| %-14s| %-14s| %-14s\n', 'Hito', 'v1 mejor caso', 'v2 solo GPS', 'v2 GPS+acel');
for k = 1:nH
    fprintf('%-16s| %5.3f / %5.3f | %5.3f / %5.3f | %5.3f / %5.3f\n', cfg.hitos{k, 1}, ...
        mean(abs(e_v1(:, k)), 'omitnan'),  max(abs(e_v1(:, k))), ...
        mean(abs(e_gps(:, k)), 'omitnan'), max(abs(e_gps(:, k))), ...
        mean(abs(e_fus(:, k)), 'omitnan'), max(abs(e_fus(:, k))));
end

fprintf('\nArranque bien ubicado (error < 0.5 s) en %d de %d sesiones con burnout y stage.\n', ...
    nnz(abs(err_t0) < 0.5), N);
fprintf('(La v1 toma la salida del burnout como arranque: por eso su error es enorme.)\n');

% Gráfica de la última corrida: verdad vs calculado vs GPS crudo
figure('Name', 'Simulación: velocidad');
plot(verdad.t - R.tRo, verdad.v*3.6, 'k', 'LineWidth', 2); hold on
plot(R.t - R.tRo, R.v*3.6, 'LineWidth', 1.4);
plot(Rg.t - R.tRo, Rg.v*3.6, '--', 'LineWidth', 1.2);
plot(gps.t - R.tRo, gps.v*3.6, 'o'); hold off
xlim([-3 max(R.t - R.tRo)]); grid on
xlabel('Tiempo [s]'); ylabel('Velocidad [km/h]');
legend('Verdad', 'v2 GPS+acel', 'v2 solo GPS', 'GPS crudo', 'Location', 'southeast');
title('Simulación: velocidad');

%% ========================================================================
function [gps, accd, verdad] = simular_corrida(gps_hz, lag_gps, ro, D)
% Sesión completa como en pista: reposo, burnout, salida del burnout,
% alineación, entrada a stage, espera en stage y arranque.
% Arranque: tracción limitada, luego potencia limitada, aire y cambios.
dtS = 0.001; tMax = 90;
ts = (0:dtS:tMax).'; n = numel(ts);
aT = 4.5 + 2.5*rand;              % tracción [m/s^2] (~0.45-0.7 g)
Pm = 90 + 90*rand;                % potencia/masa [W/kg]
k = 3.5e-4; cr = 0.15;            % arrastre aerodinámico y rodadura
vCambio = [14 26 38 50] * (0.9 + 0.2*rand);
tB0 = 3; tB1 = tB0 + 3 + 2*rand;  % burnout: auto quieto, mucha vibración
vPull = (10 + 20*rand)/3.6;       % salida del burnout: 10-30 km/h
tStage = 0.8 + 2.2*rand;          % tiempo en stage antes de arrancar (árbol + reacción)
tRampa = 0.05 + 0.25*rand;        % qué tan brusco aplica la tracción
pitch = deg2rad(0.1 + 0.5*rand);  % "sentada" del auto por m/s^2
pend = (rand - 0.5)*0.02*9.80665;  % pendiente de la pista (±1%)
x = zeros(n, 1); v = zeros(n, 1); a = zeros(n, 1);
corte = -1; iC = 1; fase = 1; tF = 0; tPre = NaN; tStg0 = NaN;
for i = 2:n
    vi = v(i-1); t = ts(i);
    switch fase
        case 1,  ai = 0;    if t >= tB1, fase = 2; end                   % reposo + burnout
        case 2,  ai = 3;    if vi >= vPull, fase = 3; end                % sale del burnout
        case 3,  ai = -4;   if vi <= 0, fase = 4; tF = t; end            % frena
        case 4,  ai = 0;    if t >= tF + 2, fase = 5; end
        case 5,  ai = 0.6;  if vi >= 0.8, fase = 6; tF = t; end          % alineación / pre-stage
        case 6,  ai = 0;    if t >= tF + 1.5, fase = 7; end
        case 7,  ai = -0.8; if vi <= 0, fase = 8; tF = t; end
        case 8,  ai = 0;    if t >= tF + 1, fase = 9; end
        case 9,  ai = 0.5;  if vi >= 0.5, fase = 10; tF = t; end         % entra a stage
        case 10, ai = 0;    if t >= tF + 0.6, fase = 11; end
        case 11, ai = -0.8; if vi <= 0, fase = 12; tF = t; tStg0 = t; end
        case 12, ai = 0;    if t >= tF + tStage, fase = 13; tPre = t; end % en stage
        otherwise                                                         % ¡arranque!
            if iC <= numel(vCambio) && vi >= vCambio(iC)
                corte = t + 0.25; iC = iC + 1;    % cambio de velocidad: 0.25 s sin empuje
            end
            if t < corte
                ai = -cr - k*vi^2;
            else
                ai = min(aT*min(1, (t - tPre)/tRampa), Pm/max(vi, 1)) - cr - k*vi^2;
            end
    end
    if vi <= 0 && ai < 0, ai = 0; end
    a(i) = ai; v(i) = max(vi + ai*dtS, 0);
    x(i) = x(i-1) + (vi + v(i))/2*dtS;
end
T = tPre + 35;
keep = ts <= T; ts = ts(keep); x = x(keep); v = v(keep); a = a(keep);
xL = interp1(ts, x, tPre);                % posición en stage = línea de salida
xr = x - xL;
tRo = cruce_sim(ts, xr, ro);
verdad.t = ts; verdad.v = v; verdad.t_arranque = tPre;
verdad.t_hitos = nan(1, numel(D)); verdad.t_hitos_sin_ro = nan(1, numel(D));
for j = 1:numel(D)
    tc = cruce_sim(ts, xr, D(j));
    verdad.t_hitos(j) = tc - tRo;
    verdad.t_hitos_sin_ro(j) = tc - tPre;
end

% GPS: muestreo con fase aleatoria, ruido de velocidad y de posición
tg = (1 + rand/gps_hz : 1/gps_hz : T).';
vt = interp1(ts, v, tg - lag_gps);
vg = max(vt + 0.12*randn(size(tg)), 0);
vg(vt < 0.05) = 0.15*abs(randn(nnz(vt < 0.05), 1));   % ruido del GPS detenido
rumbo = 2*pi*rand; xg = interp1(ts, x, tg);
N_ = xg*cos(rumbo) + 1.5*randn(size(tg));
E_ = xg*sin(rumbo) + 1.5*randn(size(tg));
lat0 = 28.6; lon0 = -106.1;
gps = struct('t', tg, 'v', vg, 'hacc', 4*ones(size(tg)), ...
    'lat', lat0 + N_/111320, 'lon', lon0 + E_/(111320*cosd(lat0)));

% Acelerómetro: 100 Hz, auto -> marco del teléfono (ángulo aleatorio)
ta = sort((0:0.01:T).' + 0.002*randn(numel(0:0.01:T), 1));
aL = interp1(ts, a, ta, 'linear', 0);
th = pitch * aL;                          % el auto se "sienta" al acelerar
g = 9.80665;
fAuto = [aL - g*sin(th) + pend*(ta >= tPre), 0.15*randn(size(ta)), g*cos(th)];
ang = (rand(1, 3) - 0.5) .* [2*pi, pi/2, pi/2];
Rm = rot_z(ang(1)) * rot_y(ang(2)) * rot_x(ang(3));
fTel = fAuto * Rm.';
fTel = fTel + 0.15*randn(1, 3) + cumsum(0.01*sqrt(0.01)*randn(size(fTel)), 1) + 0.25*randn(size(fTel)) ...
     + 0.3*sin(2*pi*31*ta + 2*pi*rand) * rand(1, 3);
enBurnout = ta >= tB0 & ta <= tB1;          % el burnout sacude mucho el auto
fTel(enBurnout, :) = fTel(enBurnout, :) + 1.5*randn(nnz(enBurnout), 3);
enStage = ta >= tStg0 & ta < tPre;          % motor revolucionado en stage
fTel(enStage, :) = fTel(enStage, :) + 0.6*randn(nnz(enStage), 3);
accd = struct('t', ta, 'a', fTel);
end

function tv = metodo_v1(gps, D)
% Emula la v1 en su mejor caso: arranca al primer GPS > 1 m/s y cada hito es
% la primera lectura GPS cuya distancia en línea recta supera el objetivo.
tv = nan(1, numel(D));
i0 = find(gps.v > 1, 1);
if isempty(i0), return, end
for j = 1:numel(D)
    for i = i0:numel(gps.t)
        if haversine_sim(gps.lat(i0), gps.lon(i0), gps.lat(i), gps.lon(i)) >= D(j)
            tv(j) = gps.t(i) - gps.t(i0); break
        end
    end
end
end

function tc = cruce_sim(t, y, Y)
k = find(y >= Y, 1);
if isempty(k), tc = NaN; return, end
if k == 1, tc = t(1); return, end
tc = t(k-1) + (Y - y(k-1)) / (y(k) - y(k-1)) * (t(k) - t(k-1));
end

function d = haversine_sim(lat1, lon1, lat2, lon2)
p1 = deg2rad(lat1); p2 = deg2rad(lat2);
a = sin((p2 - p1)/2)^2 + cos(p1)*cos(p2)*sin(deg2rad(lon2 - lon1)/2)^2;
d = 2*6371000*atan2(sqrt(a), sqrt(1 - a));
end

function M = rot_x(q), M = [1 0 0; 0 cos(q) -sin(q); 0 sin(q) cos(q)]; end
function M = rot_y(q), M = [cos(q) 0 sin(q); 0 1 0; -sin(q) 0 cos(q)]; end
function M = rot_z(q), M = [cos(q) -sin(q) 0; sin(q) cos(q) 0; 0 0 1]; end
