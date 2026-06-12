/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    '/api/ocr-passport': [
      './node_modules/tesseract.js/src/**/*',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/@tesseract.js-data/eng/**/*',
    ],
  },
};
export default nextConfig; // [5]
