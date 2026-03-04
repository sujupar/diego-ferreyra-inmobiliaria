/**
 * Valuation Rules - Based on "Tasación con el Método de Comparables" document
 * and Ross-Heidecke depreciation table from the official CSV (9 columns).
 *
 * All coefficients match the official methodology document exactly.
 * Life span is always 70 years.
 */

export const VALUATION_RULES = {
    // ─────────────────────────────────────────────────────────────
    // Homogeneización de superficies
    // ─────────────────────────────────────────────────────────────
    SURFACE_COEFFICIENTS: {
        COVERED: 1.00,      // Cubierta 100%
        SEMI_COVERED: 0.50, // Semi Cubierta 50%
        BALCONY: 0.50,      // Balcón 50%
        UNCOVERED: 0.50,    // Descubierta 50%
    },

    // ─────────────────────────────────────────────────────────────
    // Planta (Disposición/Vista)
    // ─────────────────────────────────────────────────────────────
    DISPOSITION_COEFFICIENTS: {
        FRONT: 1.00,        // Frente
        BACK: 0.95,         // Contrafrente
        LATERAL: 0.93,      // Lateral (sugerido)
        INTERNAL: 0.90,     // A patio interior
    },

    // ─────────────────────────────────────────────────────────────
    // Piso (con ascensores) — del documento oficial
    // ─────────────────────────────────────────────────────────────
    FLOOR_COEFFICIENTS: {
        GROUND_FLOOR: 0.90,        // Planta Baja
        GROUND_FLOOR_GARDEN: 1.00, // Planta Baja (con patio y/o jardín al fondo)
        FLOOR_1: 0.85,             // 1er. Piso
        FLOOR_2: 0.93,             // 2do. Piso
        FLOOR_3_4: 1.00,           // 3er. y 4to. Pisos
        FLOOR_5_6: 1.05,           // 5to. y 6to. Pisos
        FLOOR_7_8: 1.10,           // 7to. y 8to. Pisos
        FLOOR_HIGH: 1.15,          // Pisos Superiores (9+)
        TOP_FLOOR: 0.90,           // Último piso
    },

    // ─────────────────────────────────────────────────────────────
    // Características constructivas (Calidad) — 5 opciones del documento
    // ─────────────────────────────────────────────────────────────
    QUALITY_COEFFICIENTS: {
        ECONOMIC: 0.90,       // Económica (interés social)
        GOOD_ECONOMIC: 1.00,  // Buena económica (estándar)
        GOOD: 1.075,          // Buena (promedio 1.05-1.10)
        VERY_GOOD: 1.175,     // Muy Buena (promedio 1.15-1.20)
        EXCELLENT: 1.275,     // Excelente (promedio 1.25-1.30)
    },

    // ─────────────────────────────────────────────────────────────
    // Estados de conservación — 9 niveles del CSV oficial
    // Ross-Heidecke table: 9 columns (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)
    // ─────────────────────────────────────────────────────────────
    CONSERVATION_STATE: {
        STATE_1: { name: 'Nuevo o muy bueno', tableIndex: 0, depreciation: '0%' },
        STATE_1_5: { name: 'Entre nuevo y conservación normal', tableIndex: 1, depreciation: '~0.03%' },
        STATE_2: { name: 'Conservación normal', tableIndex: 2, depreciation: '2.52%' },
        STATE_2_5: { name: 'Entre normal y reparaciones', tableIndex: 3, depreciation: '~8.09%' },
        STATE_3: { name: 'Reparaciones sencillas', tableIndex: 4, depreciation: '18.10%' },
        STATE_3_5: { name: 'Entre reparaciones sencillas e importantes', tableIndex: 5, depreciation: '33.20%' },
        STATE_4: { name: 'Reparaciones importantes', tableIndex: 6, depreciation: '52.60%' },
        STATE_4_5: { name: 'Entre reparaciones importantes y demolición', tableIndex: 7, depreciation: '75.20%' },
        STATE_5: { name: 'Demolición', tableIndex: 8, depreciation: '100%' },
    },

    // Vida útil fija: siempre 70 años
    DEFAULT_LIFE_SPAN: 70,
}

