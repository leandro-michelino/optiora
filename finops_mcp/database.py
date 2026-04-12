"""Database schema and migrations for OptiOra."""

import logging

logger = logging.getLogger(__name__)


SCHEMA_V1 = """
-- OptiOra Database Schema v1

-- Cost snapshots (for time-series data)
CREATE TABLE IF NOT EXISTS cost_snapshots (
    id SERIAL PRIMARY KEY,
    customer_id UUID NOT NULL,
    cloud_provider VARCHAR(20) NOT NULL,
    cost_usd DECIMAL(12, 2) NOT NULL,
    service_name VARCHAR(100),
    snapshot_date DATE NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, cloud_provider, service_name, snapshot_date)
);

-- Anomalies detected
CREATE TABLE IF NOT EXISTS cost_anomalies (
    id SERIAL PRIMARY KEY,
    customer_id UUID NOT NULL,
    cloud_provider VARCHAR(20) NOT NULL,
    service_name VARCHAR(100),
    baseline_usd DECIMAL(12, 2),
    actual_usd DECIMAL(12, 2),
    increase_percent DECIMAL(5, 2),
    probability_cause TEXT,
    confidence DECIMAL(3, 2),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cost recommendations
CREATE TABLE IF NOT EXISTS cost_recommendations (
    id SERIAL PRIMARY KEY,
    customer_id UUID NOT NULL,
    cloud_provider VARCHAR(20) NOT NULL,
    recommendation_type VARCHAR(50) NOT NULL,
    service_name VARCHAR(100),
    description TEXT,
    estimated_savings_annual_usd DECIMAL(12, 2),
    implementation_effort VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    implemented_at TIMESTAMP NULL
);

-- Executed actions (audit trail)
CREATE TABLE IF NOT EXISTS cost_actions (
    id SERIAL PRIMARY KEY,
    customer_id UUID NOT NULL,
    cloud_provider VARCHAR(20) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    resource_ids TEXT[],
    dry_run BOOLEAN DEFAULT TRUE,
    estimated_savings_usd DECIMAL(12, 2),
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    executed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer settings
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    status VARCHAR(20) DEFAULT 'active',
    subscription_tier VARCHAR(50),
    aws_account_id VARCHAR(20),
    azure_subscription_id VARCHAR(80),
    gcp_project_id VARCHAR(100),
    oci_tenancy_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys for integrations
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id),
    key_name VARCHAR(100),
    key_hash VARCHAR(255) UNIQUE,
    cloud_provider VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    customer_id UUID,
    action VARCHAR(100),
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cost_snapshots_customer ON cost_snapshots(customer_id);
CREATE INDEX IF NOT EXISTS idx_cost_snapshots_date ON cost_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_customer ON cost_anomalies(customer_id);
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_detected ON cost_anomalies(detected_at);
CREATE INDEX IF NOT EXISTS idx_cost_recommendations_customer ON cost_recommendations(customer_id);
CREATE INDEX IF NOT EXISTS idx_cost_actions_customer ON cost_actions(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_customer ON audit_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
"""


def init_database(connection):
    """Initialize database schema."""
    try:
        cursor = connection.cursor()
        cursor.execute(SCHEMA_V1)
        connection.commit()
        logger.info("Database schema initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Database initialization error: {str(e)}")
        connection.rollback()
        return False


def get_migrations():
    """Return list of migration descriptions."""
    return {
        "v1": {
            "name": "Initial schema",
            "description": "Create tables for costs, anomalies, recommendations, actions, customers, API keys, and audit logs",
            "sql": SCHEMA_V1,
        }
    }
