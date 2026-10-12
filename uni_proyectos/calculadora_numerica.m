%% CALCULADORA DE METODOS NUMERICOS
% Archivo: calculadora_numerica.m
% Ejecutar todo el archivo.
% No requiere Symbolic Math Toolbox.

clear;
clc;
format long g;

while true
    fprintf('\n================================================\n');
    fprintf(' CALCULADORA DE METODOS NUMERICOS\n');
    fprintf('================================================\n');
    fprintf('1. Eliminacion Gaussiana\n');
    fprintf('2. Gauss-Jordan\n');
    fprintf('3. Estrategias de pivoteo\n');
    fprintf('4. Descomposicion LU\n');
    fprintf('5. Gauss-Seidel\n');
    fprintf('6. Krylov: GMRES sin reinicio\n');
    fprintf('7. Eigenvalores y eigenvectores\n');
    fprintf('8. Diferencias finitas\n');
    fprintf('9. Minimos cuadrados: lineal o cuadratico\n');
    fprintf('10. Interpolacion: diferencias divididas\n');
    fprintf('0. Salir\n');

    try
        op = input('Seleccione una opcion: ');
        validarEntero(op,0,10);

        if op == 0
            fprintf('Calculadora finalizada.\n');
            break;
        end

        switch op
            case {1,2,3,4,5,6}
                [A,b] = leerSistema();
                convergio = true;

                switch op
                    case 1
                        fprintf('\nGAUSS CON PIVOTEO PARCIAL\n');
                        x = gauss(A,b,1);

                    case 2
                        x = jordan(A,b);

                    case 3
                        fprintf('\nESTRATEGIAS DE PIVOTEO\n');
                        fprintf('0. Sin pivoteo\n');
                        fprintf('1. Parcial\n');
                        fprintf('2. Parcial escalado\n');
                        fprintf('3. Completo\n');

                        tipo = input('Estrategia: ');
                        validarEntero(tipo,0,3);
                        x = gauss(A,b,tipo);

                    case 4
                        x = metodoLU(A,b);

                    case 5
                        [x,convergio] = seidel(A,b);

                    case 6
                        [x,convergio] = krylov(A,b);
                end

                mostrarResultado(A,b,x,convergio);

            case 7
                eigenMetodo();

            case 8
                diferenciasFinitas();

            case 9
                minimosCuadrados();

            case 10
                diferenciasDivididas();
        end

    catch ME
        fprintf('\nERROR: %s\n',ME.message);
    end
end

%% VALIDACIONES

function validarEntero(v,a,b)
    if ~isnumeric(v) || ~isscalar(v) || ~isreal(v) || ...
            ~isfinite(v) || v~=fix(v) || v<a || v>b
        error('Ingrese un entero entre %g y %g.',a,b);
    end
end

function validarPositivo(v)
    validarEscalar(v);

    if v<=0
        error('Ingrese un numero positivo.');
    end
end

function validarEscalar(v)
    if ~isnumeric(v) || ~isscalar(v) || ...
            ~isreal(v) || ~isfinite(v)
        error('Ingrese un escalar real finito.');
    end
end

function validarMatriz(A)
    if ~isnumeric(A) || isempty(A) || ~ismatrix(A) || ...
            size(A,1)~=size(A,2) || ~isreal(A) || ...
            any(~isfinite(A(:)))
        error('A debe ser una matriz cuadrada real y finita.');
    end
end

function validarPuntos(xp)
    if ~isnumeric(xp) || ~isreal(xp) || ...
            any(~isfinite(xp(:))) || ...
            (~isempty(xp) && ~isvector(xp))
        error('Ingrese un vector real finito, o [].');
    end
end

%% CAPTURA DE DATOS

function [A,b] = leerSistema()
    fprintf('\nIngrese matrices usando corchetes.\n');
    fprintf('Ejemplo A: [4 -1 0; -1 4 -1; 0 -1 4]\n');
    fprintf('Ejemplo b: [15 10 10]\n');

    A = input('Matriz A: ');
    b = input('Vector b: ');

    validarMatriz(A);

    if ~isnumeric(b) || ~isvector(b) || ~isreal(b) || ...
            any(~isfinite(b(:))) || numel(b)~=size(A,1)
        error('b debe ser un vector real del tamano del sistema.');
    end

    A = double(A);
    b = double(b(:));

    fprintf('\nSISTEMA INGRESADO [A | b]\n');
    disp([A b]);
end