// ─────────────────────────────────────────────────────────────────
// Type definitions — aligned with document
// ─────────────────────────────────────────────────────────────────
export type DispositionType = 'FRONT' | 'BACK' | 'LATERAL' | 'INTERNAL'
export type QualityType = 'ECONOMIC' | 'GOOD_ECONOMIC' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT'
export type ConservationStateType = 'STATE_1' | 'STATE_1_5' | 'STATE_2' | 'STATE_2_5' | 'STATE_3' | 'STATE_3_5' | 'STATE_4' | 'STATE_4_5' | 'STATE_5'

// ─────────────────────────────────────────────────────────────────
// Labels for UI — with coefficient values for guidance
// ─────────────────────────────────────────────────────────────────
export const DISPOSITION_LABELS: Record<DispositionType, string> = {
    FRONT: 'Frente',
    BACK: 'Contrafrente',
    LATERAL: 'Lateral',
    INTERNAL: 'A patio interior',
}

export const DISPOSITION_COEFFICIENTS_DISPLAY: Record<DispositionType, string> = {
    FRONT: '1.00',
    BACK: '0.95',
    LATERAL: '0.93',
    INTERNAL: '0.90',
}

export const QUALITY_LABELS: Record<QualityType, string> = {
    ECONOMIC: 'Económica',
    GOOD_ECONOMIC: 'Buena Económica',
    GOOD: 'Buena',
    VERY_GOOD: 'Muy Buena',
    EXCELLENT: 'Excelente',
}

export const QUALITY_COEFFICIENTS_DISPLAY: Record<QualityType, string> = {
    ECONOMIC: '0.90',
    GOOD_ECONOMIC: '1.00',
    GOOD: '1.05 – 1.10',
    VERY_GOOD: '1.15 – 1.20',
    EXCELLENT: '1.25 – 1.30',
}

export const CONSERVATION_LABELS: Record<ConservationStateType, string> = {
    STATE_1: 'Estado 1 — Nuevo o muy bueno',
    STATE_1_5: 'Estado 1.5 — Entre nuevo y normal',
    STATE_2: 'Estado 2 — Conservación normal',
    STATE_2_5: 'Estado 2.5 — Entre normal y reparaciones',
    STATE_3: 'Estado 3 — Reparaciones sencillas',
    STATE_3_5: 'Estado 3.5 — Entre sencillas e importantes',
    STATE_4: 'Estado 4 — Reparaciones importantes',
    STATE_4_5: 'Estado 4.5 — Entre importantes y demolición',
    STATE_5: 'Estado 5 — Demolición',
}

export const CONSERVATION_SHORT_LABELS: Record<ConservationStateType, string> = {
    STATE_1: 'Nuevo (0%)',
    STATE_1_5: 'Nuevo/Normal',
    STATE_2: 'Normal (2.52%)',
    STATE_2_5: 'Normal/Repar.',
    STATE_3: 'Reparaciones (18.1%)',
    STATE_3_5: 'Sencillas/Importantes (33.2%)',
    STATE_4: 'Repar. Importantes (52.6%)',
    STATE_4_5: 'Importantes/Demolición (75.2%)',
    STATE_5: 'Demolición (100%)',
}

/**
 * Ross-Heidecke depreciation table — 9 columns from official CSV
 * Index: percentage of life (0-99)
 * Values: [State 1, State 1.5, State 2, State 2.5, State 3, State 3.5, State 4, State 4.5, State 5]
 * These are the K values (depreciation percentages)
 *
 * Formula: K(p, s) = D_age + D_state - D_age × D_state / 100
 * Where D_age = State 1 value, D_state = base depreciation for that state
 */
