import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
