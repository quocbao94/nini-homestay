"""Chieu toa do: lat/lon WGS84 <-> UTM 48N <-> met cuc bo (goc = origin_utm48n). x = Dong, y = Bac."""
import math
A = 6378137.0; F = 1 / 298.257223563; E2 = F * (2 - F); EP2 = E2 / (1 - E2); K0 = 0.9996
LON0 = math.radians(105.0)  # zone 48

def utm(lat, lon):
    phi = math.radians(lat); lam = math.radians(lon)
    N = A / math.sqrt(1 - E2 * math.sin(phi) ** 2); T = math.tan(phi) ** 2; C = EP2 * math.cos(phi) ** 2
    Aa = math.cos(phi) * (lam - LON0)
    M = A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * math.sin(4 * phi) - (35 * E2 ** 3 / 3072) * math.sin(6 * phi))
    x = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120) + 500000
    y = K0 * (M + N * math.tan(phi) * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720))
    return x, y

def utm_inv(x, y):
    x -= 500000; M = y / K0; mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu) + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
    N1 = A / math.sqrt(1 - E2 * math.sin(p1) ** 2); T1 = math.tan(p1) ** 2; C1 = EP2 * math.cos(p1) ** 2
    R1 = A * (1 - E2) / (1 - E2 * math.sin(p1) ** 2) ** 1.5; D = x / (N1 * K0)
    lat = p1 - (N1 * math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720)
    lon = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / math.cos(p1)
    return math.degrees(lat), math.degrees(lon)

class Local:
    def __init__(self, origin):
        self.ox, self.oy = origin
    def fwd(self, lat, lon):
        x, y = utm(lat, lon); return (round(x - self.ox, 2), round(y - self.oy, 2))
    def inv(self, x, y):
        return utm_inv(x + self.ox, y + self.oy)
