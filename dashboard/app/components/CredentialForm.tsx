'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, Info, Loader, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizedFetch } from '@/lib/auth-fetch';
import { backendUrl } from '@/lib/backend-url';

interface CredentialFormProps {
  onSubmit: (provider: string, credentials: Record<string, string>) => Promise<void>;
}

// Per-provider setup guidance shown inside each form section.
const PROVIDER_HELP = {
  aws: {
    summary: 'OptiOra needs read-only access to AWS Cost Explorer and EC2/EBS resource metadata.',
    steps: [
      'Open the AWS console → IAM → Users → Create user.',
      'Attach the managed policy ReadOnlyAccess, or create a custom policy with at minimum: ce:GetCostAndUsage, ec2:DescribeInstances, ec2:DescribeVolumes.',
      'Under Security credentials → Access keys → Create access key.',
      'Copy the Access Key ID and Secret Access Key — they are shown only once.',
    ],
    docLabel: 'IAM user guide',
    docHref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html',
  },
  azure: {
    summary: 'OptiOra uses a Service Principal with Cost Management Reader access to read billing and resource data.',
    steps: [
      'Open Azure Portal → Microsoft Entra ID → App registrations → New registration.',
      'Note the Application (client) ID and Directory (tenant) ID.',
      'Under Certificates & secrets → New client secret → copy the value immediately.',
      'Go to Subscriptions → your subscription → Access control (IAM) → Add role assignment.',
      'Assign the Cost Management Reader role to the App registration you created.',
    ],
    docLabel: 'Service Principal guide',
    docHref: 'https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/assign-access-acm-data',
  },
  gcp: {
    summary: 'OptiOra reads GCP billing data via BigQuery export. A Service Account with Billing Account Viewer and BigQuery User is required.',
    steps: [
      'Enable Billing Export to BigQuery in the GCP console → Billing → Billing export.',
      'Go to IAM & Admin → Service Accounts → Create Service Account.',
      'Grant the service account: Billing Account Viewer (on the billing account) and BigQuery Data Viewer + BigQuery Job User (on the project).',
      'Create a key: Service Account → Keys → Add key → JSON. Download the file.',
      'Paste the full contents of the JSON key file into the field below.',
    ],
    docLabel: 'BigQuery billing export guide',
    docHref: 'https://cloud.google.com/billing/docs/how-to/export-data-bigquery',
  },
  oci: {
    summary: 'OptiOra reads OCI cost and usage data via the Usage API using the local OCI CLI config file on the server.',
    steps: [
      'Install the OCI CLI on the server: bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"',
      'Run oci setup config and follow the prompts — this creates ~/.oci/config.',
      'The user/API key must have the policy: Allow group <YourGroup> to read usage-reports in tenancy.',
      'Enter the path to the config file (default: ~/.oci/config) and the profile name (default: DEFAULT).',
    ],
    docLabel: 'OCI Usage API guide',
    docHref: 'https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereportsoverview.htm',
  },
} as const;

type Provider = keyof typeof PROVIDER_HELP;

