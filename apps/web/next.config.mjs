/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wcs/core", "@wcs/db", "@wcs/workers"],
  webpack(config) {
    // Workspace packages use ESM-style ".js" specifiers for their ".ts" sources (e.g. "./audit/engine.js");
    // Next 14's webpack doesn't map those on its own.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