export const ROSS_HEIDECKE_TABLE: Record<number, number[]> = {
    0: [0, 0.032, 2.52, 8.09, 18.1, 33.2, 52.6, 75.2, 100],
    1: [0.505, 0.537, 3.01, 8.55, 18.51, 33.54, 52.839, 75.325, 100],
    2: [1.02, 1.052, 3.51, 9.03, 18.94, 33.89, 53.083, 75.453, 100],
    3: [1.545, 1.577, 4.03, 9.51, 19.37, 34.23, 53.332, 75.583, 100],
    4: [2.08, 2.111, 4.55, 10.0, 19.8, 34.59, 53.586, 75.716, 100],
    5: [2.625, 2.656, 5.08, 10.5, 20.25, 34.95, 53.844, 75.851, 100],
    6: [3.18, 3.211, 5.62, 11.01, 20.7, 35.32, 54.107, 75.989, 100],
    7: [3.745, 3.776, 6.17, 11.53, 21.17, 35.7, 54.375, 76.129, 100],
    8: [4.32, 4.351, 6.73, 12.06, 21.64, 36.09, 54.648, 76.271, 100],
    9: [4.905, 4.935, 7.3, 12.6, 22.12, 36.48, 54.925, 76.416, 100],
    10: [5.5, 5.53, 7.88, 13.15, 22.6, 36.87, 55.207, 76.564, 100],
    11: [6.105, 6.135, 8.47, 13.7, 23.1, 37.27, 55.494, 76.714, 100],
    12: [6.72, 6.75, 9.07, 14.27, 23.61, 37.68, 55.785, 76.867, 100],
    13: [7.345, 7.375, 9.68, 14.84, 24.12, 38.1, 56.082, 77.022, 100],
    14: [7.98, 8.009, 10.3, 15.42, 24.63, 38.52, 56.383, 77.179, 100],
    15: [8.625, 8.654, 10.93, 16.02, 25.16, 38.95, 56.688, 77.339, 100],
    16: [9.28, 9.309, 11.57, 16.62, 25.7, 39.39, 56.999, 77.501, 100],
    17: [9.945, 9.974, 12.22, 17.23, 26.25, 39.84, 57.314, 77.666, 100],
    18: [10.62, 10.649, 12.87, 17.85, 26.8, 40.29, 57.634, 77.834, 100],
    19: [11.305, 11.333, 13.54, 18.48, 27.36, 40.75, 57.959, 78.004, 100],
    20: [12.0, 12.028, 14.22, 19.12, 27.93, 41.22, 58.288, 78.176, 100],
    21: [12.705, 12.733, 14.51, 19.77, 28.51, 41.69, 58.622, 78.351, 100],
    22: [13.42, 13.448, 15.6, 20.42, 29.09, 42.16, 58.961, 78.528, 100],
    23: [14.145, 14.173, 16.31, 21.09, 29.68, 42.65, 59.305, 78.708, 100],
    24: [14.83, 14.907, 17.03, 21.77, 30.28, 43.14, 59.629, 78.878, 100],
    25: [15.625, 15.652, 17.75, 22.45, 30.89, 43.64, 60.006, 79.075, 100],
    26: [16.38, 16.407, 18.49, 23.14, 31.51, 44.14, 60.364, 79.262, 100],
    27: [17.145, 17.171, 19.23, 23.85, 32.14, 44.65, 60.727, 79.452, 100],
    28: [17.92, 17.956, 19.99, 24.56, 32.78, 45.17, 61.094, 79.644, 100],
    29: [18.705, 18.731, 20.75, 25.28, 33.42, 45.69, 61.466, 79.839, 100],
    30: [19.5, 19.526, 21.53, 26.01, 34.07, 46.22, 61.843, 80.036, 100],
    31: [20.305, 20.33, 22.31, 26.75, 34.73, 46.76, 62.225, 80.236, 100],
    32: [21.12, 21.155, 23.11, 27.5, 35.4, 47.31, 62.611, 80.438, 100],
    33: [21.945, 21.97, 23.9, 28.26, 36.07, 47.86, 63.002, 80.642, 100],
    34: [22.78, 22.805, 24.73, 29.03, 36.76, 48.42, 63.398, 80.849, 100],
    35: [23.625, 23.649, 25.55, 29.8, 37.45, 48.98, 63.798, 81.059, 100],
    36: [24.48, 24.504, 26.38, 30.59, 38.15, 49.55, 64.204, 81.271, 100],
    37: [25.345, 25.349, 27.23, 31.38, 38.86, 50.13, 64.614, 81.486, 100],
    38: [26.22, 26.244, 28.08, 32.19, 39.57, 50.71, 65.028, 81.703, 100],
    39: [27.105, 27.128, 28.94, 33.0, 40.3, 51.3, 65.448, 81.922, 100],
    40: [28.0, 28.023, 29.81, 33.82, 41.03, 51.9, 65.872, 82.144, 100],
    41: [28.905, 28.928, 30.7, 34.66, 42.0, 52.51, 66.301, 82.368, 100],
    42: [29.82, 29.842, 31.59, 35.5, 42.52, 53.12, 66.735, 82.595, 100],
    43: [30.745, 30.767, 32.49, 36.35, 43.28, 53.74, 67.173, 82.825, 100],
    44: [31.68, 31.702, 33.4, 37.21, 44.05, 54.36, 67.616, 83.057, 100],
    45: [32.625, 32.646, 34.32, 38.08, 44.82, 54.99, 68.064, 83.291, 100],
    46: [33.58, 33.601, 35.25, 38.95, 45.6, 55.63, 68.517, 83.528, 100],
    47: [34.545, 34.566, 36.19, 39.84, 46.39, 56.28, 68.974, 83.767, 100],
    48: [35.52, 35.541, 37.14, 40.74, 47.19, 56.93, 69.436, 84.009, 100],
    49: [36.505, 36.525, 38.1, 41.64, 48.0, 57.59, 69.903, 84.253, 100],
    50: [37.5, 37.52, 39.07, 42.56, 48.81, 58.25, 70.375, 84.5, 100],
    51: [38.505, 38.525, 40.05, 43.48, 49.63, 58.92, 70.851, 84.749, 100],
    52: [39.52, 39.539, 41.04, 44.41, 50.46, 59.6, 71.332, 85.001, 100],
    53: [40.545, 40.564, 42.04, 45.35, 51.3, 60.28, 71.818, 85.255, 100],
    54: [41.58, 41.599, 43.05, 46.3, 52.15, 60.97, 72.309, 85.512, 100],
    55: [42.625, 42.643, 44.07, 47.26, 53.01, 61.67, 72.804, 85.771, 100],
    56: [43.68, 43.698, 45.1, 48.24, 53.87, 62.38, 73.304, 86.033, 100],
    57: [44.745, 44.763, 46.14, 49.22, 54.74, 63.09, 73.809, 86.297, 100],
    58: [45.82, 45.837, 47.19, 50.2, 55.62, 63.81, 74.319, 86.563, 100],
    59: [46.905, 46.922, 48.25, 51.2, 55.61, 64.53, 74.833, 86.832, 100],
    60: [48.0, 48.017, 49.32, 52.2, 57.41, 65.26, 75.352, 87.104, 100],
    61: [49.105, 49.121, 50.39, 53.22, 58.32, 66.0, 75.876, 87.378, 100],
    62: [50.22, 50.236, 51.47, 54.25, 59.23, 66.75, 76.404, 87.655, 100],
    63: [51.345, 51.361, 52.57, 55.28, 60.15, 67.5, 76.938, 87.934, 100],
    64: [52.48, 52.495, 53.68, 56.32, 61.08, 68.26, 77.476, 88.215, 100],
    65: [53.625, 53.64, 54.8, 57.38, 62.02, 69.02, 78.018, 88.499, 100],
    66: [54.78, 54.794, 55.93, 58.44, 62.96, 69.79, 78.566, 88.785, 100],
    67: [55.945, 55.959, 57.06, 59.51, 63.92, 70.57, 79.118, 89.074, 100],
    68: [57.12, 57.134, 58.2, 60.59, 64.88, 71.36, 79.675, 89.366, 100],
    69: [58.305, 58.318, 59.36, 61.68, 65.85, 72.15, 80.237, 89.66, 100],
    70: [59.5, 59.513, 60.52, 62.78, 66.83, 72.95, 80.803, 89.956, 100],
    71: [60.705, 60.718, 61.7, 63.88, 67.82, 73.75, 81.374, 90.255, 100],
    72: [61.92, 61.932, 62.88, 65.0, 68.81, 74.56, 81.95, 90.556, 100],
    73: [63.145, 63.157, 64.08, 66.13, 69.81, 75.38, 82.531, 90.86, 100],
    74: [64.38, 64.391, 65.28, 67.26, 70.83, 76.21, 83.116, 91.166, 100],
    75: [65.625, 65.636, 66.49, 68.4, 71.85, 77.04, 83.706, 91.475, 100],
    76: [66.88, 66.891, 67.71, 69.56, 72.87, 77.88, 84.301, 91.786, 100],
    77: [68.145, 68.155, 68.95, 70.72, 73.91, 78.72, 84.901, 92.1, 100],
    78: [69.42, 69.43, 70.19, 71.89, 74.95, 79.57, 85.505, 92.416, 100],
    79: [70.705, 70.714, 71.44, 73.07, 76.01, 80.43, 86.114, 92.735, 100],
    80: [72.0, 72.009, 72.71, 74.27, 77.07, 81.3, 86.728, 93.056, 100],
    81: [73.305, 73.314, 73.98, 75.47, 78.14, 82.17, 87.347, 93.38, 100],
    82: [74.62, 74.628, 75.26, 76.67, 79.21, 83.05, 87.97, 93.706, 100],
    83: [75.945, 75.953, 76.56, 77.89, 80.3, 83.93, 88.598, 94.034, 100],
    84: [77.28, 77.287, 77.85, 79.12, 81.39, 84.82, 89.231, 94.365, 100],
    85: [78.625, 78.632, 79.16, 80.35, 82.49, 85.72, 89.868, 94.699, 100],
    86: [79.98, 79.986, 80.48, 81.6, 83.6, 86.63, 90.511, 95.035, 100],
    87: [81.345, 81.351, 81.82, 82.85, 84.72, 87.54, 91.158, 95.374, 100],
    88: [82.72, 82.725, 83.16, 84.12, 85.85, 88.46, 91.809, 95.715, 100],
    89: [84.105, 84.11, 84.51, 85.39, 86.98, 89.38, 92.466, 96.058, 100],
    90: [85.5, 85.505, 85.87, 86.67, 88.12, 90.31, 93.127, 96.404, 100],
    91: [86.905, 86.909, 87.23, 87.96, 89.27, 91.25, 93.793, 96.752, 100],
    92: [88.32, 88.324, 88.61, 89.26, 90.43, 92.2, 94.464, 97.103, 100],
    93: [89.745, 89.748, 90.0, 90.57, 91.59, 93.15, 95.139, 97.457, 100],
    94: [91.18, 91.183, 91.4, 91.89, 92.77, 94.11, 95.819, 97.813, 100],
    95: [92.625, 92.627, 92.81, 93.22, 93.96, 95.07, 96.504, 98.171, 100],
    96: [94.08, 94.082, 94.56, 94.56, 95.15, 96.04, 97.194, 98.532, 100],
    97: [95.545, 95.546, 95.66, 95.91, 96.45, 97.02, 97.888, 98.895, 100],
    98: [97.02, 97.021, 97.1, 97.26, 97.56, 98.01, 98.587, 99.261, 100],
    99: [98.505, 98.505, 98.54, 98.63, 98.78, 99.0, 99.291, 99.629, 100],
}

