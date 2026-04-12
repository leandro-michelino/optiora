'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CredentialFormProps {
  onSubmit: (provider: string, credentials: Record<string, string>) => Promise<void>;
}

const CredentialForm: React.FC<CredentialFormProps> = ({ onSubmit }) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('aws');
  const [loading, setLoading] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
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

  const handleValidateAndStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setValidationStatus('validating');
    setValidationMessage('Testing credentials...');

    try {
      const credentials = 
        selectedProvider === 'aws' ? awsForm :
        selectedProvider === 'azure' ? azureForm :
        selectedProvider === 'gcp' ? gcpForm :
        ociForm;

      // Step 1: Validate credentials
      const validateRes = await fetch('/api/v1/credentials/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          ...credentials
        })
      });

      const validateData = await validateRes.json();

      if (!validateRes.ok || !validateData.is_valid) {
        setValidationStatus('invalid');
        setValidationMessage(validateData.message || 'Credential validation failed');
        return;
      }

      setValidationStatus('valid');
      setValidationMessage('✓ Credentials validated! Cost data this month: $' + (validateData.test_cost_usd || '0.00'));

      // Step 2: Store credentials
      await new Promise(resolve => setTimeout(resolve, 1500)); // Brief delay for UX
      
      const storeRes = await fetch('/api/v1/credentials/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: 'demo', // In production, use real customer ID
          provider: selectedProvider,
          ...credentials
        })
      });

      if (!storeRes.ok) {
        throw new Error('Failed to store credentials');
      }

      // Success - trigger next step
      await onSubmit(selectedProvider, credentials);

    } catch (error) {
      setValidationStatus('invalid');
      setValidationMessage(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
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
          Your credentials are encrypted and stored securely. We never store plaintext secrets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleValidateAndStore} className="space-y-6">
          
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">Cloud Provider</label>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {['aws', 'azure', 'gcp', 'oci'].map(provider => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setSelectedProvider(provider)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedProvider === provider
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold uppercase text-sm">{provider}</div>
                </button>
              ))}
            </div>
          </div>

          {/* AWS Form */}
          {selectedProvider === 'aws' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
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

          {/* Validation Status */}
          {validationStatus !== 'idle' && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              validationStatus === 'validating' ? 'bg-blue-50 text-blue-700' :
              validationStatus === 'valid' ? 'bg-green-50 text-green-700' :
              'bg-red-50 text-red-700'
            }`}>
              {validationStatus === 'validating' && <Loader className="w-4 h-4 animate-spin" />}
              {validationStatus === 'valid' && <CheckCircle className="w-4 h-4" />}
              {validationStatus === 'invalid' && <AlertCircle className="w-4 h-4" />}
              <span>{validationMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Validating...' : 'Validate & Store Credentials'}
          </button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CredentialForm;