function [x,y] = leerDatos()
    fprintf('\nIngrese los datos en forma de vector.\n');
    fprintf('Ejemplo x: [1 2 3]\n');
    fprintf('Ejemplo y: [2 5 10]\n');

    x = input('Vector x: ');
    y = input('Vector y: ');

    if ~isnumeric(x) || ~isnumeric(y) || ...
            ~isvector(x) || ~isvector(y) || ...
            isempty(x) || isempty(y) || ...
            ~isreal(x) || ~isreal(y) || ...
            any(~isfinite(x(:))) || any(~isfinite(y(:))) || ...
            numel(x)~=numel(y)
        error('Ingrese vectores reales finitos de igual longitud.');
    end

    x = double(x(:));
    y = double(y(:));

    fprintf('Numero de datos: n = %d\n',numel(x));
end

function x0 = leerInicial(n)
    x0 = input('Vector inicial, o [] para usar ceros: ');

    if isempty(x0)
        x0 = zeros(n,1);
    end

    if ~isnumeric(x0) || ~isvector(x0) || ~isreal(x0) || ...
            numel(x0)~=n || any(~isfinite(x0(:)))
        error('Vector inicial invalido.');
    end

    x0 = double(x0(:));
end

function mostrarResultado(A,b,x,convergio)
    if convergio
        fprintf('\nSOLUCION FINAL\n');
    else
        fprintf('\nULTIMA APROXIMACION (NO CONVERGIO)\n');
    end

    for i = 1:numel(x)
        fprintf('x%d = %.12g\n',i,x(i));
    end

    fprintf('\nVERIFICACION\n');
    disp(table(b,A*x,b-A*x, ...
        'VariableNames',{'b','Ax','residuo'}));

    fprintf('||A*x-b||_inf = %.6e\n',norm(A*x-b,Inf));
end

%% 1 Y 3: GAUSS Y ESTRATEGIAS DE PIVOTEO

function x = gauss(A,b,tipo)
    n = size(A,1);
    M = [A b];
    orden = 1:n;
    escalas = max(abs(A),[],2);
    umbral = eps*max(1,n)*norm(A,Inf);

    fprintf('\nMatriz aumentada inicial:\n');
    disp(M);

    for k = 1:n
        fprintf('\n========== ETAPA %d ==========\n',k);

        fila = k;
        columna = k;

        switch tipo
            case 0
                fprintf('Sin pivoteo: se usa M(%d,%d).\n',k,k);

            case 1
                fprintf('Candidatos de la columna %d:\n',k);

                disp(table((k:n)',abs(M(k:n,k)), ...
                    'VariableNames',{'fila','magnitud'}));

                [~,pos] = max(abs(M(k:n,k)));
                fila = k+pos-1;

            case 2
                cocientes = zeros(n-k+1,1);
                s = escalas(k:n);
                candidatos = abs(M(k:n,k));
                activos = s>0;

                cocientes(activos) = candidatos(activos)./s(activos);

                fprintf('Pivoteo escalado: |a_ik| / escala_i\n');

                disp(table((k:n)',s,cocientes, ...
                    'VariableNames',{'fila','escala','cociente'}));

                [~,pos] = max(cocientes);
                fila = k+pos-1;

            case 3
                fprintf('Magnitudes del bloque de candidatos:\n');
                bloque = abs(M(k:n,k:n));
                disp(bloque);

                [~,pos] = max(bloque(:));
                [f,c] = ind2sub(size(bloque),pos);

                fila = k+f-1;
                columna = k+c-1;
        end

        if abs(M(fila,columna))<=umbral
            error(['Pivote nulo o muy pequeno. ' ...
                'Sistema singular o estrategia inadecuada.']);
        end

        if fila~=k
            fprintf('Intercambio F%d <-> F%d\n',k,fila);
            M([k fila],:) = M([fila k],:);
            escalas([k fila]) = escalas([fila k]);
            disp(M);
        end

        if columna~=k
            fprintf('Intercambio C%d <-> C%d\n',k,columna);
            M(:,[k columna]) = M(:,[columna k]);
            orden([k columna]) = orden([columna k]);
            disp(M);
        end

        fprintf('Pivote = %.12g\n',M(k,k));

        for i = k+1:n
            factor = M(i,k)/M(k,k);

            fprintf('m(%d,%d) = %.12g / %.12g = %.12g\n', ...
                i,k,M(i,k),M(k,k),factor);

            fprintf('F%d <- F%d - (%.12g)*F%d\n', ...
                i,i,factor,k);

            M(i,k:end) = M(i,k:end)-factor*M(k,k:end);
            M(i,k) = 0;
            disp(M);
        end
    end

    fprintf('\nMATRIZ TRIANGULAR FINAL\n');
    disp(M);

    fprintf('\nSUSTITUCION REGRESIVA\n');
    z = zeros(n,1);

    for i = n:-1:1
        suma = M(i,i+1:n)*z(i+1:n,1);
        z(i) = (M(i,end)-suma)/M(i,i);

        fprintf('z%d = (%.12g-(%.12g))/%.12g = %.12g\n', ...
            i,M(i,end),suma,M(i,i),z(i));
    end

    x = zeros(n,1);
    x(orden) = z;

    if tipo==3
        fprintf('\nOrden de variables tras el pivoteo completo:\n');
        disp(orden);
        fprintf('Se restituye el orden original de x.\n');
    end
