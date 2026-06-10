/** @type {import('next').NextConfig} */
const nextConfig = {
  // MediaPipeのWASMファイルをpublicから配信するため
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy",  value: "require-corp" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
