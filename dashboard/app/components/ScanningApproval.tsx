'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ScanningApprovalProps {
  providers: string[];
  onApprove: (config: ScanningConfig) => Promise<void>;
}

interface ScanningConfig {
  scan_frequency: 'hourly' | 'daily' | 'weekly';
  auto_remediate: boolean;
  notification_email: string;
  monthly_budget_usd: number;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  notifications_enabled: boolean;
}

const ScanningApproval: React.FC<ScanningApprovalProps> = ({ providers, onApprove }) => {
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [config, setConfig] = useState<ScanningConfig>({
    scan_frequency: 'daily',
    auto_remediate: false,
    notification_email: '',
    monthly_budget_usd: 0,
    warning_threshold_percent: 80,
    critical_threshold_percent: 100,
    notifications_enabled: true,
  });

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onApprove(config);
      setApproved(true);
    } catch (error) {
      console.error('Approval failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (approved) {
    return (
      <Card className="border-l-4 border-l-green-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            Scanning Approved
          </CardTitle>
          <CardDescription>
            Cost analysis will begin immediately
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Providers:</strong> {providers.join(', ').toUpperCase()}</p>
            <p><strong>Frequency:</strong> {config.scan_frequency}</p>
            <p><strong>Auto-remediate:</strong> Temporarily disabled</p>
            <p><strong>Notifications:</strong> {config.notification_email}</p>
            <p><strong>Budget guardrail:</strong> {config.monthly_budget_usd > 0 ? `$${config.monthly_budget_usd.toLocaleString()}` : 'Not set'}</p>
          </div>
          <button className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2">
            <Play className="w-4 h-4" />
            Open Dashboard
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-yellow-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Review & Approve Scanning
        </CardTitle>
        <CardDescription>
          Before we begin analyzing your cloud costs, please review and approve the scanning configuration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleApprove} className="space-y-6">
          
          {/* Scanning Permissions */}
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="font-semibold text-sm mb-3">OptiOra will request the following permissions:</div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-lg">📊</span>
                <span><strong>List resources:</strong> Read access to all cloud resources and tags</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">💰</span>
                <span><strong>Cost data:</strong> Read access to billing and cost management APIs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">🔍</span>
                <span><strong>Usage analytics:</strong> Read-only access to usage and performance metrics</span>
              </li>
            </ul>
          </div>

          {/* Providers */}
          <div>
            <label className="block text-sm font-medium mb-2">Cloud Providers to Scan</label>
            <div className="flex flex-wrap gap-2">
              {providers.map(provider => (
                <span
                  key={provider}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                >
                  {provider.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Scan Frequency */}
          <div>
            <label className="block text-sm font-medium mb-2">Scan Frequency</label>
            <div className="grid grid-cols-3 gap-2">
              {['hourly', 'daily', 'weekly'].map(freq => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setConfig({...config, scan_frequency: freq as any})}
                  className={`p-2 rounded-lg border-2 transition-all capitalize ${
                    config.scan_frequency === freq
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Clock className="w-4 h-4 mx-auto mb-1" />
                  {freq}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Remediate */}
          <div>
            <label className="block text-sm font-medium mb-3">Automatic Optimization</label>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg opacity-80">
              <div className="flex-1">
                <p className="font-medium text-sm block">Automatic cost optimization is temporarily disabled</p>
                <p className="text-xs text-gray-600">
                  Scans and recommendations remain available; no automatic changes are executed.
                </p>
              </div>
            </div>
          </div>

          {/* Notification Email */}
          <div>
            <label className="block text-sm font-medium mb-1">Notification Email</label>
            <input
              type="email"
              value={config.notification_email}
              onChange={e => setConfig({...config, notification_email: e.target.value})}
              placeholder="your@company.com"
              required
              className="w-full px-3 py-2 border rounded-md"
            />
            <p className="text-xs text-gray-600 mt-1">We'll send weekly cost reports and alerts</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Monthly Budget USD</label>
              <input
                type="number"
                min="0"
                step="1"
                value={config.monthly_budget_usd}
                onChange={e => setConfig({...config, monthly_budget_usd: Number(e.target.value) || 0})}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Warning %</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={config.warning_threshold_percent}
                onChange={e => setConfig({...config, warning_threshold_percent: Number(e.target.value) || 80})}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Critical %</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={config.critical_threshold_percent}
                onChange={e => setConfig({...config, critical_threshold_percent: Number(e.target.value) || 100})}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="notifications_enabled"
              checked={config.notifications_enabled}
              onChange={e => setConfig({...config, notifications_enabled: e.target.checked})}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <label htmlFor="notifications_enabled" className="font-medium text-sm block">
                Enable budget and anomaly notifications
              </label>
              <p className="text-xs text-gray-600">
                Sends alerts when configured thresholds are crossed after a scan completes.
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 bg-orange-50 rounded-lg flex gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <p className="text-orange-700">
              By approving, you consent to OptiOra analyzing your cloud environment to identify cost optimization opportunities.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !config.notification_email}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Approving...' : 'Approve & Start Scanning'}
          </button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ScanningApproval;