end

%% 2: GAUSS-JORDAN

function x = jordan(A,b)
    n = size(A,1);
    M = [A b];
    umbral = eps*max(1,n)*norm(A,Inf);

    fprintf('\nGAUSS-JORDAN CON PIVOTEO PARCIAL\n');
    fprintf('Matriz inicial:\n');
    disp(M);

    for k = 1:n
        fprintf('\n========== ETAPA %d ==========\n',k);

        fprintf('Candidatos al pivote:\n');
        disp(table((k:n)',abs(M(k:n,k)), ...
            'VariableNames',{'fila','magnitud'}));

        [~,pos] = max(abs(M(k:n,k)));
        fila = k+pos-1;

        if abs(M(fila,k))<=umbral
            error('Sistema singular o pivote muy pequeno.');
        end

        if fila~=k
            fprintf('Intercambio F%d <-> F%d\n',k,fila);
            M([k fila],:) = M([fila k],:);
            disp(M);
        end

        pivote = M(k,k);

        fprintf('F%d <- F%d / (%.12g)\n',k,k,pivote);
        M(k,:) = M(k,:)/pivote;
        disp(M);

        for i = 1:n
            if i~=k
                factor = M(i,k);

                fprintf('F%d <- F%d - (%.12g)*F%d\n', ...
                    i,i,factor,k);

                M(i,:) = M(i,:)-factor*M(k,:);
                M(i,k) = 0;
                disp(M);
            end
        end
    end

    fprintf('\nFORMA REDUCIDA [I | x]\n');
    disp(M);
    x = M(:,end);
end

%% 4: DESCOMPOSICION LU

function x = metodoLU(A,b)
    n = size(A,1);
    U = A;
    L = eye(n);
    P = eye(n);
    umbral = eps*max(1,n)*norm(A,Inf);

    fprintf('\nLU CON PIVOTEO PARCIAL\n');
    fprintf('Relacion: P*A = L*U\n');

    for k = 1:n
        fprintf('\n========== ETAPA %d ==========\n',k);

        [~,pos] = max(abs(U(k:n,k)));
        fila = k+pos-1;

        if abs(U(fila,k))<=umbral
            error('Sistema singular o pivote muy pequeno.');
        end

        if fila~=k
            fprintf('Intercambio F%d <-> F%d en U y P\n',k,fila);

            U([k fila],:) = U([fila k],:);
            P([k fila],:) = P([fila k],:);

            if k>1
                L([k fila],1:k-1) = L([fila k],1:k-1);
                fprintf('Se intercambian multiplicadores previos de L.\n');
            end
        end

        for i = k+1:n
            L(i,k) = U(i,k)/U(k,k);

            fprintf('L(%d,%d) = %.12g/%.12g = %.12g\n', ...
                i,k,U(i,k),U(k,k),L(i,k));

            fprintf('F%d <- F%d - (%.12g)*F%d en U\n', ...
                i,i,L(i,k),k);

            U(i,k:end) = U(i,k:end)-L(i,k)*U(k,k:end);
            U(i,k) = 0;
        end

        fprintf('L:\n'); disp(L);
        fprintf('U:\n'); disp(U);
        fprintf('P:\n'); disp(P);
    end

    fprintf('||P*A-L*U||_inf = %.6e\n',norm(P*A-L*U,Inf));

    pb = P*b;
    z = zeros(n,1);

    fprintf('\nSUSTITUCION PROGRESIVA: L*z=P*b\n');

    for i = 1:n
        suma = L(i,1:i-1)*z(1:i-1,1);
        z(i) = (pb(i)-suma)/L(i,i);

        fprintf('z%d = (%.12g-(%.12g))/%.12g = %.12g\n', ...
            i,pb(i),suma,L(i,i),z(i));
    end

    x = zeros(n,1);

    fprintf('\nSUSTITUCION REGRESIVA: U*x=z\n');

    for i = n:-1:1
        suma = U(i,i+1:n)*x(i+1:n,1);
        x(i) = (z(i)-suma)/U(i,i);

        fprintf('x%d = (%.12g-(%.12g))/%.12g = %.12g\n', ...
            i,z(i),suma,U(i,i),x(i));
    end
end

%% 5: GAUSS-SEIDEL

