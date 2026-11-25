/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'replicate.delivery' },
      { protocol: 'https', hostname: '*.replicate.delivery' },
    ],
  },
  // fluent-ffmpeg / ffmpeg-static must stay external: they resolve a real binary
  // on disk at runtime and must not be traced/bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static', 'ffprobe-static', 'cloudinary', '@prisma/client'],
  },
  webpack: (config, { isServer }) => {
    // Konva ships a Node build that `require`s the optional native `canvas`
    // package. We only ever render Konva in the browser, so stub it out —
    // without this the build fails with "Can't resolve 'canvas'".
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };

    if (!isServer) {
      // Never let server-only modules leak into a client bundle.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        child_process: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
