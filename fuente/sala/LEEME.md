# Sala de Race 1 vs 1 por internet

La sala junta a los dos teléfonos de una carrera **sin punto de acceso (hotspot)**: cada uno usa sus propios datos y
entra con un código de 5 letras. Es un programa chico en la cuenta de Cloudflare de Daniel (plan gratis):

- `sala.js`: el Worker y la sala (un Durable Object por código). Recibe los WebSocket de los teléfonos.
- `nucleo.js`: la lógica (entrar, códigos, pasar mensajes, guardar el último resultado para quien se reconecte, borrar la
  sala al día sin uso). La usan también las pruebas (`fuente/pruebas/sala_local.mjs`, `sala_nucleo_test.mjs`, `sala_test.py`).
- `wrangler.toml`: nombre (`dragtree-sala`), la sala como Durable Object con SQLite (lo que da el plan gratis) y
  `ORIGENES` (solo la app publicada puede usarla; también `localhost` para pruebas).

La sala no decide nada de la carrera: da la hora (para que los dos relojes se sincronicen con ella), pasa los mensajes de
un teléfono al otro y guarda el último de cada tipo (hola, config, estado, resultado). Quien manda la salida es el
teléfono que creó la sala (`fuente/app/src/carrera.js`). No guarda nombres ni ubicaciones.

## Publicarla (una sola vez)

Daniel, desde el navegador del teléfono o la computadora:

1. Crea una cuenta gratis en <https://dash.cloudflare.com/sign-up> (correo y contraseña).
2. Entra a **Workers & Pages** una vez. Si pide elegir un subdominio, pon algo corto (por ejemplo `roosterracing`):
   la sala quedará en `https://dragtree-sala.<subdominio>.workers.dev`.
3. **Account ID**: en la página de inicio de la cuenta (o en Workers & Pages, a la derecha) dice *Account ID*. Cópialo.
4. **Token**: arriba a la derecha, tu perfil → *My Profile* → *API Tokens* → *Create Token* → plantilla
   **Edit Cloudflare Workers** → *Use template* → *Continue to summary* → *Create Token*. Copia el token (solo se ve una vez).
5. En GitHub, en el repositorio `dragtrim`: *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = el token del paso 4
   - `CLOUDFLARE_ACCOUNT_ID` = el Account ID del paso 3
6. Avísale a Claude (sin pegar el token en el chat). Claude corre la publicación (pestaña *Actions* → *Sala Race 1 vs 1* →
   *Run workflow*), revisa que la sala conteste y pone su dirección en la app (`SALA_PUBLICADA` en `carrera.js`).

Después, cada cambio en `fuente/sala/` que llegue a `main` se vuelve a publicar solo (`.github/workflows/sala.yml`).

## Costo

El plan gratis de Workers alcanza de sobra: cada teléfono manda un "ping" por segundo para el reloj y la sala solo existe
mientras se usa (se borra sola al día). Una tarde de carreras usa una parte muy chica del límite diario gratis.

## Probarla en la computadora

```bash
cd fuente/pruebas
node sala_nucleo_test.mjs      # la lógica
python3 sala_test.py           # dos teléfonos en Chromium con la sala local (crear, unirse, carrera, sin señal)
node sala_local.mjs 8796       # la sala local sola; la app la usa con index.html?sala=ws://localhost:8796
```