function [x,convergio] = seidel(A,b)
    n = size(A,1);
    umbral = eps*max(1,n)*norm(A,Inf);

    if any(abs(diag(A))<=umbral)
        error('Existe un elemento diagonal nulo o muy pequeno.');
    end

    x = leerInicial(n);

    tol = input('Tolerancia, por ejemplo 1e-8: ');
    maxit = input('Maximo de iteraciones: ');

    validarPositivo(tol);
    validarEntero(maxit,1,Inf);

    fprintf('\nGAUSS-SEIDEL\n');
    fprintf('x_i nuevo = (b_i - sumas)/a_ii\n');
    fprintf('Se usan inmediatamente los valores nuevos disponibles.\n');

    if ~all(abs(diag(A))>sum(abs(A),2)-abs(diag(A)))
        fprintf('Aviso: no hay dominancia diagonal estricta por filas.\n');
        fprintf('La convergencia no esta garantizada por este criterio.\n');
    end

    convergio = false;

    for k = 1:maxit
        anterior = x;

        fprintf('\n========== ITERACION %d ==========\n',k);

        for i = 1:n
            sumaNueva = A(i,1:i-1)*x(1:i-1,1);
            sumaVieja = A(i,i+1:n)*anterior(i+1:n,1);

            x(i) = (b(i)-sumaNueva-sumaVieja)/A(i,i);

            fprintf(['x%d = (%.12g-(%.12g)-(%.12g))' ...
                '/%.12g = %.12g\n'], ...
                i,b(i),sumaNueva,sumaVieja,A(i,i),x(i));
        end

        if any(~isfinite(x))
            error('La iteracion produjo valores no finitos.');
        end

        cambio = norm(x-anterior,Inf)/max(1,norm(x,Inf));
        residuo = norm(A*x-b,Inf)/max(1,norm(b,Inf));

        fprintf('Cambio relativo = %.6e\n',cambio);
        fprintf('Residuo escalado = %.6e\n',residuo);

        if cambio<=tol && residuo<=tol
            convergio = true;
            break;
        end
    end

    if convergio
        fprintf('Convergencia alcanzada en %d iteraciones.\n',k);
    else
        fprintf('No se alcanzo la tolerancia solicitada.\n');
    end
end

%% 6: KRYLOV MEDIANTE GMRES SIN REINICIO

function [x,convergio] = krylov(A,b)
    n = size(A,1);
    x0 = leerInicial(n);

    tol = input('Tolerancia, por ejemplo 1e-8: ');
    validarPositivo(tol);

    m = input(sprintf('Maximo de pasos, de 1 a %d: ',n));
    validarEntero(m,1,n);

    fprintf('\nGMRES SIN REINICIO\n');
    fprintf('K_m(A,r0)=span{r0,A*r0,...,A^(m-1)*r0}\n');

    r0 = b-A*x0;
    beta = norm(r0);
    escala = max(norm(b),1);
    x = x0;
    convergio = false;

    fprintf('r0=b-A*x0:\n'); disp(r0);
    fprintf('beta=||r0||_2 = %.12g\n',beta);
    fprintf('Criterio: ||b-A*x||_2 / max(||b||_2,1)\n');

    if beta/escala<=tol
        fprintf('El vector inicial cumple la tolerancia.\n');
        convergio = true;
        return;
    end

    V = zeros(n,m+1);
    H = zeros(m+1,m);

    V(:,1) = r0/beta;

    fprintf('v1=r0/beta:\n');
    disp(V(:,1));

    umbral = eps*max(1,n)*norm(A,2);

    for j = 1:m
        fprintf('\n========== ARNOLDI: PASO %d ==========\n',j);

        w = A*V(:,j);
        fprintf('w=A*v%d:\n',j);
        disp(w);

        for i = 1:j
            H(i,j) = V(:,i)'*w;

            fprintf('h(%d,%d)=v%d''*w = %.12g\n', ...
                i,j,i,H(i,j));

            w = w-H(i,j)*V(:,i);

            fprintf('w <- w-h(%d,%d)*v%d:\n',i,j,i);
            disp(w);
        end

        fprintf('Segunda pasada de ortogonalizacion:\n');

        for i = 1:j
            correccion = V(:,i)'*w;
            H(i,j) = H(i,j)+correccion;
            w = w-correccion*V(:,i);

            fprintf('Correccion de h(%d,%d) = %.6e\n', ...
                i,j,correccion);
        end

        H(j+1,j) = norm(w);
        ruptura = H(j+1,j)<=umbral;

        fprintf('h(%d,%d)=||w||_2 = %.12g\n', ...
            j+1,j,H(j+1,j));

        if ~ruptura
            V(:,j+1) = w/H(j+1,j);

            fprintf('Nuevo vector v%d:\n',j+1);
            disp(V(:,j+1));
        end

        Hj = H(1:j+1,1:j);
        g = zeros(j+1,1);
        g(1) = beta;

        fprintf('Matriz Hessenberg:\n');
        disp(Hj);

        fprintf('Resolver min ||beta*e1-H*y||_2\n');
        fprintf('beta*e1:\n');
        disp(g);

        y = pinv(Hj)*g;

        fprintf('Coeficientes y:\n');
        disp(y);

        x = x0+V(:,1:j)*y;
        residuo = norm(b-A*x)/escala;

        fprintf('x=x0+V*y:\n');
        disp(x);
        fprintf('Residuo escalado = %.6e\n',residuo);

        if residuo<=tol
            convergio = true;
            break;
        end

        if ruptura
            fprintf('No se puede ampliar el subespacio de Krylov.\n');
            break;
        end
    end

    if convergio
        fprintf('Convergencia alcanzada en %d pasos.\n',j);
    else
        fprintf('No se alcanzo la tolerancia solicitada.\n');
    end
