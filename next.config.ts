import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Módulos con binario nativo / WASM que Turbopack (bundler default de Next 16) no
    // puede empaquetar ("non-ecmascript placeable asset"). Los marcamos como externos
    // para que se require en runtime y el build no rompa. Los usa el pipeline Meta Ads v2
    // (lib/marketing/ad-image-*.ts → satori + resvg + sharp).
    serverExternalPackages: ['@resvg/resvg-js', 'satori', 'sharp'],
    images: {
        // Next 16 NO trae AVIF por default (-20-30% de peso en el poster LCP).
        formats: ['image/avif', 'image/webp'],
        // Next 16 coacciona cualquier `quality` fuera de la lista al más cercano.
        // 60 → poster del hero (suficiente bajo el overlay + botón play); 75 → resto.
        qualities: [60, 75],
        remotePatterns: [
            { protocol: 'https', hostname: '**.zonaprop.com.ar' },
            { protocol: 'https', hostname: '**.naventcdn.com' },
            { protocol: 'https', hostname: '**.argenprop.com' },
            { protocol: 'https', hostname: '**.mlstatic.com' },
            { protocol: 'https', hostname: 'mncsnastmcjdjxrehdep.supabase.co' },
        ],
    },
};

export default nextConfig;
