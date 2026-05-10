'use client';

import React, { useState } from 'react';
import { AlertCircle, Bell, CheckCircle, Clock, DollarSign, Play, Server, ShieldCheck } from 'lucide-react';
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

const scanFrequencies: ScanningConfig['scan_frequency'][] = ['hourly', 'daily', 'weekly'];

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
      <Card className="border-l-4 border-l-emerald-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="w-5 h-5" />
            Scanning Approved
          </CardTitle>
          <CardDescription>
            Cost analysis will begin immediately
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p><strong>Providers:</strong> {providers.join(', ').toUpperCase()}</p>
            <p><strong>Frequency:</strong> {config.scan_frequency}</p>
            <p><strong>Auto-remediate:</strong> Temporarily disabled</p>
            <p><strong>Notifications:</strong> {config.notification_email}</p>
            <p><strong>Budget guardrail:</strong> {config.monthly_budget_usd > 0 ? `$${config.monthly_budget_usd.toLocaleString()}` : 'Not set'}</p>
          </div>
          <a href="/dashboard" className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">
            <Play className="w-4 h-4" />
            Open Dashboard
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-amber-500">
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="mb-3 text-sm font-semibold text-amber-950 dark:text-amber-100">OptiOra will request the following read-only permissions:</div>
            <ul className="space-y-2 text-sm text-amber-900 dark:text-amber-200">
              <li className="flex items-start gap-2">
                <Server className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <span><strong>List resources:</strong> read access to cloud resources and tags</span>
              </li>
              <li className="flex items-start gap-2">
                <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <span><strong>Cost data:</strong> read access to billing and cost management APIs</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                <span><strong>Usage analytics:</strong> read-only access to usage and performance metrics</span>
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
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
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
              {scanFrequencies.map(freq => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setConfig({...config, scan_frequency: freq})}
                  className={`p-2 rounded-lg border-2 transition-all capitalize ${
                    config.scan_frequency === freq
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
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
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 opacity-90 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex-1">
                <p className="font-medium text-sm block">Automatic cost optimization is temporarily disabled</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
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
              className="form-field"
            />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Weekly cost reports and alerts will be sent here.</p>
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
                className="form-field"
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
                className="form-field"
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
                className="form-field"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <input
              type="checkbox"
              id="notifications_enabled"
              checked={config.notifications_enabled}
              onChange={e => setConfig({...config, notifications_enabled: e.target.checked})}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <label htmlFor="notifications_enabled" className="flex items-center gap-2 font-medium text-sm">
                <Bell className="h-4 w-4 text-slate-500" />
                Enable budget and anomaly notifications
              </label>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Sends alerts when configured thresholds are crossed after a scan completes.
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="flex gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950/30">
            <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <p className="text-orange-700 dark:text-orange-200">
              By approving, you consent to OptiOra analyzing your cloud environment to identify cost optimization opportunities.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !config.notification_email}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {loading ? 'Approving...' : 'Approve & Start Scanning'}
          </button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ScanningApproval;
