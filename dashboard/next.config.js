/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/dashboard/k8s-namespaces',
        destination: '/dashboard/kubernetes',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
