%% drag_reprocesar.m
% Recalcula una corrida guardada usando los parámetros actuales de drag_config.m.
% Sirve para experimentar: cambia rollout, umbrales, usar_acc, etc. y vuelve
% a correr este script sin salir otra vez a la pista.

clc; clear;
archivo = '';   % vacío = corrida más reciente. Ej: 'drag_raw_gps_20261009_153000.csv'

cfg = drag_config();
if isempty(archivo)
    L = dir('drag_raw_gps_*.csv');
    if isempty(L), error('No hay corridas guardadas (drag_raw_gps_*.csv).'); end
    [~, i] = max([L.datenum]);
    archivo = L(i).name;
end
sello = strrep(strrep(archivo, 'drag_raw_gps_', ''), '.csv', '');
fprintf('Reprocesando corrida %s\n', sello);

G = readtable(archivo);
gps = struct('t', G.t_s, 'v', G.v_mps, 'hacc', G.hacc_m, 'lat', G.lat, 'lon', G.lon);

accd = [];
fa = ['drag_raw_acc_' sello '.csv'];
if isfile(fa)
    A = readtable(fa);
    accd = struct('t', A.t_s, 'a', [A.ax A.ay A.az]);
end

fm = ['drag_raw_meta_' sello '.json'];
if isfile(fm)
    meta = jsondecode(fileread(fm));
    cfg.distancia_final = meta.distancia_final;
    if ~isempty(meta.t_inicio_busqueda)
        cfg.t_inicio_busqueda = meta.t_inicio_busqueda;
    end
end

R = drag_procesar(gps, accd, cfg);
drag_reporte(R, true);