end

%% 7: EIGENVALORES Y EIGENVECTORES

function eigenMetodo()
    fprintf('\nEjemplo A: [2 1; 1 2]\n');
    A = input('Matriz A: ');
    validarMatriz(A);

    A = double(A);
    n = size(A,1);

    fprintf('\nEIGENVALORES Y EIGENVECTORES\n');
    fprintf('Ecuacion caracteristica: det(lambda*I-A)=0\n');

    c = poly(A);

    fprintf('Coeficientes del polinomio caracteristico:\n');
    disp(c);
    imprimirPolinomio(c,'lambda');

    fprintf('\nLos pares propios se calculan con eig(A).\n');
    [V,D] = eig(A);

    fprintf('Matriz D de eigenvalores:\n');
    disp(D);

    fprintf('Matriz V: eigenvectores en columnas:\n');
    disp(V);

    if rank(V)<n
        fprintf('Aviso: la matriz no es diagonalizable.\n');
        fprintf('Hay eigenvectores repetidos (linealmente dependientes).\n');
    end

    for j = 1:n
        lambda = D(j,j);
        v = V(:,j);

        fprintf('\n========== PAR PROPIO %d ==========\n',j);

        fprintf('Eigenvalor:\n');
        disp(lambda);

        fprintf('Sistema homogeneo (A-lambda*I)*v=0:\n');
        disp(A-lambda*eye(n));

        fprintf('Eigenvector normalizado:\n');
        disp(v);

        fprintf('A*v:\n');
        disp(A*v);

        fprintf('lambda*v:\n');
        disp(lambda*v);

        fprintf('||A*v-lambda*v||_2 = %.6e\n', ...
            norm(A*v-lambda*v));
    end

    fprintf('\nSe muestra el planteamiento y la verificacion.\n');
    fprintf('No se muestran las iteraciones internas de eig.\n');
end

%% 8: DIFERENCIAS FINITAS

