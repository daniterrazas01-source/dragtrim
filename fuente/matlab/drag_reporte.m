function drag_reporte(R, graficar)
%DRAG_REPORTE  Imprime los resultados de drag_procesar y (opcional) dibuja 6 gráficas.
if nargin < 2, graficar = true; end
if ~R.ok
    fprintf('\nNo se pudo calcular la corrida: %s\n', R.mensaje);
    return
end
cfg = R.cfg; c = R.calidad;

fprintf('\n============ RESULTADOS (%s) ============\n', cfg.version);
fprintf('Rollout: %.1f ft  |  Método: %s\n\n', cfg.rollout_ft, c.metodo);
fprintf('%-17s %9s %11s\n', 'Hito', 'Tiempo', 'Velocidad');
for k = 1:numel(R.hitos)
    h = R.hitos(k);
    if h.dist_m > cfg.distancia_final + 0.01, continue, end
    if isfinite(h.t)
        fprintf('%-17s %7.3f s %6.1f km/h\n', h.nombre, h.t, h.v_kmh);
    else
        fprintf('%-17s %9s\n', h.nombre, '--');
    end
end
fprintf('\n');
imprimir_t('0-100 km/h', R.t_0_100);
imprimir_t('0-60 mph', R.t_0_60mph);
if isfinite(R.trampa_kmh)
    fprintf('%-17s %7.1f km/h (últimos 66 ft)\n', 'Vel. de trampa', R.trampa_kmh);
end
fprintf('%-17s %7.1f km/h\n', 'Vel. máxima', R.est.v_max_kmh);
fprintf('%-17s %7.2f g\n',   'Acel. máx.', R.est.a_max_g);
fprintf('%-17s %7.2f g\n',   'Acel. promedio', R.est.a_prom_g);
if ~R.completo
    fprintf('\nCorrida incompleta: se recorrieron %.0f m de %.0f m.\n', ...
        R.est.distancia_total, cfg.distancia_final);
end

fprintf('\n--- Calidad de datos ---\n');
if cfg.rollout_ft > 0
    fprintf('Del primer movimiento al rollout (%.1f ft): %.3f s\n', cfg.rollout_ft, R.tRo - R.t0);
end
if c.mov_ignorados > 0
    fprintf('Movimientos ignorados antes del arranque: %d (máx %.0f km/h)\n', ...
        c.mov_ignorados, c.v_max_ignorado_kmh);
end
fprintf('GPS: %.1f Hz, %d puntos en la corrida, precisión %.1f m, retraso %.2f s\n', ...
    c.gps_hz, c.n_gps_corrida, c.hacc_mediana_m, c.latencia_gps_s);
if isfinite(c.acc_hz)
    fprintf('Acelerómetro: %.0f Hz, ruido en reposo %.2f m/s^2, gravedad %.2f m/s^2\n', ...
        c.acc_hz, c.ruido_reposo, c.g_medida);
end
if isfinite(c.dist_pos_m)
    fprintf('Distancia a la meta: integrada %.1f m vs posición GPS %.1f m\n', ...
        c.dist_integrada_m, c.dist_pos_m);
end
for k = 1:numel(R.avisos)
    fprintf('AVISO: %s\n', R.avisos{k});
end

if ~graficar, return, end

%% --- 6 gráficas ---
x  = R.t - R.tRo;                 % 0 = inicio del cronómetro (tras el rollout)
xg = R.gps.t - R.tRo;
okH = isfinite([R.hitos.t]);
lim = [min(x) max(x)];

figure('Name', 'Velocidad vs Tiempo');
plot(x, R.v*3.6, 'LineWidth', 1.6); hold on
plot(xg, R.gps.v*3.6, 'o', 'MarkerSize', 5); hold off
xlim(lim); grid on
xlabel('Tiempo [s]'); ylabel('Velocidad [km/h]'); title('Velocidad vs Tiempo');
legend('Calculada', 'GPS crudo', 'Location', 'southeast');

figure('Name', 'Distancia vs Tiempo');
plot(x, R.d, 'LineWidth', 1.6); hold on
plot([R.hitos(okH).t], [R.hitos(okH).dist_m], 'o', 'MarkerSize', 7, 'LineWidth', 1.4); hold off
grid on; xlabel('Tiempo [s]'); ylabel('Distancia [m]'); title('Distancia vs Tiempo (con hitos)');

figure('Name', 'Fuerza G vs Tiempo');
plot(x, R.a/9.80665, 'LineWidth', 1.4);
grid on; xlabel('Tiempo [s]'); ylabel('g longitudinal'); title('Fuerza G vs Tiempo');

figure('Name', 'Aceleración vs Distancia');
plot(R.d, R.a, 'LineWidth', 1.4);
grid on; xlabel('Distancia [m]'); ylabel('Aceleración [m/s^2]'); title('Aceleración vs Distancia');

figure('Name', 'Velocidad vs Distancia');
plot(R.d, R.v*3.6, 'LineWidth', 1.6);
grid on; xlabel('Distancia [m]'); ylabel('Velocidad [km/h]'); title('Velocidad vs Distancia');

i60 = R.d <= 18.288 * 1.2;
figure('Name', '60 ft');
plot(x(i60), R.d(i60), 'LineWidth', 1.6); hold on
plot(x(i60), 18.288*ones(nnz(i60), 1), '--'); hold off
grid on; xlabel('Tiempo [s]'); ylabel('Distancia [m]'); title('60 ft - Distancia vs Tiempo');
end

function imprimir_t(nombre, t)
if isfinite(t)
    fprintf('%-17s %7.3f s\n', nombre, t);
else
    fprintf('%-17s %9s\n', nombre, '--');
end
end
