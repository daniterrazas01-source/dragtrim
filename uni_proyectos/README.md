# Proyectos de la universidad

No forman parte de la app Drag Trim.

## `calculadora_numerica.m` — calculadora de métodos numéricos (MATLAB Mobile)

Abrir el archivo en MATLAB (o MATLAB Mobile) y ejecutarlo completo. Muestra un menú con:

1. Eliminación gaussiana · 2. Gauss-Jordan · 3. Estrategias de pivoteo (sin, parcial, escalado,
completo) · 4. Descomposición LU · 5. Gauss-Seidel · 6. GMRES (Krylov) · 7. Eigenvalores y
eigenvectores · 8. Diferencias finitas · 9. Mínimos cuadrados (lineal o cuadrático) ·
10. Interpolación de Newton (diferencias divididas)

No requiere Symbolic Math Toolbox. Las matrices se escriben con corchetes, por ejemplo
`[4 -1 0; -1 4 -1; 0 -1 4]`, y las funciones como `@(x) x.^2`.

### Revisión (12 oct 2026)

Probada en Octave 8.4 contra `A\b`, `polyfit`, `eig` y soluciones exactas: los 10 métodos dan
resultados correctos (errores ~1e-14). Cambios respecto a la versión original:

- Los sistemas 1×1 ya no truenan en Gauss, pivoteo, LU y Gauss-Seidel.
- Si Gauss-Seidel o GMRES no convergen, el resultado se titula "ULTIMA APROXIMACION (NO CONVERGIO)"
  en lugar de "SOLUCION FINAL".
- Tabla de diferencias divididas: la columna de orden 0 se llama `f_x` (antes `Pn_x`).
- Multiplicadores de Gauss como `m(i,k)` (antes `mik`, ambiguo con 10 o más ecuaciones).
- Aviso cuando la matriz no es diagonalizable (opción 7) y ejemplo de cómo escribir la matriz.
