# Instrucciones para el agente (Claude en Chrome) — crear la sala de Race 1 vs 1 en Cloudflare

Hola. Ayudas a **Daniel**, dueño de la app Drag Tree (https://daniterrazas01-source.github.io/dragtrim/), desde el
navegador de su computadora. Háblale en español, claro y sin jerga.

**Objetivo:** dejar publicada en una cuenta **gratis** de Cloudflare a nombre de Daniel la "sala" de Race 1 vs 1: un
programa chico (Worker + Durable Object) que junta por internet a los dos teléfonos de una carrera con un código de
5 letras. El código ya está listo en este repositorio (`fuente/sala/`); tú solo preparas la cuenta, los dos secretos
de GitHub y lanzas la publicación. Al final Daniel le pasa la dirección de la sala a la sesión de Claude Code que
programa la app.

## Reglas
- **Contraseñas, correo, códigos de verificación y captchas los pone Daniel.** No inventes ni guardes contraseñas.
- **Todo gratis.** Si alguna pantalla pide tarjeta, un plan de pago o "Workers Paid", detente y avísale a Daniel (no
  hace falta: el plan gratis incluye Workers y Durable Objects con SQLite).
- El **token** de Cloudflare es secreto: solo va en los secretos de GitHub (paso 5). No lo pegues en chats, notas ni
  archivos. Si prefieres no moverlo tú, pídele a Daniel que lo copie y lo pegue él.
- No cambies nada más del repositorio ni de la cuenta de GitHub (ni ramas, ni Pages, ni otros ajustes).

## Pasos
1. **Cuenta de Cloudflare:** abre https://dash.cloudflare.com/sign-up. Daniel escribe su correo y una contraseña y
   confirma el correo. Si pregunta para qué la usará, cualquier opción sirve (por ejemplo, desarrollador / proyecto
   personal). Si ofrece agregar un dominio o sitio, sáltalo: no hace falta.
2. **Workers:** en el menú de la izquierda entra a **Workers & Pages** (en algunas versiones: **Compute (Workers)**).
   Si pide elegir un **subdominio de workers.dev**, pon `roosterracing` (si está ocupado: `roosterracing-mx` o
   `dragtree-daniel`). **Anota el subdominio.** Si ofrece crear un Worker de ejemplo, no hace falta.
3. **Account ID:** cópialo (sale en Workers & Pages a la derecha, o en la página de inicio de la cuenta → "Account ID";
   no es secreto).
4. **Token:** ícono de perfil arriba a la derecha → **My Profile** → **API Tokens** → **Create Token** → en la plantilla
   **Edit Cloudflare Workers** toca **Use template**. En *Account Resources* deja *Include* + la cuenta de Daniel; en
   *Zone Resources* deja *All zones*. → **Continue to summary** → **Create Token**. El token se ve **una sola vez**:
   tenlo a la mano para el paso 5.
5. **Secretos en GitHub** (Daniel debe tener la sesión de GitHub abierta): abre
   https://github.com/daniterrazas01-source/dragtrim/settings/secrets/actions → **New repository secret**, dos veces:
   - Name `CLOUDFLARE_API_TOKEN` → Secret: el token del paso 4 → **Add secret**
   - Name `CLOUDFLARE_ACCOUNT_ID` → Secret: el Account ID del paso 3 → **Add secret**
6. **Publicar:** abre https://github.com/daniterrazas01-source/dragtrim/actions y, a la izquierda, el flujo
   **Sala Race 1 vs 1**. Abre su corrida más reciente (rama `claude/youthful-johnson-t02s8o`) → **Re-run all jobs** →
   confirma. Tarda 1–2 minutos. Debe terminar en verde y en el paso **Publicar en Cloudflare** aparece la dirección
   `https://dragtree-sala.<subdominio>.workers.dev`.
7. **Comprobar:** abre `https://dragtree-sala.<subdominio>.workers.dev/estado`. Debe decir
   **"Drag Tree: sala de Race 1 vs 1 funcionando"**.
8. **Avisar a Daniel:** dile la dirección del paso 7 (sin el token) para que se la pase a la sesión de Claude Code.
   Esa sesión la pone en la app y prueba la carrera.

## Si algo falla en el paso 6 (léelo en el registro del paso "Publicar en Cloudflare")
- *"Faltan los secretos…"* (aviso en verde, sin publicar): revisa los nombres exactos del paso 5 y vuelve a correr.
- *"workers.dev subdomain"* / *"You need to register a workers.dev subdomain"*: falta el paso 2.
- *"Authentication error"* / código 10000 / *"Invalid API Token"*: el token o el Account ID están mal. Crea otro token
  (paso 4), actualízalo en GitHub (abre el secreto → **Update secret**) y vuelve a correr.
- Algo de **Durable Objects** que pida plan de pago: detente y avísale a Daniel con el texto del error.
- Cualquier otro error: copia el texto del error (nunca el token) para que Daniel se lo pase a la sesión de Claude Code.
