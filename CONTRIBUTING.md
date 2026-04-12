# Contributing to OptiOra

Thank you for contributing to OptiOra! This guide explains how to set up your development environment, make changes, and submit contributions.

## 🚀 Quick Start for Contributors

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/optiora.git
cd optiora
```

### 2. Set Up Local Development

#### Backend (Python)

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Test it works
pytest tests/ -v
```

#### Frontend (React/Next.js)

```bash
cd dashboard

# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000
```

### 3. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

## 📋 Development Workflow

### Backend Development

#### Code Structure

```
finops_mcp/
├── server.py          # MCP server definition
├── config.py          # Configuration management
├── database.py        # Database schema & ORM
├── models.py          # Data classes & enums
└── tools/
    ├── aws_costs.py    # AWS cost analysis
    ├── azure_costs.py  # Azure cost analysis
    ├── gcp_costs.py    # GCP cost analysis
    ├── oci_costs.py    # OCI cost analysis
    ├── anomalies.py    # Anomaly detection
    ├── recommendations.py  # Recommendation engine
    └── actions.py      # Cost action execution
```

#### Adding a New Cloud Provider

1. Create `finops_mcp/tools/your_cloud_costs.py`
2. Implement `get_cost_summary()` and `forecast_costs()`
3. Add to `finops_mcp/server.py` tool definitions
4. Create tests in `tests/test_your_cloud.py`
5. Document in `docs/cloud_integrations/`

Example:

```python
# finops_mcp/tools/your_cloud_costs.py
def get_cost_summary(period: str, filters: dict = None) -> dict:
    """Fetch costs from YOUR_CLOUD API."""
    try:
        # Connect to YOUR_CLOUD API
        # Fetch costs
        # Normalize to OptiOra format
        return {
            "period": period,
            "total_cost_usd": 1234.56,
            "top_services": [...],
        }
    except Exception as e:
        logger.error(f"Error fetching YOUR_CLOUD costs: {e}")
        return generate_mock_costs()  # Fallback
```

#### Code Style

```bash
# Format code with Black
black finops_mcp/ tests/

# Lint with Ruff
ruff check finops_mcp/ tests/

# Type check with mypy
mypy finops_mcp/
```

#### Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ -v --cov=finops_mcp

# Run specific test
pytest tests/test_your_file.py::test_your_function -v
```

### Frontend Development

#### Component Development

```
dashboard/components/
├── CostChart.tsx      # Reusable chart component
├── MetricCard.tsx     # KPI metric display
├── ServiceBreakdown.tsx  # Service list
└── ThemeToggle.tsx    # Dark mode toggle
```

#### Adding a New Page

1. Create `dashboard/app/dashboard/your-page/page.tsx`
2. Route is automatically available at `/dashboard/your-page`
3. Add navigation link in `dashboard/app/dashboard/layout.tsx`
4. Import and use components

Example:

```typescript
// dashboard/app/dashboard/my-feature/page.tsx
'use client'

import { MetricCard } from '@/components/MetricCard'
import { DollarSign } from 'lucide-react'

export default function MyFeaturePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">My Feature</h1>
      
      <MetricCard
        icon={DollarSign}
        label="Total"
        value="$1,234.56"
        color="bg-gradient-to-br from-blue-500 to-blue-600"
      />
    </div>
  )
}
```

#### Code Style

```bash
# Format with Prettier
npm run format

# Lint with ESLint
npm run lint

# Type check
npm run type-check
```

#### Testing Components

```bash
# Frontend testing (add if needed)
npm install --save-dev jest @testing-library/react

# Run tests
npm test
```

## 🔄 Submission Process

### 1. Commit Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add support for YOUR_CLOUD provider

- Implement get_cost_summary() for YOUR_CLOUD
- Add cost normalization layer
- Create 5 new tests
- Update documentation

Closes #123"
```

#### Commit Message Format

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **test**: Test additions/updates
- **refactor**: Code restructuring
- **chore**: Build, dependencies, etc.

### 2. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 3. Create Pull Request

1. Go to https://github.com/leandro-michelino/optiora
2. Click "New Pull Request"
3. Select your branch
4. Add title and description
5. Link related issues
6. Submit!

### Pull Request Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass: `pytest tests/ -v`
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] No breaking changes (or clearly documented)

## 📝 Documentation

### Update Relevant Files

- **Feature in backend**: Update `ARCHITECTURE_COMPLETE.md`
- **Feature in frontend**: Update `dashboard/README.md`
- **Deployment change**: Update `OCI_DEPLOYMENT.md`
- **New API endpoint**: Update `QUICKSTART.md`

### Documentation Style

```markdown
## Feature Name

Brief description (1-2 sentences).

### How It Works

Explain the feature:
- Point 1
- Point 2

### Usage

```python
# Code example
result = feature.do_something()
print(result)
```

### Configuration

List any env vars or settings needed.
```

## 🐛 Bug Reports

Found a bug? Create an issue:

1. Go to Issues tab
2. Click "New Issue"
3. Describe steps to reproduce
4. Include error messages
5. Suggest a fix if you have one

**Bug Report Template:**

```markdown
## Description
Brief description of the bug.

## Steps to Reproduce
1. Run `command`
2. Do `action`
3. Observe `issue`

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- OS: macOS/Linux/Windows
- Python: 3.x
- Node: 18+
```

## 💡 Feature Requests

Have an idea? Suggest it:

1. Go to Issues tab
2. Click "New Issue"
3. Use "Feature Request" template
4. Describe use case and benefits
5. Discuss in comments

## 🏆 Code Review Guidelines

When submitting code:

✅ **DO:**
- Keep commits focused and atomic
- Write clear commit messages
- Add tests for new features
- Update documentation
- Follow existing code patterns

❌ **DON'T:**
- Submit large PRs with many changes
- Skip tests
- Use unclear variable names
- Commit commented code
- Break existing functionality

## 🚢 Release Process

OptiOra follows semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features
- **PATCH**: Bug fixes

Tags are created by maintainers.

## 📚 Resources

- **Architecture**: See `ARCHITECTURE_COMPLETE.md`
- **Testing**: See `TESTING.md`
- **API**: See `README.md`
- **Deployment**: See `OCI_DEPLOYMENT.md`
- **Quick Start**: See `QUICKSTART.md`

## ❓ Questions?

- Check existing documentation
- Search closed issues
- Open a discussion
- Contact maintainers

---

**Thank you for contributing to OptiOra! 🙏**

Together, we're making cloud cost optimization accessible to everyone.
