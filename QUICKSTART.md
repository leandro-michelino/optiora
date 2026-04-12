# OptiOra — Quick Start Guide

**OptiOra** is a multi-cloud cost optimization MCP deployed on OCI.

## Prerequisites

- Python 3.10+
- Poetry (package manager)
- AWS, Azure, GCP, or OCI account (with cost data)
- (Optional) Docker
- (Optional) OCI account for deployment

---

## Local Development (5 minutes)

### 1. Clone & Install
```bash
cd ~/Desktop/Oracle/Github/newproject
poetry install
```

### 2. Configure Credentials

Copy `.env.example` → `.env` and fill in your cloud credentials:

```bash
cp .env.example .env
# Edit .env with your AWS/Azure/GCP/OCI keys
```

**For AWS (easiest start):**
```bash
export AWS_ACCESS_KEY_ID="your_key"
export AWS_SECRET_ACCESS_KEY="your_secret"
export AWS_REGION="us-east-1"
```

**For OCI (if deploying on OCI):**
```bash
# Copy OCI config
mkdir -p ~/.oci
cp /path/to/oci/config ~/.oci/config
cp /path/to/oci/oci_api_key.pem ~/.oci/oci_api_key.pem

# Set environment variables
export OCI_CONFIG_FILE=~/.oci/config
export OCI_TENANCY_OCID="ocid1.tenancy.oc1..."
```

### 3. Run Server

```bash
poetry run optiora
```

You should see:
```
INFO:root:Starting OptiOra MCP server (deployed on OCI)...
INFO:root:OptiOra MCP server running on port 8000
INFO:root:Supported cloud providers: AWS, Azure, GCP, OCI
```

---

## Docker Deployment (Development)

```bash
# Build image
docker build -t optiora:latest .

# Run container
docker-compose up
```

Server runs at `http://localhost:8000`

---

## Testing Tools via MCP

### Using Claude or ChatGPT with MCP:

1. **Register MCP server** in your LLM client config
2. **Call tools** via natural language:

```
"Show me a cost summary for the last 30 days"
→ Tool: get_cost_summary { period: "month", cloud_provider: "aws" }

"Find any unusual spending patterns"
→ Tool: detect_cost_anomalies { cloud_provider: "aws", sensitivity: 5 }

"What can I do to cut cloud costs?"
→ Tool: get_optimization_recommendations { cloud_provider: "aws" }
```

---

## Project Structure

```
optiora/
├── finops_mcp/
│   ├── server.py              # Main MCP server
│   ├── config.py              # Configuration
│   ├── models.py              # Data models
│   └── tools/
│       ├── aws_costs.py       # AWS Cost Explorer
│       ├── azure_costs.py     # Azure integration (v0.2)
│       ├── gcp_costs.py       # GCP integration (v0.2)
│       ├── oci_costs.py       # OCI Usage API ⭐ NEW
│       ├── anomalies.py       # Anomaly detection
│       ├── recommendations.py # Cost optimization
│       └── actions.py         # Automated actions
├── tests/
│   └── test_tools.py          # Unit tests
├── pyproject.toml             # Dependencies (includes OCI SDK)
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
├── OCI_DEPLOYMENT.md          # ⭐ OCI deployment guide
├── PROJECT_NAMING.md          # ⭐ Naming & branding
├── MONETIZATION.md            # Business model
├── ROADMAP.md                 # Development phases
└── .gitignore
```

---

## Next Steps

### Phase 1 (This week):
- [ ] Customize cloud credentials (.env)
- [ ] Test `get_cost_summary` tool
- [ ] Verify cost data is loading
- [ ] Confirm anomaly detection works

### Phase 2 (Next week):
- [ ] Deploy to OCI Compute (see OCI_DEPLOYMENT.md)
- [ ] Setup customer authentication (Stripe)
- [ ] Create landing page
- [ ] Cold email 50 prospects

### Phase 3 (Weeks 3–4):
- [ ] Azure integration (v0.2)
- [ ] Apply to AWS Activate
- [ ] Apply to OCI Startup program
- [ ] List on AWS Marketplace (beta)

---

## Troubleshooting

### AWS credentials not working?
```bash
# Test AWS CLI credentials first
aws sts get-caller-identity

# Then restart the server
poetry run optiora
```

### OCI credentials not working?
```bash
# Test OCI CLI
oci os ns get

# Add to .env
export OCI_CONFIG_FILE=~/.oci/config
```

### Port 8000 already in use?
```bash
# Change port in .env
MCP_PORT=8001
```

### Import errors?
```bash
# Reinstall dependencies
poetry install --no-cache
```

---

## Key Metrics to Track

**After launch:**
- **Anomalies detected:** Are recommendations accurate?
- **Customer cost savings:** What's the average customer saving?
- **False positive rate:** <5% (critical for trust)
- **MRR growth:** Target $10K by month 2, $50K by month 6

---

## Support & Contributing

- **Bug reports:** GitHub Issues
- **Suggestions:** GitHub Discussions
- **Email:** your.email@example.com
- **Community:** [Slack/Discord link TBD]

---

## License

MIT — See LICENSE for details

---

## Recommended Reading

- [README.md](README.md) — Feature overview
- [OCI_DEPLOYMENT.md](OCI_DEPLOYMENT.md) — Deploy to production (OCI)
- [MONETIZATION.md](MONETIZATION.md) — Pricing & revenue model
- [PROJECT_NAMING.md](PROJECT_NAMING.md) — Brand identity (OptiOra)
- [ROADMAP.md](ROADMAP.md) — 12-month development plan
- [GTM_STRATEGY.md](GTM_STRATEGY.md) — Launch playbook

---

**Ready to build? Start with `poetry run optiora` 🚀**

Multi-cloud costs are broken. OptiOra fixes them.