function ProviderHelp({ provider }: { provider: Provider }) {
  const help = PROVIDER_HELP[provider];
  return (
    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm">
      <div className="flex items-start gap-2 mb-2">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-blue-800 font-medium">{help.summary}</p>
      </div>
      <ol className="ml-6 mt-2 space-y-1 list-decimal text-blue-700">
        {help.steps.map((step, i) => (
          <li key={i} className="text-xs leading-relaxed">{step}</li>
        ))}
      </ol>
      <a
        href={help.docHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-3 text-xs text-blue-600 hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        {help.docLabel}
      </a>
    </div>
  );
}

const CredentialForm: React.FC<CredentialFormProps> = ({ onSubmit }) => {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'saved'>('idle');
  const [validationMessage, setValidationMessage] = useState('');

  const [awsForm, setAwsForm] = useState({
    access_key_id: '',
    secret_access_key: '',
    region: 'us-east-1'
  });

  const [azureForm, setAzureForm] = useState({
    subscription_id: '',
    tenant_id: '',
    client_id: '',
    client_secret: ''
  });

  const [gcpForm, setGcpForm] = useState({
    project_id: '',
    service_account_json: ''
  });

  const [ociForm, setOciForm] = useState({
    config_file: '',
    profile: 'DEFAULT'
  });

  const currentCredentials = () =>
    selectedProvider === 'aws' ? awsForm :
    selectedProvider === 'azure' ? azureForm :
    selectedProvider === 'gcp' ? gcpForm :
    ociForm;

  // Reset validation when provider or form changes.
  const resetValidation = () => {
    if (validationStatus !== 'idle') setValidationStatus('idle');
    setValidationMessage('');
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) {
      setValidationStatus('invalid');
      setValidationMessage('Select a provider and click Connect first.');
      return;
    }
    setValidating(true);
    setValidationStatus('validating');
    setValidationMessage('Connecting to provider API…');
    try {
      const res = await authorizedFetch(backendUrl('/api/v1/credentials/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, ...currentCredentials() }),
      });
      const data = await res.json();
      if (!res.ok || !data.is_valid) {
        setValidationStatus('invalid');
        setValidationMessage(data.detail || data.message || 'Credential validation failed.');
        return;
      }
      setValidationStatus('valid');
      setValidationMessage(
        data.test_cost_usd != null
          ? `Connection successful. MTD cost: $${data.test_cost_usd}. ${data.message || ''}`
          : data.message || 'Connection successful.',
      );
    } catch (err) {
      setValidationStatus('invalid');
      setValidationMessage(err instanceof Error ? err.message : 'Unexpected error during validation.');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider) {
      setValidationStatus('invalid');
      setValidationMessage('Select a provider and click Connect first.');
      return;
    }
    setSaving(true);
    try {
      const res = await authorizedFetch(backendUrl('/api/v1/credentials/add'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, ...currentCredentials() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || 'Failed to save credentials.');
      }
      setValidationStatus('saved');
      setValidationMessage(`${selectedProvider.toUpperCase()} credentials saved successfully.`);
      await onSubmit(selectedProvider, currentCredentials());
    } catch (err) {
      setValidationStatus('invalid');
      setValidationMessage(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Cloud Credentials
        </CardTitle>
        <CardDescription>
          Credentials are validated server-side; only non-sensitive metadata is persisted for dashboard workflows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleValidate} className="space-y-6">

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">Cloud Provider</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {(['aws', 'azure', 'gcp', 'oci'] as const).map(provider => (
                <div
                  key={provider}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedProvider === provider
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold uppercase text-sm">{provider}</div>
                    <button
                      type="button"
                      onClick={() => { setSelectedProvider(provider); resetValidation(); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        selectedProvider === provider
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {selectedProvider === provider ? 'Connected Form' : 'Connect'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Click Connect to enter {provider.toUpperCase()} credentials.
                  </p>
                </div>
              ))}
            </div>
          </div>

          {!selectedProvider && (
            <div className="p-3 rounded-lg flex items-start gap-2 text-sm bg-blue-50 text-blue-700">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Select a provider and click Connect to request credentials.</span>
            </div>
          )}

          {/* AWS Form */}
          {selectedProvider === 'aws' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <ProviderHelp provider="aws" />
              <div>
                <label className="block text-sm font-medium mb-1">Access Key ID</label>
                <input
                  type="password"
                  value={awsForm.access_key_id}
                  onChange={e => setAwsForm({...awsForm, access_key_id: e.target.value})}
                  placeholder="AKIA..."
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Secret Access Key</label>
                <input
                  type="password"
                  value={awsForm.secret_access_key}
                  onChange={e => setAwsForm({...awsForm, secret_access_key: e.target.value})}
                  placeholder="wJalr..."
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Region</label>
                <input
                  type="text"
                  value={awsForm.region}
                  onChange={e => setAwsForm({...awsForm, region: e.target.value})}
                  placeholder="us-east-1"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {/* Azure Form */}
          {selectedProvider === 'azure' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <ProviderHelp provider="azure" />
              <div>
                <label className="block text-sm font-medium mb-1">Subscription ID</label>
                <input
                  type="text"
                  value={azureForm.subscription_id}
                  onChange={e => setAzureForm({...azureForm, subscription_id: e.target.value})}
                  placeholder="UUID format"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tenant ID</label>
                <input
                  type="text"
                  value={azureForm.tenant_id}
                  onChange={e => setAzureForm({...azureForm, tenant_id: e.target.value})}
                  placeholder="UUID format"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client ID (App ID)</label>
                <input
                  type="text"
                  value={azureForm.client_id}
                  onChange={e => setAzureForm({...azureForm, client_id: e.target.value})}
                  placeholder="UUID format"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client Secret</label>
                <input
                  type="password"
                  value={azureForm.client_secret}
                  onChange={e => setAzureForm({...azureForm, client_secret: e.target.value})}
                  placeholder="Secret value"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {/* GCP Form */}
          {selectedProvider === 'gcp' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <ProviderHelp provider="gcp" />
              <div>
                <label className="block text-sm font-medium mb-1">Project ID</label>
                <input
                  type="text"
                  value={gcpForm.project_id}
                  onChange={e => setGcpForm({...gcpForm, project_id: e.target.value})}
                  placeholder="project-id"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Service Account JSON</label>
                <textarea
                  value={gcpForm.service_account_json}
                  onChange={e => setGcpForm({...gcpForm, service_account_json: e.target.value})}
                  placeholder='{"type": "service_account", ...}'
                  required
                  rows={6}
                  className="w-full px-3 py-2 border rounded-md font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* OCI Form */}
          {selectedProvider === 'oci' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <ProviderHelp provider="oci" />
              <div>
                <label className="block text-sm font-medium mb-1">Config File Path</label>
                <input
                  type="text"
                  value={ociForm.config_file}
                  onChange={e => setOciForm({...ociForm, config_file: e.target.value})}
                  placeholder="~/.oci/config"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Profile Name</label>
                <input
                  type="text"
                  value={ociForm.profile}
                  onChange={e => setOciForm({...ociForm, profile: e.target.value})}
                  placeholder="DEFAULT"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {/* Validation / Save status banner */}
          {validationStatus !== 'idle' && (
            <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${
              validationStatus === 'validating' ? 'bg-blue-50 text-blue-700' :
              validationStatus === 'valid'      ? 'bg-green-50 text-green-700' :
              validationStatus === 'saved'      ? 'bg-green-100 text-green-800' :
              'bg-red-50 text-red-700'
            }`}>
              {validationStatus === 'validating' && <Loader className="w-4 h-4 animate-spin mt-0.5 shrink-0" />}
              {(validationStatus === 'valid' || validationStatus === 'saved') && <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              {validationStatus === 'invalid'   && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{validationMessage}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {/* Test Connection — always available, submits the form */}
            <button
              type="submit"
              disabled={validating || saving}
              className="flex-1 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {validating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" /> Testing…
                </span>
              ) : 'Test Connection'}
            </button>

            {/* Save Credentials — enabled only after a successful test */}
            <button
              type="button"
              onClick={handleSave}
              disabled={validationStatus !== 'valid' || saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" /> Saving…
                </span>
              ) : 'Save Credentials'}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default CredentialForm;
