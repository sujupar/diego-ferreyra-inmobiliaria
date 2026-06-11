import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Módulos con binario nativo / WASM que Turbopack (bundler default de Next 16) no
    // puede empaquetar ("non-ecmascript placeable asset"). Los marcamos como externos
    // para que se require en runtime y el build no rompa. Los usa el pipeline Meta Ads v2
    // (lib/marketing/ad-image-*.ts → satori + resvg + sharp).
    serverExternalPackages: ['@resvg/resvg-js', 'satori', 'sharp'],
    images: {
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
