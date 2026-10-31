# Genera un árbol sintético (Pro .4) en Y4M I420 para la cámara falsa de Chromium.
import numpy as np, sys
W, H, FPS = 640, 480, 30
def rgb2yuv(r, g, b):
    y = 0.299*r + 0.587*g + 0.114*b
    u = -0.169*r - 0.331*g + 0.5*b + 128
    v = 0.5*r - 0.419*g - 0.081*b + 128
    return y, u, v
bulbs = {  # (cx, cy) carril izquierdo
    'stg': (300, 80), 'a0': (300, 150), 'a1': (300, 210), 'a2': (300, 270), 'g': (300, 330), 'r': (300, 390)}
col = {'stg': (255, 255, 230), 'a0': (255, 170, 0), 'a1': (255, 170, 0), 'a2': (255, 170, 0), 'g': (40, 255, 80), 'r': (255, 30, 20)}
yy, xx = np.mgrid[0:H, 0:W]
def frame(on):
    R = np.full((H, W), 25.0); G = R.copy(); B = R.copy()
    for k, (cx, cy) in bulbs.items():
        m = (xx-cx)**2 + (yy-cy)**2 <= 18**2
        c = col[k] if k in on else tuple(0.15*x for x in col[k])
        R[m], G[m], B[m] = c
    Y, U, V = rgb2yuv(R, G, B)
    U = U.reshape(H//2, 2, W//2, 2).mean(axis=(1, 3)); V = V.reshape(H//2, 2, W//2, 2).mean(axis=(1, 3))
    return b'FRAME\n' + np.clip(Y, 0, 255).astype(np.uint8).tobytes() + np.clip(U, 0, 255).astype(np.uint8).tobytes() + np.clip(V, 0, 255).astype(np.uint8).tobytes()
out = open(sys.argv[1], 'wb')
out.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
N = 4 * FPS
for i in range(N):
    t = i / FPS
    on = {'stg'}
    if 1.0 <= t < 1.4: on |= {'a0', 'a1', 'a2'}
    if t >= 1.4: on |= {'g'}
    out.write(frame(on))
out.close()
print('frames', N, 'ambar desde frame', 30, 'verde desde frame', 42)
