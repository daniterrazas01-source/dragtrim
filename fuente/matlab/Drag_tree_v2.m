%% Drag_tree_v2.m
% Medidor de 1/8 y 1/4 de milla para MATLAB Mobile - versión 2
%
% Archivos necesarios en la misma carpeta de MATLAB Drive:
%   drag_config.m, drag_procesar.m, drag_reporte.m
%
% Cambios principales respecto a la v1:
%  - Usa las marcas de tiempo reales de los sensores (no el reloj del bucle).
%  - Distancia = integral de la velocidad (GPS + acelerómetro), no posición GPS.
%  - Cada hito se interpola al instante exacto en que se cruzó.
%  - Rollout de 1 ft como en pista (configurable en drag_config.m).
%  - G longitudinales reales (sin la gravedad).
%  - Guarda los datos crudos: puedes recalcular con drag_reprocesar.m.
%  - v2.1: ignora burnout, alineación y stage; solo cuenta el arranque real.
%  - v2.2: ventana de confirmación de 8 s (autos más lentos); avisos de uso.
%  - v2.3: instante de arranque más preciso y fusión GPS robusta.
%
% El programa NO da la salida: solo mide. Arranca con el semáforo de la pista;
% el arranque se detecta solo.
%
% IMPORTANTE: MATLAB Mobile debe quedar abierto y con la pantalla encendida
% toda la sesión. Tablets solo-WiFi no tienen GPS (no sirven para medir).

clc; clear;
cfg = drag_config();

%% --- Sensores ---
m = mobiledev;
m.PositionSensorEnabled     = 1;
m.AccelerationSensorEnabled = 1;
try
    m.SampleRate = cfg.acc_hz;
catch
    warning('No se pudo fijar la frecuencia del acelerómetro.');
end

disp('===========================================');
disp(['     DRAG TRIM - MEDIDOR ' cfg.version ' (Mobile)']);
disp('===========================================');
disp('Coloca el teléfono en un soporte FIJO dentro del vehículo.');
disp('No importa la orientación, pero no lo muevas durante la sesión.');
disp('Puedes iniciar antes del burnout: solo cuenta el arranque real.');
disp('Deja MATLAB abierto y la pantalla encendida hasta el final.');
disp(' ');

%% --- Selección de carrera (1/8 o 1/4) ---
while true
    tipo = strtrim(input('¿Medir 1/4 o 1/8 de milla? (4/8): ', 's'));
    if strcmp(tipo, '4')
        cfg.distancia_final = 402.336; disp('Seleccionado: 1/4 de milla.'); break
    elseif strcmp(tipo, '8')
        cfg.distancia_final = 201.168; disp('Seleccionado: 1/8 de milla.'); break
    end
    disp('Entrada no válida. Escribe 4 o 8.');
end
disp(' ');

%% --- Iniciar registro limpio ---
try
    m.Logging = 0; pause(0.2);
    discardlogs(m);
catch
end
m.Logging = 1;

%% --- 1) Esperar señal GPS ---
disp('Esperando señal GPS...');
tEsp = tic; ultMsg = -10;
while true
    [~, ~, tp, ~, ~, ~, ha] = poslog(m);
    if ~isempty(tp) && ha(end) <= cfg.hacc_max
        fprintf('GPS listo (precisión %.0f m).\n\n', ha(end)); break
    end
    if toc(tEsp) - ultMsg >= 3
        if isempty(ha), disp('  sin señal todavía...');
        else, fprintf('  precisión actual: %.0f m\n', ha(end)); end
        ultMsg = toc(tEsp);
    end
    if toc(tEsp) > 120
        warning('El GPS no llegó a la precisión deseada. Se continúa de todos modos.'); break
    end
    pause(0.5);
end

%% --- 2) Esperar el arranque real y seguir la corrida ---
% (Solo es el seguimiento en vivo; el cálculo oficial se hace al final con
%  todos los datos y las mismas reglas.)
disp('>>> MIDIENDO: esperando tu arranque. <<<');
disp('(No da la salida: arranca con el semáforo de la pista.)');
fprintf('Arranque válido: desde detenido hasta %.0f km/h en menos de %.0f s.\n', ...
    cfg.v_confirma*3.6, cfg.t_confirma);
disp('Burnout, alineación y stage se ignoran.');
disp(' ');

