# OptiOra Dashboard

A modern, multi-cloud cost management dashboard built with Next.js, React, and Tailwind CSS. Unified visibility and control over AWS, Azure, GCP, and OCI cloud costs.

## Features

- 📊 **Real-time Cost Visualization** - Multi-cloud cost trends with Recharts
- 🚨 **Anomaly Detection** - AI-powered alerts for unusual spending patterns
- 💡 **Smart Recommendations** - ROI-ranked optimization suggestions
- 🌙 **Dark Mode** - Toggle between light and dark themes with next-themes
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile
- 🔄 **Multi-Cloud Support** - AWS, Azure, GCP, and OCI in one dashboard

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) with App Router
- **UI Library**: [React 18](https://react.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Charts**: [Recharts](https://recharts.org/)
- **Theme**: [next-themes](https://github.com/pacocoursey/next-themes)
- **Icons**: [lucide-react](https://lucide.dev/)
- **HTTP Client**: [axios](https://axios-http.com/)
- **Validation**: [zod](https://zod.dev/)
- **Language**: TypeScript

## Project Structure

```
dashboard/
├── app/                          # Next.js app directory
│   ├── layout.tsx               # Root layout with theme provider
│   ├── page.tsx                 # Landing page
│   ├── globals.css              # Global Tailwind styles
│   └── dashboard/               # Dashboard pages (requires auth)
│       ├── layout.tsx           # Dashboard layout with sidebar
│       ├── page.tsx             # Cost summary overview
│       ├── costs/               # Multi-cloud cost breakdown
│       ├── anomalies/           # Anomaly alerts
│       ├── recommendations/     # Optimization recommendations
│       └── settings/            # Integration settings
├── components/                  # Reusable React components
│   ├── CostChart.tsx           # Recharts area chart
│   ├── ServiceBreakdown.tsx     # Service pie chart
│   ├── MetricCard.tsx           # KPI metric card
│   └── ThemeToggle.tsx          # Dark mode toggle
├── lib/                         # Utilities and helpers
│   ├── api.ts                   # Axios API client
│   └── types.ts                 # TypeScript types
├── public/                      # Static assets
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
├── tailwind.config.js           # Tailwind theme config
├── postcss.config.js            # PostCSS config
└── next.config.js               # Next.js config
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn package manager

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000 in your browser
```

### Environment Variables

Create a `.env.local` file in the dashboard directory:

```env
# MCP Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## API Integration

The dashboard connects to the OptiOra Python MCP backend via the `/lib/api.ts` client.

### Available Endpoints

- **GET `/costs`** - Retrieve cost summary and breakdown
- **GET `/anomalies`** - Fetch cost anomalies 
- **GET `/recommendations`** - Get optimization recommendations
- **POST `/actions`** - Execute cost actions

### Mock Data Fallback

For development without the backend running, the dashboard includes mock data generators in `lib/api.ts`. When the API is unavailable, mock data is automatically returned.

## Building for Production

```bash
# Build optimized production bundle
npm run build

# Start production server
npm start
```

## Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

Set the `NEXT_PUBLIC_API_URL` environment variable in Vercel project settings to point to your backend.

## Development Workflow

### Adding a New Page

1. Create a new directory in `app/dashboard/`
2. Add `page.tsx` with your page content
3. The route is automatically created (Next.js App Router)

### Adding Components

1. Create new `.tsx` files in `components/`
2. Export as named components
3. Import in pages: `import { ComponentName } from '@/components/ComponentName'`

### Styling

Tailwind CSS classes are used throughout. Custom components are defined in `globals.css` with `@layer components`.

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit: `git add . && git commit -m "feat: your feature"`
3. Push to remote: `git push origin feature/your-feature`
4. Open a pull request

## License

MIT License - See LICENSE file for details

---

Built with ❤️ as part of the OptiOra FinOps platform
