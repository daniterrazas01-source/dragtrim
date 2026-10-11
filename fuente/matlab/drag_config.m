function cfg = drag_config()
%DRAG_CONFIG  Parámetros del medidor de arrancones. Cambia aquí para experimentar.
%   Después de cambiar algo puedes recalcular una corrida guardada con
%   drag_reprocesar.m sin volver a salir a la pista.

cfg.version = 'v2.3';

% --- Cronometraje ---
cfg.rollout_ft      = 1.0;      % 1 ft = estándar de pista (NHRA). 0 = sin rollout
cfg.distancia_final = 402.336;  % se ajusta al elegir 1/4 o 1/8
cfg.hitos = { ...               % nombre, distancia en metros (estándar de pista)
    '60 ft',            18.288; ...
    '330 ft (101 m)',  100.584; ...
    '1/8 mi (201 m)',  201.168; ...
    '1000 ft (305 m)', 304.800; ...
    '1/4 mi (402 m)',  402.336};
cfg.dist_trampa_m   = 20.1168;  % 66 ft antes de la meta: zona de velocidad de trampa

% --- Detección del arranque real ---
% Un arranque cuenta solo si, saliendo de (casi) detenido, el auto llega a
% v_confirma en menos de t_confirma SIN volver a detenerse. Así se ignoran
% el burnout, la salida del burnout, la alineación y la entrada a stage.
cfg.v_baja      = 1.0;      % m/s: "casi detenido" (~3.6 km/h, velocidad de stage)
cfg.v_confirma  = 50/3.6;   % m/s: velocidad que confirma un arranque (50 km/h)
cfg.t_confirma  = 8.0;      % s: tiempo máximo desde casi detenido hasta v_confirma
cfg.v_corrida   = 3.0;   % m/s: referencia interna para ubicar el arranque (~11 km/h)
cfg.v_quieto    = 0.5;   % m/s: se considera detenido (~1.8 km/h)
cfg.umbral_mov  = 0.35;  % m/s^2: aceleración que marca el inicio del movimiento
cfg.t_inicio_busqueda = -Inf;  % s (tiempo del log): ignorar datos anteriores

% --- Fusión GPS + acelerómetro ---
cfg.usar_acc       = true;  % false = solo GPS (para comparar)
cfg.fs             = 100;   % Hz de la rejilla de procesamiento
cfg.suavizado_s    = 0.10;  % s de promedio móvil del acelerómetro
cfg.ventana_fwd_s  = 1.5;   % s tras el arranque para hallar el eje "hacia adelante"
cfg.latencia_gps_s = NaN;   % s de retraso de la velocidad GPS. NaN = estimar automáticamente
cfg.latencia_max_s = 1.0;   % s: retraso máximo a buscar
cfg.fusion         = 'modelo'; % 'modelo' (suave, robusto) o 'puntos' (pasa por cada lectura GPS)
cfg.peso_residuo   = 0.5;   % en 'modelo': cuánto del residuo de cada lectura GPS se agrega

% --- Punto inicial (instante de arranque) ---
cfg.refinar_inicio    = true;  % afinar con la recta del frente de subida
cfg.reposo_s          = 0.7;   % s de reposo en stage para medir la gravedad
cfg.pre_integracion_s = 0.2;   % s antes del arranque desde donde se integra

% --- Captura en MATLAB Mobile ---
cfg.acc_hz         = 100;   % Hz pedidos al acelerómetro
cfg.hacc_max       = 15;    % m: precisión GPS mínima para empezar
cfg.t_parada_s     = 5;     % s detenido para terminar
cfg.margen_final_m = 15;    % m extra tras la meta antes de cortar
cfg.t_max_corrida  = 60;    % s máximo de corrida
cfg.t_max_espera   = 900;   % s máximo esperando el arranque (15 min)
end