fase = 'espera';
tPrev = NaN; vPrev = 0;
tBajo = NaN; dSeg = 0; vMaxSeg = 0;   % movimiento actual desde la última vez casi detenido
dVivo = 0; tQuieto = 0;
tSesion = tic; tArr = NaN;
while true
    [~, ~, tp, sp] = poslog(m);
    if ~isempty(tp) && (isnan(tPrev) || tp(end) > tPrev)   % solo lecturas nuevas
        tN = tp(end); vN = max(sp(end), 0);
        if isnan(tPrev), dtg = 0; else, dtg = tN - tPrev; end
        paso = (vN + vPrev)/2 * dtg;

        switch fase
            case 'espera'
                if vN <= cfg.v_baja
                    if vMaxSeg >= cfg.v_corrida
                        fprintf('  Movimiento ignorado (máx %.0f km/h, %.0f m): no fue arranque.\n', ...
                            vMaxSeg*3.6, dSeg);
                    end
                    tBajo = tN; dSeg = 0; vMaxSeg = 0;
                elseif ~isnan(tBajo)
                    dSeg = dSeg + paso; vMaxSeg = max(vMaxSeg, vN);
                    if vN >= cfg.v_confirma && tN - tBajo <= cfg.t_confirma
                        fase = 'corrida'; dVivo = dSeg; tArr = toc(tSesion);
                        fprintf('Arranque detectado (%.0f km/h a los %.1f s). Midiendo...\n', vN*3.6, tN - tBajo);
                    end
                end
            case 'corrida'
                dVivo = dVivo + paso;
                fprintf('  %5.0f m  %5.1f km/h\n', dVivo, vN*3.6);
                if dVivo >= cfg.distancia_final + cfg.margen_final_m
                    disp('Meta superada.'); pause(1.0); break
                end
                if vN <= cfg.v_quieto
                    tQuieto = tQuieto + dtg;
                else
                    tQuieto = 0;
                end
                if tQuieto >= cfg.t_parada_s
                    fprintf('Vehículo detenido por %.0f s: fin.\n', cfg.t_parada_s); break
                end
        end
        tPrev = tN; vPrev = vN;
    end
    if strcmp(fase, 'espera') && toc(tSesion) > cfg.t_max_espera
        disp('No se detectó arranque. Fin.'); break
    end
    if strcmp(fase, 'corrida') && toc(tSesion) - tArr > cfg.t_max_corrida
        disp('Tiempo máximo de corrida alcanzado.'); break
    end
    pause(0.1);
end

%% --- 3) Leer logs completos ---
m.Logging = 0;
[lat, lon, tp, sp, ~, ~, ha] = poslog(m);
[a, ta] = accellog(m);
if isempty(a), a = zeros(0, 3); ta = zeros(0, 1); end

%% --- 4) Guardar datos crudos (para reprocesar después) ---
sello = char(datetime('now', 'Format', 'yyyyMMdd_HHmmss'));
writetable(table(tp(:), lat(:), lon(:), sp(:), ha(:), ...
    'VariableNames', {'t_s', 'lat', 'lon', 'v_mps', 'hacc_m'}), ...
    ['drag_raw_gps_' sello '.csv']);
writetable(table(ta(:), a(:,1), a(:,2), a(:,3), ...
    'VariableNames', {'t_s', 'ax', 'ay', 'az'}), ...
    ['drag_raw_acc_' sello '.csv']);
meta = struct('version', cfg.version, 'distancia_final', cfg.distancia_final, ...
    't_inicio_busqueda', cfg.t_inicio_busqueda, 'rollout_ft', cfg.rollout_ft);
fid = fopen(['drag_raw_meta_' sello '.json'], 'w');
if fid > 0, fprintf(fid, '%s', jsonencode(meta)); fclose(fid); end
fprintf('\n》 Datos crudos guardados (sello %s)\n', sello);

%% --- 5) Procesar y mostrar ---
gps  = struct('t', tp, 'v', sp, 'hacc', ha, 'lat', lat, 'lon', lon);
accd = struct('t', ta, 'a', a);
R = drag_procesar(gps, accd, cfg);
drag_reporte(R, true);
if ~R.ok, return, end

%% --- 6) CSV procesado ---
T = table(R.t - R.tRo, R.d, R.v*3.6, R.a, R.a/9.80665, ...
    'VariableNames', {'Tiempo_s', 'Distancia_m', 'Velocidad_kmh', 'AccLong_mps2', 'G_long'});
writetable(T, ['drag_trim_result_' sello '.csv']);
fprintf('》 Resultado guardado en drag_trim_result_%s.csv\n', sello);

%% --- 7) Paquete DRAGPACK (Base64) ---
res = R.res;
f = fieldnames(res);
for k = 1:numel(f)                      % compatibilidad v1: NaN -> 0
    if isnumeric(res.(f{k})) && isscalar(res.(f{k})) && isnan(res.(f{k}))
        res.(f{k}) = 0;
    end
end
paso = max(1, round(cfg.fs/10));        % serie a 10 Hz para que el paquete sea ligero
i10 = 1:paso:numel(R.t);
payload.tipo = "drag_trim";
payload.version = cfg.version;
payload.fecha = char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm:ss'));
payload.completo = R.completo;
payload.resultados = res;
payload.estadisticas = struct('tiempo_total', R.est.tiempo_total, ...
    'distancia_total', R.est.distancia_total, 'v_max', R.est.v_max_kmh, ...
    'a_max', R.est.a_max_g*9.80665, 'a_prom', R.est.a_prom_g*9.80665, 'g_max', R.est.a_max_g);
payload.calidad = struct('metodo', R.calidad.metodo, 'gps_hz', R.calidad.gps_hz, ...
    'hacc_m', R.calidad.hacc_mediana_m);
payload.registro = struct('t', R.t(i10) - R.tRo, 'd', R.d(i10), 'v', R.v(i10)*3.6, ...
    'acc_long', R.a(i10));

b64 = matlab.net.base64encode(uint8(jsonencode(payload)));
packfile = ['DRAGPACK_dragtrim_' sello '.txt'];
fid = fopen(packfile, 'w');
if fid > 0
    fprintf(fid, 'DRAGPACK|%s|END', b64); fclose(fid);
    fprintf('》 Paquete guardado en %s\n', packfile);
end
disp(' ');
disp('Script finalizado.');
