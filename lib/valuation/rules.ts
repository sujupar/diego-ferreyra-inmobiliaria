export const VALUATION_RULES = {
    // Homogeneización de superficies
    SURFACE_COEFFICIENTS: {
        COVERED: 1.00,      // Cubierta
        SEMI_COVERED: 0.50, // Semi cubierta
        BALCONY: 0.50,      // Balcón
        UNCOVERED: 0.50,    // Descubierta
    },

    // Planta (Orientación/Vista)
    DISPOSITION_COEFFICIENTS: {
        FRENTE: 1.00,
        CONTRAFRENTE: 0.95,
        LATERAL: 0.93,
        INTERNO: 0.90, // Patio interior
    },

    // Piso (con ascensores) - Per Excel formula
    FLOOR_COEFFICIENTS: {
        GROUND_FLOOR: 0.90,
        GROUND_FLOOR_GARDEN: 1.00,
        FLOOR_1: 0.90,
        FLOOR_2: 0.93,         // Updated to match Excel
        FLOOR_3_4: 1.00,
        FLOOR_5_6: 1.05,
        FLOOR_7_8: 1.10,
        FLOOR_HIGH: 1.15,      // Pisos Superiores (9+)
        TOP_FLOOR: 0.90,       // Último piso
    },

    // Características constructivas (Calidad)
    QUALITY_COEFFICIENTS: {
        ECONOMIC: 0.90,           // Económica (interés social)
        GOOD_ECONOMIC: 1.00,      // Buena económica (estándar)
        GOOD: 1.075,              // Buena (promedio 1.05-1.10)
        VERY_GOOD: 1.175,         // Muy Buena (promedio 1.15-1.20)
        EXCELLENT: 1.275,         // Excelente (promedio 1.25-1.30)
    },

    // Vida Útil (en años)
    LIFE_SPAN: {
        APARTMENT_SERVICES: 50,   // Departamento con servicios centrales
        COLLECTIVE_HOUSING: 60,   // Viviendas colectivas comunes
        SINGLE_HOUSE: 70,         // Edificio de una planta individual
        WAREHOUSE: 75,            // Depósitos y garajes
    },

    // Estados de conservación - Depreciación base (según Ross-Heidecke)
    CONSERVATION_STATE: {
        STATE_1: { name: 'Nuevo o muy bueno', depreciation: 0.00 },
        STATE_2: { name: 'Conservación normal', depreciation: 0.0252 },
        STATE_3: { name: 'Necesita reparaciones sencillas', depreciation: 0.1810 },
        STATE_4: { name: 'Necesita reparaciones importantes', depreciation: 0.526 },
        STATE_5: { name: 'Demolición o ruina', depreciation: 1.00 },
    },

    // Tabla Ross-Heidecke simplificada (K values para depreciation final)
    // La fórmula es: Depreciación Final = 1 - sqrt(1 - K)
    // donde K es el valor de la tabla basado en edad/vida útil y estado
    ROSS_HEIDECKE_K: {
        // Porcentaje de vida útil transcurrida -> K por estado
        // [STATE_1, STATE_2, STATE_3, STATE_4, STATE_5]
        0: [0.00, 0.0252, 0.1810, 0.5260, 1.00],
        10: [0.01, 0.0350, 0.1900, 0.5350, 1.00],
        20: [0.04, 0.0650, 0.2150, 0.5550, 1.00],
        30: [0.09, 0.1150, 0.2600, 0.5900, 1.00],
        40: [0.16, 0.1850, 0.3200, 0.6350, 1.00],
        50: [0.25, 0.2750, 0.4000, 0.6950, 1.00],
        60: [0.36, 0.3850, 0.5000, 0.7700, 1.00],
        70: [0.49, 0.5150, 0.6200, 0.8600, 1.00],
        80: [0.64, 0.6650, 0.7600, 0.9150, 1.00],
        90: [0.81, 0.8350, 0.9100, 0.9800, 1.00],
        100: [1.00, 1.0000, 1.0000, 1.0000, 1.00],
    }
}

// Type definitions for dropdown options
export type DispositionType = 'FRENTE' | 'CONTRAFRENTE' | 'LATERAL' | 'INTERNO'
export type QualityType = 'ECONOMIC' | 'GOOD_ECONOMIC' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT'
export type ConservationStateType = 'STATE_1' | 'STATE_2' | 'STATE_3' | 'STATE_4' | 'STATE_5'
export type PropertyType = 'APARTMENT_SERVICES' | 'COLLECTIVE_HOUSING' | 'SINGLE_HOUSE' | 'WAREHOUSE'

// Labels for UI
export const DISPOSITION_LABELS: Record<DispositionType, string> = {
    FRENTE: 'Frente',
    CONTRAFRENTE: 'Contrafrente',
    LATERAL: 'Lateral',
    INTERNO: 'A patio interior',
}

export const QUALITY_LABELS: Record<QualityType, string> = {
    ECONOMIC: 'Económica',
    GOOD_ECONOMIC: 'Buena económica',
    GOOD: 'Buena',
    VERY_GOOD: 'Muy buena',
    EXCELLENT: 'Excelente',
}

export const CONSERVATION_LABELS: Record<ConservationStateType, string> = {
    STATE_1: 'Nuevo o muy bueno',
    STATE_2: 'Conservación normal',
    STATE_3: 'Necesita reparaciones sencillas',
    STATE_4: 'Necesita reparaciones importantes',
    STATE_5: 'Demolición o ruina',
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
    APARTMENT_SERVICES: 'Departamento con servicios',
    COLLECTIVE_HOUSING: 'Vivienda colectiva',
    SINGLE_HOUSE: 'Casa individual',
    WAREHOUSE: 'Depósito/Garaje',
}