function diferenciasFinitas()
    fprintf('\nDIFERENCIAS FINITAS CENTRALES\n');
    fprintf('Ecuacion: y''''+p(x)*y''+q(x)*y=r(x)\n');
    fprintf('Condiciones: y(a)=alfa, y(b)=beta\n');
    fprintf('Ejemplo: p=@(x)0, q=@(x)0, r=@(x)-2\n');

    a = input('Extremo a: ');
    b = input('Extremo b: ');
    alfa = input('Valor y(a): ');
    beta = input('Valor y(b): ');

    validarEscalar(a);
    validarEscalar(b);
    validarEscalar(alfa);
    validarEscalar(beta);

    if b<=a
        error('Debe cumplirse b>a.');
    end

    N = input('Numero de subintervalos, minimo 2: ');
    validarEntero(N,2,Inf);

    p = input('p(x), usando @(x): ');
    q = input('q(x), usando @(x): ');
    r = input('r(x), usando @(x): ');

    if ~isa(p,'function_handle') || ~isa(q,'function_handle') || ...
            ~isa(r,'function_handle')
        error('Ingrese funciones anonimas usando @(x).');
    end

    h = (b-a)/N;
    nodos = linspace(a,b,N+1)';
    xi = nodos(2:end-1);
    m = N-1;

    pv = arrayfun(p,xi);
    qv = arrayfun(q,xi);
    rv = arrayfun(r,xi);

    if ~isreal(pv) || ~isreal(qv) || ~isreal(rv) || ...
            any(~isfinite([pv(:);qv(:);rv(:)]))
        error('Las funciones deben devolver escalares reales finitos.');
    end

    fprintf('\nh=(b-a)/N = %.12g\n',h);
    fprintf('y''''(x_i) ~= (y_(i-1)-2*y_i+y_(i+1))/h^2\n');
    fprintf('y''(x_i) ~= (y_(i+1)-y_(i-1))/(2*h)\n');

    fprintf('\nEcuacion discretizada multiplicada por h^2:\n');
    fprintf('L_i*y_(i-1)+D_i*y_i+U_i*y_(i+1)=B_i\n');
    fprintf('L_i=1-h*p_i/2\n');
    fprintf('D_i=-2+h^2*q_i\n');
    fprintf('U_i=1+h*p_i/2\n');
    fprintf('B_i=h^2*r_i\n');

    L = 1-h*pv/2;
    D = -2+h^2*qv;
    U = 1+h*pv/2;
    B = h^2*rv;

    fprintf('\nTABLA DE COEFICIENTES\n');

    disp(table((1:m)',xi,pv,qv,rv,L,D,U,B, ...
        'VariableNames',{'i','x','p','q','r','L','D','U','B'}));

    A = sparse(1:m,1:m,D,m,m);

    for i = 1:m-1
        A(i+1,i) = L(i+1);
        A(i,i+1) = U(i);
    end

    rhs = B;

    fprintf('\nCONDICIONES DE FRONTERA\n');

    fprintf('B1 <- B1-L1*alfa\n');
    fprintf('%.12g-(%.12g)*(%.12g)\n',rhs(1),L(1),alfa);
    rhs(1) = rhs(1)-L(1)*alfa;

    fprintf('Bfinal <- Bfinal-Ufinal*beta\n');
    fprintf('%.12g-(%.12g)*(%.12g)\n',rhs(end),U(end),beta);
    rhs(end) = rhs(end)-U(end)*beta;

    fprintf('\nSISTEMA DISCRETIZADO [A | B]\n');
    disp(full([A rhs]));

    fprintf('\nRESOLUCION POR GAUSS CON PIVOTEO PARCIAL\n');
    interior = gauss(full(A),rhs,1);

    y = [alfa;interior;beta];

    fprintf('\nSOLUCION EN LOS NODOS\n');
    disp(table(nodos,y, ...
        'VariableNames',{'x','y_aproximado'}));

    fprintf('Residuo del sistema = %.6e\n', ...
        norm(A*interior-rhs,Inf));

    figure;
    plot(nodos,y,'bo-','LineWidth',1.5);
    grid on;
    xlabel('x');
    ylabel('y aproximado');
    title('Diferencias finitas');
end

%% 9: MINIMOS CUADRADOS

