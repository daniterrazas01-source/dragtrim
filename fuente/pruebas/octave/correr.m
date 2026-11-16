% Corre drag_procesar.m (copia en ./m) con las sesiones que dejó gen.js y escribe oct.txt
addpath([pwd '/m']);
fid = fopen('casos.txt'); casos = textscan(fid, '%s'); fclose(fid); casos = casos{1};
fo = fopen('oct.txt', 'w');
modos = {'nodos', 'modelo'};
for i = 1:numel(casos)
  nom = casos{i};
  G = dlmread([nom '_gps.csv']); A = dlmread([nom '_acc.csv']);
  gps = struct('t', G(:,1), 'v', G(:,2), 'hacc', G(:,3), 'lat', G(:,4), 'lon', G(:,5));
  accd = struct('t', A(:,1), 'a', A(:,2:4));
  for k = 1:2
    cfg = drag_config(); cfg.fusion = modos{k};
    R = drag_procesar(gps, accd, cfg);
    fprintf(fo, '%s %s %.9f %.9f %.4f %d %s %.6f\n', nom, modos{k}, R.t0, R.tRo, ...
      R.calidad.latencia_gps_s, R.calidad.gps_descartadas, sprintf('%.9f ', [R.hitos.t]), R.trampa_kmh);
  end
end
fclose(fo);
