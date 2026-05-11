'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, Info, Loader, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizedFetch } from '@/lib/auth-fetch';
import { backendUrl } from '@/lib/backend-url';

interface CredentialFormProps {
  onSubmit: (provider: string, credentials: Record<string, string>, result: CredentialAddResponse) => Promise<void>;
}

interface CredentialAddResponse {
  message?: string
  scan?: {
    scan_id?: string
    state?: string
    providers?: string[]
  }
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
    summary: 'For the deployed OCI VM, OptiOra normally needs only the server config path and profile. Upload files only when the server config is missing or you want to replace it.',
    steps: [
      'Use the deployed VM path /opt/optiora/.oci/config unless you intentionally uploaded a different config.',
      'Use profile DEFAULT unless the config file has another profile such as [JNB].',
      'The OCI user/API key needs read access to usage reports and inventory APIs for the target compartment/tenancy.',
    ],
    docLabel: 'OCI Usage API guide',
    docHref: 'https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/usagereportsoverview.htm',
  },
} as const;

type Provider = keyof typeof PROVIDER_HELP;

function ProviderHelp({ provider }: { provider: Provider }) {
  const help = PROVIDER_HELP[provider];
  return (
    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/30">
      <div className="flex items-start gap-2 mb-2">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0 dark:text-blue-300" />
        <p className="text-blue-800 font-medium dark:text-blue-200">{help.summary}</p>
      </div>
      <ol className="ml-6 mt-2 space-y-1 list-decimal text-blue-700 dark:text-blue-300">
        {help.steps.map((step, i) => (
          <li key={i} className="text-xs leading-relaxed">{step}</li>
        ))}
      </ol>
      <a
        href={help.docHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-blue-600 hover:underline dark:text-blue-300"
      >
        <ExternalLink className="w-3 h-3" />
        {help.docLabel}
      </a>
    </div>
  );
}

const CredentialForm: React.FC<CredentialFormProps> = ({ onSubmit }) => {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingOciFiles, setUploadingOciFiles] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'saved'>('idle');
  const [validationMessage, setValidationMessage] = useState('');

  const [awsForm, setAwsForm] = useState({
    access_key_id: '',
    secret_access_key: '',
    region: 'us-east-1',
    organization_role_arns: ''
  });

  const [azureForm, setAzureForm] = useState({
    subscription_id: '',
    subscription_ids: '',
    management_group_id: '',
    tenant_id: '',
    client_id: '',
    client_secret: ''
  });

  const [gcpForm, setGcpForm] = useState({
    project_id: '',
    project_ids: '',
    billing_export_project_ids: '',
    billing_export_dataset: 'billing',
    billing_export_table_prefix: 'gcp_billing_export_v1_',
    organization_id: '',
    folder_id: '',
    service_account_json: ''
  });

  const [ociForm, setOciForm] = useState({
    config_file: '/opt/optiora/.oci/config',
    profile: 'DEFAULT',
    region: '',
    compartment_ids: ''
  });
  const [ociConfigUpload, setOciConfigUpload] = useState<File | null>(null);
  const [ociKeyUpload, setOciKeyUpload] = useState<File | null>(null);

  const currentCredentials = (): Record<string, string> => {
    if (selectedProvider === 'aws') return awsForm;
    if (selectedProvider === 'azure') return azureForm;
    if (selectedProvider === 'gcp') return gcpForm;
    if (selectedProvider === 'oci') return ociForm;
    return {};
  };

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
        const detailSuffix = data.error_details ? ` (${data.error_details})` : '';
        setValidationStatus('invalid');
        setValidationMessage(data.detail || `${data.message || 'Credential validation failed.'}${detailSuffix}`);
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
      const data = await res.json() as CredentialAddResponse;
      const scanProviders = data.scan?.providers?.map((provider) => provider.toUpperCase()).join(', ');
      setValidationStatus('saved');
      setValidationMessage(
        data.scan?.scan_id
          ? `${selectedProvider.toUpperCase()} credentials saved. Live scan ${data.scan.scan_id} started${scanProviders ? ` for ${scanProviders}` : ''}.`
          : data.message || `${selectedProvider.toUpperCase()} credentials saved successfully.`,
      );
      await onSubmit(selectedProvider, currentCredentials(), data);
    } catch (err) {
      setValidationStatus('invalid');
      setValidationMessage(err instanceof Error ? err.message : 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadOciFiles = async () => {
    if (!selectedProvider || selectedProvider !== 'oci') {
      setValidationStatus('invalid');
      setValidationMessage('Select OCI first before uploading files.');
      return;
    }
    if (!ociConfigUpload) {
      setValidationStatus('invalid');
      setValidationMessage('Choose an OCI config file to upload.');
      return;
    }

    setUploadingOciFiles(true);
    try {
      const formData = new FormData();
      formData.append('profile', ociForm.profile || 'DEFAULT');
      formData.append('config_file', ociConfigUpload);
      if (ociKeyUpload) {
        formData.append('private_key_file', ociKeyUpload);
      }

      const res = await authorizedFetch(backendUrl('/api/v1/credentials/oci/upload-files'), {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to upload OCI files.');
      }

      const uploadedProfile = String(data?.profile || ociForm.profile || 'DEFAULT');
      const uploadedConfigPath = String(data?.config_file || ociForm.config_file || '~/.oci/config');
      setOciForm({
        ...ociForm,
        config_file: uploadedConfigPath,
        profile: uploadedProfile,
      });
      setValidationStatus('valid');
      setValidationMessage(
        `OCI files uploaded to server path ${uploadedConfigPath}. You can now click Test Connection.`
      );
    } catch (err) {
      setValidationStatus('invalid');
      setValidationMessage(err instanceof Error ? err.message : 'Unexpected error while uploading OCI files.');
    } finally {
      setUploadingOciFiles(false);
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
                <button
                  key={provider}
                  type="button"
                  onClick={() => { setSelectedProvider(provider); resetValidation(); }}
                  aria-pressed={selectedProvider === provider}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${
                    selectedProvider === provider
                      ? 'border-blue-500 bg-blue-50 shadow-sm dark:bg-blue-950/30'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold uppercase text-sm text-slate-900 dark:text-white">{provider}</div>
                    <span
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        selectedProvider === provider
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {selectedProvider === provider ? 'Selected' : 'Connect'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    {provider === 'oci'
                      ? 'Use the server OCI config path and profile. Upload files only as a fallback.'
                      : `Click Connect to enter ${provider.toUpperCase()} credentials.`}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {!selectedProvider && (
            <div className="p-3 rounded-lg flex items-start gap-2 text-sm bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Select a provider and click Connect to request credentials.</span>
            </div>
          )}

          {/* AWS Form */}
          {selectedProvider === 'aws' && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <ProviderHelp provider="aws" />
              <div>
                <label className="block text-sm font-medium mb-1">Access Key ID</label>
                <input
                  type="password"
                  value={awsForm.access_key_id}
                  onChange={e => setAwsForm({...awsForm, access_key_id: e.target.value})}
                  placeholder="AKIA..."
                  required
                  className="form-field"
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
                  className="form-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Region</label>
                <input
                  type="text"
                  value={awsForm.region}
                  onChange={e => setAwsForm({...awsForm, region: e.target.value})}
                  placeholder="us-east-1"
                  className="form-field"
                />
              </div>
              <details className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Advanced billing scopes
                </summary>
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">Organization Role ARNs</label>
                  <textarea
                    value={awsForm.organization_role_arns}
                    onChange={e => setAwsForm({...awsForm, organization_role_arns: e.target.value})}
                    placeholder="123456789012=arn:aws:iam::123456789012:role/OptiOraReadOnly, arn:aws:iam::210987654321:role/OptiOraReadOnly"
                    rows={3}
                    className="form-field font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Optional comma-separated account-to-role targets for AWS Organizations cost collection.
                  </p>
                </div>
              </details>
            </div>
          )}

          {/* Azure Form */}
          {selectedProvider === 'azure' && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <ProviderHelp provider="azure" />
              <div>
                <label className="block text-sm font-medium mb-1">Subscription ID</label>
                <input
                  type="text"
                  value={azureForm.subscription_id}
                  onChange={e => setAzureForm({...azureForm, subscription_id: e.target.value})}
                  placeholder="UUID format"
                  required
                  className="form-field"
                />
              </div>
              <details className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Advanced billing scopes
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Additional Subscription IDs</label>
                    <textarea
                      value={azureForm.subscription_ids}
                      onChange={e => setAzureForm({...azureForm, subscription_ids: e.target.value})}
                      placeholder="sub-id-1, sub-id-2"
                      rows={2}
                      className="form-field font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Management Group ID</label>
                    <input
                      type="text"
                      value={azureForm.management_group_id}
                      onChange={e => setAzureForm({...azureForm, management_group_id: e.target.value})}
                      placeholder="mg-root"
                      className="form-field"
                    />
                  </div>
                </div>
              </details>
              <div>
                <label className="block text-sm font-medium mb-1">Tenant ID</label>
                <input
                  type="text"
                  value={azureForm.tenant_id}
                  onChange={e => setAzureForm({...azureForm, tenant_id: e.target.value})}
                  placeholder="UUID format"
                  required
                  className="form-field"
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
                  className="form-field"
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
                  className="form-field"
                />
              </div>
            </div>
          )}

          {/* GCP Form */}
          {selectedProvider === 'gcp' && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <ProviderHelp provider="gcp" />
              <div>
                <label className="block text-sm font-medium mb-1">Project ID</label>
                <input
                  type="text"
                  value={gcpForm.project_id}
                  onChange={e => setGcpForm({...gcpForm, project_id: e.target.value})}
                  placeholder="project-id"
                  required
                  className="form-field"
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
                  className="form-field min-h-40 font-mono text-xs"
                />
              </div>
              <details className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Advanced billing export scopes
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Additional Project IDs</label>
                    <textarea
                      value={gcpForm.project_ids}
                      onChange={e => setGcpForm({...gcpForm, project_ids: e.target.value})}
                      placeholder="project-a, project-b"
                      rows={2}
                      className="form-field font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Billing Export Project IDs</label>
                    <textarea
                      value={gcpForm.billing_export_project_ids}
                      onChange={e => setGcpForm({...gcpForm, billing_export_project_ids: e.target.value})}
                      placeholder="billing-export-project"
                      rows={2}
                      className="form-field font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Billing Export Dataset</label>
                    <input
                      type="text"
                      value={gcpForm.billing_export_dataset}
                      onChange={e => setGcpForm({...gcpForm, billing_export_dataset: e.target.value})}
                      placeholder="billing"
                      className="form-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Billing Export Table Prefix</label>
                    <input
                      type="text"
                      value={gcpForm.billing_export_table_prefix}
                      onChange={e => setGcpForm({...gcpForm, billing_export_table_prefix: e.target.value})}
                      placeholder="gcp_billing_export_v1_"
                      className="form-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Organization ID</label>
                    <input
                      type="text"
                      value={gcpForm.organization_id}
                      onChange={e => setGcpForm({...gcpForm, organization_id: e.target.value})}
                      placeholder="123456789012"
                      className="form-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Folder ID</label>
                    <input
                      type="text"
                      value={gcpForm.folder_id}
                      onChange={e => setGcpForm({...gcpForm, folder_id: e.target.value})}
                      placeholder="folders/123456789012 or 123456789012"
                      className="form-field"
                    />
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* OCI Form */}
          {selectedProvider === 'oci' && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <ProviderHelp provider="oci" />
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <div className="font-semibold">Recommended for this VM</div>
                <div className="mt-1 text-xs">
                  Keep the deployed server config path and profile, then test the connection. No tenancy, user OCID, fingerprint, local upload, or private key paste is needed here.
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Config File Path</label>
                <input
                  type="text"
                  value={ociForm.config_file}
                  onChange={e => setOciForm({...ociForm, config_file: e.target.value})}
                  placeholder="/opt/optiora/.oci/config"
                  required
                  className="form-field"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  This path is resolved on the API server host, not in your browser.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Profile Name</label>
                <input
                  type="text"
                  value={ociForm.profile}
                  onChange={e => setOciForm({...ociForm, profile: e.target.value})}
                  placeholder="DEFAULT"
                  className="form-field"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Enter the profile name without brackets: use <code>DEFAULT</code> or <code>JNB</code>, not <code>[JNB]</code>.
                </p>
              </div>
              <details className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Advanced OCI billing scope
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Usage API Region</label>
                    <input
                      type="text"
                      value={ociForm.region}
                      onChange={e => setOciForm({...ociForm, region: e.target.value})}
                      placeholder="uk-london-1"
                      className="form-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Compartment OCIDs</label>
                    <textarea
                      value={ociForm.compartment_ids}
                      onChange={e => setOciForm({...ociForm, compartment_ids: e.target.value})}
                      placeholder="ocid1.compartment.oc1..aaaa..., ocid1.compartment.oc1..bbbb..."
                      rows={3}
                      className="form-field font-mono text-xs"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Optional scan seeds for OCI inventory. Usage billing is still requested at tenancy scope through the OCI Usage API.
                    </p>
                  </div>
                </div>
              </details>
              <details className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Advanced: upload a different OCI config
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Use this only when the API server does not already have the OCI config/private key you want OptiOra to use.
                  </p>
                  <div>
                    <label className="block text-sm font-medium mb-1">Upload OCI Config File</label>
                    <input
                      type="file"
                      accept=".ini,.cfg,.config,text/plain"
                      onChange={e => setOciConfigUpload(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Upload OCI Private Key</label>
                    <input
                      type="file"
                      accept=".pem,.key,text/plain"
                      onChange={e => setOciKeyUpload(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUploadOciFiles}
                    disabled={uploadingOciFiles || !ociConfigUpload}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {uploadingOciFiles ? 'Uploading...' : 'Upload OCI Files To Server'}
                  </button>
                </div>
              </details>
            </div>
          )}

          {/* Validation / Save status banner */}
          {validationStatus !== 'idle' && (
            <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${
              validationStatus === 'validating' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' :
              validationStatus === 'valid'      ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300' :
              validationStatus === 'saved'      ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200' :
              'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
            }`}>
              {validationStatus === 'validating' && <Loader className="w-4 h-4 animate-spin mt-0.5 shrink-0" />}
              {(validationStatus === 'valid' || validationStatus === 'saved') && <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              {validationStatus === 'invalid'   && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{validationMessage}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Test Connection — always available, submits the form */}
            <button
              type="submit"
              disabled={validating || saving}
              className="rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/30"
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
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
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