function minimosCuadrados()
    fprintf('\nMINIMOS CUADRADOS\n');
    fprintf('1. Lineal: y=b0+b1*x\n');
    fprintf('2. Cuadratico: y=b0+b1*x+b2*x^2\n');

    grado = input('Tipo de ajuste: ');
    validarEntero(grado,1,2);

    [x,y] = leerDatos();
    n = numel(x);

    if numel(unique(x))<grado+1
        error('Se requieren al menos %d valores distintos de x.',grado+1);
    end

    X = ones(n,grado+1);

    for j = 1:grado
        X(:,j+1) = x.^j;
    end

    if any(~isfinite(X(:)))
        error('Los valores de x son demasiado grandes.');
    end

    if rank(X)<grado+1
        error('La matriz del ajuste es numericamente deficiente de rango.');
    end

    fprintf('\nFUNCION A MINIMIZAR\n');
    fprintf('S=suma(y_i-y_estimado_i)^2\n');
    fprintf('Igualando las derivadas a cero:\n');
    fprintf('(X''*X)*coef=X''*y\n');
    fprintf('Orden de coeficientes: [b0; b1; ...]\n');

    fprintf('\nSUMATORIAS\n');
    fprintf('n = %d\n',n);

    for k = 1:2*grado
        fprintf('Suma x^%d = %.12g\n',k,sum(x.^k));
    end

    for k = 0:grado
        fprintf('Suma x^%d*y = %.12g\n',k,sum(x.^k.*y));
    end

    G = X'*X;
    d = X'*y;

    fprintf('\nECUACIONES NORMALES [G | d]\n');
    disp([G d]);

    fprintf('\nDESARROLLO POR GAUSS DE LAS ECUACIONES NORMALES\n');

    try
        coefNormal = gauss(G,d,1);
        fprintf('Coeficientes por ecuaciones normales:\n');
        disp(coefNormal);
    catch ME
        fprintf('Aviso en ecuaciones normales: %s\n',ME.message);
    end

    fprintf('\nRESULTADO FINAL POR QR, PARA MAYOR ESTABILIDAD\n');
    [Q,R] = qr(X,0);
    z = Q'*y;

    fprintf('X=Q*R\n');
    fprintf('Q:\n'); disp(Q);
    fprintf('R:\n'); disp(R);
    fprintf('Q''*y:\n'); disp(z);

    coef = zeros(grado+1,1);

    fprintf('\nSUSTITUCION REGRESIVA: R*coef=Q''*y\n');

    for i = grado+1:-1:1
        suma = R(i,i+1:end)*coef(i+1:end);
        coef(i) = (z(i)-suma)/R(i,i);

        fprintf('b%d = (%.12g-(%.12g))/%.12g = %.12g\n', ...
            i-1,z(i),suma,R(i,i),coef(i));
    end

    yest = X*coef;
    residuos = y-yest;

    fprintf('\nTABLA COMPLETA DEL AJUSTE\n');

    if grado==1
        T = table((1:n)',x,y,x.^2,x.*y,yest,residuos, ...
            'VariableNames', ...
            {'i','x','y','x2','xy','y_est','error'});
    else
        T = table((1:n)',x,y,x.^4,x.^3,x.^2, ...
            y.*x.^2,y.*x,yest,residuos, ...
            'VariableNames', ...
            {'i','x','y','x4','x3','x2','yx2','yx','y_est','error'});
    end

    disp(T);
    fprintf('error=y-y_est\n');

    fprintf('\nCOEFICIENTES FINALES\n');

    for i = 1:numel(coef)
        fprintf('b%d = %.12g\n',i-1,coef(i));
    end

    fprintf('\nECUACION AJUSTADA\n');
    imprimirPolinomio(flipud(coef).','x');

    SSE = sum(residuos.^2);
    SST = sum((y-mean(y)).^2);

    fprintf('Suma de cuadrados de residuos = %.12g\n',SSE);
    fprintf('RMSE=sqrt(SSE/n) = %.12g\n',sqrt(SSE/n));

    if SST>0
        fprintf('R^2=1-SSE/SST = %.12g\n',1-SSE/SST);
    else
        fprintf('R^2 no definido porque y es constante.\n');
    end

    xp = input('Vector de valores para estimar, o []: ');
    validarPuntos(xp);

    if ~isempty(xp)
        yp = polyval(flipud(coef),xp);

        fprintf('\nVALORES ESTIMADOS\n');
        disp(table(xp(:),yp(:), ...
            'VariableNames',{'x','y_estimado'}));
    end

    xx = linspace(min(x),max(x),300);
    yy = polyval(flipud(coef),xx);

    figure;
    plot(x,y,'bo','MarkerFaceColor','b');
    hold on;
    plot(x,yest,'rx','LineWidth',1.5);
    plot(xx,yy,'k-','LineWidth',1.5);
    grid on;
    xlabel('x');
    ylabel('y');
    title('Ajuste por minimos cuadrados');
    legend('Datos','Valores ajustados','Curva','Location','best');
    hold off;
end

%% 10: INTERPOLACION POR DIFERENCIAS DIVIDIDAS

function diferenciasDivididas()
    fprintf('\nINTERPOLACION DE NEWTON\n');
    [x,y] = leerDatos();
    n = numel(x);

    if numel(unique(x))~=n
        error('Los valores de x deben ser distintos.');
    end

    [x,orden] = sort(x);
    y = y(orden);

    DD = NaN(n,n);
    DD(:,1) = y;

    fprintf('\nDATOS ORDENADOS\n');
    disp(table((0:n-1)',x,y, ...
        'VariableNames',{'i','x','y'}));

    fprintf('\nFORMULA GENERAL\n');
    fprintf(['f[x_i,...,x_j]=' ...
        '(f[x_(i+1),...,x_j]-f[x_i,...,x_(j-1)])/(x_j-x_i)\n']);

    for j = 2:n
        fprintf('\n========== ORDEN %d ==========\n',j-1);

        for i = j:n
            numerador = DD(i,j-1)-DD(i-1,j-1);
            denominador = x(i)-x(i-j+1);
            DD(i,j) = numerador/denominador;

            fprintf('f[');
            fprintf('%.8g',x(i-j+1));

            for k = i-j+2:i
                fprintf(', %.8g',x(k));
            end

            fprintf('] = (%.12g-(%.12g))/(%.12g-(%.12g))', ...
                DD(i,j-1),DD(i-1,j-1),x(i),x(i-j+1));

            fprintf(' = %.12g\n',DD(i,j));
        end
    end

    nombres = cell(1,n+2);
    nombres(1:3) = {'i','x','f_x'};

    for j = 2:n
        nombres{j+2} = sprintf('diferencia_orden_%d',j-1);
    end

    fprintf('\nTABLA TRIANGULAR DE DIFERENCIAS DIVIDIDAS\n');

    disp(array2table([(0:n-1)' x DD], ...
        'VariableNames',nombres));

    fprintf('NaN significa casilla no utilizada, no error.\n');

    coef = diag(DD).';

    fprintf('\nCOEFICIENTES: DIAGONAL DE LA TABLA\n');

    for j = 1:n
        fprintf('a%d = %.12g\n',j-1,coef(j));
    end

    fprintf('\nPOLINOMIO DE NEWTON\n');
    fprintf('P(x) = %.12g',coef(1));

    for j = 2:n
        fprintf('\n       + (%.12g)',coef(j));

        for k = 1:j-1
            fprintf('*(x-(%.12g))',x(k));
        end
    end

    fprintf('\n');

    pol = coef(n);

    fprintf('\nEXPANSION POR MULTIPLICACION ANIDADA\n');

    for k = n-1:-1:1
        pol = conv(pol,[1 -x(k)]);
        pol(end) = pol(end)+coef(k);

        fprintf('Paso: pol <- pol*(x-(%.12g))+(%.12g)\n', ...
            x(k),coef(k));

        fprintf('Coeficientes en potencias descendentes:\n');
        disp(pol);
    end

    fprintf('\nPOLINOMIO EXPANDIDO\n');
    imprimirPolinomio(pol,'x');

    yver = evaluarNewton(coef,x,x);

    fprintf('\nVERIFICACION EN LOS NODOS\n');
    disp(table(x,y,yver,y-yver, ...
        'VariableNames',{'x','y','P_x','error'}));

    xp = input('Vector de puntos a evaluar, o []: ');
    validarPuntos(xp);

    if ~isempty(xp)
        yp = evaluarNewton(coef,x,xp);

        fprintf('\nDESARROLLO DE LA EVALUACION\n');

        for t = 1:numel(xp)
            fprintf('\nPara x = %.12g\n',xp(t));

            suma = coef(1);
            producto = 1;

            fprintf('Termino 0 = %.12g\n',coef(1));

            for j = 2:n
                factor = xp(t)-x(j-1);
                producto = producto*factor;
                termino = coef(j)*producto;
                suma = suma+termino;

                fprintf('Factor nuevo: %.12g-(%.12g)=%.12g\n', ...
                    xp(t),x(j-1),factor);

                fprintf('Producto acumulado = %.12g\n',producto);

                fprintf('Termino %d = %.12g*%.12g = %.12g\n', ...
                    j-1,coef(j),producto,termino);
            end

            fprintf('P(%.12g)=suma de terminos = %.12g\n', ...
                xp(t),suma);
        end

        fprintf('\nRESULTADOS\n');
        disp(table(xp(:),yp(:), ...
            'VariableNames',{'x','y_interpolado'}));

        if any(xp(:)<min(x) | xp(:)>max(x))
            fprintf('Aviso: fuera del intervalo se realiza extrapolacion.\n');
        end
    end

    if n==1
        xx = linspace(x(1)-1,x(1)+1,300);
    else
        xx = linspace(min(x),max(x),300);
    end

    yy = evaluarNewton(coef,x,xx);

    figure;
    plot(x,y,'bo','MarkerFaceColor','b');
    hold on;
    plot(xx,yy,'k-','LineWidth',1.5);

    if ~isempty(xp)
        plot(xp,yp,'rx','LineWidth',1.5);

        legend('Datos','Polinomio','Puntos evaluados', ...
            'Location','best');
    else
        legend('Datos','Polinomio','Location','best');
    end

    grid on;
    xlabel('x');
    ylabel('y');
    title('Newton: diferencias divididas');
    hold off;
end

%% FUNCIONES AUXILIARES PARA POLINOMIOS

function yp = evaluarNewton(coef,x,xp)
    n = numel(coef);
    yp = coef(n)*ones(size(xp));

    for k = n-1:-1:1
        yp = coef(k)+(xp-x(k)).*yp;
    end
end

function imprimirPolinomio(c,variable)
    c = c(:).';
    grado = numel(c)-1;

    fprintf('P(%s) = ',variable);

    for j = 1:numel(c)
        if j>1
            fprintf(' + ');
        end

        if isreal(c(j))
            fprintf('(%.12g)',c(j));
        else
            fprintf('(%.12g%+.12gi)',real(c(j)),imag(c(j)));
        end

        potencia = grado-j+1;

        if potencia==1
            fprintf('*%s',variable);
        elseif potencia>1
            fprintf('*%s^%d',variable,potencia);
        end
    end

    fprintf('\n');
end