/**
 * Get the state index for Ross-Heidecke table lookup
 * Maps conservation state type to array index (0-8)
 */
export function getStateIndex(state: ConservationStateType): number {
    const mapping: Record<ConservationStateType, number> = {
        STATE_1: 0,
        STATE_1_5: 1,
        STATE_2: 2,
        STATE_2_5: 3,
        STATE_3: 4,
        STATE_3_5: 5,
        STATE_4: 6,
        STATE_4_5: 7,
        STATE_5: 8,
    }
    return mapping[state] ?? 2 // Default to STATE_2
}

/**
 * Get depreciation coefficient (K) from Ross-Heidecke table
 * @param percentLife - Percentage of life used (0-99)
 * @param state - Conservation state
 * @returns K value from table
 */
export function getRossHeideckeK(percentLife: number, state: ConservationStateType): number {
    // Clamp to valid range and round to nearest integer
    const clampedPercent = Math.min(99, Math.max(0, Math.round(percentLife)))
    const stateIndex = getStateIndex(state)

    return ROSS_HEIDECKE_TABLE[clampedPercent]?.[stateIndex] ?? 0
}

/**
 * Calculate the age/state coefficient using Ross-Heidecke formula
 * Document formula: W = 1 - (K / 100 / 2) = 1 - (K / 200)
 * This reduces the depreciation impact by half to avoid over-penalizing
 *
 * Life span is always 70 years.
 *
 * @param age - Building age in years
 * @param state - Conservation state
 * @param lifeSpan - Expected life span (default 70 years)
 * @returns Coefficient between 0 and 1
 */
export function calculateAgeStateCoefficient(
    age: number,
    state: ConservationStateType,
    lifeSpan: number = VALUATION_RULES.DEFAULT_LIFE_SPAN
): number {
    // Calculate percentage of life: MIN(99, ROUND(100 * age / lifeSpan, 0))
    const percentLife = Math.min(99, Math.round((100 * age) / lifeSpan))

    // Get K from table
    const K = getRossHeideckeK(percentLife, state)

    // Apply formula: W = 1 - (K / 100 / 2) = 1 - (K / 200)
    const coefficient = 1 - (K / 100 / 2)

    return Math.max(0, Math.min(1, coefficient))
}
