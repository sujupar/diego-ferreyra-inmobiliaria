import { StyleSheet, Font } from '@react-pdf/renderer'

// Register fonts if needed
// Font.register({
//   family: 'Helvetica',
//   src: 'https://fonts.gstatic.com/s/helvetica/...'
// })

export const colors = {
    primary: '#1a5490',      // Diego Ferreyra blue
    orange: '#ff8c42',       // Property titles
    darkGray: '#2d3748',     // Headers, main text
    mediumGray: '#718096',   // Secondary text
    lightGray: '#e2e8f0',    // Backgrounds, dividers
    white: '#ffffff',
    semaphoreRed: '#ef4444',
    semaphoreYellow: '#fbbf24',
    semaphoreGreen: '#10b981',
}

export const styles = StyleSheet.create({
    // Page layouts
    page: {
        flexDirection: 'column',
        backgroundColor: colors.white,
        fontFamily: 'Helvetica',
    },
    pageWithPadding: {
        flexDirection: 'column',
        backgroundColor: colors.white,
        padding: 40,
        fontFamily: 'Helvetica',
    },

    // Headers
    header: {
        position: 'absolute',
        top: 20,
        right: 40,
        fontSize: 10,
        color: colors.primary,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    headerWithSubtitle: {
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 2,
    },
    headerTitle: {
        fontSize: 10,
        color: colors.darkGray,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    headerSubtitle: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: 'bold',
    },

    // Dividers
    divider: {
        borderBottomWidth: 1,
        borderBottomColor: colors.lightGray,
        marginVertical: 10,
    },

    // Typography
    h1: {
        fontSize: 36,
        fontWeight: 'bold',
        color: colors.darkGray,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    h2: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.orange,
        marginBottom: 12,
    },
    h3: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: 8,
    },
    body: {
        fontSize: 11,
        color: colors.darkGray,
        lineHeight: 1.5,
    },
    bodySecondary: {
        fontSize: 10,
        color: colors.mediumGray,
        lineHeight: 1.5,
    },
    small: {
        fontSize: 9,
        color: colors.mediumGray,
    },

    // Property title (orange, large)
    propertyTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.orange,
        textAlign: 'center',
        marginBottom: 16,
    },

    // Icons grid (for property features)
    featuresGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginVertical: 16,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        width: '45%',
    },
    featureIcon: {
        width: 20,
        height: 20,
        color: colors.mediumGray,
    },
    featureText: {
        fontSize: 11,
        color: colors.darkGray,
    },

    // Comparable card
    comparableCard: {
        marginBottom: 24,
    },
    comparablePhotoContainer: {
        position: 'relative',
        width: '35%',
        marginRight: 16,
    },
    comparablePhoto: {
        width: '100%',
        height: 180,
        objectFit: 'cover',
        border: `1px solid ${colors.lightGray}`,
    },
    semaphoreIndicator: {
        position: 'absolute',
        top: 8,
        left: 8,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.white,
        justifyContent: 'center',
        alignItems: 'center',
    },
    semaphoreCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    comparableInfo: {
        flex: 1,
    },
    comparableRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    comparableLink: {
        fontSize: 10,
        color: '#00a8cc',
        textDecoration: 'underline',
        marginVertical: 8,
    },
    comparableMetadata: {
        fontSize: 9,
        color: colors.mediumGray,
        textAlign: 'right',
    },

    // Price bullets
    priceBullet: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginVertical: 2,
    },
    bullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.darkGray,
    },
    priceText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.darkGray,
    },

    // Valuation table (Page 9)
    table: {
        marginVertical: 12,
        borderWidth: 1,
        borderColor: colors.lightGray,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.lightGray,
        borderBottomWidth: 1,
        borderBottomColor: colors.darkGray,
        padding: 4,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.lightGray,
        padding: 4,
    },
    tableRowYellow: {
        flexDirection: 'row',
        backgroundColor: '#fff9e6',
        borderBottomWidth: 1,
        borderBottomColor: colors.lightGray,
        padding: 4,
    },
    tableCell: {
        fontSize: 7,
        padding: 2,
        textAlign: 'center',
    },
    tableCellLeft: {
        fontSize: 7,
        padding: 2,
        textAlign: 'left',
    },
    tableCellHeader: {
        fontSize: 6,
        fontWeight: 'bold',
        padding: 2,
        textAlign: 'center',
        color: colors.darkGray,
    },

    // Semaphore visualization (Page 9)
    semaphoreViz: {
        flexDirection: 'row',
        gap: 8,
        marginVertical: 16,
    },
    semaphoreBox: {
        flex: 1,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    semaphoreBoxGreen: {
        backgroundColor: colors.semaphoreGreen,
    },
    semaphoreBoxRed: {
        backgroundColor: colors.semaphoreRed,
    },
    semaphoreBoxText: {
        fontSize: 9,
        color: colors.white,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    semaphoreBoxValue: {
        fontSize: 14,
        color: colors.white,
        fontWeight: 'bold',
        marginTop: 4,
    },

    // Full-page background images (Pages 5, 10)
    backgroundPage: {
        position: 'relative',
        width: '100%',
        height: '100%',
    },
    backgroundOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(26, 84, 144, 0.85)',
    },
    backgroundContent: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
    },
    dividerTitle: {
        fontSize: 36,
        fontWeight: 'bold',
        color: colors.white,
        textAlign: 'center',
        textTransform: 'uppercase',
        lineHeight: 1.2,
    },
    dividerText: {
        fontSize: 14,
        color: colors.white,
        textAlign: 'center',
        lineHeight: 1.6,
        marginTop: 24,
        padding: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
    },
    dividerPhoto: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 280,
        height: 400,
        objectFit: 'cover',
    },

    // Footer (Page 1)
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        backgroundColor: colors.primary,
        padding: 16,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 11,
        color: colors.white,
        textDecoration: 'underline',
    },

    // Logos row
    logosRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 24,
        marginVertical: 24,
    },
    logo: {
        height: 40,
        objectFit: 'contain',
    },
    logoLarge: {
        height: 60,
        objectFit: 'contain',
    },

    // Social icons
    socialIcons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginVertical: 12,
    },
    socialIcon: {
        width: 32,
        height: 32,
        objectFit: 'contain',
    },

    // Centered content
    centered: {
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Checkbox list
    checkboxList: {
        marginVertical: 12,
    },
    checkboxItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginVertical: 4,
    },
    checkbox: {
        width: 14,
        height: 14,
        borderWidth: 1,
        borderColor: colors.darkGray,
        backgroundColor: colors.white,
    },
    checkboxChecked: {
        width: 14,
        height: 14,
        borderWidth: 1,
        borderColor: colors.darkGray,
        backgroundColor: colors.darkGray,
    },
})
